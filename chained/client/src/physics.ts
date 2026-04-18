import RAPIER from "@dimforge/rapier3d";

export async function createPhysics() {
    // await RAPIER.init();

    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

    // ground physics
    const ground = world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed()
    );

    // Ground: belongs to group 2, collides with group 1 (skeleton parts)
    world.createCollider(
        RAPIER.ColliderDesc.cuboid(10, 0.1, 10).setCollisionGroups(0x00010002),
        ground
    );

    return { world, RAPIER };
}