import { describe, test, expect } from 'vitest';
import {
  CALLABLE_GROUPS,
  CALL_RTP,
  CALL_STAKE_FRACTION,
  getCallProbability,
  getCallOdds,
  getCallStake,
  buildShotCall,
  isCallHit,
  settleCall,
} from '../plinko-call';
import {
  getPlinkoConfig,
  sampleTerminalLogReturn,
  computeSigmaEff,
  resolveZoneForMode,
} from '../plinko';
import { PLINKO_MODE_IDS } from '../plinko-modes';

describe('Plinko call-your-shot pricing', () => {
  test('band probabilities cover the full distribution', () => {
    const total = CALLABLE_GROUPS.reduce(
      (sum, g) => sum + getCallProbability(g),
      0,
    );
    expect(total).toBeCloseTo(1, 6);
  });

  test('every callable band has positive probability and odds above 1', () => {
    for (const group of CALLABLE_GROUPS) {
      expect(getCallProbability(group)).toBeGreaterThan(0);
      expect(getCallOdds(group)).toBeGreaterThan(1);
    }
  });

  test('odds are floored to 2 decimals and never exceed target RTP', () => {
    for (const group of CALLABLE_GROUPS) {
      const odds = getCallOdds(group);
      // Two-decimal check tolerant of floating-point representation.
      expect(Math.abs(odds * 100 - Math.round(odds * 100))).toBeLessThan(1e-6);
      const rtp = getCallProbability(group) * odds;
      // Flooring can only reduce RTP, by at most 0.01 × p.
      expect(rtp).toBeLessThanOrEqual(CALL_RTP + 1e-9);
      expect(rtp).toBeGreaterThan(CALL_RTP - 0.011);
    }
  });

  test('call stake is a rounded fraction of the main stake, minimum 1', () => {
    expect(getCallStake(100)).toBe(Math.round(100 * CALL_STAKE_FRACTION));
    expect(getCallStake(1)).toBe(1);
    expect(getCallStake(10)).toBe(Math.max(1, Math.round(10 * CALL_STAKE_FRACTION)));
  });

  test('buildShotCall snapshots group, stake and odds', () => {
    const call = buildShotCall('inner', 200);
    expect(call.group).toBe('inner');
    expect(call.stake).toBe(getCallStake(200));
    expect(call.odds).toBe(getCallOdds('inner'));
  });

  test('call hit resolves via landing zone display group in both modes', () => {
    for (const modeId of PLINKO_MODE_IDS) {
      const zones = getPlinkoConfig(modeId).zones;
      zones.forEach((zone, idx) => {
        expect(isCallHit(zone.displayGroup, idx, modeId)).toBe(true);
        const other = CALLABLE_GROUPS.find((g) => g !== zone.displayGroup)!;
        expect(isCallHit(other, idx, modeId)).toBe(false);
      });
    }
  });

  test('settleCall pays stake × odds on hit and loses stake on miss', () => {
    const call = buildShotCall('core', 100);
    const zones = getPlinkoConfig('split').zones;
    const coreIdx = zones.findIndex((z) => z.displayGroup === 'core');
    const edgeIdx = zones.findIndex((z) => z.displayGroup === 'extreme');

    const hit = settleCall(call, coreIdx, 'split');
    expect(hit.hit).toBe(true);
    expect(hit.winAmount).toBeCloseTo(call.stake * call.odds, 6);
    expect(hit.net).toBeCloseTo(call.stake * call.odds - call.stake, 6);

    const miss = settleCall(call, edgeIdx, 'split');
    expect(miss.hit).toBe(false);
    expect(miss.winAmount).toBe(0);
    expect(miss.net).toBe(-call.stake);
  });

  test('Monte Carlo: band hit rates match closed-form probabilities within 3σ (100K runs)', () => {
    const modeId = 'split';
    const config = getPlinkoConfig(modeId);
    const sigmaEff = computeSigmaEff(config.sigma, config.tickCount);
    const n = 100_000;

    const hits: Record<string, number> = {};
    for (const g of CALLABLE_GROUPS) hits[g] = 0;

    for (let i = 0; i < n; i++) {
      const logReturn = sampleTerminalLogReturn(config.sigma, config.tickCount);
      const { zoneIndex } = resolveZoneForMode(modeId, logReturn, sigmaEff, config.zones);
      const group = config.zones[zoneIndex].displayGroup;
      hits[group] += 1;
    }

    // Skip ultra-rare bands (outer/extreme) — their MC error dominates at 100K.
    for (const group of ['core', 'micro', 'inner', 'mid'] as const) {
      const p = getCallProbability(group);
      const observed = hits[group] / n;
      const se = Math.sqrt((p * (1 - p)) / n);
      expect(Math.abs(observed - p)).toBeLessThanOrEqual(3 * se + 1e-9);
    }
  });

  test('Monte Carlo: side-bet RTP lands near 98% (100K runs, core call)', () => {
    const modeId = 'split';
    const config = getPlinkoConfig(modeId);
    const sigmaEff = computeSigmaEff(config.sigma, config.tickCount);
    const call = buildShotCall('core', 100);
    const n = 100_000;

    let totalReturned = 0;
    for (let i = 0; i < n; i++) {
      const logReturn = sampleTerminalLogReturn(config.sigma, config.tickCount);
      const { zoneIndex } = resolveZoneForMode(modeId, logReturn, sigmaEff, config.zones);
      totalReturned += settleCall(call, zoneIndex, modeId).winAmount;
    }

    const rtp = totalReturned / (n * call.stake);
    const p = getCallProbability('core');
    const se = Math.sqrt((p * (1 - p)) / n) * call.odds;
    expect(Math.abs(rtp - p * call.odds)).toBeLessThanOrEqual(3 * se);
    expect(rtp).toBeGreaterThan(0.9);
    expect(rtp).toBeLessThan(1.05);
  });
});
