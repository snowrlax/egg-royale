import * as THREE from "three/webgpu";
import { createScene } from "./scene";
import { loadSteve } from "./character";

const KEY_TO_ANIMATION: Record<string, string> = {
    "1": "Idle",
    "2": "Walk",
    "3": "Run",
    "4": "Jump",
    "5": "Punch",
    "6": "Wave",
    "7": "HitReact",
    "8": "Death",
    "9": "Duck",
};

async function main() {
    const { scene, camera, renderer } = await createScene();
    camera.lookAt(0, 1, 0);

    const steve = await loadSteve();
    scene.add(steve.object);

    window.addEventListener("keydown", (e) => {
        const next = KEY_TO_ANIMATION[e.key];
        if (next) steve.play(next);
    });

    const clock = new THREE.Clock();
    function animate() {
        requestAnimationFrame(animate);
        steve.update(clock.getDelta());
        renderer.render(scene, camera);
    }
    animate();
}

main();
