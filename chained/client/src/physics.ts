import RAPIER from "@dimforge/rapier3d";

export type Physics = {
    world: RAPIER.World;
    RAPIER: typeof RAPIER;
};

export async function createPhysics(): Promise<Physics> {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

    // Ground — bounds the simulation in case any dynamic body falls free.
    const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    world.createCollider(
        RAPIER.ColliderDesc.cuboid(20, 0.05, 20).setTranslation(0, -0.05, 0),
        groundBody
    );

    return { world, RAPIER };
}
