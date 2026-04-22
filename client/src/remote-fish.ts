/**
 * Remote fish with kinematic Rapier colliders for collision detection.
 * Receives FishState from server and interpolates between tick-ordered states.
 * Buffer size adapts to network conditions based on measured ping + jitter.
 */

import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d/rapier.js";
import type { FishState, BodySnapshot } from "@fish-jam/shared";
import { createFishMeshes, syncEyesToHead, type FishMeshes } from "./fish-flop.js";
import { createTickBuffer, type TickBuffer } from "./net/tick-buffer.js";
import type { NetworkStats } from "./net/network-stats.js";

export type RemoteFish = {
  id: string;
  color: string;
  meshes: FishMeshes;
  body: RAPIER.RigidBody;      // Kinematic body for collision
  collider: RAPIER.Collider;   // Collider attached to body
  tickBuffer: TickBuffer;
  lastServerTick: number;      // Track latest received tick for sync
};

export function createRemoteFish(
  initialState: FishState,
  initialTick: number,
  scene: THREE.Scene,
  gradTex: THREE.DataTexture,
  world: RAPIER.World
): RemoteFish {
  const meshes = createFishMeshes(scene, gradTex, initialState.color);

  // Snap to initial position
  applyStateToMeshes(meshes, initialState);

  // Create kinematic body (moved by code, not physics simulation)
  const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
    .setTranslation(
      initialState.body.pos[0],
      initialState.body.pos[1],
      initialState.body.pos[2]
    );
  const body = world.createRigidBody(bodyDesc);

  // Add collider (same size as local player cube: 0.5 half-extents)
  // Collision groups: member of group 2 (players), collides with group 1 (ground) and 2 (players)
  const colliderDesc = RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5)
    .setCollisionGroups(0x00020003);
  const collider = world.createCollider(colliderDesc, body);

  // Create tick buffer and insert initial state
  const tickBuffer = createTickBuffer();
  tickBuffer.insert(initialTick, initialState);

  return {
    id: initialState.id,
    color: initialState.color,
    meshes,
    body,
    collider,
    tickBuffer,
    lastServerTick: initialTick,
  };
}

export function updateRemoteFishState(
  fish: RemoteFish,
  tick: number,
  newState: FishState
): void {
  fish.tickBuffer.insert(tick, newState);
  if (tick > fish.lastServerTick) {
    fish.lastServerTick = tick;
  }
}

export function interpolateRemoteFish(
  fish: RemoteFish,
  networkStats: NetworkStats
): void {
  // Calculate render tick based on latest server tick minus buffer delay
  const bufferDelay = networkStats.getTargetBufferTicks();
  const renderTick = fish.lastServerTick - bufferDelay;

  const data = fish.tickBuffer.getInterpolationData(renderTick);
  if (!data) {
    // No data available - keep current position
    return;
  }

  // Warn on large gaps (potential packet loss)
  if (data.gapTicks > 2) {
    console.warn(
      `[INTERP] ${fish.id.slice(-8)} gap=${data.gapTicks} ticks, extrapolating=${data.isExtrapolating}`
    );
  }

  // If only one state or same state, snap directly
  if (data.state0 === data.state1 || data.t === 0) {
    applyStateToMeshes(fish.meshes, data.state0);
    syncKinematicBody(fish);
    return;
  }

  // Lerp position, slerp rotation
  lerpBodySnapshot(fish.meshes.headMesh, data.state0.head, data.state1.head, data.t);
  lerpBodySnapshot(fish.meshes.bodyMesh, data.state0.body, data.state1.body, data.t);
  lerpBodySnapshot(fish.meshes.tailMesh, data.state0.tail, data.state1.tail, data.t);
  syncEyesToHead(fish.meshes.eyeL, fish.meshes.eyeR, fish.meshes.headMesh);
  syncKinematicBody(fish);
}

export function disposeRemoteFish(
  fish: RemoteFish,
  scene: THREE.Scene,
  world: RAPIER.World
): void {
  // Clean up physics
  world.removeCollider(fish.collider, true);
  world.removeRigidBody(fish.body);

  // Clean up meshes
  scene.remove(fish.meshes.headMesh);
  scene.remove(fish.meshes.bodyMesh);
  scene.remove(fish.meshes.tailMesh);
  scene.remove(fish.meshes.eyeL);
  scene.remove(fish.meshes.eyeR);
}

// ── Internal helpers ──

/**
 * Sync kinematic body position to match the visual mesh.
 * Must be called after every mesh update to keep collisions aligned.
 */
function syncKinematicBody(fish: RemoteFish): void {
  fish.body.setNextKinematicTranslation({
    x: fish.meshes.bodyMesh.position.x,
    y: fish.meshes.bodyMesh.position.y,
    z: fish.meshes.bodyMesh.position.z,
  });
}

function applyStateToMeshes(meshes: FishMeshes, state: FishState): void {
  setMeshFromSnapshot(meshes.headMesh, state.head);
  setMeshFromSnapshot(meshes.bodyMesh, state.body);
  setMeshFromSnapshot(meshes.tailMesh, state.tail);
  syncEyesToHead(meshes.eyeL, meshes.eyeR, meshes.headMesh);
}

function setMeshFromSnapshot(mesh: THREE.Mesh, snap: BodySnapshot): void {
  mesh.position.set(snap.pos[0], snap.pos[1], snap.pos[2]);
  mesh.quaternion.set(snap.rot[0], snap.rot[1], snap.rot[2], snap.rot[3]);
}

const _v0 = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _q0 = new THREE.Quaternion();
const _q1 = new THREE.Quaternion();

function lerpBodySnapshot(
  mesh: THREE.Mesh,
  prev: BodySnapshot,
  curr: BodySnapshot,
  t: number
): void {
  _v0.set(prev.pos[0], prev.pos[1], prev.pos[2]);
  _v1.set(curr.pos[0], curr.pos[1], curr.pos[2]);
  mesh.position.lerpVectors(_v0, _v1, t);

  _q0.set(prev.rot[0], prev.rot[1], prev.rot[2], prev.rot[3]);
  _q1.set(curr.rot[0], curr.rot[1], curr.rot[2], curr.rot[3]);
  mesh.quaternion.slerpQuaternions(_q0, _q1, t);
}
