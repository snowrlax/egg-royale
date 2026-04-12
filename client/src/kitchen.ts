import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// This model uses cm-scale internal units (natural height = 43.27 units ≈ 43cm model space).
// At KITCHEN_SCALE = 0.08 → kitchen is ~3.5 world-units tall (counter at ~3u, fish at ~0.3u).
// Tune upward if you want the fish to feel even more miniscule.
const KITCHEN_SCALE = 0.45;

export async function loadKitchen(scene: THREE.Scene): Promise<THREE.Group> {
  const loader = new GLTFLoader();
  const url = new URL("../models/kitchen/scene.gltf", import.meta.url).href;

  const gltf = await loader.loadAsync(url);
  const kitchen = gltf.scene;

  // ── Measure the model's natural size ──
  const box = new THREE.Box3().setFromObject(kitchen);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  console.log("[kitchen] natural size (w/h/d):", size.x.toFixed(2), size.y.toFixed(2), size.z.toFixed(2));
  console.log("[kitchen] natural center:", center.x.toFixed(2), center.y.toFixed(2), center.z.toFixed(2));

  // ── Scale + re-center at world origin ──
  kitchen.scale.setScalar(KITCHEN_SCALE);
  // Offset so:
  //   • XZ center is at (0, 0)
  //   • The bottom of the model (box.min.y) lands exactly at y = 0
  kitchen.position.set(
    -center.x * KITCHEN_SCALE,
    -box.min.y * KITCHEN_SCALE,
    -center.z * KITCHEN_SCALE
  );
  console.log("[kitchen] model height after scale:", (size.y * KITCHEN_SCALE).toFixed(2));
  console.log("[kitchen] position applied:", kitchen.position);

  // ── Shadow pass only — PBR textures load natively, no material override ──
  kitchen.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = true;
    child.receiveShadow = true;
  });

  scene.add(kitchen);
  console.log("[kitchen] loaded and added to scene");

  return kitchen;
}
