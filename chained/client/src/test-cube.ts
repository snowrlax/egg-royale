import * as THREE from "three/webgpu";
import RAPIER from "@dimforge/rapier3d";
import { PLATFORM_TOP_Y } from "./arena";

export type TestCube = {
    mesh: THREE.Mesh;
    body: RAPIER.RigidBody;
    sync: () => void;
};

type TestCubeOptions = {
    size?: number;
    position?: THREE.Vector3;
    color?: number;
    mass?: number;
};

export function createTestCube(
    scene: THREE.Scene,
    world: RAPIER.World,
    options: TestCubeOptions = {}
): TestCube {
    const size = options.size ?? 1;
    const half = size / 2;
    const pos =
        options.position ??
        new THREE.Vector3(2, PLATFORM_TOP_Y + half + 0.02, 0);
    const color = options.color ?? 0xff5533;
    const mass = options.mass ?? 1;

    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(size, size, size),
        new THREE.MeshStandardNodeMaterial({ color, roughness: 0.5 })
    );
    mesh.position.copy(pos);
    scene.add(mesh);

    const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(pos.x, pos.y, pos.z)
            .setLinearDamping(0.3)
            .setAngularDamping(0.4)
            .setCcdEnabled(true)
    );

    const volume = size * size * size;
    world.createCollider(
        RAPIER.ColliderDesc.cuboid(half, half, half)
            .setDensity(mass / volume)
            .setFriction(0.6)
            .setRestitution(0.1),
        body
    );

    function sync(): void {
        const p = body.translation();
        const r = body.rotation();
        mesh.position.set(p.x, p.y, p.z);
        mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }

    return { mesh, body, sync };
}
