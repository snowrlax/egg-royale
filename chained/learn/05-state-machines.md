# State Machines for Game Characters

## What Is a State Machine?

A finite state machine (FSM) is a pattern where an entity is in exactly ONE state at a time, and transitions between states based on conditions.

For game characters, this means:
- Each state defines **what physics happens** (motor targets, forces, animations)
- **Conditions** trigger transitions (timer expired, input pressed, grounded)
- State transitions are **explicit** (no ambiguity about what the character is doing)

## Why State Machines for Physics Characters?

Without a state machine, you'd have a mess of `if/else` checking multiple booleans:
```ts
// BAD: spaghetti logic
if (isGrounded && isMoving && !isJumping && !isCurling) { ... }
else if (isGrounded && isMoving && isCurling && curlTime > 0.12) { ... }
```

With a state machine:
```ts
// GOOD: clear phases
switch (phase) {
  case "idle":    /* idle logic */   break;
  case "curl":    /* curl logic */   break;
  case "snap":    /* snap logic */   break;
  case "airborne": /* air logic */   break;
}
```

## Our Fish State Machine Pattern

### State Type

```ts
type FlopPhase = "idle" | "curl" | "snap" | "airborne" | "land" | "jump_charge" | "jump_snap";
```

### State Data

Each fish carries its current state:
```ts
type LocalFish = {
  phase: FlopPhase;      // current state
  phaseTime: number;     // time spent in current state
  grounded: boolean;     // is the body touching ground?
  facingAngle: number;   // direction the fish faces
  jumpCharge: number;    // accumulated charge time
  curlSign: number;      // +1 or -1, alternates each flop
};
```

### Update Pattern

Every physics frame:
```ts
function updateLocalFish(fish, world, dt, input) {
  // 1. Advance phase timer
  fish.phaseTime += dt;
  
  // 2. Check ground state
  fish.grounded = checkGrounded(fish.body, world);
  
  // 3. Apply always-on forces (recovery, facing, velocity clamping)
  if (fish.grounded) applyRecoveryTorque(fish);
  if (hasInput && fish.grounded) applyFacingForce(fish, dt);
  clampVelocity(fish.body, MAX_VELOCITY);
  
  // 4. Apply phase-specific animation forces
  applyVerticalDynamics(fish, dt);
  
  // 5. State machine — the big switch
  switch (fish.phase) {
    case "idle": /* ... */ break;
    case "curl": /* ... */ break;
    // ...
  }
}
```

### Transition Pattern

Each state checks its exit conditions at the bottom:
```ts
case "curl":
  // Set motor targets...
  setMotor(headJoint, s * 0.35, 200, 8);
  setMotor(tailJoint, -s * 0.70, 200, 8);
  
  // Allow steering during curl
  if (hasInput) fish.facingAngle = Math.atan2(moveX, moveY);
  
  // Transition: timer expired → snap
  if (fish.phaseTime >= 0.12) {
    fish.phase = "snap";
    fish.phaseTime = 0;  // ALWAYS reset timer on transition
  }
  break;
```

### Critical: Reset phaseTime on Transition

Every transition sets `phaseTime = 0`. This is essential because:
1. Timed phases (curl, snap, land) check `phaseTime >= duration`
2. First-frame-only actions (snap impulse) check `phaseTime < dt * 1.5`
3. Forgetting to reset = immediate skip through the next phase

## General State Machine Rules

1. **One state at a time.** Never be in "curl AND airborne."
2. **Reset timer on every transition.** Always set `phaseTime = 0` when changing phase.
3. **Set motors at the START of each state.** Don't carry motor settings from previous state.
4. **Check transitions at the END of each state.** Apply forces first, then check if it's time to leave.
5. **First-frame actions use `phaseTime < dt * 1.5`.** This catches the first 1–2 frames regardless of frame rate.
6. **External conditions (grounded) are checked OUTSIDE the switch.** Things that apply to multiple states go before the switch block.

## Common Pitfall: Transition Chains

What if multiple transitions fire in one frame?

```ts
// Frame 1: curl phase, phaseTime = 0.11
// dt = 0.033 (30Hz)
// After: phaseTime = 0.143 > 0.12 → transition to snap

// Same frame continues to snap case? NO!
// The break statement prevents fall-through.
// Snap will start processing next frame.
```

The `switch/break` pattern ensures only ONE state runs per frame. The transition takes effect next frame.

## Extending the State Machine

To add a new state (e.g., "wall_slide"):
1. Add to the type: `type FlopPhase = ... | "wall_slide";`
2. Add a case in the switch
3. Define motor targets, forces, and transitions
4. Add transitions FROM other states TO "wall_slide" (e.g., from airborne when touching wall)

## Reference Files

- Phase type: `packages/shared/src/types.ts` line 1
- State machine: `client/src/fish-flop.ts` lines 555-737
- Update function: `client/src/fish-flop.ts` lines 518-737
