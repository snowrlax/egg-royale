# Forces, Impulses, and How Things Move

## The Two Ways to Make Things Move

### Force (Continuous)

```ts
rb.addForce({ x: fx, y: 0, z: fz }, true);
```

- Applied **every frame** during `world.step()`
- Accumulates over time: `velocity += (force / mass) * dt`
- Good for: sustained effects like air control, wind, gravity
- Must be re-applied each frame (resets after step)

### Impulse (Instant)

```ts
rb.applyImpulse({ x: fx, y: fy, z: fz }, true);
```

- Applied **once**, instant velocity change: `velocity += impulse / mass`
- Good for: one-shot events like jumps, launches, hits
- The `true` parameter = wake up the body if it's sleeping

## How Our Fish Uses Each

### Impulse Uses

| When | What | Magnitude | Code Location |
|------|------|-----------|--------------|
| Snap launch (body) | Forward + upward | MOVE_FORCE=10 horizontal, LAUNCH_UP=8 vertical | fish-flop.ts line 617 |
| Snap tail slap | Tail downward | TAIL_SLAP_DOWN=6 | fish-flop.ts line 618 |
| Jump snap (body) | Upward + optional lateral | 14–24 vertical, 4 lateral | fish-flop.ts line 726 |
| Jump snap (head) | Upward | upImpulse × 0.6 | fish-flop.ts line 727 |
| Jump snap (tail) | Upward | upImpulse × 0.2 | fish-flop.ts line 728 |

### Force Uses

| When | What | Magnitude | Code Location |
|------|------|-----------|--------------|
| Air control | Horizontal steering | MOVE_FORCE × AIR_CONTROL = 3 | fish-flop.ts lines 631-633 |

### Torque Impulse Uses

```ts
rb.applyTorqueImpulse({ x: tx, y: ty, z: tz }, true);
```

Same as impulse but for rotation. Instant change in angular velocity.

| When | What | Purpose |
|------|------|---------|
| Recovery | Cross product of bodyUp × worldUp | Right the fish when tilted |
| Facing | PD controller on Y-axis | Turn to face input direction |
| Breathing | sin(t*3) × 0.3 on X-axis | Idle animation |
| Curl animation | ±1.5 on head/tail X-axis | Enhance curl visual |
| Snap animation | ±2.0/±3.0 on head/tail X-axis | Enhance snap visual |
| Flutter | sin(t*18) × 1.2 on tail X-axis | Airborne tail wiggle |
| Landing | Decaying torque on head/tail | Impact reaction |

## Velocity Control

### Direct Velocity Setting

```ts
rb.setLinvel({ x: 0, y: v.y, z: 0 }, true);   // zero horizontal, keep vertical
rb.setAngvel({ x: 0, y: 0, z: 0 }, true);      // stop all spinning
```

Used in two critical places:
1. **Snap phase (line 611-614):** Zero horizontal velocity before launch so residual sliding doesn't contaminate the launch direction
2. **Jump snap (lines 719-724):** Zero ALL velocity and angular velocity for a perfectly clean jump

### Velocity Clamping

```ts
function clampVelocity(rb, max) {
  const v = rb.linvel();
  const hSpeed = Math.sqrt(v.x ** 2 + v.z ** 2);  // horizontal only
  if (hSpeed > max) {
    const s = max / hSpeed;
    rb.setLinvel({ x: v.x * s, y: v.y, z: v.z * s }, true);
  }
}
```

Only clamps horizontal (XZ) speed. Vertical (Y) is unclamped — gravity and jumps can be any speed.

**Applied every frame** to all 3 bodies:
- Body: max 12 m/s
- Head/Tail: max 14.4 m/s (12 × 1.2 — looser, they're appendages)

### Braking

```ts
function brakeHorizontal(fish, factor) {
  for (const rb of [fish.body, fish.head, fish.tail]) {
    const v = rb.linvel();
    rb.setLinvel({ x: v.x * factor, y: v.y, z: v.z * factor }, true);
  }
}
```

Called with factor=0.8 during idle (no input):
- Frame 1: v = 0.8v₀
- Frame 5: v = 0.8⁵ × v₀ ≈ 0.33v₀
- Frame 10: v ≈ 0.11v₀

Below 0.05 m/s → snapped to zero (deadzone prevents infinite tiny sliding).

## Gravity

```ts
const world = new RAPIER.World({ x: 0, y: -25, z: 0 });
```

Our gravity is -25 m/s² (2.55× Earth gravity). This makes the game feel fast and punchy:
- Falls are quick → less waiting time
- Jumps need more impulse → more dramatic launches
- Landing impacts feel heavier

## Damping

```ts
.setLinearDamping(0.5)   // velocity decays continuously
.setAngularDamping(0.4)  // spin decays continuously
```

Damping is like air resistance. Applied automatically by the physics engine every step:
```
velocity_new = velocity_old × (1 - damping × dt)
```

At damping=0.5 and dt=1/30:
- Each frame: velocity × 0.983
- Over 1 second: velocity × 0.5 (halved)

## Understanding the Snap Launch in Detail

The snap is the most important physics moment. Let's trace through it:

```
1. Fish is in curl: body has some residual velocity from previous flop

2. Snap begins (frame 1):
   a. Motors reverse: head → -0.60, tail → -1.20 (stiffness 1200)
   b. Zero horizontal velocity on all bodies
   c. Apply impulse to body: 10 forward + 8 upward
   d. Apply impulse to tail: 6 downward
   
3. After impulse (body):
   v_horizontal = 10 / 2.5 = 4.0 m/s (impulse / mass)
   v_vertical = 8 / 2.5 = 3.2 m/s
   
4. Snap frame 2: only motors are active (no more impulses)
   The high-stiffness motors yank joints, adding rotational energy
   
5. After 0.06s → airborne
   Body is traveling at ~4 m/s forward, ~2-3 m/s up (gravity has pulled down slightly)
   Joint motors relax to stiffness=30 → head and tail flutter freely
```

## Reference Files

- Impulse application: `client/src/fish-flop.ts` lines 608-618, 709-728
- Force application: `client/src/fish-flop.ts` lines 631-633
- Torque impulses: `client/src/fish-flop.ts` lines 435-515
- Velocity clamping: `client/src/fish-flop.ts` lines 409-416
- Braking: `client/src/fish-flop.ts` lines 422-433
