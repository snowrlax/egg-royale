# Rapier3D Basics

## What is Rapier?

Rapier is a Rust physics engine compiled to WASM for JavaScript. It handles rigid body simulation — objects with mass that respond to forces, gravity, and collisions.

**Docs:** https://rapier.rs/docs/user_guides/javascript/rigid_bodies

## The World

Everything lives in a `RAPIER.World`. You create it with a gravity vector:

```ts
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
```

Each frame you call `world.step()` to advance the simulation by one timestep.

## Rigid Body Types

| Type | Created With | Behavior |
|------|-------------|----------|
| **Dynamic** | `RigidBodyDesc.dynamic()` | Affected by forces, gravity, collisions. The standard physics object. |
| **Fixed** | `RigidBodyDesc.fixed()` | Immovable. Infinite mass. Floors, walls, platforms. |
| **KinematicPositionBased** | `RigidBodyDesc.kinematicPositionBased()` | You set position each frame; engine interpolates. Ignores forces. |
| **KinematicVelocityBased** | `RigidBodyDesc.kinematicVelocityBased()` | You set velocity each frame; engine integrates. Ignores forces. |

**For our fish:** All three body parts (head, body, tail) are **dynamic** — they respond to gravity, impulses, and joint forces.

## Creating a Rigid Body

```ts
const desc = RAPIER.RigidBodyDesc.dynamic()
  .setTranslation(0, 2, 0)           // initial position
  .setLinearDamping(0.5)              // velocity decay (0 = no decay, higher = more drag)
  .setAngularDamping(0.4)            // rotation decay
  .setCcdEnabled(true);               // continuous collision detection (prevents tunneling)

const rb = world.createRigidBody(desc);
```

### Key Properties

- **Linear Damping:** Slows down movement over time. Like air resistance. Our fish uses 0.5.
- **Angular Damping:** Slows down spinning. Our fish uses 0.4.
- **CCD:** Continuous Collision Detection. Prevents fast objects from passing through walls. Essential for objects that get launched (like our fish during snap).

## Colliders

A rigid body alone has no shape. You attach **colliders** to give it geometry for collision detection.

```ts
// Ball (sphere)
const collDesc = RAPIER.ColliderDesc.ball(0.25)  // radius
  .setDensity(3.82)        // mass = density × volume
  .setFriction(0.4)        // 0 = ice, 1+ = grippy
  .setRestitution(0.15);   // bounciness: 0 = no bounce, 1 = full bounce

world.createCollider(collDesc, rb);  // attach to rigid body
```

### Common Shapes

```ts
RAPIER.ColliderDesc.ball(radius)                    // sphere
RAPIER.ColliderDesc.capsule(halfHeight, radius)     // pill shape (Y-aligned)
RAPIER.ColliderDesc.cuboid(halfX, halfY, halfZ)     // box
RAPIER.ColliderDesc.trimesh(vertices, indices)       // triangle mesh (static only)
```

### Mass Calculation

Mass comes from `density × volume`. If you want a specific mass:
```ts
// For a sphere: volume = (4/3) × π × r³
const density = desiredMass / ((4/3) * Math.PI * radius ** 3);
```

Our fish does exactly this — see `fish-flop.ts` lines 233-234.

## Collision Groups

The 32-bit packed format controls which objects collide:
- Upper 16 bits = **membership** (what group am I in?)
- Lower 16 bits = **filter** (what groups do I collide with?)

```ts
// Ground: group 1, collides with group 2
.setCollisionGroups(0x00010002)

// Fish: group 2, collides with group 1
.setCollisionGroups(0x00020001)
```

Two colliders A and B collide only if:
`(A.membership & B.filter) != 0 AND (B.membership & A.filter) != 0`

## Forces vs Impulses

| Method | Effect | When to Use |
|--------|--------|-------------|
| `rb.addForce(vec)` | Continuous push (applied per frame) | Sustained effects: air control, wind |
| `rb.applyImpulse(vec)` | Instant velocity change | One-shot: jump, launch, hit |
| `rb.applyTorqueImpulse(vec)` | Instant angular velocity change | Spin: recovery, facing, animation |
| `rb.setLinvel(vec)` | Override velocity directly | Hard reset: zeroing before jump |

**Force** = `acceleration × mass`, applied over time. Impulse = instant `Δvelocity × mass`.

Our fish uses:
- **Impulse** for snap launch (`MOVE_FORCE=10` horizontal + `LAUNCH_UP=8` vertical)
- **Force** for air control (`MOVE_FORCE × AIR_CONTROL=0.3` = 3 units of force)
- **Torque impulse** for facing, recovery, and animation

## Velocity Control

```ts
// Read current velocity
const v = rb.linvel();  // { x, y, z }

// Set velocity directly (preserving Y for gravity)
rb.setLinvel({ x: desiredX, y: v.y, z: desiredZ }, true);

// The `true` flag = wake up the body if sleeping
```

## How Our Fish Uses These

| Part | Body Type | Collider | Mass | Why |
|------|-----------|----------|------|-----|
| Head | dynamic | ball(0.25) | 1.0 kg | Light — follows body without too much inertia |
| Body | dynamic | capsule(0.3, 0.28) | 2.5 kg | Heaviest — controls forward movement |
| Tail | dynamic | ball(0.18) | 0.4 kg | Lightest — oscillates fast for whip effect |

**Total fish mass: 3.9 kg** with center of mass biased toward the body.

## Reference: Our Existing Config

See `packages/shared/src/fish-config.ts` for all tuning constants.
