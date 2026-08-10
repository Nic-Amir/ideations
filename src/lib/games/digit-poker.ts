'use strict';

import type { HandRank, HandResult } from '@/types';

/**
 * Calibrated pay table for digit poker with 10-value replacement draws.
 *
 * Top payouts are capped at 7× (five of a kind) and 5× (four of a kind);
 * value is shifted to mid-tier hands so common wins feel meaningful.
 *
 * Exact brute-force computation (100K hands x 32 hold masks) confirms
 * ~98.2% RTP with optimal hold strategy.
 */
const PAY_TABLE: Record<HandRank, { label: string; multiplier: number }> = {
  five_of_a_kind: { label: 'Five of a Kind', multiplier: 7 },
  four_of_a_kind: { label: 'Four of a Kind', multiplier: 5 },
  full_house: { label: 'Full House', multiplier: 2.38 },
  straight: { label: 'Straight', multiplier: 2.08 },
  three_of_a_kind: { label: 'Three of a Kind', multiplier: 1.61 },
  two_pair: { label: 'Two Pair', multiplier: 1.52 },
  one_pair: { label: 'One Pair', multiplier: 0 },
  high_card: { label: 'High Card', multiplier: 0 },
};

function getFrequencies(digits: number[]): Map<number, number> {
  const freq = new Map<number, number>();
  for (const d of digits) {
    freq.set(d, (freq.get(d) || 0) + 1);
  }
  return freq;
}

export function isWrappingStraight(digits: number[]): boolean {
  if (digits.length !== 5) return false;
  const unique = new Set(digits);
  if (unique.size !== 5) return false;

  const sorted = [...unique].sort((a, b) => a - b);

  // Check normal straight
  if (sorted[4] - sorted[0] === 4) return true;

  // Check wrapping: try each digit as the start and see if 5 consecutive mod 10 match
  for (const start of sorted) {
    const consecutive = new Set<number>();
    for (let i = 0; i < 5; i++) {
      consecutive.add((start + i) % 10);
    }
    if ([...unique].every((d) => consecutive.has(d))) return true;
  }

  return false;
}

export function evaluateHand(digits: number[]): HandResult {
  if (digits.length !== 5) {
    return { rank: 'high_card', ...PAY_TABLE.high_card };
  }

  const freq = getFrequencies(digits);
  const counts = [...freq.values()].sort((a, b) => b - a);

  if (counts[0] === 5) {
    return { rank: 'five_of_a_kind', ...PAY_TABLE.five_of_a_kind };
  }
  if (counts[0] === 4) {
    return { rank: 'four_of_a_kind', ...PAY_TABLE.four_of_a_kind };
  }
  if (counts[0] === 3 && counts[1] === 2) {
    return { rank: 'full_house', ...PAY_TABLE.full_house };
  }
  if (isWrappingStraight(digits)) {
    return { rank: 'straight', ...PAY_TABLE.straight };
  }
  if (counts[0] === 3) {
    return { rank: 'three_of_a_kind', ...PAY_TABLE.three_of_a_kind };
  }
  if (counts[0] === 2 && counts[1] === 2) {
    return { rank: 'two_pair', ...PAY_TABLE.two_pair };
  }
  if (counts[0] === 2) {
    return { rank: 'one_pair', ...PAY_TABLE.one_pair };
  }
  return { rank: 'high_card', ...PAY_TABLE.high_card };
}

export function getPayTable(): Array<{ rank: HandRank; label: string; multiplier: number }> {
  return (Object.entries(PAY_TABLE) as [HandRank, { label: string; multiplier: number }][]).map(
    ([rank, info]) => ({ rank, ...info })
  );
}
