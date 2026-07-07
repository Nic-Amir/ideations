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
    expect(getZoneLabel(0, 'split')).toBe('Extreme +');
    expect(getZoneLabel(CORE_ZONE_INDEX, 'split')).toBe('Core');
    expect(getZoneColor(0, 'split')).toBe('#2323FF');
    expect(getMaxPayout('split')).toBe(37.58);
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

  test('isNearMiss detects core lands near micro boundary (split only)', () => {
    expect(isNearMiss(CORE_ZONE_INDEX, 0.39, 'split')).toBe(true);
    expect(isNearMiss(CORE_ZONE_INDEX, -0.42, 'split')).toBe(true);
    expect(isNearMiss(CORE_ZONE_INDEX, 0.2, 'split')).toBe(false);
    expect(isNearMiss(4, 0.7, 'split')).toBe(false);
    expect(isNearMiss(CORE_ZONE_INDEX, 0.39, 'simple')).toBe(false);
  });

  test('analytical RTP is within ±2% of 98%', () => {
    const rtp = computeAnalyticalRTP();
    expect(rtp).toBeGreaterThan(0.96);
    expect(rtp).toBeLessThan(1.0);
  });

  describe('simple mode (entry tier)', () => {
    test('simple is the default mode and hides advanced features', () => {
      expect(getPlinkoMode().id).toBe('simple');
      expect(getPlinkoMode('simple').supportsCalls).toBe(false);
      expect(getPlinkoMode('simple').supportsSessions).toBe(false);
      expect(getPlinkoMode('split').supportsCalls).toBe(true);
      expect(getPlinkoMode('split').supportsSessions).toBe(true);
      expect(getPlinkoMode('balanced').supportsCalls).toBe(true);
      expect(getPlinkoMode('balanced').supportsSessions).toBe(true);
    });

    test('simple wall has exactly two payout values: win outside ±1σ, refund inside', () => {
      const zones = getPlinkoConfig('simple').zones;
      expect(zones).toHaveLength(ZONE_COUNT);
      for (const zone of zones) {
        if (zone.minSigma >= 1) {
          expect(zone.payout).toBe(2.01);
        } else {
          expect(zone.payout).toBe(0.5);
        }
      }
    });

    test('simple zone resolution: |Z| < 1 refunds half, |Z| ≥ 1 doubles', () => {
      const zones = getPlinkoConfig('simple').zones;
      const sigmaEff = 0.05;
      const inside = resolveZone(0.7 * sigmaEff, sigmaEff, zones);
      expect(inside.payout).toBe(0.5);
      const outside = resolveZone(1.4 * sigmaEff, sigmaEff, zones);
      expect(outside.payout).toBe(2.01);
      const negOutside = resolveZone(-2.5 * sigmaEff, sigmaEff, zones);
      expect(negOutside.payout).toBe(2.01);
    });

    test('simple analytical RTP is near 98%', () => {
      // 0.5·P(|Z|<1) + 2.01·P(|Z|≥1) ≈ 0.979
      const rtp = computeAnalyticalRTP('simple');
      expect(rtp).toBeGreaterThan(0.97);
      expect(rtp).toBeLessThan(0.99);
    });
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

  describe('Monte Carlo RTP validation', () => {
    test(
      'terminal sampling matches stepped path RTP',
      () => {
        const terminal = computeSimulatedRTP(8_000);
        const steppedN = 1_000;
        let stepped = 0;
        for (let i = 0; i < steppedN; i++) {
          stepped += generateVolatilityRun().payout;
        }
        stepped /= steppedN;
        // Payout std ≈ 1.3 (fat-tailed ladder), so SE of the stepped mean is
        // ≈ 0.041 at N=1000; allow ~4σ to keep the consistency check stable.
        expect(Math.abs(terminal - stepped)).toBeLessThan(0.17);
      },
      60_000,
    );

    test.each(['simple', 'split', 'balanced'] as const)(
      '%s RTP is within ±1.5% of 98%',
      (modeId) => {
        const rtp = computeSimulatedRTP(80_000, modeId);
        expect(rtp).toBeGreaterThan(0.965);
        expect(rtp).toBeLessThan(0.995);
      },
    );
  });
});
