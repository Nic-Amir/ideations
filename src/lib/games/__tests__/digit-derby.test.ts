import { describe, test, expect } from 'vitest';
import {
  DIGIT_COUNT,
  DIGIT_DERBY_CONFIG,
  emptyCounts,
  isValidDigit,
  applyTick,
  findWinner,
  rankDigits,
  offeredOdds,
  settleWinner,
  settleRefund,
  progressTowardFinish,
  isFinalStretch,
} from '../digit-derby';

describe('Digit Derby config', () => {
  test('defaults match the product plan', () => {
    expect(DIGIT_DERBY_CONFIG.finishCount).toBe(5);
    expect(DIGIT_DERBY_CONFIG.commission).toBe(0.02);
    expect(DIGIT_DERBY_CONFIG.maxTicks).toBe(120);
    expect(DIGIT_DERBY_CONFIG.winProbability).toBe(0.1);
    expect(DIGIT_COUNT).toBe(10);
  });

  test('offered odds use Digits commission formula 1/(P+c)', () => {
    // 1 / (0.1 + 0.02) = 8.333… → 8.33
    expect(offeredOdds()).toBe(8.33);
  });
});

describe('Digit validation and counts', () => {
  test('emptyCounts is ten zeros', () => {
    expect(emptyCounts()).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  test('isValidDigit accepts 0–9 only', () => {
    expect(isValidDigit(0)).toBe(true);
    expect(isValidDigit(9)).toBe(true);
    expect(isValidDigit(-1)).toBe(false);
    expect(isValidDigit(10)).toBe(false);
    expect(isValidDigit(1.5)).toBe(false);
  });

  test('applyTick increments the streamed digit immutably', () => {
    const base = emptyCounts();
    const next = applyTick(base, 7);
    expect(base[7]).toBe(0);
    expect(next[7]).toBe(1);
    expect(next).not.toBe(base);
  });

  test('applyTick ignores invalid digits', () => {
    const base = emptyCounts();
    expect(applyTick(base, 99)).toBe(base);
  });
});

describe('First-to-K winner', () => {
  test('findWinner returns null until finishCount is reached', () => {
    let counts = emptyCounts();
    for (let i = 0; i < 4; i++) counts = applyTick(counts, 3);
    expect(findWinner(counts)).toBeNull();
    counts = applyTick(counts, 3);
    expect(findWinner(counts)).toBe(3);
  });

  test('exactly one digit can win on a given tick', () => {
    let counts = emptyCounts();
    // Build digit 1 to 4 and digit 2 to 4, then digit 1 hits 5
    for (let i = 0; i < 4; i++) {
      counts = applyTick(counts, 1);
      counts = applyTick(counts, 2);
    }
    expect(findWinner(counts)).toBeNull();
    counts = applyTick(counts, 1);
    expect(findWinner(counts)).toBe(1);
  });
});

describe('Ranking', () => {
  test('rankDigits sorts by count desc with digit-index tie-break', () => {
    const counts = emptyCounts();
    counts[5] = 3;
    counts[2] = 3;
    counts[9] = 1;
    const ranked = rankDigits(counts);
    expect(ranked[0]).toBe(2); // same count as 5, lower index wins tie
    expect(ranked[1]).toBe(5);
    expect(ranked[2]).toBe(9);
  });
});

describe('Settlement', () => {
  test('settleWinner pays stake × multiplier on correct pick', () => {
    const s = settleWinner(4, 4, 100, 8.33);
    expect(s.outcome).toBe('win');
    expect(s.payout).toBe(833);
    expect(s.multiplier).toBe(8.33);
  });

  test('settleWinner pays nothing on wrong pick', () => {
    const s = settleWinner(4, 7, 100, 8.33);
    expect(s.outcome).toBe('lose');
    expect(s.payout).toBe(0);
    expect(s.multiplier).toBe(0);
  });

  test('settleRefund returns stake at 1×', () => {
    const s = settleRefund(250);
    expect(s.outcome).toBe('refund');
    expect(s.payout).toBe(250);
    expect(s.multiplier).toBe(1);
  });
});

describe('Progress helpers', () => {
  test('progressTowardFinish caps at 1', () => {
    expect(progressTowardFinish(0, 5)).toBe(0);
    expect(progressTowardFinish(2, 5)).toBe(0.4);
    expect(progressTowardFinish(5, 5)).toBe(1);
    expect(progressTowardFinish(8, 5)).toBe(1);
  });

  test('isFinalStretch when any digit is at 80% of K', () => {
    const counts = emptyCounts();
    expect(isFinalStretch(counts, 5)).toBe(false);
    counts[0] = 4; // 4/5 = 0.8
    expect(isFinalStretch(counts, 5)).toBe(true);
  });
});
