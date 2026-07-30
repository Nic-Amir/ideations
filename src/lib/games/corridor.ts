'use strict';

/**
 * Corridor — Stay-in / Goes-out product engine.
 *
 * Fixed-duration double-barrier: Stay wins on no-touch for all T ticks;
 * Goes wins on first touch of either barrier. Pricing reuses Barrier
 * Predictor's discrete first-passage `noTouchProbability`. Mesh-shaped
 * contracts (integer cents, locked_pricing, settlement_data) follow
 * docs/games/corridor/product_spec.md and platform_standard.
 */

import {
  calibratedOffsetSigma,
  computeBarriers,
  generatePredictorPath,
  nextIdleTick as predictorIdleTick,
  noTouchProbability,
  perTickSigma as predictorPerTickSigma,
  type BarrierLevels,
  type BarrierSide,
  type PredictorPath,
} from '@/lib/games/barrier-predictor';

// --- Config -----------------------------------------------------------------

export interface CorridorConfig {
  s0: number;
  sigma: number;
  dtYears: number;
  /** Platform margin taken from fair EV (product_spec §5.2). */
  margin: number;
  instrument: string;
}

export const CORRIDOR_CONFIG: CorridorConfig = {
  s0: 100_000,
  sigma: 1.0,
  dtYears: 1 / (365 * 24 * 3600),
  margin: 0.03,
  instrument: 'V_100',
};

export const DURATION_OPTIONS = [5, 10, 15] as const;
export type DurationTicks = (typeof DURATION_OPTIONS)[number];

/**
 * Reference duration used to fix corridor width. Barriers calibrate so
 * P(touch) ≈ 0.5 at Standard for this T; other durations keep the same
 * width so longer T makes Goes easier / Stay harder.
 */
export const REF_TICKS = 10;

export type DistancePresetId = 'near' | 'standard' | 'far';

export interface DistancePreset {
  id: DistancePresetId;
  label: string;
  /** Multiple of calibrated offset at REF_TICKS where P(touch) ≈ 0.5 at 1.0. */
  factor: number;
  tag: string;
}

export const DISTANCE_PRESETS: DistancePreset[] = [
  { id: 'near', label: 'Near', factor: 0.75, tag: 'Tighter' },
  { id: 'standard', label: 'Standard', factor: 1, tag: 'Balanced' },
  { id: 'far', label: 'Far', factor: 1.4, tag: 'Wider' },
];

export function getDistancePreset(id: DistancePresetId): DistancePreset {
  return DISTANCE_PRESETS.find((p) => p.id === id) ?? DISTANCE_PRESETS[1];
}

export type CorridorPick = 'stay' | 'goes';

export const CORRIDOR_TICK_MS = 400;
export const CORRIDOR_SETTLE_MS = 600;
export const IDLE_TICK_MS = 500;
export const PREVIEW_WINDOW = 48;
export const PRICING_MODEL = 'corridor_double_barrier_v1';
export const GAME_VERSION = '0.1.0';
export const CONTAINER_SHA_POC = 'ideations-poc';

export const PICK_LABELS: Record<CorridorPick, { name: string; board: string; tag: string }> = {
  stay: { name: 'Stay in', board: 'Inside', tag: 'No touch' },
  goes: { name: 'Goes out', board: 'Outside', tag: 'First touch' },
};

// --- Money (platform_standard §23.7) ----------------------------------------

export function usdtToCents(usdt: number): number {
  return Math.round(usdt * 100);
}

export function centsToUsdt(cents: number): number {
  return cents / 100;
}

/** Integer-cent payout from stake × locked multiplier. */
export function payoutCentsFromMult(stakeCents: number, mult: number): number {
  return Math.floor(stakeCents * mult);
}

// --- Pricing ----------------------------------------------------------------

function perTickDriftSigma(config: CorridorConfig): number {
  return -0.5 * config.sigma * Math.sqrt(config.dtYears);
}

export function perTickSigma(config: CorridorConfig = CORRIDOR_CONFIG): number {
  return config.sigma * Math.sqrt(config.dtYears);
}

/** Round display multiplier to cents of mult; floor at 1.01. */
export function formatMultiplier(raw: number): number {
  return Math.max(1.01, Math.round(raw * 100) / 100);
}

export interface CorridorLockedPricing {
  pricing_model: typeof PRICING_MODEL;
  platform_margin: number;
  sigma: number;
  dt_years: number;
  ticks: number;
  distance_preset: DistancePresetId;
  p_stay: number;
  p_goes: number;
  mult_stay: number;
  mult_goes: number;
  barrier_offset_log: number;
  offset_sigma: number;
  pick: CorridorPick;
  instrument: string;
}

export interface CorridorPricingView {
  ticks: number;
  distanceId: DistancePresetId;
  distanceFactor: number;
  offsetSigma: number;
  offsetLog: number;
  pStay: number;
  pGoes: number;
  multStay: number;
  multGoes: number;
  lockedPricing: (pick: CorridorPick) => CorridorLockedPricing;
}

const pricingCache = new Map<string, CorridorPricingView>();

export function getCorridorPricing(
  ticks: number,
  distanceId: DistancePresetId = 'standard',
  config: CorridorConfig = CORRIDOR_CONFIG,
): CorridorPricingView {
  const cacheKey = `${ticks}|${distanceId}|${config.sigma}|${config.margin}|${config.dtYears}`;
  const cached = pricingCache.get(cacheKey);
  if (cached) return cached;

  const preset = getDistancePreset(distanceId);
  const mu = perTickDriftSigma(config);
  // Fixed corridor width: calibrate at REF_TICKS, then price first-passage over player T.
  const offsetSigma = calibratedOffsetSigma(REF_TICKS, mu) * preset.factor;
  const pStay = noTouchProbability(offsetSigma, ticks, mu);
  const pGoes = 1 - pStay;
  const m = config.margin;
  const multStay = formatMultiplier(pStay > 0 ? (1 / pStay) * (1 - m) : 0);
  const multGoes = formatMultiplier(pGoes > 0 ? (1 / pGoes) * (1 - m) : 0);
  const offsetLog = offsetSigma * predictorPerTickSigma({
    s0: config.s0,
    sigma: config.sigma,
    dtYears: config.dtYears,
    tickDuration: ticks,
    commission: config.margin,
  });

  const view: CorridorPricingView = {
    ticks,
    distanceId,
    distanceFactor: preset.factor,
    offsetSigma,
    offsetLog,
    pStay,
    pGoes,
    multStay,
    multGoes,
    lockedPricing: (pick) => ({
      pricing_model: PRICING_MODEL,
      platform_margin: config.margin,
      sigma: config.sigma,
      dt_years: config.dtYears,
      ticks,
      distance_preset: distanceId,
      p_stay: pStay,
      p_goes: pGoes,
      mult_stay: multStay,
      mult_goes: multGoes,
      barrier_offset_log: offsetLog,
      offset_sigma: offsetSigma,
      pick,
      instrument: config.instrument,
    }),
  };
  pricingCache.set(cacheKey, view);
  return view;
}

/**
 * EV per unit stake for a given pick: p·mult − 1.
 * At fair pricing ≈ −margin (before rounding).
 */
export function expectedValue(
  ticks: number,
  distanceId: DistancePresetId,
  pick: CorridorPick,
  config: CorridorConfig = CORRIDOR_CONFIG,
): number {
  const view = getCorridorPricing(ticks, distanceId, config);
  if (pick === 'stay') return view.pStay * view.multStay - 1;
  return view.pGoes * view.multGoes - 1;
}

export { computeBarriers };
export type { BarrierLevels, BarrierSide };

// --- Contract shapes (platform_standard §6.2 / §8.1) -------------------------

export type ContractStatus = 'OPEN' | 'WON' | 'LOST' | 'REFUNDED' | 'VOID';

export interface CorridorContractParameters {
  contract_type: 'CORRIDOR';
  instrument: string;
  entry_spot: number;
  upper_barrier: number;
  lower_barrier: number;
  barrier_offset: number;
  ticks: number;
  pick: CorridorPick;
  distance_preset: DistancePresetId;
  locked_multiplier: number;
}

export interface CorridorSettlementData {
  outcome: 'WON' | 'LOST';
  pick: CorridorPick;
  touched: BarrierSide | null;
  settle_tick: number;
  prices: number[];
  stake_cents: number;
  payout_cents: number;
  locked_multiplier: number;
}

export interface CorridorFeedSnapshot {
  instrument: string;
  sigma: number;
  dt_years: number;
  model: 'driftless_gbm';
}

export interface CorridorContract {
  id: string;
  account_id: string;
  container_sha: string;
  game_version: string;
  contract_type: 'CORRIDOR';
  currency: 'USDT';
  stake_amount: number;
  stake_cents: number;
  status: ContractStatus;
  payout_amount: number;
  locked_pricing: CorridorLockedPricing;
  parameters: CorridorContractParameters;
  settlement_data: CorridorSettlementData | null;
  feed_snapshot: CorridorFeedSnapshot;
  created_at: string;
  settled_at: string | null;
}

function newContractId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  if (c && typeof c.getRandomValues === 'function') {
    const buf = new Uint8Array(16);
    c.getRandomValues(buf);
    return `cr-${Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('')}`;
  }
  return `cr-${Date.now().toString(16)}`;
}

// --- Path + settle ----------------------------------------------------------

export type CorridorPath = PredictorPath;

/** Pre-generate a full round path (GBM + crypto RNG via Barrier Predictor). */
export function generateCorridorPath(
  entrySpot: number,
  upper: number,
  lower: number,
  ticks: number,
  config: CorridorConfig = CORRIDOR_CONFIG,
): CorridorPath {
  return generatePredictorPath(entrySpot, upper, lower, ticks, {
    s0: config.s0,
    sigma: config.sigma,
    dtYears: config.dtYears,
    tickDuration: ticks,
    commission: config.margin,
  });
}

export function nextIdleTick(
  prev: number,
  config: CorridorConfig = CORRIDOR_CONFIG,
): number {
  return predictorIdleTick(prev, {
    s0: config.s0,
    sigma: config.sigma,
    dtYears: config.dtYears,
    tickDuration: 10,
    commission: config.margin,
  });
}

export interface CorridorRoundState {
  contract: CorridorContract;
  path: CorridorPath;
}

export function openCorridorContract(args: {
  stakeUsdt: number;
  pick: CorridorPick;
  ticks: number;
  distanceId: DistancePresetId;
  entrySpot?: number;
  accountId?: string;
  config?: CorridorConfig;
}): CorridorRoundState {
  const config = args.config ?? CORRIDOR_CONFIG;
  const stakeCents = usdtToCents(args.stakeUsdt);
  if (stakeCents < 10) {
    throw new Error('Stake below minimum (0.10 USDT)');
  }

  const entrySpot = args.entrySpot ?? config.s0;
  const pricing = getCorridorPricing(args.ticks, args.distanceId, config);
  const locked = pricing.lockedPricing(args.pick);
  const barriers = computeBarriers(entrySpot, locked.barrier_offset_log);
  const lockedMult = args.pick === 'stay' ? locked.mult_stay : locked.mult_goes;
  const now = new Date().toISOString();

  const path = generateCorridorPath(
    entrySpot,
    barriers.upper,
    barriers.lower,
    args.ticks,
    config,
  );

  const parameters: CorridorContractParameters = {
    contract_type: 'CORRIDOR',
    instrument: config.instrument,
    entry_spot: entrySpot,
    upper_barrier: barriers.upper,
    lower_barrier: barriers.lower,
    barrier_offset: locked.barrier_offset_log,
    ticks: args.ticks,
    pick: args.pick,
    distance_preset: args.distanceId,
    locked_multiplier: lockedMult,
  };

  const contract: CorridorContract = {
    id: newContractId(),
    account_id: args.accountId ?? 'DEMO-ideations',
    container_sha: CONTAINER_SHA_POC,
    game_version: GAME_VERSION,
    contract_type: 'CORRIDOR',
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

  return { contract, path };
}

/**
 * Settle an OPEN contract from its pre-generated path.
 * Stay wins on no-touch; Goes wins on first touch.
 */
export function settleCorridorContract(state: CorridorRoundState): CorridorRoundState {
  if (state.contract.status !== 'OPEN') return state;

  const { pick, locked_multiplier: mult } = state.contract.parameters;
  const { path } = state;
  const stayWon = path.touched === null;
  const winner: CorridorPick = stayWon ? 'stay' : 'goes';
  const won = pick === winner;
  const status: 'WON' | 'LOST' = won ? 'WON' : 'LOST';
  const payoutCents = won
    ? payoutCentsFromMult(state.contract.stake_cents, mult)
    : 0;

  const settlement_data: CorridorSettlementData = {
    outcome: status,
    pick,
    touched: path.touched,
    settle_tick: path.settleTick,
    prices: path.prices,
    stake_cents: state.contract.stake_cents,
    payout_cents: payoutCents,
    locked_multiplier: mult,
  };

  const contract: CorridorContract = {
    ...state.contract,
    status,
    payout_amount: centsToUsdt(payoutCents),
    settlement_data,
    settled_at: new Date().toISOString(),
  };

  return { contract, path };
}

// --- Monte Carlo ------------------------------------------------------------

export interface CorridorMonteCarloResult {
  pStay: number;
  pGoes: number;
  seStay: number;
  gridPStay: number;
}

export function monteCarloCorridor(
  n: number,
  ticks: number,
  distanceId: DistancePresetId = 'standard',
  config: CorridorConfig = CORRIDOR_CONFIG,
): CorridorMonteCarloResult {
  const pricing = getCorridorPricing(ticks, distanceId, config);
  const { upper, lower } = computeBarriers(config.s0, pricing.offsetLog);

  let noTouch = 0;
  for (let i = 0; i < n; i++) {
    const path = generateCorridorPath(config.s0, upper, lower, ticks, config);
    if (path.touched === null) noTouch++;
  }

  const pStay = noTouch / n;
  const pGoes = 1 - pStay;
  const se = Math.sqrt((pStay * (1 - pStay)) / n);

  return {
    pStay,
    pGoes,
    seStay: se,
    gridPStay: pricing.pStay,
  };
}
