import RAPIER from "@dimforge/rapier3d-compat";
import { FLOP, type GameSnapshot, type PlayerInput, type RoomDelta } from "@fish-jam/shared";
import { createServerFish, type ServerFish } from "./server-fish.js";

const TICK_DT = 1 / 30;

// Spawn positions on the kitchen floor — y=8 so fish drops down from above any furniture.
// Adjust x/z if fish still spawns inside an obstacle after the kitchen is loaded.
const SPAWN_POSITIONS = [
  { x:  0,  y: 8, z:  8 },
  { x:  3,  y: 8, z:  8 },
  { x: -3,  y: 8, z:  8 },
  { x:  0,  y: 8, z: 12 },
  { x:  3,  y: 8, z: 12 },
  { x: -3,  y: 8, z: 12 },
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
  world.timestep = TICK_DT;

  // Thick slab: half-height 5 → 10 units of solid geometry, top at y=0.
  // Prevents high-impulse fish from tunnelling through a thin plane.
  const groundDesc = RAPIER.ColliderDesc.cuboid(100, 5, 100)
    .setTranslation(0, -5, 0)
    .setFriction(FLOP.GROUND_FRICTION)
    .setRestitution(FLOP.GROUND_RESTITUTION)
    .setCollisionGroups(0x00010002);
  world.createCollider(groundDesc);

  // Server-side box walls — approximate kitchen outer boundary at KITCHEN_SCALE=0.45.
  // Client has exact trimesh; these just prevent fish escaping at the server level.
  // Layout: kitchen spans roughly ±19 in X, ±17 in Z, up to ~20 in Y.
  const WALL_GROUP = 0x00010002;
  const wallHeight = 12;   // half-height — covers full kitchen height
  const wallThick  = 1;    // half-thickness

  const walls = [
    { hx: wallThick, hy: wallHeight, hz: 20,        tx: -22,  ty: wallHeight, tz: 0   }, // left
    { hx: wallThick, hy: wallHeight, hz: 20,        tx:  22,  ty: wallHeight, tz: 0   }, // right
    { hx: 24,        hy: wallHeight, hz: wallThick, tx:  0,   ty: wallHeight, tz: -20 }, // front
    { hx: 24,        hy: wallHeight, hz: wallThick, tx:  0,   ty: wallHeight, tz:  20 }, // back
  ];

  for (const w of walls) {
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(w.hx, w.hy, w.hz)
        .setTranslation(w.tx, w.ty, w.tz)
        .setCollisionGroups(WALL_GROUP)
    );
  }

  const fishMap = new Map<string, ServerFish>();
  const inputQueue = new Map<string, PlayerInput[]>();
  const pendingRemovals: string[] = [];
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
      pendingRemovals.push(playerId);
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
        if (latest) {
          // Merge spaceJustReleased from all queued inputs so jumps survive redundancy dedup
          const hasSpaceRelease =
            latest.spaceJustReleased ||
            queue.some((inp) => inp.spaceJustReleased);
          queue.length = 0; // drain
          fish.applyInput(
            hasSpaceRelease
              ? { ...latest, spaceJustReleased: true }
              : latest
          );
        } else {
          queue.length = 0;
        }
      }

      // Step each fish's state machine
      for (const fish of fishMap.values()) {
        fish.step(world, TICK_DT);
      }

      // Step physics
      world.step();

      // Build delta — only include fish that actually moved (dirty tracking)
      const updatedFish = [...fishMap.values()]
        .filter((f) => f.isDirty())
        .map((f) => f.exportState());
      const removedFishIds = pendingRemovals.splice(0);

      if (updatedFish.length === 0 && removedFishIds.length === 0) return null;

      return {
        tick,
        updatedFish,
        removedFishIds,
      };
    },

    exportSnapshot(): GameSnapshot {
      return {
        tick,
        fish: [...fishMap.values()].map((f) => f.peekState()),
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
