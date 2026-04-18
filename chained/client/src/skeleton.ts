import * as THREE from "three/webgpu";

type BodyPart = { body: any; mesh: any };

// Skeleton parts: belong to group 1, only collide with group 2 (ground).
// This prevents connected limbs from pushing against each other.
// Format: (filter << 16) | membership  →  group1 member, collides with group2 only
const SKELETON_GROUP = 0x00020001;

function createPart(
    world: any,
    RAPIER: any,
    pos: [number, number, number],
    hx: number, hy: number, hz: number,
    color: string
): BodyPart {
    const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(...pos)
            .setAngularDamping(3.0)
            .setLinearDamping(1.0)
    );
    world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setCollisionGroups(SKELETON_GROUP), body);
    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2),
        new THREE.MeshStandardNodeMaterial({ color })
    );
    return { body, mesh };
}

export function createSkeleton(world: any, RAPIER: any) {
    const ax = { x: 1, y: 0, z: 0 };

    // Positions are calculated so that each joint's two anchor points
    // share the same world-space location at spawn — no jolt on startup.
    //
    // Torso center: [0, 2.5, 0]
    // Neck anchor world:      [0,    3.25, 0]  → head_y    = 3.25 + 0.2  = 3.45
    // Shoulder L anchor world: [-0.3, 3.0, 0]  → upperArmL_y = 3.0 - 0.35 = 2.65
    // Elbow L anchor world:    [-0.3, 2.3, 0]  → lowerArmL_y = 2.3 - 0.3  = 2.0
    // Hip L anchor world:      [-0.25, 1.75, 0] → upperLegL_y = 1.75 - 0.4 = 1.35
    // Knee L anchor world:     [-0.25, 0.95, 0] → lowerLegL_y = 0.95 - 0.35 = 0.6
    // (lowerLeg bottom = 0.25, ground top ≈ 0.1 → 0.15 unit drop before landing)

    // Torso: X and Z rotation locked so it can't tip over during walking
    const torsoBody = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(0, 2.5, 0)
            .setAngularDamping(5.0)
            .setLinearDamping(0.5)
    );
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.3, 0.75, 0.15).setCollisionGroups(SKELETON_GROUP), torsoBody);
    const torso: BodyPart = {
        body: torsoBody,
        mesh: new THREE.Mesh(
            new THREE.BoxGeometry(0.6, 1.5, 0.3),
            new THREE.MeshStandardNodeMaterial({ color: "#888888" })
        )
    };

    const head      = createPart(world, RAPIER, [0,     3.45, 0],  0.2,  0.2,  0.2,  "#ffcc88");

    const upperArmL = createPart(world, RAPIER, [-0.3,  2.65, 0],  0.1,  0.35, 0.1,  "#6688aa");
    const lowerArmL = createPart(world, RAPIER, [-0.3,  2.0,  0],  0.08, 0.3,  0.08, "#7799bb");
    const upperArmR = createPart(world, RAPIER, [0.3,   2.65, 0],  0.1,  0.35, 0.1,  "#6688aa");
    const lowerArmR = createPart(world, RAPIER, [0.3,   2.0,  0],  0.08, 0.3,  0.08, "#7799bb");

    const upperLegL = createPart(world, RAPIER, [-0.25, 1.35, 0],  0.12, 0.4,  0.12, "#aa6644");
    const lowerLegL = createPart(world, RAPIER, [-0.25, 0.6,  0],  0.1,  0.35, 0.1,  "#bb7755");
    const upperLegR = createPart(world, RAPIER, [0.25,  1.35, 0],  0.12, 0.4,  0.12, "#aa6644");
    const lowerLegR = createPart(world, RAPIER, [0.25,  0.6,  0],  0.1,  0.35, 0.1,  "#bb7755");

    // Neck (spherical — head can bob freely)
    world.createImpulseJoint(
        RAPIER.JointData.spherical({ x: 0, y: 0.75, z: 0 }, { x: 0, y: -0.2, z: 0 }),
        torso.body, head.body, true
    );

    // Shoulders
    world.createImpulseJoint(
        RAPIER.JointData.revolute({ x: -0.3, y: 0.5, z: 0 }, { x: 0, y: 0.35, z: 0 }, ax),
        torso.body, upperArmL.body, true
    );
    world.createImpulseJoint(
        RAPIER.JointData.revolute({ x: 0.3, y: 0.5, z: 0 }, { x: 0, y: 0.35, z: 0 }, ax),
        torso.body, upperArmR.body, true
    );

    // Elbows
    world.createImpulseJoint(
        RAPIER.JointData.revolute({ x: 0, y: -0.35, z: 0 }, { x: 0, y: 0.3, z: 0 }, ax),
        upperArmL.body, lowerArmL.body, true
    );
    world.createImpulseJoint(
        RAPIER.JointData.revolute({ x: 0, y: -0.35, z: 0 }, { x: 0, y: 0.3, z: 0 }, ax),
        upperArmR.body, lowerArmR.body, true
    );

    // Hips (motor-driven)
    const hipL = world.createImpulseJoint(
        RAPIER.JointData.revolute({ x: -0.25, y: -0.75, z: 0 }, { x: 0, y: 0.4, z: 0 }, ax),
        torso.body, upperLegL.body, true
    );
    const hipR = world.createImpulseJoint(
        RAPIER.JointData.revolute({ x: 0.25, y: -0.75, z: 0 }, { x: 0, y: 0.4, z: 0 }, ax),
        torso.body, upperLegR.body, true
    );

    // Knees (motor-driven)
    const kneeL = world.createImpulseJoint(
        RAPIER.JointData.revolute({ x: 0, y: -0.4, z: 0 }, { x: 0, y: 0.35, z: 0 }, ax),
        upperLegL.body, lowerLegL.body, true
    );
    const kneeR = world.createImpulseJoint(
        RAPIER.JointData.revolute({ x: 0, y: -0.4, z: 0 }, { x: 0, y: 0.35, z: 0 }, ax),
        upperLegR.body, lowerLegR.body, true
    );

    const parts = { torso, head, upperArmL, lowerArmL, upperArmR, lowerArmR, upperLegL, lowerLegL, upperLegR, lowerLegR };
    const joints = { hipL, hipR, kneeL, kneeR };

    return { parts, joints };
}
