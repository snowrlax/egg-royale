/**
 * Tick-ordered state buffer for remote player interpolation.
 * Stores states keyed by server tick number for correct ordering
 * regardless of network packet arrival order.
 */

import type { FishState } from "@fish-jam/shared";

const DEFAULT_MAX_SIZE = 30; // ~1 second of states at 30Hz
const MAX_EXTRAPOLATION_TICKS = 2;

export type InterpolationData = {
  state0: FishState;
  state1: FishState;
  t: number; // 0-1 for interpolation, >1 for extrapolation
  isExtrapolating: boolean;
  gapTicks: number; // Missing ticks between state0 and state1
};

export type TickBuffer = {
  insert(tick: number, state: FishState): void;
  getInterpolationData(targetTick: number): InterpolationData | null;
  setMaxSize(size: number): void;
  getLatestTick(): number | null;
  readonly size: number;
};

export function createTickBuffer(maxSize: number = DEFAULT_MAX_SIZE): TickBuffer {
  const states = new Map<number, FishState>();
  const ticks: number[] = []; // Sorted array of tick numbers
  let currentMaxSize = maxSize;

  function binarySearchInsertIndex(tick: number): number {
    let lo = 0;
    let hi = ticks.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (ticks[mid] < tick) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo;
  }

  function findBracket(targetTick: number): { i0: number; i1: number } | null {
    if (ticks.length === 0) return null;

    // If target is before all states, return first two (or just first if only one)
    if (targetTick <= ticks[0]) {
      return { i0: 0, i1: Math.min(1, ticks.length - 1) };
    }

    // If target is after all states, return last two for extrapolation
    if (targetTick >= ticks[ticks.length - 1]) {
      const lastIdx = ticks.length - 1;
      return { i0: Math.max(0, lastIdx - 1), i1: lastIdx };
    }

    // Find bracket: ticks[i0] <= targetTick < ticks[i1]
    for (let i = 0; i < ticks.length - 1; i++) {
      if (ticks[i] <= targetTick && targetTick < ticks[i + 1]) {
        return { i0: i, i1: i + 1 };
      }
    }

    // Fallback (shouldn't reach here)
    const lastIdx = ticks.length - 1;
    return { i0: Math.max(0, lastIdx - 1), i1: lastIdx };
  }

  function prune(): void {
    while (ticks.length > currentMaxSize) {
      const oldTick = ticks.shift();
      if (oldTick !== undefined) {
        states.delete(oldTick);
      }
    }
  }

  return {
    get size() {
      return states.size;
    },

    insert(tick: number, state: FishState): void {
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
      prune();
    },

    getInterpolationData(targetTick: number): InterpolationData | null {
      if (ticks.length === 0) return null;

      const bracket = findBracket(targetTick);
      if (!bracket) return null;

      const tick0 = ticks[bracket.i0];
      const tick1 = ticks[bracket.i1];
      const state0 = states.get(tick0);
      const state1 = states.get(tick1);

      if (!state0 || !state1) return null;

      // Calculate interpolation factor
      const tickSpan = tick1 - tick0;
      const gapTicks = tickSpan - 1; // Ticks missing between the two states

      let t: number;
      let isExtrapolating = false;

      if (tickSpan === 0) {
        // Same tick (edge case)
        t = 0;
      } else if (targetTick >= tick1) {
        // Extrapolating past newest state
        const extraTicks = targetTick - tick1;
        if (extraTicks > MAX_EXTRAPOLATION_TICKS) {
          // Cap extrapolation - just hold at last state
          t = 1;
        } else {
          // Extrapolate linearly
          t = 1 + extraTicks / tickSpan;
          isExtrapolating = true;
        }
      } else if (targetTick <= tick0) {
        // Before oldest state - snap to oldest
        t = 0;
      } else {
        // Normal interpolation
        t = (targetTick - tick0) / tickSpan;
      }

      return {
        state0,
        state1,
        t,
        isExtrapolating,
        gapTicks,
      };
    },

    setMaxSize(size: number): void {
      currentMaxSize = Math.max(2, size);
      prune();
    },

    getLatestTick(): number | null {
      return ticks.length > 0 ? ticks[ticks.length - 1] : null;
    },
  };
}
