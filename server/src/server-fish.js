/**
 * Headless Rapier3D fish ragdoll — no Three.js dependency.
 * Creates the same 3-body + 2-joint structure as the client fish-flop.ts,
 * runs the same flop state machine, and exports FishState snapshots.
 */
import RAPIER from "@dimforge/rapier3d-compat";
import { FLOP, } from "@fish-jam/shared";
// ── Helpers ──
function setMotor(joint, target, stiffness, damping) {
    joint.configureMotorPosition(target, stiffness, damping);
}
function clampVelocity(rb, max) {
    const v = rb.linvel();
    const hSpeed = Math.sqrt(v.x ** 2 + v.z ** 2);
    if (hSpeed > max) {
        const s = max / hSpeed;
        rb.setLinvel({ x: v.x * s, y: v.y, z: v.z * s }, true);
    }
}
function checkGrounded(bodyRB, world) {
    const bpos = bodyRB.translation();
    const ray = new RAPIER.Ray({ x: bpos.x, y: bpos.y, z: bpos.z }, { x: 0, y: -1, z: 0 });
    const hit = world.castRay(ray, FLOP.BODY_RADIUS + FLOP.GROUND_RAY_LENGTH, true, undefined, undefined, undefined, bodyRB);
    return hit !== null;
}
/** Minimal quaternion → euler Y extraction (YXZ order). */
function quatToEulerY(x, y, z, w) {
    const sinp = 2 * (w * x - z * y);
    const cp = Math.sqrt(1 - sinp * sinp);
    return Math.atan2(2 * (w * y + x * z), 1 - 2 * (x * x + y * y));
}
const FISH_COLORS = [
    "#ff8c42", "#42b0ff", "#ff4242", "#42ff8c",
    "#b042ff", "#ffdd42",
];
let colorIndex = 0;
export function createServerFish(id, world, spawnPos = { x: 0, y: 2, z: 0 }) {
    const color = FISH_COLORS[colorIndex % FISH_COLORS.length];
    colorIndex += 1;
    // ── HEAD ──
    const headDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(spawnPos.x, spawnPos.y, spawnPos.z - 0.55)
        .setLinearDamping(0)
        .setAngularDamping(0.3);
    const headRB = world.createRigidBody(headDesc);
    const headCollDesc = RAPIER.ColliderDesc.ball(FLOP.HEAD_RADIUS)
        .setDensity(FLOP.HEAD_MASS / ((4 / 3) * Math.PI * FLOP.HEAD_RADIUS ** 3))
        .setFriction(FLOP.FISH_FRICTION)
        .setRestitution(FLOP.FISH_RESTITUTION);
    world.createCollider(headCollDesc, headRB);
    // ── BODY ──
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(spawnPos.x, spawnPos.y, spawnPos.z)
        .setLinearDamping(0)
        .setAngularDamping(0.3);
    const bodyRB = world.createRigidBody(bodyDesc);
    const bodyVol = Math.PI *
        FLOP.BODY_RADIUS ** 2 *
        (2 * FLOP.BODY_HALF_HEIGHT + (4 / 3) * FLOP.BODY_RADIUS);
    const bodyCollDesc = RAPIER.ColliderDesc.capsule(FLOP.BODY_HALF_HEIGHT, FLOP.BODY_RADIUS)
        .setDensity(FLOP.BODY_MASS / bodyVol)
        .setFriction(FLOP.FISH_FRICTION)
        .setRestitution(FLOP.FISH_RESTITUTION);
    world.createCollider(bodyCollDesc, bodyRB);
    // ── TAIL ──
    const tailDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(spawnPos.x, spawnPos.y, spawnPos.z + 0.55)
        .setLinearDamping(0)
        .setAngularDamping(0.2);
    const tailRB = world.createRigidBody(tailDesc);
    const tailCollDesc = RAPIER.ColliderDesc.ball(FLOP.TAIL_RADIUS)
        .setDensity(FLOP.TAIL_MASS / ((4 / 3) * Math.PI * FLOP.TAIL_RADIUS ** 3))
        .setFriction(FLOP.FISH_FRICTION)
        .setRestitution(FLOP.FISH_RESTITUTION);
    world.createCollider(tailCollDesc, tailRB);
    // ── JOINTS (Y axis — horizontal lateral bend) ──
    const headJointData = RAPIER.JointData.revolute({ x: 0, y: 0, z: 0.2 }, { x: 0, y: 0, z: -0.35 }, { x: 0, y: 1, z: 0 });
    const headJoint = world.createImpulseJoint(headJointData, headRB, bodyRB, true);
    headJoint.setLimits(-FLOP.JOINT_LIMIT, FLOP.JOINT_LIMIT);
    const tailJointData = RAPIER.JointData.revolute({ x: 0, y: 0, z: 0.35 }, { x: 0, y: 0, z: -0.15 }, { x: 0, y: 1, z: 0 });
    const tailJoint = world.createImpulseJoint(tailJointData, bodyRB, tailRB, true);
    tailJoint.setLimits(-FLOP.JOINT_LIMIT, FLOP.JOINT_LIMIT);
    setMotor(headJoint, 0, FLOP.AIR_STIFFNESS, FLOP.AIR_DAMPING);
    setMotor(tailJoint, 0, FLOP.AIR_STIFFNESS, FLOP.AIR_DAMPING);
    // ── Dirty-check helper ──
    const DIRTY_THRESHOLD = 0.01;
    function isBodyDirty(rb, prevPos, prevRot) {
        const p = rb.translation();
        if (Math.abs(p.x - prevPos[0]) > DIRTY_THRESHOLD ||
            Math.abs(p.y - prevPos[1]) > DIRTY_THRESHOLD ||
            Math.abs(p.z - prevPos[2]) > DIRTY_THRESHOLD)
            return true;
        const r = rb.rotation();
        if (Math.abs(r.x - prevRot[0]) > DIRTY_THRESHOLD ||
            Math.abs(r.y - prevRot[1]) > DIRTY_THRESHOLD ||
            Math.abs(r.z - prevRot[2]) > DIRTY_THRESHOLD ||
            Math.abs(r.w - prevRot[3]) > DIRTY_THRESHOLD)
            return true;
        return false;
    }
    // ── State ──
    const fish = {
        id,
        color,
        damage: 0,
        phase: "idle",
        phaseTime: 0,
        curlSign: 1,
        facingAngle: 0,
        jumpCharge: 0,
        grounded: false,
        moveX: 0,
        moveY: 0,
        spaceDown: false,
        spaceJustReleased: false,
        prevExportedState: null,
        head: headRB,
        body: bodyRB,
        tail: tailRB,
        headJoint,
        tailJoint,
        isDirty() {
            const prev = fish.prevExportedState;
            if (!prev)
                return true; // first export is always dirty
            if (prev.phase !== fish.phase)
                return true;
            if (isBodyDirty(bodyRB, prev.body.pos, prev.body.rot))
                return true;
            if (isBodyDirty(headRB, prev.head.pos, prev.head.rot))
                return true;
            if (isBodyDirty(tailRB, prev.tail.pos, prev.tail.rot))
                return true;
            return false;
        },
        applyInput(input) {
            fish.moveX = input.moveX;
            fish.moveY = input.moveY;
            fish.spaceDown = input.spaceDown;
            fish.spaceJustReleased = input.spaceJustReleased;
        },
        step(world, dt) {
            stepFish(fish, world, dt);
        },
        peekState() {
            const bp = bodyRB.translation();
            const br = bodyRB.rotation();
            const hp = headRB.translation();
            const hr = headRB.rotation();
            const tp = tailRB.translation();
            const tr = tailRB.rotation();
            return {
                id: fish.id,
                body: { pos: [bp.x, bp.y, bp.z], rot: [br.x, br.y, br.z, br.w] },
                head: { pos: [hp.x, hp.y, hp.z], rot: [hr.x, hr.y, hr.z, hr.w] },
                tail: { pos: [tp.x, tp.y, tp.z], rot: [tr.x, tr.y, tr.z, tr.w] },
                phase: fish.phase,
                curlSign: fish.curlSign,
                damage: fish.damage,
                color: fish.color,
            };
        },
        exportState() {
            const state = fish.peekState();
            fish.prevExportedState = state;
            return state;
        },
        reset() {
            const y = 2;
            const bodies = [
                { rb: bodyRB, z: spawnPos.z },
                { rb: headRB, z: spawnPos.z - 0.55 },
                { rb: tailRB, z: spawnPos.z + 0.55 },
            ];
            for (const { rb, z } of bodies) {
                rb.setTranslation({ x: spawnPos.x, y, z }, true);
                rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
                rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
                rb.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
            }
            fish.phase = "idle";
            fish.phaseTime = 0;
            fish.facingAngle = 0;
            fish.jumpCharge = 0;
            fish.curlSign = 1;
        },
        dispose(world) {
            world.removeRigidBody(headRB);
            world.removeRigidBody(bodyRB);
            world.removeRigidBody(tailRB);
        },
    };
    return fish;
}
// ── Flop State Machine (headless, mirrors fish-flop.ts logic) ──
function applyFacingForce(fish, dt) {
    const rot = fish.body.rotation();
    const currentY = quatToEulerY(rot.x, rot.y, rot.z, rot.w);
    let diff = fish.facingAngle - currentY;
    while (diff > Math.PI)
        diff -= Math.PI * 2;
    while (diff < -Math.PI)
        diff += Math.PI * 2;
    const yAngVel = fish.body.angvel().y;
    const torqueY = (diff * FLOP.FACING_TORQUE - yAngVel * FLOP.FACING_DAMPING) * dt;
    fish.body.applyTorqueImpulse({ x: 0, y: torqueY, z: 0 }, true);
}
function applyRecoveryTorque(fish) {
    const rot = fish.body.rotation();
    // Simplified recovery: compute cross product of body-up vs world-up
    // body-up = rotate (0,1,0) by quaternion
    const qx = rot.x, qy = rot.y, qz = rot.z, qw = rot.w;
    const upX = 2 * (qx * qy + qw * qz);
    const upY = 1 - 2 * (qx * qx + qz * qz);
    const upZ = 2 * (qy * qz - qw * qx);
    // cross((upX,upY,upZ), (0,1,0))
    const crossX = upZ; // upY*0 - upZ*1 → -upZ... wait
    // cross(bodyUp, worldUp) = (bodyUp.y*0 - bodyUp.z*1, bodyUp.z*0 - bodyUp.x*0, bodyUp.x*1 - bodyUp.y*0)
    // Actually: cross((a,b,c),(0,1,0)) = (b*0 - c*1, c*0 - a*0, a*1 - b*0) = (-c, 0, a)
    const cX = -upZ;
    const cZ = upX;
    const dot = upY; // bodyUp dot worldUp
    const strength = FLOP.RECOVERY_TORQUE * (1 - dot);
    fish.body.applyTorqueImpulse({ x: cX * strength * 0.01, y: 0, z: cZ * strength * 0.01 }, true);
}
function applyVerticalDynamics(fish, dt) {
    const phase = fish.phase;
    if (phase === "idle") {
        const breathe = Math.sin(fish.phaseTime * 3) * 0.3;
        fish.head.applyTorqueImpulse({ x: breathe * dt, y: 0, z: 0 }, true);
        fish.tail.applyTorqueImpulse({ x: -breathe * dt * 0.5, y: 0, z: 0 }, true);
    }
    if (phase === "curl") {
        fish.head.applyTorqueImpulse({ x: -1.5 * dt, y: 0, z: 0 }, true);
        fish.tail.applyTorqueImpulse({ x: 0.8 * dt, y: 0, z: 0 }, true);
    }
    if (phase === "snap") {
        fish.head.applyTorqueImpulse({ x: 2.0 * dt, y: 0, z: 0 }, true);
        fish.tail.applyTorqueImpulse({ x: -3.0 * dt, y: 0, z: 0 }, true);
    }
    if (phase === "airborne") {
        const flutter = Math.sin(fish.phaseTime * 18) * 1.2;
        fish.tail.applyTorqueImpulse({ x: flutter * dt, y: 0, z: 0 }, true);
        fish.head.applyTorqueImpulse({ x: 0.5 * dt, y: 0, z: 0 }, true);
    }
    if (phase === "land") {
        const impact = Math.max(0, 1 - fish.phaseTime * 20);
        fish.head.applyTorqueImpulse({ x: 3.0 * impact * dt, y: 0, z: 0 }, true);
        fish.tail.applyTorqueImpulse({ x: -2.0 * impact * dt, y: 0, z: 0 }, true);
    }
    if (phase === "jump_charge") {
        const chargeT = fish.jumpCharge / FLOP.JUMP_MAX_CHARGE;
        fish.head.applyTorqueImpulse({ x: 2.0 * chargeT * dt, y: 0, z: 0 }, true);
        fish.tail.applyTorqueImpulse({ x: 1.5 * chargeT * dt, y: 0, z: 0 }, true);
    }
    if (phase === "jump_snap") {
        fish.head.applyTorqueImpulse({ x: -4.0 * dt, y: 0, z: 0 }, true);
        fish.tail.applyTorqueImpulse({ x: 2.0 * dt, y: 0, z: 0 }, true);
    }
}
function stepFish(fish, world, dt) {
    fish.phaseTime += dt;
    fish.grounded = checkGrounded(fish.body, world);
    const moveLen = Math.sqrt(fish.moveX ** 2 + fish.moveY ** 2);
    const hasInput = moveLen > 0.1;
    if (fish.grounded && fish.phase !== "snap" && fish.phase !== "jump_snap") {
        applyRecoveryTorque(fish);
    }
    if (hasInput && fish.grounded) {
        applyFacingForce(fish, dt);
    }
    clampVelocity(fish.body, FLOP.MAX_VELOCITY);
    clampVelocity(fish.head, FLOP.MAX_VELOCITY);
    clampVelocity(fish.tail, FLOP.MAX_VELOCITY * 1.2);
    const s = fish.curlSign;
    applyVerticalDynamics(fish, dt);
    switch (fish.phase) {
        case "idle":
            setMotor(fish.headJoint, 0, FLOP.AIR_STIFFNESS, FLOP.AIR_DAMPING);
            setMotor(fish.tailJoint, 0, FLOP.AIR_STIFFNESS, FLOP.AIR_DAMPING);
            if (hasInput && fish.grounded) {
                fish.facingAngle = Math.atan2(fish.moveX, fish.moveY);
                fish.phase = "curl";
                fish.phaseTime = 0;
            }
            else if (fish.spaceDown && fish.grounded) {
                fish.phase = "jump_charge";
                fish.phaseTime = 0;
                fish.jumpCharge = 0;
            }
            break;
        case "curl":
            setMotor(fish.headJoint, s * FLOP.CURL_HEAD_ANGLE, FLOP.CURL_STIFFNESS, FLOP.CURL_DAMPING);
            setMotor(fish.tailJoint, -s * FLOP.CURL_TAIL_ANGLE, FLOP.CURL_STIFFNESS, FLOP.CURL_DAMPING);
            if (hasInput) {
                fish.facingAngle = Math.atan2(fish.moveX, fish.moveY);
            }
            if (fish.phaseTime >= FLOP.CURL_DURATION) {
                fish.phase = "snap";
                fish.phaseTime = 0;
            }
            break;
        case "snap":
            setMotor(fish.headJoint, s * FLOP.SNAP_HEAD_ANGLE, FLOP.SNAP_STIFFNESS, FLOP.SNAP_DAMPING);
            setMotor(fish.tailJoint, -s * FLOP.SNAP_TAIL_ANGLE, FLOP.SNAP_STIFFNESS, FLOP.SNAP_DAMPING);
            if (fish.phaseTime < dt * 1.5) {
                const fx = Math.sin(fish.facingAngle) * FLOP.MOVE_FORCE;
                const fz = Math.cos(fish.facingAngle) * FLOP.MOVE_FORCE;
                fish.body.applyImpulse({ x: fx, y: FLOP.LAUNCH_UP, z: fz }, true);
                fish.tail.applyImpulse({ x: 0, y: -FLOP.TAIL_SLAP_DOWN, z: 0 }, true);
            }
            if (fish.phaseTime >= FLOP.SNAP_DURATION) {
                fish.curlSign *= -1;
                fish.phase = "airborne";
                fish.phaseTime = 0;
            }
            break;
        case "airborne":
            setMotor(fish.headJoint, 0, FLOP.AIR_STIFFNESS, FLOP.AIR_DAMPING);
            setMotor(fish.tailJoint, 0, FLOP.AIR_STIFFNESS, FLOP.AIR_DAMPING);
            if (hasInput) {
                const fx = fish.moveX * FLOP.MOVE_FORCE * FLOP.AIR_CONTROL;
                const fz = fish.moveY * FLOP.MOVE_FORCE * FLOP.AIR_CONTROL;
                fish.body.addForce({ x: fx, y: 0, z: fz }, true);
            }
            if (fish.grounded && fish.phaseTime > 0.1) {
                fish.phase = "land";
                fish.phaseTime = 0;
            }
            break;
        case "land":
            setMotor(fish.headJoint, 0, FLOP.CURL_STIFFNESS, FLOP.CURL_DAMPING);
            setMotor(fish.tailJoint, 0, FLOP.CURL_STIFFNESS, FLOP.CURL_DAMPING);
            if (fish.phaseTime >= FLOP.LAND_COOLDOWN) {
                if (fish.spaceDown) {
                    fish.phase = "jump_charge";
                    fish.phaseTime = 0;
                    fish.jumpCharge = 0;
                }
                else if (hasInput) {
                    fish.facingAngle = Math.atan2(fish.moveX, fish.moveY);
                    fish.phase = "curl";
                    fish.phaseTime = 0;
                }
                else {
                    fish.phase = "idle";
                    fish.phaseTime = 0;
                }
            }
            break;
        case "jump_charge": {
            fish.jumpCharge = Math.min(fish.jumpCharge + dt, FLOP.JUMP_MAX_CHARGE);
            const chargeT = fish.jumpCharge / FLOP.JUMP_MAX_CHARGE;
            const coilAmt = chargeT * FLOP.JUMP_CHARGE_COIL;
            setMotor(fish.headJoint, -s * coilAmt, FLOP.CURL_STIFFNESS, FLOP.CURL_DAMPING);
            setMotor(fish.tailJoint, s * coilAmt, FLOP.CURL_STIFFNESS, FLOP.CURL_DAMPING);
            if (hasInput) {
                fish.facingAngle = Math.atan2(fish.moveX, fish.moveY);
                applyFacingForce(fish, dt);
            }
            if (fish.spaceJustReleased) {
                if (fish.jumpCharge >= FLOP.JUMP_MIN_CHARGE) {
                    fish.phase = "jump_snap";
                    fish.phaseTime = 0;
                }
                else {
                    fish.phase = "idle";
                    fish.phaseTime = 0;
                }
            }
            if (!fish.grounded) {
                fish.phase = "airborne";
                fish.phaseTime = 0;
            }
            break;
        }
        case "jump_snap":
            setMotor(fish.headJoint, 0, FLOP.JUMP_SNAP_STIFFNESS, FLOP.SNAP_DAMPING);
            setMotor(fish.tailJoint, 0, FLOP.JUMP_SNAP_STIFFNESS, FLOP.SNAP_DAMPING);
            if (fish.phaseTime < dt * 1.5) {
                const ct = Math.min(fish.jumpCharge / FLOP.JUMP_MAX_CHARGE, 1);
                const upImpulse = FLOP.JUMP_BASE_IMPULSE + ct * FLOP.JUMP_CHARGE_BONUS;
                let fx = 0, fz = 0;
                if (hasInput) {
                    fx = Math.sin(fish.facingAngle) * FLOP.MOVE_FORCE * 0.4;
                    fz = Math.cos(fish.facingAngle) * FLOP.MOVE_FORCE * 0.4;
                }
                fish.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
                fish.head.setLinvel({ x: 0, y: 0, z: 0 }, true);
                fish.tail.setLinvel({ x: 0, y: 0, z: 0 }, true);
                fish.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
                fish.head.setAngvel({ x: 0, y: 0, z: 0 }, true);
                fish.tail.setAngvel({ x: 0, y: 0, z: 0 }, true);
                fish.body.applyImpulse({ x: fx, y: upImpulse, z: fz }, true);
                fish.head.applyImpulse({ x: 0, y: upImpulse * 0.6, z: 0 }, true);
                fish.tail.applyImpulse({ x: 0, y: upImpulse * 0.2, z: 0 }, true);
                fish.curlSign *= -1;
            }
            if (fish.phaseTime >= FLOP.JUMP_SNAP_DURATION) {
                fish.phase = "airborne";
                fish.phaseTime = 0;
            }
            break;
    }
    // Clear one-shot input after processing
    fish.spaceJustReleased = false;
}
