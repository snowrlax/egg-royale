import * as THREE from "three/webgpu";

// Platform is a single floating box. Top surface at y=0 so characters spawn at y=0.
export const PLATFORM_HALF_X = 5;
export const PLATFORM_HALF_Z = 3;
export const PLATFORM_HALF_Y = 0.4;
export const PLATFORM_TOP_Y = 0;
export const PLATFORM_CENTER_Y = PLATFORM_TOP_Y - PLATFORM_HALF_Y;

// Drop this far below the top before we count the character as "fallen".
export const FALL_THRESHOLD = 10;

// Spawn points (top-surface y). Player spawns left, dummy spawns right (Phase 2).
export const PLAYER_SPAWN = new THREE.Vector3(-2, PLATFORM_TOP_Y, 0);
export const DUMMY_SPAWN = new THREE.Vector3(2, PLATFORM_TOP_Y, 0);

export function isOverPlatform(x: number, z: number): boolean {
    return Math.abs(x) <= PLATFORM_HALF_X && Math.abs(z) <= PLATFORM_HALF_Z;
}
