import { describe, test, expect } from 'vitest';
import {
  getRiskConfig,
  generateGBMQuote,
  extractLastDigitFromQuote,
  generateVolatilityRun,
  computeSigmaEff,
  getBarrierPriceLevels,
  resolveZone,
  getZoneLabel,
  getZoneColor,
  getMaxPayout,
  getZoneProbabilities,
  computeAnalyticalRTP,
  computeSimulatedRTP,
  isNetWin,
  isMonotonicLadder,
  normalCDF,
  getZoneHitProbability,
  getTargetPayout,
  TARGET_MARGIN,
  TARGET_PAYOUT_CAP,
} from '../plinko';
import type { PlinkoRisk } from '@/types';

describe('Plinko Engine (European Multi-Barrier Option)', () => {
  test('risk configs exist for all levels', () => {
    expect(getRiskConfig('low')).toBeDefined();
    expect(getRiskConfig('medium')).toBeDefined();
    expect(getRiskConfig('high')).toBeDefined();
  });

  test('each risk config has 9 barrier zones', () => {
    expect(getRiskConfig('low').zones).toHaveLength(9);
    expect(getRiskConfig('medium').zones).toHaveLength(9);
    expect(getRiskConfig('high').zones).toHaveLength(9);
  });

  test('sigma increases with risk', () => {
    const low = getRiskConfig('low').sigma;
    const med = getRiskConfig('medium').sigma;
    const high = getRiskConfig('high').sigma;
    expect(med).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(med);
  });

  test('tick count increases with risk (8, 12, 16)', () => {
    expect(getRiskConfig('low').tickCount).toBe(8);
    expect(getRiskConfig('medium').tickCount).toBe(12);
    expect(getRiskConfig('high').tickCount).toBe(16);
  });

  test('zone label and color helpers resolve from zone index', () => {
    expect(getZoneLabel('medium', 0)).toBe('Extreme +');
    expect(getZoneLabel('medium', 4)).toBe('Center');
    expect(getZoneColor('medium', 0)).toBe('#FF3B5C');
    expect(getMaxPayout('high')).toBe(1000);
  });

  test('GBM quote generates a positive number', () => {
    const quote = generateGBMQuote(1000, 0.5);
    expect(quote).toBeGreaterThan(0);
  });

  test('GBM quote stays in reasonable range', () => {
    let extremeCount = 0;
    for (let i = 0; i < 1000; i++) {
      const quote = generateGBMQuote(1000, 0.5, 0.01);
      if (quote < 500 || quote > 2000) extremeCount++;
    }
    expect(extremeCount).toBeLessThan(50);
  });

  test('extractLastDigitFromQuote returns 0-9', () => {
    expect(extractLastDigitFromQuote(1234.56)).toBe(6);
    expect(extractLastDigitFromQuote(1000.00)).toBe(0);
    expect(extractLastDigitFromQuote(999.99)).toBe(9);
  });

  test('computeSigmaEff scales with sigma and tick count', () => {
    const s1 = computeSigmaEff(0.15, 8);
    const s2 = computeSigmaEff(0.35, 12);
    const s3 = computeSigmaEff(0.60, 16);
    expect(s1).toBeGreaterThan(0);
    expect(s2).toBeGreaterThan(s1);
    expect(s3).toBeGreaterThan(s2);
  });

  test('barrier price levels are symmetric around start price', () => {
    const levels = getBarrierPriceLevels('medium', 1000);
    expect(levels).toHaveLength(8);

    for (const l of levels) {
      expect(l.price).toBeGreaterThan(0);
    }

    const plus1 = levels.find((l) => l.sigma === 1);
    const minus1 = levels.find((l) => l.sigma === -1);
    expect(plus1).toBeDefined();
    expect(minus1).toBeDefined();
    if (plus1 && minus1) {
      expect(plus1.price * minus1.price).toBeCloseTo(1000 * 1000, -1);
    }
  });

  test('resolveZone maps Z-scores correctly', () => {
    const zones = getRiskConfig('medium').zones;
    const sigmaEff = 0.05;

    const center = resolveZone(0.02 * sigmaEff, sigmaEff, zones);
    expect(center.zoneIndex).toBe(4);

    const inner = resolveZone(1.5 * sigmaEff, sigmaEff, zones);
    expect(inner.zoneIndex).toBe(3);

    const mid = resolveZone(2.5 * sigmaEff, sigmaEff, zones);
    expect(mid.zoneIndex).toBe(2);

    const outer = resolveZone(3.5 * sigmaEff, sigmaEff, zones);
    expect(outer.zoneIndex).toBe(1);

    const extreme = resolveZone(5.0 * sigmaEff, sigmaEff, zones);
    expect(extreme.zoneIndex).toBe(0);

    const negInner = resolveZone(-1.5 * sigmaEff, sigmaEff, zones);
    expect(negInner.zoneIndex).toBe(5);

    const negExtreme = resolveZone(-5.0 * sigmaEff, sigmaEff, zones);
    expect(negExtreme.zoneIndex).toBe(8);
  });

  test('generateVolatilityRun returns correct structure', () => {
    const run = generateVolatilityRun('medium');
    expect(run.quotes).toHaveLength(13);
    expect(run.digits).toHaveLength(12);
    expect(run.startPrice).toBe(1000);
    expect(run.endPrice).toBeGreaterThan(0);
    expect(typeof run.percentChange).toBe('number');
    expect(typeof run.zScore).toBe('number');
    expect(typeof run.zoneIndex).toBe('number');
    expect(typeof run.payout).toBe('number');
    expect(typeof run.isPositive).toBe('boolean');
  });

  test('all risk levels produce valid runs with correct tick counts', () => {
    const risks: PlinkoRisk[] = ['low', 'medium', 'high'];
    const expectedTicks = { low: 8, medium: 12, high: 16 };
    for (const r of risks) {
      const run = generateVolatilityRun(r);
      expect(run.quotes).toHaveLength(expectedTicks[r] + 1);
      expect(run.digits).toHaveLength(expectedTicks[r]);
    }
  });

  test('payout is always non-negative', () => {
    for (let i = 0; i < 100; i++) {
      const run = generateVolatilityRun('high');
      expect(run.payout).toBeGreaterThanOrEqual(0);
    }
  });

  test('isPositive matches percentChange sign', () => {
    for (let i = 0; i < 50; i++) {
      const run = generateVolatilityRun('medium');
      expect(run.isPositive).toBe(run.percentChange >= 0);
    }
  });

  test('zone index is within valid range (0-8)', () => {
    for (let i = 0; i < 100; i++) {
      const run = generateVolatilityRun('high');
      expect(run.zoneIndex).toBeGreaterThanOrEqual(0);
      expect(run.zoneIndex).toBeLessThan(9);
    }
  });

  test('higher sigma produces more variance in percent change', () => {
    const lowChanges: number[] = [];
    const highChanges: number[] = [];
    for (let i = 0; i < 500; i++) {
      lowChanges.push(Math.abs(generateVolatilityRun('low').percentChange));
      highChanges.push(Math.abs(generateVolatilityRun('high').percentChange));
    }
    const avgLow = lowChanges.reduce((a, b) => a + b, 0) / lowChanges.length;
    const avgHigh =
      highChanges.reduce((a, b) => a + b, 0) / highChanges.length;
    expect(avgHigh).toBeGreaterThan(avgLow);
  });

  test('zone probabilities sum to ~1', () => {
    const p = getZoneProbabilities();
    const total = p.center + 2 * (p.inner + p.mid + p.outer + p.extreme);
    expect(total).toBeCloseTo(1, 2);
  });

  test('normalCDF is symmetric around 0.5', () => {
    expect(normalCDF(0)).toBeCloseTo(0.5, 2);
    expect(normalCDF(1) + normalCDF(-1)).toBeCloseTo(1, 2);
  });

  test('analytical RTP is positive and below max payout', () => {
    for (const risk of ['low', 'medium', 'high'] as PlinkoRisk[]) {
      const rtp = computeAnalyticalRTP(risk);
      expect(rtp).toBeGreaterThan(0.5);
      expect(rtp).toBeLessThan(getMaxPayout(risk));
    }
  });

  test('payout ladder is monotonic per risk', () => {
    expect(isMonotonicLadder('low')).toBe(true);
    expect(isMonotonicLadder('medium')).toBe(true);
    expect(isMonotonicLadder('high')).toBe(true);
  });

  test('isNetWin uses payout >= 1', () => {
    expect(isNetWin(0.5)).toBe(false);
    expect(isNetWin(1)).toBe(true);
    expect(isNetWin(25)).toBe(true);
  });

  test('high risk inner payout exceeds mid ordering fix', () => {
    const zones = getRiskConfig('high').zones;
    expect(zones[4].payout).toBeLessThan(zones[3].payout);
    expect(zones[3].payout).toBeLessThan(zones[2].payout);
    expect(zones[2].payout).toBeLessThan(zones[1].payout);
    expect(zones[1].payout).toBeLessThan(zones[0].payout);
  });

  describe('Target mode pricing', () => {
    test('zone hit probabilities sum to ~1 across all 9 zones', () => {
      let total = 0;
      for (let i = 0; i < 9; i++) total += getZoneHitProbability(i);
      expect(total).toBeCloseTo(1, 2);
    });

    test('center probability is two-sided, others single-sided', () => {
      expect(getZoneHitProbability(4)).toBeCloseTo(0.6827, 3);
      expect(getZoneHitProbability(3)).toBeCloseTo(0.1359, 3);
      expect(getZoneHitProbability(5)).toBeCloseTo(0.1359, 3);
    });

    test('target payout equals (1 - margin) / probability, capped', () => {
      const centerPayout = getTargetPayout(4);
      expect(centerPayout).toBeCloseTo((1 - TARGET_MARGIN) / getZoneHitProbability(4), 1);

      // Extreme zones exceed the cap
      expect(getTargetPayout(0)).toBe(TARGET_PAYOUT_CAP);
      expect(getTargetPayout(8)).toBe(TARGET_PAYOUT_CAP);
    });

    test('target payouts increase toward the tails', () => {
      expect(getTargetPayout(4)).toBeLessThan(getTargetPayout(3));
      expect(getTargetPayout(3)).toBeLessThan(getTargetPayout(2));
      expect(getTargetPayout(2)).toBeLessThan(getTargetPayout(1));
      expect(getTargetPayout(1)).toBeLessThanOrEqual(getTargetPayout(0));
    });

    test('uncapped target RTP is (1 - margin) for every zone', () => {
      // For zones below the cap, p × payout = 1 − margin exactly
      for (const idx of [1, 2, 3, 4, 5, 6, 7]) {
        const rtp = getZoneHitProbability(idx) * getTargetPayout(idx);
        expect(rtp).toBeCloseTo(1 - TARGET_MARGIN, 1);
      }
    });

    test('invalid zone index returns 0', () => {
      expect(getZoneHitProbability(-1)).toBe(0);
      expect(getZoneHitProbability(9)).toBe(0);
      expect(getTargetPayout(9)).toBe(0);
    });
  });

  describe('Monte Carlo RTP validation', () => {
    test(
      'low risk RTP is within ±0.75% of 97%',
      () => {
        const rtp = computeSimulatedRTP('low', 100_000);
        expect(rtp).toBeGreaterThan(0.9625);
        expect(rtp).toBeLessThan(0.9775);
      },
      60_000,
    );

    test(
      'medium risk RTP is within ±1% of 96%',
      () => {
        const rtp = computeSimulatedRTP('medium', 100_000);
        expect(rtp).toBeGreaterThan(0.95);
        expect(rtp).toBeLessThan(0.975);
      },
      60_000,
    );

    // 1000× extreme tail creates high variance; 500K full-path sims need a wide band.
    test(
      'high risk RTP is within ±10% of 95%',
      () => {
        const rtp = computeSimulatedRTP('high', 500_000);
        expect(rtp).toBeGreaterThan(0.85);
        expect(rtp).toBeLessThan(1.05);
      },
      120_000,
    );

    test(
      'simulated RTP is within 3% of analytical for low risk',
      () => {
        const analytical = computeAnalyticalRTP('low');
        const simulated = computeSimulatedRTP('low', 50_000);
        expect(Math.abs(simulated - analytical)).toBeLessThan(0.03);
      },
      60_000,
    );
  });
});
