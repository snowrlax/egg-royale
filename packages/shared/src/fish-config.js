/** Physics tuning constants for the fish ragdoll, extracted from fish-flop.ts. */
export const FLOP = {
    // ── Segment dimensions ──
    HEAD_RADIUS: 0.25,
    BODY_HALF_HEIGHT: 0.3,
    BODY_RADIUS: 0.28,
    TAIL_RADIUS: 0.18,
    // ── Mass distribution ──
    HEAD_MASS: 1.0,
    BODY_MASS: 2.5,
    TAIL_MASS: 0.4,
    // ── Joint limits ──
    JOINT_LIMIT: 1.2,
    // ── Flop cycle: CURL phase ──
    CURL_DURATION: 0.12,
    CURL_HEAD_ANGLE: 0.35,
    CURL_TAIL_ANGLE: 0.7,
    CURL_STIFFNESS: 200,
    CURL_DAMPING: 8,
    // ── Flop cycle: SNAP phase ──
    SNAP_DURATION: 0.06,
    SNAP_HEAD_ANGLE: -0.6,
    SNAP_TAIL_ANGLE: -1.2,
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
    LAUNCH_UP: 8,
    TAIL_SLAP_DOWN: 6,
    MAX_VELOCITY: 12,
    // ── Jump charge ──
    JUMP_CHARGE_COIL: 0.3,
    JUMP_SNAP_STIFFNESS: 900,
    JUMP_SNAP_DURATION: 0.06,
    JUMP_MIN_CHARGE: 0.06,
    JUMP_MAX_CHARGE: 0.6,
    JUMP_BASE_IMPULSE: 14,
    JUMP_CHARGE_BONUS: 10,
    JUMP_CROUCH_FORCE: -5,
    // ── World ──
    GRAVITY: -25,
    GROUND_FRICTION: 0.6,
    GROUND_RESTITUTION: 0.15,
    FISH_FRICTION: 0.4,
    FISH_RESTITUTION: 0.15,
    // ── Damping ──
    LINEAR_DAMPING: 0.5,
    ANGULAR_DAMPING: 0.4,
    // ── Ground detection ──
    GROUND_RAY_LENGTH: 0.15,
    // ── Cube Movement (authoritative values) ──
    CUBE_MOVE_SPEED: 6.0,
    CUBE_AIR_CONTROL: 0.3,
    CUBE_DAMPING: 5.0, // Linear and angular damping
    CUBE_GROUNDED_RAY: 0.6, // Raycast distance for ground check
    CUBE_GROUNDED_MARGIN: 0.1, // Extra margin for ground detection
    CUBE_JUMP_MIN_CHARGE: 0.05,
    CUBE_JUMP_MAX_CHARGE: 0.5,
    CUBE_JUMP_BASE: 6.0,
    CUBE_JUMP_BONUS: 6.0,
    // ── Sumo collision tuning ──
    PLAYER_MASS: 1.5,
    PLAYER_FRICTION: 0.3,
    PLAYER_RESTITUTION: 0.4,
    FALL_THRESHOLD: -5,
};
