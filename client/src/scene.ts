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
  scene.background = new THREE.Color(0xf0ece4);

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
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  container.appendChild(renderer.domElement);



  // Lighting — original values
  const ambient = new THREE.AmbientLight(0xfff5e6, 0.5);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(4, 8, -3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 40;
  sun.shadow.camera.left = -15;
  sun.shadow.camera.right = 15;
  sun.shadow.camera.top = 15;
  sun.shadow.camera.bottom = -15;
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

  // Temporary floor — kitchen GLB loads async on top of this
  const groundGeo = new THREE.BoxGeometry(60, 0.3, 60);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x8b7d6b,
    roughness: 0.8,
    metalness: 0.05,
  });
  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.receiveShadow = true;
  // Sink below y=0 so Rapier's contact-skin overlap is hidden under the surface
  groundMesh.position.y = -0.3;
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
