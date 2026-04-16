# Joints and Motors — The Core Mechanic

## What Are Joints?

Joints constrain the relative motion between two rigid bodies. Each joint has **two anchor points** (one on each body, in local coordinates) that the joint keeps aligned.

**Docs:** https://rapier.rs/docs/user_guides/javascript/joints

## Joint Types

| Type | What It Does | Degrees of Freedom |
|------|-------------|-------------------|
| **Fixed** | Bodies welded together. No relative motion. | 0 |
| **Spherical** | Ball-and-socket. Free rotation, no translation. | 3 rotation |
| **Revolute** | Hinge. Rotation on ONE axis only. | 1 rotation |
| **Prismatic** | Slider. Translation along one axis. | 1 translation |

**Our fish uses: Revolute joints** — the head and tail can only bend left/right (Y axis rotation).

## Revolute Joint (The One We Use)

A revolute joint is a hinge. It allows rotation around a single axis.

```ts
const jointData = RAPIER.JointData.revolute(
  { x: 0, y: 0, z: 0.2 },    // anchor point on body A (local coords)
  { x: 0, y: 0, z: -0.35 },  // anchor point on body B (local coords)
  { x: 0, y: 1, z: 0 }       // rotation axis (Y = left-right bending)
);

const joint = world.createImpulseJoint(jointData, bodyA, bodyB, true);
//                                                                ^^^^
//                                     true = disable collision between A and B
```

### Anchor Points Explained

The anchors define WHERE on each body the joint connects:
- Anchor1 `{ x:0, y:0, z:0.2 }` = 0.2m forward from head center
- Anchor2 `{ x:0, y:0, z:-0.35 }` = 0.35m backward from body center
- Total gap: 0.2 + 0.35 = 0.55m = the distance between head and body centers

### Joint Limits

```ts
(joint as RAPIER.RevoluteImpulseJoint).setLimits(-1.2, 1.2);
// ±1.2 radians = ±69 degrees
```

Prevents the head from bending more than 69° in either direction. Without limits, joints can spin freely.

## Joint Motors — THIS IS THE KEY

Motors are what make the fish MOVE. A motor applies torque to drive the joint toward a target angle.

### The Motor Equation (PD Control)

```
motorTorque = stiffness × (targetAngle - currentAngle) - damping × angularVelocity
```

This is a **PD controller** (Proportional-Derivative):
- **Proportional (stiffness):** "How hard do I pull toward the target?" Higher = stiffer, more forceful.
- **Derivative (damping):** "How much do I resist movement?" Higher = less oscillation, more energy absorbed.

### Setting a Motor

```ts
(joint as RAPIER.RevoluteImpulseJoint).configureMotorPosition(
  targetAngle,   // where the joint should try to reach (radians)
  stiffness,     // spring force (higher = stiffer pull)
  damping        // energy absorption (higher = less bouncy)
);
```

Our fish wraps this in a helper:
```ts
function setMotor(joint, target, stiffness, damping) {
  (joint as RAPIER.RevoluteImpulseJoint).configureMotorPosition(
    target, stiffness, damping
  );
}
```

## How Motors Create the Fish's Movement

### The Curl-Snap Cycle

This is the core innovation. The fish doesn't use traditional "apply force to move." Instead:

**CURL phase (0.12 seconds):**
```ts
setMotor(headJoint,  curlSign * 0.35, 200, 8);   // head bends 20°
setMotor(tailJoint, -curlSign * 0.70, 200, 8);    // tail bends 40° (opposite)
```
- Stiffness 200 = moderate pull
- Damping 8 = controlled, not bouncy
- The fish bends into a C-shape

**SNAP phase (0.06 seconds):**
```ts
setMotor(headJoint,  curlSign * (-0.60), 1200, 2);  // head snaps back -34°
setMotor(tailJoint, -curlSign * (-1.20), 1200, 2);   // tail snaps back -69°
```
- Stiffness 1200 = **6× stiffer** than curl — violent snap-back
- Damping 2 = **¼ the damping** — lets energy release fast
- Combined with a launch impulse on the body

### The Illusion of Stored Energy

**Key insight:** The motor doesn't actually store spring energy. When the curl sets targets at +0.35/+0.70, the motor pulls the joints there. When snap swaps to -0.60/-1.20, the motor just pulls the other way — harder (1200 vs 200).

The ILLUSION is that curling "winds up" energy that the snap "releases." In reality:
1. Curl moves joints to position A (moderate force)
2. Snap swaps to position B (extreme force in opposite direction)
3. The sudden reversal + high stiffness = violent motion
4. A separate launch impulse on the body provides actual forward propulsion

### Stiffness & Damping Intuition

| Stiffness | Damping | Result |
|-----------|---------|--------|
| Low (30) | Low (2) | Floppy, lazy response. Used in **airborne** phase. |
| Medium (200) | Medium (8) | Controlled bend. Used in **curl** phase. |
| High (1200) | Low (2) | Violent snap. Used in **snap** phase. |
| High (900) | Low (2) | Strong but less extreme. Used in **jump snap**. |

### Curl Sign Alternation

`curlSign` alternates between +1 and -1 after each snap:
```ts
fish.curlSign *= -1;  // flip after each snap
```

This means:
- Flop 1: curl LEFT, snap RIGHT
- Flop 2: curl RIGHT, snap LEFT
- Flop 3: curl LEFT, snap RIGHT...

Creates a natural swimming-like oscillation pattern. Like how a real fish undulates side to side.

## Motor States by Phase

| Phase | Head Target | Tail Target | Stiffness | Damping | Effect |
|-------|------------|-------------|-----------|---------|--------|
| idle | 0 | 0 | 30 | 2 | Relaxed, floppy |
| curl | +s×0.35 | -s×0.70 | 200 | 8 | C-shape bend |
| snap | +s×(-0.60) | -s×(-1.20) | 1200 | 2 | Violent snap-back |
| airborne | 0 | 0 | 30 | 2 | Free flutter |
| land | 0 | 0 | 200 | 8 | Settle into neutral |
| jump_charge | -s×coil | +s×coil | 200 | 8 | Slight coil (0–0.3 rad) |
| jump_snap | 0 | 0 | 900 | 2 | Spring back to neutral |

(s = curlSign, coil = chargeT × 0.3)

## Reference Files

- Joint creation: `client/src/fish-flop.ts` lines 275-309
- Motor helper: `client/src/fish-flop.ts` lines 378-389
- Curl motors: `client/src/fish-flop.ts` lines 573-585
- Snap motors: `client/src/fish-flop.ts` lines 595-606
- Config values: `packages/shared/src/fish-config.ts`
