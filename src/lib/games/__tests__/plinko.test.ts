import { describe, test, expect } from 'vitest';
import {
  getPlinkoConfig,
  PLINKO_SETTLE_MS,
  PLINKO_PATH_ANIM_MS,
  generateGBMQuote,
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
  computeNetWinRate,
  isNetWin,
  isNearMiss,
  isMonotonicLadder,
  normalCDF,
  sampleTerminalLogReturn,
  ZONE_COUNT,
  CORE_ZONE_INDEX,
} from '../plinko';
import { PLINKO_MODE_IDS, getPlinkoMode } from '../plinko-modes';
import {
  createInitialGoalProgress,
  evaluateGoalProgress,
  formatSessionGoal,
  pickSessionGoals,
} from '../plinko-session-goals';
import {
  TARGET_GROUPS,
  TARGET_MARGIN,
  TARGET_PAYOUT_CAP,
  getTargetHitProbability,
  getTargetPayout,
  isTargetHit,
  groupForAbsZ,
} from '../plinko-target';

describe('Plinko Engine (European Multi-Barrier Option)', () => {
  test('plinko config exists with 11 barrier zones (split center)', () => {
    expect(getPlinkoConfig()).toBeDefined();
    expect(getPlinkoConfig().zones).toHaveLength(ZONE_COUNT);
  });

  test('targets 98% RTP', () => {
    expect(getPlinkoConfig().targetRTP).toBe(0.98);
  });

  test('uses 3600-tick path with calibrated sigma', () => {
    const config = getPlinkoConfig();
    expect(config.tickCount).toBe(3600);
    expect(config.sigma).toBe(0.35);
  });

  test('animation uses smooth path reveal timing', () => {
    const config = getPlinkoConfig();
    expect(PLINKO_PATH_ANIM_MS).toBe(1500);
    expect(PLINKO_SETTLE_MS).toBe(500);
    expect(config.tickCount * (PLINKO_PATH_ANIM_MS / config.tickCount) + PLINKO_SETTLE_MS).toBe(
      2000,
    );
  });

  test('zone label and color helpers resolve from zone index', () => {
    expect(getZoneLabel(0)).toBe('Extreme +');
    expect(getZoneLabel(CORE_ZONE_INDEX)).toBe('Core');
    expect(getZoneColor(0)).toBe('#2323FF');
    expect(getMaxPayout()).toBe(37.58);
  });

  test('GBM quote generates a positive number', () => {
    const quote = generateGBMQuote(10000, 0.5);
    expect(quote).toBeGreaterThan(0);
  });

  test('GBM quote stays in reasonable range', () => {
    let extremeCount = 0;
    for (let i = 0; i < 1000; i++) {
      const quote = generateGBMQuote(10000, 0.5, 0.01);
      if (quote < 5000 || quote > 20000) extremeCount++;
    }
    expect(extremeCount).toBeLessThan(50);
  });

  test('computeSigmaEff scales with sigma and tick count', () => {
    const s1 = computeSigmaEff(0.15, 8);
    const s2 = computeSigmaEff(0.35, 12);
    const s3 = computeSigmaEff(0.60, 16);
    expect(s1).toBeGreaterThan(0);
    expect(s2).toBeGreaterThan(s1);
    expect(s3).toBeGreaterThan(s2);
  });

  test('barrier price levels include 0.5σ split', () => {
    const levels = getBarrierPriceLevels(10000);
    expect(levels.some((l) => l.sigma === 0.5)).toBe(true);
    expect(levels.some((l) => l.sigma === -0.5)).toBe(true);
  });

  test('resolveZone maps Z-scores to split center', () => {
    const zones = getPlinkoConfig().zones;
    const sigmaEff = 0.05;

    const core = resolveZone(0.2 * sigmaEff, sigmaEff, zones);
    expect(core.zoneIndex).toBe(CORE_ZONE_INDEX);

    const micro = resolveZone(0.7 * sigmaEff, sigmaEff, zones);
    expect(micro.zoneIndex).toBe(4);

    const inner = resolveZone(1.5 * sigmaEff, sigmaEff, zones);
    expect(inner.zoneIndex).toBe(3);

    const negMicro = resolveZone(-0.7 * sigmaEff, sigmaEff, zones);
    expect(negMicro.zoneIndex).toBe(6);

    const extreme = resolveZone(5.0 * sigmaEff, sigmaEff, zones);
    expect(extreme.zoneIndex).toBe(0);
  });

  test('generateVolatilityRun returns correct structure', () => {
    const run = generateVolatilityRun();
    expect(run.quotes).toHaveLength(3601);
    expect(run.startPrice).toBe(10000);
    expect(run.endPrice).toBeGreaterThan(0);
    expect(typeof run.percentChange).toBe('number');
    expect(typeof run.zScore).toBe('number');
    expect(typeof run.zoneIndex).toBe('number');
    expect(typeof run.payout).toBe('number');
    expect(typeof run.isPositive).toBe('boolean');
  });

  test('payout is always non-negative', () => {
    for (let i = 0; i < 100; i++) {
      const run = generateVolatilityRun();
      expect(run.payout).toBeGreaterThanOrEqual(0);
    }
  });

  test('zone index is within valid range', () => {
    for (let i = 0; i < 100; i++) {
      const run = generateVolatilityRun();
      expect(run.zoneIndex).toBeGreaterThanOrEqual(0);
      expect(run.zoneIndex).toBeLessThan(ZONE_COUNT);
    }
  });

  test('zone probabilities sum to ~1', () => {
    const p = getZoneProbabilities();
    const total =
      p.core + 2 * (p.micro + p.inner + p.mid + p.outer + p.extreme);
    expect(total).toBeCloseTo(1, 2);
  });

  test('net win rate is above 50% with split center', () => {
    expect(computeNetWinRate()).toBeGreaterThan(0.5);
  });

  test('payout ladder is monotonic', () => {
    expect(isMonotonicLadder()).toBe(true);
  });

  test('isNetWin uses payout >= 1', () => {
    expect(isNetWin(0.23)).toBe(false);
    expect(isNetWin(1)).toBe(true);
    expect(isNetWin(1.2)).toBe(true);
  });

  test('isNearMiss detects core lands near micro boundary', () => {
    expect(isNearMiss(CORE_ZONE_INDEX, 0.39)).toBe(true);
    expect(isNearMiss(CORE_ZONE_INDEX, -0.42)).toBe(true);
    expect(isNearMiss(CORE_ZONE_INDEX, 0.2)).toBe(false);
    expect(isNearMiss(4, 0.7)).toBe(false);
  });

  test('analytical RTP is within ±2% of 98%', () => {
    const rtp = computeAnalyticalRTP();
    expect(rtp).toBeGreaterThan(0.96);
    expect(rtp).toBeLessThan(1.0);
  });

  describe('multi-mode pricing', () => {
    test('all modes expose configs', () => {
      for (const modeId of PLINKO_MODE_IDS) {
        expect(getPlinkoConfig(modeId).targetRTP).toBe(0.98);
        expect(getPlinkoConfig(modeId).tickCount).toBe(3600);
      }
    });

    test('stripes mode shares split ladder layout', () => {
      expect(getPlinkoConfig('balanced').zones).toHaveLength(11);
      expect(getPlinkoConfig('balanced').zones[0].label).toBe('Extreme +');
      expect(getPlinkoMode('balanced').chartStyle).toBe('ladder');
    });

    test('stripes payouts are not a monotonic ladder', () => {
      expect(isMonotonicLadder('balanced')).toBe(false);
    });

    test('stripes analytical RTP near target', () => {
      const rtp = computeAnalyticalRTP('balanced');
      expect(rtp).toBeGreaterThan(0.96);
      expect(rtp).toBeLessThan(1.0);
    });
  });

  describe('session goals', () => {
    test('goal generator offers two mode-aware goals', () => {
      const goals = pickSessionGoals('split', 10, 2);
      expect(goals).toHaveLength(2);
      expect(formatSessionGoal(goals[0])).toBeTruthy();
    });

    test('evaluateGoalProgress tracks net wins', () => {
      const goal = { kind: 'netWins' as const, target: 4 };
      const progress = evaluateGoalProgress(goal, {
        wins: 3,
        netPL: 10,
        bestPayout: 2,
        peakStreak: 2,
        minPayoutHits: 1,
      });
      expect(progress.current).toBe(3);
      expect(progress.met).toBe(false);
      const met = evaluateGoalProgress(goal, {
        wins: 4,
        netPL: 10,
        bestPayout: 2,
        peakStreak: 2,
        minPayoutHits: 1,
      });
      expect(met.met).toBe(true);
    });

    test('createInitialGoalProgress starts at zero', () => {
      const goal = { kind: 'jackpot' as const, threshold: 9 };
      const p = createInitialGoalProgress(goal);
      expect(p.current).toBe(0);
      expect(p.met).toBe(false);
    });
  });

  describe('target bet pricing', () => {
    test('hit probabilities sum to ~1 across all bands', () => {
      const total = TARGET_GROUPS.reduce(
        (sum, g) => sum + getTargetHitProbability(g),
        0,
      );
      expect(total).toBeCloseTo(1, 2);
    });

    test('payouts follow (1 - margin) / probability, capped', () => {
      for (const group of TARGET_GROUPS) {
        const p = getTargetHitProbability(group);
        const expected = Math.min(TARGET_PAYOUT_CAP, (1 - TARGET_MARGIN) / p);
        expect(getTargetPayout(group)).toBeCloseTo(expected, 1);
      }
    });

    test('target RTP equals 1 - margin for every uncapped band', () => {
      for (const group of TARGET_GROUPS) {
        const rtp = getTargetHitProbability(group) * getTargetPayout(group);
        if (getTargetPayout(group) < TARGET_PAYOUT_CAP) {
          expect(rtp).toBeGreaterThan(0.975);
          expect(rtp).toBeLessThan(0.985);
        } else {
          expect(rtp).toBeLessThanOrEqual(0.985);
        }
      }
    });

    test('rarer bands pay more', () => {
      expect(getTargetPayout('extreme')).toBeGreaterThan(getTargetPayout('outer'));
      expect(getTargetPayout('outer')).toBeGreaterThan(getTargetPayout('mid'));
      expect(getTargetPayout('mid')).toBeGreaterThan(getTargetPayout('inner'));
    });

    test('isTargetHit matches zone display groups on both sides', () => {
      // Split zones: index 5 is core, 4/6 micro, 3/7 inner, 0/10 extreme
      expect(isTargetHit('core', 5, 'split')).toBe(true);
      expect(isTargetHit('micro', 4, 'split')).toBe(true);
      expect(isTargetHit('micro', 6, 'split')).toBe(true);
      expect(isTargetHit('inner', 3, 'split')).toBe(true);
      expect(isTargetHit('inner', 7, 'split')).toBe(true);
      expect(isTargetHit('extreme', 0, 'split')).toBe(true);
      expect(isTargetHit('extreme', 10, 'split')).toBe(true);
      expect(isTargetHit('core', 0, 'split')).toBe(false);
      expect(isTargetHit('inner', 5, 'balanced')).toBe(false);
    });

    test('groupForAbsZ maps sigma distances to bands', () => {
      expect(groupForAbsZ(0.2)).toBe('core');
      expect(groupForAbsZ(0.7)).toBe('micro');
      expect(groupForAbsZ(1.5)).toBe('inner');
      expect(groupForAbsZ(2.5)).toBe('mid');
      expect(groupForAbsZ(3.5)).toBe('outer');
      expect(groupForAbsZ(6)).toBe('extreme');
    });

    test('Monte Carlo target RTP near 98% on inner band', () => {
      const payout = getTargetPayout('inner');
      const config = getPlinkoConfig('split');
      const sigmaEff = computeSigmaEff(config.sigma, config.tickCount);
      let total = 0;
      const n = 80_000;
      for (let i = 0; i < n; i++) {
        const logReturn = sampleTerminalLogReturn(config.sigma, config.tickCount);
        const { zoneIndex } = resolveZone(logReturn, sigmaEff, config.zones);
        total += isTargetHit('inner', zoneIndex, 'split') ? payout : 0;
      }
      const rtp = total / n;
      expect(rtp).toBeGreaterThan(0.92);
      expect(rtp).toBeLessThan(1.04);
    }, 60_000);
  });

  describe('Monte Carlo RTP validation', () => {
    test(
      'terminal sampling matches stepped path RTP',
      () => {
        const terminal = computeSimulatedRTP(8_000);
        let stepped = 0;
        for (let i = 0; i < 400; i++) {
          stepped += generateVolatilityRun().payout;
        }
        stepped /= 400;
        expect(Math.abs(terminal - stepped)).toBeLessThan(0.04);
      },
      60_000,
    );

    test.each(['split', 'balanced'] as const)(
      '%s RTP is within ±1.5% of 98%',
      (modeId) => {
        const rtp = computeSimulatedRTP(80_000, modeId);
        expect(rtp).toBeGreaterThan(0.965);
        expect(rtp).toBeLessThan(0.995);
      },
    );
  });
});
