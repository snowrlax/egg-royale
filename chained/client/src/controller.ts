import * as THREE from "three/webgpu";
import type { InputState } from "./input";

const WALK_SPEED = 2.5;   // units per second
const TURN_SPEED = 12;    // higher = snappier facing change

// If Steve walks backward (faces away from movement), flip this to Math.PI
const MODEL_FACING_OFFSET = 0;

export type Controller = {
    update: (deltaSeconds: number) => boolean; // true if currently moving
};

export function createController(target: THREE.Object3D, input: InputState): Controller {
    const moveDir = new THREE.Vector3();
    const targetQuat = new THREE.Quaternion();
    const upAxis = new THREE.Vector3(0, 1, 0);

    return {
        update(dt) {
            // Camera looks down -Z. So on screen: up=-Z, down=+Z, right=+X, left=-X.
            moveDir.set(
                (input.right ? 1 : 0) - (input.left ? 1 : 0),
                0,
                (input.down ? 1 : 0) - (input.up ? 1 : 0)
            );

            const moving = moveDir.lengthSq() > 0;
            if (!moving) return false;

            moveDir.normalize();
            target.position.addScaledVector(moveDir, WALK_SPEED * dt);

            const angle = Math.atan2(moveDir.x, moveDir.z) + MODEL_FACING_OFFSET;
            targetQuat.setFromAxisAngle(upAxis, angle);
            target.quaternion.slerp(targetQuat, Math.min(1, TURN_SPEED * dt));
            return true;
        },
    };
}
