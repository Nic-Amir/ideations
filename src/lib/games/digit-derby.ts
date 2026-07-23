'use strict';

/**
 * Digit Derby — ten digits (0–9) race on live last-digit counts.
 * Each streamed tick advances that digit; first to finishCount wins.
 *
 * Pricing assumes uniform last digits (P = 0.1) with Digits/Barrier Race
 * commission: offeredOdds = 1 / (P + c).
 */

export const DIGIT_COUNT = 10;

export interface DigitDerbyConfig {
  /** Counts needed to win (finish line). */
  finishCount: number;
  /** House edge added to base probability before odds. */
  commission: number;
  /** Soft timeout — refund if no winner by this many ticks. */
  maxTicks: number;
  /** Base win probability under uniform last digits. */
  winProbability: number;
}

export const DIGIT_DERBY_CONFIG: DigitDerbyConfig = {
  finishCount: 5,
  commission: 0.02,
  maxTicks: 120,
  winProbability: 0.1,
};

export type DigitCounts = number[];

export type DigitDerbyOutcome = 'win' | 'lose' | 'refund';

export interface DigitDerbySettlement {
  outcome: DigitDerbyOutcome;
  payout: number;
  multiplier: number;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/** Offered odds: 1 / (P + c), floored at 1.01×. */
export function offeredOdds(config: DigitDerbyConfig = DIGIT_DERBY_CONFIG): number {
  const p = config.winProbability;
  const c = config.commission;
  if (p + c <= 0) return 0;
  return Math.max(1.01, round2(1 / (p + c)));
}

export function emptyCounts(): DigitCounts {
  return Array.from({ length: DIGIT_COUNT }, () => 0);
}

export function isValidDigit(digit: number): boolean {
  return Number.isInteger(digit) && digit >= 0 && digit < DIGIT_COUNT;
}

/** Immutable increment of the digit that streamed. */
export function applyTick(counts: DigitCounts, digit: number): DigitCounts {
  if (!isValidDigit(digit)) return counts;
  const next = counts.slice();
  next[digit] += 1;
  return next;
}

/** Winner when some digit reaches finishCount; otherwise null. */
export function findWinner(
  counts: DigitCounts,
  finishCount: number = DIGIT_DERBY_CONFIG.finishCount,
): number | null {
  for (let d = 0; d < DIGIT_COUNT; d++) {
    if (counts[d] >= finishCount) return d;
  }
  return null;
}

/**
 * Rank digits by count descending; ties broken by lower digit index.
 * Returns digit indices ordered 1st → 10th.
 */
export function rankDigits(counts: DigitCounts): number[] {
  const order = Array.from({ length: DIGIT_COUNT }, (_, i) => i);
  order.sort((a, b) => counts[b] - counts[a] || a - b);
  return order;
}

export function settleWinner(
  pick: number,
  winner: number,
  stake: number,
  multiplier: number,
): DigitDerbySettlement {
  const won = pick === winner;
  return {
    outcome: won ? 'win' : 'lose',
    payout: won ? Math.round(stake * multiplier) : 0,
    multiplier: won ? multiplier : 0,
  };
}

export function settleRefund(stake: number): DigitDerbySettlement {
  return {
    outcome: 'refund',
    payout: Math.round(stake),
    multiplier: 1,
  };
}

/** Progress toward finish as a 0–1 fraction (capped). */
export function progressTowardFinish(
  count: number,
  finishCount: number = DIGIT_DERBY_CONFIG.finishCount,
): number {
  if (finishCount <= 0) return 0;
  return Math.min(1, Math.max(0, count / finishCount));
}

/** True when any digit is at or past the final-stretch threshold (80% of K). */
export function isFinalStretch(
  counts: DigitCounts,
  finishCount: number = DIGIT_DERBY_CONFIG.finishCount,
): boolean {
  const threshold = finishCount * 0.8;
  return counts.some((c) => c >= threshold);
}
