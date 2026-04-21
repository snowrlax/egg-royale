import RAPIER from "@dimforge/rapier3d-compat";
import { FLOP } from "@fish-jam/shared";
// Collision groups:
// - Ground/walls: membership=1, filter=2 (collides with players)
// - Players: membership=2, filter=3 (collides with ground AND other players)
const PLAYER_COLLISION_GROUP = 0x00020003;
export function createServerEntity(playerId, world, spawnPos, color) {
    // Create rigid body (dynamic)
    // Use same damping as client (5.0) for tight, responsive movement
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(spawnPos.x, spawnPos.y, spawnPos.z)
        .setLinearDamping(5.0) // Match client (fish-flop.ts line 140)
        .setAngularDamping(5.0) // Match client (fish-flop.ts line 141)
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
// Match client constants (fish-flop.ts lines 52-53)
const CUBE_MOVE_SPEED = 6.0;
const CUBE_AIR_CONTROL = 0.3;
export function applyInput(entity, input, dt) {
    if (entity.eliminated)
        return;
    const body = entity.body;
    const v = body.linvel();
    // Normalize input (match client fish-flop.ts lines 238-245)
    let moveX = input.moveX;
    let moveY = input.moveY;
    const moveLen = Math.sqrt(moveX * moveX + moveY * moveY);
    if (moveLen > 1) {
        moveX /= moveLen;
        moveY /= moveLen;
    }
    const hasInput = moveLen > 0.1;
    // Simplified grounded check (low Y velocity = on ground)
    const grounded = Math.abs(v.y) < 0.5;
    // Direct velocity control - matches client (fish-flop.ts lines 251-258)
    if (hasInput) {
        const speed = grounded ? CUBE_MOVE_SPEED : CUBE_MOVE_SPEED * CUBE_AIR_CONTROL;
        body.setLinvel({ x: moveX * speed, y: v.y, z: moveY * speed }, true);
    }
    else if (grounded) {
        // Instant stop when no input (preserve Y for gravity)
        body.setLinvel({ x: 0, y: v.y, z: 0 }, true);
    }
    // Handle jump
    if (input.spaceJustReleased && grounded) {
        body.applyImpulse({ x: 0, y: FLOP.JUMP_BASE_IMPULSE, z: 0 }, true);
    }
    // Clamp velocity (safety)
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
