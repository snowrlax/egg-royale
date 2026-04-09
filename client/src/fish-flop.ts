/**
 * fish-flop-sandbox.ts — v3 DEBUG BUILD
 *
 * v3 CHANGES (applied to your v2 file):
 *   - Joints rotate on Y axis → horizontal lateral bending
 *   - curlSign alternates each flop → left-right wiggle
 *   - Jump uses horizontal coil + crouch force (no vertical curl)
 *   - Debug wireframe off by default, not attached to fish bodies
 *   - Body mesh wider horizontally (elliptical from above)
 *
 * DEBUG: console.log added at every state transition, impulse, and force
 */

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d/rapier.js';

// ─────────────────────────────────────────────
// TUNING KNOBS
// ─────────────────────────────────────────────
export const FLOP = {
    // ── Segment dimensions ──
    HEAD_RADIUS: 0.25,
    BODY_HALF_HEIGHT: 0.30,
    BODY_RADIUS: 0.28,
    TAIL_RADIUS: 0.18,

    // ── Mass distribution ──
    HEAD_MASS: 1.0,
    BODY_MASS: 2.5,
    TAIL_MASS: 0.4,

    // ── Joint limits ──
    JOINT_LIMIT: 1.2,  // wider for horizontal bending

    // ── Flop cycle: CURL phase ──
    CURL_DURATION: 0.12,
    CURL_HEAD_ANGLE: 0.35,   // head bends toward curl side
    CURL_TAIL_ANGLE: 0.7,    // tail swings wide to curl side
    CURL_STIFFNESS: 200,
    CURL_DAMPING: 8,

    // ── Flop cycle: SNAP phase ──
    SNAP_DURATION: 0.06,
    SNAP_HEAD_ANGLE: -0.6,   // head straightens / slight opposite
    SNAP_TAIL_ANGLE: -1.2,   // tail WHIPS to opposite side
    SNAP_STIFFNESS: 1200,
    SNAP_DAMPING: 2,

    // ── Flop cycle: AIRBORNE phase ──
    AIR_STIFFNESS: 30,
    AIR_DAMPING: 2,
    AIR_CONTROL: 0.3,

    // ── Flop cycle: LAND phase ──
    LAND_COOLDOWN: 0.05,

    // ── Recovery / steering ──
    RECOVERY_TORQUE: 20,
    FACING_TORQUE: 15,
    FACING_DAMPING: 8,

    // ── Movement ──
    MOVE_FORCE: 10,
    LAUNCH_UP: 8,          // upward impulse during snap (hop height)
    TAIL_SLAP_DOWN: 6,    // downward impulse on tail during snap
    MAX_VELOCITY: 9,

    // ── Jump charge ──
    JUMP_CHARGE_COIL: 0.3,    // slight horizontal coil during charge (visual)
    JUMP_SNAP_STIFFNESS: 900,  // snappier joint straighten
    JUMP_SNAP_DURATION: 0.06,
    JUMP_MIN_CHARGE: 0.06,
    JUMP_MAX_CHARGE: 0.6,
    JUMP_BASE_IMPULSE: 14,
    JUMP_CHARGE_BONUS: 10,
    JUMP_CROUCH_FORCE: -5,    // downward force during charge (visual crouch) // less fight against the launch

    // ── World ──
    GRAVITY: -25,
    GROUND_FRICTION: 0.4,
    GROUND_RESTITUTION: 0.3,
    FISH_FRICTION: 0.2,
    FISH_RESTITUTION: 0.3,

    // ── Ground detection ──
    GROUND_RAY_LENGTH: 0.15,
} as const;

// ─────────────────────────────────────────────
// DEBUG: jump counter to track across jumps
// ─────────────────────────────────────────────
let jumpCount = 0;
let lastPhase = '';

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────
type FlopPhase =
    | 'idle'
    | 'curl'
    | 'snap'
    | 'airborne'
    | 'land'
    | 'jump_charge'
    | 'jump_snap';

interface FishBody {
    head: RAPIER.RigidBody;
    body: RAPIER.RigidBody;
    tail: RAPIER.RigidBody;

    headJoint: RAPIER.ImpulseJoint;
    tailJoint: RAPIER.ImpulseJoint;

    headMesh: THREE.Mesh;
    bodyMesh: THREE.Mesh;
    tailMesh: THREE.Mesh;
    eyeL: THREE.Mesh;
    eyeR: THREE.Mesh;

    phase: FlopPhase;
    phaseTime: number;
    moveDir: THREE.Vector2;
    grounded: boolean;
    facingAngle: number;
    jumpCharge: number;
    curlSign: number;   // +1 = curl right, -1 = curl left, alternates each flop
}

// ─────────────────────────────────────────────
// DEBUG: helper to log velocity of a body
// ─────────────────────────────────────────────
function logVel(label: string, rb: RAPIER.RigidBody) {
    const v = rb.linvel();
    const a = rb.angvel();
    const p = rb.translation();
    console.log(`  ${label} pos=(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}) linvel=(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)}) angvel=(${a.x.toFixed(2)}, ${a.y.toFixed(2)}, ${a.z.toFixed(2)})`);
}

// ─────────────────────────────────────────────
// MAIN INIT
// ─────────────────────────────────────────────
export async function initFlopSandbox(container: HTMLElement) {
    const world = new RAPIER.World({ x: 0, y: FLOP.GRAVITY, z: 0 });

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0ece4);

    const camera = new THREE.PerspectiveCamera(
        45, container.clientWidth / container.clientHeight, 0.1, 100
    );
    camera.position.set(0, 5, 7);
    camera.lookAt(0, 0.5, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(renderer.domElement);

    // ── Lighting ──
    const ambient = new THREE.AmbientLight(0xfff5e6, 0.5);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(4, 8, -3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 20;
    sun.shadow.camera.left = -6;
    sun.shadow.camera.right = 6;
    sun.shadow.camera.top = 6;
    sun.shadow.camera.bottom = -6;
    scene.add(sun);

    const hemi = new THREE.HemisphereLight(0x87ceeb, 0x8b7355, 0.25);
    scene.add(hemi);

    // ── Toon gradient map ──
    const gradTex = new THREE.DataTexture(
        new Uint8Array([60, 130, 200, 255]),
        4, 1, THREE.RedFormat
    );
    gradTex.minFilter = THREE.NearestFilter;
    gradTex.magFilter = THREE.NearestFilter;
    gradTex.needsUpdate = true;

    const groundCollider = createGround(world, scene);
    const fish = createFish(world, scene, gradTex);

    // ── Debug wireframe (colliders only, not attached to fish) ──
    // This renders ALL colliders in the Rapier world as wireframe lines.
    // It's a world-level debug view, not per-body — so it shows ground,
    // fish colliders, and any future scene objects as green outlines.
    const debugLines = new THREE.LineSegments(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ color: 0x00ff88, opacity: 0.25, transparent: true })
    );
    scene.add(debugLines);
    let showDebug = false;  // OFF by default — press G to toggle

    // ── Input ──
    const keys = new Set<string>();
    let spaceDown = false;
    let spaceJustReleased = false;

    window.addEventListener('keydown', e => {
        keys.add(e.key.toLowerCase());
        if (e.key === 'g') showDebug = !showDebug;
        if (e.key === ' ' && !spaceDown) {
            spaceDown = true;
            console.log('[INPUT] Space DOWN');
        }
    });
    window.addEventListener('keyup', e => {
        keys.delete(e.key.toLowerCase());
        if (e.key === ' ') {
            spaceDown = false;
            spaceJustReleased = true;
            console.log('[INPUT] Space UP (released)');
        }
    });

    // ── HUD ──
    const hud = document.createElement('div');
    hud.style.cssText = 'position:absolute;top:12px;left:12px;font:13px/1.6 monospace;color:#333;background:rgba(255,255,255,0.85);padding:10px 14px;border-radius:8px;pointer-events:none;';
    container.style.position = 'relative';
    container.appendChild(hud);

    // ── Tuning panel ──
    createTuningPanel(container);

    // ── Resize ──
    window.addEventListener('resize', () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });

    // ── Game loop ──
    const clock = new THREE.Clock();

    function tick() {
        const dt = Math.min(clock.getDelta(), 0.05);

        // ── Read input ──
        fish.moveDir.set(0, 0);
        if (keys.has('a') || keys.has('arrowleft')) fish.moveDir.x = -1;
        if (keys.has('d') || keys.has('arrowright')) fish.moveDir.x = 1;
        if (keys.has('w') || keys.has('arrowup')) fish.moveDir.y = -1;
        if (keys.has('s') || keys.has('arrowdown')) fish.moveDir.y = 1;
        if (fish.moveDir.length() > 0) fish.moveDir.normalize();

        // ── Update fish ──
        updateFish(fish, world, dt, spaceDown, spaceJustReleased);
        spaceJustReleased = false;

        // ── Live-update ground friction from tuning panel ──
        groundCollider.setFriction(FLOP.GROUND_FRICTION);
        groundCollider.setRestitution(FLOP.GROUND_RESTITUTION);

        // ── Step physics ──
        world.step();

        // ── Sync meshes ──
        syncMeshToBody(fish.headMesh, fish.head);
        syncMeshToBody(fish.bodyMesh, fish.body);
        syncMeshToBody(fish.tailMesh, fish.tail);
        syncEyes(fish);

        // ── Debug wireframe ──
        if (showDebug) {
            const buf = world.debugRender();
            debugLines.geometry.setAttribute('position', new THREE.BufferAttribute(buf.vertices, 3));
            debugLines.geometry.setAttribute('color', new THREE.BufferAttribute(buf.colors, 4));
            debugLines.visible = true;
        } else {
            debugLines.visible = false;
        }

        // ── HUD ──
        const bpos = fish.body.translation();
        const bvel = fish.body.linvel();
        const speed = Math.sqrt(bvel.x ** 2 + bvel.y ** 2 + bvel.z ** 2);
        const chargePercent = Math.min(fish.jumpCharge / FLOP.JUMP_MAX_CHARGE, 1);
        const curlDir = fish.curlSign > 0 ? 'R' : 'L';
        hud.innerHTML = [
            `Phase: <b>${fish.phase}</b> (${fish.phaseTime.toFixed(2)}s)`,
            `Pos: ${bpos.x.toFixed(1)}, ${bpos.y.toFixed(1)}, ${bpos.z.toFixed(1)}`,
            `Speed: ${speed.toFixed(1)} m/s  |  Curl: ${curlDir}`,
            `Grounded: ${fish.grounded}  |  Jumps: ${jumpCount}`,
            fish.phase === 'jump_charge'
                ? `Jump charge: <b>${(chargePercent * 100).toFixed(0)}%</b> ${'█'.repeat(Math.round(chargePercent * 10))}${'░'.repeat(10 - Math.round(chargePercent * 10))}`
                : '',
            ``,
            `WASD: move  |  Space: hold=charge, release=jump`,
            `G: debug wireframe  |  R: reset`,
        ].join('<br>');

        // ── Reset ──
        if (keys.has('r')) {
            resetFish(fish);
            jumpCount = 0;
            keys.delete('r');
        }

        renderer.render(scene, camera);
        requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

// ─────────────────────────────────────────────
// GROUND
// ─────────────────────────────────────────────
function createGround(world: RAPIER.World, scene: THREE.Scene): RAPIER.Collider {
    const groundDesc = RAPIER.ColliderDesc.cuboid(10, 0.15, 10)
        .setFriction(FLOP.GROUND_FRICTION)
        .setRestitution(FLOP.GROUND_RESTITUTION);
    const groundCollider = world.createCollider(groundDesc);

    const geo = new THREE.BoxGeometry(20, 0.3, 20);
    const mat = new THREE.MeshStandardMaterial({
        color: 0x8b7d6b, roughness: 0.8, metalness: 0.05,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    scene.add(mesh);

    const grid = new THREE.GridHelper(10, 20, 0xbbbbbb, 0xdddddd);
    grid.position.y = 0.16;
    scene.add(grid);

    return groundCollider;
}

// ─────────────────────────────────────────────
// FISH CREATION
// ─────────────────────────────────────────────
function createFish(
    world: RAPIER.World,
    scene: THREE.Scene,
    gradTex: THREE.DataTexture
): FishBody {
    const orange = new THREE.MeshToonMaterial({ color: 0xff8c42, gradientMap: gradTex });
    const headMat = new THREE.MeshToonMaterial({ color: 0xffaa66, gradientMap: gradTex });
    const eyeWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const eyePupil = new THREE.MeshBasicMaterial({ color: 0x111111 });

    const spawnY = 2.0;

    // ── HEAD ──
    const headBodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, spawnY, -0.55)
        .setLinearDamping(0)
        .setAngularDamping(0.3);
    const headRB = world.createRigidBody(headBodyDesc);
    const headCollDesc = RAPIER.ColliderDesc.ball(FLOP.HEAD_RADIUS)
        .setDensity(FLOP.HEAD_MASS / ((4 / 3) * Math.PI * FLOP.HEAD_RADIUS ** 3))
        .setFriction(FLOP.FISH_FRICTION)
        .setRestitution(FLOP.FISH_RESTITUTION);
    world.createCollider(headCollDesc, headRB);

    const headGeo = new THREE.SphereGeometry(FLOP.HEAD_RADIUS, 12, 8);
    const headMesh = new THREE.Mesh(headGeo, headMat);
    headMesh.castShadow = true;
    // Elliptical head: wider horizontally, slightly tall
    headMesh.scale.set(0.7, 1.0, 1.0);
    scene.add(headMesh);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.06, 8, 6);
    const pupilGeo = new THREE.SphereGeometry(0.035, 8, 6);

    const eyeL = new THREE.Mesh(eyeGeo, eyeWhite);
    eyeL.add(new THREE.Mesh(pupilGeo, eyePupil).translateZ(-0.03));
    scene.add(eyeL);

    const eyeR = new THREE.Mesh(eyeGeo, eyeWhite);
    eyeR.add(new THREE.Mesh(pupilGeo, eyePupil).translateZ(-0.03));
    scene.add(eyeR);

    // ── BODY ──
    const bodyBodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, spawnY, 0)
        .setLinearDamping(0)
        .setAngularDamping(0.3);
    const bodyRB = world.createRigidBody(bodyBodyDesc);
    const bodyVol = Math.PI * FLOP.BODY_RADIUS ** 2 *
        (2 * FLOP.BODY_HALF_HEIGHT + (4 / 3) * FLOP.BODY_RADIUS);
    const bodyCollDesc = RAPIER.ColliderDesc.capsule(FLOP.BODY_HALF_HEIGHT, FLOP.BODY_RADIUS)
        .setDensity(FLOP.BODY_MASS / bodyVol)
        .setFriction(FLOP.FISH_FRICTION)
        .setRestitution(FLOP.FISH_RESTITUTION);
    world.createCollider(bodyCollDesc, bodyRB);

    const bodyGeo = new THREE.CapsuleGeometry(FLOP.BODY_RADIUS, FLOP.BODY_HALF_HEIGHT * 2, 8, 12);
    bodyGeo.rotateX(Math.PI / 2);
    const bodyMesh = new THREE.Mesh(bodyGeo, orange);
    bodyMesh.castShadow = true;
    // Elliptical body: wider on X (horizontal), less extreme on Y
    // From above this reads as an oval fish body, not a flat ribbon
    bodyMesh.scale.set(0.65, 1.1, 1.0);
    scene.add(bodyMesh);

    // ── TAIL ──
    const tailBodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, spawnY, 0.55)
        .setLinearDamping(0)
        .setAngularDamping(0.2);
    const tailRB = world.createRigidBody(tailBodyDesc);
    const tailCollDesc = RAPIER.ColliderDesc.ball(FLOP.TAIL_RADIUS)
        .setDensity(FLOP.TAIL_MASS / ((4 / 3) * Math.PI * FLOP.TAIL_RADIUS ** 3))
        .setFriction(FLOP.FISH_FRICTION)
        .setRestitution(FLOP.FISH_RESTITUTION);
    world.createCollider(tailCollDesc, tailRB);

    const tailGeo = new THREE.ConeGeometry(0.22, 0.45, 4);
    tailGeo.rotateX(-Math.PI / 2);
    tailGeo.rotateY(Math.PI / 4);
    const tailMesh = new THREE.Mesh(tailGeo, orange);
    tailMesh.castShadow = true;
    // Tail fin: wider horizontally to match body
    tailMesh.scale.set(0.5, 1.3, 1.0);
    scene.add(tailMesh);

    // ── JOINTS — Y AXIS (horizontal lateral bend) ──
    // v2 had { x:1, y:0, z:0 } = vertical pitch
    // v3 uses { x:0, y:1, z:0 } = horizontal yaw
    const headJointData = RAPIER.JointData.revolute(
        { x: 0, y: 0, z: 0.2 },
        { x: 0, y: 0, z: -0.35 },
        { x: 0, y: 1, z: 0 }       // ← Y AXIS
    );
    const headJoint = world.createImpulseJoint(headJointData, headRB, bodyRB, true);
    (headJoint as RAPIER.RevoluteImpulseJoint).setLimits(-FLOP.JOINT_LIMIT, FLOP.JOINT_LIMIT);

    const tailJointData = RAPIER.JointData.revolute(
        { x: 0, y: 0, z: 0.35 },
        { x: 0, y: 0, z: -0.15 },
        { x: 0, y: 1, z: 0 }       // ← Y AXIS
    );
    const tailJoint = world.createImpulseJoint(tailJointData, bodyRB, tailRB, true);
    (tailJoint as RAPIER.RevoluteImpulseJoint).setLimits(-FLOP.JOINT_LIMIT, FLOP.JOINT_LIMIT);

    setMotor(headJoint, 0, FLOP.AIR_STIFFNESS, FLOP.AIR_DAMPING);
    setMotor(tailJoint, 0, FLOP.AIR_STIFFNESS, FLOP.AIR_DAMPING);

    return {
        head: headRB, body: bodyRB, tail: tailRB,
        headJoint, tailJoint,
        headMesh, bodyMesh, tailMesh,
        eyeL, eyeR,
        phase: 'idle',
        phaseTime: 0,
        moveDir: new THREE.Vector2(),
        grounded: false,
        facingAngle: 0,
        jumpCharge: 0,
        curlSign: 1,
    };
}

// ─────────────────────────────────────────────
// JOINT MOTOR
// ─────────────────────────────────────────────
function setMotor(joint: RAPIER.ImpulseJoint, target: number, stiffness: number, damping: number) {
    (joint as RAPIER.RevoluteImpulseJoint).configureMotorPosition(target, stiffness, damping);
}

// ─────────────────────────────────────────────
// GROUND CHECK
// ─────────────────────────────────────────────
function checkGrounded(fish: FishBody, world: RAPIER.World): boolean {
    const bpos = fish.body.translation();
    const ray = new RAPIER.Ray(
        { x: bpos.x, y: bpos.y, z: bpos.z },
        { x: 0, y: -1, z: 0 }
    );
    const hit = world.castRay(
        ray,
        FLOP.BODY_RADIUS + FLOP.GROUND_RAY_LENGTH,
        true, undefined, undefined, undefined,
        fish.body
    );
    return hit !== null;
}

// ─────────────────────────────────────────────
// FISH STATE MACHINE — v3 (horizontal curl)
// ─────────────────────────────────────────────
function updateFish(
    fish: FishBody,
    world: RAPIER.World,
    dt: number,
    spaceDown: boolean,
    spaceJustReleased: boolean
) {
    fish.phaseTime += dt;
    fish.grounded = checkGrounded(fish, world);
    const hasInput = fish.moveDir.length() > 0.1;

    // DEBUG: log every phase transition
    if (fish.phase !== lastPhase) {
        console.log(`\n[PHASE] ${lastPhase} → ${fish.phase} | grounded=${fish.grounded} | phaseTime=${fish.phaseTime.toFixed(3)}`);
        logVel('  body', fish.body);
        logVel('  head', fish.head);
        logVel('  tail', fish.tail);
        lastPhase = fish.phase;
    }

    if (fish.grounded && fish.phase !== 'snap' && fish.phase !== 'jump_snap') {
        applyRecoveryTorque(fish);
    }

    if (hasInput && fish.grounded) {
        applyFacingForce(fish, dt);
    }

    clampVelocity(fish.body, FLOP.MAX_VELOCITY);
    clampVelocity(fish.head, FLOP.MAX_VELOCITY);
    clampVelocity(fish.tail, FLOP.MAX_VELOCITY * 1.2);

    // DEBUG: log clamp effect
    const postClampVel = fish.body.linvel();
    const postClampSpeed = Math.sqrt(postClampVel.x ** 2 + postClampVel.y ** 2 + postClampVel.z ** 2);

    // s flips curl direction: +1 = right, -1 = left
    const s = fish.curlSign;

    // Vertical pitch dynamics on all segments (works alongside horizontal joints)
    applyVerticalDynamics(fish, dt);

    switch (fish.phase) {

        case 'idle':
            setMotor(fish.headJoint, 0, FLOP.AIR_STIFFNESS, FLOP.AIR_DAMPING);
            setMotor(fish.tailJoint, 0, FLOP.AIR_STIFFNESS, FLOP.AIR_DAMPING);

            if (hasInput && fish.grounded) {
                fish.facingAngle = Math.atan2(fish.moveDir.x, fish.moveDir.y);
                console.log(`[IDLE→CURL] facingAngle=${fish.facingAngle.toFixed(2)}`);
                fish.phase = 'curl';
                fish.phaseTime = 0;
            } else if (spaceDown && fish.grounded) {
                console.log(`[IDLE→JUMP_CHARGE] grounded=${fish.grounded}`);
                fish.phase = 'jump_charge';
                fish.phaseTime = 0;
                fish.jumpCharge = 0;
            }
            break;

        // ── CURL: horizontal C-shape, angles multiplied by curlSign ──
        case 'curl':
            setMotor(fish.headJoint, s * FLOP.CURL_HEAD_ANGLE, FLOP.CURL_STIFFNESS, FLOP.CURL_DAMPING);
            setMotor(fish.tailJoint, -s * FLOP.CURL_TAIL_ANGLE, FLOP.CURL_STIFFNESS, FLOP.CURL_DAMPING);

            if (hasInput) {
                fish.facingAngle = Math.atan2(fish.moveDir.x, fish.moveDir.y);
            }

            if (fish.phaseTime >= FLOP.CURL_DURATION) {
                console.log(`[CURL→SNAP] curlSign=${s}`);
                fish.phase = 'snap';
                fish.phaseTime = 0;
            }
            break;

        // ── SNAP: tail whips to opposite side, launch forward ──
        case 'snap':
            setMotor(fish.headJoint, s * FLOP.SNAP_HEAD_ANGLE, FLOP.SNAP_STIFFNESS, FLOP.SNAP_DAMPING);
            setMotor(fish.tailJoint, -s * FLOP.SNAP_TAIL_ANGLE, FLOP.SNAP_STIFFNESS, FLOP.SNAP_DAMPING);

            if (fish.phaseTime < dt * 1.5) {
                const fx = Math.sin(fish.facingAngle) * FLOP.MOVE_FORCE;
                const fz = Math.cos(fish.facingAngle) * FLOP.MOVE_FORCE;

                console.log(`[SNAP IMPULSE] fx=${fx.toFixed(2)} y=${FLOP.LAUNCH_UP} fz=${fz.toFixed(2)} tailSlap=${-FLOP.TAIL_SLAP_DOWN}`);
                console.log(`[SNAP PRE-IMPULSE]`);
                logVel('  body', fish.body);

                fish.body.applyImpulse({ x: fx, y: FLOP.LAUNCH_UP, z: fz }, true);
                fish.tail.applyImpulse({ x: 0, y: -FLOP.TAIL_SLAP_DOWN, z: 0 }, true);

                console.log(`[SNAP POST-IMPULSE]`);
                logVel('  body', fish.body);
            }

            if (fish.phaseTime >= FLOP.SNAP_DURATION) {
                fish.curlSign *= -1;  // alternate for next flop
                console.log(`[SNAP→AIRBORNE] curlSign now=${fish.curlSign}`);
                fish.phase = 'airborne';
                fish.phaseTime = 0;
            }
            break;

        case 'airborne':
            setMotor(fish.headJoint, 0, FLOP.AIR_STIFFNESS, FLOP.AIR_DAMPING);
            setMotor(fish.tailJoint, 0, FLOP.AIR_STIFFNESS, FLOP.AIR_DAMPING);

            if (hasInput) {
                const fx = fish.moveDir.x * FLOP.MOVE_FORCE * FLOP.AIR_CONTROL;
                const fz = fish.moveDir.y * FLOP.MOVE_FORCE * FLOP.AIR_CONTROL;
                fish.body.addForce({ x: fx, y: 0, z: fz }, true);
            }

            if (fish.grounded && fish.phaseTime > 0.1) {
                console.log(`[AIRBORNE→LAND] airTime=${fish.phaseTime.toFixed(3)}`);
                logVel('  body', fish.body);
                fish.phase = 'land';
                fish.phaseTime = 0;
            }
            break;

        case 'land':
            setMotor(fish.headJoint, 0, FLOP.CURL_STIFFNESS, FLOP.CURL_DAMPING);
            setMotor(fish.tailJoint, 0, FLOP.CURL_STIFFNESS, FLOP.CURL_DAMPING);

            if (fish.phaseTime >= FLOP.LAND_COOLDOWN) {
                if (spaceDown) {
                    console.log(`[LAND→JUMP_CHARGE] spaceDown=true grounded=${fish.grounded}`);
                    logVel('  body', fish.body);
                    fish.phase = 'jump_charge';
                    fish.phaseTime = 0;
                    fish.jumpCharge = 0;
                } else if (hasInput) {
                    fish.facingAngle = Math.atan2(fish.moveDir.x, fish.moveDir.y);
                    console.log(`[LAND→CURL] facingAngle=${fish.facingAngle.toFixed(2)}`);
                    fish.phase = 'curl';
                    fish.phaseTime = 0;
                } else {
                    console.log(`[LAND→IDLE]`);
                    fish.phase = 'idle';
                    fish.phaseTime = 0;
                }
            }
            break;

        // ── JUMP CHARGE: horizontal coil + downward crouch force ──
        case 'jump_charge':
            fish.jumpCharge = Math.min(fish.jumpCharge + dt, FLOP.JUMP_MAX_CHARGE);
            const chargeT = fish.jumpCharge / FLOP.JUMP_MAX_CHARGE;

            // Slight horizontal coil: head and tail curl inward (opposite signs)
            const coilAmt = chargeT * FLOP.JUMP_CHARGE_COIL;
            setMotor(fish.headJoint, -s * coilAmt, FLOP.CURL_STIFFNESS, FLOP.CURL_DAMPING);
            setMotor(fish.tailJoint, s * coilAmt, FLOP.CURL_STIFFNESS, FLOP.CURL_DAMPING);

            // Push body down for "crouch" visual
            const crouchForce = FLOP.JUMP_CROUCH_FORCE * chargeT;
            // fish.body.addForce({ x: 0, y: crouchForce, z: 0 }, true);

            // DEBUG: log crouch force every 10 frames
            if (Math.random() < 0.1) {
                console.log(`[JUMP_CHARGE] chargeT=${chargeT.toFixed(2)} crouchForce=${crouchForce.toFixed(2)} jumpCharge=${fish.jumpCharge.toFixed(3)}`);
                logVel('  body', fish.body);
            }

            if (hasInput) {
                fish.facingAngle = Math.atan2(fish.moveDir.x, fish.moveDir.y);
                applyFacingForce(fish, dt);
            }

            if (spaceJustReleased) {
                console.log(`[JUMP_CHARGE] Space released! jumpCharge=${fish.jumpCharge.toFixed(3)} minCharge=${FLOP.JUMP_MIN_CHARGE}`);
                if (fish.jumpCharge >= FLOP.JUMP_MIN_CHARGE) {
                    console.log(`[JUMP_CHARGE→JUMP_SNAP] charge=${fish.jumpCharge.toFixed(3)}`);
                    fish.phase = 'jump_snap';
                    fish.phaseTime = 0;
                } else {
                    console.log(`[JUMP_CHARGE→IDLE] charge too short`);
                    fish.phase = 'idle';
                    fish.phaseTime = 0;
                }
            }

            if (!fish.grounded) {
                console.log(`[JUMP_CHARGE] Lost ground! → airborne`);
                logVel('  body', fish.body);
                fish.phase = 'airborne';
                fish.phaseTime = 0;
            }
            break;

        // ── JUMP SNAP: joints snap straight, pure upward impulse ──
        case 'jump_snap':
            setMotor(fish.headJoint, 0, FLOP.JUMP_SNAP_STIFFNESS, FLOP.SNAP_DAMPING);
            setMotor(fish.tailJoint, 0, FLOP.JUMP_SNAP_STIFFNESS, FLOP.SNAP_DAMPING);

            if (fish.phaseTime < dt * 1.5) {
                // jumpCount++;
                const ct = Math.min(fish.jumpCharge / FLOP.JUMP_MAX_CHARGE, 1);
                const upImpulse = FLOP.JUMP_BASE_IMPULSE + ct * FLOP.JUMP_CHARGE_BONUS;

                let fx = 0, fz = 0;
                if (hasInput) {
                    fx = Math.sin(fish.facingAngle) * FLOP.MOVE_FORCE * 0.4;
                    fz = Math.cos(fish.facingAngle) * FLOP.MOVE_FORCE * 0.4;
                }

                // Zero ALL velocities before jump — prevents accumulated
                // physics artifacts from previous landings eating the impulse
                fish.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
                fish.head.setLinvel({ x: 0, y: 0, z: 0 }, true);
                fish.tail.setLinvel({ x: 0, y: 0, z: 0 }, true);
                fish.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
                fish.head.setAngvel({ x: 0, y: 0, z: 0 }, true);
                fish.tail.setAngvel({ x: 0, y: 0, z: 0 }, true);

                // Only impulse the body — joints carry head and tail naturally
                // Giving separate impulses to head/tail creates velocity mismatches
                // that the joint solver resolves by slamming the tail into the ground

                console.log(`\n========== JUMP #${jumpCount} ==========`);
                console.log(`[JUMP_SNAP] ct=${ct.toFixed(2)} upImpulse=${upImpulse.toFixed(2)} fx=${fx.toFixed(2)} fz=${fz.toFixed(2)}`);
                console.log(`[JUMP_SNAP PRE-IMPULSE]`);
                logVel('  body', fish.body);
                logVel('  head', fish.head);
                logVel('  tail', fish.tail);

                fish.body.applyImpulse({ x: fx, y: upImpulse, z: fz }, true);
                fish.head.applyImpulse({ x: 0, y: upImpulse * 0.6, z: 0 }, true);
                fish.tail.applyImpulse({ x: 0, y: upImpulse * 0.2, z: 0 }, true);

                console.log(`[JUMP_SNAP POST-IMPULSE]`);
                logVel('  body', fish.body);
                logVel('  head', fish.head);
                logVel('  tail', fish.tail);

                fish.curlSign *= -1;
            }

            if (fish.phaseTime >= FLOP.JUMP_SNAP_DURATION) {
                console.log(`[JUMP_SNAP→AIRBORNE]`);
                logVel('  body', fish.body);
                fish.phase = 'airborne';
                fish.phaseTime = 0;
            }
            break;
    }

    // DEBUG: log clampVelocity effect on body after state machine
    const finalVel = fish.body.linvel();
    const finalSpeed = Math.sqrt(finalVel.x ** 2 + finalVel.y ** 2 + finalVel.z ** 2);
    if (postClampSpeed !== finalSpeed && (fish.phase === 'jump_snap' || fish.phase === 'snap')) {
        console.log(`[WARN] Velocity changed after clamp! pre=${postClampSpeed.toFixed(2)} post=${finalSpeed.toFixed(2)}`);
    }
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function applyFacingForce(fish: FishBody, dt: number) {
    const rot = fish.body.rotation();
    const q = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
    const euler = new THREE.Euler().setFromQuaternion(q, 'YXZ');

    let diff = fish.facingAngle - euler.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    const yAngVel = fish.body.angvel().y;
    const torqueY = (diff * FLOP.FACING_TORQUE - yAngVel * FLOP.FACING_DAMPING) * dt;
    fish.body.applyTorqueImpulse({ x: 0, y: torqueY, z: 0 }, true);
}

/**
 * Adds vertical liveliness — head bob, tail flap, landing pitch.
 * Applied as direct torque on the X axis (pitch) of each segment.
 * This works alongside the Y-axis revolute joints, giving
 * 2-axis motion without needing spherical joints.
 */
function applyVerticalDynamics(fish: FishBody, dt: number) {
    const phase = fish.phase;

    // ── Idle: gentle breathing — slight periodic pitch ──
    if (phase === 'idle') {
        const breathe = Math.sin(fish.phaseTime * 3) * 0.3;
        fish.head.applyTorqueImpulse({ x: breathe * dt, y: 0, z: 0 }, true);
        fish.tail.applyTorqueImpulse({ x: -breathe * dt * 0.5, y: 0, z: 0 }, true);
    }

    // ── Curl: head pitches up slightly (looking up before hop) ──
    if (phase === 'curl') {
        fish.head.applyTorqueImpulse({ x: -1.5 * dt, y: 0, z: 0 }, true);
        fish.tail.applyTorqueImpulse({ x: 0.8 * dt, y: 0, z: 0 }, true);
    }

    // ── Snap: head ducks, tail flicks up (the vertical component of the whip) ──
    if (phase === 'snap') {
        fish.head.applyTorqueImpulse({ x: 2.0 * dt, y: 0, z: 0 }, true);
        fish.tail.applyTorqueImpulse({ x: -3.0 * dt, y: 0, z: 0 }, true);
    }

    // ── Airborne: tail flutters vertically (looks alive) ──
    if (phase === 'airborne') {
        const flutter = Math.sin(fish.phaseTime * 18) * 1.2;
        fish.tail.applyTorqueImpulse({ x: flutter * dt, y: 0, z: 0 }, true);
        // Head slowly pitches forward (nose-down at peak of arc)
        fish.head.applyTorqueImpulse({ x: 0.5 * dt, y: 0, z: 0 }, true);
    }

    // ── Land: impact pitch — head snaps down, tail kicks up ──
    if (phase === 'land') {
        const impact = Math.max(0, 1 - fish.phaseTime * 20); // fades in ~50ms
        fish.head.applyTorqueImpulse({ x: 3.0 * impact * dt, y: 0, z: 0 }, true);
        fish.tail.applyTorqueImpulse({ x: -2.0 * impact * dt, y: 0, z: 0 }, true);
    }

    // ── Jump charge: head tucks down (coiling) ──
    if (phase === 'jump_charge') {
        const chargeT = fish.jumpCharge / FLOP.JUMP_MAX_CHARGE;
        fish.head.applyTorqueImpulse({ x: 2.0 * chargeT * dt, y: 0, z: 0 }, true);
        fish.tail.applyTorqueImpulse({ x: 1.5 * chargeT * dt, y: 0, z: 0 }, true);
    }

    // ── Jump snap: head whips up ──
    if (phase === 'jump_snap') {
        fish.head.applyTorqueImpulse({ x: -4.0 * dt, y: 0, z: 0 }, true);
        fish.tail.applyTorqueImpulse({ x: 2.0 * dt, y: 0, z: 0 }, true);
    }
}

function applyRecoveryTorque(fish: FishBody) {
    const rot = fish.body.rotation();
    const q = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
    const bodyUp = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const worldUp = new THREE.Vector3(0, 1, 0);

    const cross = new THREE.Vector3().crossVectors(bodyUp, worldUp);
    const dot = bodyUp.dot(worldUp);
    const strength = FLOP.RECOVERY_TORQUE * (1 - dot);

    fish.body.applyTorqueImpulse(
        { x: cross.x * strength * 0.01, y: 0, z: cross.z * strength * 0.01 },
        true
    );
}

function clampVelocity(rb: RAPIER.RigidBody, max: number) {
    const v = rb.linvel();
    const hSpeed = Math.sqrt(v.x ** 2 + v.z ** 2);
    if (hSpeed > max) {
        const s = max / hSpeed;
        const before = { x: v.x, y: v.y, z: v.z };
        rb.setLinvel({ x: v.x * s, y: v.y, z: v.z * s }, true);
        const after = rb.linvel();
        console.log(`[CLAMP] hSpeed=${hSpeed.toFixed(2)} > max=${max} | before.y=${before.y.toFixed(2)} after.y=${after.y.toFixed(2)} | before.x=${before.x.toFixed(2)} after.x=${(v.x * s).toFixed(2)}`);
    }
}

function syncMeshToBody(mesh: THREE.Mesh, rb: RAPIER.RigidBody) {
    const p = rb.translation();
    const r = rb.rotation();
    mesh.position.set(p.x, p.y, p.z);
    mesh.quaternion.set(r.x, r.y, r.z, r.w);
}

function syncEyes(fish: FishBody) {
    const headPos = fish.head.translation();
    const headRot = fish.head.rotation();
    const headQ = new THREE.Quaternion(headRot.x, headRot.y, headRot.z, headRot.w);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(headQ);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(headQ);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(headQ);
    const base = new THREE.Vector3(headPos.x, headPos.y, headPos.z);

    fish.eyeL.position.copy(base)
        .add(right.clone().multiplyScalar(-0.12))
        .add(fwd.clone().multiplyScalar(0.12))
        .add(up.clone().multiplyScalar(0.08));
    fish.eyeL.quaternion.copy(headQ);

    fish.eyeR.position.copy(base)
        .add(right.clone().multiplyScalar(0.12))
        .add(fwd.clone().multiplyScalar(0.12))
        .add(up.clone().multiplyScalar(0.08));
    fish.eyeR.quaternion.copy(headQ);
}

function resetFish(fish: FishBody) {
    console.log('[RESET] Fish reset to spawn');
    const y = 2;
    [fish.body, fish.head, fish.tail].forEach((rb, i) => {
        const z = i === 0 ? 0 : i === 1 ? -0.55 : 0.55;
        rb.setTranslation({ x: 0, y, z }, true);
        rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
        rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
        rb.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    });
    fish.phase = 'idle';
    fish.phaseTime = 0;
    fish.facingAngle = 0;
    fish.jumpCharge = 0;
    fish.curlSign = 1;
}

// ─────────────────────────────────────────────
// TUNING PANEL
// ─────────────────────────────────────────────
function createTuningPanel(container: HTMLElement): HTMLElement {
    const panel = document.createElement('div');
    panel.style.cssText = `
    position:absolute;top:12px;right:12px;width:220px;
    font:12px/1.5 monospace;color:#333;
    background:rgba(255,255,255,0.92);padding:12px;
    border-radius:8px;max-height:90vh;overflow-y:auto;
  `;

    const sliders: [string, keyof typeof FLOP, number, number, number][] = [
        ['Gravity', 'GRAVITY', -40, -5, 0.5],
        ['Floor friction', 'GROUND_FRICTION', 0.01, 1.0, 0.01],
        ['Floor bounce', 'GROUND_RESTITUTION', 0.0, 1.0, 0.05],
        ['Fish friction', 'FISH_FRICTION', 0.01, 1.0, 0.01],
        ['Curl stiffness', 'CURL_STIFFNESS', 50, 500, 10],
        ['Curl head angle', 'CURL_HEAD_ANGLE', 0.1, 0.8, 0.05],
        ['Curl tail angle', 'CURL_TAIL_ANGLE', 0.2, 1.2, 0.05],
        ['Curl duration', 'CURL_DURATION', 0.03, 0.3, 0.01],
        ['Snap stiffness', 'SNAP_STIFFNESS', 200, 1500, 10],
        ['Snap head angle', 'SNAP_HEAD_ANGLE', -0.8, 0.0, 0.05],
        ['Snap tail angle', 'SNAP_TAIL_ANGLE', -1.5, -0.2, 0.05],
        ['Snap duration', 'SNAP_DURATION', 0.02, 0.15, 0.01],
        ['Air stiffness', 'AIR_STIFFNESS', 5, 100, 1],
        ['Move force', 'MOVE_FORCE', 3, 25, 0.5],
        ['Launch up', 'LAUNCH_UP', 1, 12, 0.5],
        ['Tail slap down', 'TAIL_SLAP_DOWN', 0.5, 8, 0.5],
        ['Facing torque', 'FACING_TORQUE', 2, 40, 1],
        ['Facing damping', 'FACING_DAMPING', 1, 20, 0.5],
        ['Recovery torque', 'RECOVERY_TORQUE', 5, 50, 1],
        ['Jump base', 'JUMP_BASE_IMPULSE', 2, 30, 0.5],
        ['Jump charge bonus', 'JUMP_CHARGE_BONUS', 2, 20, 0.5],
        ['Jump charge coil', 'JUMP_CHARGE_COIL', 0.05, 0.8, 0.05],
    ];

    const title = document.createElement('div');
    title.style.cssText = 'font-weight:bold;margin-bottom:8px;font-size:13px';
    title.textContent = 'Flop tuning';
    panel.appendChild(title);

    sliders.forEach(([label, key, min, max, step]) => {
        const row = document.createElement('div');
        row.style.cssText = 'margin:6px 0';

        const lbl = document.createElement('div');
        lbl.style.cssText = 'display:flex;justify-content:space-between';
        const nameSpan = document.createElement('span');
        nameSpan.textContent = label;
        const valSpan = document.createElement('span');
        valSpan.textContent = String(FLOP[key]);
        valSpan.style.fontWeight = 'bold';
        lbl.appendChild(nameSpan);
        lbl.appendChild(valSpan);

        const input = document.createElement('input');
        input.type = 'range';
        input.min = String(min);
        input.max = String(max);
        input.step = String(step);
        input.value = String(FLOP[key]);
        input.style.cssText = 'width:100%';
        input.addEventListener('input', () => {
            (FLOP as any)[key] = parseFloat(input.value);
            valSpan.textContent = parseFloat(input.value).toFixed(step < 1 ? 2 : 0);
        });

        row.appendChild(lbl);
        row.appendChild(input);
        panel.appendChild(row);
    });

    container.appendChild(panel);
    return panel;
}