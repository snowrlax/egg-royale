import RAPIER from "@dimforge/rapier3d-compat";
import { FLOP, type GameSnapshot, type PlayerInput, type RoomDelta } from "@fish-jam/shared";
import {
  createServerEntity,
  applyInput,
  exportState,
  checkEliminated,
  disposeEntity,
  type ServerEntity,
  type Vec3,
} from "./server-entity.js";

const TICK_DT = 1 / 30;

export type GameLoopCallbacks = {
  onPlayerEliminated?: (playerId: string) => void;
  onRoundWinner?: (winnerId: string) => void;
};

export type GameLoop = {
  addPlayer(playerId: string, spawnPos: Vec3, color: string): void;
  removePlayer(playerId: string): void;
  enqueueInput(playerId: string, input: PlayerInput): void;
  step(): RoomDelta | null;
  exportSnapshot(): GameSnapshot;
  dispose(): void;
};

export function createGameLoop(callbacks: GameLoopCallbacks = {}): GameLoop {
  const world = new RAPIER.World({ x: 0, y: FLOP.GRAVITY, z: 0 });
  world.timestep = TICK_DT;

  // Thick slab: half-height 5 -> 10 units of solid geometry, top at y=0.
  // Prevents high-impulse entities from tunnelling through a thin plane.
  const groundDesc = RAPIER.ColliderDesc.cuboid(100, 5, 100)
    .setTranslation(0, -5, 0)
    .setFriction(FLOP.GROUND_FRICTION)
    .setRestitution(FLOP.GROUND_RESTITUTION)
    .setCollisionGroups(0x00010002);
  world.createCollider(groundDesc);

  // Server-side box walls - approximate kitchen outer boundary at KITCHEN_SCALE=0.45.
  // Client has exact trimesh; these just prevent entities escaping at the server level.
  // Layout: kitchen spans roughly +/-19 in X, +/-17 in Z, up to ~20 in Y.
  const WALL_GROUP = 0x00010002;
  const wallHeight = 12; // half-height - covers full kitchen height
  const wallThick = 1; // half-thickness

  const walls = [
    { hx: wallThick, hy: wallHeight, hz: 20, tx: -22, ty: wallHeight, tz: 0 }, // left
    { hx: wallThick, hy: wallHeight, hz: 20, tx: 22, ty: wallHeight, tz: 0 }, // right
    { hx: 24, hy: wallHeight, hz: wallThick, tx: 0, ty: wallHeight, tz: -20 }, // front
    { hx: 24, hy: wallHeight, hz: wallThick, tx: 0, ty: wallHeight, tz: 20 }, // back
  ];

  for (const w of walls) {
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(w.hx, w.hy, w.hz)
        .setTranslation(w.tx, w.ty, w.tz)
        .setCollisionGroups(WALL_GROUP)
    );
  }

  const entities = new Map<string, ServerEntity>();
  const inputQueue = new Map<string, PlayerInput[]>();
  let tick = 0;

  return {
    addPlayer(playerId, spawnPos, color) {
      if (entities.has(playerId)) return; // Already exists

      const entity = createServerEntity(playerId, world, spawnPos, color);
      entities.set(playerId, entity);
      inputQueue.set(playerId, []);
    },

    removePlayer(playerId) {
      const entity = entities.get(playerId);
      if (!entity) return;

      disposeEntity(entity, world);
      entities.delete(playerId);
      inputQueue.delete(playerId);
    },

    enqueueInput(playerId, input) {
      let queue = inputQueue.get(playerId);
      if (!queue) {
        queue = [];
        inputQueue.set(playerId, queue);
      }
      // Keep queue bounded - only latest matters for this tick
      if (queue.length > 3) queue.shift();
      queue.push(input);
    },

    step(): RoomDelta | null {
      tick++;

      // Apply inputs to entities
      for (const [playerId, queue] of inputQueue) {
        const entity = entities.get(playerId);
        if (!entity || entity.eliminated) {
          queue.length = 0;
          continue;
        }

        // Apply most recent input (or merge if needed)
        const input = queue.pop();
        queue.length = 0; // Drain remaining

        if (input) {
          applyInput(entity, input, TICK_DT);
        }
      }

      // Step physics
      world.step();

      // Check eliminations
      const eliminated: string[] = [];
      for (const entity of entities.values()) {
        if (checkEliminated(entity)) {
          eliminated.push(entity.playerId);
        }
      }

      // Notify eliminations
      for (const playerId of eliminated) {
        callbacks.onPlayerEliminated?.(playerId);
      }

      // Check for winner (last non-eliminated player)
      const activePlayers = [...entities.values()].filter((e) => !e.eliminated);
      if (entities.size >= 2 && activePlayers.length === 1) {
        callbacks.onRoundWinner?.(activePlayers[0].playerId);
      }

      // Build delta with updated fish states
      const updatedFish = [...entities.values()]
        .filter((e) => !e.eliminated)
        .map(exportState);

      if (updatedFish.length === 0 && eliminated.length === 0) {
        return null;
      }

      return {
        tick,
        updatedFish,
        removedFishIds: eliminated,
      };
    },

    exportSnapshot(): GameSnapshot {
      return {
        tick,
        fish: [...entities.values()]
          .filter((e) => !e.eliminated)
          .map(exportState),
      };
    },

    dispose() {
      for (const entity of entities.values()) {
        disposeEntity(entity, world);
      }
      entities.clear();
      inputQueue.clear();
      world.free();
    },
  };
}
