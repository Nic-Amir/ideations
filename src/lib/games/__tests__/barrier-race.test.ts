import { describe, test, expect } from 'vitest';
import {
  BARRIER_RACE_CONFIG,
  GRID_PROBABILITIES,
  ASSET_LABELS,
  getOfferedOdds,
  getFairOdds,
  computeOverround,
  computeExpectedValue,
  deriveParams,
  classifyWinner,
  generateRacePath,
  settleRace,
  monteCarloEstimate,
  sampleCorrelatedShocks,
  distanceToBarrierSigma,
  getNearMiss,
  NEAR_MISS_SIGMA,
  estimateLiveProbabilities,
  computeCashOutOffer,
  CASH_OUT_FEE,
} from '../barrier-race';

describe('Barrier Race engine', () => {
  test('default config matches spec parameters', () => {
    expect(BARRIER_RACE_CONFIG.s0).toBe(100);
    expect(BARRIER_RACE_CONFIG.barrier).toBe(102);
    expect(BARRIER_RACE_CONFIG.rho).toBe(-0.5);
    expect(BARRIER_RACE_CONFIG.commission).toBe(0.03);
  });

  test('derived drift and vol match spec §3.2', () => {
    const { drift, vol } = deriveParams();
    expect(drift[0]).toBeCloseTo(0.001992, 5);
    expect(drift[1]).toBeCloseTo(0.000682, 5);
    expect(vol[0]).toBeCloseTo(0.004, 5);
    expect(vol[1]).toBeCloseTo(0.006, 5);
  });

  test('offered odds match spec §6.3', () => {
    expect(getOfferedOdds('drift')).toBe(1.5);
    expect(getOfferedOdds('vol')).toBe(2.61);
  });

  test('fair odds match spec §6.1', () => {
    expect(getFairOdds('drift')).toBeCloseTo(1 / 0.6369, 2);
    expect(getFairOdds('vol')).toBeCloseTo(1 / 0.3535, 2);
  });

  test('overround is ~105%', () => {
    expect(computeOverround()).toBeCloseTo(1.0504, 3);
  });

  test('expected value is negative for both assets (house edge)', () => {
    expect(computeExpectedValue('drift')).toBeLessThan(0);
    expect(computeExpectedValue('vol')).toBeLessThan(0);
    expect(computeExpectedValue('drift')).toBeCloseTo(-0.035, 2);
    expect(computeExpectedValue('vol')).toBeCloseTo(-0.068, 2);
  });

  test('classifyWinner resolves all four outcomes', () => {
    expect(classifyWinner(5, null)).toBe('drift');
    expect(classifyWinner(null, 3)).toBe('vol');
    expect(classifyWinner(4, 4)).toBe('tie');
    expect(classifyWinner(null, null)).toBe('timeout');
    expect(classifyWinner(7, 9)).toBe('drift');
    expect(classifyWinner(10, 8)).toBe('vol');
  });

  test('generateRacePath produces valid price series', () => {
    const path = generateRacePath();
    expect(path.prices1[0]).toBe(100);
    expect(path.prices2[0]).toBe(100);
    expect(path.prices1.length).toBeGreaterThan(1);
    expect(path.prices1.length).toBe(path.prices2.length);
    expect(path.prices1.every((p) => p > 0)).toBe(true);
    expect(path.prices2.every((p) => p > 0)).toBe(true);
  });

  test('races typically resolve well before max ticks', () => {
    let maxTicks = 0;
    for (let i = 0; i < 200; i++) {
      const path = generateRacePath();
      maxTicks = Math.max(maxTicks, path.settleTick);
      expect(path.winner).not.toBe('timeout');
    }
    expect(maxTicks).toBeLessThan(200);
  });

  test('settlement: win pays stake × offered odds', () => {
    const path = {
      prices1: [100, 103],
      prices2: [100, 101],
      hitTick1: 1,
      hitTick2: null,
      winner: 'drift' as const,
      settleTick: 1,
    };
    const result = settleRace('drift', path, 100);
    expect(result.outcome).toBe('win');
    expect(result.payout).toBe(150);
    expect(result.multiplier).toBe(1.5);
  });

  test('settlement: loss forfeits stake', () => {
    const path = {
      prices1: [100, 103],
      prices2: [100, 101],
      hitTick1: 1,
      hitTick2: null,
      winner: 'drift' as const,
      settleTick: 1,
    };
    const result = settleRace('vol', path, 100);
    expect(result.outcome).toBe('lose');
    expect(result.payout).toBe(0);
  });

  test('settlement: tie refunds stake', () => {
    const path = {
      prices1: [100, 103],
      prices2: [100, 103],
      hitTick1: 1,
      hitTick2: 1,
      winner: 'tie' as const,
      settleTick: 1,
    };
    const result = settleRace('drift', path, 100);
    expect(result.outcome).toBe('tie');
    expect(result.payout).toBe(100);
    expect(result.multiplier).toBe(1);
  });

  test('settlement: timeout refunds stake', () => {
    const path = {
      prices1: [100, 99],
      prices2: [100, 99],
      hitTick1: null,
      hitTick2: null,
      winner: 'timeout' as const,
      settleTick: 3000,
    };
    const result = settleRace('vol', path, 50);
    expect(result.outcome).toBe('timeout');
    expect(result.payout).toBe(50);
  });

  test('correlated shocks have negative sample correlation', () => {
    const n = 5000;
    let sumZ1 = 0;
    let sumZ2 = 0;
    let sumZ1Z2 = 0;
    for (let i = 0; i < n; i++) {
      const [z1, z2] = sampleCorrelatedShocks(BARRIER_RACE_CONFIG.rho);
      sumZ1 += z1;
      sumZ2 += z2;
      sumZ1Z2 += z1 * z2;
    }
    const mean1 = sumZ1 / n;
    const mean2 = sumZ2 / n;
    let var1 = 0;
    let var2 = 0;
    let cov = 0;
    for (let i = 0; i < n; i++) {
      const [z1, z2] = sampleCorrelatedShocks(BARRIER_RACE_CONFIG.rho);
      var1 += (z1 - mean1) ** 2;
      var2 += (z2 - mean2) ** 2;
      cov += (z1 - mean1) * (z2 - mean2);
    }
    const corr = cov / Math.sqrt(var1 * var2);
    expect(corr).toBeGreaterThan(-0.6);
    expect(corr).toBeLessThan(-0.4);
  });

  test('Monte Carlo validates grid probabilities within 3σ (200K paths)', () => {
    const n = 200_000;
    const mc = monteCarloEstimate(n);
    const sigma = 3;

    expect(Math.abs(mc.pDrift - GRID_PROBABILITIES.drift)).toBeLessThan(
      sigma * mc.seDrift,
    );
    expect(Math.abs(mc.pVol - GRID_PROBABILITIES.vol)).toBeLessThan(
      sigma * mc.seVol,
    );
    expect(Math.abs(mc.pTie - GRID_PROBABILITIES.tie)).toBeLessThan(
      sigma * mc.seTie,
    );
    expect(mc.pDrift + mc.pVol + mc.pTie + mc.pTimeout).toBeCloseTo(1, 2);
  }, 30_000);

  test('asset labels are defined', () => {
    expect(ASSET_LABELS.drift.name).toBe('Drift');
    expect(ASSET_LABELS.vol.tag).toBe('Wild swinger');
  });

  test('distance to barrier matches spec d/s at start', () => {
    expect(distanceToBarrierSigma(100, 'drift')).toBeCloseTo(4.95, 2);
    expect(distanceToBarrierSigma(100, 'vol')).toBeCloseTo(3.3, 2);
    expect(distanceToBarrierSigma(102, 'drift')).toBeCloseTo(0, 5);
    expect(distanceToBarrierSigma(103, 'vol')).toBeLessThan(0);
  });

  test('near miss detected when losing pick came close to the barrier', () => {
    // Vol peaks at 101.8 (0.33σ from barrier at σ₂ = 0.006) but Drift wins.
    const path = {
      prices1: [100, 101, 102.1],
      prices2: [100, 101.8, 101.2],
      hitTick1: 2,
      hitTick2: null,
      winner: 'drift' as const,
      settleTick: 2,
    };
    const nearMiss = getNearMiss('vol', path);
    expect(nearMiss.isNearMiss).toBe(true);
    expect(nearMiss.closestSigma).toBeLessThan(NEAR_MISS_SIGMA);
    expect(nearMiss.closestGap).toBeCloseTo(0.2, 5);
  });

  test('no near miss when losing pick stayed far from the barrier', () => {
    const path = {
      prices1: [100, 101, 102.1],
      prices2: [100, 99.5, 99.2],
      hitTick1: 2,
      hitTick2: null,
      winner: 'drift' as const,
      settleTick: 2,
    };
    const nearMiss = getNearMiss('vol', path);
    expect(nearMiss.isNearMiss).toBe(false);
    expect(nearMiss.closestSigma).toBeGreaterThan(NEAR_MISS_SIGMA);
  });

  test('pick that touched the barrier is not a near miss', () => {
    // Both touched same tick — tie. closestSigma <= 0 must not count.
    const path = {
      prices1: [100, 102.5],
      prices2: [100, 102.1],
      hitTick1: 1,
      hitTick2: 1,
      winner: 'tie' as const,
      settleTick: 1,
    };
    const nearMiss = getNearMiss('vol', path);
    expect(nearMiss.isNearMiss).toBe(false);
    expect(nearMiss.closestSigma).toBeLessThanOrEqual(0);
  });
});

describe('Barrier Race live cash-out pricing', () => {
  const logStart = Math.log(100);
  const logBarrier = Math.log(102);

  test('live estimate from the start state agrees with grid probabilities within 3σ', () => {
    const n = 100_000;
    const live = estimateLiveProbabilities(logStart, logStart, n);
    const se = (p: number) => Math.sqrt((p * (1 - p)) / n);

    expect(Math.abs(live.pWin1 - GRID_PROBABILITIES.drift)).toBeLessThan(
      3 * se(GRID_PROBABILITIES.drift),
    );
    expect(Math.abs(live.pWin2 - GRID_PROBABILITIES.vol)).toBeLessThan(
      3 * se(GRID_PROBABILITIES.vol),
    );
    expect(live.pWin1 + live.pWin2 + live.pRefund).toBeCloseTo(1, 10);
  }, 30_000);

  test('pWin rises as the picked asset moves toward the barrier', () => {
    const n = 40_000;
    const atStart = estimateLiveProbabilities(logStart, logStart, n);
    const ahead = estimateLiveProbabilities(Math.log(101.5), logStart, n);
    const behind = estimateLiveProbabilities(Math.log(99), Math.log(101), n);

    expect(ahead.pWin1).toBeGreaterThan(atStart.pWin1 + 0.1);
    expect(behind.pWin1).toBeLessThan(atStart.pWin1 - 0.1);
  }, 30_000);

  test('touched states are deterministic', () => {
    expect(estimateLiveProbabilities(logBarrier, logStart, 10)).toEqual({
      pWin1: 1,
      pWin2: 0,
      pRefund: 0,
    });
    expect(estimateLiveProbabilities(logStart, logBarrier + 0.01, 10)).toEqual({
      pWin1: 0,
      pWin2: 1,
      pRefund: 0,
    });
    expect(estimateLiveProbabilities(logBarrier, logBarrier, 10)).toEqual({
      pWin1: 0,
      pWin2: 0,
      pRefund: 1,
    });
  });

  test('offer at a touched winning state pays stake × mult × (1 − fee)', () => {
    const offer = computeCashOutOffer(100, 1.5, 1, 0);
    expect(offer).toBe(Math.floor(100 * 1.5 * (1 - CASH_OUT_FEE)));
  });

  test('offer is discounted below fair value and never negative', () => {
    const fair = 100 * (0.6 * 1.5 + 0.01);
    expect(computeCashOutOffer(100, 1.5, 0.6, 0.01)).toBeLessThan(fair);
    expect(computeCashOutOffer(100, 1.5, 0, 0)).toBe(0);
    expect(computeCashOutOffer(100, 2.61, 0.001, 0)).toBeGreaterThanOrEqual(0);
  });

  test('entry-state offer is below stake (house edge plus fee)', () => {
    const offer = computeCashOutOffer(
      100,
      1.5,
      GRID_PROBABILITIES.drift,
      GRID_PROBABILITIES.tie,
    );
    expect(offer).toBeLessThan(100);
    expect(offer).toBeGreaterThan(85);
  });
});
