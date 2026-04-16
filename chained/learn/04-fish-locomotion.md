# Fish Locomotion — The Curl-Snap Cycle

## How Real Fish Move

Real fish propel themselves through **undulatory locomotion** — lateral body waves that travel from head to tail. The key principle:

1. A wave of bending travels down the body from front to back
2. Each segment pushes sideways against the water
3. The reaction force propels the fish forward
4. The wave alternates sides (left-right-left-right)

On land (our game), there's no water to push against. A fish on land "flops" by:
1. Curling its body to one side
2. Violently snapping the other way
3. The snap against the ground creates a friction-based launch

## Our State Machine

```
         ┌──────────────────────────────────────┐
         ↓                                      │
      [IDLE] ──(WASD pressed)──→ [CURL] ──(0.12s)──→ [SNAP] ──(0.06s)──→ [AIRBORNE]
         │                                                                    │
         │ (space pressed)                                          (grounded + 0.1s)
         ↓                                                                    ↓
   [JUMP_CHARGE] ──(space released)──→ [JUMP_SNAP] ──(0.06s)──→ [AIRBORNE]  [LAND]
                                                                              │
                                                              (0.05s cooldown)│
                                                                              ↓
                                                          back to IDLE/CURL/JUMP_CHARGE
```

## Phase-by-Phase Breakdown

### IDLE — Waiting for Input

**Duration:** Until player presses a key
**What happens physically:**
- Joint motors target angle 0 with low stiffness (30) — joints relax to neutral
- Breathing animation: sine wave torque on head/tail (`sin(t * 3) * 0.3`)
- Horizontal velocity braked by 0.8× each frame (decays to zero in ~10 frames)

**Transitions:**
- WASD → CURL (start flopping)
- Space → JUMP_CHARGE (start charging)

### CURL — Bending Into a C-Shape (0.12 seconds)

**Duration:** Exactly 0.12 seconds (about 3.6 frames at 30Hz)
**What happens physically:**
- Head motor: target = +curlSign × 0.35 rad (20°), stiffness=200, damping=8
- Tail motor: target = -curlSign × 0.70 rad (40°), stiffness=200, damping=8
- Tail bends TWICE as much as head (creates asymmetric C-shape)
- Additional animation torque: head tilts forward, tail tilts back (X-axis)
- Player can still steer (update facingAngle) during curl

**Why 0.12 seconds?** Short enough to feel snappy, long enough for the joints to visibly bend. At stiffness=200, the joints need ~3 frames to reach target.

**Transitions:** After 0.12s → SNAP

### SNAP — The Launch (0.06 seconds)

**Duration:** Exactly 0.06 seconds (about 2 frames at 30Hz)
**What happens physically:**

1. **Motor reversal** (every frame):
   - Head motor: target = +curlSign × (-0.60) rad (-34°)
   - Tail motor: target = -curlSign × (-1.20) rad (-69°)
   - Stiffness = 1200 (6× stiffer than curl!)
   - Damping = 2 (¼ of curl — lets energy release fast)

2. **Launch impulse** (first frame ONLY — `phaseTime < dt * 1.5`):
   - Zero all horizontal velocity first (prevents residual sliding from contaminating direction)
   - Body: impulse of MOVE_FORCE (10) in facing direction + LAUNCH_UP (8) upward
   - Tail: impulse of TAIL_SLAP_DOWN (6) downward

3. **Curl sign flip** (at end):
   - `curlSign *= -1` — next curl goes the other direction

**Why zero velocity before launch?** If the fish was sliding at 2 m/s from a previous flop, that velocity would combine with the new launch impulse at an unexpected angle. Zeroing ensures a clean directional launch.

**Why tail slap DOWN?** Newton's third law. Pushing the tail down against the ground creates a reaction force pushing the body UP. Body gets +8 up, tail gets -6 down → net upward force of +2 on the system.

**Transitions:** After 0.06s → AIRBORNE (curlSign flipped)

### AIRBORNE — In the Air

**Duration:** Until grounded AND at least 0.1s has passed
**What happens physically:**
- Joint motors relax: target=0, stiffness=30, damping=2 (floppy)
- Air control: if player holds WASD, continuous force = MOVE_FORCE × AIR_CONTROL (10 × 0.3 = 3)
- Flutter animation: tail oscillates via sine wave torque (freq=18 rad/s ≈ 3Hz)
- Head gets slight constant torque for visual stability

**Why force instead of impulse for air control?** Force is applied continuously (builds up over time). Impulse is instant. In air, you want gradual trajectory adjustment, not instant direction changes.

**The 0.1s minimum:** Prevents instant re-grounding if the fish clips a corner right after launching.

**Transitions:** Grounded + 0.1s passed → LAND

### LAND — Impact Cooldown (0.05 seconds)

**Duration:** 0.05 seconds (about 1.5 frames)
**What happens physically:**
- Joint motors: target=0, stiffness=200, damping=8 (settle to neutral firmly)
- Landing impact animation: head and tail get decaying torque (starts at full strength, reaches 0 over 0.05s)
- The `impact = max(0, 1 - phaseTime * 20)` creates a sharp decay curve

**Purpose:** Brief pause after landing to:
1. Let the physics settle (joint oscillations dampen)
2. Prevent instant re-input (feels more grounded)
3. Show a satisfying landing animation (the bounce-settle)

**Transitions:** After 0.05s → IDLE (no input) / CURL (WASD) / JUMP_CHARGE (space)

### JUMP_CHARGE — Winding Up (0–0.6 seconds)

**Duration:** Until player releases space (max 0.6 seconds)
**What happens physically:**
- `jumpCharge` accumulates: `min(jumpCharge + dt, 0.6)`
- `chargeT = jumpCharge / 0.6` gives a 0→1 progress value
- Coil amount: `chargeT × 0.3` — joints bend slightly (up to 0.3 rad at full charge)
- Head and tail motors create a slight compression pose
- Player can steer during charge (update facingAngle + apply facing torque)

**Why 0.6 seconds max?** Balances risk/reward. Holding longer = stronger jump, but you're vulnerable (can't move).

**Transitions:**
- Space released (charge ≥ 0.06s) → JUMP_SNAP
- Space released (charge < 0.06s) → IDLE (fizzle — too short)
- Lost ground contact → AIRBORNE (fell off edge while charging)

### JUMP_SNAP — The Launch (0.06 seconds)

**Duration:** 0.06 seconds
**What happens physically:**

1. **Motor relaxation:** Both joints target 0 with stiffness=900, damping=2
2. **Total velocity reset:** ALL velocities and angular velocities zeroed on all 3 bodies
3. **Jump impulse** (first frame only):
   - `upImpulse = 14 + chargeT × 10` (range: 14–24 based on charge)
   - Body: gets `upImpulse` vertical + optional lateral (0.4 × MOVE_FORCE if player holds WASD)
   - Head: gets `upImpulse × 0.6` vertical (helps launch upward cleanly)
   - Tail: gets `upImpulse × 0.2` vertical (slight lift)
4. **Curl sign flip:** Same as regular snap

**Why distribute impulse to head and tail?** If ALL impulse went to the body alone, the off-center mass would create torque (the body would spin). Distributing ensures all parts launch together cleanly.

**Jump height examples:**
- Tap (0.06s charge): upImpulse = 14 + 0.1 × 10 = 15
- Half charge (0.3s): upImpulse = 14 + 0.5 × 10 = 19
- Full charge (0.6s): upImpulse = 14 + 1.0 × 10 = 24 (71% more than tap!)

**Transitions:** After 0.06s → AIRBORNE

## The Full Flop Cycle Timing

```
t=0.00  IDLE (waiting...)
t=0.00  Player presses W
t=0.00  → CURL begins
t=0.12  → SNAP begins (motors reverse violently, launch impulse)
t=0.18  → AIRBORNE (fish is flying, air control active)
t=???   → LAND (depends on height, ~0.5–1.0s typically)
t=???+0.05 → IDLE/CURL again
```

Total flop cycle from key press to airborne: **0.18 seconds**. Feels instant and responsive.

## Reference Files

- State machine: `client/src/fish-flop.ts` lines 555-737
- Vertical dynamics (animation forces): `client/src/fish-flop.ts` lines 466-516
- Config: `packages/shared/src/fish-config.ts` lines 17-34 (curl/snap values)
