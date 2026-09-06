// Copyright 2018-2026 the Deno authors. MIT license.
// This module is browser compatible.

import { RollingCounter } from "@std/data-structures/unstable-rolling-counter";
import { assertPositiveFinite, assertPositiveInteger } from "./_validation.ts";

/**
 * Result returned by algorithm operations. All fields are always present
 * regardless of whether the request was allowed.
 *
 * **Metadata semantics vary by algorithm:**
 *
 * - `retryAfter` is the delay after which a request of the same cost will be
 *   allowed, assuming no other requests consume permits in the meantime.
 * - `resetAt` is the timestamp of the next replenishment event (segment
 *   rotation, window boundary, or refill cycle). For sliding-window and
 *   token-bucket this is *not* necessarily when full capacity is restored.
 */
export interface AlgorithmResult {
  readonly ok: boolean;
  readonly remaining: number;
  readonly resetAt: number;
  readonly retryAfter: number;
  readonly limit: number;
}

/**
 * Pure state machine for a rate limit algorithm. No Map, no timers, no keys.
 * Used by both the keyed layer (Map + eviction) and the primitives (queue +
 * timer).
 */
export interface AlgorithmOps<S> {
  /** Create initial state for a new key or new instance. */
  create(now: number): S;
  /** Advance time (rotate segments, refill tokens, reset window). Mutates state. */
  advance(state: S, now: number): void;
  /** Try to consume `cost` permits. Returns true and mutates state if allowed. */
  tryConsume(state: S, cost: number, now: number): boolean;
  /** Return whether a request of `cost` would be allowed without mutating state. */
  wouldAllow(state: S, cost: number, now: number): boolean;
  /** Compute result metadata (remaining, resetAt, retryAfter). */
  result(state: S, ok: boolean, cost: number, now: number): AlgorithmResult;
  /** Compute the retry delay for a denied request without allocating a result object. */
  computeRetryAfter(state: S, cost: number, now: number): number;
  /** The configured permit limit. */
  readonly limit: number;
}

// --- Fixed Window ---

/** State for the fixed-window algorithm: count in current window and window start time. */
export interface FixedWindowState {
  count: number;
  windowStart: number;
}

/**
 * Creates ops for the fixed-window algorithm. Callers must pass valid parameters.
 *
 * @param limit Maximum permits per window. Must be a positive integer.
 * @param window Window duration in milliseconds. Must be a positive finite number.
 * @returns Algorithm ops for fixed-window rate limiting.
 */
export function createFixedWindowOps(
  limit: number,
  window: number,
): AlgorithmOps<FixedWindowState> {
  const context = "fixed window";
  assertPositiveInteger(context, "limit", limit);
  assertPositiveFinite(context, "window", window);
  return {
    limit,
    create(now) {
      return { count: 0, windowStart: now };
    },
    advance(state, now) {
      if (now - state.windowStart >= window) {
        state.count = 0;
        state.windowStart = state.windowStart +
          Math.floor((now - state.windowStart) / window) * window;
      }
    },
    tryConsume(state, cost, _now) {
      if (state.count + cost > limit) return false;
      state.count += cost;
      return true;
    },
    wouldAllow(state, cost, _now) {
      return state.count + cost <= limit;
    },
    result(state, ok, cost, now) {
      return {
        ok,
        remaining: Math.max(0, limit - state.count),
        resetAt: state.windowStart + window,
        retryAfter: ok ? 0 : this.computeRetryAfter(state, cost, now),
        limit,
      };
    },
    // Clamped so a clock that steps backwards cannot report more than one window.
    computeRetryAfter(state, _cost, now) {
      return Math.min(window, state.windowStart + window - now);
    },
  };
}

// --- Sliding Window ---

/** State for the sliding-window algorithm: segment counter and current segment start time. */
export interface SlidingWindowState {
  counter: RollingCounter;
  segmentStart: number;
}

/**
 * Creates ops for the sliding-window algorithm. Callers must pass valid parameters.
 *
 * @param limit Maximum permits per window. Must be a positive integer.
 * @param window Window duration in milliseconds. Must be a positive finite number.
 * @param segmentsPerWindow Number of segments. Must be an integer >= 2.
 * @returns Algorithm ops for sliding-window rate limiting.
 */
export function createSlidingWindowOps(
  limit: number,
  window: number,
  segmentsPerWindow: number,
): AlgorithmOps<SlidingWindowState> {
  const context = "sliding window";
  assertPositiveInteger(context, "limit", limit);
  assertPositiveFinite(context, "window", window);
  if (!Number.isInteger(segmentsPerWindow) || segmentsPerWindow < 2) {
    throw new RangeError(
      `Cannot create ${context}: 'segmentsPerWindow' must be an integer >= 2, received ${segmentsPerWindow}`,
    );
  }
  const segmentDuration = window / segmentsPerWindow;

  return {
    limit,
    create(now) {
      return {
        counter: new RollingCounter(segmentsPerWindow),
        segmentStart: now,
      };
    },
    advance(state, now) {
      const elapsed = now - state.segmentStart;
      if (elapsed >= segmentDuration) {
        const rotations = Math.floor(elapsed / segmentDuration);
        state.counter.rotate(rotations);
        state.segmentStart += rotations * segmentDuration;
      }
    },
    tryConsume(state, cost, _now) {
      if (state.counter.total + cost > limit) return false;
      state.counter.increment(cost);
      return true;
    },
    wouldAllow(state, cost, _now) {
      return state.counter.total + cost <= limit;
    },
    result(state, ok, cost, now) {
      return {
        ok,
        remaining: Math.max(0, limit - state.counter.total),
        resetAt: state.segmentStart + segmentDuration,
        retryAfter: ok ? 0 : this.computeRetryAfter(state, cost, now),
        limit,
      };
    },
    // Walks segments oldest-first until enough permits have rotated out to
    // fit `cost`. Elapsed is clamped so a clock that steps backwards cannot
    // inflate the delay.
    computeRetryAfter(state, cost, now) {
      const deficit = state.counter.total + cost - limit;
      const elapsed = Math.max(0, now - state.segmentStart);
      let freed = 0;
      for (let i = 0; i < segmentsPerWindow; i++) {
        freed += state.counter.at(i)!;
        if (freed >= deficit) return (i + 1) * segmentDuration - elapsed;
      }
      return window - elapsed;
    },
  };
}

// --- Token Bucket ---

/** State for the token-bucket algorithm: current tokens and last refill time. */
export interface TokenBucketState {
  tokens: number;
  lastRefill: number;
}

/**
 * Creates ops for the token-bucket algorithm. Callers must pass valid parameters.
 *
 * @param limit Maximum tokens (bucket capacity). Must be a positive integer.
 * @param window Refill cycle duration in milliseconds. Must be a positive finite number.
 * @param tokensPerPeriod Tokens added per replenishment period. Must be a positive integer.
 * @returns Algorithm ops for token-bucket rate limiting.
 */
export function createTokenBucketOps(
  limit: number,
  window: number,
  tokensPerPeriod: number,
): AlgorithmOps<TokenBucketState> {
  const context = "token bucket";
  assertPositiveInteger(context, "limit", limit);
  assertPositiveFinite(context, "window", window);
  assertPositiveInteger(context, "tokensPerPeriod", tokensPerPeriod);
  return {
    limit,
    create(now) {
      return { tokens: limit, lastRefill: now };
    },
    advance(state, now) {
      const elapsed = now - state.lastRefill;
      if (elapsed >= window) {
        const cycles = Math.floor(elapsed / window);
        state.tokens = Math.min(limit, state.tokens + cycles * tokensPerPeriod);
        state.lastRefill += cycles * window;
      }
    },
    tryConsume(state, cost, _now) {
      if (state.tokens < cost) return false;
      state.tokens -= cost;
      return true;
    },
    wouldAllow(state, cost, _now) {
      return state.tokens >= cost;
    },
    result(state, ok, cost, now) {
      const remaining = Math.max(0, Math.floor(state.tokens));
      return {
        ok,
        remaining,
        resetAt: state.lastRefill + window,
        retryAfter: ok ? 0 : this.computeRetryAfter(state, cost, now),
        limit,
      };
    },
    // Elapsed is clamped so a clock that steps backwards cannot inflate the delay.
    computeRetryAfter(state, cost, now) {
      const deficit = cost - state.tokens;
      const cycles = Math.ceil(deficit / tokensPerPeriod);
      const elapsed = Math.max(0, now - state.lastRefill);
      return Math.max(0, cycles * window - elapsed);
    },
  };
}

// --- GCRA (Generic Cell Rate Algorithm) ---

/**
 * State for GCRA: theoretical arrival time (TAT) of the last request, scaled
 * by `limit` so the emission interval is the integer `window` and no
 * `window / limit` rounding accumulates across requests.
 */
export interface GcraState {
  tatScaled: number;
}

/**
 * Creates ops for the GCRA (Generic Cell Rate Algorithm). Callers must pass valid parameters.
 *
 * @param limit Maximum permits per window. Must be a positive integer.
 * @param window Window (tau) in milliseconds. Must be a positive finite number.
 * @returns Algorithm ops for GCRA rate limiting.
 */
export function createGcraOps(
  limit: number,
  window: number,
): AlgorithmOps<GcraState> {
  const context = "gcra";
  assertPositiveInteger(context, "limit", limit);
  assertPositiveFinite(context, "window", window);
  // All arithmetic runs in units scaled by `limit`: one permit costs
  // `window`, and the burst allowance (tau) is `window * limit`.
  const tauScaled = window * limit;

  function remaining(state: GcraState, nowScaled: number): number {
    const diff = tauScaled - (state.tatScaled - nowScaled);
    return Math.min(limit, Math.max(0, Math.floor(diff / window)));
  }

  return {
    limit,
    create(now) {
      return { tatScaled: now * limit };
    },
    advance(_state, _now) {},
    tryConsume(state: GcraState, cost: number, now: number) {
      const nowScaled = now * limit;
      const allowAt = state.tatScaled - tauScaled;
      if (nowScaled < allowAt) return false;
      const newTat = Math.max(state.tatScaled, nowScaled) + window * cost;
      if (newTat - nowScaled > tauScaled) return false;
      state.tatScaled = newTat;
      return true;
    },
    wouldAllow(state: GcraState, cost: number, now: number) {
      const nowScaled = now * limit;
      const allowAt = state.tatScaled - tauScaled;
      if (nowScaled < allowAt) return false;
      const newTat = Math.max(state.tatScaled, nowScaled) + window * cost;
      return newTat - nowScaled <= tauScaled;
    },
    result(state, ok, cost, now) {
      return {
        ok,
        remaining: remaining(state, now * limit),
        resetAt: state.tatScaled / limit,
        retryAfter: ok ? 0 : this.computeRetryAfter(state, cost, now),
        limit,
      };
    },
    // A monotonic clock never exceeds `cost` emission intervals; the clamp
    // only bites when the clock steps backwards.
    computeRetryAfter(state, cost, now) {
      const nowScaled = now * limit;
      const allowAt = state.tatScaled - tauScaled;
      const newTat = Math.max(state.tatScaled, nowScaled) + window * cost;
      const waitScaled = nowScaled < allowAt
        ? allowAt - nowScaled
        : Math.max(0, newTat - tauScaled - nowScaled);
      return Math.min(window * cost, waitScaled) / limit;
    },
  };
}
