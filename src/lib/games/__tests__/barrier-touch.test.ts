import { describe, test, expect } from 'vitest';
import {
  BARRIER_TOUCH_CONFIG,
  COUNT_BUCKETS,
  COUNT_BUCKET_LABELS,
  SEQUENCE_LABELS,
  DISTANCE_PRESETS,
  DURATION_OPTIONS,
  getDistancePreset,
  normCdf,
  countBucketProbabilities,
  getCountPricing,
  sequenceCompletionProbabilities,
  calibratedSequenceOffsetSigma,
  getSequencePricing,
  computeBarriers,
  perTickSigma,
  countCrossings,
  bucketOf,
  traceSequence,
  generateTouchPath,
  settleCount,
  settleSequence,
  monteCarloCountEstimate,
  monteCarloSequenceEstimate,
  nextIdleTick,
} from '../barrier-touch';

describe('Barrier Touch engine', () => {
  test('default config matches the platform conventions', () => {
    expect(BARRIER_TOUCH_CONFIG.s0).toBe(100_000);
    expect(BARRIER_TOUCH_CONFIG.sigma).toBe(1.0);
    expect(BARRIER_TOUCH_CONFIG.dtYears).toBeCloseTo(1 / 31_536_000, 12);
    expect(BARRIER_TOUCH_CONFIG.tickDuration).toBe(15);
    expect(BARRIER_TOUCH_CONFIG.commission).toBe(0.03);
    expect(DURATION_OPTIONS).toContain(15);
    expect(COUNT_BUCKETS).toEqual([0, 1, 2, 3]);
    expect(COUNT_BUCKET_LABELS[3]).toBe('3+');
    expect(SEQUENCE_LABELS.upperLower.name).toBe('Upper → Lower');
  });

  test('normCdf matches known values', () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 7);
    expect(normCdf(1.96)).toBeCloseTo(0.975, 4);
    expect(normCdf(-1.96)).toBeCloseTo(0.025, 4);
  });
});

describe('Count mode', () => {
  test('bucket probabilities sum to 1 and are all positive', () => {
    for (const ticks of DURATION_OPTIONS) {
      const probs = countBucketProbabilities(ticks);
      expect(probs[0] + probs[1] + probs[2] + probs[3]).toBeCloseTo(1, 10);
      for (const p of probs) {
        expect(p).toBeGreaterThan(0);
        expect(p).toBeLessThan(1);
      }
    }
  });

  test('longer durations shift mass from 0 crossings toward 3+', () => {
    const p10 = countBucketProbabilities(10);
    const p20 = countBucketProbabilities(20);
    expect(p20[0]).toBeLessThan(p10[0]);
    expect(p20[3]).toBeGreaterThan(p10[3]);
  });

  test('every bucket pick carries a 3% house edge', () => {
    for (const ticks of DURATION_OPTIONS) {
      const pricing = getCountPricing(ticks);
      for (const bucket of COUNT_BUCKETS) {
        const ev =
          pricing.probabilities[bucket] * pricing.multipliers[bucket] - 1;
        expect(ev).toBeLessThan(0);
        expect(ev).toBeCloseTo(-BARRIER_TOUCH_CONFIG.commission, 2);
      }
    }
  });

  test('countCrossings detects consecutive-side flips', () => {
    // up, down (cross), up (cross)
    expect(countCrossings([100, 101, 99, 102], 100)).toEqual([2, 3]);
    // never leaves the line: no side established, no crossings
    expect(countCrossings([100, 100, 100], 100)).toEqual([]);
    // side established late
    expect(countCrossings([100, 100, 99, 101], 100)).toEqual([3]);
  });

  test('a tick landing exactly on the line keeps the previous side', () => {
    // up, on-line (still up), down → one crossing at tick 3
    expect(countCrossings([100, 101, 100, 99], 100)).toEqual([3]);
    // up, on-line, up → no crossing
    expect(countCrossings([100, 101, 100, 102], 100)).toEqual([]);
  });

  test('bucketOf saturates at 3+', () => {
    expect(bucketOf(0)).toBe(0);
    expect(bucketOf(2)).toBe(2);
    expect(bucketOf(3)).toBe(3);
    expect(bucketOf(7)).toBe(3);
  });

  test('settleCount pays stake × multiplier on the right bucket only', () => {
    const path = generateTouchPath(100_000, 10, null);
    const pricing = getCountPricing(10);
    const win = settleCount(path.bucket, path, 100, pricing.multipliers[path.bucket]);
    expect(win.outcome).toBe('win');
    expect(win.payout).toBe(Math.round(100 * pricing.multipliers[path.bucket]));
    expect(win.settleTick).toBe(10);

    const wrongBucket = ((path.bucket + 1) % 4) as 0 | 1 | 2 | 3;
    const loss = settleCount(wrongBucket, path, 100, pricing.multipliers[wrongBucket]);
    expect(loss.outcome).toBe('lose');
    expect(loss.payout).toBe(0);
  });

  test('Monte Carlo validates the count grid within 3σ (200K paths)', () => {
    const n = 200_000;
    const ticks = 15;
    const grid = countBucketProbabilities(ticks);
    const mc = monteCarloCountEstimate(n, ticks);

    for (const bucket of COUNT_BUCKETS) {
      expect(
        Math.abs(mc.probabilities[bucket] - grid[bucket]),
      ).toBeLessThan(3 * mc.standardErrors[bucket]);
    }
    expect(
      mc.probabilities[0] + mc.probabilities[1] + mc.probabilities[2] + mc.probabilities[3],
    ).toBeCloseTo(1, 10);
  }, 30_000);
});

describe('Sequence mode', () => {
  test('calibration puts the Standard completion probability near 25%', () => {
    const pricing = getSequencePricing(15, 1);
    expect(pricing.pUpperLower).toBeGreaterThan(0.23);
    expect(pricing.pUpperLower).toBeLessThan(0.27);
  }, 30_000);

  test('completion is symmetric between the two directions', () => {
    const pricing = getSequencePricing(15, 1);
    expect(Math.abs(pricing.pUpperLower - pricing.pLowerUpper)).toBeLessThan(0.005);
  }, 30_000);

  test('wider barriers lower completion and raise the multiplier', () => {
    const near = getSequencePricing(10, getDistancePreset('near').factor);
    const standard = getSequencePricing(10, 1);
    const far = getSequencePricing(10, getDistancePreset('far').factor);

    expect(near.pUpperLower).toBeGreaterThan(standard.pUpperLower);
    expect(far.pUpperLower).toBeLessThan(standard.pUpperLower);
    expect(near.multUpperLower).toBeLessThan(standard.multUpperLower);
    expect(far.multUpperLower).toBeGreaterThan(standard.multUpperLower);
    expect(DISTANCE_PRESETS.map((p) => p.id)).toEqual(['near', 'standard', 'far']);
  }, 30_000);

  test('every sequence pick carries a 3% house edge', () => {
    for (const preset of DISTANCE_PRESETS) {
      const pricing = getSequencePricing(15, preset.factor);
      const evUL = pricing.pUpperLower * pricing.multUpperLower - 1;
      const evLU = pricing.pLowerUpper * pricing.multLowerUpper - 1;
      expect(evUL).toBeLessThan(0);
      expect(evUL).toBeCloseTo(-BARRIER_TOUCH_CONFIG.commission, 2);
      expect(evLU).toBeCloseTo(-BARRIER_TOUCH_CONFIG.commission, 2);
    }
  }, 30_000);

  test('barriers are log-symmetric around the entry spot', () => {
    const { upper, lower } = computeBarriers(100_000, 0.001);
    expect(upper).toBeCloseTo(100_000 * Math.exp(0.001), 6);
    expect(lower).toBeCloseTo(100_000 * Math.exp(-0.001), 6);
    expect(upper * lower).toBeCloseTo(100_000 ** 2, 0);
  });

  test('traceSequence resolves first touch and round-trip completion', () => {
    // Upper touched at tick 1, lower at tick 2: U→L completes.
    const t1 = traceSequence([100, 103, 98], 102, 99);
    expect(t1.firstTouch).toBe('upper');
    expect(t1.firstTouchTick).toBe(1);
    expect(t1.completedPick).toBe('upperLower');
    expect(t1.completionTick).toBe(2);

    // Lower first, then back through upper: L→U completes.
    const t2 = traceSequence([100, 98.5, 102.5], 102, 99);
    expect(t2.firstTouch).toBe('lower');
    expect(t2.completedPick).toBe('lowerUpper');

    // Leg 1 only — incomplete.
    const t3 = traceSequence([100, 103, 101, 100.5], 102, 99);
    expect(t3.firstTouch).toBe('upper');
    expect(t3.completedPick).toBeNull();

    // Exact touch is inclusive on both legs.
    const t4 = traceSequence([100, 102, 99], 102, 99);
    expect(t4.firstTouch).toBe('upper');
    expect(t4.completedPick).toBe('upperLower');

    // No touch at all.
    const t5 = traceSequence([100, 101, 100.2], 102, 99);
    expect(t5.firstTouch).toBeNull();
    expect(t5.completedPick).toBeNull();
  });

  test('settleSequence: win pays at completion, wrong first barrier busts early', () => {
    const winPath = generateTouchPathFixture([100, 103, 98], 102, 99);
    const win = settleSequence('upperLower', winPath, 100, 3.88);
    expect(win.outcome).toBe('win');
    expect(win.payout).toBe(388);
    expect(win.settleTick).toBe(2);

    // Lower touched first: an Upper→Lower bet dies at that tick.
    const bustPath = generateTouchPathFixture([100, 98.5, 101, 100], 102, 99);
    const bust = settleSequence('upperLower', bustPath, 100, 3.88);
    expect(bust.outcome).toBe('lose');
    expect(bust.payout).toBe(0);
    expect(bust.settleTick).toBe(1);

    // Right first barrier but never completed: runs to maturity.
    const openPath = generateTouchPathFixture([100, 103, 101, 100.5], 102, 99);
    const open = settleSequence('upperLower', openPath, 100, 3.88);
    expect(open.outcome).toBe('lose');
    expect(open.settleTick).toBe(3);
  });

  test('generateTouchPath produces a coherent full-length round', () => {
    const pricing = getSequencePricing(10, 1);
    const barriers = computeBarriers(100_000, pricing.offsetLog);

    for (let i = 0; i < 50; i++) {
      const path = generateTouchPath(100_000, 10, barriers);
      expect(path.prices).toHaveLength(11);
      expect(path.prices[0]).toBe(100_000);
      expect(path.prices.every((p) => p > 0)).toBe(true);
      expect(path.bucket).toBe(bucketOf(path.crossingCount));
      expect(path.crossingCount).toBe(path.crossingTicks.length);
      expect(path.sequence).not.toBeNull();
      if (path.sequence?.completedPick) {
        expect(path.sequence.firstTouchTick).not.toBeNull();
        expect(path.sequence.completionTick).toBeGreaterThan(
          path.sequence.firstTouchTick as number,
        );
      }
    }
  }, 30_000);

  test('Monte Carlo validates the sequence grid within 3σ (150K paths)', () => {
    const n = 150_000;
    const ticks = 15;
    const pricing = getSequencePricing(ticks, 1);
    const mc = monteCarloSequenceEstimate(n, ticks, pricing.offsetSigma);

    expect(Math.abs(mc.pUpperLower - pricing.pUpperLower)).toBeLessThan(
      3 * mc.seUpperLower,
    );
    expect(Math.abs(mc.pLowerUpper - pricing.pLowerUpper)).toBeLessThan(
      3 * mc.seLowerUpper,
    );
  }, 30_000);
});

describe('Shared helpers', () => {
  test('idle tick moves the price by a plausible GBM step', () => {
    const step = perTickSigma();
    for (let i = 0; i < 50; i++) {
      const next = nextIdleTick(100_000);
      expect(Math.abs(Math.log(next / 100_000))).toBeLessThan(6 * step + 1e-6);
    }
  });

  test('sequenceCompletionProbabilities is monotone in barrier distance', () => {
    const nearP = sequenceCompletionProbabilities(0.8, 10);
    const farP = sequenceCompletionProbabilities(2.4, 10);
    expect(nearP.upperLower).toBeGreaterThan(farP.upperLower);
  });

  test('calibrated offset grows with duration', () => {
    expect(calibratedSequenceOffsetSigma(20)).toBeGreaterThan(
      calibratedSequenceOffsetSigma(10),
    );
  }, 30_000);
});

/** Builds a TouchPath around a handcrafted price series for settlement tests. */
function generateTouchPathFixture(
  prices: number[],
  upper: number,
  lower: number,
) {
  return {
    prices,
    entrySpot: prices[0],
    upper,
    lower,
    crossingTicks: countCrossings(prices, prices[0]),
    crossingCount: countCrossings(prices, prices[0]).length,
    bucket: bucketOf(countCrossings(prices, prices[0]).length),
    sequence: traceSequence(prices, upper, lower),
  };
}
