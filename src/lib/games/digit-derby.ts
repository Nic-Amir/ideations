'use strict';

/**
 * Digit Derby — ten digits (0–9) race on live last-digit counts.
 * First to finishCount wins the race; tickets settle against finish order.
 *
 * Markets: Outright, Top 3, Pair, Trio, Top 5 (Basket / Exact), Spread, Margin.
 * Pricing: uniform finish-order permutation for ranking markets; MC-backed
 * margin lead probs for Margin. Commission: odds = 1 / (P + c).
 */

export const DIGIT_COUNT = 10;

export type DigitBetMode =
  | 'outright'
  | 'top3'
  | 'pair'
  | 'trio'
  | 'top5'
  | 'spread'
  | 'margin';

export type MarginThreshold = 1 | 2 | 3;

export interface DigitBetModeSpec {
  id: DigitBetMode;
  label: string;
  tag: string;
  picks: number;
  orderable: boolean;
}

export const DIGIT_BET_MODES: DigitBetModeSpec[] = [
  { id: 'outright', label: 'Outright', tag: 'Call the #1 digit', picks: 1, orderable: false },
  { id: 'top3', label: 'Top 3', tag: 'Digit finishes in the money', picks: 1, orderable: false },
  { id: 'pair', label: 'Pair', tag: 'Basket of 2 in top 2', picks: 2, orderable: true },
  { id: 'trio', label: 'Trio', tag: 'Basket of 3 in top 3', picks: 3, orderable: true },
  { id: 'top5', label: 'Top 5', tag: 'Basket of 5 in top 5', picks: 5, orderable: true },
  { id: 'spread', label: 'Spread', tag: 'Long finishes ahead of Short', picks: 2, orderable: false },
  { id: 'margin', label: 'Margin', tag: 'Call the winning lead', picks: 0, orderable: false },
];

export const MARGIN_THRESHOLDS: {
  threshold: MarginThreshold;
  label: string;
  tag: string;
}[] = [
  { threshold: 1, label: 'Photo', tag: 'Lead exactly 1' },
  { threshold: 2, label: 'Wide', tag: 'Lead ≥ 2' },
  { threshold: 3, label: 'Blowout', tag: 'Lead ≥ 3' },
];

export function getDigitBetModeSpec(id: DigitBetMode): DigitBetModeSpec {
  return DIGIT_BET_MODES.find((m) => m.id === id) ?? DIGIT_BET_MODES[0];
}

export interface DigitDerbyPick {
  mode: DigitBetMode;
  /** Meaningful when mode.orderable — Exact vs Basket. */
  ordered: boolean;
  /** Digits in slot order (Exact / Spread long-short). */
  digits: number[];
  /** Margin contract: 1 = Photo, 2 = Wide, 3 = Blowout. */
  marginThreshold?: MarginThreshold;
}

export interface DigitDerbyConfig {
  /** Counts needed to win (finish line). */
  finishCount: number;
  /** House edge added to base probability before odds. */
  commission: number;
  /** Soft timeout — refund if no winner by this many ticks. */
  maxTicks: number;
  /**
   * Margin lead probs from uniform-digit MC (finishCount=5, N≈200k).
   * Photo = P(lead===1); Wide = P(lead≥2); Blowout = P(lead≥3).
   */
  marginPhotoP: number;
  marginWideP: number;
  marginBlowoutP: number;
}

export const DIGIT_DERBY_CONFIG: DigitDerbyConfig = {
  finishCount: 5,
  commission: 0.02,
  maxTicks: 120,
  marginPhotoP: 0.612,
  marginWideP: 0.388,
  marginBlowoutP: 0.095,
};

/** Per-digit silks — distinct hues for race identity (pick uses primary ring). */
export const DIGIT_SILKS = [
  '#f43f5e',
  '#fb923c',
  '#facc15',
  '#a3e635',
  '#34d399',
  '#2dd4bf',
  '#38bdf8',
  '#818cf8',
  '#c084fc',
  '#f472b6',
] as const;

export type DigitCounts = number[];

export type DigitDerbyOutcome = 'win' | 'lose' | 'refund';

export interface DigitDerbySettlement {
  outcome: DigitDerbyOutcome;
  payout: number;
  multiplier: number;
}

export interface PickPricing {
  probability: number;
  multiplier: number;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/** P(n, k) = n! / (n-k)! */
export function fallingFactorial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let p = 1;
  for (let i = 0; i < k; i++) p *= n - i;
  return p;
}

export function factorial(n: number): number {
  if (n < 0) return 0;
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
}

export function isPickComplete(pick: DigitDerbyPick): boolean {
  const spec = getDigitBetModeSpec(pick.mode);
  if (pick.mode === 'margin') {
    return (
      pick.marginThreshold === 1 ||
      pick.marginThreshold === 2 ||
      pick.marginThreshold === 3
    );
  }
  return pick.digits.length === spec.picks;
}

/**
 * Fair event probability under uniform random finish-order permutation
 * (ranking markets) or MC margin lead probs (Margin).
 */
export function eventProbability(
  pick: DigitDerbyPick,
  config: DigitDerbyConfig = DIGIT_DERBY_CONFIG,
): number {
  if (!isPickComplete(pick)) return 0;

  switch (pick.mode) {
    case 'outright':
      return 1 / DIGIT_COUNT;
    case 'top3':
      return 3 / DIGIT_COUNT;
    case 'spread':
      return 0.5;
    case 'margin': {
      if (pick.marginThreshold === 1) return config.marginPhotoP;
      if (pick.marginThreshold === 2) return config.marginWideP;
      return config.marginBlowoutP;
    }
    case 'pair':
    case 'trio':
    case 'top5': {
      const k = getDigitBetModeSpec(pick.mode).picks;
      const denom = fallingFactorial(DIGIT_COUNT, k);
      if (denom === 0) return 0;
      return pick.ordered ? 1 / denom : factorial(k) / denom;
    }
    default:
      return 0;
  }
}

/** Offered odds: 1 / (P + c), floored at 1.01×. */
export function offeredOddsFromProbability(
  p: number,
  config: DigitDerbyConfig = DIGIT_DERBY_CONFIG,
): number {
  const c = config.commission;
  if (p + c <= 0) return 0;
  return Math.max(1.01, round2(1 / (p + c)));
}

/** @deprecated Prefer pricePick — kept for outright-only callers/tests. */
export function offeredOdds(config: DigitDerbyConfig = DIGIT_DERBY_CONFIG): number {
  return offeredOddsFromProbability(1 / DIGIT_COUNT, config);
}

export function pricePick(
  pick: DigitDerbyPick,
  config: DigitDerbyConfig = DIGIT_DERBY_CONFIG,
): PickPricing {
  const probability = eventProbability(pick, config);
  return {
    probability,
    multiplier: offeredOddsFromProbability(probability, config),
  };
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

/** Lead of 1st over 2nd at finish: counts[1st] - counts[2nd]. */
export function winningLead(
  counts: DigitCounts,
  finishOrder: number[],
): number {
  if (finishOrder.length < 2) return 0;
  return counts[finishOrder[0]] - counts[finishOrder[1]];
}

export function settleBet(
  pick: DigitDerbyPick,
  finishOrder: number[],
  stake: number,
  multiplier: number,
  counts?: DigitCounts,
): DigitDerbySettlement {
  const spec = getDigitBetModeSpec(pick.mode);
  let won = false;

  if (pick.mode === 'outright') {
    won = finishOrder[0] === pick.digits[0];
  } else if (pick.mode === 'top3') {
    won = finishOrder.slice(0, 3).includes(pick.digits[0]);
  } else if (pick.mode === 'spread') {
    const longIdx = finishOrder.indexOf(pick.digits[0]);
    const shortIdx = finishOrder.indexOf(pick.digits[1]);
    won = longIdx >= 0 && shortIdx >= 0 && longIdx < shortIdx;
  } else if (pick.mode === 'margin') {
    if (!counts || !pick.marginThreshold) {
      won = false;
    } else {
      const lead = winningLead(counts, finishOrder);
      if (pick.marginThreshold === 1) won = lead === 1;
      else won = lead >= pick.marginThreshold;
    }
  } else {
    const top = finishOrder.slice(0, spec.picks);
    won = pick.ordered
      ? pick.digits.every((d, i) => top[i] === d)
      : pick.digits.length === top.length &&
        pick.digits.every((d) => top.includes(d));
  }

  return {
    outcome: won ? 'win' : 'lose',
    payout: won ? Math.round(stake * multiplier) : 0,
    multiplier: won ? multiplier : 0,
  };
}

/** @deprecated Prefer settleBet. */
export function settleWinner(
  pick: number,
  winner: number,
  stake: number,
  multiplier: number,
): DigitDerbySettlement {
  return settleBet(
    { mode: 'outright', ordered: false, digits: [pick] },
    [winner],
    stake,
    multiplier,
  );
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

/** Simulate one first-to-K race; returns winning lead. Used by MC tests. */
export function simulateWinningLead(
  finishCount: number = DIGIT_DERBY_CONFIG.finishCount,
  rng: () => number = Math.random,
): number {
  let counts = emptyCounts();
  for (;;) {
    const digit = Math.floor(rng() * DIGIT_COUNT);
    counts = applyTick(counts, digit);
    if (findWinner(counts, finishCount) !== null) {
      return winningLead(counts, rankDigits(counts));
    }
  }
}
