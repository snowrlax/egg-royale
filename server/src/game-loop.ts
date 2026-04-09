import RAPIER from "@dimforge/rapier3d-compat";
import { FLOP, type GameSnapshot, type PlayerInput, type RoomDelta } from "@fish-jam/shared";
import { createServerFish, type ServerFish } from "./server-fish.js";

const TICK_DT = 1 / 30;

// Spawn positions spread across the ground
const SPAWN_POSITIONS = [
  { x: 0, y: 2, z: 0 },
  { x: 2, y: 2, z: 0 },
  { x: -2, y: 2, z: 0 },
  { x: 0, y: 2, z: 2 },
  { x: 0, y: 2, z: -2 },
  { x: 2, y: 2, z: 2 },
];

export type GameLoop = {
  addFish(playerId: string): void;
  removeFish(playerId: string): void;
  enqueueInput(playerId: string, input: PlayerInput): void;
  step(): RoomDelta | null;
  exportSnapshot(): GameSnapshot;
  dispose(): void;
};

export function createGameLoop(): GameLoop {
  const world = new RAPIER.World({ x: 0, y: FLOP.GRAVITY, z: 0 });

  // Ground collider
  const groundDesc = RAPIER.ColliderDesc.cuboid(10, 0.15, 10)
    .setFriction(FLOP.GROUND_FRICTION)
    .setRestitution(FLOP.GROUND_RESTITUTION);
  world.createCollider(groundDesc);

  const fishMap = new Map<string, ServerFish>();
  const inputQueue = new Map<string, PlayerInput[]>();
  let tick = 0;
  let spawnIndex = 0;

  return {
    addFish(playerId) {
      if (fishMap.has(playerId)) return;
      const pos = SPAWN_POSITIONS[spawnIndex % SPAWN_POSITIONS.length];
      spawnIndex++;
      const fish = createServerFish(playerId, world, pos);
      fishMap.set(playerId, fish);
      inputQueue.set(playerId, []);
    },

    removeFish(playerId) {
      const fish = fishMap.get(playerId);
      if (!fish) return;
      fish.dispose(world);
      fishMap.delete(playerId);
      inputQueue.delete(playerId);
    },

    enqueueInput(playerId, input) {
      const queue = inputQueue.get(playerId);
      if (!queue) return;
      // Keep queue bounded — only latest matters for this tick
      if (queue.length > 3) queue.shift();
      queue.push(input);
    },

    step(): RoomDelta | null {
      tick++;

      // Drain input queues → apply latest input to each fish
      for (const [playerId, queue] of inputQueue) {
        const fish = fishMap.get(playerId);
        if (!fish) continue;

        const latest = queue.pop();
        queue.length = 0; // drain
        if (latest) {
          fish.applyInput(latest);
        }
      }

      // Step each fish's state machine
      for (const fish of fishMap.values()) {
        fish.step(world, TICK_DT);
      }

      // Step physics
      world.step();

      // Build delta (for now, always send all fish — optimize later with dirty tracking)
      const updatedFish = [...fishMap.values()].map((f) => f.exportState());

      if (updatedFish.length === 0) return null;

      return {
        tick,
        updatedFish,
        removedFishIds: [],
      };
    },

    exportSnapshot(): GameSnapshot {
      return {
        tick,
        fish: [...fishMap.values()].map((f) => f.exportState()),
      };
    },

    dispose() {
      for (const fish of fishMap.values()) {
        fish.dispose(world);
      }
      fishMap.clear();
      inputQueue.clear();
      world.free();
    },
  };
}
