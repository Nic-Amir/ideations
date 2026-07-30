'use strict';

import type {
  GridSpinResult,
  LineResult,
  PaylineId,
  SlotOutcome,
  SlotResult,
} from '@/types';

export const GRID_SIZE = 3;
export const CELL_COUNT = GRID_SIZE * GRID_SIZE;
export const PAYLINE_COUNT = 8;

/**
 * Per-line pay table targeting ~95.5% RTP on a single 3-digit line.
 *
 * Exact probabilities (3 independent uniform digits 0-9, 1000 total outcomes):
 *  - Triple 7:      0.1%   (1/1000)
 *  - Other triple:  0.9%   (9/1000)
 *  - Sequential:    6.0%   (60/1000) — 10 consecutive-mod-10 sets × 3! orderings
 *  - Pair:         27.0%   (270/1000) — C(10,1)×C(3,2)×9
 *  - None:         66.0%   (660/1000) — all different, non-sequential
 *
 * Single-line RTP = 0.001×100 + 0.009×15 + 0.060×3 + 0.270×2 + 0.660×0 = 0.955
 *
 * On a 3×3 grid with 8 paylines and line stake = stake/8, linearity of
 * expectation keeps full-grid RTP at the same ~95.5% (shared cells correlate
 * variance, not mean EV).
 */
const PAY_TABLE: Record<SlotOutcome, { label: string; multiplier: number }> = {
  triple_seven: { label: 'JACKPOT 777', multiplier: 100 },
  triple: { label: 'Triple', multiplier: 15 },
  sequential: { label: 'Sequential', multiplier: 3 },
  pair: { label: 'Pair', multiplier: 2 },
  none: { label: 'No Match', multiplier: 0 },
};

const PAYLINES: ReadonlyArray<{ id: PaylineId; name: string; indices: [number, number, number] }> = [
  { id: 'row0', name: 'Row 1', indices: [0, 1, 2] },
  { id: 'row1', name: 'Row 2', indices: [3, 4, 5] },
  { id: 'row2', name: 'Row 3', indices: [6, 7, 8] },
  { id: 'col0', name: 'Col 1', indices: [0, 3, 6] },
  { id: 'col1', name: 'Col 2', indices: [1, 4, 7] },
  { id: 'col2', name: 'Col 3', indices: [2, 5, 8] },
  { id: 'diagMain', name: 'Diag ↘', indices: [0, 4, 8] },
  { id: 'diagAnti', name: 'Diag ↙', indices: [2, 4, 6] },
];

export function getPaylines(): ReadonlyArray<{
  id: PaylineId;
  name: string;
  indices: [number, number, number];
}> {
  return PAYLINES;
}

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

export function evaluateGrid(digits: number[], stake: number): GridSpinResult {
  if (digits.length !== CELL_COUNT) {
    throw new Error(`evaluateGrid expects ${CELL_COUNT} digits, got ${digits.length}`);
  }
  if (!(stake > 0) || !Number.isFinite(stake)) {
    throw new Error('evaluateGrid requires a positive finite stake');
  }

  const lineStake = stake / PAYLINE_COUNT;
  const grid = digits as GridSpinResult['grid'];
  const lines: LineResult[] = PAYLINES.map((payline) => {
    const [i0, i1, i2] = payline.indices;
    const spin = evaluateSpin(digits[i0], digits[i1], digits[i2]);
    const payout = lineStake * spin.multiplier;
    return {
      paylineId: payline.id,
      paylineName: payline.name,
      indices: payline.indices,
      digits: spin.digits,
      outcome: spin.outcome,
      outcomeLabel: spin.label,
      multiplier: spin.multiplier,
      payout,
    };
  });

  const totalPayout = lines.reduce((sum, line) => sum + line.payout, 0);
  const totalMultiplier = totalPayout / stake;

  return { grid, lines, totalPayout, totalMultiplier };
}

export function getHittingLines(result: GridSpinResult): LineResult[] {
  return result.lines.filter((line) => line.multiplier > 0);
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

/** Assign a symbol to a row; if another row already has it, swap. */
export function assignRowSymbol<T extends string>(
  current: [T, T, T],
  row: number,
  symbol: T,
): [T, T, T] {
  if (row < 0 || row >= GRID_SIZE) return current;
  const next: [T, T, T] = [...current];
  const existingRow = next.findIndex((s, i) => i !== row && s === symbol);
  if (existingRow >= 0) {
    next[existingRow] = next[row];
  }
  next[row] = symbol;
  return next;
}
