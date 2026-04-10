import { io, type Socket } from "socket.io-client";
import {
  clientEvents,
  serverEvents,
  createEnvelope,
  parseEnvelope,
  joinResultSchema,
  gameSnapshotSchema,
  roomDeltaSchema,
  playerLeftPayloadSchema,
  protocolErrorSchema,
  type JoinResult,
  type GameSnapshot,
  type RoomDelta,
  type PlayerInput,
} from "@fish-jam/shared";

export type SocketManagerCallbacks = {
  onJoined(result: JoinResult): void;
  onSnapshot(snapshot: GameSnapshot): void;
  onDelta(delta: RoomDelta): void;
  onPlayerLeft(playerId: string): void;
  onError(code: string, message: string): void;
  onDisconnect(reason: string): void;
};

export type SocketManager = {
  connect(serverUrl: string): void;
  quickJoin(displayName?: string): void;
  sendInputs(roomId: string, playerId: string, inputs: PlayerInput[]): void;
  disconnect(): void;
  isConnected(): boolean;
};

export function createSocketManager(
  callbacks: SocketManagerCallbacks
): SocketManager {
  let socket: Socket | null = null;

  function attachListeners(sock: Socket): void {
    sock.on(serverEvents.joined, (raw: unknown) => {
      try {
        const env = parseEnvelope(
          serverEvents.joined,
          joinResultSchema,
          raw
        );
        callbacks.onJoined(env.payload);
      } catch (err) {
        console.error("[socket-manager] failed to parse joined", err);
      }
    });

    sock.on(serverEvents.snapshot, (raw: unknown) => {
      try {
        const env = parseEnvelope(
          serverEvents.snapshot,
          gameSnapshotSchema,
          raw
        );
        callbacks.onSnapshot(env.payload);
      } catch (err) {
        console.error("[socket-manager] failed to parse snapshot", err);
      }
    });

    sock.on(serverEvents.delta, (raw: unknown) => {
      try {
        const env = parseEnvelope(
          serverEvents.delta,
          roomDeltaSchema,
          raw
        );
        callbacks.onDelta(env.payload);
      } catch (err) {
        console.error("[socket-manager] failed to parse delta", err);
      }
    });

    sock.on(serverEvents.playerLeft, (raw: unknown) => {
      try {
        const env = parseEnvelope(
          serverEvents.playerLeft,
          playerLeftPayloadSchema,
          raw
        );
        callbacks.onPlayerLeft(env.payload.playerId);
      } catch (err) {
        console.error("[socket-manager] failed to parse playerLeft", err);
      }
    });

    sock.on(serverEvents.protocolError, (raw: unknown) => {
      try {
        const env = parseEnvelope(
          serverEvents.protocolError,
          protocolErrorSchema,
          raw
        );
        callbacks.onError(env.payload.code, env.payload.message);
      } catch (err) {
        console.error("[socket-manager] failed to parse error", err);
      }
    });

    sock.on("disconnect", (reason: string) => {
      callbacks.onDisconnect(reason);
    });
  }

  return {
    connect(serverUrl) {
      if (socket) return;
      socket = io(serverUrl, {
        transports: ["websocket"],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
      });
      attachListeners(socket);
    },

    quickJoin(displayName) {
      if (!socket) return;
      socket.emit(
        clientEvents.quickJoin,
        createEnvelope(clientEvents.quickJoin, {
          displayName: displayName ?? undefined,
        })
      );
    },

    sendInputs(roomId, playerId, inputs) {
      if (!socket) return;
      socket.emit(
        clientEvents.playerInput,
        createEnvelope(clientEvents.playerInput, {
          roomId,
          playerId,
          inputs,
        })
      );
    },

    disconnect() {
      if (!socket) return;
      socket.disconnect();
      socket = null;
    },

    isConnected() {
      return socket?.connected ?? false;
    },
  };
}
