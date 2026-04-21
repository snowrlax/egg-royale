import { randomUUID } from "node:crypto";
import type {
  ProtocolErrorCode,
  GameSnapshot,
  JoinResult,
  PlayerInput,
  RoomDelta,
} from "@fish-jam/shared";
import type { TickLoop } from "./server-foundation.js";
import { createGameLoop, type GameLoop, type GameLoopCallbacks } from "./game-loop.js";

const MAX_PLAYERS = 6;
const ROOM_CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const ROOM_CODE_LENGTH = 4;
const EMPTY_ROOM_TTL_MS = 30_000;

// Spawn positions in circle layout
const SPAWN_POSITIONS = [
  { x: -4, y: 2, z: 0 }, // Left
  { x: 4, y: 2, z: 0 }, // Right
  { x: 0, y: 2, z: -4 }, // Front
  { x: 0, y: 2, z: 4 }, // Back
  { x: -3, y: 2, z: -3 }, // Front-left
  { x: 3, y: 2, z: 3 }, // Back-right
];

// Player colors
const PLAYER_COLORS = [
  "#ff8c42", // Orange
  "#4287f5", // Blue
  "#42f554", // Green
  "#f542e9", // Magenta
  "#f5f542", // Yellow
  "#42f5f5", // Cyan
];

export class RoomError extends Error {
  readonly code: ProtocolErrorCode;
  constructor(code: ProtocolErrorCode, message: string) {
    super(message);
    this.name = "RoomError";
    this.code = code;
  }
}

function generateRoomCode(existing: Set<string>): string {
  for (let attempt = 0; attempt < 32; attempt++) {
    let code = "";
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
    }
    if (!existing.has(code)) return code;
  }
  throw new RoomError("internal-error", "failed to generate unique room code");
}

// ── Room ──

type RoomMember = {
  playerId: string;
  displayName: string;
  connected: boolean;
};

type Room = {
  roomId: string;
  roomCode: string;
  members: Map<string, RoomMember>;
  gameLoop: GameLoop;
  emptyAt: number | null;
};

// ── Registry ──

export type RoomStepCallback = (
  roomId: string,
  delta: RoomDelta | null
) => void;

export type RoomEventCallback = (
  roomId: string,
  playerId: string
) => void;

export type RoomManagerOptions = {
  tickLoop: TickLoop;
  onRoomStepped: RoomStepCallback;
  onPlayerEliminated?: RoomEventCallback;
  onRoundWinner?: RoomEventCallback;
};

export type RoomManager = {
  quickJoin(displayName?: string): JoinResult;
  createRoom(displayName?: string): JoinResult;
  joinByCode(roomCode: string, displayName?: string): JoinResult;
  leaveRoom(roomId: string, playerId: string): boolean;
  disconnectPlayer(roomId: string, playerId: string): boolean;
  submitInput(roomId: string, playerId: string, input: PlayerInput): void;
  getRoomCount(): number;
};

let anonymousCounter = 1;

export function createRoomManager(options: RoomManagerOptions): RoomManager {
  const roomsById = new Map<string, Room>();
  const roomsByCode = new Map<string, Room>();

  function resolveDisplayName(name?: string): string {
    if (name && name.trim().length > 0) return name.trim().slice(0, 24);
    return `Fish ${anonymousCounter++}`;
  }

  function createPlayerId(): string {
    return `player-${randomUUID()}`;
  }

  function pruneIfEmpty(room: Room): void {
    const connected = [...room.members.values()].filter((m) => m.connected).length;
    if (connected === 0 && room.members.size === 0) {
      destroyRoom(room);
    }
  }

  function destroyRoom(room: Room): void {
    options.tickLoop.unregisterRoom(room.roomId);
    room.gameLoop.dispose();
    roomsById.delete(room.roomId);
    roomsByCode.delete(room.roomCode);
  }

  function spawnRoom(): Room {
    const codes = new Set(roomsByCode.keys());
    const roomId = `room-${randomUUID()}`;
    const roomCode = generateRoomCode(codes);

    // Create callbacks that include roomId
    const gameLoopCallbacks: GameLoopCallbacks = {
      onPlayerEliminated: (playerId) => {
        options.onPlayerEliminated?.(roomId, playerId);
      },
      onRoundWinner: (winnerId) => {
        options.onRoundWinner?.(roomId, winnerId);
      },
    };

    const gameLoop = createGameLoop(gameLoopCallbacks);

    const room: Room = {
      roomId,
      roomCode,
      members: new Map(),
      gameLoop,
      emptyAt: null,
    };

    roomsById.set(roomId, room);
    roomsByCode.set(roomCode, room);

    options.tickLoop.registerRoom({
      roomId,
      step() {
        const delta = gameLoop.step();
        options.onRoomStepped(roomId, delta);

        // Auto-dispose empty rooms
        const connected = [...room.members.values()].filter(
          (m) => m.connected
        ).length;
        if (connected === 0) {
          if (room.emptyAt === null) room.emptyAt = Date.now();
          if (Date.now() - room.emptyAt > EMPTY_ROOM_TTL_MS) {
            destroyRoom(room);
          }
        } else {
          room.emptyAt = null;
        }
      },
    });

    return room;
  }

  function joinRoom(room: Room, displayName?: string): JoinResult {
    if (room.members.size >= MAX_PLAYERS) {
      throw new RoomError("room-full", "room is full");
    }

    const playerId = createPlayerId();
    const name = resolveDisplayName(displayName);

    // Get spawn position and color based on player index
    const playerIndex = room.members.size;
    const spawnPos = SPAWN_POSITIONS[playerIndex % SPAWN_POSITIONS.length];
    const color = PLAYER_COLORS[playerIndex % PLAYER_COLORS.length];

    // Add player to game loop physics
    room.gameLoop.addPlayer(playerId, spawnPos, color);

    room.members.set(playerId, {
      playerId,
      displayName: name,
      connected: true,
    });

    room.emptyAt = null;

    return {
      roomId: room.roomId,
      roomCode: room.roomCode,
      playerId,
      snapshot: room.gameLoop.exportSnapshot(),
    };
  }

  function findBestQuickJoinRoom(): Room | null {
    let best: Room | null = null;
    let bestCount = 0;

    for (const room of roomsById.values()) {
      const connected = [...room.members.values()].filter(
        (m) => m.connected
      ).length;
      if (connected > 0 && room.members.size < MAX_PLAYERS && connected > bestCount) {
        best = room;
        bestCount = connected;
      }
    }

    return best;
  }

  return {
    quickJoin(displayName) {
      const existing = findBestQuickJoinRoom();
      const room = existing ?? spawnRoom();
      return joinRoom(room, displayName);
    },

    createRoom(displayName) {
      const room = spawnRoom();
      return joinRoom(room, displayName);
    },

    joinByCode(roomCode, displayName) {
      const room = roomsByCode.get(roomCode.toUpperCase());
      if (!room) {
        throw new RoomError("room-not-found", `unknown room code: ${roomCode}`);
      }
      return joinRoom(room, displayName);
    },

    leaveRoom(roomId, playerId) {
      const room = roomsById.get(roomId);
      if (!room) return false;

      const member = room.members.get(playerId);
      if (!member) return false;

      // Remove from physics
      room.gameLoop.removePlayer(playerId);

      room.members.delete(playerId);
      pruneIfEmpty(room);
      return true;
    },

    disconnectPlayer(roomId, playerId) {
      const room = roomsById.get(roomId);
      if (!room) return false;

      const member = room.members.get(playerId);
      if (!member) return false;

      member.connected = false;
      return true;
    },

    submitInput(roomId, playerId, input) {
      const room = roomsById.get(roomId);
      if (!room) throw new RoomError("room-not-found", `unknown room: ${roomId}`);
      room.gameLoop.enqueueInput(playerId, input);
    },

    getRoomCount() {
      return roomsById.size;
    },
  };
}
