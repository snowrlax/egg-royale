import type { PlayerInput } from "@fish-jam/shared";
import type { SocketManager } from "./socket-manager.js";

export type InputSender = {
  start(roomId: string, playerId: string): void;
  stop(): void;
  setInput(input: PlayerInput): void;
};

export function createInputSender(
  socketManager: SocketManager,
  tickRateHz: number = 30
): InputSender {
  let timer: ReturnType<typeof setInterval> | null = null;
  let latestInput: PlayerInput | null = null;
  let pendingSpaceRelease = false;
  let seq = 0;

  return {
    start(roomId, playerId) {
      if (timer) return;
      timer = setInterval(() => {
        if (!latestInput) return;

        const toSend: PlayerInput = {
          ...latestInput,
          seq: seq++,
          spaceJustReleased: pendingSpaceRelease,
        };

        socketManager.sendInput(roomId, playerId, toSend);
        pendingSpaceRelease = false;
      }, Math.round(1000 / tickRateHz));
    },

    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    },

    setInput(input) {
      // Latch spaceJustReleased so it survives until next send tick
      if (input.spaceJustReleased) {
        pendingSpaceRelease = true;
      }
      latestInput = input;
    },
  };
}
