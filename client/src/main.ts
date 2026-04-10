import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d/rapier.js";
import GUI from "lil-gui";
import {
  FLOP,
  type GameSnapshot,
  type RoomDelta,
  type PlayerInput,
} from "@fish-jam/shared";

import { createGameScene } from "./scene.js";
import {
  createLocalFish,
  createGroundCollider,
  updateLocalFish,
  syncFishMeshes,
  type LocalFish,
} from "./fish-flop.js";
import {
  createRemoteFish,
  updateRemoteFishState,
  interpolateRemoteFish,
  disposeRemoteFish,
  type RemoteFish,
} from "./remote-fish.js";
import { createSocketManager } from "./net/socket-manager.js";
import { createInputSender } from "./net/input-sender.js";

const SERVER_URL = `http://${window.location.hostname}:3001`;

async function boot() {
  const container = document.getElementById("app");
  if (!container) throw new Error("missing #app container");
  container.style.position = "relative";

  // ── Lobby overlay ──
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(240,236,228,0.95);z-index:10;";

  const btn = document.createElement("button");
  btn.textContent = "Quick Play";
  btn.style.cssText =
    "font:bold 24px/1 monospace;padding:16px 40px;cursor:pointer;border:3px solid #333;border-radius:12px;background:#ff8c42;color:#fff;";
  overlay.appendChild(btn);
  container.appendChild(overlay);

  btn.addEventListener("click", () => {
    overlay.remove();
    startGame(container);
  });
}

async function startGame(container: HTMLElement) {
  // ── Scene ──
  const gameScene = createGameScene(container);

  // ── Local Rapier world (client prediction) ──
  const world = new RAPIER.World({ x: 0, y: FLOP.GRAVITY, z: 0 });
  createGroundCollider(world);

  // ── Tweaking GUI ──
  const gui = new GUI({ title: "Fish Tuning" });

  const worldFolder = gui.addFolder("World");
  worldFolder.add(FLOP, "GRAVITY", -60, 0, 0.5).name("Gravity");
  worldFolder.add(FLOP, "GROUND_FRICTION", 0, 2, 0.05).name("Ground Friction");
  worldFolder.add(FLOP, "GROUND_RESTITUTION", 0, 1, 0.05).name("Ground Bounce");

  const moveFolder = gui.addFolder("Movement");
  moveFolder.add(FLOP, "MOVE_FORCE", 1, 30, 0.5).name("Move Force");
  moveFolder.add(FLOP, "LAUNCH_UP", 0, 20, 0.5).name("Launch Up");
  moveFolder.add(FLOP, "TAIL_SLAP_DOWN", 0, 15, 0.5).name("Tail Slap Down");
  moveFolder.add(FLOP, "MAX_VELOCITY", 1, 25, 0.5).name("Max Velocity");
  moveFolder.add(FLOP, "AIR_CONTROL", 0, 1, 0.05).name("Air Control");

  const flopFolder = gui.addFolder("Flop Cycle");
  flopFolder.add(FLOP, "CURL_DURATION", 0.02, 0.5, 0.01).name("Curl Duration");
  flopFolder.add(FLOP, "CURL_STIFFNESS", 10, 500, 5).name("Curl Stiffness");
  flopFolder.add(FLOP, "SNAP_STIFFNESS", 100, 3000, 50).name("Snap Stiffness");
  flopFolder.add(FLOP, "SNAP_DURATION", 0.02, 0.3, 0.01).name("Snap Duration");

  const jumpFolder = gui.addFolder("Jump");
  jumpFolder.add(FLOP, "JUMP_BASE_IMPULSE", 5, 40, 0.5).name("Base Impulse");
  jumpFolder.add(FLOP, "JUMP_CHARGE_BONUS", 0, 25, 0.5).name("Charge Bonus");
  jumpFolder.add(FLOP, "JUMP_MAX_CHARGE", 0.1, 2, 0.05).name("Max Charge Time");
  jumpFolder.add(FLOP, "JUMP_SNAP_STIFFNESS", 100, 2000, 50).name("Snap Stiffness");

  const steerFolder = gui.addFolder("Steering");
  steerFolder.add(FLOP, "RECOVERY_TORQUE", 1, 50, 1).name("Recovery Torque");
  steerFolder.add(FLOP, "FACING_TORQUE", 1, 40, 1).name("Facing Torque");
  steerFolder.add(FLOP, "FACING_DAMPING", 1, 20, 0.5).name("Facing Damping");

  // ── State ──
  let localFish: LocalFish | null = null;
  let myPlayerId: string | null = null;
  const remoteFishes = new Map<string, RemoteFish>();

  // ── Room code HUD ──
  const roomCodeDiv = document.createElement("div");
  roomCodeDiv.style.cssText =
    "position:absolute;top:12px;right:12px;font:bold 20px monospace;color:#333;background:rgba(255,255,255,0.85);padding:8px 16px;border-radius:8px;pointer-events:none;z-index:5;";
  container.appendChild(roomCodeDiv);

  // ── Networking ──
  // Forward-declare inputSender so callbacks can reference it
  let inputSender: ReturnType<typeof createInputSender>;

  const socketManager = createSocketManager({
    onJoined(result) {
      myPlayerId = result.playerId;
      roomCodeDiv.textContent = `Room: ${result.roomCode}`;

      // Create local fish — find our fish in the snapshot
      const myFishState = result.snapshot.fish.find(
        (f) => f.id === result.playerId
      );
      const fishColor = myFishState?.color ?? "#ff8c42";

      localFish = createLocalFish(
        result.playerId,
        world,
        gameScene.scene,
        gameScene.gradientTexture,
        fishColor
      );

      // Create remote fish for everyone else
      for (const fs of result.snapshot.fish) {
        if (fs.id === result.playerId) continue;
        remoteFishes.set(
          fs.id,
          createRemoteFish(fs, gameScene.scene, gameScene.gradientTexture)
        );
      }

      inputSender.start(result.roomId, result.playerId);
    },

    onSnapshot(_snapshot: GameSnapshot) {
      // Full state reset — used for server corrections
    },

    onDelta(delta: RoomDelta) {
      for (const fs of delta.updatedFish) {
        if (fs.id === myPlayerId) {
          continue; // skip — local Rapier world is authoritative for feel
        }
        // Remote fish
        const existing = remoteFishes.get(fs.id);
        if (existing) {
          updateRemoteFishState(existing, fs);
        } else {
          // New player joined — create remote fish
          remoteFishes.set(
            fs.id,
            createRemoteFish(fs, gameScene.scene, gameScene.gradientTexture)
          );
        }
      }
      // Handle removals
      for (const removedId of delta.removedFishIds) {
        const remote = remoteFishes.get(removedId);
        if (remote) {
          disposeRemoteFish(remote, gameScene.scene);
          remoteFishes.delete(removedId);
        }
      }
    },

    onPlayerLeft(playerId: string) {
      const remote = remoteFishes.get(playerId);
      if (remote) {
        disposeRemoteFish(remote, gameScene.scene);
        remoteFishes.delete(playerId);
      }
    },

    onError(code: string, message: string) {
      console.error(`[server] ${code}: ${message}`);
    },

    onDisconnect(reason: string) {
      console.warn(`[disconnected] ${reason}`);
    },
  });

  inputSender = createInputSender(socketManager);

  // ── Connect + join ──
  socketManager.connect(SERVER_URL);
  socketManager.quickJoin();

  // ── Keyboard input ──
  const keys = new Set<string>();
  let spaceDown = false;
  let spaceJustReleased = false;

  window.addEventListener("keydown", (e) => {
    keys.add(e.key.toLowerCase());
    if (e.key === " " && !spaceDown) spaceDown = true;
  });
  window.addEventListener("keyup", (e) => {
    keys.delete(e.key.toLowerCase());
    if (e.key === " ") {
      spaceDown = false;
      spaceJustReleased = true;
    }
  });

  // ── Game loop ──
  const clock = new THREE.Clock();
  const _camTarget = new THREE.Vector3();
  const _camLookAt = new THREE.Vector3();
  let inputSeq = 0;

  function tick() {
    const dt = Math.min(clock.getDelta(), 0.05);

    if (localFish) {
      // Build input
      let moveX = 0;
      let moveY = 0;
      if (keys.has("a") || keys.has("arrowleft")) moveX = -1;
      if (keys.has("d") || keys.has("arrowright")) moveX = 1;
      if (keys.has("w") || keys.has("arrowup")) moveY = -1;
      if (keys.has("s") || keys.has("arrowdown")) moveY = 1;
      const len = Math.sqrt(moveX * moveX + moveY * moveY);
      if (len > 0) {
        moveX /= len;
        moveY /= len;
      }

      const input: PlayerInput = {
        seq: inputSeq++,
        moveX,
        moveY,
        spaceDown,
        spaceJustReleased,
      };

      // Step physics every frame for smooth visuals
      world.gravity = { x: 0, y: FLOP.GRAVITY, z: 0 };
      updateLocalFish(localFish, world, dt, input);
      world.timestep = dt;
      world.step();
      spaceJustReleased = false;

      // Feed to input sender (30Hz to server)
      inputSender.setInput(input);

      // Sync local fish meshes from Rapier
      syncFishMeshes(localFish);

      // Camera follow
      const bp = localFish.body.translation();
      _camTarget.set(bp.x, bp.y + 5, bp.z + 7);
      gameScene.camera.position.lerp(_camTarget, 0.05);
      _camLookAt.set(bp.x, bp.y + 0.5, bp.z);
      gameScene.camera.lookAt(_camLookAt);
    }

    // Interpolate remote fish
    const now = performance.now();
    for (const remote of remoteFishes.values()) {
      interpolateRemoteFish(remote, now);
    }

    gameScene.renderer.render(gameScene.scene, gameScene.camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

boot().catch((err) => {
  console.error("failed to boot:", err);
  document.body.textContent = `Boot error: ${err.message}`;
});
