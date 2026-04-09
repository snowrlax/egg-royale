import RAPIER from "@dimforge/rapier3d-compat";
import {
  clientEvents,
  serverEvents,
  createEnvelope,
  parseEnvelope,
  quickJoinRequestSchema,
  createRoomRequestSchema,
  joinRoomRequestSchema,
  submitInputRequestSchema,
  protocolErrorSchema,
} from "@fish-jam/shared";
import type { ProtocolErrorCode, RoomDelta } from "@fish-jam/shared";

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
        foundation.io.to(roomId).emit(
          serverEvents.delta,
          createEnvelope(serverEvents.delta, delta)
        );
      }
    },
  });

  // ── Socket.IO connection handling ──

  type Session = {
    socketId: string;
    roomId: string;
    playerId: string;
  };

  const sessions = new Map<string, Session>();

  function emitError(
    socket: { emit: (ev: string, data: unknown) => void },
    code: ProtocolErrorCode,
    message: string
  ): void {
    socket.emit(
      serverEvents.protocolError,
      createEnvelope(serverEvents.protocolError, {
        code,
        message,
        recoverable: code !== "internal-error",
      })
    );
  }

  foundation.io.on("connection", (socket) => {
    console.info(`[socket] connected: ${socket.id}`);

    // ── Quick Join ──
    socket.on(clientEvents.quickJoin, (raw: unknown) => {
      try {
        const envelope = parseEnvelope(
          clientEvents.quickJoin,
          quickJoinRequestSchema,
          raw
        );
        const result = roomManager.quickJoin(envelope.payload.displayName);

        sessions.set(socket.id, {
          socketId: socket.id,
          roomId: result.roomId,
          playerId: result.playerId,
        });
        socket.join(result.roomId);

        socket.emit(
          serverEvents.joined,
          createEnvelope(serverEvents.joined, result)
        );
        socket.emit(
          serverEvents.snapshot,
          createEnvelope(serverEvents.snapshot, result.snapshot)
        );
      } catch (err) {
        handleError(socket, err);
      }
    });

    // ── Create Room ──
    socket.on(clientEvents.createRoom, (raw: unknown) => {
      try {
        const envelope = parseEnvelope(
          clientEvents.createRoom,
          createRoomRequestSchema,
          raw
        );
        const result = roomManager.createRoom(envelope.payload.displayName);

        sessions.set(socket.id, {
          socketId: socket.id,
          roomId: result.roomId,
          playerId: result.playerId,
        });
        socket.join(result.roomId);

        socket.emit(
          serverEvents.joined,
          createEnvelope(serverEvents.joined, result)
        );
        socket.emit(
          serverEvents.snapshot,
          createEnvelope(serverEvents.snapshot, result.snapshot)
        );
      } catch (err) {
        handleError(socket, err);
      }
    });

    // ── Join by Code ──
    socket.on(clientEvents.joinRoom, (raw: unknown) => {
      try {
        const envelope = parseEnvelope(
          clientEvents.joinRoom,
          joinRoomRequestSchema,
          raw
        );
        const result = roomManager.joinByCode(
          envelope.payload.roomCode,
          envelope.payload.displayName
        );

        sessions.set(socket.id, {
          socketId: socket.id,
          roomId: result.roomId,
          playerId: result.playerId,
        });
        socket.join(result.roomId);

        socket.emit(
          serverEvents.joined,
          createEnvelope(serverEvents.joined, result)
        );
        socket.emit(
          serverEvents.snapshot,
          createEnvelope(serverEvents.snapshot, result.snapshot)
        );
      } catch (err) {
        handleError(socket, err);
      }
    });

    // ── Player Input ──
    socket.on(clientEvents.playerInput, (raw: unknown) => {
      try {
        const envelope = parseEnvelope(
          clientEvents.playerInput,
          submitInputRequestSchema,
          raw
        );
        const session = sessions.get(socket.id);
        if (!session) {
          emitError(socket, "not-allowed", "join a room first");
          return;
        }
        if (
          session.roomId !== envelope.payload.roomId ||
          session.playerId !== envelope.payload.playerId
        ) {
          emitError(socket, "invalid-payload", "session mismatch");
          return;
        }
        roomManager.submitInput(
          envelope.payload.roomId,
          envelope.payload.playerId,
          envelope.payload.input
        );
      } catch (err) {
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

  function clearSession(socketId: string, reason: "leave" | "disconnect"): void {
    const session = sessions.get(socketId);
    if (!session) return;
    sessions.delete(socketId);

    if (reason === "disconnect") {
      roomManager.disconnectPlayer(session.roomId, session.playerId);
    } else {
      roomManager.leaveRoom(session.roomId, session.playerId);
    }
  }

  function handleError(
    socket: { emit: (ev: string, data: unknown) => void },
    err: unknown
  ): void {
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
