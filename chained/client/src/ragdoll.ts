import * as THREE from "three/webgpu";
import type { Character } from "./character";
import type { Physics } from "./physics";

export type Ragdoll = {
    update: () => void;
};

const tmpVec = new THREE.Vector3();

// Phase A: prove the binding loop with one dangling body near the left elbow.
// No bones overridden yet — a debug sphere visualizes the physics result.
export function createRagdoll(physics: Physics, character: Character, scene: THREE.Scene): Ragdoll {
    const { world, RAPIER } = physics;

    // Note: Three.js strips dots from bone names (PropertyBinding uses "." as a separator),
    // so the GLB's "UpperArm.L" becomes "UpperArmL" at runtime.
    const upperArmL = character.bones["UpperArmL"];
    const lowerArmL = character.bones["LowerArmL"];
    if (!upperArmL || !lowerArmL) {
        throw new Error("Required bones missing: UpperArmL, LowerArmL");
    }

    // Spawn-time world positions of the shoulder (UpperArm origin) and elbow (LowerArm origin).
    character.object.updateMatrixWorld(true);
    const shoulderPos = upperArmL.getWorldPosition(new THREE.Vector3());
    const elbowPos = lowerArmL.getWorldPosition(new THREE.Vector3());

    // ── Anchor: kinematic body at the shoulder ──
    // Each frame we set its target translation to UpperArm.L's current world position.
    // Infinite mass → it never moves under forces, only under our explicit set.
    const anchorBody = world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased()
            .setTranslation(shoulderPos.x, shoulderPos.y, shoulderPos.z)
    );

    // ── Dynamic body: hangs from a spherical joint at the elbow ──
    // Body origin sits at the elbow (= joint anchor). Collider is offset DOWN from the
    // origin so the center of mass is below the pivot — gravity creates a pendulum torque.
    const armBody = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(elbowPos.x, elbowPos.y, elbowPos.z)
            .setLinearDamping(0.3)
            .setAngularDamping(2.0)
    );
    world.createCollider(
        RAPIER.ColliderDesc.ball(0.1)
            .setTranslation(0, -0.25, 0)
            .setDensity(1.0),
        armBody
    );

    // ── Spherical joint at the elbow ──
    // Anchor frames are LOCAL to each body:
    //   - On anchor body (origin = shoulder): elbow offset = elbow_world − shoulder_world
    //   - On arm body (origin = elbow):       (0, 0, 0)
    const elbowInAnchor = elbowPos.clone().sub(shoulderPos);
    world.createImpulseJoint(
        RAPIER.JointData.spherical(
            { x: elbowInAnchor.x, y: elbowInAnchor.y, z: elbowInAnchor.z },
            { x: 0, y: 0, z: 0 }
        ),
        anchorBody, armBody, true
    );

    // ── Debug visualization ──
    // Group at body's world transform; sphere child offset to where the collider is.
    // depthTest=false so we can see it through Steve's body.
    const debugAnchor = new THREE.Object3D();
    const debugSphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 12, 8),
        new THREE.MeshBasicNodeMaterial({ color: 0xff3333 })
    );
    debugSphere.position.set(0, -0.25, 0);
    debugSphere.renderOrder = 999;
    debugSphere.material.depthTest = false;
    debugAnchor.add(debugSphere);
    scene.add(debugAnchor);

    return {
        update() {
            // 1. Sync kinematic anchor to UpperArm.L's current world position
            character.object.updateMatrixWorld(true);
            upperArmL.getWorldPosition(tmpVec);
            anchorBody.setNextKinematicTranslation({ x: tmpVec.x, y: tmpVec.y, z: tmpVec.z });

            // 2. Step physics one tick (~1/60s default)
            world.step();

            // 3. Visualize body transform — sphere swings below the body origin
            const t = armBody.translation();
            const r = armBody.rotation();
            debugAnchor.position.set(t.x, t.y, t.z);
            debugAnchor.quaternion.set(r.x, r.y, r.z, r.w);
        },
    };
}
