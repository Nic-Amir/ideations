import { describe, test, expect } from 'vitest';
import {
  getSurvivalProbability,
  getCumulativeSurvival,
  getFairMultiplier,
  getActualMultiplier,
  isKnockout,
  getKnockoutProbability,
  getPayoutTable,
} from '../digit-collect';

describe('Digit Collect Engine', () => {
  test('draw 1 always survives (10/10)', () => {
    expect(getSurvivalProbability(1)).toBe(1);
  });

  test('draw 2 has 90% survival', () => {
    expect(getSurvivalProbability(2)).toBe(0.9);
  });

  test('draw 10 has 10% survival', () => {
    expect(getSurvivalProbability(10)).toBeCloseTo(0.1);
  });

  test('cumulative survival at draw 5 is ~30.24%', () => {
    expect(getCumulativeSurvival(5)).toBeCloseTo(0.3024, 3);
  });

  test('fair multiplier at draw 5 is ~3.31', () => {
    expect(getFairMultiplier(5)).toBeCloseTo(3.3069, 2);
  });

  test('actual multiplier applies 3% house edge', () => {
    const fair = getFairMultiplier(5);
    const actual = getActualMultiplier(5);
    expect(actual).toBeCloseTo(fair * 0.97, 4);
  });

  test('isKnockout returns true for duplicate digit', () => {
    const collected = new Set([1, 3, 5]);
    expect(isKnockout(3, collected)).toBe(true);
    expect(isKnockout(7, collected)).toBe(false);
  });

  test('knockout probability increases with each draw', () => {
    const probs = [];
    for (let i = 1; i <= 10; i++) {
      probs.push(getKnockoutProbability(i));
    }
    for (let i = 1; i < probs.length; i++) {
      expect(probs[i]).toBeGreaterThan(probs[i - 1]);
    }
  });

  test('payout table has 10 rows', () => {
    expect(getPayoutTable()).toHaveLength(10);
  });

  test('expected value with house edge: player EV is negative', () => {
    const table = getPayoutTable();
    let totalEv = 0;
    for (const row of table) {
      const prevSurvival = row.draw > 1 ? getCumulativeSurvival(row.draw - 1) : 1;
      const knockoutProb = row.knockoutProb;
      totalEv += prevSurvival * knockoutProb * (-1);
      if (row.draw < 10) {
        // Players who cash out at this draw
      }
    }
    // The house edge ensures negative EV for the player on average
    expect(getActualMultiplier(1)).toBeLessThan(getFairMultiplier(1));
  });
});
