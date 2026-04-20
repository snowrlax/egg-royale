# Plan: Arena-First — Push-Off Platform (BombSquad-style)

## Context

Ship the core game loop before the polish. Players stand on a floating platform, bump each other around, and whoever falls off loses the round. The earlier active-ragdoll plan was *right* as a technique but *wrong* as the next thing to build — without an arena, the ragdoll has no scenery to react to. This plan re-sequences: arena → opponents → win condition → visual polish → powered ragdoll.

Reference for the long-term look: a wooden platform with curved-rail ends, stacked stepped base, fog, and concrete pillars in the distance. That's Phase 4. For now we're building a **minimal floating box** so gameplay can come alive first.

---

## Current state (as of this re-plan)

- `main.ts`, `scene.ts`, `character.ts`, `controller.ts`, `input.ts` — working: Steve loads, WASD+shift+space move/run/jump, follow camera.
- `physics.ts` — builds a Rapier world with a ground collider. Was not wired into `main.ts`.
- `ragdoll.ts` — Phase-A/B code (kinematic anchor + dynamic lower-arm + spherical joint). **Parked**. We do not call it. Compiles cleanly once `Character.bones` exists.
- No arena concept, no second character, no game state.

## Decisions baked into this plan

1. **Ragdoll parked.** Keep `ragdoll.ts` on disk for Phase 5 revival. Don't wire it up.
2. **Kinematic movement stays.** Controller still writes `position` directly. Platform bounds gate grounding; off-platform = gravity wins.
3. **Minimal box platform.** One floating cuboid. Curved rails, fog, pillars come in Phase 4.

---

## Phase 1 — Arena scaffolding ✅ **shipped**

**Result.** Steve spawns on a floating wood-toned box. Walking off any edge drops him; dropping past `FALL_THRESHOLD` below the top respawns him at `PLAYER_SPAWN`.

- `arena.ts` (new) — platform half-extents, top-Y, fall threshold, spawn points, `isOverPlatform(x,z)`.
- `scene.ts` — plane floor removed; platform box mesh + ambient light added.
- `physics.ts` — ground cuboid replaced with a platform-sized fixed collider sharing arena constants.
- `controller.ts` — `ControllerState` gains `fallen`; `grounded` requires being over the platform; new `respawn(spawn)` method.
- `main.ts` — awaits `createPhysics()`; on `state.fallen` calls `controller.respawn(PLAYER_SPAWN)`; spawns Steve at `PLAYER_SPAWN`.
- `character.ts` — exposes `bones: Record<string, THREE.Bone>` (unblocks ragdoll.ts type-check).
- `ragdoll.ts` — unused `_scene` parameter dropped; no behavior change; still unused.

## Phase 2 — Second character + push mechanic

**Goal.** A dummy opponent on the platform that you can walk/sprint into and knock off.

- New `characters.ts` — spawn N characters, each with its own `Character` + `Controller` (or a slim kinematic-only controller for the dummy).
- Per-frame pair check in `main.ts` (or a `push.ts`): if horizontal distance < `BODY_RADIUS` and attacker is moving toward defender, displace the defender by `attackerSpeed * PUSH_IMPULSE_SCALE * dt` along the contact normal.
- Dummy has its own spawn + respawn; gravity and arena bounds already handle falling.
- Add tuning constants to `arena.ts`: `BODY_RADIUS`, `PUSH_IMPULSE_SCALE`.
- Distinguish the dummy visually (tint / scale).

Verify: sprint into dummy near the edge → dummy falls → dummy respawns.

## Phase 3 — Match state + win condition

**Goal.** A playable round loop with score.

- New `match.ts` — state machine: `"playing" | "roundOver"`. On any character's `fallen`, award a point to the survivor, pause briefly, reset both, return to `"playing"`.
- Dummy AI stub: walk toward the player at half speed.
- HUD: update `index.html` to show score + transient "You fell!" / "You won!" text.

## Phase 4 — Visual polish (deferred)

Once the loop feels fun:
- Curved-rail short ends (quarter-cylinder meshes; optional thin bumper colliders).
- Stepped wooden base under the platform (cosmetic, no physics).
- `scene.fog` tuned to reference screenshot.
- Instanced box pillars scattered in the void.

## Phase 5 — Revive powered ragdoll (deferred)

Return to the original ragdoll plan (see git history of this file for the full doc):
- Phase A: dangling-arm demo with debug sphere.
- Phase B: physics overwrites `LowerArmL` (already implemented in `ragdoll.ts`).
- Phase C: spherical motors tracking animation pose — both arms + head.
- Phase D: tuning, optional torso, clamp angular velocity.

Hooking the ragdoll will also enable satisfying "got shoved" reactions driven by the collision in Phase 2.

---

## Files in play

| File | Status | Purpose |
|---|---|---|
| `client/src/arena.ts` | **created (P1)** | Platform dimensions, spawn points, `isOverPlatform` |
| `client/src/scene.ts` | **modified (P1)** | Platform mesh; ambient light; darker background |
| `client/src/physics.ts` | **modified (P1)** | Platform-shaped fixed collider |
| `client/src/controller.ts` | **modified (P1)** | Arena-bounded grounding; `fallen` + `respawn()` |
| `client/src/character.ts` | **modified (P1)** | Exposes `bones` map |
| `client/src/ragdoll.ts` | **modified (P1)** | Dropped unused `_scene` param; still not wired |
| `client/src/main.ts` | **modified (P1)** | Init physics; handle `fallen`; spawn at `PLAYER_SPAWN` |
| `client/src/characters.ts` | planned (P2) | Multi-character spawning |
| `client/src/push.ts` | planned (P2) | Pairwise push interaction |
| `client/src/match.ts` | planned (P3) | Round state machine + scoring |
| `client/index.html` | planned (P3) | HUD: score + round messages |

## Verification (end-to-end, after Phase 1)

1. `cd chained/client && npx tsc --noEmit` → zero errors.
2. `npm run dev` → one floating wood platform; Steve on top at spawn.
3. Walk to each edge → falls off → respawns at spawn.
4. Jump on platform → lands. Jump off edge mid-air → falls & respawns.
5. No console errors.

## Non-goals (explicit)

- Powered ragdoll (Phase 5).
- Curved rails, fog, pillars, stepped base (Phase 4).
- Networking / multiplayer over the wire.
- Real AI beyond "walk toward player" (Phase 3 stub).
- Attack moves beyond bump-push.
