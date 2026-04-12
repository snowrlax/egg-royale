import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// Natural size: 7.17 × 2.99 × 6.58  |  center: (-0.18, 1.49, 2.22)
// Scale guide:
//   1.5 → fish is medium-sized relative to kitchen
//   2.5 → fish feels small (counter height ~1.8 × fish)
//   3.5 → fish feels miniscule (counter height ~2.5 × fish)  ← try this
//   5.0 → fish is an ant in a giant kitchen
const KITCHEN_SCALE = 4.5;

// Position re-centers the model at world origin — update if you change scale:
// formula: x = 0.18 × scale,  z = -2.22 × scale
const KITCHEN_POSITION = new THREE.Vector3(
  0.18 * KITCHEN_SCALE,
  0,
  -2.22 * KITCHEN_SCALE
);

export async function loadKitchen(scene: THREE.Scene): Promise<THREE.Group> {
  const loader = new GLTFLoader();
  const url = new URL("../models/kitchen.glb", import.meta.url).href;

  const gltf = await loader.loadAsync(url);
  const kitchen = gltf.scene;

  // ── Step 1: measure the model's natural size before scaling ──
  const box = new THREE.Box3().setFromObject(kitchen);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  console.log("[kitchen] natural size (w/h/d):", size.x.toFixed(2), size.y.toFixed(2), size.z.toFixed(2));
  console.log("[kitchen] natural center:", center.x.toFixed(2), center.y.toFixed(2), center.z.toFixed(2));

  // ── Step 2: scale + position (tune KITCHEN_SCALE after seeing the log) ──
  kitchen.scale.setScalar(KITCHEN_SCALE);
  kitchen.position.copy(KITCHEN_POSITION);

  // ── Step 3: enable shadows on every mesh ──
  kitchen.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  scene.add(kitchen);
  console.log("[kitchen] loaded and added to scene");

  return kitchen;
}
