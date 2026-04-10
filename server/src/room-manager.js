import { randomUUID } from "node:crypto";
import { createGameLoop } from "./game-loop.js";
const MAX_PLAYERS = 6;
const ROOM_CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const ROOM_CODE_LENGTH = 4;
const EMPTY_ROOM_TTL_MS = 30_000;
export class RoomError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = "RoomError";
        this.code = code;
    }
}
function generateRoomCode(existing) {
    for (let attempt = 0; attempt < 32; attempt++) {
        let code = "";
        for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
            code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
        }
        if (!existing.has(code))
            return code;
    }
    throw new RoomError("internal-error", "failed to generate unique room code");
}
let anonymousCounter = 1;
export function createRoomManager(options) {
    const roomsById = new Map();
    const roomsByCode = new Map();
    function resolveDisplayName(name) {
        if (name && name.trim().length > 0)
            return name.trim().slice(0, 24);
        return `Fish ${anonymousCounter++}`;
    }
    function createPlayerId() {
        return `player-${randomUUID()}`;
    }
    function pruneIfEmpty(room) {
        const connected = [...room.members.values()].filter((m) => m.connected).length;
        if (connected === 0 && room.members.size === 0) {
            destroyRoom(room);
        }
    }
    function destroyRoom(room) {
        options.tickLoop.unregisterRoom(room.roomId);
        room.gameLoop.dispose();
        roomsById.delete(room.roomId);
        roomsByCode.delete(room.roomCode);
    }
    function spawnRoom() {
        const codes = new Set(roomsByCode.keys());
        const roomId = `room-${randomUUID()}`;
        const roomCode = generateRoomCode(codes);
        const gameLoop = createGameLoop();
        const room = {
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
                const connected = [...room.members.values()].filter((m) => m.connected).length;
                if (connected === 0) {
                    if (room.emptyAt === null)
                        room.emptyAt = Date.now();
                    if (Date.now() - room.emptyAt > EMPTY_ROOM_TTL_MS) {
                        destroyRoom(room);
                    }
                }
                else {
                    room.emptyAt = null;
                }
            },
        });
        return room;
    }
    function joinRoom(room, displayName) {
        if (room.members.size >= MAX_PLAYERS) {
            throw new RoomError("room-full", "room is full");
        }
        const playerId = createPlayerId();
        const name = resolveDisplayName(displayName);
        room.members.set(playerId, {
            playerId,
            displayName: name,
            connected: true,
        });
        room.gameLoop.addFish(playerId);
        room.emptyAt = null;
        return {
            roomId: room.roomId,
            roomCode: room.roomCode,
            playerId,
            snapshot: room.gameLoop.exportSnapshot(),
        };
    }
    function findBestQuickJoinRoom() {
        let best = null;
        let bestCount = 0;
        for (const room of roomsById.values()) {
            const connected = [...room.members.values()].filter((m) => m.connected).length;
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
            if (!room)
                return false;
            const member = room.members.get(playerId);
            if (!member)
                return false;
            room.members.delete(playerId);
            room.gameLoop.removeFish(playerId);
            pruneIfEmpty(room);
            return true;
        },
        disconnectPlayer(roomId, playerId) {
            const room = roomsById.get(roomId);
            if (!room)
                return false;
            const member = room.members.get(playerId);
            if (!member)
                return false;
            member.connected = false;
            return true;
        },
        submitInput(roomId, playerId, input) {
            const room = roomsById.get(roomId);
            if (!room)
                throw new RoomError("room-not-found", `unknown room: ${roomId}`);
            room.gameLoop.enqueueInput(playerId, input);
        },
        getRoomCount() {
            return roomsById.size;
        },
    };
}
