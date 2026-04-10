/**
 * Visual-only remote fish — no Rapier physics.
 * Receives FishState from server and interpolates between buffered states.
 * Renders 2 ticks behind (~66ms at 30Hz) for smooth motion.
 */

import * as THREE from "three";
import type { FishState, BodySnapshot } from "@fish-jam/shared";
import { createFishMeshes, syncEyesToHead, type FishMeshes } from "./fish-flop.js";

const TICK_MS = 1000 / 30;
const BUFFER_SIZE = 5;
const RENDER_DELAY_TICKS = 2;
const MAX_EXTRAPOLATION = 1.5;

type BufferedState = {
  state: FishState;
  receivedAt: number;
};

export type RemoteFish = {
  id: string;
  color: string;
  meshes: FishMeshes;
  stateBuffer: BufferedState[];
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
    stateBuffer: [{ state: initialState, receivedAt: performance.now() }],
  };
}

export function updateRemoteFishState(
  fish: RemoteFish,
  newState: FishState
): void {
  fish.stateBuffer.push({ state: newState, receivedAt: performance.now() });
  if (fish.stateBuffer.length > BUFFER_SIZE) {
    fish.stateBuffer.shift();
  }
}

export function interpolateRemoteFish(
  fish: RemoteFish,
  now: number
): void {
  const buf = fish.stateBuffer;
  if (buf.length === 0) return;

  // Only one state — snap directly
  if (buf.length === 1) {
    applyStateToMeshes(fish.meshes, buf[0].state);
    return;
  }

  // Render 2 ticks behind latest received time for smooth interpolation
  const renderTime = now - TICK_MS * RENDER_DELAY_TICKS;

  // If renderTime is before all entries, snap to oldest
  if (renderTime <= buf[0].receivedAt) {
    applyStateToMeshes(fish.meshes, buf[0].state);
    return;
  }

  // Find two states that bracket renderTime
  let i0 = 0;
  for (let i = 0; i < buf.length - 1; i++) {
    if (buf[i + 1].receivedAt > renderTime) {
      i0 = i;
      break;
    }
    i0 = i;
  }
  const i1 = Math.min(i0 + 1, buf.length - 1);

  if (i0 === i1) {
    applyStateToMeshes(fish.meshes, buf[i0].state);
    return;
  }

  const t0 = buf[i0].receivedAt;
  const t1 = buf[i1].receivedAt;
  const span = t1 - t0;

  if (span <= 0) {
    applyStateToMeshes(fish.meshes, buf[i1].state);
    return;
  }

  // Allow slight extrapolation (up to 1.5x) but cap it
  const alpha = Math.min((renderTime - t0) / span, MAX_EXTRAPOLATION);

  lerpBodySnapshot(fish.meshes.headMesh, buf[i0].state.head, buf[i1].state.head, alpha);
  lerpBodySnapshot(fish.meshes.bodyMesh, buf[i0].state.body, buf[i1].state.body, alpha);
  lerpBodySnapshot(fish.meshes.tailMesh, buf[i0].state.tail, buf[i1].state.tail, alpha);
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
