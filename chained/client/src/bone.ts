import * as THREE from "three";

export function createBone(world: any, RAPIER: any, position: [number, number, number], color: string) {
    const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic().setTranslation(...position)
    );

    world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.2, 1, 0.2),
        body
    );

    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 2, 0.4),
        new THREE.MeshStandardMaterial({ color: color })
    );

    return { body, mesh };
}