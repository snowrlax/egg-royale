import * as THREE from "three/webgpu";
import type { Character } from "./character";
import type { Physics } from "./physics";

export type Ragdoll = {
    update: () => void;
};

const tmpVec = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpQuat2 = new THREE.Quaternion();

// Phase B: physics drives the actual LowerArmL bone (no debug sphere).
// Loop order: animation writes bones → we read them → step physics → overwrite bone with physics result.
export function createRagdoll(physics: Physics, character: Character, _scene: THREE.Scene): Ragdoll {
    const { world, RAPIER } = physics;

    // Three.js strips dots from bone names — see character.ts log.
    const upperArmL = character.bones["UpperArmL"];
    const lowerArmL = character.bones["LowerArmL"];
    if (!upperArmL || !lowerArmL) {
        throw new Error("Required bones missing: UpperArmL, LowerArmL");
    }

    // Spawn-time world transforms (bind pose — mixer hasn't run yet).
    character.object.updateMatrixWorld(true);
    const shoulderPos = upperArmL.getWorldPosition(new THREE.Vector3());
    const upperArmQuat = upperArmL.getWorldQuaternion(new THREE.Quaternion());
    const elbowPos = lowerArmL.getWorldPosition(new THREE.Vector3());
    const lowerArmQuat = lowerArmL.getWorldQuaternion(new THREE.Quaternion());

    // ── Anchor: kinematic body matched to UpperArmL's full transform ──
    const anchorBody = world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased()
            .setTranslation(shoulderPos.x, shoulderPos.y, shoulderPos.z)
            .setRotation({ x: upperArmQuat.x, y: upperArmQuat.y, z: upperArmQuat.z, w: upperArmQuat.w })
    );

    // ── Dynamic body: rotation must match the bone's world rotation at spawn ──
    // (otherwise we get a constant offset between body and bone forever)
    const armBody = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(elbowPos.x, elbowPos.y, elbowPos.z)
            .setRotation({ x: lowerArmQuat.x, y: lowerArmQuat.y, z: lowerArmQuat.z, w: lowerArmQuat.w })
            .setLinearDamping(0.3)
            .setAngularDamping(2.0)
    );
    // Collider offset DOWN the body's local Y, putting center of mass below the joint pivot
    // → gravity creates pendulum torque around the elbow.
    world.createCollider(
        RAPIER.ColliderDesc.ball(0.08)
            .setTranslation(0, -0.25, 0)
            .setDensity(1.0),
        armBody
    );

    // ── Spherical joint at the elbow ──
    // Anchor frames are LOCAL to each body. Compute elbow offset in upperArm's local frame
    // by inverse-rotating the world delta through the upperArm's world quaternion.
    const elbowWorldDelta = elbowPos.clone().sub(shoulderPos);
    const elbowInAnchor = elbowWorldDelta.clone().applyQuaternion(upperArmQuat.clone().invert());

    world.createImpulseJoint(
        RAPIER.JointData.spherical(
            { x: elbowInAnchor.x, y: elbowInAnchor.y, z: elbowInAnchor.z },
            { x: 0, y: 0, z: 0 }
        ),
        anchorBody, armBody, true
    );

    return {
        update() {
            // 1. Refresh world matrices so we read up-to-date bone transforms (mixer just wrote)
            character.object.updateMatrixWorld(true);

            // 2. Sync kinematic anchor's full transform to UpperArmL's current world transform
            upperArmL.getWorldPosition(tmpVec);
            anchorBody.setNextKinematicTranslation({ x: tmpVec.x, y: tmpVec.y, z: tmpVec.z });
            upperArmL.getWorldQuaternion(tmpQuat);
            anchorBody.setNextKinematicRotation({ x: tmpQuat.x, y: tmpQuat.y, z: tmpQuat.z, w: tmpQuat.w });

            // 3. Step physics one tick
            world.step();

            // 4. Convert body world rotation → bone parent-local rotation, write to bone
            //    bone.quaternion = parent.worldQuat⁻¹ × body.worldQuat
            const r = armBody.rotation();
            tmpQuat.set(r.x, r.y, r.z, r.w);
            lowerArmL.parent!.getWorldQuaternion(tmpQuat2);
            lowerArmL.quaternion.copy(tmpQuat2).invert().multiply(tmpQuat);
        },
    };
}
