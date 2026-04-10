import { z } from "zod";

// ── Primitives ──

export const playerIdSchema = z.string().min(1).max(64);
export const roomIdSchema = z.string().min(1).max(64);
export const roomCodeSchema = z
  .string()
  .length(4)
  .regex(/^[A-Z0-9]{4}$/);
export const finiteNumberSchema = z.number().finite();
export const nonNegativeIntegerSchema = z.number().int().nonnegative();

// ── Player Input ──

export const playerInputSchema = z.object({
  seq: nonNegativeIntegerSchema,
  moveX: z.number().min(-1).max(1),
  moveY: z.number().min(-1).max(1),
  spaceDown: z.boolean(),
  spaceJustReleased: z.boolean(),
});

// ── Session Requests ──

export const quickJoinRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(24).optional(),
});

export const createRoomRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(24).optional(),
});

export const joinRoomRequestSchema = z.object({
  roomCode: roomCodeSchema,
  displayName: z.string().trim().min(1).max(24).optional(),
});

export const leaveRoomRequestSchema = z.object({
  roomId: roomIdSchema,
});

export const submitInputRequestSchema = z.object({
  roomId: roomIdSchema,
  playerId: playerIdSchema,
  input: playerInputSchema,
});

// ── State Snapshots ──

export const vec3TupleSchema = z.tuple([
  finiteNumberSchema,
  finiteNumberSchema,
  finiteNumberSchema,
]);

export const quatTupleSchema = z.tuple([
  finiteNumberSchema,
  finiteNumberSchema,
  finiteNumberSchema,
  finiteNumberSchema,
]);

export const bodySnapshotSchema = z.object({
  pos: vec3TupleSchema,
  rot: quatTupleSchema,
});

export const flopPhaseSchema = z.enum([
  "idle",
  "curl",
  "snap",
  "airborne",
  "land",
  "jump_charge",
  "jump_snap",
]);

export const fishStateSchema = z.object({
  id: z.string(),
  body: bodySnapshotSchema,
  head: bodySnapshotSchema,
  tail: bodySnapshotSchema,
  phase: flopPhaseSchema,
  curlSign: z.number(),
  damage: nonNegativeIntegerSchema,
  color: z.string(),
});

export const gameSnapshotSchema = z.object({
  tick: nonNegativeIntegerSchema,
  fish: z.array(fishStateSchema),
});

export const roomDeltaSchema = z.object({
  tick: nonNegativeIntegerSchema,
  updatedFish: z.array(fishStateSchema),
  removedFishIds: z.array(z.string()),
});

// ── Join Result ──

export const joinResultSchema = z.object({
  roomId: roomIdSchema,
  roomCode: roomCodeSchema,
  playerId: playerIdSchema,
  snapshot: gameSnapshotSchema,
});

// ── Player Left ──

export const playerLeftPayloadSchema = z.object({
  playerId: playerIdSchema,
});

// ── Protocol Error ──

export const protocolErrorCodeSchema = z.enum([
  "invalid-payload",
  "room-not-found",
  "room-full",
  "not-allowed",
  "internal-error",
]);

export const protocolErrorSchema = z.object({
  code: protocolErrorCodeSchema,
  message: z.string().min(1),
  recoverable: z.boolean(),
});

export type ProtocolErrorCode = z.infer<typeof protocolErrorCodeSchema>;
