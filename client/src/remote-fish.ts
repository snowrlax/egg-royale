/**
 * Visual-only remote fish — no Rapier physics.
 * Receives FishState from server and interpolates between states for smooth rendering.
 */

import * as THREE from "three";
import type { FishState, BodySnapshot } from "@fish-jam/shared";
import { createFishMeshes, syncEyesToHead, type FishMeshes } from "./fish-flop.js";

const INTERP_DURATION_MS = 1000 / 30; // match server tick rate

export type RemoteFish = {
  id: string;
  color: string;
  meshes: FishMeshes;
  prevState: FishState | null;
  currState: FishState;
  stateTimestamp: number;
};

export function createRemoteFish(
  initialState: FishState,
  scene: THREE.Scene,
  gradTex: THREE.DataTexture
): RemoteFish {
  const meshes = createFishMeshes(scene, gradTex, initialState.color);

  // Snap to initial position
  applyStateToMeshes(meshes, initialState);

  return {
    id: initialState.id,
    color: initialState.color,
    meshes,
    prevState: null,
    currState: initialState,
    stateTimestamp: performance.now(),
  };
}

export function updateRemoteFishState(
  fish: RemoteFish,
  newState: FishState
): void {
  fish.prevState = fish.currState;
  fish.currState = newState;
  fish.stateTimestamp = performance.now();
}

export function interpolateRemoteFish(
  fish: RemoteFish,
  now: number
): void {
  if (!fish.prevState) {
    // No previous state — snap directly
    applyStateToMeshes(fish.meshes, fish.currState);
    return;
  }

  const elapsed = now - fish.stateTimestamp;
  const t = Math.min(elapsed / INTERP_DURATION_MS, 1);

  lerpBodySnapshot(fish.meshes.headMesh, fish.prevState.head, fish.currState.head, t);
  lerpBodySnapshot(fish.meshes.bodyMesh, fish.prevState.body, fish.currState.body, t);
  lerpBodySnapshot(fish.meshes.tailMesh, fish.prevState.tail, fish.currState.tail, t);
  syncEyesToHead(fish.meshes.eyeL, fish.meshes.eyeR, fish.meshes.headMesh);
}

export function disposeRemoteFish(
  fish: RemoteFish,
  scene: THREE.Scene
): void {
  scene.remove(fish.meshes.headMesh);
  scene.remove(fish.meshes.bodyMesh);
  scene.remove(fish.meshes.tailMesh);
  scene.remove(fish.meshes.eyeL);
  scene.remove(fish.meshes.eyeR);
}

// ── Internal helpers ──

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
