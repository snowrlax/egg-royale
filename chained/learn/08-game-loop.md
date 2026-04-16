# The Game Loop — Fixed Timestep Physics

## Why Fixed Timestep?

Monitors run at different refresh rates (60Hz, 120Hz, 144Hz). If physics runs once per render frame, the simulation speed changes with frame rate:

- At 60 FPS: physics steps every 16.7ms
- At 144 FPS: physics steps every 6.9ms
- Same force applied → different results!

**Fixed timestep** decouples physics from rendering. Physics always advances by the same dt, regardless of frame rate.

## The Accumulator Pattern

```ts
const PHYSICS_DT = 1 / 30;  // 30Hz physics (0.033s per step)
let accumulator = 0;

function gameLoop() {
  const frameDelta = Math.min(clock.getDelta(), 0.1);  // cap at 100ms
  accumulator += frameDelta;
  
  // Step physics as many times as needed to catch up
  while (accumulator >= PHYSICS_DT) {
    processInput();
    updateFish(fish, world, PHYSICS_DT);
    world.step();
    accumulator -= PHYSICS_DT;
  }
  
  // Render once per frame (at monitor refresh rate)
  syncMeshes();
  renderer.render(scene, camera);
  requestAnimationFrame(gameLoop);
}
```

### How It Works

**At 60 FPS (frameDelta ≈ 0.0167s):**
- Frame 1: acc = 0.0167. Not ≥ 0.033 → 0 physics steps. Render.
- Frame 2: acc = 0.0334. ≥ 0.033 → 1 physics step. acc = 0.0001. Render.
- Frame 3: acc = 0.0168. Not ≥ 0.033 → 0 physics steps. Render.
- Frame 4: acc = 0.0335. ≥ 0.033 → 1 physics step. Render.
- Pattern: physics runs at ~30Hz, rendering at 60Hz.

**At 144 FPS (frameDelta ≈ 0.0069s):**
- Frames 1-4: accumulator grows but doesn't reach 0.033.
- Frame 5: acc ≈ 0.0345 → 1 physics step.
- Pattern: physics still runs at ~30Hz, but rendering is smooth at 144Hz.

**If a frame takes long (lag spike, e.g., 100ms):**
- frameDelta capped at 0.1s (prevents death spiral)
- acc = 0.1 → 3 physics steps to catch up
- Game appears to "skip" but physics stays deterministic

### Why 30Hz?

- **Network-friendly:** Server ticks at 30Hz, so client physics at 30Hz = same results
- **Cheap:** Half the steps of 60Hz, leaving CPU budget for rendering
- **Sufficient for ragdolls:** Ragdoll physics don't need 60Hz precision. 30Hz with CCD handles it.

Our fish uses this approach: see `client/src/main.ts` lines 265-310.

## The Sandbox Alternative

The standalone sandbox (`initFlopSandbox` at fish-flop.ts line 744) uses a simpler approach:

```ts
const dt = Math.min(clock.getDelta(), 0.05);
world.timestep = dt;  // variable timestep!
world.step();
```

This is **variable timestep** — physics dt changes every frame. Fine for a local sandbox but NOT suitable for multiplayer (client and server would diverge).

## Frame Order Matters

Each physics step follows this exact order:

```
1. Read input (WASD, Space)
2. Transform input to camera-relative (sin/cos rotation)
3. Update fish state machine (motors, forces, impulses)
4. world.step() — Rapier resolves collisions, applies gravity, steps joints
5. (Network: send input to server)
6. Clear one-shot input flags (spaceJustReleased = false)
```

After ALL physics steps for this frame:

```
7. Sync meshes (copy Rapier positions → Three.js positions)
8. Update camera (follow fish)
9. Render
```

### Why Input Before Physics?

Input must be read BEFORE `world.step()` so that forces and impulses are applied in the same frame they're requested. If you read input after stepping, there's a one-frame delay.

### Why Sync Meshes After ALL Physics Steps?

If the frame requires 2 physics steps (accumulator > 2×dt), we don't need to sync meshes between them — only the final positions matter for rendering. Syncing once after all steps saves CPU.

## The requestAnimationFrame Loop

```ts
function tick() {
  // ... game logic ...
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
```

`requestAnimationFrame` calls your function once before each display refresh. It automatically:
- Syncs to monitor refresh rate (60Hz, 120Hz, etc.)
- Pauses when tab is hidden (saves battery/CPU)
- Provides high-precision timing

## Delta Time Capping

```ts
const frameDelta = Math.min(clock.getDelta(), 0.1);
```

If the user switches tabs and comes back after 5 seconds, `getDelta()` would return 5.0. Without capping:
- accumulator = 5.0
- Physics tries to step 150 times (5.0 / 0.033)
- Browser freezes trying to compute 150 physics steps

Capping at 0.1s means max 3 physics steps per frame. The game just "skips" the lost time.

## Reference Files

- Game loop: `client/src/main.ts` lines 258-333
- Sandbox loop: `client/src/fish-flop.ts` lines 812-853
- Server tick: `server/src/server-foundation.ts` (30Hz setInterval)
