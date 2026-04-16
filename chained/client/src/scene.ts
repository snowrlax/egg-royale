/**
 * scene.ts — Three.js scene setup
 *
 * Creates the renderer, camera, lighting, and a visual ground plane.
 * Based on the existing client/src/scene.ts but simplified — no toon
 * gradient texture, no kitchen references.
 *
 * LEARNING NOTES:
 * - Three.js is the VISUAL layer. It draws things on screen but has NO physics.
 * - Rapier is the PHYSICS layer. It simulates rigid bodies but draws nothing.
 * - Every frame, we copy positions from Rapier → Three.js ("sync meshes").
 * - This file only deals with Three.js. Physics is in main.ts.
 */

import * as THREE from "three";

export type GameScene = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  dispose(): void;
};

export function createGameScene(container: HTMLElement): GameScene {
  // ── Scene ──
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb); // sky blue

  // ── Camera ──
  // PerspectiveCamera(fov, aspect, near, far)
  // fov=45: moderate field of view (wider = more fisheye)
  // near=0.1, far=200: objects outside this range are not rendered
  const camera = new THREE.PerspectiveCamera(
    45,
    container.clientWidth / container.clientHeight,
    0.1,
    200
  );
  camera.position.set(0, 8, 14);
  camera.lookAt(0, 2, 0);

  // ── Renderer ──
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  container.appendChild(renderer.domElement);

  // ── Lighting ──
  // Ambient: soft fill light everywhere (no shadows)
  const ambient = new THREE.AmbientLight(0xfff5e6, 0.5);
  scene.add(ambient);

  // Directional: the "sun" — casts shadows
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(4, 8, -3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 50;
  sun.shadow.camera.left = -20;
  sun.shadow.camera.right = 20;
  sun.shadow.camera.top = 20;
  sun.shadow.camera.bottom = -20;
  scene.add(sun);

  // Hemisphere: sky (blue) from above, ground (brown) from below
  const hemi = new THREE.HemisphereLight(0x87ceeb, 0x8b7355, 0.25);
  scene.add(hemi);

  // ── Visual Ground ──
  // This is just a visual mesh. The PHYSICS ground is a Rapier collider in main.ts.
  // They need to be aligned — both at y=0 surface.
  const groundGeo = new THREE.BoxGeometry(60, 0.3, 60);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x8b7d6b,
    roughness: 0.8,
    metalness: 0.05,
  });
  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.receiveShadow = true;
  groundMesh.position.y = -0.15; // top surface at y=0
  scene.add(groundMesh);

  // ── Resize Handler ──
  const onResize = () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  };
  window.addEventListener("resize", onResize);

  return {
    scene,
    camera,
    renderer,
    dispose() {
      window.removeEventListener("resize", onResize);
      renderer.dispose();
    },
  };
}
