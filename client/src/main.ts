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
  loadFishModel,
  createLocalFish,
  createGroundCollider,
  updateLocalFish,
  syncFishMeshes,
  checkFishFallen,
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
import { createNetworkStats } from "./net/network-stats.js";
import type { FishState } from "@fish-jam/shared";

const SERVER_URL = `http://${window.location.hostname}:3001`;

// ── Server Reconciliation Constants ──
const SNAP_THRESHOLD = 2.0;   // Snap immediately if >2 units off
const BLEND_FACTOR = 0.1;     // Gradual correction speed
const TOLERANCE = 0.05;       // Ignore corrections smaller than this

/**
 * Reconcile local player position with server authoritative state.
 * Uses snap for large errors, gradual blend for small drift.
 */
function reconcileLocalPlayer(
  localFish: LocalFish,
  serverState: FishState,
  _world: RAPIER.World
): void {
  const body = localFish.body;
  const serverPos = serverState.body.pos;
  const clientPos = body.translation();

  const dx = serverPos[0] - clientPos.x;
  const dy = serverPos[1] - clientPos.y;
  const dz = serverPos[2] - clientPos.z;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

  if (distance > SNAP_THRESHOLD) {
    // Large error: snap immediately to server position
    body.setTranslation({ x: serverPos[0], y: serverPos[1], z: serverPos[2] }, true);
  } else if (distance > TOLERANCE) {
    // Small error: blend toward server position
    body.setTranslation({
      x: clientPos.x + dx * BLEND_FACTOR,
      y: clientPos.y + dy * BLEND_FACTOR,
      z: clientPos.z + dz * BLEND_FACTOR,
    }, true);
  }
  // else: within tolerance, no correction needed
}

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
  /* ══════════════════════════════════════════════════════════════
   * FISH CODE - PRESERVED FOR LATER
   * Load fish GLB model
   * ══════════════════════════════════════════════════════════════
  const modelUrl = new URL("../models/fish.glb", import.meta.url).href;
  await loadFishModel(modelUrl);
   * ══════════════════════════════════════════════════════════════ */

  // ── Scene ──
  const gameScene = createGameScene(container);

  // ── Local Rapier world (client prediction) ──
  const PHYSICS_DT = 1 / 30;
  const world = new RAPIER.World({ x: 0, y: FLOP.GRAVITY, z: 0 });
  world.timestep = PHYSICS_DT;
  createGroundCollider(world);

  // ── Camera config (tunable via GUI) ──
  const CAM = { distance: 16, height: 10, smoothness: 0.05, mouseSensitivity: 0.005, rotateSpeed: 1.5 };
  let camAngle = 0; // radians — orbit angle around fish

  // ── Tweaking GUI ──
  const gui = new GUI({ title: "Cube Tuning" });

  const worldFolder = gui.addFolder("World");
  worldFolder.add(FLOP, "GRAVITY", -60, 0, 0.5).name("Gravity");
  worldFolder.add(FLOP, "GROUND_FRICTION", 0, 2, 0.05).name("Ground Friction");
  worldFolder.add(FLOP, "GROUND_RESTITUTION", 0, 1, 0.05).name("Ground Bounce");

  /* ══════════════════════════════════════════════════════════════
   * FISH CODE - PRESERVED FOR LATER
   * Fish-specific GUI folders
   * ══════════════════════════════════════════════════════════════
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
   * ══════════════════════════════════════════════════════════════ */

  const camFolder = gui.addFolder("Camera");
  camFolder.add(CAM, "distance", 4, 40, 0.5).name("Zoom (distance)");
  camFolder.add(CAM, "height", 2, 25, 0.5).name("Height");
  camFolder.add(CAM, "smoothness", 0.01, 0.2, 0.01).name("Smoothness");
  camFolder.add(CAM, "mouseSensitivity", 0.001, 0.02, 0.001).name("Mouse Sensitivity");
  camFolder.add(CAM, "rotateSpeed", 0.5, 5, 0.1).name("Key Rotate Speed");

  // ── State ──
  let localFish: LocalFish | null = null;
  let myPlayerId: string | null = null;
  const remoteFishes = new Map<string, RemoteFish>();
  let isGameOver = false;
  let isEliminated = false;

  // ── Game Over overlay ──
  const gameOverOverlay = document.createElement("div");
  gameOverOverlay.style.cssText =
    "position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:rgba(0,0,0,0.7);z-index:20;";
  const gameOverText = document.createElement("div");
  gameOverText.textContent = "GAME OVER";
  gameOverText.style.cssText =
    "font:bold 48px monospace;color:#ff4444;margin-bottom:20px;";
  const restartBtn = document.createElement("button");
  restartBtn.textContent = "Play Again";
  restartBtn.style.cssText =
    "font:bold 20px monospace;padding:12px 32px;cursor:pointer;border:2px solid #fff;border-radius:8px;background:#ff8c42;color:#fff;";
  gameOverOverlay.appendChild(gameOverText);
  gameOverOverlay.appendChild(restartBtn);
  container.appendChild(gameOverOverlay);

  restartBtn.addEventListener("click", () => {
    window.location.reload();
  });

  function showGameOverOverlay(message: string, isWin: boolean) {
    gameOverText.textContent = message;
    gameOverText.style.color = isWin ? "#44ff44" : "#ff4444";
    gameOverOverlay.style.display = "flex";
    isGameOver = true;
    inputSender.stop();
  }

  // ── Room code HUD ──
  const roomCodeDiv = document.createElement("div");
  roomCodeDiv.style.cssText =
    "position:absolute;top:12px;right:12px;font:bold 20px monospace;color:#333;background:rgba(255,255,255,0.85);padding:8px 16px;border-radius:8px;pointer-events:none;z-index:5;";
  container.appendChild(roomCodeDiv);

  // ── Networking ──
  // Forward-declare inputSender so callbacks can reference it
  let inputSender: ReturnType<typeof createInputSender>;
  const networkStats = createNetworkStats();

  const socketManager = createSocketManager({
    onJoined(result) {
      myPlayerId = result.playerId;
      roomCodeDiv.textContent = `Room: ${result.roomCode}`;
      console.log(`[JOINED] roomCode=${result.roomCode}, myId=${result.playerId.slice(-8)}, existingPlayers=${result.snapshot.fish.length}`);
      for (const fish of result.snapshot.fish) {
        console.log(`[JOINED] player ${fish.id.slice(-8)} at pos=(${fish.body.pos[0].toFixed(1)}, ${fish.body.pos[1].toFixed(1)}, ${fish.body.pos[2].toFixed(1)})`);
      }

      // Create local fish — find our fish in the snapshot
      const myFishState = result.snapshot.fish.find(
        (f) => f.id === result.playerId
      );
      const fishColor = myFishState?.color ?? "#ff8c42";
      const spawnPos = myFishState
        ? { x: myFishState.body.pos[0], y: myFishState.body.pos[1], z: myFishState.body.pos[2] }
        : { x: 0, y: 2, z: 0 };

      localFish = createLocalFish(
        result.playerId,
        world,
        gameScene.scene,
        gameScene.gradientTexture,
        fishColor,
        spawnPos
      );

      // Create remote fish for everyone else
      for (const fs of result.snapshot.fish) {
        if (fs.id === result.playerId) continue;
        remoteFishes.set(
          fs.id,
          createRemoteFish(fs, result.snapshot.tick, gameScene.scene, gameScene.gradientTexture, world)
        );
      }

      inputSender.start(result.roomId, result.playerId);
    },

    onSnapshot(_snapshot: GameSnapshot, serverTs: number, localReceiveTime: number) {
      // Update network stats from server timestamp
      networkStats.onServerMessage(serverTs, localReceiveTime);
      // Full state reset — used for server corrections
    },

    onDelta(delta: RoomDelta, serverTs: number, localReceiveTime: number) {
      // Update network stats from server timestamp
      networkStats.onServerMessage(serverTs, localReceiveTime);

      for (const fs of delta.updatedFish) {
        const isMe = fs.id === myPlayerId;

        if (isMe && localFish) {
          // Apply server correction to local player
          reconcileLocalPlayer(localFish, fs, world);
          continue;
        }

        // Remote fish
        const existing = remoteFishes.get(fs.id);
        if (existing) {
          updateRemoteFishState(existing, delta.tick, fs);
        } else {
          console.log(`[DELTA] creating NEW remote fish ${fs.id.slice(-8)}`);
          // New player joined — create remote fish
          remoteFishes.set(
            fs.id,
            createRemoteFish(fs, delta.tick, gameScene.scene, gameScene.gradientTexture, world)
          );
        }
      }
      // Handle removals
      for (const removedId of delta.removedFishIds) {
        const remote = remoteFishes.get(removedId);
        if (remote) {
          disposeRemoteFish(remote, gameScene.scene, world);
          remoteFishes.delete(removedId);
        }
      }
    },

    onPlayerLeft(playerId: string) {
      const remote = remoteFishes.get(playerId);
      if (remote) {
        disposeRemoteFish(remote, gameScene.scene, world);
        remoteFishes.delete(playerId);
      }
    },

    onPlayerEliminated(playerId: string) {
      console.info(`[game] player eliminated: ${playerId.slice(-8)}`);
      if (playerId === myPlayerId) {
        isEliminated = true;
        showGameOverOverlay("ELIMINATED!", false);
      } else {
        // Remove eliminated remote player from scene
        const remote = remoteFishes.get(playerId);
        if (remote) {
          disposeRemoteFish(remote, gameScene.scene, world);
          remoteFishes.delete(playerId);
        }
      }
    },

    onRoundWinner(winnerId: string) {
      console.info(`[game] round winner: ${winnerId.slice(-8)}`);
      if (winnerId === myPlayerId) {
        showGameOverOverlay("YOU WIN!", true);
      } else {
        showGameOverOverlay("YOU LOSE!", false);
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

  // ── Mouse drag to orbit camera ──
  let isDragging = false;
  let lastPointerX = 0;
  gameScene.renderer.domElement.addEventListener("pointerdown", (e) => {
    isDragging = true;
    lastPointerX = e.clientX;
    gameScene.renderer.domElement.setPointerCapture(e.pointerId);
  });
  gameScene.renderer.domElement.addEventListener("pointermove", (e) => {
    if (!isDragging) return;
    const dx = e.clientX - lastPointerX;
    camAngle += dx * CAM.mouseSensitivity;
    lastPointerX = e.clientX;
  });
  gameScene.renderer.domElement.addEventListener("pointerup", () => {
    isDragging = false;
  });

  // ── Game loop (fixed-timestep accumulator) ──
  const clock = new THREE.Clock();
  const _camTarget = new THREE.Vector3();
  const _camLookAt = new THREE.Vector3();
  let inputSeq = 0;
  let physicsAccumulator = 0;

  function tick() {
    if (isGameOver || isEliminated) {
      gameScene.renderer.render(gameScene.scene, gameScene.camera);
      requestAnimationFrame(tick);
      return;
    }

    const frameDelta = Math.min(clock.getDelta(), 0.1);

    if (localFish) {
      // Check if fish fell off platform
      if (checkFishFallen(localFish)) {
        isGameOver = true;
        gameOverOverlay.style.display = "flex";
        inputSender.stop();
        return;
      }
      // Update gravity in case GUI changed it
      world.gravity = { x: 0, y: FLOP.GRAVITY, z: 0 };

      physicsAccumulator += frameDelta;

      // Step physics at fixed rate — may step 0, 1, or 2 times per render frame
      while (physicsAccumulator >= PHYSICS_DT) {
        // WASD movement relative to camera angle
        // Camera forward = (sin, 0, cos), camera right = (cos, 0, -sin)
        let fwd = 0, strafe = 0;
        if (keys.has("w") || keys.has("arrowup"))    fwd    = -1;
        if (keys.has("s") || keys.has("arrowdown"))  fwd    =  1;
        if (keys.has("a") || keys.has("arrowleft"))  strafe = -1;
        if (keys.has("d") || keys.has("arrowright")) strafe =  1;

        const rawX = fwd * Math.sin(camAngle) + strafe * Math.cos(camAngle);
        const rawY = fwd * Math.cos(camAngle) - strafe * Math.sin(camAngle);
        const len = Math.sqrt(rawX * rawX + rawY * rawY);
        const normX = len > 0 ? rawX / len : 0;
        const normY = len > 0 ? rawY / len : 0;

        const input: PlayerInput = {
          seq: inputSeq++,
          moveX: normX,
          moveY: normY,
          spaceDown,
          spaceJustReleased,
        };

        // Step fish state machine at fixed dt (matches server exactly)
        updateLocalFish(localFish, world, PHYSICS_DT, input);

        // Step Rapier (advances by world.timestep = 1/30)
        world.step();

        spaceJustReleased = false;

        // Feed to network sender
        inputSender.setInput(input);

        physicsAccumulator -= PHYSICS_DT;
      }
      // Sync local fish meshes from Rapier (runs every render frame)
      syncFishMeshes(localFish);

      // Camera follow — orbit around fish using camAngle
      const bp = localFish.body.translation();
      const camOffX = Math.sin(camAngle) * CAM.distance;
      const camOffZ = Math.cos(camAngle) * CAM.distance;
      _camTarget.set(bp.x + camOffX, bp.y + CAM.height, bp.z + camOffZ);
      gameScene.camera.position.lerp(_camTarget, CAM.smoothness);
      _camLookAt.set(bp.x, bp.y + 1, bp.z);
      gameScene.camera.lookAt(_camLookAt);
    }

    // Interpolate remote fish using network-adaptive buffer
    for (const remote of remoteFishes.values()) {
      interpolateRemoteFish(remote, networkStats);
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
