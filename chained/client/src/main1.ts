/**
 * main.ts — Phase 2, Steps 1 & 2: Scene + Ground + Falling Sphere
 *
 * This is the simplest possible Rapier + Three.js setup:
 * 1. Create a Rapier physics world with gravity
 * 2. Create a fixed (immovable) ground collider
 * 3. Create a dynamic sphere rigid body above the ground
 * 4. Create a matching Three.js sphere mesh
 * 5. Each frame: step physics, copy Rapier position → Three.js mesh, render
 *
 * LEARNING GOALS:
 * - Understand the relationship between Rapier (physics) and Three.js (visuals)
 * - See how gravity, friction, and restitution affect a falling object
 * - Practice the fixed-timestep game loop pattern
 *
 * TRY CHANGING:
 * - Gravity (line ~30): try -9.81 (Earth) vs -25 (our fish game) vs -50 (heavy)
 * - Restitution (line ~45): try 0.0 (no bounce) vs 0.8 (very bouncy) vs 1.0 (perfect bounce)
 * - Friction (line ~44): try 0.0 (ice) vs 0.6 (normal) vs 2.0 (very sticky)
 * - Damping (line ~53): try 0.0 (no air resistance) vs 0.5 (normal) vs 3.0 (heavy air)
 * - Spawn height (line ~50): drop from higher/lower
 */

import RAPIER from "@dimforge/rapier3d/rapier.js";
import * as THREE from "three";
import { createGameScene } from "./scene.js";

async function boot() {
  const container = document.getElementById("app")!;
  const gameScene = createGameScene(container);

  // ════════════════════════════════════════════════
  // RAPIER WORLD
  // ════════════════════════════════════════════════
  // The world holds all rigid bodies, colliders, and joints.
  // Gravity pulls everything down at 25 m/s² (2.55× Earth gravity).
  const gravity = { x: 0, y: -25, z: 0 };
  const world = new RAPIER.World(gravity);

  // ════════════════════════════════════════════════
  // GROUND (fixed rigid body + cuboid collider)
  // ════════════════════════════════════════════════
  // A "fixed" body never moves, no matter what hits it. Perfect for floors.
  // The cuboid half-extents are (30, 5, 30) — a 60×10×60 slab.
  // Positioned at y=-5 so the TOP surface sits at y=0.
  const groundColliderDesc = RAPIER.ColliderDesc.cuboid(30, 5, 30)
    .setTranslation(0, -5, 0)
    .setFriction(0.6) // How much things grip the surface (0=ice, 1=rubber)
    .setRestitution(0.3); // How much things bounce (0=dead stop, 1=perfect bounce)
  world.createCollider(groundColliderDesc);

  // ════════════════════════════════════════════════
  // SPHERE (dynamic rigid body + ball collider)
  // ════════════════════════════════════════════════
  // A "dynamic" body responds to gravity, forces, and collisions.
  const sphereRadius = 0.4;
  const sphereSpawn = { x: 0, y: 5, z: 0 };

  // Create the rigid body (the physical entity)
  const sphereBodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(sphereSpawn.x, sphereSpawn.y, sphereSpawn.z)
    .setLinearDamping(0.5) // Air resistance on movement (velocity decays)
    .setAngularDamping(0.4) // Air resistance on spinning
    .setCcdEnabled(true); // Continuous collision detection (prevents tunneling)
  const sphereBody = world.createRigidBody(sphereBodyDesc);

  // Create the collider (the shape used for collision detection)
  // Attached to the rigid body — moves with it, contributes to its mass.
  const sphereColliderDesc = RAPIER.ColliderDesc.ball(sphereRadius)
    .setDensity(2.0) // mass = density × volume. Higher = heavier.
    .setFriction(0.4) // Grip when sliding on surfaces
    .setRestitution(0.3); // Bounciness
  world.createCollider(sphereColliderDesc, sphereBody);

  // ════════════════════════════════════════════════
  // THREE.JS MESH (the visual representation)
  // ════════════════════════════════════════════════
  // This is purely visual — Three.js doesn't know about physics.
  // We'll copy the Rapier body's position to this mesh each frame.
  const sphereGeo = new THREE.SphereGeometry(sphereRadius, 16, 12);
  const sphereMat = new THREE.MeshStandardMaterial({
    color: 0xff6b35, // orange
    roughness: 0.4,
    metalness: 0.1,
  });
  const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
  sphereMesh.castShadow = true;
  gameScene.scene.add(sphereMesh);

  // ════════════════════════════════════════════════
  // GAME LOOP — Fixed Timestep
  // ════════════════════════════════════════════════
  // Physics runs at exactly 30Hz (same as the existing fish game).
  // Rendering runs at monitor refresh rate (60Hz, 144Hz, etc.).
  // The accumulator pattern ensures deterministic physics.
  const PHYSICS_DT = 1 / 30;
  let accumulator = 0;
  const clock = new THREE.Clock();

  function tick() {
    // How much real time passed since last frame
    // Capped at 0.1s to prevent spiral of death on lag spikes
    const frameDelta = Math.min(clock.getDelta(), 0.1);
    accumulator += frameDelta;

    // Step physics as many times as needed to catch up
    while (accumulator >= PHYSICS_DT) {
      world.step();
      accumulator -= PHYSICS_DT;
    }

    // ── Sync: Rapier → Three.js ──
    // Copy the physics body's position and rotation to the visual mesh.
    // This is the ONE-WAY bridge: physics is ground truth, visuals follow.
    const pos = sphereBody.translation();
    const rot = sphereBody.rotation();
    sphereMesh.position.set(pos.x, pos.y, pos.z);
    sphereMesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);

    // ── Render ──
    gameScene.renderer.render(gameScene.scene, gameScene.camera);
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

boot();
