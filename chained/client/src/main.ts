import * as THREE from "three/webgpu";
import { createScene } from "./scene";
import { loadSteve } from "./character";
import { createInput } from "./input";
import { createController } from "./controller";

// BombSquad-style: camera sits at a fixed offset above + behind the world,
// follows Steve's position but never rotates. Players orient by world axes.
const CAMERA_OFFSET = new THREE.Vector3(0, 6, 8);

async function main() {
    const { scene, camera, renderer } = await createScene();

    const steve = await loadSteve();
    scene.add(steve.object);

    const input = createInput();
    const controller = createController(steve.object, input);

    let wasMoving = false;
    const cameraTarget = new THREE.Vector3();

    const clock = new THREE.Clock();
    function animate() {
        requestAnimationFrame(animate);
        const dt = clock.getDelta();

        const moving = controller.update(dt);
        if (moving !== wasMoving) {
            steve.play(moving ? "Walk" : "Idle");
            wasMoving = moving;
        }
        steve.update(dt);

        // Follow camera: fixed offset, look at Steve's torso (~1 unit up)
        cameraTarget.copy(steve.object.position);
        camera.position.copy(cameraTarget).add(CAMERA_OFFSET);
        cameraTarget.y += 1;
        camera.lookAt(cameraTarget);

        renderer.render(scene, camera);
    }
    animate();
}

main();
