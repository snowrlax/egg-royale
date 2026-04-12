import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import RAPIER from "@dimforge/rapier3d/rapier.js";

// This model uses cm-scale internal units (natural height = 43.27 units ≈ 43cm model space).
// At KITCHEN_SCALE = 0.45 → kitchen is ~19.5 world-units tall.
const KITCHEN_SCALE = 0.45;

export async function loadKitchen(
  scene: THREE.Scene,
  world?: RAPIER.World
): Promise<THREE.Group> {
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
  kitchen.position.set(
    -center.x * KITCHEN_SCALE,
    -box.min.y * KITCHEN_SCALE,
    -center.z * KITCHEN_SCALE
  );
  console.log("[kitchen] model height after scale:", (size.y * KITCHEN_SCALE).toFixed(2));

  // ── Shadow pass — PBR textures load natively ──
  kitchen.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = true;
    child.receiveShadow = true;
  });

  scene.add(kitchen);

  // ── Rapier trimesh colliders (client prediction) ──
  if (world) {
    // Bake all parent transforms down so matrixWorld is correct per-mesh
    kitchen.updateMatrixWorld(true);

    const allVertices: number[] = [];
    const allIndices: number[] = [];
    let vertexOffset = 0;
    const _v = new THREE.Vector3();

    kitchen.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;

      const geom = child.geometry as THREE.BufferGeometry;
      const posAttr = geom.attributes.position;
      if (!posAttr) return;

      const mat = child.matrixWorld;
      const vCount = posAttr.count;

      // Transform each vertex into world space
      for (let i = 0; i < vCount; i++) {
        _v.fromBufferAttribute(posAttr, i).applyMatrix4(mat);
        allVertices.push(_v.x, _v.y, _v.z);
      }

      // Collect triangle indices, offset by how many vertices came before
      if (geom.index) {
        const idx = geom.index;
        for (let i = 0; i < idx.count; i++) {
          allIndices.push(idx.getX(i) + vertexOffset);
        }
      } else {
        // Non-indexed geometry — sequential indices
        for (let i = 0; i < vCount; i++) {
          allIndices.push(i + vertexOffset);
        }
      }

      vertexOffset += vCount;
    });

    const vertices = new Float32Array(allVertices);
    const indices = new Uint32Array(allIndices);

    const collDesc = RAPIER.ColliderDesc.trimesh(vertices, indices)
      .setCollisionGroups(0x00010002)  // same group as ground — fish collides with it
      .setFriction(0.6)
      .setRestitution(0.1);
    world.createCollider(collDesc);

    console.log(
      `[kitchen] trimesh collider: ${(allVertices.length / 3).toLocaleString()} vertices,`,
      `${(allIndices.length / 3).toLocaleString()} triangles`
    );
  }

  console.log("[kitchen] loaded and added to scene");
  return kitchen;
}
