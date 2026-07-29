'use strict';

/**
 * Synthetic Coupon — product engine.
 *
 * Mechanics and contract shapes follow docs/games/synthetic-coupon/product_spec.md
 * and trading-game platform_standard (locked_pricing, settlement_data, integer cents,
 * status OPEN → WON | LOST). Client-side POC only; settlement is non-authoritative.
 */

import {
  noTouchProbability,
  normCdf,
} from '@/lib/games/barrier-predictor';

// --- Config -----------------------------------------------------------------

export interface SyntheticCouponConfig {
  s0: number;
  sigma: number;
  dtYears: number;
  /** Platform margin used in one-period EV anchor. */
  margin: number;
  instrument: string;
}

export const SYNTHETIC_COUPON_CONFIG: SyntheticCouponConfig = {
  s0: 100_000,
  sigma: 1.0,
  dtYears: 1 / (365 * 24 * 3600),
  margin: 0.02,
  instrument: 'V_100',
};

export const PERIOD_OPTIONS = [5, 10, 15] as const;
export type PeriodTicks = (typeof PERIOD_OPTIONS)[number];

export type DistancePresetId = 'near' | 'standard' | 'far';

export interface DistancePreset {
  id: DistancePresetId;
  label: string;
  /** Coupon rate k = C / stake. */
  couponRateK: number;
  tag: string;
}

export const DISTANCE_PRESETS: DistancePreset[] = [
  { id: 'near', label: 'Near', couponRateK: 0.08, tag: 'Higher coupon' },
  { id: 'standard', label: 'Standard', couponRateK: 0.05, tag: 'Balanced' },
  { id: 'far', label: 'Far', couponRateK: 0.03, tag: 'Wider corridor' },
];

export function getDistancePreset(id: DistancePresetId): DistancePreset {
  return DISTANCE_PRESETS.find((p) => p.id === id) ?? DISTANCE_PRESETS[1];
}

export const COUPON_TICK_MS = 400;
export const IDLE_TICK_MS = 500;
export const PREVIEW_WINDOW = 48;
/** Chart/settlement keep at most this many prices (open-ended rounds). */
export const MAX_PATH_TICKS = 480;
/** Soft horizon: auto cash-out if still alive (avoids unbounded sessions). */
export const MAX_ROUND_TICKS = 360;
export const PRICING_MODEL = 'synthetic_coupon_period_notouch_v1';
/** Must earn at least one coupon before cash-out (blocks free cancel + pre-coupon bail). */
export const MIN_COUPONS_BEFORE_CASHOUT = 1;

// --- Money (platform_standard §23.7) ----------------------------------------

/** USDT → integer cents with banker's-friendly round (Round half away via Math.round). */
export function usdtToCents(usdt: number): number {
  return Math.round(usdt * 100);
}

export function centsToUsdt(cents: number): number {
  return cents / 100;
}

// --- Randomness -------------------------------------------------------------

function boxMullerTransform(): number {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  const u1 = (buf[0] + 1) / (0xffffffff + 2);
  const u2 = (buf[1] + 1) / (0xffffffff + 2);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// --- Pricing ----------------------------------------------------------------

function perTickDriftSigma(config: SyntheticCouponConfig): number {
  return -0.5 * config.sigma * Math.sqrt(config.dtYears);
}

export function perTickSigma(config: SyntheticCouponConfig = SYNTHETIC_COUPON_CONFIG): number {
  return config.sigma * Math.sqrt(config.dtYears);
}

/** Target period no-touch prob for EV = −margin with coupon rate k. */
export function targetPeriodSurvival(k: number, margin: number): number {
  return (1 - margin) / (1 + k);
}

const BISECTION_ITERATIONS = 28;
const offsetCache = new Map<string, number>();

/**
 * Barrier offset in per-tick σ units such that P(no-touch over `ticks`) ≈ targetP.
 */
export function offsetSigmaForSurvival(
  ticks: number,
  targetP: number,
  muSigma = 0,
): number {
  const key = `${ticks}|${targetP.toFixed(6)}|${muSigma.toFixed(6)}`;
  const cached = offsetCache.get(key);
  if (cached !== undefined) return cached;

  const clamped = Math.min(0.999, Math.max(0.01, targetP));
  let lo = 0.15;
  let hi = 20;
  for (let i = 0; i < BISECTION_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    if (noTouchProbability(mid, ticks, muSigma) < clamped) lo = mid;
    else hi = mid;
  }
  const x = (lo + hi) / 2;
  offsetCache.set(key, x);
  return x;
}

export interface CouponLockedPricing {
  pricing_model: typeof PRICING_MODEL;
  platform_margin: number;
  sigma: number;
  dt_years: number;
  period_ticks: number;
  distance_preset: DistancePresetId;
  coupon_rate_k: number;
  coupon_cents: number;
  p_period_notouch: number;
  barrier_offset_log: number;
  offset_sigma: number;
  instrument: string;
}

export interface CouponPricingView {
  periodTicks: number;
  distanceId: DistancePresetId;
  couponRateK: number;
  /** Coupon in USDT per period for a given stake (display). */
  couponUsdt: (stakeUsdt: number) => number;
  pPeriod: number;
  offsetSigma: number;
  offsetLog: number;
  lockedPricing: (stakeCents: number) => CouponLockedPricing;
}

const pricingViewCache = new Map<string, CouponPricingView>();

/** Coupon cents from stake cents — single source of truth for display + lock. */
export function couponCentsFromStake(stakeCents: number, k: number): number {
  return Math.max(1, Math.round(stakeCents * k));
}

export function getCouponPricing(
  periodTicks: number,
  distanceId: DistancePresetId = 'standard',
  config: SyntheticCouponConfig = SYNTHETIC_COUPON_CONFIG,
): CouponPricingView {
  const cacheKey = `${periodTicks}|${distanceId}|${config.sigma}|${config.margin}|${config.dtYears}`;
  const cached = pricingViewCache.get(cacheKey);
  if (cached) return cached;

  const preset = getDistancePreset(distanceId);
  const k = preset.couponRateK;
  const targetP = targetPeriodSurvival(k, config.margin);
  const mu = perTickDriftSigma(config);
  const offsetSigma = offsetSigmaForSurvival(periodTicks, targetP, mu);
  const pPeriod = noTouchProbability(offsetSigma, periodTicks, mu);
  const offsetLog = offsetSigma * perTickSigma(config);

  const view: CouponPricingView = {
    periodTicks,
    distanceId,
    couponRateK: k,
    couponUsdt: (stakeUsdt) =>
      centsToUsdt(couponCentsFromStake(usdtToCents(stakeUsdt), k)),
    pPeriod,
    offsetSigma,
    offsetLog,
    lockedPricing: (stakeCents) => ({
      pricing_model: PRICING_MODEL,
      platform_margin: config.margin,
      sigma: config.sigma,
      dt_years: config.dtYears,
      period_ticks: periodTicks,
      distance_preset: distanceId,
      coupon_rate_k: k,
      coupon_cents: couponCentsFromStake(stakeCents, k),
      p_period_notouch: pPeriod,
      barrier_offset_log: offsetLog,
      offset_sigma: offsetSigma,
      instrument: config.instrument,
    }),
  };
  pricingViewCache.set(cacheKey, view);
  return view;
}

export interface BarrierLevels {
  upper: number;
  lower: number;
}

export function computeBarriers(entrySpot: number, offsetLog: number): BarrierLevels {
  return {
    upper: entrySpot * Math.exp(offsetLog),
    lower: entrySpot * Math.exp(-offsetLog),
  };
}

/** One-period EV per unit stake at entry (accrued = 0), using locked C and p. */
export function onePeriodExpectedValue(
  periodTicks: number,
  distanceId: DistancePresetId,
  config: SyntheticCouponConfig = SYNTHETIC_COUPON_CONFIG,
): number {
  const view = getCouponPricing(periodTicks, distanceId, config);
  const k = view.couponRateK;
  const p = view.pPeriod;
  // EV/S = p*(1+k) - 1
  return p * (1 + k) - 1;
}

// --- Contract shapes (platform_standard §6.2 / §8.1) -------------------------

export type ContractStatus = 'OPEN' | 'WON' | 'LOST' | 'REFUNDED' | 'VOID';

export type CouponSettleReason = 'cash_out' | 'default';

export interface CouponContractParameters {
  contract_type: 'SYNTHETIC_COUPON';
  instrument: string;
  entry_spot: number;
  upper_barrier: number;
  lower_barrier: number;
  barrier_offset: number;
  period_ticks: number;
  coupon_cents: number;
  distance_preset: DistancePresetId;
}

export interface CouponSettlementData {
  reason: CouponSettleReason;
  status: 'WON' | 'LOST';
  breach_side: 'upper' | 'lower' | null;
  settle_tick: number;
  prices: number[];
  accrued_cents: number;
  payout_cents: number;
  stake_cents: number;
}

export interface CouponFeedSnapshot {
  instrument: string;
  sigma: number;
  dt_years: number;
  model: 'driftless_gbm';
}

export interface CouponContract {
  id: string;
  account_id: string;
  container_sha: string;
  game_version: string;
  contract_type: 'SYNTHETIC_COUPON';
  currency: 'USDT';
  stake_amount: number;
  stake_cents: number;
  status: ContractStatus;
  payout_amount: number;
  locked_pricing: CouponLockedPricing;
  parameters: CouponContractParameters;
  settlement_data: CouponSettlementData | null;
  feed_snapshot: CouponFeedSnapshot;
  created_at: string;
  settled_at: string | null;
}

export const GAME_VERSION = '0.1.0';
export const CONTAINER_SHA_POC = 'ideations-poc';

function newContractId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  if (c && typeof c.getRandomValues === 'function') {
    const buf = new Uint8Array(16);
    c.getRandomValues(buf);
    return `sc-${Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('')}`;
  }
  return `sc-${Date.now().toString(16)}`;
}

/** Ticks survived since entry (prices[0] is entry). */
export function ticksSurvived(state: CouponRoundState): number {
  return Math.max(0, state.prices.length - 1);
}

export function canCashOutRound(state: CouponRoundState): boolean {
  return (
    state.contract.status === 'OPEN' &&
    state.periodsCompleted >= MIN_COUPONS_BEFORE_CASHOUT
  );
}

/** Keep path bounded for memory / settlement payload size. */
export function trimPrices(prices: number[], maxLen = MAX_PATH_TICKS): number[] {
  if (prices.length <= maxLen) return prices;
  return prices.slice(prices.length - maxLen);
}

// --- Live round state -------------------------------------------------------

export interface CouponRoundState {
  contract: CouponContract;
  prices: number[];
  /** Ticks elapsed since last coupon (or entry). */
  ticksInPeriod: number;
  accruedCents: number;
  periodsCompleted: number;
}

export function openCouponContract(args: {
  stakeUsdt: number;
  entrySpot: number;
  periodTicks: number;
  distanceId: DistancePresetId;
  accountId?: string;
  config?: SyntheticCouponConfig;
}): CouponRoundState {
  const config = args.config ?? SYNTHETIC_COUPON_CONFIG;
  const stakeCents = usdtToCents(args.stakeUsdt);
  if (stakeCents < 10) {
    throw new Error('Stake below minimum (0.10 USDT)');
  }

  const pricing = getCouponPricing(args.periodTicks, args.distanceId, config);
  const locked = pricing.lockedPricing(stakeCents);
  const barriers = computeBarriers(args.entrySpot, locked.barrier_offset_log);
  const now = new Date().toISOString();

  const parameters: CouponContractParameters = {
    contract_type: 'SYNTHETIC_COUPON',
    instrument: config.instrument,
    entry_spot: args.entrySpot,
    upper_barrier: barriers.upper,
    lower_barrier: barriers.lower,
    barrier_offset: locked.barrier_offset_log,
    period_ticks: args.periodTicks,
    coupon_cents: locked.coupon_cents,
    distance_preset: args.distanceId,
  };

  const contract: CouponContract = {
    id: newContractId(),
    account_id: args.accountId ?? 'DEMO-ideations',
    container_sha: CONTAINER_SHA_POC,
    game_version: GAME_VERSION,
    contract_type: 'SYNTHETIC_COUPON',
    currency: 'USDT',
    stake_amount: centsToUsdt(stakeCents),
    stake_cents: stakeCents,
    status: 'OPEN',
    payout_amount: 0,
    locked_pricing: locked,
    parameters,
    settlement_data: null,
    feed_snapshot: {
      instrument: config.instrument,
      sigma: config.sigma,
      dt_years: config.dtYears,
      model: 'driftless_gbm',
    },
    created_at: now,
    settled_at: null,
  };

  return {
    contract,
    prices: [args.entrySpot],
    ticksInPeriod: 0,
    accruedCents: 0,
    periodsCompleted: 0,
  };
}

export function nextGbmPrice(
  prev: number,
  config: SyntheticCouponConfig = SYNTHETIC_COUPON_CONFIG,
): number {
  const drift = -0.5 * config.sigma ** 2 * config.dtYears;
  const volStep = config.sigma * Math.sqrt(config.dtYears);
  return prev * Math.exp(drift + volStep * boxMullerTransform());
}

export function isBreach(price: number, upper: number, lower: number): 'upper' | 'lower' | null {
  if (price >= upper) return 'upper';
  if (price <= lower) return 'lower';
  return null;
}

export type TickApplyResult =
  | { kind: 'continue'; state: CouponRoundState; couponAccrued: boolean }
  | { kind: 'default'; state: CouponRoundState; side: 'upper' | 'lower' }
  | { kind: 'auto_cash_out'; state: CouponRoundState };

/**
 * Advance an OPEN round by one GBM tick. Accrues coupon when a full period completes.
 * Auto cash-out at MAX_ROUND_TICKS if still alive.
 */
export function applyCouponTick(
  state: CouponRoundState,
  config: SyntheticCouponConfig = SYNTHETIC_COUPON_CONFIG,
): TickApplyResult {
  if (state.contract.status !== 'OPEN') {
    return { kind: 'continue', state, couponAccrued: false };
  }

  const prev = state.prices[state.prices.length - 1];
  const price = nextGbmPrice(prev, config);
  const { upper_barrier: upper, lower_barrier: lower, period_ticks, coupon_cents } =
    state.contract.parameters;

  const prices = trimPrices([...state.prices, price]);
  const side = isBreach(price, upper, lower);
  if (side) {
    const settled = settleDefault(state, prices, side);
    return { kind: 'default', state: settled, side };
  }

  let ticksInPeriod = state.ticksInPeriod + 1;
  let accruedCents = state.accruedCents;
  let periodsCompleted = state.periodsCompleted;
  let couponAccrued = false;

  if (ticksInPeriod >= period_ticks) {
    accruedCents += coupon_cents;
    periodsCompleted += 1;
    ticksInPeriod = 0;
    couponAccrued = true;
  }

  const nextState: CouponRoundState = {
    ...state,
    prices,
    ticksInPeriod,
    accruedCents,
    periodsCompleted,
  };

  if (ticksSurvived(nextState) >= MAX_ROUND_TICKS) {
    return { kind: 'auto_cash_out', state: settleCashOut(nextState) };
  }

  return {
    kind: 'continue',
    state: nextState,
    couponAccrued,
  };
}

function finalize(
  state: CouponRoundState,
  prices: number[],
  status: 'WON' | 'LOST',
  reason: CouponSettleReason,
  breachSide: 'upper' | 'lower' | null,
  payoutCents: number,
  accruedCents: number,
): CouponRoundState {
  const settlement_data: CouponSettlementData = {
    reason,
    status,
    breach_side: breachSide,
    settle_tick: prices.length - 1,
    prices,
    accrued_cents: accruedCents,
    payout_cents: payoutCents,
    stake_cents: state.contract.stake_cents,
  };

  const contract: CouponContract = {
    ...state.contract,
    status,
    payout_amount: centsToUsdt(payoutCents),
    settlement_data,
    settled_at: new Date().toISOString(),
  };

  return {
    ...state,
    contract,
    prices,
    accruedCents,
  };
}

export function settleDefault(
  state: CouponRoundState,
  prices: number[],
  side: 'upper' | 'lower',
): CouponRoundState {
  return finalize(state, trimPrices(prices), 'LOST', 'default', side, 0, state.accruedCents);
}

/**
 * Early cash-out: WON with payout = stake + accrued.
 * Rejects (returns unchanged) if still OPEN but before the first coupon,
 * unless `force` (auto horizon / shutdown).
 */
export function settleCashOut(
  state: CouponRoundState,
  opts: { force?: boolean } = {},
): CouponRoundState {
  if (state.contract.status !== 'OPEN') return state;
  if (!opts.force && !canCashOutRound(state)) return state;
  const payoutCents = state.contract.stake_cents + state.accruedCents;
  return finalize(
    state,
    trimPrices(state.prices),
    'WON',
    'cash_out',
    null,
    payoutCents,
    state.accruedCents,
  );
}

export function positionPayoutUsdt(state: CouponRoundState): number {
  return centsToUsdt(state.contract.stake_cents + state.accruedCents);
}

export function nextIdleTick(
  prev: number,
  config: SyntheticCouponConfig = SYNTHETIC_COUPON_CONFIG,
): number {
  return nextGbmPrice(prev, config);
}

/** Log-distance to nearest barrier in per-tick σ units. */
export function distanceToNearestBarrierSigma(
  price: number,
  upper: number,
  lower: number,
  config: SyntheticCouponConfig = SYNTHETIC_COUPON_CONFIG,
): number {
  if (price <= 0) return 0;
  const s = perTickSigma(config);
  return Math.min(Math.log(upper / price), Math.log(price / lower)) / s;
}

// --- Monte Carlo validation -------------------------------------------------

export type CouponCashOutPolicy =
  | { kind: 'after_one_period' }
  | { kind: 'after_n_periods'; n: number }
  | { kind: 'geometric'; q: number };

export interface CouponSimResult {
  payoutCents: number;
  stakeCents: number;
  rtp: number;
  defaulted: boolean;
  periodsCompleted: number;
}

function geometricCashOutDraw(q: number): boolean {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 0x1_0000_0000 < q;
}

/**
 * Run one round under a cash-out policy until settle or MAX_ROUND_TICKS.
 */
export function simulateCouponRound(
  policy: CouponCashOutPolicy,
  periodTicks: number,
  distanceId: DistancePresetId,
  stakeUsdt = 10,
  config: SyntheticCouponConfig = SYNTHETIC_COUPON_CONFIG,
): CouponSimResult {
  let state = openCouponContract({
    stakeUsdt,
    entrySpot: config.s0,
    periodTicks,
    distanceId,
    config,
  });

  const targetPeriods =
    policy.kind === 'after_one_period'
      ? 1
      : policy.kind === 'after_n_periods'
        ? Math.max(1, policy.n)
        : Infinity;

  for (;;) {
    const applied = applyCouponTick(state, config);
    if (applied.kind === 'default') {
      return {
        payoutCents: 0,
        stakeCents: applied.state.contract.stake_cents,
        rtp: 0,
        defaulted: true,
        periodsCompleted: applied.state.periodsCompleted,
      };
    }
    if (applied.kind === 'auto_cash_out') {
      const payout = applied.state.contract.settlement_data?.payout_cents ?? 0;
      const stake = applied.state.contract.stake_cents;
      return {
        payoutCents: payout,
        stakeCents: stake,
        rtp: stake > 0 ? payout / stake : 0,
        defaulted: false,
        periodsCompleted: applied.state.periodsCompleted,
      };
    }

    state = applied.state;

    if (applied.couponAccrued) {
      let shouldCash = false;
      if (policy.kind === 'after_one_period' || policy.kind === 'after_n_periods') {
        shouldCash = state.periodsCompleted >= targetPeriods;
      } else if (policy.kind === 'geometric') {
        shouldCash = geometricCashOutDraw(policy.q);
      }
      if (shouldCash) {
        const settled = settleCashOut(state, { force: true });
        const payout = settled.contract.settlement_data?.payout_cents ?? 0;
        const stake = settled.contract.stake_cents;
        return {
          payoutCents: payout,
          stakeCents: stake,
          rtp: stake > 0 ? payout / stake : 0,
          defaulted: false,
          periodsCompleted: settled.periodsCompleted,
        };
      }
    }
  }
}

export interface CouponMonteCarloRtp {
  meanRtp: number;
  seRtp: number;
  defaultRate: number;
  n: number;
}

export function monteCarloCouponRtp(
  n: number,
  policy: CouponCashOutPolicy,
  periodTicks: number,
  distanceId: DistancePresetId = 'standard',
  config: SyntheticCouponConfig = SYNTHETIC_COUPON_CONFIG,
): CouponMonteCarloRtp {
  let sum = 0;
  let sumSq = 0;
  let defaults = 0;

  for (let i = 0; i < n; i++) {
    const r = simulateCouponRound(policy, periodTicks, distanceId, 10, config);
    sum += r.rtp;
    sumSq += r.rtp * r.rtp;
    if (r.defaulted) defaults += 1;
  }

  const meanRtp = sum / n;
  const variance = Math.max(0, sumSq / n - meanRtp * meanRtp);
  return {
    meanRtp,
    seRtp: Math.sqrt(variance / n),
    defaultRate: defaults / n,
    n,
  };
}

/** Re-export for tests that assert grid CDF sanity. */
export { normCdf, noTouchProbability };
