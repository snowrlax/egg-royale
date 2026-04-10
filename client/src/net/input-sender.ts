import type { PlayerInput } from "@fish-jam/shared";
import type { SocketManager } from "./socket-manager.js";

const INPUT_REDUNDANCY = 3;

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
  const inputBuffer: PlayerInput[] = [];

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

        // Push to ring buffer for redundancy
        inputBuffer.push(toSend);
        if (inputBuffer.length > INPUT_REDUNDANCY) {
          inputBuffer.shift();
        }

        // Send all buffered inputs (oldest to newest)
        socketManager.sendInputs(roomId, playerId, [...inputBuffer]);

        // Clear latch only after send
        pendingSpaceRelease = false;
      }, Math.round(1000 / tickRateHz));
    },

    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
      inputBuffer.length = 0;
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
