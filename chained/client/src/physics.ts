import RAPIER from "@dimforge/rapier3d";
import {
    PLATFORM_HALF_X,
    PLATFORM_HALF_Y,
    PLATFORM_HALF_Z,
    PLATFORM_CENTER_Y,
} from "./arena";

export type Physics = {
    world: RAPIER.World;
    RAPIER: typeof RAPIER;
};

export async function createPhysics(): Promise<Physics> {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

    // The arena's only static collider: the floating platform.
    const platformBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    world.createCollider(
        RAPIER.ColliderDesc
            .cuboid(PLATFORM_HALF_X, PLATFORM_HALF_Y, PLATFORM_HALF_Z)
            .setTranslation(0, PLATFORM_CENTER_Y, 0),
        platformBody
    );

    return { world, RAPIER };
}
