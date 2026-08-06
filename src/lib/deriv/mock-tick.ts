'use strict';

/**
 * Pure helpers for the local tick feed used by the ideations POC.
 * Crash symbols still model Crash N average spacing for realism.
 */

export const MOCK_TICK_INTERVAL_MS = 1_000;
export const MOCK_PIP_SIZE = 2;

/** Relative upward drift between Crash corrections (~0.002–0.004%). */
const CRASH_DRIFT_MIN = 0.00002;
const CRASH_DRIFT_MAX = 0.00004;
/** Relative drop size on a Crash correction (~0.2–2%). */
const CRASH_DROP_MIN = 0.002;
const CRASH_DROP_MAX = 0.02;

/** Seed quote per symbol family so Crash / Vol indices look distinct. */
export function seedQuoteForSymbol(symbol: string): number {
  if (symbol.startsWith('CRASH')) return 8000 + (symbol.length % 7) * 111;
  if (symbol.startsWith('1HZ')) return 1000 + (symbol.length % 5) * 37;
  if (symbol.startsWith('R_')) return 500 + (symbol.length % 5) * 23;
  return 1000;
}

/**
 * Average ticks between Crash events from a Deriv Crash symbol id
 * (`CRASH50`, `CRASH150N`, `CRASH300N`, …). Returns null for non-Crash symbols.
 */
export function crashAvgTicksFromSymbol(symbol: string): number | null {
  const match = /^CRASH(\d+)N?$/i.exec(symbol);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * One Crash-index step: drift slightly up with probability (1 - 1/N),
 * otherwise drop (a correction). Matches the memoryless geometric model
 * Index Ascent prices against.
 */
export function nextCrashMockQuote(
  previous: number,
  avgTicksPerCrash: number,
  rng: () => number = Math.random,
): string {
  const p = 1 / avgTicksPerCrash;
  let next: number;
  if (rng() < p) {
    const drop = CRASH_DROP_MIN + rng() * (CRASH_DROP_MAX - CRASH_DROP_MIN);
    next = previous * (1 - drop);
  } else {
    const drift = CRASH_DRIFT_MIN + rng() * (CRASH_DRIFT_MAX - CRASH_DRIFT_MIN);
    next = previous * (1 + drift);
  }
  return Math.max(1, next).toFixed(MOCK_PIP_SIZE);
}

/**
 * One random-walk step with 2 decimal places so last-digit extraction
 * stays meaningful for digit games.
 */
export function nextMockQuote(
  previous: number,
  rng: () => number = Math.random,
): string {
  const step = (rng() - 0.5) * 0.4;
  const next = Math.max(1, previous + step);
  return next.toFixed(MOCK_PIP_SIZE);
}

/** Symbol-aware mock tick — Crash indices use geometric corrections. */
export function nextMockQuoteForSymbol(
  symbol: string,
  previous: number,
  rng: () => number = Math.random,
): string {
  const avg = crashAvgTicksFromSymbol(symbol);
  if (avg !== null) return nextCrashMockQuote(previous, avg, rng);
  return nextMockQuote(previous, rng);
}

export function buildMockTickPayload(
  symbol: string,
  quote: string,
  epochSec: number = Math.floor(Date.now() / 1000),
): { epoch: number; quote: string; symbol: string; pip_size: number } {
  return {
    epoch: epochSec,
    quote,
    symbol,
    pip_size: MOCK_PIP_SIZE,
  };
}
