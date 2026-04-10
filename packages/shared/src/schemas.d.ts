import { z } from "zod";
export declare const playerIdSchema: z.ZodString;
export declare const roomIdSchema: z.ZodString;
export declare const roomCodeSchema: z.ZodString;
export declare const finiteNumberSchema: z.ZodNumber;
export declare const nonNegativeIntegerSchema: z.ZodNumber;
export declare const playerInputSchema: z.ZodObject<{
    seq: z.ZodNumber;
    moveX: z.ZodNumber;
    moveY: z.ZodNumber;
    spaceDown: z.ZodBoolean;
    spaceJustReleased: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    seq: number;
    moveX: number;
    moveY: number;
    spaceDown: boolean;
    spaceJustReleased: boolean;
}, {
    seq: number;
    moveX: number;
    moveY: number;
    spaceDown: boolean;
    spaceJustReleased: boolean;
}>;
export declare const quickJoinRequestSchema: z.ZodObject<{
    displayName: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    displayName?: string | undefined;
}, {
    displayName?: string | undefined;
}>;
export declare const createRoomRequestSchema: z.ZodObject<{
    displayName: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    displayName?: string | undefined;
}, {
    displayName?: string | undefined;
}>;
export declare const joinRoomRequestSchema: z.ZodObject<{
    roomCode: z.ZodString;
    displayName: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    roomCode: string;
    displayName?: string | undefined;
}, {
    roomCode: string;
    displayName?: string | undefined;
}>;
export declare const leaveRoomRequestSchema: z.ZodObject<{
    roomId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    roomId: string;
}, {
    roomId: string;
}>;
export declare const playerInputPacketSchema: z.ZodObject<{
    inputs: z.ZodArray<z.ZodObject<{
        seq: z.ZodNumber;
        moveX: z.ZodNumber;
        moveY: z.ZodNumber;
        spaceDown: z.ZodBoolean;
        spaceJustReleased: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        seq: number;
        moveX: number;
        moveY: number;
        spaceDown: boolean;
        spaceJustReleased: boolean;
    }, {
        seq: number;
        moveX: number;
        moveY: number;
        spaceDown: boolean;
        spaceJustReleased: boolean;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    inputs: {
        seq: number;
        moveX: number;
        moveY: number;
        spaceDown: boolean;
        spaceJustReleased: boolean;
    }[];
}, {
    inputs: {
        seq: number;
        moveX: number;
        moveY: number;
        spaceDown: boolean;
        spaceJustReleased: boolean;
    }[];
}>;
export declare const submitInputRequestSchema: z.ZodObject<{
    roomId: z.ZodString;
    playerId: z.ZodString;
    inputs: z.ZodArray<z.ZodObject<{
        seq: z.ZodNumber;
        moveX: z.ZodNumber;
        moveY: z.ZodNumber;
        spaceDown: z.ZodBoolean;
        spaceJustReleased: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        seq: number;
        moveX: number;
        moveY: number;
        spaceDown: boolean;
        spaceJustReleased: boolean;
    }, {
        seq: number;
        moveX: number;
        moveY: number;
        spaceDown: boolean;
        spaceJustReleased: boolean;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    roomId: string;
    inputs: {
        seq: number;
        moveX: number;
        moveY: number;
        spaceDown: boolean;
        spaceJustReleased: boolean;
    }[];
    playerId: string;
}, {
    roomId: string;
    inputs: {
        seq: number;
        moveX: number;
        moveY: number;
        spaceDown: boolean;
        spaceJustReleased: boolean;
    }[];
    playerId: string;
}>;
export declare const vec3TupleSchema: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
export declare const quatTupleSchema: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
export declare const bodySnapshotSchema: z.ZodObject<{
    pos: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
    rot: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
}, "strip", z.ZodTypeAny, {
    pos: [number, number, number];
    rot: [number, number, number, number];
}, {
    pos: [number, number, number];
    rot: [number, number, number, number];
}>;
export declare const flopPhaseSchema: z.ZodEnum<["idle", "curl", "snap", "airborne", "land", "jump_charge", "jump_snap"]>;
export declare const fishStateSchema: z.ZodObject<{
    id: z.ZodString;
    body: z.ZodObject<{
        pos: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
        rot: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
    }, "strip", z.ZodTypeAny, {
        pos: [number, number, number];
        rot: [number, number, number, number];
    }, {
        pos: [number, number, number];
        rot: [number, number, number, number];
    }>;
    head: z.ZodObject<{
        pos: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
        rot: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
    }, "strip", z.ZodTypeAny, {
        pos: [number, number, number];
        rot: [number, number, number, number];
    }, {
        pos: [number, number, number];
        rot: [number, number, number, number];
    }>;
    tail: z.ZodObject<{
        pos: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
        rot: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
    }, "strip", z.ZodTypeAny, {
        pos: [number, number, number];
        rot: [number, number, number, number];
    }, {
        pos: [number, number, number];
        rot: [number, number, number, number];
    }>;
    phase: z.ZodEnum<["idle", "curl", "snap", "airborne", "land", "jump_charge", "jump_snap"]>;
    curlSign: z.ZodNumber;
    damage: z.ZodNumber;
    color: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    body: {
        pos: [number, number, number];
        rot: [number, number, number, number];
    };
    head: {
        pos: [number, number, number];
        rot: [number, number, number, number];
    };
    tail: {
        pos: [number, number, number];
        rot: [number, number, number, number];
    };
    phase: "idle" | "curl" | "snap" | "airborne" | "land" | "jump_charge" | "jump_snap";
    curlSign: number;
    damage: number;
    color: string;
}, {
    id: string;
    body: {
        pos: [number, number, number];
        rot: [number, number, number, number];
    };
    head: {
        pos: [number, number, number];
        rot: [number, number, number, number];
    };
    tail: {
        pos: [number, number, number];
        rot: [number, number, number, number];
    };
    phase: "idle" | "curl" | "snap" | "airborne" | "land" | "jump_charge" | "jump_snap";
    curlSign: number;
    damage: number;
    color: string;
}>;
export declare const gameSnapshotSchema: z.ZodObject<{
    tick: z.ZodNumber;
    fish: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        body: z.ZodObject<{
            pos: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
            rot: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
        }, "strip", z.ZodTypeAny, {
            pos: [number, number, number];
            rot: [number, number, number, number];
        }, {
            pos: [number, number, number];
            rot: [number, number, number, number];
        }>;
        head: z.ZodObject<{
            pos: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
            rot: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
        }, "strip", z.ZodTypeAny, {
            pos: [number, number, number];
            rot: [number, number, number, number];
        }, {
            pos: [number, number, number];
            rot: [number, number, number, number];
        }>;
        tail: z.ZodObject<{
            pos: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
            rot: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
        }, "strip", z.ZodTypeAny, {
            pos: [number, number, number];
            rot: [number, number, number, number];
        }, {
            pos: [number, number, number];
            rot: [number, number, number, number];
        }>;
        phase: z.ZodEnum<["idle", "curl", "snap", "airborne", "land", "jump_charge", "jump_snap"]>;
        curlSign: z.ZodNumber;
        damage: z.ZodNumber;
        color: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        body: {
            pos: [number, number, number];
            rot: [number, number, number, number];
        };
        head: {
            pos: [number, number, number];
            rot: [number, number, number, number];
        };
        tail: {
            pos: [number, number, number];
            rot: [number, number, number, number];
        };
        phase: "idle" | "curl" | "snap" | "airborne" | "land" | "jump_charge" | "jump_snap";
        curlSign: number;
        damage: number;
        color: string;
    }, {
        id: string;
        body: {
            pos: [number, number, number];
            rot: [number, number, number, number];
        };
        head: {
            pos: [number, number, number];
            rot: [number, number, number, number];
        };
        tail: {
            pos: [number, number, number];
            rot: [number, number, number, number];
        };
        phase: "idle" | "curl" | "snap" | "airborne" | "land" | "jump_charge" | "jump_snap";
        curlSign: number;
        damage: number;
        color: string;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    tick: number;
    fish: {
        id: string;
        body: {
            pos: [number, number, number];
            rot: [number, number, number, number];
        };
        head: {
            pos: [number, number, number];
            rot: [number, number, number, number];
        };
        tail: {
            pos: [number, number, number];
            rot: [number, number, number, number];
        };
        phase: "idle" | "curl" | "snap" | "airborne" | "land" | "jump_charge" | "jump_snap";
        curlSign: number;
        damage: number;
        color: string;
    }[];
}, {
    tick: number;
    fish: {
        id: string;
        body: {
            pos: [number, number, number];
            rot: [number, number, number, number];
        };
        head: {
            pos: [number, number, number];
            rot: [number, number, number, number];
        };
        tail: {
            pos: [number, number, number];
            rot: [number, number, number, number];
        };
        phase: "idle" | "curl" | "snap" | "airborne" | "land" | "jump_charge" | "jump_snap";
        curlSign: number;
        damage: number;
        color: string;
    }[];
}>;
export declare const roomDeltaSchema: z.ZodObject<{
    tick: z.ZodNumber;
    updatedFish: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        body: z.ZodObject<{
            pos: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
            rot: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
        }, "strip", z.ZodTypeAny, {
            pos: [number, number, number];
            rot: [number, number, number, number];
        }, {
            pos: [number, number, number];
            rot: [number, number, number, number];
        }>;
        head: z.ZodObject<{
            pos: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
            rot: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
        }, "strip", z.ZodTypeAny, {
            pos: [number, number, number];
            rot: [number, number, number, number];
        }, {
            pos: [number, number, number];
            rot: [number, number, number, number];
        }>;
        tail: z.ZodObject<{
            pos: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
            rot: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
        }, "strip", z.ZodTypeAny, {
            pos: [number, number, number];
            rot: [number, number, number, number];
        }, {
            pos: [number, number, number];
            rot: [number, number, number, number];
        }>;
        phase: z.ZodEnum<["idle", "curl", "snap", "airborne", "land", "jump_charge", "jump_snap"]>;
        curlSign: z.ZodNumber;
        damage: z.ZodNumber;
        color: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        body: {
            pos: [number, number, number];
            rot: [number, number, number, number];
        };
        head: {
            pos: [number, number, number];
            rot: [number, number, number, number];
        };
        tail: {
            pos: [number, number, number];
            rot: [number, number, number, number];
        };
        phase: "idle" | "curl" | "snap" | "airborne" | "land" | "jump_charge" | "jump_snap";
        curlSign: number;
        damage: number;
        color: string;
    }, {
        id: string;
        body: {
            pos: [number, number, number];
            rot: [number, number, number, number];
        };
        head: {
            pos: [number, number, number];
            rot: [number, number, number, number];
        };
        tail: {
            pos: [number, number, number];
            rot: [number, number, number, number];
        };
        phase: "idle" | "curl" | "snap" | "airborne" | "land" | "jump_charge" | "jump_snap";
        curlSign: number;
        damage: number;
        color: string;
    }>, "many">;
    removedFishIds: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    tick: number;
    updatedFish: {
        id: string;
        body: {
            pos: [number, number, number];
            rot: [number, number, number, number];
        };
        head: {
            pos: [number, number, number];
            rot: [number, number, number, number];
        };
        tail: {
            pos: [number, number, number];
            rot: [number, number, number, number];
        };
        phase: "idle" | "curl" | "snap" | "airborne" | "land" | "jump_charge" | "jump_snap";
        curlSign: number;
        damage: number;
        color: string;
    }[];
    removedFishIds: string[];
}, {
    tick: number;
    updatedFish: {
        id: string;
        body: {
            pos: [number, number, number];
            rot: [number, number, number, number];
        };
        head: {
            pos: [number, number, number];
            rot: [number, number, number, number];
        };
        tail: {
            pos: [number, number, number];
            rot: [number, number, number, number];
        };
        phase: "idle" | "curl" | "snap" | "airborne" | "land" | "jump_charge" | "jump_snap";
        curlSign: number;
        damage: number;
        color: string;
    }[];
    removedFishIds: string[];
}>;
export declare const joinResultSchema: z.ZodObject<{
    roomId: z.ZodString;
    roomCode: z.ZodString;
    playerId: z.ZodString;
    snapshot: z.ZodObject<{
        tick: z.ZodNumber;
        fish: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            body: z.ZodObject<{
                pos: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
                rot: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
            }, "strip", z.ZodTypeAny, {
                pos: [number, number, number];
                rot: [number, number, number, number];
            }, {
                pos: [number, number, number];
                rot: [number, number, number, number];
            }>;
            head: z.ZodObject<{
                pos: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
                rot: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
            }, "strip", z.ZodTypeAny, {
                pos: [number, number, number];
                rot: [number, number, number, number];
            }, {
                pos: [number, number, number];
                rot: [number, number, number, number];
            }>;
            tail: z.ZodObject<{
                pos: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
                rot: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
            }, "strip", z.ZodTypeAny, {
                pos: [number, number, number];
                rot: [number, number, number, number];
            }, {
                pos: [number, number, number];
                rot: [number, number, number, number];
            }>;
            phase: z.ZodEnum<["idle", "curl", "snap", "airborne", "land", "jump_charge", "jump_snap"]>;
            curlSign: z.ZodNumber;
            damage: z.ZodNumber;
            color: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            id: string;
            body: {
                pos: [number, number, number];
                rot: [number, number, number, number];
            };
            head: {
                pos: [number, number, number];
                rot: [number, number, number, number];
            };
            tail: {
                pos: [number, number, number];
                rot: [number, number, number, number];
            };
            phase: "idle" | "curl" | "snap" | "airborne" | "land" | "jump_charge" | "jump_snap";
            curlSign: number;
            damage: number;
            color: string;
        }, {
            id: string;
            body: {
                pos: [number, number, number];
                rot: [number, number, number, number];
            };
            head: {
                pos: [number, number, number];
                rot: [number, number, number, number];
            };
            tail: {
                pos: [number, number, number];
                rot: [number, number, number, number];
            };
            phase: "idle" | "curl" | "snap" | "airborne" | "land" | "jump_charge" | "jump_snap";
            curlSign: number;
            damage: number;
            color: string;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        tick: number;
        fish: {
            id: string;
            body: {
                pos: [number, number, number];
                rot: [number, number, number, number];
            };
            head: {
                pos: [number, number, number];
                rot: [number, number, number, number];
            };
            tail: {
                pos: [number, number, number];
                rot: [number, number, number, number];
            };
            phase: "idle" | "curl" | "snap" | "airborne" | "land" | "jump_charge" | "jump_snap";
            curlSign: number;
            damage: number;
            color: string;
        }[];
    }, {
        tick: number;
        fish: {
            id: string;
            body: {
                pos: [number, number, number];
                rot: [number, number, number, number];
            };
            head: {
                pos: [number, number, number];
                rot: [number, number, number, number];
            };
            tail: {
                pos: [number, number, number];
                rot: [number, number, number, number];
            };
            phase: "idle" | "curl" | "snap" | "airborne" | "land" | "jump_charge" | "jump_snap";
            curlSign: number;
            damage: number;
            color: string;
        }[];
    }>;
}, "strip", z.ZodTypeAny, {
    snapshot: {
        tick: number;
        fish: {
            id: string;
            body: {
                pos: [number, number, number];
                rot: [number, number, number, number];
            };
            head: {
                pos: [number, number, number];
                rot: [number, number, number, number];
            };
            tail: {
                pos: [number, number, number];
                rot: [number, number, number, number];
            };
            phase: "idle" | "curl" | "snap" | "airborne" | "land" | "jump_charge" | "jump_snap";
            curlSign: number;
            damage: number;
            color: string;
        }[];
    };
    roomCode: string;
    roomId: string;
    playerId: string;
}, {
    snapshot: {
        tick: number;
        fish: {
            id: string;
            body: {
                pos: [number, number, number];
                rot: [number, number, number, number];
            };
            head: {
                pos: [number, number, number];
                rot: [number, number, number, number];
            };
            tail: {
                pos: [number, number, number];
                rot: [number, number, number, number];
            };
            phase: "idle" | "curl" | "snap" | "airborne" | "land" | "jump_charge" | "jump_snap";
            curlSign: number;
            damage: number;
            color: string;
        }[];
    };
    roomCode: string;
    roomId: string;
    playerId: string;
}>;
export declare const playerLeftPayloadSchema: z.ZodObject<{
    playerId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    playerId: string;
}, {
    playerId: string;
}>;
export declare const protocolErrorCodeSchema: z.ZodEnum<["invalid-payload", "room-not-found", "room-full", "not-allowed", "internal-error"]>;
export declare const protocolErrorSchema: z.ZodObject<{
    code: z.ZodEnum<["invalid-payload", "room-not-found", "room-full", "not-allowed", "internal-error"]>;
    message: z.ZodString;
    recoverable: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    code: "invalid-payload" | "room-not-found" | "room-full" | "not-allowed" | "internal-error";
    message: string;
    recoverable: boolean;
}, {
    code: "invalid-payload" | "room-not-found" | "room-full" | "not-allowed" | "internal-error";
    message: string;
    recoverable: boolean;
}>;
export type ProtocolErrorCode = z.infer<typeof protocolErrorCodeSchema>;
