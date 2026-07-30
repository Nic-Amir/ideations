'use strict';

import { describe, expect, it } from 'vitest';
import {
  CORRIDOR_CONFIG,
  DISTANCE_PRESETS,
  DURATION_OPTIONS,
  PICK_LABELS,
  PRICING_MODEL,
  centsToUsdt,
  computeBarriers,
  expectedValue,
  generateCorridorPath,
  getCorridorPricing,
  getDistancePreset,
  monteCarloCorridor,
  openCorridorContract,
  payoutCentsFromMult,
  settleCorridorContract,
  usdtToCents,
} from '../corridor';

describe('money helpers', () => {
  it('rounds USDT to cents without float truncation', () => {
    expect(usdtToCents(9.62)).toBe(962);
    expect(centsToUsdt(962)).toBe(9.62);
  });

  it('floors payout cents from stake × mult', () => {
    expect(payoutCentsFromMult(1000, 1.94)).toBe(1940);
    expect(payoutCentsFromMult(100, 1.88)).toBe(188);
    expect(payoutCentsFromMult(333, 1.5)).toBe(499);
  });
});

describe('pricing', () => {
  it('locks dual-side probs and mults with corridor pricing model', () => {
    const view = getCorridorPricing(10, 'standard');
    const locked = view.lockedPricing('stay');
    expect(locked.pricing_model).toBe(PRICING_MODEL);
    expect(locked.platform_margin).toBe(CORRIDOR_CONFIG.margin);
    expect(locked.p_stay + locked.p_goes).toBeCloseTo(1, 10);
    expect(locked.mult_stay).toBeGreaterThan(1);
    expect(locked.mult_goes).toBeGreaterThan(1);
    expect(locked.pick).toBe('stay');
    expect(locked.barrier_offset_log).toBeGreaterThan(0);
  });

  it('calibrates standard distance near 50/50 Stay vs Goes', () => {
    for (const ticks of DURATION_OPTIONS) {
      const view = getCorridorPricing(ticks, 'standard');
      expect(view.pStay).toBeCloseTo(0.5, 2);
      expect(view.pGoes).toBeCloseTo(0.5, 2);
    }
  });

  it('moves Stay/Goes odds in opposite directions with distance presets', () => {
    const near = getCorridorPricing(10, 'near');
    const standard = getCorridorPricing(10, 'standard');
    const far = getCorridorPricing(10, 'far');

    expect(near.pStay).toBeLessThan(standard.pStay);
    expect(far.pStay).toBeGreaterThan(standard.pStay);
    expect(near.multStay).toBeGreaterThan(far.multStay);
    expect(near.multGoes).toBeLessThan(far.multGoes);
  });

  it('anchors EV near −margin for both sides after rounding', () => {
    for (const ticks of DURATION_OPTIONS) {
      for (const preset of DISTANCE_PRESETS) {
        for (const pick of ['stay', 'goes'] as const) {
          const ev = expectedValue(ticks, preset.id, pick);
          expect(ev).toBeLessThan(0);
          expect(ev).toBeCloseTo(-CORRIDOR_CONFIG.margin, 1);
        }
      }
    }
  });

  it('exposes board labels for Inside / Outside', () => {
    expect(PICK_LABELS.stay.board).toBe('Inside');
    expect(PICK_LABELS.goes.board).toBe('Outside');
    expect(getDistancePreset('near').factor).toBe(0.75);
  });
});

describe('barriers', () => {
  it('are log-symmetric around the entry spot', () => {
    const { upper, lower } = computeBarriers(100_000, 0.001);
    expect(upper).toBeCloseTo(100_000 * Math.exp(0.001), 6);
    expect(lower).toBeCloseTo(100_000 * Math.exp(-0.001), 6);
    expect(upper * lower).toBeCloseTo(100_000 ** 2, 0);
  });
});

describe('path + settlement', () => {
  it('opens an OPEN contract with platform-shaped fields and a path', () => {
    const round = openCorridorContract({
      stakeUsdt: 10,
      pick: 'stay',
      ticks: 10,
      distanceId: 'standard',
    });
    expect(round.contract.status).toBe('OPEN');
    expect(round.contract.currency).toBe('USDT');
    expect(round.contract.contract_type).toBe('CORRIDOR');
    expect(round.contract.stake_cents).toBe(1000);
    expect(round.contract.locked_pricing.pick).toBe('stay');
    expect(round.contract.parameters.upper_barrier).toBeGreaterThan(100_000);
    expect(round.contract.parameters.lower_barrier).toBeLessThan(100_000);
    expect(round.contract.settlement_data).toBeNull();
    expect(round.path.prices[0]).toBe(100_000);
  });

  it('Stay wins on no-touch; Goes loses', () => {
    const round = openCorridorContract({
      stakeUsdt: 10,
      pick: 'stay',
      ticks: 5,
      distanceId: 'far',
    });
    // Force a no-touch path for deterministic settle.
    const forced = {
      ...round,
      path: {
        ...round.path,
        prices: [100_000, 100_010, 99_990, 100_005, 99_995, 100_000],
        touched: null,
        touchTick: null,
        settleTick: 5,
      },
    };
    const settled = settleCorridorContract(forced);
    expect(settled.contract.status).toBe('WON');
    expect(settled.contract.settlement_data?.outcome).toBe('WON');
    expect(settled.contract.settlement_data?.touched).toBeNull();
    expect(settled.contract.settlement_data?.payout_cents).toBe(
      payoutCentsFromMult(1000, forced.contract.parameters.locked_multiplier),
    );

    const goesOpen = openCorridorContract({
      stakeUsdt: 10,
      pick: 'goes',
      ticks: 5,
      distanceId: 'far',
    });
    const goesSettled = settleCorridorContract({
      ...goesOpen,
      path: forced.path,
    });
    expect(goesSettled.contract.status).toBe('LOST');
    expect(goesSettled.contract.settlement_data?.payout_cents).toBe(0);
  });

  it('Goes wins on first touch; Stay loses', () => {
    const stay = openCorridorContract({
      stakeUsdt: 10,
      pick: 'stay',
      ticks: 10,
      distanceId: 'near',
    });
    const upper = stay.contract.parameters.upper_barrier;
    const forced = {
      ...stay,
      path: {
        ...stay.path,
        prices: [100_000, upper],
        touched: 'upper' as const,
        touchTick: 1,
        settleTick: 1,
        upper,
        lower: stay.contract.parameters.lower_barrier,
      },
    };
    expect(settleCorridorContract(forced).contract.status).toBe('LOST');

    const goes = openCorridorContract({
      stakeUsdt: 10,
      pick: 'goes',
      ticks: 10,
      distanceId: 'near',
    });
    const goesForced = {
      ...goes,
      path: forced.path,
    };
    const settled = settleCorridorContract(goesForced);
    expect(settled.contract.status).toBe('WON');
    expect(settled.contract.settlement_data?.touched).toBe('upper');
    expect(settled.contract.settlement_data?.payout_cents).toBeGreaterThan(0);
  });

  it('generateCorridorPath stops at first touch or runs to maturity', () => {
    const pricing = getCorridorPricing(10, 'standard');
    const { upper, lower } = computeBarriers(100_000, pricing.offsetLog);
    for (let i = 0; i < 40; i++) {
      const path = generateCorridorPath(100_000, upper, lower, 10);
      expect(path.prices[0]).toBe(100_000);
      expect(path.prices.length).toBe(path.settleTick + 1);
      if (path.touched !== null) {
        expect(path.settleTick).toBeLessThanOrEqual(10);
      } else {
        expect(path.settleTick).toBe(10);
      }
    }
  });
});

describe('monte carlo', () => {
  it('grid pStay tracks path fraction within sampling noise', () => {
    const mc = monteCarloCorridor(2_000, 10, 'standard');
    expect(Math.abs(mc.pStay - mc.gridPStay)).toBeLessThan(0.05);
  }, 30_000);
});
