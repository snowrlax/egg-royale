/** Client → Server event types */
export const clientEvents = {
    quickJoin: "session:quick-join",
    createRoom: "session:create-room",
    joinRoom: "session:join-room",
    leaveRoom: "session:leave-room",
    playerInput: "room:player-input",
};
/** Server → Client event types */
export const serverEvents = {
    joined: "session:joined",
    snapshot: "room:snapshot",
    delta: "room:delta",
    playerLeft: "room:player-left",
    protocolError: "protocol:error",
};
