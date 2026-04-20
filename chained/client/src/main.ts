import * as THREE from "three/webgpu";
import { createScene } from "./scene";
import { loadSteve } from "./character";
import { createInput } from "./input";
import { createController, WALK_SPEED, RUN_SPEED } from "./controller";
import { createPhysics } from "./physics";
import { PLAYER_SPAWN } from "./arena";

const CAMERA_OFFSET = new THREE.Vector3(0, 6, 8);

function pickAnimation(speed: number, airborne: boolean): { name: string; timeScale: number } {
    if (airborne) return { name: "Jump_Idle", timeScale: 1 };
    if (speed === 0) return { name: "Idle", timeScale: 1 };
    if (speed <= WALK_SPEED + 0.01) return { name: "Walk", timeScale: speed / WALK_SPEED };
    return { name: "Run", timeScale: speed / RUN_SPEED };
}

async function main() {
    const { scene, camera, renderer } = await createScene();

    // Physics world is the source of truth for the platform collider.
    // Not stepped this phase — reserved for Phase 2 (pushing / ragdoll).
    await createPhysics();

    const steve = await loadSteve();
    steve.object.position.copy(PLAYER_SPAWN);
    scene.add(steve.object);

    const input = createInput();
    const controller = createController(steve.object, input);

    let currentName = "Idle";
    const cameraTarget = new THREE.Vector3();

    const clock = new THREE.Clock();
    function animate() {
        requestAnimationFrame(animate);
        const dt = clock.getDelta();

        const state = controller.update(dt);
        if (state.fallen) controller.respawn(PLAYER_SPAWN);

        const { name, timeScale } = pickAnimation(state.speed, state.airborne);

        if (name !== currentName) {
            steve.play(name);
            currentName = name;
        }
        steve.actions[name].timeScale = timeScale;

        steve.update(dt);

        cameraTarget.copy(steve.object.position);
        camera.position.copy(cameraTarget).add(CAMERA_OFFSET);
        cameraTarget.y += 1;
        camera.lookAt(cameraTarget);

        renderer.render(scene, camera);
    }
    animate();
}

main();
