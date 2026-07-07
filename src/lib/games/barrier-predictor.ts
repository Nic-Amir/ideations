'use strict';

/**
 * Barrier Predictor — one driftless GBM asset with two log-symmetric barriers
 * around the entry spot. The player predicts which barrier the price touches
 * first within T ticks; if neither barrier is touched the stake is refunded.
 *
 * Mechanics follow trading-game specs/products/barrier-predictor/product_spec.md
 * (§3 feed, §4 mechanics, §7 settlement), with two deliberate corrections to
 * the spec's §5 pricing:
 *
 * 1. The spec prices with the maturity-window approximation
 *    Φ(d/σ√τ) − Φ(−d/σ√τ), which is the probability the *terminal* price sits
 *    inside the corridor — not the probability the path never leaves it. The
 *    contract settles on tick-by-tick monitoring, so we price with a discrete
 *    first-passage grid (transition-density iteration with absorbing
 *    barriers) and calibrate the default offset so P(touch) ≈ 0.5 under the
 *    same discrete monitoring the settlement loop uses.
 *
 * 2. The spec's §5.2 multiplier (1/P_fair)(1−margin) with P_fair = P_touch/2
 *    ignores the refund: paying 3.88× on a 25% win while refunding half of
 *    all rounds hands the player a +47% edge. Because the barriers are
 *    log-symmetric, a decisive round is a fair coin flip, so the sound price
 *    is mult = (P_touch − margin)/P_fair, which keeps the house edge at
 *    exactly `margin` of the stake for every setting. (The spec's own §5.3
 *    note, quoting ~1.94×, already takes this conditional view.)
 *
 * Monte Carlo validation lives in __tests__/barrier-predictor.test.ts.
 */

export type BarrierSide = 'upper' | 'lower';

export type PredictorOutcome = 'win' | 'lose' | 'refund';

export interface BarrierPredictorConfig {
  /** Entry price of the synthetic index (spec §3.1 initial value). */
  s0: number;
  /** Annualized volatility (V_100 → 1.0). */
  sigma: number;
  /** One tick = one simulated second, expressed in years (spec §3.2). */
  dtYears: number;
  /** Default maximum ticks to maturity (spec §4.5). */
  tickDuration: number;
  /** Platform margin taken from the decisive-round payout (spec §9). */
  commission: number;
}

export const BARRIER_PREDICTOR_CONFIG: BarrierPredictorConfig = {
  s0: 100_000,
  sigma: 1.0,
  dtYears: 1 / (365 * 24 * 3600),
  tickDuration: 10,
  commission: 0.03,
};

export const DURATION_OPTIONS = [5, 10, 15, 20] as const;

export type DistancePresetId = 'near' | 'standard' | 'far';

export interface DistancePreset {
  id: DistancePresetId;
  label: string;
  /** Multiple of the calibrated default offset (P(touch) ≈ 0.5 at 1.0). */
  factor: number;
  tag: string;
}

export const DISTANCE_PRESETS: DistancePreset[] = [
  { id: 'near', label: 'Near', factor: 0.75, tag: 'Decisive' },
  { id: 'standard', label: 'Standard', factor: 1, tag: 'Balanced' },
  { id: 'far', label: 'Far', factor: 1.4, tag: 'Sheltered' },
];

export function getDistancePreset(id: DistancePresetId): DistancePreset {
  return DISTANCE_PRESETS.find((p) => p.id === id) ?? DISTANCE_PRESETS[1];
}

/** Reveal pacing: one contract tick shown every 400 ms. */
export const PREDICTOR_TICK_MS = 400;
export const PREDICTOR_SETTLE_MS = 600;
export const SLIDING_WINDOW_SIZE = 100;
/** Rolling ambient ticks shown on the idle chart. */
export const PREVIEW_WINDOW = 48;
export const IDLE_TICK_MS = 500;

// --- Randomness ------------------------------------------------------------

function boxMullerTransform(): number {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  const u1 = (buf[0] + 1) / (0xffffffff + 2);
  const u2 = (buf[1] + 1) / (0xffffffff + 2);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// --- Normal CDF ------------------------------------------------------------

/** Zelen & Severo approximation (A&S 26.2.17), |error| < 7.5e-8. */
export function normCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p =
    d *
    t *
    (0.31938153 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

// --- Discrete first-passage grid --------------------------------------------

const GRID_CELLS = 200;
const BISECTION_ITERATIONS = 26;

/**
 * Probability a discrete Gaussian random walk (unit per-tick σ, per-tick mean
 * `muSigma`) stays strictly inside (−xSigma, +xSigma) for `ticks` steps, with
 * absorption checked at every tick — matching the settlement loop, which
 * evaluates the barriers once per generated tick.
 *
 * Computed by iterating the surviving probability density over a uniform grid
 * with an exact Gaussian transition kernel between cell centers.
 */
export function noTouchProbability(
  xSigma: number,
  ticks: number,
  muSigma = 0,
): number {
  if (xSigma <= 0) return 0;
  if (ticks <= 0) return 1;

  const m = GRID_CELLS;
  const h = (2 * xSigma) / m;

  // First step is exact: the walk starts at 0 as a point mass.
  let cur = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    const lo = -xSigma + i * h;
    cur[i] = normCdf(lo + h - muSigma) - normCdf(lo - muSigma);
  }

  if (ticks > 1) {
    // Toeplitz kernel: mass moved from a source cell center to a destination
    // cell depends only on the index offset.
    const kernel = new Float64Array(2 * m - 1);
    for (let j = -(m - 1); j <= m - 1; j++) {
      kernel[j + m - 1] =
        normCdf(j * h + h / 2 - muSigma) - normCdf(j * h - h / 2 - muSigma);
    }

    let next = new Float64Array(m);
    for (let t = 1; t < ticks; t++) {
      next.fill(0);
      for (let u = 0; u < m; u++) {
        const mass = cur[u];
        if (mass === 0) continue;
        const base = m - 1 - u;
        for (let v = 0; v < m; v++) {
          next[v] += mass * kernel[base + v];
        }
      }
      const swap = cur;
      cur = next;
      next = swap;
    }
  }

  let sum = 0;
  for (let i = 0; i < m; i++) sum += cur[i];
  return Math.min(1, sum);
}

const calibrationCache = new Map<string, number>();

/**
 * Barrier offset (in per-tick σ units) such that P(touch either barrier
 * within `ticks`) ≈ 0.5 — the spec §5.4 calibration goal, solved against the
 * discrete first-passage probability instead of the maturity approximation.
 */
export function calibratedOffsetSigma(ticks: number, muSigma = 0): number {
  const key = `${ticks}|${muSigma}`;
  const cached = calibrationCache.get(key);
  if (cached !== undefined) return cached;

  let lo = 0.2;
  let hi = 12;
  for (let i = 0; i < BISECTION_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    if (noTouchProbability(mid, ticks, muSigma) < 0.5) lo = mid;
    else hi = mid;
  }
  const x = (lo + hi) / 2;
  calibrationCache.set(key, x);
  return x;
}

// --- Pricing -----------------------------------------------------------------

export interface PredictorPricing {
  ticks: number;
  distanceFactor: number;
  /** Barrier distance from spot, in per-tick σ units. */
  offsetSigma: number;
  /** Barrier distance from spot, in log-price units (spec's d). */
  offsetLog: number;
  pNoTouch: number;
  pTouch: number;
  /** P(your barrier is touched first) — pTouch/2 by log-symmetry. */
  pFairPerSide: number;
  /** Offered payout multiplier, refund-aware, 3% house edge built in. */
  multiplier: number;
}

/** Per-tick log-step mean expressed in per-tick σ units (−0.5σ²dt / σ√dt). */
function perTickDriftSigma(config: BarrierPredictorConfig): number {
  return -0.5 * config.sigma * Math.sqrt(config.dtYears);
}

export function perTickSigma(
  config: BarrierPredictorConfig = BARRIER_PREDICTOR_CONFIG,
): number {
  return config.sigma * Math.sqrt(config.dtYears);
}

const pricingCache = new Map<string, PredictorPricing>();

export function getPredictorPricing(
  ticks: number,
  distanceFactor = 1,
  config: BarrierPredictorConfig = BARRIER_PREDICTOR_CONFIG,
): PredictorPricing {
  const key = `${ticks}|${distanceFactor}|${config.sigma}|${config.commission}`;
  const cached = pricingCache.get(key);
  if (cached) return cached;

  const mu = perTickDriftSigma(config);
  const offsetSigma = calibratedOffsetSigma(ticks, mu) * distanceFactor;
  const pNoTouch = noTouchProbability(offsetSigma, ticks, mu);
  const pTouch = 1 - pNoTouch;
  const pFairPerSide = pTouch / 2;

  // Refund-aware pricing: EV = pFair·mult − pTouch = −commission exactly.
  const raw =
    pFairPerSide > 0 ? (pTouch - config.commission) / pFairPerSide : 0;
  const multiplier = Math.max(1.01, Math.round(raw * 100) / 100);

  const pricing: PredictorPricing = {
    ticks,
    distanceFactor,
    offsetSigma,
    offsetLog: offsetSigma * perTickSigma(config),
    pNoTouch,
    pTouch,
    pFairPerSide,
    multiplier,
  };
  pricingCache.set(key, pricing);
  return pricing;
}

export interface BarrierLevels {
  upper: number;
  lower: number;
}

/** Log-symmetric barriers around the entry spot (spec §4.2). */
export function computeBarriers(entrySpot: number, offsetLog: number): BarrierLevels {
  return {
    upper: entrySpot * Math.exp(offsetLog),
    lower: entrySpot * Math.exp(-offsetLog),
  };
}

/** Expected value per unit stake — ≈ −commission at every setting. */
export function computeExpectedValue(
  ticks: number,
  distanceFactor = 1,
  config: BarrierPredictorConfig = BARRIER_PREDICTOR_CONFIG,
): number {
  const p = getPredictorPricing(ticks, distanceFactor, config);
  return p.pFairPerSide * p.multiplier + p.pNoTouch - 1;
}

// --- Path generation & settlement -------------------------------------------

export interface PredictorPath {
  /** Tick prices, index 0 = entry spot. Truncated at the touch tick. */
  prices: number[];
  touched: BarrierSide | null;
  touchTick: number | null;
  /** Touch tick, or tickDuration when the round runs to maturity. */
  settleTick: number;
  entrySpot: number;
  upper: number;
  lower: number;
}

/**
 * Pre-generates a full round: GBM ticks per spec §3.2, stopping at the first
 * tick whose price reaches or crosses a barrier (inclusive, spec §4.4).
 */
export function generatePredictorPath(
  entrySpot: number,
  upper: number,
  lower: number,
  ticks: number,
  config: BarrierPredictorConfig = BARRIER_PREDICTOR_CONFIG,
): PredictorPath {
  const drift = -0.5 * config.sigma ** 2 * config.dtYears;
  const volStep = config.sigma * Math.sqrt(config.dtYears);

  const prices: number[] = [entrySpot];
  let logP = Math.log(entrySpot);

  for (let t = 1; t <= ticks; t++) {
    logP += drift + volStep * boxMullerTransform();
    const price = Math.exp(logP);
    prices.push(price);

    if (price >= upper) {
      return { prices, touched: 'upper', touchTick: t, settleTick: t, entrySpot, upper, lower };
    }
    if (price <= lower) {
      return { prices, touched: 'lower', touchTick: t, settleTick: t, entrySpot, upper, lower };
    }
  }

  return { prices, touched: null, touchTick: null, settleTick: ticks, entrySpot, upper, lower };
}

export interface PredictorSettlement {
  outcome: PredictorOutcome;
  payout: number;
  multiplier: number;
  touched: BarrierSide | null;
  settleTick: number;
}

export function settlePredictor(
  pick: BarrierSide,
  path: PredictorPath,
  stake: number,
  multiplier: number,
): PredictorSettlement {
  if (path.touched === null) {
    return {
      outcome: 'refund',
      payout: stake,
      multiplier: 1,
      touched: null,
      settleTick: path.settleTick,
    };
  }
  if (path.touched === pick) {
    return {
      outcome: 'win',
      payout: Math.round(stake * multiplier),
      multiplier,
      touched: path.touched,
      settleTick: path.settleTick,
    };
  }
  return {
    outcome: 'lose',
    payout: 0,
    multiplier: 0,
    touched: path.touched,
    settleTick: path.settleTick,
  };
}

/** One ambient tick for the idle preview chart — same GBM as the contract. */
export function nextIdleTick(
  prev: number,
  config: BarrierPredictorConfig = BARRIER_PREDICTOR_CONFIG,
): number {
  const drift = -0.5 * config.sigma ** 2 * config.dtYears;
  const volStep = config.sigma * Math.sqrt(config.dtYears);
  return prev * Math.exp(drift + volStep * boxMullerTransform());
}

/**
 * Distance from the price to the *nearest* barrier, in per-tick σ units.
 * Zero or negative once a barrier is reached. Drives the approach sound.
 */
export function distanceToNearestBarrierSigma(
  price: number,
  upper: number,
  lower: number,
  config: BarrierPredictorConfig = BARRIER_PREDICTOR_CONFIG,
): number {
  const s = perTickSigma(config);
  return Math.min(Math.log(upper / price), Math.log(price / lower)) / s;
}

// --- Monte Carlo validation ---------------------------------------------------

export interface MonteCarloResult {
  pUpper: number;
  pLower: number;
  pNoTouch: number;
  seUpper: number;
  seLower: number;
  seNoTouch: number;
}

export function monteCarloEstimate(
  n: number,
  ticks: number,
  distanceFactor = 1,
  config: BarrierPredictorConfig = BARRIER_PREDICTOR_CONFIG,
): MonteCarloResult {
  const pricing = getPredictorPricing(ticks, distanceFactor, config);
  const { upper, lower } = computeBarriers(config.s0, pricing.offsetLog);

  let upperFirst = 0;
  let lowerFirst = 0;
  let noTouch = 0;

  for (let i = 0; i < n; i++) {
    const path = generatePredictorPath(config.s0, upper, lower, ticks, config);
    if (path.touched === 'upper') upperFirst++;
    else if (path.touched === 'lower') lowerFirst++;
    else noTouch++;
  }

  const pUpper = upperFirst / n;
  const pLower = lowerFirst / n;
  const pNoTouch = noTouch / n;
  const se = (p: number) => Math.sqrt((p * (1 - p)) / n);

  return {
    pUpper,
    pLower,
    pNoTouch,
    seUpper: se(pUpper),
    seLower: se(pLower),
    seNoTouch: se(pNoTouch),
  };
}

export const BARRIER_LABELS: Record<BarrierSide, { name: string; tag: string }> = {
  upper: { name: 'Upper', tag: 'Breaks out up' },
  lower: { name: 'Lower', tag: 'Breaks out down' },
};
