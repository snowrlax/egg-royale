# Camera-Relative Input & Orbit Camera

## The Problem: Absolute vs Camera-Relative Input

If pressing W always moves the fish in world +Z direction, it feels wrong when the camera is rotated. The player expects W to move "forward" from THEIR perspective (the camera's perspective).

## Camera-Relative Movement Transform

The camera orbits around the fish at angle `camAngle` (radians). We need to rotate the input vector by this angle:

```ts
// Raw input from WASD
let fwd = 0, strafe = 0;
if (keys.has("w")) fwd = -1;    // forward (into screen)
if (keys.has("s")) fwd = 1;     // backward
if (keys.has("a")) strafe = -1;  // left
if (keys.has("d")) strafe = 1;   // right

// Rotate by camera angle
const rawX = fwd * Math.sin(camAngle) + strafe * Math.cos(camAngle);
const rawY = fwd * Math.cos(camAngle) - strafe * Math.sin(camAngle);

// Normalize to prevent diagonal speed boost
const len = Math.sqrt(rawX * rawX + rawY * rawY);
const moveX = len > 0 ? rawX / len : 0;
const moveY = len > 0 ? rawY / len : 0;
```

### The Math (sin/cos rotation)

This is a 2D rotation matrix applied to the input vector:

```
[moveX]   [sin(θ)   cos(θ)] [fwd   ]
[moveY] = [cos(θ)  -sin(θ)] [strafe]
```

Where θ = camAngle. The result is the input direction in world space.

### Why Normalize?

Pressing W+D simultaneously gives `fwd=-1, strafe=1`. The magnitude is √2 ≈ 1.41, meaning diagonal movement would be 41% faster than straight movement. Normalizing caps it to length 1.

## Facing Angle from Input

The fish turns to face the movement direction:

```ts
fish.facingAngle = Math.atan2(moveX, moveY);
```

`atan2(x, y)` returns the angle from the +Y axis toward +X. This matches the fish's convention: +Y is "forward", and angles increase clockwise.

## Facing Torque (PD Controller)

To smoothly turn the fish toward `facingAngle`:

```ts
function applyFacingForce(fish, dt) {
  // Get current body Y rotation
  const rot = fish.body.rotation();
  const q = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
  const euler = new THREE.Euler().setFromQuaternion(q, "YXZ");
  
  // Shortest angle difference
  let diff = fish.facingAngle - euler.y;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  
  // PD control: proportional + derivative
  const yAngVel = fish.body.angvel().y;
  const torqueY = (diff * FACING_TORQUE - yAngVel * FACING_DAMPING) * dt;
  
  fish.body.applyTorqueImpulse({ x: 0, y: torqueY, z: 0 }, true);
}
```

### PD Control Explained

```
torque = FACING_TORQUE × error - FACING_DAMPING × angularVelocity
       = 15 × (targetAngle - currentAngle) - 8 × currentAngVel
```

- **Proportional (15 × error):** The further from target, the harder it turns
- **Derivative (8 × angVel):** Resists turning speed, prevents overshoot
- Together: smooth approach to target without oscillation

**Example:** Fish faces 0°, wants to face 90° (π/2 ≈ 1.57 rad)
- Frame 1: error=1.57, angVel=0 → torque = 15×1.57 - 8×0 = 23.6
- Frame 5: error=0.8, angVel=1.2 → torque = 15×0.8 - 8×1.2 = 2.4 (slowing down)
- Frame 10: error≈0, angVel≈0 → torque ≈ 0 (arrived smoothly)

### Angular Wrapping

```ts
while (diff > Math.PI) diff -= Math.PI * 2;
while (diff < -Math.PI) diff += Math.PI * 2;
```

Without this, turning from 350° to 10° would go the long way around (340° turn). The wrapping ensures we always take the shortest path (20° turn).

## Recovery Torque

Keeps the fish upright when on the ground:

```ts
function applyRecoveryTorque(fish) {
  const rot = fish.body.rotation();
  const q = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
  
  // Fish's "up" direction in world space
  const bodyUp = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  const worldUp = new THREE.Vector3(0, 1, 0);
  
  // Cross product = rotation axis to align bodyUp with worldUp
  const cross = new THREE.Vector3().crossVectors(bodyUp, worldUp);
  
  // Dot product = how aligned they are (1 = perfect, 0 = sideways, -1 = upside down)
  const dot = bodyUp.dot(worldUp);
  
  // Strength scales with misalignment
  const strength = RECOVERY_TORQUE * (1 - dot);
  // dot=1 (upright): strength = 0
  // dot=0 (sideways): strength = 20
  // dot=-1 (upside down): strength = 40
  
  fish.body.applyTorqueImpulse(
    { x: cross.x * strength * 0.01, y: 0, z: cross.z * strength * 0.01 },
    true
  );
}
```

**Only applied when grounded.** In air, the fish tumbles freely (more fun, more natural).

## Orbit Camera

The camera orbits the fish at a fixed distance and height:

```ts
// Camera position: offset from fish by camAngle
const camOffX = Math.sin(camAngle) * CAM.distance;
const camOffZ = Math.cos(camAngle) * CAM.distance;

// Smoothly approach target position
const target = new THREE.Vector3(
  fishPos.x + camOffX,
  fishPos.y + CAM.height,
  fishPos.z + camOffZ
);
camera.position.lerp(target, CAM.smoothness);  // 0.08 = gentle follow

// Look at fish
camera.lookAt(fishPos.x, fishPos.y + 1, fishPos.z);
```

### Mouse Drag for Orbit

```ts
// On pointer down: record start position
// On pointer move: camAngle += deltaX * sensitivity
// On pointer up: stop tracking
```

The camera orbits horizontally around the fish. This is why input must be camera-relative — the camera can be at any angle.

### Lerp for Smooth Follow

```ts
camera.position.lerp(target, 0.08);
```

`lerp(target, t)` moves 8% of the remaining distance each frame:
- Frame 1: 8% closer
- Frame 2: 8% of remaining 92% = 7.4% closer
- After 30 frames: ~92% of the way there

Creates a smooth, elastic follow without hard snapping. Lower values (0.02) = lazier camera. Higher (0.2) = snappier.

## Reference Files

- Input processing: `client/src/main.ts` lines 271-288
- Camera orbit: `client/src/main.ts` lines 316-325
- Facing force: `client/src/fish-flop.ts` lines 435-448
- Recovery torque: `client/src/fish-flop.ts` lines 450-464
