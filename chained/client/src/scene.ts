import * as THREE from "three/webgpu";
import {
    PLATFORM_HALF_X,
    PLATFORM_HALF_Y,
    PLATFORM_HALF_Z,
    PLATFORM_CENTER_Y,
} from "./arena";

export async function createScene() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0f);

    const camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        200
    );
    camera.position.set(0, 3, 6);

    const renderer = new THREE.WebGPURenderer({ antialias: true });
    await renderer.init();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById("app")?.appendChild(renderer.domElement);

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(5, 10, 5);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xffffff, 0.25));

    const platform = new THREE.Mesh(
        new THREE.BoxGeometry(
            PLATFORM_HALF_X * 2,
            PLATFORM_HALF_Y * 2,
            PLATFORM_HALF_Z * 2
        ),
        new THREE.MeshStandardNodeMaterial({ color: 0xb58a4a })
    );
    platform.position.y = PLATFORM_CENTER_Y;
    scene.add(platform);

    return { scene, camera, renderer };
}
