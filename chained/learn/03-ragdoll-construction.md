# Ragdoll Construction

## What Is a Ragdoll?

A ragdoll is a character made of multiple rigid bodies connected by joints. Each body part is an independent physics object, and the joints keep them attached while allowing natural bending.

## Our Fish Ragdoll: 3 Bodies + 2 Joints

```
  HEAD ←──headJoint──→ BODY ←──tailJoint──→ TAIL
  (sphere)              (capsule)             (sphere)
  r=0.25, 1.0kg         r=0.28, 2.5kg        r=0.18, 0.4kg
```

### Body Layout (Z-axis = front-to-back)

```
Z position:  -0.55        0.0         +0.55
              HEAD ←────── BODY ──────→ TAIL
              
              ←─── fish faces this way (negative Z)
```

- Head is 0.55m behind the body center
- Tail is 0.55m ahead of the body center
- Total fish length: ~1.1m

### Why These Specific Shapes?

| Part | Shape | Why |
|------|-------|-----|
| Head | Sphere (r=0.25) | Rolls naturally on surfaces, cheap collision |
| Body | Capsule (hh=0.3, r=0.28) | Connects head and tail visually, good for ground contact |
| Tail | Sphere (r=0.18) | Smallest — whips around fast, minimal inertia |

### Mass Distribution Matters

```
Head: 1.0 kg (26%)  — follows body, doesn't dominate
Body: 2.5 kg (64%)  — THE mass center, controls forward motion
Tail: 0.4 kg (10%)  — lightest, oscillates fastest
```

**Why heavy body?** When you apply a launch impulse to the body, its high mass means it carries the momentum. The lighter head and tail follow along naturally through the joints.

**Why light tail?** The motor needs to swing the tail fast during the snap. Lower mass = less force needed = faster response.

### Density Calculation

Rapier calculates mass from `density × volume`. To achieve a target mass:

```ts
// Sphere: volume = (4/3)πr³
const headDensity = 1.0 / ((4/3) * Math.PI * 0.25 ** 3);  // ≈ 15.28

// Capsule: volume = π × r² × (2h + (4/3)r)
const bodyVol = Math.PI * 0.28**2 * (2 * 0.3 + (4/3) * 0.28);  // ≈ 0.237
const bodyDensity = 2.5 / bodyVol;  // ≈ 10.55
```

## Joint Placement

### Head-Body Joint

```ts
RAPIER.JointData.revolute(
  { x: 0, y: 0, z: 0.2 },    // 0.2m forward from HEAD center
  { x: 0, y: 0, z: -0.35 },  // 0.35m backward from BODY center
  { x: 0, y: 1, z: 0 }       // Y-axis rotation (left-right bend)
);
```

The joint point is between the head and body, slightly closer to the head (0.2m from head vs 0.35m from body). This is because the head is smaller and the visual "neck" area is closer to the head.

### Body-Tail Joint

```ts
RAPIER.JointData.revolute(
  { x: 0, y: 0, z: 0.35 },   // 0.35m forward from BODY center
  { x: 0, y: 0, z: -0.15 },  // 0.15m backward from TAIL center
  { x: 0, y: 1, z: 0 }       // Y-axis rotation
);
```

Joint is closer to the tail (0.15m) — the tail "hangs off" the back of the body.

### Why Y-Axis Rotation?

The Y-axis `{ x:0, y:1, z:0 }` means the joints rotate horizontally — the fish bends LEFT and RIGHT. This is exactly how a real fish undulates: lateral body waves.

If we used X-axis, the fish would bend UP and DOWN (like a dolphin). Z-axis would make it spin in place.

## Collision Groups Prevent Self-Collision

```ts
// Ground: group 1, collides with group 2
ground.setCollisionGroups(0x00010002);

// Fish parts: group 2, collides with group 1
fishPart.setCollisionGroups(0x00020001);
```

This means:
- Fish parts collide with ground (group 2 ↔ group 1)
- Fish parts do NOT collide with each other (group 2 ↔ group 2 = no match)
- The joint's `true` flag also disables collision between directly connected bodies

Without this, the head sphere would constantly collide with the body capsule and the ragdoll would explode.

## Damping: Preventing Chaos

```ts
.setLinearDamping(0.5)   // velocity decays by 50%/sec
.setAngularDamping(0.4)  // spin decays by 40%/sec
```

Without damping, ragdoll bodies accumulate energy and spin wildly. Damping acts like air resistance:
- **Linear damping 0.5:** Fish slides to a stop over ~2 seconds when no force applied
- **Angular damping 0.4:** Spinning slows naturally

## CCD (Continuous Collision Detection)

```ts
.setCcdEnabled(true)
```

During the snap phase, the fish body can reach speeds of 10+ m/s. Without CCD, it might pass through thin geometry between physics steps. CCD uses swept collision tests to catch these "tunneling" cases.

## Building a Ragdoll: General Steps

1. **Design the skeleton:** Decide body parts, their shapes, sizes, and masses
2. **Create rigid bodies:** One dynamic body per part, with damping and CCD
3. **Attach colliders:** Correct shape, density for target mass, friction/restitution
4. **Set collision groups:** Prevent self-collision between adjacent parts
5. **Create joints:** Connect adjacent parts with appropriate joint type
6. **Set joint limits:** Prevent unnatural angles (e.g., ±69° for our fish)
7. **Configure motors:** Initial relaxed state (low stiffness)

## Reference Files

- Body creation: `client/src/fish-flop.ts` lines 226-273
- Joint creation: `client/src/fish-flop.ts` lines 275-309
- Ground collider: `client/src/fish-flop.ts` lines 196-210
- Config constants: `packages/shared/src/fish-config.ts` lines 1-12 (dimensions, mass)
