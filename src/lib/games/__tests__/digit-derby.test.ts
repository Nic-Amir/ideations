import { describe, test, expect } from 'vitest';
import {
  DIGIT_COUNT,
  DIGIT_DERBY_CONFIG,
  DIGIT_SILKS,
  DIGIT_BET_MODES,
  emptyCounts,
  isValidDigit,
  applyTick,
  findWinner,
  rankDigits,
  winningLead,
  offeredOdds,
  offeredOddsFromProbability,
  eventProbability,
  pricePick,
  settleBet,
  settleWinner,
  settleRefund,
  progressTowardFinish,
  isFinalStretch,
  fallingFactorial,
  factorial,
  getDigitBetModeSpec,
  isPickComplete,
  simulateWinningLead,
  type DigitDerbyPick,
} from '../digit-derby';

describe('Digit Derby config', () => {
  test('defaults match the product plan', () => {
    expect(DIGIT_DERBY_CONFIG.finishCount).toBe(5);
    expect(DIGIT_DERBY_CONFIG.commission).toBe(0.02);
    expect(DIGIT_DERBY_CONFIG.maxTicks).toBe(120);
    expect(DIGIT_COUNT).toBe(10);
    expect(DIGIT_DERBY_CONFIG.marginPhotoP).toBe(0.612);
    expect(DIGIT_DERBY_CONFIG.marginWideP).toBe(0.388);
    expect(DIGIT_DERBY_CONFIG.marginBlowoutP).toBe(0.095);
  });

  test('DIGIT_SILKS covers every runner', () => {
    expect(DIGIT_SILKS).toHaveLength(DIGIT_COUNT);
    expect(new Set(DIGIT_SILKS).size).toBe(DIGIT_COUNT);
  });

  test('DIGIT_BET_MODES cover Outright through Margin', () => {
    expect(DIGIT_BET_MODES.map((m) => m.id)).toEqual([
      'outright',
      'top3',
      'pair',
      'trio',
      'top5',
      'spread',
      'margin',
    ]);
    expect(getDigitBetModeSpec('pair').picks).toBe(2);
    expect(getDigitBetModeSpec('outright').orderable).toBe(false);
    expect(getDigitBetModeSpec('trio').orderable).toBe(true);
    expect(getDigitBetModeSpec('spread').picks).toBe(2);
    expect(getDigitBetModeSpec('margin').picks).toBe(0);
  });

  test('outright offered odds use Digits commission formula 1/(P+c)', () => {
    expect(offeredOdds()).toBe(8.33);
  });
});

describe('Combinatorial pricing', () => {
  test('fallingFactorial and factorial', () => {
    expect(fallingFactorial(10, 2)).toBe(90);
    expect(fallingFactorial(10, 5)).toBe(10 * 9 * 8 * 7 * 6);
    expect(factorial(5)).toBe(120);
  });

  test('eventProbability for each market', () => {
    const outright: DigitDerbyPick = { mode: 'outright', ordered: false, digits: [3] };
    const top3: DigitDerbyPick = { mode: 'top3', ordered: false, digits: [3] };
    const pairExact: DigitDerbyPick = { mode: 'pair', ordered: true, digits: [1, 2] };
    const pairBasket: DigitDerbyPick = { mode: 'pair', ordered: false, digits: [1, 2] };
    const trioExact: DigitDerbyPick = { mode: 'trio', ordered: true, digits: [1, 2, 3] };
    const trioBasket: DigitDerbyPick = { mode: 'trio', ordered: false, digits: [1, 2, 3] };
    const top5Exact: DigitDerbyPick = {
      mode: 'top5',
      ordered: true,
      digits: [0, 1, 2, 3, 4],
    };
    const top5Basket: DigitDerbyPick = {
      mode: 'top5',
      ordered: false,
      digits: [0, 1, 2, 3, 4],
    };

    expect(eventProbability(outright)).toBeCloseTo(0.1, 10);
    expect(eventProbability(top3)).toBeCloseTo(0.3, 10);
    expect(eventProbability(pairExact)).toBeCloseTo(1 / 90, 10);
    expect(eventProbability(pairBasket)).toBeCloseTo(2 / 90, 10);
    expect(eventProbability(trioExact)).toBeCloseTo(1 / 720, 10);
    expect(eventProbability(trioBasket)).toBeCloseTo(6 / 720, 10);
    expect(eventProbability(top5Exact)).toBeCloseTo(1 / fallingFactorial(10, 5), 12);
    expect(eventProbability(top5Basket)).toBeCloseTo(
      factorial(5) / fallingFactorial(10, 5),
      12,
    );
  });

  test('pricePick applies commission', () => {
    const pricing = pricePick({ mode: 'outright', ordered: false, digits: [0] });
    expect(pricing.multiplier).toBe(8.33);

    const top3 = pricePick({ mode: 'top3', ordered: false, digits: [0] });
    // 1 / (0.3 + 0.02) = 3.125 → 3.13
    expect(top3.multiplier).toBe(3.13);

    const pairExact = pricePick({ mode: 'pair', ordered: true, digits: [0, 1] });
    expect(pairExact.multiplier).toBe(
      offeredOddsFromProbability(1 / 90),
    );
  });

  test('incomplete pick has zero probability', () => {
    expect(
      eventProbability({ mode: 'pair', ordered: false, digits: [1] }),
    ).toBe(0);
  });

  test('spread probability is 1/2', () => {
    const pick: DigitDerbyPick = {
      mode: 'spread',
      ordered: false,
      digits: [3, 7],
    };
    expect(isPickComplete(pick)).toBe(true);
    expect(eventProbability(pick)).toBe(0.5);
    expect(pricePick(pick).multiplier).toBe(
      offeredOddsFromProbability(0.5),
    );
  });

  test('margin probabilities use config MC constants', () => {
    const photo: DigitDerbyPick = {
      mode: 'margin',
      ordered: false,
      digits: [],
      marginThreshold: 1,
    };
    const wide: DigitDerbyPick = {
      mode: 'margin',
      ordered: false,
      digits: [],
      marginThreshold: 2,
    };
    const blowout: DigitDerbyPick = {
      mode: 'margin',
      ordered: false,
      digits: [],
      marginThreshold: 3,
    };
    expect(eventProbability(photo)).toBe(DIGIT_DERBY_CONFIG.marginPhotoP);
    expect(eventProbability(wide)).toBe(DIGIT_DERBY_CONFIG.marginWideP);
    expect(eventProbability(blowout)).toBe(DIGIT_DERBY_CONFIG.marginBlowoutP);
    expect(isPickComplete({ mode: 'margin', ordered: false, digits: [] })).toBe(
      false,
    );
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
    expect(ranked[0]).toBe(2);
    expect(ranked[1]).toBe(5);
    expect(ranked[2]).toBe(9);
  });
});

describe('Settlement', () => {
  const finish = [4, 7, 1, 0, 2, 3, 5, 6, 8, 9];

  test('outright win/lose', () => {
    const win = settleBet(
      { mode: 'outright', ordered: false, digits: [4] },
      finish,
      100,
      8.33,
    );
    expect(win.outcome).toBe('win');
    expect(win.payout).toBe(833);

    const lose = settleBet(
      { mode: 'outright', ordered: false, digits: [7] },
      finish,
      100,
      8.33,
    );
    expect(lose.outcome).toBe('lose');
    expect(lose.payout).toBe(0);
  });

  test('top3 includes second and third', () => {
    expect(
      settleBet({ mode: 'top3', ordered: false, digits: [7] }, finish, 100, 3.13)
        .outcome,
    ).toBe('win');
    expect(
      settleBet({ mode: 'top3', ordered: false, digits: [0] }, finish, 100, 3.13)
        .outcome,
    ).toBe('lose');
  });

  test('pair exact vs basket', () => {
    const exactWin = settleBet(
      { mode: 'pair', ordered: true, digits: [4, 7] },
      finish,
      50,
      10,
    );
    expect(exactWin.outcome).toBe('win');
    expect(exactWin.payout).toBe(500);

    const exactLose = settleBet(
      { mode: 'pair', ordered: true, digits: [7, 4] },
      finish,
      50,
      10,
    );
    expect(exactLose.outcome).toBe('lose');

    const basketWin = settleBet(
      { mode: 'pair', ordered: false, digits: [7, 4] },
      finish,
      50,
      10,
    );
    expect(basketWin.outcome).toBe('win');
  });

  test('trio basket', () => {
    expect(
      settleBet(
        { mode: 'trio', ordered: false, digits: [1, 4, 7] },
        finish,
        100,
        20,
      ).outcome,
    ).toBe('win');
    expect(
      settleBet(
        { mode: 'trio', ordered: false, digits: [1, 4, 0] },
        finish,
        100,
        20,
      ).outcome,
    ).toBe('lose');
  });

  test('settleWinner compatibility wrapper', () => {
    const s = settleWinner(4, 4, 100, 8.33);
    expect(s.outcome).toBe('win');
    expect(s.payout).toBe(833);
  });

  test('settleRefund returns stake at 1×', () => {
    const s = settleRefund(250);
    expect(s.outcome).toBe('refund');
    expect(s.payout).toBe(250);
    expect(s.multiplier).toBe(1);
  });

  test('spread: long ahead of short', () => {
    expect(
      settleBet(
        { mode: 'spread', ordered: false, digits: [4, 7] },
        finish,
        100,
        1.92,
      ).outcome,
    ).toBe('win');
    expect(
      settleBet(
        { mode: 'spread', ordered: false, digits: [7, 4] },
        finish,
        100,
        1.92,
      ).outcome,
    ).toBe('lose');
  });

  test('margin settle matrix by lead', () => {
    // finish[0]=4 at 5, finish[1]=7 at 4 → lead 1 (Photo)
    const photoCounts = emptyCounts();
    photoCounts[4] = 5;
    photoCounts[7] = 4;
    photoCounts[1] = 3;

    expect(
      settleBet(
        { mode: 'margin', ordered: false, digits: [], marginThreshold: 1 },
        finish,
        100,
        1.58,
        photoCounts,
      ).outcome,
    ).toBe('win');
    expect(
      settleBet(
        { mode: 'margin', ordered: false, digits: [], marginThreshold: 2 },
        finish,
        100,
        2.45,
        photoCounts,
      ).outcome,
    ).toBe('lose');

    const wideCounts = emptyCounts();
    wideCounts[4] = 5;
    wideCounts[7] = 3;
    expect(
      settleBet(
        { mode: 'margin', ordered: false, digits: [], marginThreshold: 2 },
        finish,
        100,
        2.45,
        wideCounts,
      ).outcome,
    ).toBe('win');
    expect(
      settleBet(
        { mode: 'margin', ordered: false, digits: [], marginThreshold: 3 },
        finish,
        100,
        8.7,
        wideCounts,
      ).outcome,
    ).toBe('lose');
    expect(
      settleBet(
        { mode: 'margin', ordered: false, digits: [], marginThreshold: 1 },
        finish,
        100,
        1.58,
        wideCounts,
      ).outcome,
    ).toBe('lose');

    const blowoutCounts = emptyCounts();
    blowoutCounts[4] = 5;
    blowoutCounts[7] = 2;
    expect(
      settleBet(
        { mode: 'margin', ordered: false, digits: [], marginThreshold: 3 },
        finish,
        100,
        8.7,
        blowoutCounts,
      ).outcome,
    ).toBe('win');
    expect(
      settleBet(
        { mode: 'margin', ordered: false, digits: [], marginThreshold: 2 },
        finish,
        100,
        2.45,
        blowoutCounts,
      ).outcome,
    ).toBe('win');
  });
});

describe('Winning lead', () => {
  test('winningLead is first minus second', () => {
    const counts = emptyCounts();
    counts[4] = 5;
    counts[7] = 3;
    expect(winningLead(counts, [4, 7, 1])).toBe(2);
  });

  test('MC smoke: margin probs in (0,1) and Photo+Wide ≈ 1', () => {
    const { marginPhotoP, marginWideP, marginBlowoutP } = DIGIT_DERBY_CONFIG;
    expect(marginPhotoP).toBeGreaterThan(0);
    expect(marginPhotoP).toBeLessThan(1);
    expect(marginWideP).toBeGreaterThan(0);
    expect(marginWideP).toBeLessThan(1);
    expect(marginBlowoutP).toBeGreaterThan(0);
    expect(marginBlowoutP).toBeLessThan(marginWideP);
    expect(marginPhotoP + marginWideP).toBeCloseTo(1, 2);

    // Light MC: Photo and Wide partition all outcomes
    let photo = 0;
    let wide = 0;
    const n = 800;
    for (let i = 0; i < n; i++) {
      const lead = simulateWinningLead(DIGIT_DERBY_CONFIG.finishCount);
      if (lead === 1) photo += 1;
      else wide += 1;
      expect(lead).toBeGreaterThanOrEqual(1);
    }
    expect(photo + wide).toBe(n);
    expect(photo / n).toBeGreaterThan(0.4);
    expect(wide / n).toBeGreaterThan(0.2);
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
    counts[0] = 4;
    expect(isFinalStretch(counts, 5)).toBe(true);
  });
});
