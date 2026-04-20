import * as THREE from "three/webgpu";
import type { InputState } from "./input";
import {
    PLATFORM_TOP_Y,
    FALL_THRESHOLD,
    isOverPlatform,
} from "./arena";

export const WALK_SPEED = 2.5;
export const RUN_SPEED = 5.5;
const TURN_SPEED = 12;
const MODEL_FACING_OFFSET = 0;

const GRAVITY = -25;          // units / sec²  (down)
const JUMP_VELOCITY = 8;      // units / sec   (up, at takeoff)

export type ControllerState = {
    speed: number;       // horizontal speed, units/sec (0 if stopped)
    airborne: boolean;   // off the ground (not on the platform right now)
    fallen: boolean;     // dropped far enough below the platform to count as KO'd
};

export type Controller = {
    update: (deltaSeconds: number) => ControllerState;
    respawn: (spawn: THREE.Vector3) => void;
};

export function createController(target: THREE.Object3D, input: InputState): Controller {
    const moveDir = new THREE.Vector3();
    const targetQuat = new THREE.Quaternion();
    const upAxis = new THREE.Vector3(0, 1, 0);

    let verticalVel = 0;
    let prevJump = false;     // for rising-edge detection (jump fires once per press)

    return {
        update(dt) {
            // ── Horizontal movement ──
            moveDir.set(
                (input.right ? 1 : 0) - (input.left ? 1 : 0),
                0,
                (input.down ? 1 : 0) - (input.up ? 1 : 0)
            );

            let speed = 0;
            if (moveDir.lengthSq() > 0) {
                speed = input.sprint ? RUN_SPEED : WALK_SPEED;
                moveDir.normalize();
                target.position.addScaledVector(moveDir, speed * dt);

                const angle = Math.atan2(moveDir.x, moveDir.z) + MODEL_FACING_OFFSET;
                targetQuat.setFromAxisAngle(upAxis, angle);
                target.quaternion.slerp(targetQuat, Math.min(1, TURN_SPEED * dt));
            }

            // ── Vertical (gravity + jump, gated by being over the platform) ──
            const overPlatform = isOverPlatform(target.position.x, target.position.z);
            const grounded = overPlatform && target.position.y <= PLATFORM_TOP_Y;
            if (grounded) {
                target.position.y = PLATFORM_TOP_Y;
                verticalVel = 0;
                if (input.jump && !prevJump) verticalVel = JUMP_VELOCITY;
            }
            verticalVel += GRAVITY * dt;
            target.position.y += verticalVel * dt;
            prevJump = input.jump;

            const airborne = !grounded;
            const fallen = target.position.y < PLATFORM_TOP_Y - FALL_THRESHOLD;

            return { speed, airborne, fallen };
        },
        respawn(spawn) {
            target.position.copy(spawn);
            target.quaternion.identity();
            verticalVel = 0;
            prevJump = false;
        },
    };
}
