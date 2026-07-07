import { describe, test, expect } from 'vitest';
import {
  BARRIER_PREDICTOR_CONFIG,
  BARRIER_LABELS,
  DISTANCE_PRESETS,
  DURATION_OPTIONS,
  getDistancePreset,
  normCdf,
  noTouchProbability,
  calibratedOffsetSigma,
  getPredictorPricing,
  computeBarriers,
  computeExpectedValue,
  perTickSigma,
  generatePredictorPath,
  settlePredictor,
  distanceToNearestBarrierSigma,
  monteCarloEstimate,
  nextIdleTick,
} from '../barrier-predictor';

describe('Barrier Predictor engine', () => {
  test('default config matches spec §3–§4 parameters', () => {
    expect(BARRIER_PREDICTOR_CONFIG.s0).toBe(100_000);
    expect(BARRIER_PREDICTOR_CONFIG.sigma).toBe(1.0);
    expect(BARRIER_PREDICTOR_CONFIG.dtYears).toBeCloseTo(1 / 31_536_000, 12);
    expect(BARRIER_PREDICTOR_CONFIG.tickDuration).toBe(10);
    expect(BARRIER_PREDICTOR_CONFIG.commission).toBe(0.03);
    expect(DURATION_OPTIONS).toContain(10);
  });

  test('normCdf matches known values', () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 7);
    expect(normCdf(0.6745)).toBeCloseTo(0.75, 4);
    expect(normCdf(1.96)).toBeCloseTo(0.975, 4);
    expect(normCdf(-1.96)).toBeCloseTo(0.025, 4);
    expect(normCdf(3.552)).toBeCloseTo(0.99981, 4);
  });

  test('single-tick no-touch probability is exact: Φ(x) − Φ(−x)', () => {
    for (const x of [0.5, 1, 2]) {
      expect(noTouchProbability(x, 1)).toBeCloseTo(normCdf(x) - normCdf(-x), 4);
    }
  });

  test('single-tick calibration recovers the spec §5.4 quantile 0.6745', () => {
    // With one monitoring tick, no-touch = terminal-inside, so the calibrated
    // offset must equal the spec's 75th-percentile constant.
    expect(calibratedOffsetSigma(1)).toBeCloseTo(0.6745, 3);
  });

  test('no-touch probability is monotone in barrier distance and duration', () => {
    expect(noTouchProbability(1, 10)).toBeLessThan(noTouchProbability(2, 10));
    expect(noTouchProbability(2, 20)).toBeLessThan(noTouchProbability(2, 5));
    expect(noTouchProbability(0, 10)).toBe(0);
    expect(noTouchProbability(10, 1)).toBeCloseTo(1, 6);
  });

  test('default calibration puts touch probability at exactly 50%', () => {
    for (const ticks of DURATION_OPTIONS) {
      const pricing = getPredictorPricing(ticks);
      expect(pricing.pTouch).toBeCloseTo(0.5, 3);
      expect(pricing.pFairPerSide).toBeCloseTo(0.25, 3);
    }
  });

  test('discrete monitoring requires wider barriers for longer durations', () => {
    expect(calibratedOffsetSigma(10)).toBeGreaterThan(calibratedOffsetSigma(5));
    expect(calibratedOffsetSigma(20)).toBeGreaterThan(calibratedOffsetSigma(10));
  });

  test('default multiplier is ~1.94× region (refund-aware, not the spec §5.2 3.88×)', () => {
    // The spec's (1/0.25)·0.97 = 3.88× ignores the 50% refund and would hand
    // the player +47% EV. Refund-aware: (pTouch − c)/pFair = (0.5−0.03)/0.25.
    const pricing = getPredictorPricing(10);
    expect(pricing.multiplier).toBeCloseTo(1.88, 2);
  });

  test('multiplier and touch odds respond to the distance presets', () => {
    const near = getPredictorPricing(10, getDistancePreset('near').factor);
    const standard = getPredictorPricing(10, 1);
    const far = getPredictorPricing(10, getDistancePreset('far').factor);

    expect(near.pTouch).toBeGreaterThan(standard.pTouch);
    expect(far.pTouch).toBeLessThan(standard.pTouch);
    // Closer barriers → fewer refunds → richer decisive payout.
    expect(near.multiplier).toBeGreaterThan(far.multiplier);
  });

  test('expected value is ≈ −commission at every setting (house edge 3%)', () => {
    for (const ticks of DURATION_OPTIONS) {
      for (const preset of DISTANCE_PRESETS) {
        const ev = computeExpectedValue(ticks, preset.factor);
        expect(ev).toBeLessThan(0);
        expect(ev).toBeCloseTo(-BARRIER_PREDICTOR_CONFIG.commission, 2);
      }
    }
  });

  test('barriers are log-symmetric around the entry spot (spec §4.2)', () => {
    const { upper, lower } = computeBarriers(100_000, 0.001);
    expect(upper).toBeCloseTo(100_000 * Math.exp(0.001), 6);
    expect(lower).toBeCloseTo(100_000 * Math.exp(-0.001), 6);
    expect(upper * lower).toBeCloseTo(100_000 ** 2, 0);
  });

  test('generatePredictorPath produces a valid series and stops at first touch', () => {
    const pricing = getPredictorPricing(10);
    const { upper, lower } = computeBarriers(100_000, pricing.offsetLog);

    for (let i = 0; i < 100; i++) {
      const path = generatePredictorPath(100_000, upper, lower, 10);
      expect(path.prices[0]).toBe(100_000);
      expect(path.prices.length).toBe(path.settleTick + 1);
      expect(path.prices.every((p) => p > 0)).toBe(true);

      if (path.touched !== null) {
        expect(path.touchTick).toBe(path.settleTick);
        const touchPrice = path.prices[path.settleTick];
        if (path.touched === 'upper') expect(touchPrice).toBeGreaterThanOrEqual(upper);
        else expect(touchPrice).toBeLessThanOrEqual(lower);
        // Interior ticks must be strictly inside the corridor.
        for (let t = 0; t < path.settleTick; t++) {
          expect(path.prices[t]).toBeLessThan(upper);
          expect(path.prices[t]).toBeGreaterThan(lower);
        }
      } else {
        expect(path.touchTick).toBeNull();
        expect(path.settleTick).toBe(10);
      }
    }
  });

  test('settlement: correct pick pays stake × locked multiplier', () => {
    const path = {
      prices: [100_000, 100_400],
      touched: 'upper' as const,
      touchTick: 1,
      settleTick: 1,
      entrySpot: 100_000,
      upper: 100_380,
      lower: 99_620,
    };
    const result = settlePredictor('upper', path, 100, 1.88);
    expect(result.outcome).toBe('win');
    expect(result.payout).toBe(188);
    expect(result.multiplier).toBe(1.88);
    expect(result.touched).toBe('upper');
  });

  test('settlement: wrong pick forfeits stake', () => {
    const path = {
      prices: [100_000, 99_600],
      touched: 'lower' as const,
      touchTick: 1,
      settleTick: 1,
      entrySpot: 100_000,
      upper: 100_380,
      lower: 99_620,
    };
    const result = settlePredictor('upper', path, 100, 1.88);
    expect(result.outcome).toBe('lose');
    expect(result.payout).toBe(0);
  });

  test('settlement: no touch at maturity refunds the stake (spec §4.3)', () => {
    const path = {
      prices: [100_000, 100_010, 99_995],
      touched: null,
      touchTick: null,
      settleTick: 10,
      entrySpot: 100_000,
      upper: 100_380,
      lower: 99_620,
    };
    for (const pick of ['upper', 'lower'] as const) {
      const result = settlePredictor(pick, path, 50, 1.88);
      expect(result.outcome).toBe('refund');
      expect(result.payout).toBe(50);
      expect(result.touched).toBeNull();
    }
  });

  test('distance to nearest barrier is symmetric at entry and ≤ 0 on touch', () => {
    const pricing = getPredictorPricing(10);
    const { upper, lower } = computeBarriers(100_000, pricing.offsetLog);
    const atEntry = distanceToNearestBarrierSigma(100_000, upper, lower);
    expect(atEntry).toBeCloseTo(pricing.offsetSigma, 3);
    expect(distanceToNearestBarrierSigma(upper, upper, lower)).toBeCloseTo(0, 6);
    expect(distanceToNearestBarrierSigma(upper * 1.001, upper, lower)).toBeLessThan(0);
    expect(distanceToNearestBarrierSigma(lower, upper, lower)).toBeCloseTo(0, 6);
  });

  test('idle tick moves the price by a plausible GBM step', () => {
    const step = perTickSigma();
    for (let i = 0; i < 50; i++) {
      const next = nextIdleTick(100_000);
      // 6σ bound on a single log-step.
      expect(Math.abs(Math.log(next / 100_000))).toBeLessThan(6 * step + 1e-6);
    }
  });

  test('barrier labels are defined', () => {
    expect(BARRIER_LABELS.upper.name).toBe('Upper');
    expect(BARRIER_LABELS.lower.name).toBe('Lower');
  });

  test('Monte Carlo validates the pricing grid within 3σ (200K paths)', () => {
    const n = 200_000;
    const ticks = 10;
    const pricing = getPredictorPricing(ticks);
    const mc = monteCarloEstimate(n, ticks);

    expect(Math.abs(mc.pUpper - pricing.pFairPerSide)).toBeLessThan(3 * mc.seUpper);
    expect(Math.abs(mc.pLower - pricing.pFairPerSide)).toBeLessThan(3 * mc.seLower);
    expect(Math.abs(mc.pNoTouch - pricing.pNoTouch)).toBeLessThan(3 * mc.seNoTouch);
    expect(mc.pUpper + mc.pLower + mc.pNoTouch).toBeCloseTo(1, 10);
  }, 30_000);

  test('Monte Carlo validates the near preset within 3σ (100K paths)', () => {
    const n = 100_000;
    const factor = getDistancePreset('near').factor;
    const pricing = getPredictorPricing(10, factor);
    const mc = monteCarloEstimate(n, 10, factor);

    expect(Math.abs(mc.pNoTouch - pricing.pNoTouch)).toBeLessThan(3 * mc.seNoTouch);
    expect(Math.abs(mc.pUpper - pricing.pFairPerSide)).toBeLessThan(3 * mc.seUpper);
  }, 30_000);

  test('empirical EV from Monte Carlo is within noise of −3% (100K paths)', () => {
    const n = 100_000;
    const ticks = 10;
    const pricing = getPredictorPricing(ticks);
    const mc = monteCarloEstimate(n, ticks);

    // Playing "upper" every round with stake 1.
    const ev = mc.pUpper * pricing.multiplier + mc.pNoTouch - 1;
    expect(ev).toBeLessThan(0);
    expect(ev).toBeCloseTo(-0.03, 1);
  }, 30_000);
});
