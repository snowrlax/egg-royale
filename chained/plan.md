# Plan: BombSquad-style Active Ragdoll (Animation + Secondary Physics)

## Context

**The goal.** Animation should keep driving Steve's *primary* motion (walking gait, running, jumping). On top of that, **physics overlays "secondary motion"** on the upper body — arms swing from inertia when turning, head bobs from acceleration, torso sways. The legs stay tightly animation-driven so locomotion remains crisp; everything above the hips becomes a "limp puppet" that reacts to the world.

**Why this technique exists.** Pure animation looks robotic — the arms always do exactly what the animator drew, no matter how fast you turn. Pure ragdoll looks dead — the character can't walk. **Powered ragdoll** is the bridge: physics bodies for each upper-body bone, with motorized joints that *try* to match the animation pose. When the character moves, the joints lag → arms swing → the character feels alive. This is exactly how BombSquad does it.

**Current state of the codebase** (verified):
- `client/src/main.ts` — Steve loaded, animated, WASD+jump controller, follow camera ✓
- `client/src/character.ts` — `loadSteve()` returns `{ object, actions, play, update }`. Uses `THREE.AnimationMixer`. ✓
- `client/src/controller.ts` — kinematic motion (writes `target.position`, no Rapier). ✓
- `client/src/scene.ts` — WebGPU renderer, lights, floor at y=0. ✓
- `@dimforge/rapier3d v0.19.3` — installed, currently unused.
- Steve bones: `Hips → Abdomen → Torso → Neck → Head`, `Shoulder.L/R → UpperArm.L/R → LowerArm.L/R → Fist.L/R`, `UpperLeg → LowerLeg → Foot`.

---

## Conceptual primer — four patterns, choose one

| Pattern | What it is | When to use |
|---|---|---|
| **Pure animation** (today's state) | AnimationMixer writes every bone. No physics on the body. | Stylized games, low CPU, full art control. |
| **Pure ragdoll** | Every bone is a physics body with joints. Animation ignored. | Death scenes, getting hit, falling off cliffs. |
| **Powered (active) ragdoll** | Every bone has physics, joints have motors that target animation pose. Stiffness controls "floppiness". | Full-body alive characters that can also go limp. |
| **Partial powered ragdoll** ← **what we're building** | Physics on *only* the upper body. Lower body stays pure animation. | BombSquad-style: walking is sacred, upper body is alive. |
| **Procedural secondary motion** | No physics engine. Spring-damper math on bone rotations driven by velocity/acceleration. | Cheap mobile games. Looks decent but doesn't feel like real physics. |

We're picking **partial powered ragdoll** because (a) it preserves the working leg animation, (b) physics on the upper body is what actually produces centrifugal sway, (c) it's the BombSquad recipe.

---

## The canonical frame loop (this is the *one* thing to grok)

The trick is conflict resolution: AnimationMixer wants to write to bones; physics wants to write to bones. **Animation goes first, then physics overrides.**

```
each frame:
  1. controller.update(dt)              // input → kinematic root motion
  2. mixer.update(dt)                   // animation writes ALL bone transforms
  3. for each physics-driven bone:
       read its current world transform (= animation's "target pose")
       set that as the joint's motor target
  4. world.step()                       // physics simulates — bodies lag, swing, settle
  5. for each physics-driven bone:
       read physics body's world transform
       convert to parent-local space
       overwrite bone.position / bone.quaternion  ← physics wins for these bones
  6. render
```

Steps 2 and 5 *both* write to the same bones. Physics runs after, so physics is what you see for those bones. The legs (not in the physics-driven set) keep whatever step 2 wrote — pure animation.

---

## Architecture — what we'll build

### Bones we make physics-driven
- `Head` (1)
- `UpperArm.L`, `LowerArm.L` (2)
- `UpperArm.R`, `LowerArm.R` (2)
- *(Optional — Phase D)* `Abdomen`, `Torso` for torso sway

Total: **5 bones** initially, possibly **7** later.

### Bones that stay animation-driven
- `Hips`, `UpperLeg.*`, `LowerLeg.*`, `Foot.*` (legs — locomotion)
- `Shoulder.*`, `Fist.*`, `Neck` (small in-between bones — let them inherit)

### Anchor: kinematic torso body
- The character root (`steve.object`) moves kinematically in `controller.ts`.
- We add a **kinematic-position-based** Rapier body at the Hips/Torso position. Each frame we set its transform to match Steve's root.
- Physics-driven arm/head bodies attach to *this* anchor via joints. Because the anchor moves but has infinite mass, it pulls the arms along — but the arms have inertia and lag → centrifugal sway.

### Joints
- `Head ↔ Torso anchor`: spherical, soft motor (low stiffness, head wobbles)
- `UpperArm ↔ Torso anchor`: spherical, soft-medium motor
- `LowerArm ↔ UpperArm`: revolute (elbow), medium-stiff motor
- All motors: `MotorModel.ForceBased` + `configureMotorPosition(targetQuat, stiffness, damping)`

Reference values to start from:
- "Loose arm sway": stiffness 40, damping 4
- "Wobbly head": stiffness 25, damping 3
- "Stiff elbow": stiffness 150, damping 12
- Damping ≈ 10% of stiffness, raise if oscillation, lower if mushy.

---

## Implementation — progressive 4-phase rollout

We build in stages so each step is understandable and verifiable.

### Phase A — "Dangling arm" demo (simplest possible)
**Goal:** prove the binding loop works. One bone, one physics body, gravity only — no animation tracking yet.

**What you'll see:** Steve walks around as before. A debug sphere visualizes the physics body's location near his left elbow — it dangles, swings as he turns, and trails behind acceleration. (No bones overridden yet — pure visualization to verify the kinematic-anchor + dynamic-body + joint setup works.)

**New files:**
- `client/src/physics.ts` — re-create the Rapier world (deleted previously). Just `world` + ground.
- `client/src/ragdoll.ts` — creates the kinematic anchor + one dynamic body for the lower-arm region, joins them, exposes `update()` that:
  1. Syncs anchor to `UpperArm.L`'s current world position
  2. Steps physics
  3. Updates a debug visualization mesh at the body's world position

**Modified files:**
- `client/src/character.ts` — collect bones into a `bones: Record<string, THREE.Bone>` map and expose them.
- `client/src/main.ts` — call `await createPhysics()` and `createRagdoll(...)`. Call `ragdoll.update()` each frame, after `steve.update(dt)`.

### Phase B — Write physics back to bone
**Goal:** the visual arm bone now actually follows the physics body (instead of just a debug sphere).

**Change:** in `ragdoll.ts`, after step 2 of the loop, compute the bone's parent-local rotation from the physics body's world rotation and write it to `lowerArmL.quaternion`.

**What you'll see:** Steve's actual lower arm dangles and swings. Other arm + legs unchanged.

### Phase C — Motor tracks animation + extend to all upper-body bones
**Goal:** full upper-body partial ragdoll with animation tracking.

**Changes:**
- Add a motor to the joint that targets the animation's bone pose (read each frame, set via `configureMotorPosition`).
- Generalize the single-bone code in `ragdoll.ts` to a list. Add bodies + joints for `UpperArm.L/R`, `LowerArm.R`, `Head`.

**What you'll see:** both arms swing/pump roughly with the walk cycle but with secondary lag. Sharp turns produce visible centrifugal sway. Head bobs.

### Phase D — Tuning + (optional) torso
**Goal:** make it *feel* right.

- Tune per-bone stiffness/damping. Mass ratios matter — light arms swing more.
- Optional: add `Abdomen` + `Torso` to physics for body-wide sway.
- Optional: clamp angular velocity / add `linearDamping` to prevent runaway oscillation.

---

## Files affected (all phases combined)

| File | Status | Purpose |
|---|---|---|
| `client/src/physics.ts` | **Create** (Phase A) | `createPhysics()` returns `{ world, RAPIER }`. Just world + ground collider. |
| `client/src/ragdoll.ts` | **Create** (Phase A) | `createRagdoll(physics, character, scene)`. Returns `{ update() }`. Owns anchor body, bone bodies, joints, bone-binding math. |
| `client/src/character.ts` | **Modify** (Phase A) | Add `bones: Record<string, THREE.Bone>` to the `Character` type, populated via traverse after load. |
| `client/src/main.ts` | **Modify** (Phase A) | Wire up `createPhysics()` → `createRagdoll()` → `ragdoll.update()` each frame after animation. |

**Reuse, don't reinvent:**
- `loadSteve()` already returns `object` — bones are inside as `THREE.Bone` nodes accessible by name.
- `MotorModel`, `JointData.spherical`, `JointData.revolute`, `configureMotorPosition` — Rapier API patterns.
- `THREE.Quaternion`, `THREE.Matrix4`, `Object3D.matrixWorld`, `Object3D.parent` — for bone↔world space conversion.

---

## Critical concepts you'll learn

1. **Parent-local vs world space.** Bones are stored relative to their parent bone. Rigid bodies live in world space. Every frame you cross this boundary twice (set joint targets, write back to bone). The math is `boneLocal = parent.matrixWorld⁻¹ × bodyWorld`.

2. **PD controller as a spring.** `configureMotorPosition(target, K, D)` is a spring (stiffness `K`) plus a damper (`D`). High K = tight tracking. Low K = drifty/floppy. Damping kills oscillation.

3. **Kinematic vs dynamic bodies.** The torso anchor is kinematic — it moves where you tell it, infinite mass, no forces affect it. The arm bodies are dynamic — they have mass, gravity pulls them, joints constrain them. Joining a dynamic body to a kinematic anchor is how you "attach" simulated parts to a non-simulated character.

4. **Mass ratios matter.** Light limb + heavy anchor = limb swings dramatically. Equal masses = mushy. Default Rapier mass comes from collider volume; tweak via `setDensity`.

5. **Loop order is law.** Animate → set targets → step physics → write back → render. Get this wrong and you'll fight your own writes.

6. **Centrifugal swing is emergent, not programmed.** You don't write code that says "swing the arm when turning." The kinematic anchor moves through space; arm body has inertia; soft joint can't yank it instantly; arm trails. The simulation produces the effect for free — that's the magic.

---

## Verification

Each phase has an unambiguous visual test.

### Phase A
- `npm run dev` → http://localhost:5174
- Steve idle: a small red debug sphere should hang from where his left elbow is.
- Walk forward (W): the sphere swings backward as you accelerate, then settles.
- Spin in place (rapid A↔D): the sphere trails behind the rotation.
- **Failure modes:** sphere flies off into space (joint anchor wrong), sphere stays glued (anchor not kinematic), sphere jitters (loop order wrong).

### Phase B
- The actual lower arm bone now follows the physics. Debug sphere can be removed or kept for comparison.

### Phase C
- Run forward (Shift+W): both arms pump but with secondary swing.
- Sharp turn while running: arms visibly trail.
- Jump: head bobs on landing.

### Phase D
- Subjective. Show it to someone — does it look alive? Tune until yes.

### Type-check (after every change)
```
npx tsc --noEmit
```

---

## What we are NOT building yet (intentional non-scope)

- **Full ragdoll on death** — comes after this works.
- **Pickup/hold mechanics** — separate concern.
- **Collisions between body parts and the world** — leg colliders, ground hits, etc. Phase D+ if needed.
- **Network sync / determinism** — single-player, single-client.

---

## Recommended starting point

Implement **Phase A only** in this session. It's the smallest unit that proves the whole pipeline works. Once you see the debug sphere dangle correctly, Phases B/C/D layer on top.
