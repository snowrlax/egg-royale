/**
 * Network statistics tracker for ping measurement and buffer sizing.
 * Uses rolling averages to smooth out variance and estimate optimal buffer size.
 */

const TICK_MS = 1000 / 30;
const SAMPLE_WINDOW = 20;
const MIN_BUFFER_TICKS = 2;
const MAX_BUFFER_TICKS = 10;

export type NetworkStats = {
  readonly ping: number;
  readonly jitter: number;
  readonly clockOffset: number;
  readonly estimatedServerTick: number;
  onServerMessage(serverTs: number, localReceiveTime: number): void;
  getTargetBufferTicks(): number;
  updateEstimatedServerTick(): void;
};

type Sample = {
  rtt: number;
  offset: number;
};

export function createNetworkStats(): NetworkStats {
  const samples: Sample[] = [];
  let ping = 50; // Initial guess
  let jitter = 10;
  let clockOffset = 0;
  let estimatedServerTick = 0;
  let lastLocalTime = performance.now();

  function average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  function stddev(values: number[]): number {
    if (values.length < 2) return 0;
    const avg = average(values);
    const variance =
      values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
    return Math.sqrt(variance);
  }

  function median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  return {
    get ping() {
      return ping;
    },

    get jitter() {
      return jitter;
    },

    get clockOffset() {
      return clockOffset;
    },

    get estimatedServerTick() {
      return estimatedServerTick;
    },

    onServerMessage(serverTs: number, localReceiveTime: number): void {
      // One-way latency approximation: server sent at serverTs, we received at localReceiveTime
      // This is imprecise because clocks aren't synchronized, but we use the difference
      // to estimate clock offset and calculate relative RTT
      const oneWayLatency = localReceiveTime - serverTs;

      // RTT approximation: double the one-way latency
      // This assumes symmetric latency which is often close enough
      const rtt = Math.max(0, oneWayLatency * 2);

      // Clock offset: how far ahead/behind the server is relative to us
      // Negative means server clock is behind local clock
      const offset = serverTs - localReceiveTime + oneWayLatency;

      samples.push({ rtt, offset });
      if (samples.length > SAMPLE_WINDOW) {
        samples.shift();
      }

      // Calculate rolling statistics
      const rtts = samples.map((s) => s.rtt);
      ping = average(rtts);
      jitter = stddev(rtts);
      clockOffset = median(samples.map((s) => s.offset));
    },

    getTargetBufferTicks(): number {
      // Target delay = 2x ping + 2x jitter for safety margin
      const targetMs = ping * 2 + jitter * 2;
      const targetTicks = Math.ceil(targetMs / TICK_MS);
      return Math.max(MIN_BUFFER_TICKS, Math.min(MAX_BUFFER_TICKS, targetTicks));
    },

    updateEstimatedServerTick(): void {
      const now = performance.now();
      const elapsed = now - lastLocalTime;
      lastLocalTime = now;

      // Advance estimated server tick based on elapsed time
      estimatedServerTick += elapsed / TICK_MS;
    },
  };
}
