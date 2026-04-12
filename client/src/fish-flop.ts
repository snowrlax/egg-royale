/**
 * fish-flop.ts — Fish ragdoll physics (Rapier3D + Three.js)
 *
 * Exports reusable pieces for both standalone sandbox and multiplayer:
 * - createFishMeshes()   — Three.js meshes only (used by local + remote fish)
 * - createLocalFish()    — Rapier bodies + meshes (local player)
 * - createGroundCollider() — Rapier ground (no mesh)
 * - updateLocalFish()    — flop state machine
 * - syncFishMeshes()     — copy Rapier → Three.js
 * - syncEyesToHead()     — position eyes relative to head mesh
 * - initFlopSandbox()    — standalone sandbox (composes the above)
 */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import RAPIER from "@dimforge/rapier3d/rapier.js";
import GUI from "lil-gui";
import { FLOP, type FlopPhase, type PlayerInput } from "@fish-jam/shared";

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export type FishMeshes = {
  headMesh: THREE.Mesh;
  bodyMesh: THREE.Mesh;
  tailMesh: THREE.Mesh;
  eyeL: THREE.Mesh;
  eyeR: THREE.Mesh;
};

export type LocalFish = {
  id: string;
  head: RAPIER.RigidBody;
  body: RAPIER.RigidBody;
  tail: RAPIER.RigidBody;
  headJoint: RAPIER.ImpulseJoint;
  tailJoint: RAPIER.ImpulseJoint;
  meshes: FishMeshes;
  phase: FlopPhase;
  phaseTime: number;
  grounded: boolean;
  facingAngle: number;
  jumpCharge: number;
  curlSign: number;
};

// ─────────────────────────────────────────────
// GLB MODEL LOADER
// ─────────────────────────────────────────────

let _fishModel: {
  headGeo: THREE.BufferGeometry;
  bodyGeo: THREE.BufferGeometry;
  tailGeo: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
} | null = null;

export async function loadFishModel(url: string): Promise<void> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);

  let headGeo: THREE.BufferGeometry | undefined;
  let bodyGeo: THREE.BufferGeometry | undefined;
  let tailGeo: THREE.BufferGeometry | undefined;
  let material: THREE.MeshStandardMaterial | undefined;

  gltf.scene.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    const name = mesh.name.replace(/[\s_]+$/, "").toLowerCase();

    // Bake node rotation into geometry (Blender Z-up → glTF Y-up)
    const rotMat = new THREE.Matrix4().makeRotationFromQuaternion(mesh.quaternion);
    mesh.geometry.applyMatrix4(rotMat);

    // Center geometry at origin — vertices are in scene-space, not node-local
    mesh.geometry.computeBoundingBox();
    const center = new THREE.Vector3();
    mesh.geometry.boundingBox!.getCenter(center);
    mesh.geometry.translate(-center.x, -center.y, -center.z);

    // Mirror facing direction (model faces +Z, game expects -Z)
    mesh.geometry.rotateY(Math.PI);

    if (name === "head") {
      mesh.geometry.translate(0, 0, -0.2);
      headGeo = mesh.geometry;
    } else if (name === "body") bodyGeo = mesh.geometry;
    else if (name === "tail") tailGeo = mesh.geometry;

    if (!material) {
      const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (mat instanceof THREE.MeshStandardMaterial) material = mat;
    }
  });

  if (!headGeo || !bodyGeo || !tailGeo || !material) {
    throw new Error("Fish GLB missing head, body, or tail mesh");
  }

  _fishModel = { headGeo, bodyGeo, tailGeo, material };
}

// ─────────────────────────────────────────────
// FISH MESHES (Three.js only — no Rapier)
// ─────────────────────────────────────────────

export function createFishMeshes(
  scene: THREE.Scene,
  gradTex: THREE.DataTexture,
  color: string = "#ff8c42"
): FishMeshes {
  const parsedColor = new THREE.Color(color);
  const headColor = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.2);

  let headMesh: THREE.Mesh;
  let bodyMesh: THREE.Mesh;
  let tailMesh: THREE.Mesh;

  if (_fishModel) {
    // GLB model path — clone material per fish for color tinting
    const bodyMat = _fishModel.material.clone();
    bodyMat.color.set(parsedColor);
    const headMat = _fishModel.material.clone();
    headMat.color.set(headColor);

    headMesh = new THREE.Mesh(_fishModel.headGeo, headMat);
    bodyMesh = new THREE.Mesh(_fishModel.bodyGeo, bodyMat);
    tailMesh = new THREE.Mesh(_fishModel.tailGeo, bodyMat);
  } else {
    // Procedural fallback (sandbox / model not loaded)
    const bodyMat = new THREE.MeshToonMaterial({
      color: parsedColor,
      gradientMap: gradTex,
    });
    const headMat = new THREE.MeshToonMaterial({
      color: headColor,
      gradientMap: gradTex,
    });

    const headGeo = new THREE.SphereGeometry(FLOP.HEAD_RADIUS, 12, 8);
    headMesh = new THREE.Mesh(headGeo, headMat);
    headMesh.scale.set(0.7, 1.0, 1.0);

    const bodyGeo = new THREE.CapsuleGeometry(
      FLOP.BODY_RADIUS,
      FLOP.BODY_HALF_HEIGHT * 2,
      8,
      12
    );
    bodyGeo.rotateX(Math.PI / 2);
    bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.scale.set(0.65, 1.1, 1.0);

    const tailGeo = new THREE.ConeGeometry(0.22, 0.45, 4);
    tailGeo.rotateX(-Math.PI / 2);
    tailGeo.rotateY(Math.PI / 4);
    tailMesh = new THREE.Mesh(tailGeo, bodyMat);
    tailMesh.scale.set(0.5, 1.3, 1.0);
  }

  headMesh.castShadow = true;
  bodyMesh.castShadow = true;
  tailMesh.castShadow = true;
  scene.add(headMesh);
  scene.add(bodyMesh);
  scene.add(tailMesh);

  // Eyes (procedural — hidden when using GLB model)
  const eyeWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const eyePupil = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const eyeGeo = new THREE.SphereGeometry(0.06, 8, 6);
  const pupilGeo = new THREE.SphereGeometry(0.035, 8, 6);

  const eyeL = new THREE.Mesh(eyeGeo, eyeWhite);
  eyeL.add(new THREE.Mesh(pupilGeo, eyePupil).translateZ(-0.03));
  scene.add(eyeL);

  const eyeR = new THREE.Mesh(eyeGeo, eyeWhite);
  eyeR.add(new THREE.Mesh(pupilGeo, eyePupil).translateZ(-0.03));
  scene.add(eyeR);

  if (_fishModel) {
    eyeL.visible = false;
    eyeR.visible = false;
  }

  return { headMesh, bodyMesh, tailMesh, eyeL, eyeR };
}

// ─────────────────────────────────────────────
// GROUND COLLIDER (Rapier only — no mesh)
// ─────────────────────────────────────────────

export function createGroundCollider(world: RAPIER.World): RAPIER.Collider {
  // Half-height 5 → slab is 10 units thick, top surface sits at y=0.
  // Thick slab prevents high-impulse fish from tunnelling through a thin plane.
  const desc = RAPIER.ColliderDesc.cuboid(30, 5, 30)
    .setTranslation(0, -5, 0)
    .setFriction(FLOP.GROUND_FRICTION)
    .setRestitution(FLOP.GROUND_RESTITUTION)
    .setCollisionGroups(0x00010002);
  const ground = world.createCollider(desc);

  // Edge walls removed — kitchen model provides natural boundaries.
  // Counter/shelf colliders will be added separately.

  return ground;
}

// ─────────────────────────────────────────────
// LOCAL FISH (Rapier + Three.js)
// ─────────────────────────────────────────────

export function createLocalFish(
  id: string,
  world: RAPIER.World,
  scene: THREE.Scene,
  gradTex: THREE.DataTexture,
  color: string = "#ff8c42",
  spawnPos: { x: number; y: number; z: number } = { x: 0, y: 2, z: 0 }
): LocalFish {
  const meshes = createFishMeshes(scene, gradTex, color);

  // HEAD rigid body
  const headDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(spawnPos.x, spawnPos.y, spawnPos.z - 0.55)
    .setLinearDamping(FLOP.LINEAR_DAMPING)
    .setAngularDamping(FLOP.ANGULAR_DAMPING)
    .setCcdEnabled(true);
  const headRB = world.createRigidBody(headDesc);
  const headCollDesc = RAPIER.ColliderDesc.ball(FLOP.HEAD_RADIUS)
    .setDensity(FLOP.HEAD_MASS / ((4 / 3) * Math.PI * FLOP.HEAD_RADIUS ** 3))
    .setFriction(FLOP.FISH_FRICTION)
    .setRestitution(FLOP.FISH_RESTITUTION)
    .setCollisionGroups(0x00020001);
  world.createCollider(headCollDesc, headRB);

  // BODY rigid body
  const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(spawnPos.x, spawnPos.y, spawnPos.z)
    .setLinearDamping(FLOP.LINEAR_DAMPING)
    .setAngularDamping(FLOP.ANGULAR_DAMPING)
    .setCcdEnabled(true);
  const bodyRB = world.createRigidBody(bodyDesc);
  const bodyVol =
    Math.PI *
    FLOP.BODY_RADIUS ** 2 *
    (2 * FLOP.BODY_HALF_HEIGHT + (4 / 3) * FLOP.BODY_RADIUS);
  const bodyCollDesc = RAPIER.ColliderDesc.capsule(
    FLOP.BODY_HALF_HEIGHT,
    FLOP.BODY_RADIUS
  )
    .setDensity(FLOP.BODY_MASS / bodyVol)
    .setFriction(FLOP.FISH_FRICTION)
    .setRestitution(FLOP.FISH_RESTITUTION)
    .setCollisionGroups(0x00020001);
  world.createCollider(bodyCollDesc, bodyRB);

  // TAIL rigid body
  const tailDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(spawnPos.x, spawnPos.y, spawnPos.z + 0.55)
    .setLinearDamping(FLOP.LINEAR_DAMPING)
    .setAngularDamping(FLOP.ANGULAR_DAMPING)
    .setCcdEnabled(true);
  const tailRB = world.createRigidBody(tailDesc);
  const tailCollDesc = RAPIER.ColliderDesc.ball(FLOP.TAIL_RADIUS)
    .setDensity(FLOP.TAIL_MASS / ((4 / 3) * Math.PI * FLOP.TAIL_RADIUS ** 3))
    .setFriction(FLOP.FISH_FRICTION)
    .setRestitution(FLOP.FISH_RESTITUTION)
    .setCollisionGroups(0x00020001);
  world.createCollider(tailCollDesc, tailRB);

  // JOINTS — Y axis (horizontal lateral bend)
  const headJointData = RAPIER.JointData.revolute(
    { x: 0, y: 0, z: 0.2 },
    { x: 0, y: 0, z: -0.35 },
    { x: 0, y: 1, z: 0 }
  );
  const headJoint = world.createImpulseJoint(
    headJointData,
    headRB,
    bodyRB,
    true
  );
  (headJoint as RAPIER.RevoluteImpulseJoint).setLimits(
    -FLOP.JOINT_LIMIT,
    FLOP.JOINT_LIMIT
  );

  const tailJointData = RAPIER.JointData.revolute(
    { x: 0, y: 0, z: 0.35 },
    { x: 0, y: 0, z: -0.15 },
    { x: 0, y: 1, z: 0 }
  );
  const tailJoint = world.createImpulseJoint(
    tailJointData,
    bodyRB,
    tailRB,
    true
  );
  (tailJoint as RAPIER.RevoluteImpulseJoint).setLimits(
    -FLOP.JOINT_LIMIT,
    FLOP.JOINT_LIMIT
  );

  setMotor(headJoint, 0, FLOP.AIR_STIFFNESS, FLOP.AIR_DAMPING);
  setMotor(tailJoint, 0, FLOP.AIR_STIFFNESS, FLOP.AIR_DAMPING);

  return {
    id,
    head: headRB,
    body: bodyRB,
    tail: tailRB,
    headJoint,
    tailJoint,
    meshes,
    phase: "idle",
    phaseTime: 0,
    grounded: false,
    facingAngle: 0,
    jumpCharge: 0,
    curlSign: 1,
  };
}

// ─────────────────────────────────────────────
// SYNC MESHES
// ─────────────────────────────────────────────

function syncMeshToBody(mesh: THREE.Mesh, rb: RAPIER.RigidBody): void {
  const p = rb.translation();
  const r = rb.rotation();
  mesh.position.set(p.x, p.y, p.z);
  mesh.quaternion.set(r.x, r.y, r.z, r.w);
}

/** Position eyes relative to head mesh using local frame offsets. */
export function syncEyesToHead(
  eyeL: THREE.Mesh,
  eyeR: THREE.Mesh,
  headMesh: THREE.Mesh
): void {
  const headQ = headMesh.quaternion;
  const base = headMesh.position;
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(headQ);
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(headQ);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(headQ);

  eyeL.position
    .copy(base)
    .add(right.clone().multiplyScalar(-0.12))
    .add(fwd.clone().multiplyScalar(0.12))
    .add(up.clone().multiplyScalar(0.08));
  eyeL.quaternion.copy(headQ);

  eyeR.position
    .copy(base)
    .add(right.clone().multiplyScalar(0.12))
    .add(fwd.clone().multiplyScalar(0.12))
    .add(up.clone().multiplyScalar(0.08));
  eyeR.quaternion.copy(headQ);
}

/** Sync all LocalFish meshes from Rapier body positions. */
export function syncFishMeshes(fish: LocalFish): void {
  syncMeshToBody(fish.meshes.headMesh, fish.head);
  syncMeshToBody(fish.meshes.bodyMesh, fish.body);
  syncMeshToBody(fish.meshes.tailMesh, fish.tail);
  syncEyesToHead(fish.meshes.eyeL, fish.meshes.eyeR, fish.meshes.headMesh);
}

// ─────────────────────────────────────────────
// STATE MACHINE
// ─────────────────────────────────────────────

function setMotor(
  joint: RAPIER.ImpulseJoint,
  target: number,
  stiffness: number,
  damping: number
): void {
  (joint as RAPIER.RevoluteImpulseJoint).configureMotorPosition(
    target,
    stiffness,
    damping
  );
}

function checkGrounded(bodyRB: RAPIER.RigidBody, world: RAPIER.World): boolean {
  const bpos = bodyRB.translation();
  const ray = new RAPIER.Ray(
    { x: bpos.x, y: bpos.y, z: bpos.z },
    { x: 0, y: -1, z: 0 }
  );
  const hit = world.castRay(
    ray,
    FLOP.BODY_RADIUS + FLOP.GROUND_RAY_LENGTH,
    true,
    undefined,
    undefined,
    undefined,
    bodyRB
  );
  return hit !== null;
}

function clampVelocity(rb: RAPIER.RigidBody, max: number): void {
  const v = rb.linvel();
  const hSpeed = Math.sqrt(v.x ** 2 + v.z ** 2);
  if (hSpeed > max) {
    const s = max / hSpeed;
    rb.setLinvel({ x: v.x * s, y: v.y, z: v.z * s }, true);
  }
}

// Multiplies horizontal (XZ) velocity by `factor` each tick to bring the fish to a stop.
// Hard-zeros once speed drops below the deadzone threshold — prevents tiny residual
// velocity from being amplified by a jump impulse mid-air.
const BRAKE_DEADZONE = 0.05;
function brakeHorizontal(fish: LocalFish, factor: number): void {
  for (const rb of [fish.body, fish.head, fish.tail]) {
    const v = rb.linvel();
    const nx = v.x * factor;
    const nz = v.z * factor;
    const speed = Math.sqrt(nx * nx + nz * nz);
    rb.setLinvel(
      { x: speed < BRAKE_DEADZONE ? 0 : nx, y: v.y, z: speed < BRAKE_DEADZONE ? 0 : nz },
      true
    );
  }
}

function applyFacingForce(fish: LocalFish, dt: number): void {
  const rot = fish.body.rotation();
  const q = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
  const euler = new THREE.Euler().setFromQuaternion(q, "YXZ");

  let diff = fish.facingAngle - euler.y;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;

  const yAngVel = fish.body.angvel().y;
  const torqueY =
    (diff * FLOP.FACING_TORQUE - yAngVel * FLOP.FACING_DAMPING) * dt;
  fish.body.applyTorqueImpulse({ x: 0, y: torqueY, z: 0 }, true);
}

function applyRecoveryTorque(fish: LocalFish): void {
  const rot = fish.body.rotation();
  const q = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
  const bodyUp = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  const worldUp = new THREE.Vector3(0, 1, 0);

  const cross = new THREE.Vector3().crossVectors(bodyUp, worldUp);
  const dot = bodyUp.dot(worldUp);
  const strength = FLOP.RECOVERY_TORQUE * (1 - dot);

  fish.body.applyTorqueImpulse(
    { x: cross.x * strength * 0.01, y: 0, z: cross.z * strength * 0.01 },
    true
  );
}

function applyVerticalDynamics(fish: LocalFish, dt: number): void {
  const phase = fish.phase;

  if (phase === "idle") {
    const breathe = Math.sin(fish.phaseTime * 3) * 0.3;
    fish.head.applyTorqueImpulse({ x: breathe * dt, y: 0, z: 0 }, true);
    fish.tail.applyTorqueImpulse(
      { x: -breathe * dt * 0.5, y: 0, z: 0 },
      true
    );
  }
  if (phase === "curl") {
    fish.head.applyTorqueImpulse({ x: -1.5 * dt, y: 0, z: 0 }, true);
    fish.tail.applyTorqueImpulse({ x: 0.8 * dt, y: 0, z: 0 }, true);
  }
  if (phase === "snap") {
    fish.head.applyTorqueImpulse({ x: 2.0 * dt, y: 0, z: 0 }, true);
    fish.tail.applyTorqueImpulse({ x: -3.0 * dt, y: 0, z: 0 }, true);
  }
  if (phase === "airborne") {
    const flutter = Math.sin(fish.phaseTime * 18) * 1.2;
    fish.tail.applyTorqueImpulse({ x: flutter * dt, y: 0, z: 0 }, true);
    fish.head.applyTorqueImpulse({ x: 0.5 * dt, y: 0, z: 0 }, true);
  }
  if (phase === "land") {
    const impact = Math.max(0, 1 - fish.phaseTime * 20);
    fish.head.applyTorqueImpulse(
      { x: 3.0 * impact * dt, y: 0, z: 0 },
      true
    );
    fish.tail.applyTorqueImpulse(
      { x: -2.0 * impact * dt, y: 0, z: 0 },
      true
    );
  }
  if (phase === "jump_charge") {
    const chargeT = fish.jumpCharge / FLOP.JUMP_MAX_CHARGE;
    fish.head.applyTorqueImpulse(
      { x: 2.0 * chargeT * dt, y: 0, z: 0 },
      true
    );
    fish.tail.applyTorqueImpulse(
      { x: 1.5 * chargeT * dt, y: 0, z: 0 },
      true
    );
  }
  if (phase === "jump_snap") {
    fish.head.applyTorqueImpulse({ x: -4.0 * dt, y: 0, z: 0 }, true);
    fish.tail.applyTorqueImpulse({ x: 2.0 * dt, y: 0, z: 0 }, true);
  }
}

/** Run the flop state machine for one frame. */
export function updateLocalFish(
  fish: LocalFish,
  world: RAPIER.World,
  dt: number,
  input: PlayerInput
): void {
  // Set move direction from input
  let moveX = input.moveX;
  let moveY = input.moveY;
  const moveLen = Math.sqrt(moveX * moveX + moveY * moveY);
  if (moveLen > 1) {
    moveX /= moveLen;
    moveY /= moveLen;
  }
  const hasInput = moveLen > 0.1;
  const spaceDown = input.spaceDown;
  const spaceJustReleased = input.spaceJustReleased;

  fish.phaseTime += dt;
  fish.grounded = checkGrounded(fish.body, world);

  if (fish.grounded && fish.phase !== "snap" && fish.phase !== "jump_snap") {
    applyRecoveryTorque(fish);
  }

  if (hasInput && fish.grounded) {
    applyFacingForce(fish, dt);
  }

  clampVelocity(fish.body, FLOP.MAX_VELOCITY);
  clampVelocity(fish.head, FLOP.MAX_VELOCITY * 1.2);
  clampVelocity(fish.tail, FLOP.MAX_VELOCITY * 1.2);

  const s = fish.curlSign;
  applyVerticalDynamics(fish, dt);

  switch (fish.phase) {
    case "idle":
      setMotor(fish.headJoint, 0, FLOP.AIR_STIFFNESS, FLOP.AIR_DAMPING);
      setMotor(fish.tailJoint, 0, FLOP.AIR_STIFFNESS, FLOP.AIR_DAMPING);
      if (hasInput && fish.grounded) {
        fish.facingAngle = Math.atan2(moveX, moveY);
        fish.phase = "curl";
        fish.phaseTime = 0;
      } else if (spaceDown && fish.grounded) {
        fish.phase = "jump_charge";
        fish.phaseTime = 0;
        fish.jumpCharge = 0;
      } else if (!hasInput && fish.grounded) {
        // Brake: kills horizontal sliding when no key is held, factor 0.8 → stops in ~10 frames
        brakeHorizontal(fish, 0.8);
      }
      break;

    case "curl":
      setMotor(
        fish.headJoint,
        s * FLOP.CURL_HEAD_ANGLE,
        FLOP.CURL_STIFFNESS,
        FLOP.CURL_DAMPING
      );
      setMotor(
        fish.tailJoint,
        -s * FLOP.CURL_TAIL_ANGLE,
        FLOP.CURL_STIFFNESS,
        FLOP.CURL_DAMPING
      );
      if (hasInput) {
        fish.facingAngle = Math.atan2(moveX, moveY);
      }
      if (fish.phaseTime >= FLOP.CURL_DURATION) {
        fish.phase = "snap";
        fish.phaseTime = 0;
      }
      break;

    case "snap":
      setMotor(
        fish.headJoint,
        s * FLOP.SNAP_HEAD_ANGLE,
        FLOP.SNAP_STIFFNESS,
        FLOP.SNAP_DAMPING
      );
      setMotor(
        fish.tailJoint,
        -s * FLOP.SNAP_TAIL_ANGLE,
        FLOP.SNAP_STIFFNESS,
        FLOP.SNAP_DAMPING
      );
      if (fish.phaseTime < dt * 1.5) {
        // Zero horizontal velocity on all bodies before launching so residual
        // sliding speed can't bleed into the flop direction mid-air
        for (const rb of [fish.body, fish.head, fish.tail]) {
          const v = rb.linvel();
          rb.setLinvel({ x: 0, y: v.y, z: 0 }, true);
        }
        const fx = Math.sin(fish.facingAngle) * FLOP.MOVE_FORCE;
        const fz = Math.cos(fish.facingAngle) * FLOP.MOVE_FORCE;
        fish.body.applyImpulse({ x: fx, y: FLOP.LAUNCH_UP, z: fz }, true);
        fish.tail.applyImpulse({ x: 0, y: -FLOP.TAIL_SLAP_DOWN, z: 0 }, true);
      }
      if (fish.phaseTime >= FLOP.SNAP_DURATION) {
        fish.curlSign *= -1;
        fish.phase = "airborne";
        fish.phaseTime = 0;
      }
      break;

    case "airborne":
      setMotor(fish.headJoint, 0, FLOP.AIR_STIFFNESS, FLOP.AIR_DAMPING);
      setMotor(fish.tailJoint, 0, FLOP.AIR_STIFFNESS, FLOP.AIR_DAMPING);
      if (hasInput) {
        const fx = moveX * FLOP.MOVE_FORCE * FLOP.AIR_CONTROL;
        const fz = moveY * FLOP.MOVE_FORCE * FLOP.AIR_CONTROL;
        fish.body.addForce({ x: fx, y: 0, z: fz }, true);
      }
      if (fish.grounded && fish.phaseTime > 0.1) {
        fish.phase = "land";
        fish.phaseTime = 0;
      }
      break;

    case "land":
      setMotor(fish.headJoint, 0, FLOP.CURL_STIFFNESS, FLOP.CURL_DAMPING);
      setMotor(fish.tailJoint, 0, FLOP.CURL_STIFFNESS, FLOP.CURL_DAMPING);
      if (fish.phaseTime >= FLOP.LAND_COOLDOWN) {
        if (spaceDown) {
          fish.phase = "jump_charge";
          fish.phaseTime = 0;
          fish.jumpCharge = 0;
        } else if (hasInput) {
          fish.facingAngle = Math.atan2(moveX, moveY);
          fish.phase = "curl";
          fish.phaseTime = 0;
        } else {
          fish.phase = "idle";
          fish.phaseTime = 0;
        }
      }
      break;

    case "jump_charge": {
      fish.jumpCharge = Math.min(fish.jumpCharge + dt, FLOP.JUMP_MAX_CHARGE);
      const chargeT = fish.jumpCharge / FLOP.JUMP_MAX_CHARGE;
      const coilAmt = chargeT * FLOP.JUMP_CHARGE_COIL;
      setMotor(
        fish.headJoint,
        -s * coilAmt,
        FLOP.CURL_STIFFNESS,
        FLOP.CURL_DAMPING
      );
      setMotor(
        fish.tailJoint,
        s * coilAmt,
        FLOP.CURL_STIFFNESS,
        FLOP.CURL_DAMPING
      );
      if (hasInput) {
        fish.facingAngle = Math.atan2(moveX, moveY);
        applyFacingForce(fish, dt);
      }
      if (spaceJustReleased) {
        if (fish.jumpCharge >= FLOP.JUMP_MIN_CHARGE) {
          fish.phase = "jump_snap";
          fish.phaseTime = 0;
        } else {
          fish.phase = "idle";
          fish.phaseTime = 0;
        }
      }
      if (!fish.grounded) {
        fish.phase = "airborne";
        fish.phaseTime = 0;
      }
      break;
    }

    case "jump_snap":
      setMotor(
        fish.headJoint,
        0,
        FLOP.JUMP_SNAP_STIFFNESS,
        FLOP.SNAP_DAMPING
      );
      setMotor(
        fish.tailJoint,
        0,
        FLOP.JUMP_SNAP_STIFFNESS,
        FLOP.SNAP_DAMPING
      );
      if (fish.phaseTime < dt * 1.5) {
        const ct = Math.min(fish.jumpCharge / FLOP.JUMP_MAX_CHARGE, 1);
        const upImpulse = FLOP.JUMP_BASE_IMPULSE + ct * FLOP.JUMP_CHARGE_BONUS;
        let fx = 0,
          fz = 0;
        if (hasInput) {
          fx = Math.sin(fish.facingAngle) * FLOP.MOVE_FORCE * 0.4;
          fz = Math.cos(fish.facingAngle) * FLOP.MOVE_FORCE * 0.4;
        }
        // Zero all velocities before jump
        fish.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        fish.head.setLinvel({ x: 0, y: 0, z: 0 }, true);
        fish.tail.setLinvel({ x: 0, y: 0, z: 0 }, true);
        fish.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        fish.head.setAngvel({ x: 0, y: 0, z: 0 }, true);
        fish.tail.setAngvel({ x: 0, y: 0, z: 0 }, true);

        fish.body.applyImpulse({ x: fx, y: upImpulse, z: fz }, true);
        fish.head.applyImpulse({ x: 0, y: upImpulse * 0.6, z: 0 }, true);
        fish.tail.applyImpulse({ x: 0, y: upImpulse * 0.2, z: 0 }, true);

        fish.curlSign *= -1;
      }
      if (fish.phaseTime >= FLOP.JUMP_SNAP_DURATION) {
        fish.phase = "airborne";
        fish.phaseTime = 0;
      }
      break;
  }
}

// ─────────────────────────────────────────────
// STANDALONE SANDBOX (convenience wrapper)
// ─────────────────────────────────────────────

export async function initFlopSandbox(container: HTMLElement) {
  const { createGameScene } = await import("./scene.js");

  const gameScene = createGameScene(container);
  const world = new RAPIER.World({ x: 0, y: FLOP.GRAVITY, z: 0 });
  const groundCollider = createGroundCollider(world);
  const fish = createLocalFish(
    "sandbox",
    world,
    gameScene.scene,
    gameScene.gradientTexture
  );

  // Input
  const keys = new Set<string>();
  let spaceDown = false;
  let spaceJustReleased = false;
  let inputSeq = 0;

  window.addEventListener("keydown", (e) => {
    keys.add(e.key.toLowerCase());
    if (e.key === " " && !spaceDown) spaceDown = true;
  });
  window.addEventListener("keyup", (e) => {
    keys.delete(e.key.toLowerCase());
    if (e.key === " ") {
      spaceDown = false;
      spaceJustReleased = true;
    }
  });

  container.style.position = "relative";

  // ── Tweaking GUI ──
  const gui = new GUI({ title: "Fish Tuning" });

  const worldFolder = gui.addFolder("World");
  worldFolder.add(FLOP, "GRAVITY", -60, 0, 0.5).name("Gravity");
  worldFolder.add(FLOP, "GROUND_FRICTION", 0, 2, 0.05).name("Ground Friction");
  worldFolder.add(FLOP, "GROUND_RESTITUTION", 0, 1, 0.05).name("Ground Bounce");

  const moveFolder = gui.addFolder("Movement");
  moveFolder.add(FLOP, "MOVE_FORCE", 1, 30, 0.5).name("Move Force");
  moveFolder.add(FLOP, "LAUNCH_UP", 0, 20, 0.5).name("Launch Up");
  moveFolder.add(FLOP, "TAIL_SLAP_DOWN", 0, 15, 0.5).name("Tail Slap Down");
  moveFolder.add(FLOP, "MAX_VELOCITY", 1, 25, 0.5).name("Max Velocity");
  moveFolder.add(FLOP, "AIR_CONTROL", 0, 1, 0.05).name("Air Control");

  const flopFolder = gui.addFolder("Flop Cycle");
  flopFolder.add(FLOP, "CURL_DURATION", 0.02, 0.5, 0.01).name("Curl Duration");
  flopFolder.add(FLOP, "CURL_STIFFNESS", 10, 500, 5).name("Curl Stiffness");
  flopFolder.add(FLOP, "SNAP_STIFFNESS", 100, 3000, 50).name("Snap Stiffness");
  flopFolder.add(FLOP, "SNAP_DURATION", 0.02, 0.3, 0.01).name("Snap Duration");

  const jumpFolder = gui.addFolder("Jump");
  jumpFolder.add(FLOP, "JUMP_BASE_IMPULSE", 5, 40, 0.5).name("Base Impulse");
  jumpFolder.add(FLOP, "JUMP_CHARGE_BONUS", 0, 25, 0.5).name("Charge Bonus");
  jumpFolder.add(FLOP, "JUMP_MAX_CHARGE", 0.1, 2, 0.05).name("Max Charge Time");
  jumpFolder.add(FLOP, "JUMP_SNAP_STIFFNESS", 100, 2000, 50).name("Snap Stiffness");

  const steerFolder = gui.addFolder("Steering");
  steerFolder.add(FLOP, "RECOVERY_TORQUE", 1, 50, 1).name("Recovery Torque");
  steerFolder.add(FLOP, "FACING_TORQUE", 1, 40, 1).name("Facing Torque");
  steerFolder.add(FLOP, "FACING_DAMPING", 1, 20, 0.5).name("Facing Damping");

  // Game loop — step physics every frame for smooth visuals
  const clock = new THREE.Clock();

  function tick() {
    const dt = Math.min(clock.getDelta(), 0.05);

    let moveX = 0;
    let moveY = 0;
    if (keys.has("a") || keys.has("arrowleft")) moveX = -1;
    if (keys.has("d") || keys.has("arrowright")) moveX = 1;
    if (keys.has("w") || keys.has("arrowup")) moveY = -1;
    if (keys.has("s") || keys.has("arrowdown")) moveY = 1;
    const len = Math.sqrt(moveX * moveX + moveY * moveY);
    if (len > 0) {
      moveX /= len;
      moveY /= len;
    }

    const input: PlayerInput = {
      seq: inputSeq++,
      moveX,
      moveY,
      spaceDown,
      spaceJustReleased,
    };

    world.gravity = { x: 0, y: FLOP.GRAVITY, z: 0 };
    updateLocalFish(fish, world, dt, input);
    groundCollider.setFriction(FLOP.GROUND_FRICTION);
    groundCollider.setRestitution(FLOP.GROUND_RESTITUTION);
    world.timestep = dt;
    world.step();
    spaceJustReleased = false;

    syncFishMeshes(fish);

    if (keys.has("r")) {
      resetLocalFish(fish);
      keys.delete("r");
    }

    gameScene.renderer.render(gameScene.scene, gameScene.camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function resetLocalFish(fish: LocalFish): void {
  const y = 2;
  const bodies = [
    { rb: fish.body, z: 0 },
    { rb: fish.head, z: -0.55 },
    { rb: fish.tail, z: 0.55 },
  ];
  for (const { rb, z } of bodies) {
    rb.setTranslation({ x: 0, y, z }, true);
    rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
    rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
    rb.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  }
  fish.phase = "idle";
  fish.phaseTime = 0;
  fish.facingAngle = 0;
  fish.jumpCharge = 0;
  fish.curlSign = 1;
}
