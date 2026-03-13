'use strict';

import type { SlotOutcome, SlotResult } from '@/types';

/**
 * Calibrated pay table targeting ~95.5% RTP.
 *
 * Exact probabilities (3 independent uniform digits 0-9, 1000 total outcomes):
 *  - Triple 7:      0.1%   (1/1000)
 *  - Other triple:  0.9%   (9/1000)
 *  - Sequential:    6.0%   (60/1000) — 10 consecutive-mod-10 sets × 3! orderings
 *  - Pair:         27.0%   (270/1000) — C(10,1)×C(3,2)×9
 *  - None:         66.0%   (660/1000) — all different, non-sequential
 *
 * RTP = 0.001×100 + 0.009×15 + 0.060×3 + 0.270×2 + 0.660×0
 *     = 0.100 + 0.135 + 0.180 + 0.540 + 0
 *     = 0.955 ≈ 95.5%
 */
const PAY_TABLE: Record<SlotOutcome, { label: string; multiplier: number }> = {
  triple_seven: { label: 'JACKPOT 777', multiplier: 100 },
  triple: { label: 'Triple', multiplier: 15 },
  sequential: { label: 'Sequential', multiplier: 3 },
  pair: { label: 'Pair', multiplier: 2 },
  none: { label: 'No Match', multiplier: 0 },
};

export function isSequential(d1: number, d2: number, d3: number): boolean {
  const sorted = [d1, d2, d3].sort((a, b) => a - b);
  if (sorted[1] - sorted[0] === 1 && sorted[2] - sorted[1] === 1) return true;
  // Wrap: e.g. 8,9,0
  if (sorted[0] === 0 && sorted[1] === 8 && sorted[2] === 9) return true;
  if (sorted[0] === 0 && sorted[1] === 1 && sorted[2] === 9) return true;
  return false;
}

export function evaluateSpin(d1: number, d2: number, d3: number): SlotResult {
  const digits: [number, number, number] = [d1, d2, d3];

  if (d1 === 7 && d2 === 7 && d3 === 7) {
    return { outcome: 'triple_seven', digits, ...PAY_TABLE.triple_seven };
  }
  if (d1 === d2 && d2 === d3) {
    return { outcome: 'triple', digits, ...PAY_TABLE.triple };
  }
  if (isSequential(d1, d2, d3)) {
    return { outcome: 'sequential', digits, ...PAY_TABLE.sequential };
  }
  if (d1 === d2 || d2 === d3 || d1 === d3) {
    return { outcome: 'pair', digits, ...PAY_TABLE.pair };
  }
  return { outcome: 'none', digits, ...PAY_TABLE.none };
}

export function getSlotPayTable(): Array<{
  outcome: SlotOutcome;
  label: string;
  multiplier: number;
  probability: string;
}> {
  return [
    { outcome: 'triple_seven', ...PAY_TABLE.triple_seven, probability: '0.10%' },
    { outcome: 'triple', ...PAY_TABLE.triple, probability: '0.90%' },
    { outcome: 'sequential', ...PAY_TABLE.sequential, probability: '6.00%' },
    { outcome: 'pair', ...PAY_TABLE.pair, probability: '27.00%' },
    { outcome: 'none', ...PAY_TABLE.none, probability: '66.00%' },
  ];
}

export function resolveGamble(digit: number): boolean {
  return digit >= 5;
}
