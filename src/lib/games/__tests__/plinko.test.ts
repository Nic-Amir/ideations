import { describe, test, expect } from 'vitest';
import {
  getRiskConfig,
  generateGBMQuote,
  extractLastDigitFromQuote,
  generateVolatilityRun,
  computeSigmaEff,
  getBarrierPriceLevels,
  resolveZone,
  type BarrierZone,
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

  describe('Monte Carlo RTP validation', () => {
    function simulateRTP(risk: PlinkoRisk, n: number): number {
      let totalPayout = 0;
      for (let i = 0; i < n; i++) {
        totalPayout += generateVolatilityRun(risk).payout;
      }
      return totalPayout / n;
    }

    test(
      'low risk RTP is within ±1% of 97%',
      () => {
        const rtp = simulateRTP('low', 100_000);
        expect(rtp).toBeGreaterThan(0.96);
        expect(rtp).toBeLessThan(0.98);
      },
      60_000,
    );

    test(
      'medium risk RTP is within ±2% of 96%',
      () => {
        const rtp = simulateRTP('medium', 100_000);
        expect(rtp).toBeGreaterThan(0.94);
        expect(rtp).toBeLessThan(0.98);
      },
      60_000,
    );

    // High risk has a 1000x extreme payout at ~0.006% probability.
    // Var(payout) ≈ 80, so std(mean) ≈ 0.013 for 500K sims.
    // Bounds are set wide (±8σ) to prevent flaky tests while
    // still catching gross miscalibration (e.g., 4000% RTP).
    test(
      'high risk RTP is within ±8% of 95%',
      () => {
        const rtp = simulateRTP('high', 500_000);
        expect(rtp).toBeGreaterThan(0.87);
        expect(rtp).toBeLessThan(1.04);
      },
      120_000,
    );
  });
});
