import * as THREE from "three/webgpu";
import { MeshBasicNodeMaterial } from "three/webgpu";
import type { Character } from "./character";
import type { Physics } from "./physics";
import type RAPIER from "@dimforge/rapier3d";

export type Ragdoll = {
    update: () => void;
};

// ── Types for bone/joint tree structure ──
type JointConfig = {
    type: "spherical" | "revolute";
    limits?: { min: number; max: number };      // For revolute
    coneAngle?: number;                          // For spherical (radians)
    hingeAxis?: THREE.Vector3;                   // For revolute
};

type RagdollNode = {
    boneName: string;
    bone: THREE.Bone;
    body: RAPIER.RigidBody;
    joint: RAPIER.ImpulseJoint | null;           // null for kinematic root
    jointConfig: JointConfig | null;
    colliderOffset: THREE.Vector3;               // Along bone direction
    density: number;
    children: RagdollNode[];
};

type RagdollTree = {
    root: RagdollNode;                           // Kinematic anchor (Torso)
    nodeMap: Map<string, RagdollNode>;           // Quick lookup by bone name
};

// Helper function to create debug visualization spheres
function createDebugSphere(color: number, radius = 0.05): THREE.Mesh {
    const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 8, 6),
        new MeshBasicNodeMaterial({ color })
    );
    mesh.renderOrder = 999;
    mesh.material.depthTest = false; // Always visible through character
    return mesh;
}

const tmpVec = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpQuat2 = new THREE.Quaternion();

// Phase B: physics drives the arm bones with shoulder + elbow joints.
// Tree structure: Torso (kinematic) → UpperArmL (dynamic, spherical) → LowerArmL (dynamic, revolute)
// Loop order: animation writes bones → we read them → step physics → overwrite bones with physics result.
export function createRagdoll(physics: Physics, character: Character, scene: THREE.Scene): Ragdoll {
    const { world, RAPIER } = physics;

    // Three.js strips dots from bone names — see character.ts log.
    const torso = character.bones["Torso"];
    const upperArmL = character.bones["UpperArmL"];
    const lowerArmL = character.bones["LowerArmL"];
    if (!torso || !upperArmL || !lowerArmL) {
        throw new Error("Required bones missing: Torso, UpperArmL, LowerArmL");
    }

    // Spawn-time world transforms (bind pose — mixer hasn't run yet).
    character.object.updateMatrixWorld(true);
    const torsoPos = torso.getWorldPosition(new THREE.Vector3());
    const torsoQuat = torso.getWorldQuaternion(new THREE.Quaternion());
    const shoulderPos = upperArmL.getWorldPosition(new THREE.Vector3());
    const upperArmQuat = upperArmL.getWorldQuaternion(new THREE.Quaternion());
    const elbowPos = lowerArmL.getWorldPosition(new THREE.Vector3());
    const lowerArmQuat = lowerArmL.getWorldQuaternion(new THREE.Quaternion());

    // ── DEBUG: Visualize bone axes ──
    const axesHelperUpper = new THREE.AxesHelper(0.3);
    upperArmL.add(axesHelperUpper);
    const axesHelperLower = new THREE.AxesHelper(0.3);
    lowerArmL.add(axesHelperLower);

    // DEBUG: Log which direction each axis points in world space
    const localX = new THREE.Vector3(1, 0, 0).applyQuaternion(lowerArmQuat);
    const localY = new THREE.Vector3(0, 1, 0).applyQuaternion(lowerArmQuat);
    const localZ = new THREE.Vector3(0, 0, 1).applyQuaternion(lowerArmQuat);
    console.log("LowerArmL axes in world space:");
    console.log("  +X:", localX.x.toFixed(2), localX.y.toFixed(2), localX.z.toFixed(2));
    console.log("  +Y:", localY.x.toFixed(2), localY.y.toFixed(2), localY.z.toFixed(2));
    console.log("  +Z:", localZ.x.toFixed(2), localZ.y.toFixed(2), localZ.z.toFixed(2));

    // Also log the direction from elbow to shoulder (the "up" direction for the arm)
    const armDirection = shoulderPos.clone().sub(elbowPos).normalize();
    console.log("Arm direction (elbow→shoulder):", armDirection.x.toFixed(2), armDirection.y.toFixed(2), armDirection.z.toFixed(2));

    // ══════════════════════════════════════════════════════════════════════════
    // BODY 1: Torso Anchor (kinematic) - follows animation
    // ══════════════════════════════════════════════════════════════════════════
    const torsoAnchor = world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased()
            .setTranslation(torsoPos.x, torsoPos.y, torsoPos.z)
            .setRotation({ x: torsoQuat.x, y: torsoQuat.y, z: torsoQuat.z, w: torsoQuat.w })
    );

    // ══════════════════════════════════════════════════════════════════════════
    // BODY 2: Upper Arm (dynamic) - connected to torso via spherical joint
    // ══════════════════════════════════════════════════════════════════════════
    const upperArmBody = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(shoulderPos.x, shoulderPos.y, shoulderPos.z)
            .setRotation({ x: upperArmQuat.x, y: upperArmQuat.y, z: upperArmQuat.z, w: upperArmQuat.w })
            .setLinearDamping(0.3)
            .setAngularDamping(2.0)
    );
    // Collider offset along +Y axis (toward elbow), heavier than forearm
    world.createCollider(
        RAPIER.ColliderDesc.ball(0.1)
            .setTranslation(0, 0.15, 0)
            .setDensity(1.5),
        upperArmBody
    );

    // ══════════════════════════════════════════════════════════════════════════
    // BODY 3: Lower Arm (dynamic) - connected to upper arm via revolute joint
    // ══════════════════════════════════════════════════════════════════════════
    const lowerArmBody = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(elbowPos.x, elbowPos.y, elbowPos.z)
            .setRotation({ x: lowerArmQuat.x, y: lowerArmQuat.y, z: lowerArmQuat.z, w: lowerArmQuat.w })
            .setLinearDamping(0.3)
            .setAngularDamping(2.0)
    );
    // Collider offset along +Y axis (toward the hand), lighter than upper arm
    world.createCollider(
        RAPIER.ColliderDesc.ball(0.08)
            .setTranslation(0, 0.25, 0)
            .setDensity(1.0),
        lowerArmBody
    );

    // ══════════════════════════════════════════════════════════════════════════
    // JOINT 1: Shoulder (spherical) - torsoAnchor → upperArmBody
    // ══════════════════════════════════════════════════════════════════════════
    // Compute shoulder offset in torso's local frame
    const shoulderWorldDelta = shoulderPos.clone().sub(torsoPos);
    const shoulderInTorso = shoulderWorldDelta.clone().applyQuaternion(torsoQuat.clone().invert());

    const shoulderJointData = RAPIER.JointData.spherical(
        { x: shoulderInTorso.x, y: shoulderInTorso.y, z: shoulderInTorso.z },
        { x: 0, y: 0, z: 0 }
    );

    const shoulderJoint = world.createImpulseJoint(shoulderJointData, torsoAnchor, upperArmBody, true);
    console.log("Shoulder joint created - spherical (ball-and-socket)");

    // ══════════════════════════════════════════════════════════════════════════
    // JOINT 2: Elbow (revolute/hinge) - upperArmBody → lowerArmBody
    // ══════════════════════════════════════════════════════════════════════════
    // Compute elbow offset in upperArm's local frame
    const elbowWorldDelta = elbowPos.clone().sub(shoulderPos);
    const elbowInUpperArm = elbowWorldDelta.clone().applyQuaternion(upperArmQuat.clone().invert());

    // The hinge axis for the elbow - perpendicular to the arm direction.
    // Using local -X axis as the hinge axis (elbow bends forward/backward like a real elbow).
    // Rapier's revolute() takes a single axis that's shared between both frames.
    const hingeAxisLocal = new THREE.Vector3(-1, 0, 0);

    console.log("Hinge axis (local):", hingeAxisLocal.x.toFixed(2), hingeAxisLocal.y.toFixed(2), hingeAxisLocal.z.toFixed(2));

    // Create revolute joint - API: revolute(anchor1, anchor2, axis)
    const elbowJointData = RAPIER.JointData.revolute(
        { x: elbowInUpperArm.x, y: elbowInUpperArm.y, z: elbowInUpperArm.z },
        { x: 0, y: 0, z: 0 },
        { x: hingeAxisLocal.x, y: hingeAxisLocal.y, z: hingeAxisLocal.z }
    );

    const elbowJoint = world.createImpulseJoint(elbowJointData, upperArmBody, lowerArmBody, true);

    // Limit elbow to 180 degrees of motion (-90° to +90° from neutral)
    // Access the revolute-specific methods
    if ("setLimits" in elbowJoint) {
        (elbowJoint as { setLimits: (min: number, max: number) => void }).setLimits(-Math.PI / 2, Math.PI / 2);
    }
    console.log("Elbow joint created - revolute (hinge) with ±90° limits");

    // ══════════════════════════════════════════════════════════════════════════
    // Build the RagdollTree structure for documentation/debugging
    // ══════════════════════════════════════════════════════════════════════════
    const nodeMap = new Map<string, RagdollNode>();

    const lowerArmNode: RagdollNode = {
        boneName: "LowerArmL",
        bone: lowerArmL,
        body: lowerArmBody,
        joint: elbowJoint,
        jointConfig: { type: "revolute", limits: { min: -Math.PI/2, max: Math.PI/2 }, hingeAxis: new THREE.Vector3(-1, 0, 0) },
        colliderOffset: new THREE.Vector3(0, 0.25, 0),
        density: 1.0,
        children: []
    };

    const upperArmNode: RagdollNode = {
        boneName: "UpperArmL",
        bone: upperArmL,
        body: upperArmBody,
        joint: shoulderJoint,
        jointConfig: { type: "spherical", coneAngle: Math.PI * 2/3 },  // 120°
        colliderOffset: new THREE.Vector3(0, 0.15, 0),
        density: 1.5,
        children: [lowerArmNode]
    };

    const torsoNode: RagdollNode = {
        boneName: "Torso",
        bone: torso,
        body: torsoAnchor,
        joint: null,
        jointConfig: null,
        colliderOffset: new THREE.Vector3(0, 0, 0),
        density: 0,
        children: [upperArmNode]
    };

    nodeMap.set("Torso", torsoNode);
    nodeMap.set("UpperArmL", upperArmNode);
    nodeMap.set("LowerArmL", lowerArmNode);

    const _armTree: RagdollTree = {
        root: torsoNode,
        nodeMap
    };

    console.log("Ragdoll tree built:",
        "Torso (kinematic) →",
        "UpperArmL (dynamic, spherical) →",
        "LowerArmL (dynamic, revolute)"
    );

    // ── Debug Visualization ──
    // Yellow spheres for all skeleton bones
    const boneSpheres: Map<string, THREE.Mesh> = new Map();
    for (const [name, bone] of Object.entries(character.bones)) {
        const sphere = createDebugSphere(0xffff00); // Yellow
        scene.add(sphere);
        boneSpheres.set(name, sphere);
    }

    // Green sphere at shoulder joint (upperArmBody position)
    const shoulderSphere = createDebugSphere(0x00ff00, 0.1); // Green, bigger
    scene.add(shoulderSphere);

    // Red sphere at elbow joint (lowerArmBody position)
    const elbowSphere = createDebugSphere(0xff0000, 0.08); // Red
    scene.add(elbowSphere);

    return {
        update() {
            // 1. Refresh world matrices so we read up-to-date bone transforms (mixer just wrote)
            character.object.updateMatrixWorld(true);

            // 2. Sync kinematic torso anchor to Torso bone's current world transform
            torso.getWorldPosition(tmpVec);
            torsoAnchor.setNextKinematicTranslation({ x: tmpVec.x, y: tmpVec.y, z: tmpVec.z });
            torso.getWorldQuaternion(tmpQuat);
            torsoAnchor.setNextKinematicRotation({ x: tmpQuat.x, y: tmpQuat.y, z: tmpQuat.z, w: tmpQuat.w });

            // 3. Step physics one tick
            world.step();

            // 4. Write physics back to UpperArmL bone
            //    bone.quaternion = parent.worldQuat⁻¹ × body.worldQuat
            const upperRot = upperArmBody.rotation();
            tmpQuat.set(upperRot.x, upperRot.y, upperRot.z, upperRot.w);
            upperArmL.parent!.getWorldQuaternion(tmpQuat2);
            upperArmL.quaternion.copy(tmpQuat2).invert().multiply(tmpQuat);

            // 5. Write physics back to LowerArmL bone
            const lowerRot = lowerArmBody.rotation();
            tmpQuat.set(lowerRot.x, lowerRot.y, lowerRot.z, lowerRot.w);
            lowerArmL.parent!.getWorldQuaternion(tmpQuat2);
            lowerArmL.quaternion.copy(tmpQuat2).invert().multiply(tmpQuat);

            // 6. Sync debug spheres to bone world positions (yellow)
            for (const [name, sphere] of boneSpheres) {
                const bone = character.bones[name];
                if (bone) {
                    bone.getWorldPosition(tmpVec);
                    sphere.position.copy(tmpVec);
                }
            }

            // 7. Sync joint spheres to physics body positions
            const shoulderT = upperArmBody.translation();
            shoulderSphere.position.set(shoulderT.x, shoulderT.y, shoulderT.z);

            const elbowT = lowerArmBody.translation();
            elbowSphere.position.set(elbowT.x, elbowT.y, elbowT.z);
        },
    };
}
