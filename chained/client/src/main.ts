import * as THREE from "three/webgpu";
import { createScene } from "./scene";
import { loadSteve } from "./character";
import { createInput } from "./input";
import { createController, WALK_SPEED, RUN_SPEED } from "./controller";
import { createPhysics } from "./physics";
import { createRagdoll } from "./ragdoll";

const CAMERA_OFFSET = new THREE.Vector3(0, 6, 8);

// State machine: gameplay state (speed + airborne) → which animation + how fast
function pickAnimation(speed: number, airborne: boolean): { name: string; timeScale: number } {
    if (airborne) return { name: "Jump_Idle", timeScale: 1 };
    if (speed === 0) return { name: "Idle", timeScale: 1 };
    if (speed <= WALK_SPEED + 0.01) return { name: "Walk", timeScale: speed / WALK_SPEED };
    return { name: "Run", timeScale: speed / RUN_SPEED };
}

async function main() {
    const { scene, camera, renderer } = await createScene();
    const physics = await createPhysics();

    const steve = await loadSteve();
    scene.add(steve.object);

    const input = createInput();
    const controller = createController(steve.object, input);
    const ragdoll = createRagdoll(physics, steve, scene);

    let currentName = "Idle";
    const cameraTarget = new THREE.Vector3();

    const clock = new THREE.Clock();
    function animate() {
        requestAnimationFrame(animate);
        // Cap dt at 1/30s. When the tab is backgrounded, requestAnimationFrame pauses;
        // the next frame's dt would otherwise be the full pause duration (seconds → minutes),
        // sending gravity & physics into a giant single-step explosion.
        const dt = Math.min(clock.getDelta(), 1 / 30);

        const { speed, airborne } = controller.update(dt);
        const { name, timeScale } = pickAnimation(speed, airborne);

        if (name !== currentName) {
            steve.play(name);
            currentName = name;
        }
        steve.actions[name].timeScale = timeScale;

        steve.update(dt);  // animation writes bones
        ragdoll.update();  // physics steps + debug viz updates

        cameraTarget.copy(steve.object.position);
        camera.position.copy(cameraTarget).add(CAMERA_OFFSET);
        cameraTarget.y += 1;
        camera.lookAt(cameraTarget);

        renderer.render(scene, camera);
    }
    animate();
}

main();
