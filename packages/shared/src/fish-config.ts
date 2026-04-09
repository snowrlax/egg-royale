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
  MAX_VELOCITY: 9,

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
  GROUND_FRICTION: 0.4,
  GROUND_RESTITUTION: 0.3,
  FISH_FRICTION: 0.2,
  FISH_RESTITUTION: 0.3,

  // ── Ground detection ──
  GROUND_RAY_LENGTH: 0.15,
} as const;

export type FlopConfig = typeof FLOP;
