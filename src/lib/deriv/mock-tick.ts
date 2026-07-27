'use strict';

/**
 * Pure helpers for the local demo tick feed used when Deriv markets
 * are unavailable (e.g. geo-blocked regions).
 */

export const MOCK_TICK_INTERVAL_MS = 1_000;
export const MOCK_PIP_SIZE = 2;

/** Seed quote per symbol family so Crash / Vol indices look distinct. */
export function seedQuoteForSymbol(symbol: string): number {
  if (symbol.startsWith('CRASH')) return 8000 + (symbol.length % 7) * 111;
  if (symbol.startsWith('1HZ')) return 1000 + (symbol.length % 5) * 37;
  if (symbol.startsWith('R_')) return 500 + (symbol.length % 5) * 23;
  return 1000;
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
