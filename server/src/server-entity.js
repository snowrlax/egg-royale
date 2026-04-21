import RAPIER from "@dimforge/rapier3d-compat";
import { FLOP } from "@fish-jam/shared";
// Collision groups:
// - Ground/walls: membership=1, filter=2 (collides with players)
// - Players: membership=2, filter=3 (collides with ground AND other players)
const PLAYER_COLLISION_GROUP = 0x00020003;
export function createServerEntity(playerId, world, spawnPos, color) {
    // Create rigid body (dynamic)
    // Use shared damping constant for consistency with client
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(spawnPos.x, spawnPos.y, spawnPos.z)
        .setLinearDamping(FLOP.CUBE_DAMPING)
        .setAngularDamping(FLOP.CUBE_DAMPING)
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
// Grounded check using raycast (matches client fish-flop.ts checkGrounded)
function checkGrounded(body, world) {
    const pos = body.translation();
    const ray = new RAPIER.Ray({ x: pos.x, y: pos.y, z: pos.z }, { x: 0, y: -1, z: 0 });
    // Cube half-height is 0.5, raycast slightly beyond
    const hit = world.castRay(ray, FLOP.CUBE_GROUNDED_RAY, true, undefined, undefined, undefined, body);
    return hit !== null;
}
export function applyInput(entity, input, dt, world) {
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
    // Raycast grounded check (matches client)
    const grounded = checkGrounded(body, world);
    // Direct velocity control - matches client (fish-flop.ts lines 251-258)
    if (hasInput) {
        const speed = grounded ? FLOP.CUBE_MOVE_SPEED : FLOP.CUBE_MOVE_SPEED * FLOP.CUBE_AIR_CONTROL;
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
