import * as THREE from "three";

export type GameScene = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  gradientTexture: THREE.DataTexture;
  dispose(): void;
};

export function createGameScene(container: HTMLElement): GameScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a1f);
  scene.fog = new THREE.Fog(0x1a1a1f, 25, 55);

  const camera = new THREE.PerspectiveCamera(
    45,
    container.clientWidth / container.clientHeight,
    0.1,
    100
  );
  camera.position.set(0, 10, 16);
  camera.lookAt(0, 2, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;   // less aggressive than ACES for indoor scenes
  renderer.toneMappingExposure = 1.8;                // brighten overall exposure
  container.appendChild(renderer.domElement);

  // Lighting
  const ambient = new THREE.AmbientLight(0xfff5e6, 2.5);  // much brighter base fill
  scene.add(ambient);

  // Key light (above, front-right)
  const sun = new THREE.DirectionalLight(0xfff0dd, 2.0);
  sun.position.set(6, 12, -5);

  // Fill light (opposite side — stops surfaces going pitch black)
  const fill = new THREE.DirectionalLight(0xddeeff, 0.8);
  fill.position.set(-8, 6, 8);
  scene.add(fill);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 40;
  sun.shadow.camera.left = -12;
  sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 12;
  sun.shadow.camera.bottom = -12;
  scene.add(sun);

  const hemi = new THREE.HemisphereLight(0x87ceeb, 0x8b7355, 0.25);
  scene.add(hemi);

  // Toon gradient texture
  const gradientTexture = new THREE.DataTexture(
    new Uint8Array([60, 130, 200, 255]),
    4,
    1,
    THREE.RedFormat
  );
  gradientTexture.minFilter = THREE.NearestFilter;
  gradientTexture.magFilter = THREE.NearestFilter;
  gradientTexture.needsUpdate = true;

  // Temporary floor — will be replaced visually by the kitchen GLB
  // Keep this so fish don't fall through before the model loads
  const groundGeo = new THREE.BoxGeometry(30, 0.3, 30);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a2a,
    roughness: 0.9,
    metalness: 0.0,
  });
  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  // Resize
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
    gradientTexture,
    dispose() {
      window.removeEventListener("resize", onResize);
      renderer.dispose();
    },
  };
}
