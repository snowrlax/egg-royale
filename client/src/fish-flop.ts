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

// Simplified LocalFish type (cube-based, single body)
export type LocalFish = {
  id: string;
  body: RAPIER.RigidBody;
  // Compatibility shims for 3-body code paths
  head: RAPIER.RigidBody;
  tail: RAPIER.RigidBody;
  meshes: { cubeMesh: THREE.Mesh } & Partial<FishMeshes>;
  phase: FlopPhase;
  phaseTime: number;
  grounded: boolean;
  facingAngle: number;
  jumpCharge: number;
  curlSign: number;
};

// ─────────────────────────────────────────────
// CUBE MOVEMENT CONSTANTS
// ─────────────────────────────────────────────

const CUBE_MOVE_SPEED = 6.0;      // Direct velocity (not force)
const CUBE_AIR_CONTROL = 0.3;     // Air control multiplier

// Spring jump (charged jump) constants
const CUBE_JUMP_MIN_CHARGE = 0.05;   // 50ms minimum to trigger jump
const CUBE_JUMP_MAX_CHARGE = 0.5;    // 500ms max charge time
const CUBE_JUMP_BASE = 6.0;          // Minimum jump impulse (tap)
const CUBE_JUMP_BONUS = 6.0;         // Extra impulse at full charge
// Total range: 6.0 (tap) to 12.0 (full charge)

// No-op stub for model loading (cube doesn't need a model)
export async function loadFishModel(_url: string): Promise<void> {
  // No model needed for cube
}

// Cube meshes (simplified single mesh)
export function createFishMeshes(
  scene: THREE.Scene,
  gradTex: THREE.DataTexture,
  color: string = "#ff8c42"
): FishMeshes {
  // Create a simple cube mesh
  const cubeMesh = createCubeMesh(scene, gradTex, color);

  // Return compatibility shim — all mesh refs point to cube
  return {
    headMesh: cubeMesh,
    bodyMesh: cubeMesh,
    tailMesh: cubeMesh,
    eyeL: cubeMesh,
    eyeR: cubeMesh,
  };
}

function createCubeMesh(
  scene: THREE.Scene,
  gradTex: THREE.DataTexture,
  color: string = "#ff8c42"
): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(1.0, 1.0, 1.0);
  const material = new THREE.MeshToonMaterial({
    color: new THREE.Color(color),
    gradientMap: gradTex,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  scene.add(mesh);
  return mesh;
}

// ─────────────────────────────────────────────
// GROUND COLLIDER (Rapier only — no mesh)
// ─────────────────────────────────────────────

export function createGroundCollider(world: RAPIER.World): RAPIER.Collider {
  // 20x20 platform: half-extents = 10x5x10, top surface at y=0
  const desc = RAPIER.ColliderDesc.cuboid(10, 5, 10)
    .setTranslation(0, -5, 0)
    .setFriction(FLOP.GROUND_FRICTION)
    .setRestitution(FLOP.GROUND_RESTITUTION)
    .setCollisionGroups(0x00010002);
  return world.createCollider(desc);
}

/** Check if fish has fallen off the platform (below Y threshold). */
export function checkFishFallen(fish: LocalFish): boolean {
  const bodyY = fish.body.translation().y;
  return bodyY < -3;
}

// ─────────────────────────────────────────────
// LOCAL CUBE (simplified single-body physics)
// ─────────────────────────────────────────────

export function createLocalFish(
  id: string,
  world: RAPIER.World,
  scene: THREE.Scene,
  gradTex: THREE.DataTexture,
  color: string = "#ff8c42",
  spawnPos: { x: number; y: number; z: number } = { x: 0, y: 2, z: 0 }
): LocalFish {
  // Create cube mesh
  const cubeMesh = createCubeMesh(scene, gradTex, color);

  // Single rigid body for cube - high damping for tight control
  const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(spawnPos.x, spawnPos.y, spawnPos.z)
    .setLinearDamping(5.0)   // High damping to stop quickly
    .setAngularDamping(5.0)  // High angular damping
    .setCcdEnabled(true);
  const bodyRB = world.createRigidBody(bodyDesc);

  // Cuboid collider (0.5 half-extents = 1.0 unit cube)
  // Collision groups: member of group 2 (players), collides with group 1 (ground) and 2 (players)
  const collDesc = RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5)
    .setFriction(0.5)
    .setRestitution(0.1)
    .setCollisionGroups(0x00020003);
  world.createCollider(collDesc, bodyRB);

  return {
    id,
    body: bodyRB,
    // Compatibility shims — head and tail reference same body
    head: bodyRB,
    tail: bodyRB,
    meshes: {
      cubeMesh,
      // Partial FishMeshes compatibility
      headMesh: cubeMesh as unknown as THREE.Mesh,
      bodyMesh: cubeMesh as unknown as THREE.Mesh,
      tailMesh: cubeMesh as unknown as THREE.Mesh,
    },
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

// No-op stub for eye sync (cube has no eyes)
export function syncEyesToHead(
  _eyeL: THREE.Mesh,
  _eyeR: THREE.Mesh,
  _headMesh: THREE.Mesh
): void {
  // No eyes on cube
}

/** Sync all LocalFish meshes from Rapier body positions. */
export function syncFishMeshes(fish: LocalFish): void {
  // Sync cube mesh to single body
  if (fish.meshes.cubeMesh) {
    syncMeshToBody(fish.meshes.cubeMesh, fish.body);
  }
}

// ─────────────────────────────────────────────
// GROUNDED CHECK (shared with cube)
// ─────────────────────────────────────────────

function checkGrounded(bodyRB: RAPIER.RigidBody, world: RAPIER.World): boolean {
  const bpos = bodyRB.translation();
  const ray = new RAPIER.Ray(
    { x: bpos.x, y: bpos.y, z: bpos.z },
    { x: 0, y: -1, z: 0 }
  );
  // Cube half-height is 0.5, so check 0.5 + small margin
  const hit = world.castRay(
    ray,
    0.6,
    true,
    undefined,
    undefined,
    undefined,
    bodyRB
  );
  return hit !== null;
}

// ─────────────────────────────────────────────
// SIMPLIFIED CUBE UPDATE (WASD + charged jump)
// ─────────────────────────────────────────────

/** Run simplified cube physics for one frame. */
export function updateLocalFish(
  fish: LocalFish,
  world: RAPIER.World,
  dt: number,
  input: PlayerInput
): void {
  // Parse input
  let moveX = input.moveX;
  let moveY = input.moveY;
  const moveLen = Math.sqrt(moveX * moveX + moveY * moveY);
  if (moveLen > 1) {
    moveX /= moveLen;
    moveY /= moveLen;
  }
  const hasInput = moveLen > 0.1;

  fish.grounded = checkGrounded(fish.body, world);
  const v = fish.body.linvel();

  // Movement (works during charge too)
  if (hasInput) {
    // Direct velocity control - no momentum buildup
    const speed = fish.grounded ? CUBE_MOVE_SPEED : CUBE_MOVE_SPEED * CUBE_AIR_CONTROL;
    fish.body.setLinvel({ x: moveX * speed, y: v.y, z: moveY * speed }, true);
  } else if (fish.grounded) {
    // Instant stop when no input (preserve Y for gravity)
    fish.body.setLinvel({ x: 0, y: v.y, z: 0 }, true);
  }

  // Jump charging state machine
  if (fish.phase === "idle") {
    // Start charging when space pressed while grounded
    if (input.spaceDown && fish.grounded) {
      fish.phase = "jump_charge";
      fish.jumpCharge = 0;
    }
  } else if (fish.phase === "jump_charge") {
    // Accumulate charge while space held
    fish.jumpCharge = Math.min(fish.jumpCharge + dt, CUBE_JUMP_MAX_CHARGE);

    // Release jump on space release
    if (input.spaceJustReleased) {
      if (fish.jumpCharge >= CUBE_JUMP_MIN_CHARGE && fish.grounded) {
        const chargeRatio = fish.jumpCharge / CUBE_JUMP_MAX_CHARGE;
        const impulse = CUBE_JUMP_BASE + chargeRatio * CUBE_JUMP_BONUS;
        fish.body.applyImpulse({ x: 0, y: impulse, z: 0 }, true);
      }
      fish.phase = "idle";
      fish.jumpCharge = 0;
    }

    // Cancel charge if fell off platform
    if (!fish.grounded) {
      fish.phase = "idle";
      fish.jumpCharge = 0;
    }
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
  const gui = new GUI({ title: "Cube Tuning" });

  const worldFolder = gui.addFolder("World");
  worldFolder.add(FLOP, "GRAVITY", -60, 0, 0.5).name("Gravity");
  worldFolder.add(FLOP, "GROUND_FRICTION", 0, 2, 0.05).name("Ground Friction");
  worldFolder.add(FLOP, "GROUND_RESTITUTION", 0, 1, 0.05).name("Ground Bounce");

  const camFolder = gui.addFolder("Camera");
  camFolder.close();

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
  fish.body.setTranslation({ x: 0, y, z: 0 }, true);
  fish.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  fish.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  fish.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  fish.phase = "idle";
  fish.phaseTime = 0;
  fish.facingAngle = 0;
  fish.jumpCharge = 0;
  fish.curlSign = 1;
}
