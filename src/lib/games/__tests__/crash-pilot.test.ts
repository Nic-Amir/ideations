'use strict';

import { describe, it, expect } from 'vitest';
import {
  CRASH_HOUSE_EDGE,
  MAX_MULTIPLIER,
  applyTick,
  getDisplayedMultiplier,
  getFairMultiplier,
  getMilestoneTable,
  getPerTickCrashProbability,
  getSurvivalProbability,
  getTicksToReachMultiplier,
  isCrashTick,
} from '../crash-pilot';

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
  it('fair multiplier is 1 at zero ticks', () => {
    expect(getFairMultiplier(0, 300)).toBe(1);
  });

  it('fair multiplier follows geometric survival inverse', () => {
    const p = getPerTickCrashProbability(300);
    expect(getFairMultiplier(10, 300)).toBeCloseTo(Math.pow(1 - p, -10), 12);
    expect(getFairMultiplier(300, 300)).toBeCloseTo(Math.pow(1 - 1 / 300, -300), 12);
  });

  it('displayed multiplier applies exactly the house edge', () => {
    const fair = getFairMultiplier(50, 500);
    expect(getDisplayedMultiplier(50, 500)).toBeCloseTo(fair * (1 - CRASH_HOUSE_EDGE), 12);
  });

  it('displayed multiplier never dips below 1 early in the round', () => {
    expect(getDisplayedMultiplier(0, 1000)).toBe(1);
    expect(getDisplayedMultiplier(1, 1000)).toBe(1);
  });

  it('displayed multiplier is capped', () => {
    expect(getDisplayedMultiplier(10_000, 300)).toBe(MAX_MULTIPLIER);
  });

  it('RTP equals 1 minus house edge at any cashout point', () => {
    // expected payout per unit staked = survival(k) * displayedMult(k)
    for (const n of [300, 500, 1000]) {
      for (const k of [1, 10, 100, 500]) {
        const displayed = getDisplayedMultiplier(k, n);
        if (displayed >= MAX_MULTIPLIER) continue; // cap only lowers RTP
        if (displayed <= 1) continue; // floor-at-1 raises RTP for very early cashouts
        const rtp = getSurvivalProbability(k, n) * displayed;
        expect(rtp).toBeCloseTo(1 - CRASH_HOUSE_EDGE, 10);
      }
    }
  });
});

describe('ticks to reach a target multiplier', () => {
  it('is exact at the boundary tick', () => {
    for (const n of [300, 500, 1000]) {
      for (const target of [1.5, 2, 5, 10]) {
        const k = getTicksToReachMultiplier(target, n);
        expect(getDisplayedMultiplier(k, n)).toBeGreaterThanOrEqual(target);
        expect(getDisplayedMultiplier(k - 1, n)).toBeLessThan(target);
      }
    }
  });

  it('returns 0 for targets at or below 1', () => {
    expect(getTicksToReachMultiplier(1, 300)).toBe(0);
    expect(getTicksToReachMultiplier(0.5, 300)).toBe(0);
  });

  it('returns Infinity above the cap', () => {
    expect(getTicksToReachMultiplier(MAX_MULTIPLIER + 1, 300)).toBe(Infinity);
  });
});

describe('applyTick', () => {
  it('increments survived ticks and multiplier on an up tick', () => {
    const out = applyTick(8000, 8000.05, 4, 300, null);
    expect(out.crashed).toBe(false);
    expect(out.ticksSurvived).toBe(5);
    expect(out.multiplier).toBeCloseTo(getDisplayedMultiplier(5, 300), 12);
    expect(out.autoCashedOut).toBe(false);
  });

  it('busts on a crash tick and freezes the tick count', () => {
    const out = applyTick(8000, 7940, 12, 300, null);
    expect(out.crashed).toBe(true);
    expect(out.ticksSurvived).toBe(12);
    expect(out.autoCashedOut).toBe(false);
  });

  it('crash beats auto-cashout on the same tick', () => {
    // Target already reachable next tick, but the tick is a crash.
    const ticksAtTarget = getTicksToReachMultiplier(1.05, 300);
    const out = applyTick(8000, 7940, ticksAtTarget - 1, 300, 1.05);
    expect(out.crashed).toBe(true);
    expect(out.autoCashedOut).toBe(false);
  });

  it('triggers auto-cashout at the exact tick the target is reached', () => {
    const target = 1.5;
    const k = getTicksToReachMultiplier(target, 500);
    const before = applyTick(8000, 8000.01, k - 2, 500, target);
    expect(before.autoCashedOut).toBe(false);
    const at = applyTick(8000, 8000.01, k - 1, 500, target);
    expect(at.autoCashedOut).toBe(true);
    expect(at.multiplier).toBeGreaterThanOrEqual(target);
  });

  it('ignores auto-cashout targets below the minimum cashout', () => {
    const out = applyTick(8000, 8000.01, 100, 300, 1.0);
    expect(out.autoCashedOut).toBe(false);
  });
});

describe('milestone table', () => {
  it('is monotonically increasing in ticks and decreasing in survival', () => {
    const table = getMilestoneTable(500).filter((m) => Number.isFinite(m.ticks));
    for (let i = 1; i < table.length; i++) {
      expect(table[i].ticks).toBeGreaterThan(table[i - 1].ticks);
      expect(table[i].survivalProb).toBeLessThan(table[i - 1].survivalProb);
    }
  });

  it('faster indices reach targets in fewer ticks', () => {
    const fast = getMilestoneTable(300);
    const slow = getMilestoneTable(1000);
    const idx = fast.findIndex((m) => m.multiplier === 2);
    expect(fast[idx].ticks).toBeLessThan(slow[idx].ticks);
  });
});
