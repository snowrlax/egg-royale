export type FlopPhase =
  | "idle"
  | "curl"
  | "snap"
  | "airborne"
  | "land"
  | "jump_charge"
  | "jump_snap";

export type Vec3Tuple = [number, number, number];
export type QuatTuple = [number, number, number, number];

export type BodySnapshot = {
  pos: Vec3Tuple;
  rot: QuatTuple;
};

export type FishState = {
  id: string;
  body: BodySnapshot;
  head: BodySnapshot;
  tail: BodySnapshot;
  phase: FlopPhase;
  curlSign: number;
  damage: number;
  color: string;
};

export type PlayerInput = {
  seq: number;
  moveX: number; // -1 to 1
  moveY: number; // -1 to 1
  spaceDown: boolean;
  spaceJustReleased: boolean;
};

export type GameSnapshot = {
  tick: number;
  fish: FishState[];
};

export type RoomDelta = {
  tick: number;
  updatedFish: FishState[];
  removedFishIds: string[];
};

export type RoomInfo = {
  roomId: string;
  roomCode: string;
  playerCount: number;
  maxPlayers: number;
};

export type JoinResult = {
  roomId: string;
  roomCode: string;
  playerId: string;
  snapshot: GameSnapshot;
};
