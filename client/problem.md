# Problem: Fall Rubberbanding During Elimination

## Issue

When a player is pushed off the platform:
1. **Local player rubberbands up** - Client physics shows falling, but reconciliation pulls back to server's stale "on platform" position
2. **Remote player floats in air** - Server state lags behind, so interpolation shows them at old position instead of falling

## Root Cause

### Reconciliation Fights Falling Physics

Current `reconcileLocalPlayer()` in `main.ts` always reconciles, even during falls:

```typescript
body.setTranslation({
  x: clientPos.x + dx * BLEND_FACTOR,
  y: clientPos.y + dy * BLEND_FACTOR,  // <-- Pulls Y back up during fall!
  z: clientPos.z + dz * BLEND_FACTOR,
}, true);
```

When local player falls:
- Client physics: `y` decreasing rapidly (gravity)
- Server state: Still shows old `y` position (server tick behind)
- Reconciliation: Pulls `y` back UP toward server position
- Result: Rubberbanding

## Research Findings

According to [Gabriel Gambetta's guide](https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html):

> "You shouldn't actually update the health of the character until the server says so... you may want to avoid killing a character until the server says so"

**Key insight:** Don't reconcile critical events - trust local physics for falls and wait for server elimination confirmation.

## Proposed Solution

Skip reconciliation when local player Y is below platform level:

```typescript
const FALL_RECONCILE_SKIP_Y = -0.5;

function reconcileLocalPlayer(...) {
  const clientPos = body.translation();

  // Skip reconciliation when falling
  if (clientPos.y < FALL_RECONCILE_SKIP_Y) {
    return;
  }

  // ... rest of reconciliation
}
```
