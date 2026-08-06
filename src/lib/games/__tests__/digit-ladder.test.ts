'use strict';

import { describe, expect, test } from 'vitest';
import {
  applyStepMult,
  baseProb,
  cashOut,
  continueRound,
  isSideOffered,
  openRound,
  priceSide,
  settleStep,
  stepWins,
  usdtToCents,
  winningSet,
} from '@/lib/games/digit-ladder';

describe('baseProb / offers', () => {
  test('higher and lower probs for D=0..9', () => {
    for (let d = 0; d <= 9; d++) {
      expect(baseProb('higher', d)).toBeCloseTo((9 - d) / 10, 10);
      expect(baseProb('lower', d)).toBeCloseTo(d / 10, 10);
      expect(baseProb('higher', d) + baseProb('lower', d)).toBeCloseTo(0.9, 10);
    }
  });

  test('disables zero-prob sides at 0 and 9', () => {
    expect(isSideOffered('lower', 0)).toBe(false);
    expect(isSideOffered('higher', 0)).toBe(true);
    expect(isSideOffered('higher', 9)).toBe(false);
    expect(isSideOffered('lower', 9)).toBe(true);
  });

  test('winning sets', () => {
    expect(winningSet('higher', 5)).toEqual([6, 7, 8, 9]);
    expect(winningSet('lower', 5)).toEqual([0, 1, 2, 3, 4]);
    expect(winningSet('higher', 9)).toEqual([]);
    expect(winningSet('lower', 0)).toEqual([]);
  });
});

describe('priceSide', () => {
  test('D=5 Higher → 2.38x, Lower → 1.92x', () => {
    const hi = priceSide('higher', 5);
    expect(hi.offered).toBe(true);
    expect(hi.baseProb).toBeCloseTo(0.4, 10);
    expect(hi.impliedProb).toBeCloseTo(0.42, 10);
    expect(hi.multiplier).toBe(2.38);

    const lo = priceSide('lower', 5);
    expect(lo.baseProb).toBeCloseTo(0.5, 10);
    expect(lo.impliedProb).toBeCloseTo(0.52, 10);
    expect(lo.multiplier).toBe(1.92);
  });

  test('D=0 Higher → 1.09x; Lower not offered', () => {
    const hi = priceSide('higher', 0);
    expect(hi.multiplier).toBe(1.09);
    expect(priceSide('lower', 0).offered).toBe(false);
  });

  test('D=9 Lower → 1.09x; Higher not offered', () => {
    const lo = priceSide('lower', 9);
    expect(lo.multiplier).toBe(1.09);
    expect(priceSide('higher', 9).offered).toBe(false);
  });
});

describe('stepWins', () => {
  test('strict compare; ties lose', () => {
    expect(stepWins('higher', 5, 7)).toBe(true);
    expect(stepWins('higher', 5, 5)).toBe(false);
    expect(stepWins('higher', 5, 3)).toBe(false);
    expect(stepWins('lower', 5, 3)).toBe(true);
    expect(stepWins('lower', 5, 5)).toBe(false);
    expect(stepWins('lower', 5, 7)).toBe(false);
  });

  test('settle matrix for entry 5', () => {
    for (let d = 0; d <= 9; d++) {
      expect(stepWins('higher', 5, d)).toBe(d > 5);
      expect(stepWins('lower', 5, d)).toBe(d < 5);
    }
  });
});

describe('parlay round', () => {
  test('mult chain 100 × 1.92 × 2.38 = 456', () => {
    expect(applyStepMult(100, 1.92)).toBe(192);
    expect(applyStepMult(192, 2.38)).toBe(456);
  });

  test('open → win → continue → win → cash out', () => {
    let round = openRound({ stakeCents: 100, pick: 'lower', entryDigit: 5 });
    expect(round.status).toBe('OPEN');
    expect(round.phase).toBe('awaiting_tick');
    expect(round.steps[0].multiplier).toBe(1.92);

    round = settleStep(round, 1);
    expect(round.phase).toBe('decision');
    expect(round.pot_cents).toBe(192);
    expect(round.face_digit).toBe(1);

    round = continueRound(round, 'higher', 1);
    expect(round.phase).toBe('awaiting_tick');
    expect(round.steps).toHaveLength(2);
    expect(round.steps[1].multiplier).toBe(priceSide('higher', 1).multiplier);
    expect(round.pot_cents).toBe(192);

    round = settleStep(round, 8);
    expect(round.phase).toBe('decision');
    expect(round.pot_cents).toBe(
      applyStepMult(192, priceSide('higher', 1).multiplier),
    );

    const cashed = cashOut(round);
    expect(cashed.status).toBe('WON');
    expect(cashed.settlement_data?.cash_out).toBe(true);
    expect(cashed.settlement_data?.final_pot_cents).toBe(cashed.pot_cents);
  });

  test('bust after continue credits nothing; pot 0', () => {
    let round = openRound({
      stakeCents: usdtToCents(10),
      pick: 'higher',
      entryDigit: 5,
    });
    round = settleStep(round, 8);
    expect(round.phase).toBe('decision');
    const potAfterWin = round.pot_cents;
    expect(potAfterWin).toBeGreaterThan(0);

    round = continueRound(round, 'higher', 8);
    round = settleStep(round, 8); // tie → bust
    expect(round.status).toBe('LOST');
    expect(round.pot_cents).toBe(0);
    expect(round.settlement_data?.cash_out).toBe(false);
    expect(round.settlement_data?.outcome).toBe('LOST');
  });

  test('continue does not change pot until settle', () => {
    let round = openRound({
      stakeCents: 100,
      pick: 'lower',
      entryDigit: 5,
    });
    round = settleStep(round, 2);
    const pot = round.pot_cents;
    round = continueRound(round, 'lower', 2);
    expect(round.pot_cents).toBe(pot);
  });

  test('rejects unoffered side at open', () => {
    expect(() =>
      openRound({ stakeCents: 100, pick: 'lower', entryDigit: 0 }),
    ).toThrow(/not offered/);
  });

  test('locked pricing frozen on first step', () => {
    const round = openRound({
      stakeCents: 100,
      pick: 'higher',
      entryDigit: 5,
    });
    expect(round.locked_pricing.pricing_model).toBe('digit_ladder_vs_current_v1');
    expect(round.locked_pricing.steps[0]).toEqual({
      entry_digit: 5,
      pick: 'higher',
      base_prob: 0.4,
      implied_prob: 0.42,
      multiplier: 2.38,
    });
  });
});
