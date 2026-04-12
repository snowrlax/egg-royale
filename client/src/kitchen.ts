import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// ── Tune these once you see the console log ──
const KITCHEN_SCALE = 1;
const KITCHEN_POSITION = new THREE.Vector3(0, 0, 0);

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
