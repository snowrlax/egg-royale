/** Client → Server event types */
export const clientEvents = {
  quickJoin: "session:quick-join",
  createRoom: "session:create-room",
  joinRoom: "session:join-room",
  leaveRoom: "session:leave-room",
  playerInput: "room:player-input",
} as const;

/** Server → Client event types */
export const serverEvents = {
  joined: "session:joined",
  snapshot: "room:snapshot",
  delta: "room:delta",
  playerLeft: "room:player-left",
  playerEliminated: "room:player-eliminated",
  roundWinner: "room:round-winner",
  protocolError: "protocol:error",
} as const;

export type ClientEventType = (typeof clientEvents)[keyof typeof clientEvents];
export type ServerEventType = (typeof serverEvents)[keyof typeof serverEvents];
