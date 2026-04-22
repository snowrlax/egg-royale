# Egg Royale - Network Architecture & Implementation Notes

## Server-Authoritative Model

### Current Architecture
- **Server tick rate**: 30Hz (33.33ms per tick)
- **Physics engine**: Rapier3D on both client and server
- **Protocol**: Socket.IO with typed envelopes containing `{ v, type, ts, payload }`
- **Message types**: `joined`, `snapshot`, `delta`, `playerLeft`, `playerEliminated`, `roundWinner`

### Message Envelope Structure
```typescript
type MessageEnvelope<TType, TPayload> = {
  v: 1;           // Protocol version
  type: TType;    // Event name
  ts: number;     // Server timestamp (Date.now())
  payload: TPayload;
};
```

---

## Ping-Adaptive Tick Buffer System

### Problem Statement
The original implementation had:
- Hardcoded 5-state buffer with arrival-time ordering
- Fixed 2-tick (66ms) render delay regardless of network conditions
- No ping measurement - couldn't adapt to network latency
- No out-of-order handling - packets appended by arrival time, not tick number

This caused visual artifacts when:
- Network latency varies (buffer too small → jitter, too large → sluggish)
- Packets arrive out of order (wrong interpolation order)
- Connection quality changes mid-game

### Solution Implemented

#### 1. Network Statistics (`network-stats.ts`)
Tracks ping, jitter, and server-client clock offset using rolling averages.

**Algorithm:**
```typescript
// Server sends ts: Date.now() in every envelope
// Client calculates one-way latency approximation
const oneWayLatency = localReceiveTime - serverTs;
const rtt = oneWayLatency * 2;  // Assumes symmetric latency
const offset = serverTs - localReceiveTime + oneWayLatency;

// Rolling average over 20 samples for stability
ping = average(samples.map(s => s.rtt));
jitter = stddev(samples.map(s => s.rtt));
clockOffset = median(samples.map(s => s.offset));
```

**Buffer Sizing Formula:**
```typescript
function getTargetBufferTicks(): number {
  const targetMs = ping * 2 + jitter * 2;  // 2x ping + 2x jitter margin
  const targetTicks = Math.ceil(targetMs / TICK_MS);
  return clamp(targetTicks, MIN_BUFFER_TICKS, MAX_BUFFER_TICKS);
}

// Constants
const MIN_BUFFER_TICKS = 2;   // ~66ms minimum delay
const MAX_BUFFER_TICKS = 10;  // ~333ms maximum delay
```

#### 2. Tick Buffer (`tick-buffer.ts`)
Tick-ordered state buffer with dynamic sizing.

**Data Structure:**
- `Map<number, FishState>` for O(1) lookup by tick
- Sorted `ticks: number[]` array for bracket finding
- Binary search for efficient insertion

**Out-of-Order Packet Handling:**
```typescript
function insert(tick: number, state: FishState): void {
  // Duplicate tick: keep newer state
  if (states.has(tick)) {
    states.set(tick, state);
    return;
  }

  states.set(tick, state);

  // Insert into sorted ticks array using binary search
  const idx = binarySearchInsertIndex(tick);
  ticks.splice(idx, 0, tick);

  // Prune old states if exceeding max
  while (ticks.length > maxSize) {
    const oldTick = ticks.shift();
    states.delete(oldTick);
  }
}
```

**Interpolation Data:**
```typescript
type InterpolationData = {
  state0: FishState;      // Earlier state
  state1: FishState;      // Later state
  t: number;              // 0-1 for interpolation, >1 for extrapolation
  isExtrapolating: boolean;
  gapTicks: number;       // Missing ticks between state0 and state1
};
```

#### 3. Interpolation Algorithm
```typescript
function interpolateRemoteFish(fish: RemoteFish, stats: NetworkStats): void {
  const bufferDelay = stats.getTargetBufferTicks();
  const renderTick = fish.lastServerTick - bufferDelay;

  const data = fish.tickBuffer.getInterpolationData(renderTick);
  if (!data) return;

  // Warn on large gaps (potential packet loss)
  if (data.gapTicks > 2) {
    console.warn(`[INTERP] ${fish.id} gap=${data.gapTicks} ticks`);
  }

  // Lerp position, slerp rotation
  lerpFishState(fish.meshes, data.state0, data.state1, data.t);
  syncKinematicBody(fish);
}
```

---

## Edge Cases & Handling

| Scenario | Handling |
|----------|----------|
| First state received | Snap directly, no interpolation |
| Out-of-order packet | Insert at correct tick position via binary search |
| Duplicate tick | Overwrite with newer state |
| Large gap (>5 ticks) | Log warning, continue interpolation |
| Buffer runs empty | Hold last position, extrapolate up to 2 ticks |
| Ping spike | Buffer grows gradually (smoothed by rolling average) |
| Ping drops | Buffer shrinks (MIN_BUFFER_TICKS floor prevents jitter) |

---

## Files Modified/Created

### New Files
- `client/src/net/network-stats.ts` - Ping measurement module
- `client/src/net/tick-buffer.ts` - Tick-ordered buffer module

### Modified Files
- `client/src/net/socket-manager.ts` - Extract server timestamps from envelopes
- `client/src/remote-fish.ts` - Use new tick buffer and network stats
- `client/src/main.ts` - Wire everything together

---

## Constants Reference

```typescript
// Timing
const TICK_MS = 1000 / 30;            // 33.33ms per tick

// Buffer sizing
const MIN_BUFFER_TICKS = 2;            // ~66ms minimum delay
const MAX_BUFFER_TICKS = 10;           // ~333ms maximum delay
const MAX_EXTRAPOLATION_TICKS = 2;     // ~66ms extrapolation limit
const DEFAULT_MAX_SIZE = 30;           // ~1 second of states at 30Hz

// Ping measurement
const PING_SAMPLE_WINDOW = 20;         // Rolling average window
```

---

## Future Improvements

### TODO: Server Reconciliation for Local Player
Currently, local player uses pure client-side prediction with no server correction. Consider:
- [ ] Add server state reconciliation for local player
- [ ] Implement input replay on misprediction
- [ ] Add visual smoothing for corrections

### TODO: Packet Loss Detection
- [ ] Track sequence numbers to detect dropped packets
- [ ] Implement request-retransmit for critical state
- [ ] Add redundancy for important updates

### TODO: Bandwidth Optimization
- [ ] Delta compression for fish states
- [ ] Only send changed fields
- [ ] Reduce precision for rotation quaternions (normalize on receive)

### TODO: Debug Visualization
- [ ] Add overlay showing current ping/jitter
- [ ] Visualize buffer fill level
- [ ] Show interpolation vs extrapolation mode

---

## Testing Notes

### Manual Testing
1. **Build all packages:**
   ```bash
   cd packages/shared && npm run build
   cd ../client && npm run build
   ```

2. **Start server:**
   ```bash
   cd server && npm run dev
   ```

3. **Test with network throttling:**
   - Open Chrome DevTools → Network → Throttle to "Slow 3G"
   - Observe buffer size adapting to higher latency
   - Watch console for ping measurements

4. **Test out-of-order packets:**
   - Use Network Link Conditioner or similar to add packet reordering
   - Verify smooth interpolation despite packet arrival order

5. **Test ping spike recovery:**
   - Temporarily increase latency, then restore
   - Verify smooth transition without visual jumps

---

## Architecture Diagram

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ SocketManager   │────▶│  NetworkStats   │────▶│   TickBuffer    │
│ extracts env.ts │     │ ping, jitter,   │     │ per-fish states │
│ from envelopes  │     │ clock offset    │     │ by tick number  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                │
                                ▼
                        ┌─────────────────┐
                        │  Interpolator   │
                        │ renderTick =    │
                        │ serverTick -    │
                        │ bufferDelay     │
                        └─────────────────┘
```

---

## References

- Rapier3D Physics: https://rapier.rs/
- Socket.IO: https://socket.io/
- Gaffer On Games - Networked Physics: https://gafferongames.com/
- Valve Source Multiplayer Networking: https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking
