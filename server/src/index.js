import RAPIER from "@dimforge/rapier3d-compat";
import { clientEvents, serverEvents, createEnvelope, parseEnvelope, quickJoinRequestSchema, createRoomRequestSchema, joinRoomRequestSchema, submitInputRequestSchema, } from "@fish-jam/shared";
import { createServerFoundation } from "./server-foundation.js";
import { createRoomManager, RoomError } from "./room-manager.js";
async function main() {
    // Initialize Rapier WASM
    await RAPIER.init();
    const foundation = createServerFoundation({
        port: 3001,
        host: "0.0.0.0",
        tickRate: 30,
    });
    const roomManager = createRoomManager({
        tickLoop: foundation.tickLoop,
        onRoomStepped(roomId, delta) {
            if (delta) {
                foundation.io.to(roomId).emit(serverEvents.delta, createEnvelope(serverEvents.delta, delta));
            }
        },
    });
    const sessions = new Map();
    function emitError(socket, code, message) {
        socket.emit(serverEvents.protocolError, createEnvelope(serverEvents.protocolError, {
            code,
            message,
            recoverable: code !== "internal-error",
        }));
    }
    foundation.io.on("connection", (socket) => {
        console.info(`[socket] connected: ${socket.id}`);
        // ── Quick Join ──
        socket.on(clientEvents.quickJoin, (raw) => {
            try {
                const envelope = parseEnvelope(clientEvents.quickJoin, quickJoinRequestSchema, raw);
                const result = roomManager.quickJoin(envelope.payload.displayName);
                sessions.set(socket.id, {
                    socketId: socket.id,
                    roomId: result.roomId,
                    playerId: result.playerId,
                    lastProcessedSeq: -1,
                });
                socket.join(result.roomId);
                socket.emit(serverEvents.joined, createEnvelope(serverEvents.joined, result));
                socket.emit(serverEvents.snapshot, createEnvelope(serverEvents.snapshot, result.snapshot));
            }
            catch (err) {
                handleError(socket, err);
            }
        });
        // ── Create Room ──
        socket.on(clientEvents.createRoom, (raw) => {
            try {
                const envelope = parseEnvelope(clientEvents.createRoom, createRoomRequestSchema, raw);
                const result = roomManager.createRoom(envelope.payload.displayName);
                sessions.set(socket.id, {
                    socketId: socket.id,
                    roomId: result.roomId,
                    playerId: result.playerId,
                    lastProcessedSeq: -1,
                });
                socket.join(result.roomId);
                socket.emit(serverEvents.joined, createEnvelope(serverEvents.joined, result));
                socket.emit(serverEvents.snapshot, createEnvelope(serverEvents.snapshot, result.snapshot));
            }
            catch (err) {
                handleError(socket, err);
            }
        });
        // ── Join by Code ──
        socket.on(clientEvents.joinRoom, (raw) => {
            try {
                const envelope = parseEnvelope(clientEvents.joinRoom, joinRoomRequestSchema, raw);
                const result = roomManager.joinByCode(envelope.payload.roomCode, envelope.payload.displayName);
                sessions.set(socket.id, {
                    socketId: socket.id,
                    roomId: result.roomId,
                    playerId: result.playerId,
                    lastProcessedSeq: -1,
                });
                socket.join(result.roomId);
                socket.emit(serverEvents.joined, createEnvelope(serverEvents.joined, result));
                socket.emit(serverEvents.snapshot, createEnvelope(serverEvents.snapshot, result.snapshot));
            }
            catch (err) {
                handleError(socket, err);
            }
        });
        // ── Player Input (with redundancy dedup) ──
        socket.on(clientEvents.playerInput, (raw) => {
            try {
                const envelope = parseEnvelope(clientEvents.playerInput, submitInputRequestSchema, raw);
                const session = sessions.get(socket.id);
                if (!session) {
                    emitError(socket, "not-allowed", "join a room first");
                    return;
                }
                if (session.roomId !== envelope.payload.roomId ||
                    session.playerId !== envelope.payload.playerId) {
                    emitError(socket, "invalid-payload", "session mismatch");
                    return;
                }
                // Deduplicate: only forward inputs newer than lastProcessedSeq
                for (const input of envelope.payload.inputs) {
                    if (input.seq > session.lastProcessedSeq) {
                        roomManager.submitInput(envelope.payload.roomId, envelope.payload.playerId, input);
                        session.lastProcessedSeq = input.seq;
                    }
                }
            }
            catch (err) {
                handleError(socket, err);
            }
        });
        // ── Leave Room ──
        socket.on(clientEvents.leaveRoom, () => {
            clearSession(socket.id, "leave");
        });
        // ── Disconnect ──
        socket.on("disconnect", () => {
            console.info(`[socket] disconnected: ${socket.id}`);
            clearSession(socket.id, "disconnect");
        });
    });
    function clearSession(socketId, reason) {
        const session = sessions.get(socketId);
        if (!session)
            return;
        sessions.delete(socketId);
        // Both leave and disconnect fully remove the player (no reconnect yet)
        roomManager.leaveRoom(session.roomId, session.playerId);
        foundation.io.to(session.roomId).emit(serverEvents.playerLeft, createEnvelope(serverEvents.playerLeft, { playerId: session.playerId }));
    }
    function handleError(socket, err) {
        if (err instanceof RoomError) {
            emitError(socket, err.code, err.message);
            return;
        }
        console.error("[socket] unhandled error", err);
        emitError(socket, "internal-error", "unexpected server error");
    }
    // ── Start ──
    const addr = await foundation.start();
    console.info(`fish-jam server listening on http://${addr.host}:${addr.port}`);
    console.info(`  tick rate: ${foundation.tickLoop.getTickRate()} Hz`);
    console.info(`  health: http://${addr.host}:${addr.port}/health`);
}
main().catch((err) => {
    console.error("fatal:", err);
    process.exit(1);
});
