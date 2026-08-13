'use strict';

import { describe, it, expect } from 'vitest';
import {
  MAX_MULTIPLIER,
  applyTick,
  getDisplayedMultiplier,
  getGrowthMultiplier,
  getMilestoneTable,
  getPerTickCrashProbability,
  getProcessRtp,
  getSurvivalProbability,
  getTicksToReachMultiplier,
  isCrashTick,
} from '../index-ascent';

describe('crash detection', () => {
  it('flags a relative drop as a crash', () => {
    expect(isCrashTick(8000, 7950)).toBe(true); // -0.625%
    expect(isCrashTick(8000, 7999.9)).toBe(true); // small but real drop
  });

  it('does not flag upward or flat ticks', () => {
    expect(isCrashTick(8000, 8000.07)).toBe(false);
    expect(isCrashTick(8000, 8000)).toBe(false);
  });

  it('handles invalid quotes safely', () => {
    expect(isCrashTick(NaN, 8000)).toBe(false);
    expect(isCrashTick(0, 8000)).toBe(false);
    expect(isCrashTick(8000, NaN)).toBe(false);
  });
});

describe('multiplier math', () => {
  it('growth multiplier is 1 at zero ticks', () => {
    expect(getGrowthMultiplier(0, 0.05)).toBe(1);
  });

  it('growth multiplier follows (1+g)^k', () => {
    expect(getGrowthMultiplier(10, 0.01)).toBeCloseTo(Math.pow(1.01, 10), 12);
    expect(getGrowthMultiplier(5, 0.05)).toBeCloseTo(Math.pow(1.05, 5), 12);
    expect(getGrowthMultiplier(3, 0.1)).toBeCloseTo(Math.pow(1.1, 3), 12);
  });

  it('displayed multiplier equals growth with no separate edge', () => {
    expect(getDisplayedMultiplier(10, 0.05)).toBeCloseTo(Math.pow(1.05, 10), 12);
  });

  it('displayed multiplier is 1 at entry', () => {
    expect(getDisplayedMultiplier(0, 0.01)).toBe(1);
  });

  it('displayed multiplier is capped', () => {
    expect(getDisplayedMultiplier(10_000, 0.1)).toBe(MAX_MULTIPLIER);
  });

  it('process RTP equals [(1-p)(1+g)]^k when uncapped', () => {
    const instruments = [
      { n: 100, g: 0.01 },
      { n: 20, g: 0.05 },
      { n: 10, g: 0.1 },
    ];
    for (const { n, g } of instruments) {
      for (const k of [1, 5, 10, 20]) {
        const displayed = getDisplayedMultiplier(k, g);
        if (displayed >= MAX_MULTIPLIER) continue;
        const rtp = getSurvivalProbability(k, n) * displayed;
        expect(rtp).toBeCloseTo(getProcessRtp(k, n, g), 10);
        expect(rtp).toBeCloseTo(Math.pow((1 - 1 / n) * (1 + g), k), 10);
      }
    }
  });
});

describe('ticks to reach a target multiplier', () => {
  it('is exact at the boundary tick', () => {
    for (const g of [0.01, 0.05, 0.1]) {
      for (const target of [1.5, 2, 5, 10]) {
        const k = getTicksToReachMultiplier(target, g);
        expect(getDisplayedMultiplier(k, g)).toBeGreaterThanOrEqual(target);
        expect(getDisplayedMultiplier(k - 1, g)).toBeLessThan(target);
      }
    }
  });

  it('returns 0 for targets at or below 1', () => {
    expect(getTicksToReachMultiplier(1, 0.05)).toBe(0);
    expect(getTicksToReachMultiplier(0.5, 0.05)).toBe(0);
  });

  it('returns Infinity above the cap', () => {
    expect(getTicksToReachMultiplier(MAX_MULTIPLIER + 1, 0.05)).toBe(Infinity);
  });
});

describe('applyTick', () => {
  it('increments survived ticks and multiplier on an up tick', () => {
    const out = applyTick(8000, 8000.05, 4, 0.05, null);
    expect(out.crashed).toBe(false);
    expect(out.ticksSurvived).toBe(5);
    expect(out.multiplier).toBeCloseTo(getDisplayedMultiplier(5, 0.05), 12);
    expect(out.autoCashedOut).toBe(false);
  });

  it('busts on a crash tick and freezes the tick count', () => {
    const out = applyTick(8000, 7940, 12, 0.05, null);
    expect(out.crashed).toBe(true);
    expect(out.ticksSurvived).toBe(12);
    expect(out.autoCashedOut).toBe(false);
  });

  it('crash beats auto-cashout on the same tick', () => {
    const ticksAtTarget = getTicksToReachMultiplier(1.05, 0.05);
    const out = applyTick(8000, 7940, ticksAtTarget - 1, 0.05, 1.05);
    expect(out.crashed).toBe(true);
    expect(out.autoCashedOut).toBe(false);
  });

  it('triggers auto-cashout at the exact tick the target is reached', () => {
    const target = 1.5;
    const g = 0.05;
    const k = getTicksToReachMultiplier(target, g);
    const before = applyTick(8000, 8000.01, k - 2, g, target);
    expect(before.autoCashedOut).toBe(false);
    const at = applyTick(8000, 8000.01, k - 1, g, target);
    expect(at.autoCashedOut).toBe(true);
    expect(at.multiplier).toBeGreaterThanOrEqual(target);
  });

  it('ignores auto-cashout targets below the minimum cashout', () => {
    const out = applyTick(8000, 8000.01, 100, 0.05, 1.0);
    expect(out.autoCashedOut).toBe(false);
  });
});

describe('milestone table', () => {
  it('is monotonically increasing in ticks and decreasing in survival', () => {
    const table = getMilestoneTable(20, 0.05).filter((m) => Number.isFinite(m.ticks));
    for (let i = 1; i < table.length; i++) {
      expect(table[i].ticks).toBeGreaterThan(table[i - 1].ticks);
      expect(table[i].survivalProb).toBeLessThan(table[i - 1].survivalProb);
    }
  });

  it('faster growth reaches targets in fewer ticks', () => {
    const slow = getMilestoneTable(100, 0.01);
    const fast = getMilestoneTable(10, 0.1);
    const idx = fast.findIndex((m) => m.multiplier === 2);
    expect(fast[idx].ticks).toBeLessThan(slow[idx].ticks);
  });

  it('per-tick crash probability matches house-rounded N', () => {
    expect(getPerTickCrashProbability(100)).toBeCloseTo(0.01, 12);
    expect(getPerTickCrashProbability(20)).toBeCloseTo(0.05, 12);
    expect(getPerTickCrashProbability(10)).toBeCloseTo(0.1, 12);
  });
});
