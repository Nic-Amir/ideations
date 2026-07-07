import { describe, test, expect } from 'vitest';
import {
  HORSE_COUNT,
  HORSE_NAMES,
  HORSE_SILKS,
  BET_MODES,
  DERBY_CONFIG,
  getBetModeSpec,
  normCdf,
  createRaceCard,
  orderedProbability,
  unorderedProbability,
  permutations,
  fairOdds,
  pricePick,
  generateRacePath,
  settleBet,
  monteCarloDerby,
  type RaceCard,
} from '../derby';

/** Fixed heterogeneous card so results are reproducible across runs. */
function fixtureCard(): RaceCard {
  const params = Array.from({ length: HORSE_COUNT }, (_, i) => ({
    drift: -0.0012 + (0.0024 * i) / (HORSE_COUNT - 1),
    vol: 0.012 * (0.7 + (0.75 * ((i * 7) % HORSE_COUNT)) / (HORSE_COUNT - 1)),
  }));
  return createRaceCard(DERBY_CONFIG, params);
}

const card = fixtureCard();

describe('Synthetic Derby engine', () => {
  test('config and static data match the concept', () => {
    expect(DERBY_CONFIG.s0).toBe(100);
    expect(DERBY_CONFIG.ticks).toBe(24);
    expect(DERBY_CONFIG.commission).toBe(0); // POC: fair odds
    expect(HORSE_NAMES).toHaveLength(HORSE_COUNT);
    expect(new Set(HORSE_SILKS).size).toBe(HORSE_COUNT);
    expect(BET_MODES.map((m) => m.id)).toEqual([
      'winner',
      'place',
      'couple',
      'trio',
      'quinte',
    ]);
    expect(getBetModeSpec('quinte').picks).toBe(5);
    expect(getBetModeSpec('winner').orderable).toBe(false);
  });

  test('normCdf matches known values', () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 7);
    expect(normCdf(1.96)).toBeCloseTo(0.975, 4);
    expect(normCdf(-1.96)).toBeCloseTo(0.025, 4);
  });

  test('random card produces a heterogeneous field within calibrated ranges', () => {
    const random = createRaceCard();
    expect(random.horses).toHaveLength(HORSE_COUNT);
    for (const h of random.horses) {
      expect(h.drift).toBeGreaterThanOrEqual(DERBY_CONFIG.driftRange[0]);
      expect(h.drift).toBeLessThanOrEqual(DERBY_CONFIG.driftRange[1]);
      expect(h.vol / DERBY_CONFIG.baseVolPerTick).toBeGreaterThanOrEqual(
        DERBY_CONFIG.volMultRange[0],
      );
      expect(h.vol / DERBY_CONFIG.baseVolPerTick).toBeLessThanOrEqual(
        DERBY_CONFIG.volMultRange[1],
      );
    }
    const probs = random.winProbs;
    expect(Math.max(...probs) / Math.min(...probs)).toBeGreaterThan(1.5);
  });
});

describe('Exact probabilities', () => {
  // Quadrature tolerance: midpoint rule on 2000 cells carries ~1e-5 bias,
  // orders of magnitude below the 2dp odds rounding.
  test('win probabilities sum to 1', () => {
    const total = card.winProbs.reduce((a, b) => a + b, 0);
    expect(Math.abs(total - 1)).toBeLessThan(1e-4);
  });

  test('place probabilities sum to 3 and dominate win probabilities', () => {
    const total = card.placeProbs.reduce((a, b) => a + b, 0);
    expect(Math.abs(total - 3)).toBeLessThan(3e-4);
    for (let i = 0; i < HORSE_COUNT; i++) {
      expect(card.placeProbs[i]).toBeGreaterThan(card.winProbs[i]);
    }
  });

  test('ordered couples over all pairs sum to 1', () => {
    let total = 0;
    for (let i = 0; i < HORSE_COUNT; i++) {
      for (let j = 0; j < HORSE_COUNT; j++) {
        if (i === j) continue;
        total += orderedProbability(card.horses, [i, j]);
      }
    }
    expect(Math.abs(total - 1)).toBeLessThan(3e-4);
  }, 30_000);

  test('unordered equals the sum over its orderings', () => {
    const picks = [0, 7, 15];
    const summed = permutations(picks)
      .map((perm) => orderedProbability(card.horses, perm))
      .reduce((a, b) => a + b, 0);
    expect(unorderedProbability(card.horses, picks)).toBeCloseTo(summed, 12);
  });

  test('higher drift prices stronger, all else equal', () => {
    const params = Array.from({ length: HORSE_COUNT }, () => ({
      drift: 0,
      vol: 0.012,
    }));
    params[3] = { drift: 0.001, vol: 0.012 };
    const tilted = createRaceCard(DERBY_CONFIG, params);
    for (let i = 0; i < HORSE_COUNT; i++) {
      if (i === 3) continue;
      expect(tilted.winProbs[3]).toBeGreaterThan(tilted.winProbs[i]);
    }
  });

  test('an identical field is symmetric: every horse wins 1/16', () => {
    const params = Array.from({ length: HORSE_COUNT }, () => ({
      drift: 0.0002,
      vol: 0.012,
    }));
    const flat = createRaceCard(DERBY_CONFIG, params);
    for (const p of flat.winProbs) {
      expect(p).toBeCloseTo(1 / HORSE_COUNT, 5);
    }
    const quinte = orderedProbability(flat.horses, [0, 1, 2, 3, 4]);
    // Ordered quinté in a symmetric field = 1/(16·15·14·13·12).
    expect(quinte).toBeCloseTo(1 / (16 * 15 * 14 * 13 * 12), 8);
  });

  test('permutations helper generates all m! orderings', () => {
    expect(permutations([1, 2])).toHaveLength(2);
    expect(permutations([1, 2, 3])).toHaveLength(6);
    expect(permutations([1, 2, 3, 4, 5])).toHaveLength(120);
  });
});

describe('Fair odds & pricing', () => {
  test('p × mult ≈ 1 for every bet type (fair odds POC)', () => {
    const picks = [
      { mode: 'winner' as const, ordered: false, horses: [2] },
      { mode: 'place' as const, ordered: false, horses: [9] },
      { mode: 'couple' as const, ordered: true, horses: [1, 5] },
      { mode: 'couple' as const, ordered: false, horses: [1, 5] },
      { mode: 'trio' as const, ordered: true, horses: [0, 8, 12] },
      { mode: 'trio' as const, ordered: false, horses: [0, 8, 12] },
      { mode: 'quinte' as const, ordered: false, horses: [2, 4, 6, 10, 14] },
    ];
    for (const pick of picks) {
      const { probability, multiplier } = pricePick(card, pick);
      expect(probability).toBeGreaterThan(0);
      // Rounding to 2dp is the only deviation from exactly fair.
      expect(probability * multiplier).toBeGreaterThan(0.99);
      expect(probability * multiplier).toBeLessThan(1.02);
    }
  });

  test('ordered exotics pay more than unordered on the same horses', () => {
    const horses = [3, 11];
    const ordered = pricePick(card, { mode: 'couple', ordered: true, horses });
    const unordered = pricePick(card, { mode: 'couple', ordered: false, horses });
    expect(ordered.probability).toBeLessThan(unordered.probability);
    expect(ordered.multiplier).toBeGreaterThan(unordered.multiplier);
  });

  test('ordered quinté on longshots prices as a very large multiplier', () => {
    const byProb = card.winProbs
      .map((p, i) => ({ p, i }))
      .sort((a, b) => a.p - b.p)
      .map((x) => x.i);
    const longshots = byProb.slice(0, 5);
    const { probability, multiplier } = pricePick(card, {
      mode: 'quinte',
      ordered: true,
      horses: longshots,
    });
    expect(probability).toBeGreaterThan(0);
    expect(multiplier).toBeGreaterThan(10_000);
  });

  test('fairOdds floors at 1.01 and rounds to 2dp', () => {
    expect(fairOdds(0.999)).toBe(1.01);
    expect(fairOdds(0.25)).toBe(4);
    expect(fairOdds(0)).toBe(0);
  });
});

describe('Race path & settlement', () => {
  test('generateRacePath produces a coherent race', () => {
    const path = generateRacePath(card);
    expect(path.prices).toHaveLength(HORSE_COUNT);
    for (const series of path.prices) {
      expect(series).toHaveLength(card.ticks + 1);
      expect(series[0]).toBe(DERBY_CONFIG.s0);
      expect(series.every((p) => p > 0)).toBe(true);
    }
    expect(path.ranks).toHaveLength(card.ticks + 1);
    for (const r of path.ranks) {
      expect(new Set(r).size).toBe(HORSE_COUNT);
    }
    expect(path.finishOrder).toEqual(path.ranks[card.ticks]);
    // Finish order really is the terminal price ranking.
    for (let pos = 1; pos < HORSE_COUNT; pos++) {
      const better = path.prices[path.finishOrder[pos - 1]][card.ticks];
      const worse = path.prices[path.finishOrder[pos]][card.ticks];
      expect(better).toBeGreaterThanOrEqual(worse);
    }
  });

  test('settlement across all bet types on a handcrafted finish', () => {
    const finish = [4, 9, 2, 13, 7, 0, 1, 3, 5, 6, 8, 10, 11, 12, 14, 15];

    expect(settleBet({ mode: 'winner', ordered: false, horses: [4] }, finish, 100, 8).payout).toBe(800);
    expect(settleBet({ mode: 'winner', ordered: false, horses: [9] }, finish, 100, 8).outcome).toBe('lose');

    expect(settleBet({ mode: 'place', ordered: false, horses: [2] }, finish, 100, 3).payout).toBe(300);
    expect(settleBet({ mode: 'place', ordered: false, horses: [13] }, finish, 100, 3).outcome).toBe('lose');

    // Couple: exact order vs any order.
    expect(settleBet({ mode: 'couple', ordered: true, horses: [4, 9] }, finish, 100, 50).outcome).toBe('win');
    expect(settleBet({ mode: 'couple', ordered: true, horses: [9, 4] }, finish, 100, 50).outcome).toBe('lose');
    expect(settleBet({ mode: 'couple', ordered: false, horses: [9, 4] }, finish, 100, 25).outcome).toBe('win');

    // Trio: partial hit loses.
    expect(settleBet({ mode: 'trio', ordered: true, horses: [4, 9, 2] }, finish, 100, 300).outcome).toBe('win');
    expect(settleBet({ mode: 'trio', ordered: false, horses: [2, 4, 9] }, finish, 100, 60).outcome).toBe('win');
    expect(settleBet({ mode: 'trio', ordered: false, horses: [2, 4, 13] }, finish, 100, 60).outcome).toBe('lose');

    // Quinté.
    expect(
      settleBet({ mode: 'quinte', ordered: true, horses: [4, 9, 2, 13, 7] }, finish, 10, 50_000).payout,
    ).toBe(500_000);
    expect(
      settleBet({ mode: 'quinte', ordered: true, horses: [4, 9, 2, 7, 13] }, finish, 10, 50_000).outcome,
    ).toBe('lose');
    expect(
      settleBet({ mode: 'quinte', ordered: false, horses: [7, 13, 2, 9, 4] }, finish, 10, 5_000).outcome,
    ).toBe('win');
  });

  test('rank tie-break by horse index is deterministic', () => {
    // Two horses with identical prices every tick: lower index ranks first.
    const params = Array.from({ length: HORSE_COUNT }, () => ({ drift: 0, vol: 0.012 }));
    const flat = createRaceCard(DERBY_CONFIG, params);
    const path = generateRacePath(flat);
    // At tick 0 all prices equal s0 → rank must be 0..15 in index order.
    expect(path.ranks[0]).toEqual(Array.from({ length: HORSE_COUNT }, (_, i) => i));
  });
});

describe('Monte Carlo validation', () => {
  const N = 300_000;
  const mc = monteCarloDerby(card, N);
  const se = (p: number) => Math.sqrt((p * (1 - p)) / N);

  // 4σ bounds on the 16-way loops: at 3σ per horse the joint false-failure
  // rate across 16 comparisons is ~4% per run; 4σ keeps the suite stable
  // while still catching any real pricing bias.
  test('win frequencies match exact quadrature within 4σ (300K draws)', () => {
    for (let i = 0; i < HORSE_COUNT; i++) {
      expect(Math.abs(mc.winFreq[i] - card.winProbs[i])).toBeLessThan(
        4 * se(card.winProbs[i]) + 1e-5,
      );
    }
  }, 30_000);

  test('place frequencies match exact quadrature within 4σ', () => {
    for (let i = 0; i < HORSE_COUNT; i++) {
      expect(Math.abs(mc.placeFreq[i] - card.placeProbs[i])).toBeLessThan(
        4 * se(card.placeProbs[i]) + 1e-5,
      );
    }
  }, 30_000);

  test('ordered couple of the two favorites matches within 3σ', () => {
    const byProb = card.winProbs
      .map((p, i) => ({ p, i }))
      .sort((a, b) => b.p - a.p)
      .map((x) => x.i);
    const [fav1, fav2] = byProb;
    const exact = orderedProbability(card.horses, [fav1, fav2]);
    expect(Math.abs(mc.coupleFreq(fav1, fav2) - exact)).toBeLessThan(3 * se(exact));
  }, 30_000);

  test('unordered trio of the three favorites matches within 3σ', () => {
    const byProb = card.winProbs
      .map((p, i) => ({ p, i }))
      .sort((a, b) => b.p - a.p)
      .map((x) => x.i);
    const favs = byProb.slice(0, 3);
    const exact = unorderedProbability(card.horses, favs);
    expect(Math.abs(mc.trioUnorderedFreq(favs) - exact)).toBeLessThan(3 * se(exact));
  }, 30_000);

  test('ordered quinté of the five favorites matches within 4σ', () => {
    const byProb = card.winProbs
      .map((p, i) => ({ p, i }))
      .sort((a, b) => b.p - a.p)
      .map((x) => x.i);
    const favs = byProb.slice(0, 5);
    const exact = orderedProbability(card.horses, favs);
    expect(exact).toBeGreaterThan(0);
    // Rare event: allow 4σ so the suite is stable while still catching bias.
    expect(Math.abs(mc.quinteOrderedFreq(favs) - exact)).toBeLessThan(
      4 * se(exact) + 1e-9,
    );
  }, 30_000);
});
