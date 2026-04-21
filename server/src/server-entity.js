import RAPIER from "@dimforge/rapier3d-compat";
import { FLOP } from "@fish-jam/shared";
// Collision groups:
// - Ground/walls: membership=1, filter=2 (collides with players)
// - Players: membership=2, filter=3 (collides with ground AND other players)
const PLAYER_COLLISION_GROUP = 0x00020003;
export function createServerEntity(playerId, world, spawnPos, color) {
    // Create rigid body (dynamic)
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(spawnPos.x, spawnPos.y, spawnPos.z)
        .setLinearDamping(FLOP.LINEAR_DAMPING)
        .setAngularDamping(FLOP.ANGULAR_DAMPING)
        .setCcdEnabled(true); // Prevent tunneling at high speeds
    const body = world.createRigidBody(bodyDesc);
    // Create collider (cube for now, matching client)
    const colliderDesc = RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5)
        .setMass(FLOP.PLAYER_MASS)
        .setFriction(FLOP.PLAYER_FRICTION)
        .setRestitution(FLOP.PLAYER_RESTITUTION)
        .setCollisionGroups(PLAYER_COLLISION_GROUP);
    const collider = world.createCollider(colliderDesc, body);
    return {
        playerId,
        body,
        collider,
        color,
        phase: "idle",
        eliminated: false,
    };
}
export function applyInput(entity, input, dt) {
    if (entity.eliminated)
        return;
    const body = entity.body;
    // Apply movement force
    const moveForce = FLOP.MOVE_FORCE;
    const forceX = input.moveX * moveForce;
    const forceZ = input.moveY * moveForce;
    if (forceX !== 0 || forceZ !== 0) {
        body.applyImpulse({ x: forceX * dt, y: 0, z: forceZ * dt }, true);
    }
    // Handle jump
    if (input.spaceJustReleased) {
        const vel = body.linvel();
        // Only jump if roughly on ground (low Y velocity)
        if (Math.abs(vel.y) < 2) {
            body.applyImpulse({ x: 0, y: FLOP.JUMP_BASE_IMPULSE, z: 0 }, true);
        }
    }
    // Clamp velocity
    const vel = body.linvel();
    const horizSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    if (horizSpeed > FLOP.MAX_VELOCITY) {
        const scale = FLOP.MAX_VELOCITY / horizSpeed;
        body.setLinvel({ x: vel.x * scale, y: vel.y, z: vel.z * scale }, true);
    }
}
export function exportState(entity) {
    const pos = entity.body.translation();
    const rot = entity.body.rotation();
    // For now, body/head/tail all share same position (cube representation)
    const snapshot = {
        pos: [pos.x, pos.y, pos.z],
        rot: [rot.x, rot.y, rot.z, rot.w],
    };
    return {
        id: entity.playerId,
        body: snapshot,
        head: snapshot,
        tail: snapshot,
        phase: entity.phase,
        curlSign: 1,
        damage: 0,
        color: entity.color,
    };
}
export function checkEliminated(entity) {
    if (entity.eliminated)
        return false; // Already eliminated
    const pos = entity.body.translation();
    if (pos.y < FLOP.FALL_THRESHOLD) {
        entity.eliminated = true;
        return true;
    }
    return false;
}
export function disposeEntity(entity, world) {
    world.removeCollider(entity.collider, true);
    world.removeRigidBody(entity.body);
}
