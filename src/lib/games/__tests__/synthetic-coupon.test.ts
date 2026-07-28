'use strict';

import { describe, expect, it } from 'vitest';
import {
  applyCouponTick,
  canCashOutRound,
  centsToUsdt,
  getCouponPricing,
  isBreach,
  monteCarloCouponRtp,
  onePeriodExpectedValue,
  openCouponContract,
  settleCashOut,
  settleDefault,
  targetPeriodSurvival,
  usdtToCents,
  SYNTHETIC_COUPON_CONFIG,
  type CouponRoundState,
} from '../synthetic-coupon';

describe('money helpers', () => {
  it('rounds USDT to cents without float truncation', () => {
    expect(usdtToCents(9.62)).toBe(962);
    expect(centsToUsdt(962)).toBe(9.62);
  });
});

describe('pricing', () => {
  it('targets period survival from k and margin', () => {
    expect(targetPeriodSurvival(0.05, 0.02)).toBeCloseTo(0.98 / 1.05, 6);
  });

  it('locks coupon_cents and pricing_model at entry', () => {
    const view = getCouponPricing(10, 'standard');
    const locked = view.lockedPricing(1000);
    expect(locked.pricing_model).toBe('synthetic_coupon_period_notouch_v1');
    expect(locked.coupon_cents).toBe(50);
    expect(locked.platform_margin).toBe(SYNTHETIC_COUPON_CONFIG.margin);
    expect(locked.p_period_notouch).toBeGreaterThan(0.8);
    expect(locked.barrier_offset_log).toBeGreaterThan(0);
  });

  it('anchors one-period EV near −margin for each preset', () => {
    for (const id of ['near', 'standard', 'far'] as const) {
      const ev = onePeriodExpectedValue(10, id);
      expect(ev).toBeCloseTo(-SYNTHETIC_COUPON_CONFIG.margin, 2);
    }
  });
});

describe('round lifecycle', () => {
  it('opens an OPEN contract with platform-shaped fields', () => {
    const round = openCouponContract({
      stakeUsdt: 10,
      entrySpot: 100_000,
      periodTicks: 10,
      distanceId: 'standard',
    });
    expect(round.contract.status).toBe('OPEN');
    expect(round.contract.currency).toBe('USDT');
    expect(round.contract.contract_type).toBe('SYNTHETIC_COUPON');
    expect(round.contract.stake_cents).toBe(1000);
    expect(round.contract.locked_pricing.coupon_cents).toBe(50);
    expect(round.contract.parameters.upper_barrier).toBeGreaterThan(100_000);
    expect(round.contract.parameters.lower_barrier).toBeLessThan(100_000);
    expect(round.contract.settlement_data).toBeNull();
  });

  it('cash-out settles WON with stake + accrued', () => {
    let state = openCouponContract({
      stakeUsdt: 10,
      entrySpot: 100_000,
      periodTicks: 5,
      distanceId: 'far',
    });
    const mid =
      (state.contract.parameters.upper_barrier + state.contract.parameters.lower_barrier) / 2;
    state = {
      ...state,
      prices: [...state.prices, mid],
      accruedCents: state.contract.parameters.coupon_cents,
      periodsCompleted: 1,
    };
    const settled = settleCashOut(state);
    expect(settled.contract.status).toBe('WON');
    expect(settled.contract.settlement_data?.reason).toBe('cash_out');
    expect(settled.contract.settlement_data?.payout_cents).toBe(
      1000 + state.contract.parameters.coupon_cents,
    );
    expect(settled.contract.payout_amount).toBe(
      centsToUsdt(1000 + state.contract.parameters.coupon_cents),
    );
  });

  it('breach settles LOST with zero payout', () => {
    const round = openCouponContract({
      stakeUsdt: 10,
      entrySpot: 100_000,
      periodTicks: 10,
      distanceId: 'near',
    });
    const upper = round.contract.parameters.upper_barrier;
    expect(isBreach(upper, upper, round.contract.parameters.lower_barrier)).toBe('upper');

    const forcedPrices = [...round.prices, upper * 1.01];
    const lost = settleDefault(round, forcedPrices, 'upper');
    expect(lost.contract.status).toBe('LOST');
    expect(lost.contract.payout_amount).toBe(0);
    expect(lost.contract.settlement_data?.breach_side).toBe('upper');
  });
});

describe('cash-out gate', () => {
  it('rejects cash-out before the first tick', () => {
    const round = openCouponContract({
      stakeUsdt: 10,
      entrySpot: 100_000,
      periodTicks: 10,
      distanceId: 'standard',
    });
    expect(canCashOutRound(round)).toBe(false);
    const rejected = settleCashOut(round);
    expect(rejected.contract.status).toBe('OPEN');
    expect(rejected.contract.settlement_data).toBeNull();
  });

  it('allows cash-out after one survived tick', () => {
    let state = openCouponContract({
      stakeUsdt: 10,
      entrySpot: 100_000,
      periodTicks: 10,
      distanceId: 'far',
    });
    // Inject a safe in-corridor tick without GBM randomness.
    const mid =
      (state.contract.parameters.upper_barrier + state.contract.parameters.lower_barrier) / 2;
    state = { ...state, prices: [...state.prices, mid] };
    expect(canCashOutRound(state)).toBe(true);
    const settled = settleCashOut(state);
    expect(settled.contract.status).toBe('WON');
    expect(settled.contract.payout_amount).toBe(10);
  });
});

describe('coupon cents', () => {
  it('never locks a zero coupon for valid stakes', () => {
    const view = getCouponPricing(10, 'far');
    expect(view.lockedPricing(10).coupon_cents).toBeGreaterThanOrEqual(1);
    expect(view.couponUsdt(0.1)).toBe(centsToUsdt(view.lockedPricing(10).coupon_cents));
  });
});

describe('tick loop smoke', () => {
  it('either accrues, continues, or defaults within a long horizon', () => {
    let state: CouponRoundState = openCouponContract({
      stakeUsdt: 10,
      entrySpot: SYNTHETIC_COUPON_CONFIG.s0,
      periodTicks: 5,
      distanceId: 'standard',
    });

    let defaults = 0;
    for (let i = 0; i < 200; i++) {
      const result = applyCouponTick(state);
      if (result.kind === 'default') {
        defaults += 1;
        expect(result.state.contract.status).toBe('LOST');
        break;
      }
      if (result.kind === 'auto_cash_out') {
        expect(result.state.contract.status).toBe('WON');
        break;
      }
      state = result.state;
    }

    expect(defaults + (state.contract.status === 'OPEN' ? 1 : 0) + (state.contract.status === 'WON' ? 1 : 0)).toBeGreaterThan(0);
    if (state.periodsCompleted > 0 && state.contract.status === 'OPEN') {
      expect(state.accruedCents).toBe(
        state.periodsCompleted * state.contract.parameters.coupon_cents,
      );
    }
  });
});

describe('Monte Carlo RTP', () => {
  it('after_one_period RTP is within ~1.5% of 1 − margin (8k paths)', () => {
    const n = 8_000;
    const target = 1 - SYNTHETIC_COUPON_CONFIG.margin;
    const mc = monteCarloCouponRtp(n, { kind: 'after_one_period' }, 10, 'standard');
    expect(Math.abs(mc.meanRtp - target)).toBeLessThan(0.015 + 3 * mc.seRtp);
    expect(mc.defaultRate).toBeGreaterThan(0);
    expect(mc.defaultRate).toBeLessThan(0.25);
  }, 60_000);

  it('after_n_periods(3) mean RTP stays below 1 (4k paths)', () => {
    const mc = monteCarloCouponRtp(4_000, { kind: 'after_n_periods', n: 3 }, 10, 'standard');
    // Fixed C does not reprice to V, so multi-period RTP compounds below the
    // one-period ~98% anchor (empirically ~0.65–0.75 for n=3).
    expect(mc.meanRtp).toBeLessThan(1);
    expect(mc.meanRtp).toBeGreaterThan(0.5);
    expect(mc.defaultRate).toBeGreaterThan(0.05);
  }, 90_000);
});
