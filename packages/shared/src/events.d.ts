/** Client → Server event types */
export declare const clientEvents: {
    readonly quickJoin: "session:quick-join";
    readonly createRoom: "session:create-room";
    readonly joinRoom: "session:join-room";
    readonly leaveRoom: "session:leave-room";
    readonly playerInput: "room:player-input";
};
/** Server → Client event types */
export declare const serverEvents: {
    readonly joined: "session:joined";
    readonly snapshot: "room:snapshot";
    readonly delta: "room:delta";
    readonly playerLeft: "room:player-left";
    readonly protocolError: "protocol:error";
};
export type ClientEventType = (typeof clientEvents)[keyof typeof clientEvents];
export type ServerEventType = (typeof serverEvents)[keyof typeof serverEvents];
