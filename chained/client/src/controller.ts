import * as THREE from "three/webgpu";
import type { InputState } from "./input";

export const WALK_SPEED = 2.5;
export const RUN_SPEED = 5.5;
const TURN_SPEED = 12;
const MODEL_FACING_OFFSET = 0;

const GRAVITY = -25;          // units / sec²  (down)
const JUMP_VELOCITY = 8;      // units / sec   (up, at takeoff)
const GROUND_Y = 0;

export type ControllerState = {
    speed: number;       // horizontal speed, units/sec (0 if stopped)
    airborne: boolean;   // off the ground
};

export type Controller = {
    update: (deltaSeconds: number) => ControllerState;
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

            // ── Vertical (gravity + jump) ──
            const grounded = target.position.y <= GROUND_Y;
            if (grounded) {
                target.position.y = GROUND_Y;
                verticalVel = 0;
                // Rising edge: only on the frame Space was just pressed
                if (input.jump && !prevJump) verticalVel = JUMP_VELOCITY;
            }
            verticalVel += GRAVITY * dt;
            target.position.y += verticalVel * dt;
            prevJump = input.jump;

            return { speed, airborne: target.position.y > GROUND_Y + 0.001 };
        },
    };
}
