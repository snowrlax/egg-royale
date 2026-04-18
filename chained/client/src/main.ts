import { createScene } from "./scene";
import { createPhysics } from "./physics";
import { createSkeleton } from "./skeleton";
import { syncBody } from "./sync";
import { createBoneViz } from "./bone-viz";

async function main() {
    const { scene, camera, renderer } = await createScene(); // async: WebGPU needs init
    const { world, RAPIER } = await createPhysics();

    const { parts, joints } = createSkeleton(world, RAPIER);

    for (const part of Object.values(parts)) {
        scene.add(part.mesh);
    }

    // Bone visualization: yellow lines + white joint spheres driven by physics
    const boneViz = createBoneViz(scene);

    let t = 0;
    let settleTimer = 0;
    const SETTLE_TIME = 0.5;

    const hipSpeed = 1.5;
    const hipAmplitude = 0.8;
    const kP = 60;  // spring: how hard it pulls back toward upright
    const kD = 15;  // damper: how hard it resists tipping velocity (stops oscillation)

    function animate() {
        requestAnimationFrame(animate);

        // PD controller — roly-poly spring
        // P term: how far the torso has tilted (angle from vertical)
        // D term: how fast it is currently tipping (angular velocity)
        // Together they make a damped harmonic oscillator — springs back without bouncing forever
        const rot = parts.torso.body.rotation();
        const angVel = parts.torso.body.angvel();

        // Local Y axis of the torso in world space (derived from quaternion)
        const ly = {
            x: 2 * (rot.x * rot.y - rot.w * rot.z),
            y: 1  - 2 * (rot.x * rot.x + rot.z * rot.z),
            z: 2  * (rot.y * rot.z + rot.w * rot.x),
        };

        // cross(worldUp, localY) = (-ly.z, 0, ly.x) — push axis back toward vertical
        parts.torso.body.applyTorqueImpulse({
            x: (-ly.z * kP - angVel.x * kD) * world.timestep,
            y: 0,
            z: ( ly.x * kP - angVel.z * kD) * world.timestep,
        }, true);

        world.step();
        settleTimer += world.timestep;

        if (settleTimer > SETTLE_TIME) {
            t += world.timestep;
            joints.hipL.configureMotorVelocity(Math.sin(t * hipSpeed) * hipAmplitude, 1.0);
            joints.hipR.configureMotorVelocity(-Math.sin(t * hipSpeed) * hipAmplitude, 1.0);
            joints.kneeL.configureMotorVelocity(Math.max(0, Math.sin(t * hipSpeed + 0.5)) * 1.0, 0.5);
            joints.kneeR.configureMotorVelocity(Math.max(0, -Math.sin(t * hipSpeed + 0.5)) * 1.0, 0.5);
        }

        for (const part of Object.values(parts)) {
            syncBody(part.mesh, part.body);
        }

        boneViz.update(parts); // sync bone lines + spheres to physics positions

        renderer.render(scene, camera);
    }

    animate();
}

main();
