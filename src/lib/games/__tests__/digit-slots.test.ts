import { describe, test, expect } from 'vitest';
import { evaluateSpin, isSequential, resolveGamble, getSlotPayTable } from '../digit-slots';

describe('Digit Slots Engine', () => {
  test('777 is jackpot', () => {
    const result = evaluateSpin(7, 7, 7);
    expect(result.outcome).toBe('triple_seven');
    expect(result.multiplier).toBe(100);
  });

  test('other triples detected', () => {
    expect(evaluateSpin(3, 3, 3).outcome).toBe('triple');
    expect(evaluateSpin(0, 0, 0).outcome).toBe('triple');
    expect(evaluateSpin(9, 9, 9).outcome).toBe('triple');
  });

  test('pairs detected', () => {
    expect(evaluateSpin(3, 3, 5).outcome).toBe('pair');
    expect(evaluateSpin(3, 5, 3).outcome).toBe('pair');
    expect(evaluateSpin(5, 3, 3).outcome).toBe('pair');
  });

  test('sequential ascending detected', () => {
    expect(evaluateSpin(1, 2, 3).outcome).toBe('sequential');
    expect(evaluateSpin(7, 8, 9).outcome).toBe('sequential');
  });

  test('sequential in any order detected', () => {
    expect(evaluateSpin(3, 1, 2).outcome).toBe('sequential');
    expect(evaluateSpin(9, 7, 8).outcome).toBe('sequential');
  });

  test('sequential wrapping', () => {
    expect(isSequential(8, 9, 0)).toBe(true);
    expect(isSequential(9, 0, 1)).toBe(true);
    expect(isSequential(0, 9, 8)).toBe(true);
    expect(isSequential(1, 0, 9)).toBe(true);
  });

  test('no match', () => {
    expect(evaluateSpin(1, 3, 5).outcome).toBe('none');
    expect(evaluateSpin(1, 3, 5).multiplier).toBe(0);
  });

  test('gamble: 0-4 loses, 5-9 wins', () => {
    expect(resolveGamble(0)).toBe(false);
    expect(resolveGamble(4)).toBe(false);
    expect(resolveGamble(5)).toBe(true);
    expect(resolveGamble(9)).toBe(true);
  });

  test('pay table has 5 rows', () => {
    expect(getSlotPayTable()).toHaveLength(5);
  });

  test('brute-force outcome counts match expected probabilities', () => {
    const counts: Record<string, number> = {
      triple_seven: 0,
      triple: 0,
      sequential: 0,
      pair: 0,
      none: 0,
    };

    for (let d1 = 0; d1 < 10; d1++) {
      for (let d2 = 0; d2 < 10; d2++) {
        for (let d3 = 0; d3 < 10; d3++) {
          counts[evaluateSpin(d1, d2, d3).outcome]++;
        }
      }
    }

    expect(counts.triple_seven).toBe(1);
    expect(counts.triple).toBe(9);
    expect(counts.sequential).toBe(60);
    expect(counts.pair).toBe(270);
    expect(counts.none).toBe(660);
  });

  test('brute-force RTP is approximately 95.5%', () => {
    let totalPayout = 0;
    const totalOutcomes = 1000;

    for (let d1 = 0; d1 < 10; d1++) {
      for (let d2 = 0; d2 < 10; d2++) {
        for (let d3 = 0; d3 < 10; d3++) {
          totalPayout += evaluateSpin(d1, d2, d3).multiplier;
        }
      }
    }

    const rtp = totalPayout / totalOutcomes;
    expect(rtp).toBeGreaterThan(0.94);
    expect(rtp).toBeLessThan(0.97);
  });
});
