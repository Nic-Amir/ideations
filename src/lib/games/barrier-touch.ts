'use strict';

/**
 * Barrier Touch — one driftless GBM asset, two betting modes about touch
 * events rather than direction:
 *
 * - Count mode: how many times does the price cross the entry line within
 *   T ticks? The player picks a bucket (0 / 1 / 2 / 3+). Exactly one bucket
 *   wins every round.
 * - Sequence mode: two log-symmetric barriers around the entry spot. The
 *   player bets Upper→Lower or Lower→Upper: their barrier must be touched
 *   first, then the opposite barrier touched afterward, all within T ticks.
 *   An incomplete sequence loses.
 *
 * Pricing is a deterministic state-augmented transition-density grid (the
 * same discrete-monitoring machinery as barrier-predictor's
 * noTouchProbability, extended with side/count and sequence-stage state).
 * Multipliers are exclusive-outcome: mult = (1 − margin) / p, so every pick
 * carries exactly a 3% house edge. Monte Carlo validation lives in
 * __tests__/barrier-touch.test.ts.
 */

export type TouchMode = 'count' | 'sequence';

/** Crossing-count bucket; 3 means "3 or more". */
export type CountBucket = 0 | 1 | 2 | 3;

export type SequencePick = 'upperLower' | 'lowerUpper';

export type TouchOutcome = 'win' | 'lose';

export interface BarrierTouchConfig {
  s0: number;
  /** Annualized volatility (V_100 → 1.0). */
  sigma: number;
  /** One tick = one simulated second, in years. */
  dtYears: number;
  tickDuration: number;
  commission: number;
}

export const BARRIER_TOUCH_CONFIG: BarrierTouchConfig = {
  s0: 100_000,
  sigma: 1.0,
  dtYears: 1 / (365 * 24 * 3600),
  tickDuration: 15,
  commission: 0.03,
};

export const DURATION_OPTIONS = [10, 15, 20] as const;

export const COUNT_BUCKETS: CountBucket[] = [0, 1, 2, 3];

export const COUNT_BUCKET_LABELS: Record<CountBucket, string> = {
  0: '0',
  1: '1',
  2: '2',
  3: '3+',
};

export const SEQUENCE_LABELS: Record<SequencePick, { name: string; tag: string }> = {
  upperLower: { name: 'Upper → Lower', tag: 'Break up, snap back' },
  lowerUpper: { name: 'Lower → Upper', tag: 'Break down, snap back' },
};

export type DistancePresetId = 'near' | 'standard' | 'far';

export interface DistancePreset {
  id: DistancePresetId;
  label: string;
  /** Multiple of the calibrated standard offset. */
  factor: number;
  tag: string;
}

export const DISTANCE_PRESETS: DistancePreset[] = [
  { id: 'near', label: 'Near', factor: 0.75, tag: 'Frequent trips' },
  { id: 'standard', label: 'Standard', factor: 1, tag: 'Balanced' },
  { id: 'far', label: 'Far', factor: 1.4, tag: 'Long shot' },
];

export function getDistancePreset(id: DistancePresetId): DistancePreset {
  return DISTANCE_PRESETS.find((p) => p.id === id) ?? DISTANCE_PRESETS[1];
}

/** Reveal pacing: one contract tick shown every 400 ms. */
export const TOUCH_TICK_MS = 400;
export const TOUCH_SETTLE_MS = 600;
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

// --- Shared grid helpers -----------------------------------------------------

export function perTickSigma(config: BarrierTouchConfig = BARRIER_TOUCH_CONFIG): number {
  return config.sigma * Math.sqrt(config.dtYears);
}

/** Per-tick log-step mean expressed in per-tick σ units (−0.5σ²dt / σ√dt). */
function perTickDriftSigma(config: BarrierTouchConfig): number {
  return -0.5 * config.sigma * Math.sqrt(config.dtYears);
}

/**
 * Toeplitz Gaussian step kernel between cell centers: kernel[j + m − 1] is
 * the mass moved from any cell to the cell j indices above it.
 */
function gaussianKernel(m: number, h: number, mu: number): Float64Array {
  const kernel = new Float64Array(2 * m - 1);
  for (let j = -(m - 1); j <= m - 1; j++) {
    kernel[j + m - 1] = normCdf(j * h + h / 2 - mu) - normCdf(j * h - h / 2 - mu);
  }
  return kernel;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

function offeredMultiplier(p: number, commission: number): number {
  if (p <= 0) return 0;
  return Math.max(1.01, round2((1 - commission) / p));
}

// --- Count mode pricing --------------------------------------------------------

const COUNT_GRID_CELLS = 400; // even, so the entry line sits on a cell edge

const countCache = new Map<string, [number, number, number, number]>();

/**
 * Distribution of the crossing-count bucket after `ticks` steps of a
 * discrete Gaussian walk started exactly on the entry line. A crossing is
 * two consecutive ticks on opposite sides of the line; tick 1 establishes
 * the initial side. States: (side, count saturated at 3) × log-price cell.
 */
export function countBucketProbabilities(
  ticks: number,
  config: BarrierTouchConfig = BARRIER_TOUCH_CONFIG,
): [number, number, number, number] {
  const key = `${ticks}|${config.sigma}|${config.dtYears}`;
  const cached = countCache.get(key);
  if (cached) return cached;

  const mu = perTickDriftSigma(config);
  const R = 6 * Math.sqrt(ticks);
  const m = COUNT_GRID_CELLS;
  const h = (2 * R) / m;
  const half = m / 2; // cells [0, half) are below the line, [half, m) above
  const kernel = gaussianKernel(m, h, mu);

  // Slice index = side * 4 + count; side 0 = below, 1 = above.
  let cur = Array.from({ length: 8 }, () => new Float64Array(m));
  let next = Array.from({ length: 8 }, () => new Float64Array(m));

  // First step is exact: the walk starts as a point mass on the line.
  for (let i = 0; i < m; i++) {
    const lo = -R + i * h;
    const mass = normCdf(lo + h - mu) - normCdf(lo - mu);
    if (mass <= 0) continue;
    const side = i >= half ? 1 : 0;
    cur[side * 4][i] = mass;
  }

  for (let t = 2; t <= ticks; t++) {
    for (const arr of next) arr.fill(0);
    for (let s = 0; s < 8; s++) {
      const side = s >> 2;
      const count = s & 3;
      const crossedCount = count < 3 ? count + 1 : 3;
      const src = cur[s];
      const belowSlice = next[(side === 0 ? count : crossedCount) + 0];
      const aboveSlice = next[(side === 1 ? count : crossedCount) + 4];
      for (let u = 0; u < m; u++) {
        const mass = src[u];
        if (mass === 0) continue;
        const base = m - 1 - u;
        for (let v = 0; v < half; v++) {
          belowSlice[v] += mass * kernel[base + v];
        }
        for (let v = half; v < m; v++) {
          aboveSlice[v] += mass * kernel[base + v];
        }
      }
    }
    const swap = cur;
    cur = next;
    next = swap;
  }

  const raw: [number, number, number, number] = [0, 0, 0, 0];
  for (let s = 0; s < 8; s++) {
    const count = (s & 3) as CountBucket;
    let sum = 0;
    const arr = cur[s];
    for (let i = 0; i < m; i++) sum += arr[i];
    raw[count] += sum;
  }
  const total = raw[0] + raw[1] + raw[2] + raw[3];
  const probs = raw.map((p) => p / total) as [number, number, number, number];
  countCache.set(key, probs);
  return probs;
}

export interface CountPricing {
  ticks: number;
  probabilities: [number, number, number, number];
  multipliers: [number, number, number, number];
}

const countPricingCache = new Map<string, CountPricing>();

export function getCountPricing(
  ticks: number,
  config: BarrierTouchConfig = BARRIER_TOUCH_CONFIG,
): CountPricing {
  const key = `${ticks}|${config.sigma}|${config.commission}`;
  const cached = countPricingCache.get(key);
  if (cached) return cached;

  const probabilities = countBucketProbabilities(ticks, config);
  const multipliers = probabilities.map((p) =>
    offeredMultiplier(p, config.commission),
  ) as [number, number, number, number];

  const pricing: CountPricing = { ticks, probabilities, multipliers };
  countPricingCache.set(key, pricing);
  return pricing;
}

// --- Sequence mode pricing ------------------------------------------------------

/**
 * Probability of completing each round trip (touch one barrier first, then
 * the other) within `ticks`, for barriers at ±dSigma per-tick σ from the
 * entry. Stage-augmented grid: virgin corridor density, plus one density per
 * "first barrier done" stage; barrier cells absorb into the next stage.
 * The grid step h divides dSigma exactly so barriers sit on cell edges.
 */
export function sequenceCompletionProbabilities(
  dSigma: number,
  ticks: number,
  hTarget = 0.1,
  config: BarrierTouchConfig = BARRIER_TOUCH_CONFIG,
): { upperLower: number; lowerUpper: number } {
  const mu = perTickDriftSigma(config);
  const steps = Math.max(2, Math.round(dSigma / hTarget));
  const h = dSigma / steps;
  const halfCells = Math.ceil((dSigma + 6 * Math.sqrt(ticks)) / h);
  const m = 2 * halfCells;
  const kernel = gaussianKernel(m, h, mu);

  // Cell i center = (i − halfCells + 0.5)h. Barriers on edges at ±steps·h.
  const upperStart = halfCells + steps; // first cell fully above the upper barrier
  const lowerEnd = halfCells - steps; // cells [0, lowerEnd) are fully below the lower barrier

  let virgin = new Float64Array(m);
  let afterUpper = new Float64Array(m);
  let afterLower = new Float64Array(m);
  let completeUL = 0;
  let completeLU = 0;

  // First step exact from the point mass at 0.
  for (let i = 0; i < m; i++) {
    const lo = (i - halfCells) * h;
    const mass = normCdf(lo + h - mu) - normCdf(lo - mu);
    if (mass <= 0) continue;
    if (i >= upperStart) afterUpper[i] = mass;
    else if (i < lowerEnd) afterLower[i] = mass;
    else virgin[i] = mass;
  }

  let nextVirgin = new Float64Array(m);
  let nextAfterUpper = new Float64Array(m);
  let nextAfterLower = new Float64Array(m);

  for (let t = 2; t <= ticks; t++) {
    nextVirgin.fill(0);
    nextAfterUpper.fill(0);
    nextAfterLower.fill(0);

    // Existing stage densities evolve first; mass newly injected from the
    // virgin corridor this tick starts evolving next tick (a leg-2 touch is
    // only possible strictly after the leg-1 tick).
    for (let u = 0; u < m; u++) {
      const mass = afterUpper[u];
      if (mass === 0) continue;
      const base = m - 1 - u;
      for (let v = 0; v < lowerEnd; v++) completeUL += mass * kernel[base + v];
      for (let v = lowerEnd; v < m; v++) nextAfterUpper[v] += mass * kernel[base + v];
    }
    for (let u = 0; u < m; u++) {
      const mass = afterLower[u];
      if (mass === 0) continue;
      const base = m - 1 - u;
      for (let v = upperStart; v < m; v++) completeLU += mass * kernel[base + v];
      for (let v = 0; v < upperStart; v++) nextAfterLower[v] += mass * kernel[base + v];
    }
    for (let u = 0; u < m; u++) {
      const mass = virgin[u];
      if (mass === 0) continue;
      const base = m - 1 - u;
      for (let v = 0; v < lowerEnd; v++) nextAfterLower[v] += mass * kernel[base + v];
      for (let v = lowerEnd; v < upperStart; v++) nextVirgin[v] += mass * kernel[base + v];
      for (let v = upperStart; v < m; v++) nextAfterUpper[v] += mass * kernel[base + v];
    }

    let swap = virgin;
    virgin = nextVirgin;
    nextVirgin = swap;
    swap = afterUpper;
    afterUpper = nextAfterUpper;
    nextAfterUpper = swap;
    swap = afterLower;
    afterLower = nextAfterLower;
    nextAfterLower = swap;
  }

  return { upperLower: completeUL, lowerUpper: completeLU };
}

/** Calibration target: P(complete the round trip) per direction. */
const SEQUENCE_TARGET_P = 0.25;
const CALIBRATION_H = 0.2;
const BISECTION_ITERATIONS = 14;

const seqCalibrationCache = new Map<string, number>();

/**
 * Barrier offset (per-tick σ) such that the Standard-preset completion
 * probability per direction is ≈ 25% (multiplier ≈ 3.88× at 3% margin).
 */
export function calibratedSequenceOffsetSigma(
  ticks: number,
  config: BarrierTouchConfig = BARRIER_TOUCH_CONFIG,
): number {
  const key = `${ticks}|${config.sigma}|${config.dtYears}`;
  const cached = seqCalibrationCache.get(key);
  if (cached !== undefined) return cached;

  let lo = 0.3;
  let hi = 1.2 * Math.sqrt(ticks);
  for (let i = 0; i < BISECTION_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    const p = sequenceCompletionProbabilities(mid, ticks, CALIBRATION_H, config);
    // Completion probability decreases as the barriers move out.
    if (p.upperLower > SEQUENCE_TARGET_P) lo = mid;
    else hi = mid;
  }
  const d = (lo + hi) / 2;
  seqCalibrationCache.set(key, d);
  return d;
}

export interface SequencePricing {
  ticks: number;
  distanceFactor: number;
  /** Barrier distance from spot, in per-tick σ units. */
  offsetSigma: number;
  /** Barrier distance from spot, in log-price units. */
  offsetLog: number;
  pUpperLower: number;
  pLowerUpper: number;
  multUpperLower: number;
  multLowerUpper: number;
}

const seqPricingCache = new Map<string, SequencePricing>();

export function getSequencePricing(
  ticks: number,
  distanceFactor = 1,
  config: BarrierTouchConfig = BARRIER_TOUCH_CONFIG,
): SequencePricing {
  const key = `${ticks}|${distanceFactor}|${config.sigma}|${config.commission}`;
  const cached = seqPricingCache.get(key);
  if (cached) return cached;

  const offsetSigma = calibratedSequenceOffsetSigma(ticks, config) * distanceFactor;
  const probs = sequenceCompletionProbabilities(offsetSigma, ticks, 0.1, config);

  const pricing: SequencePricing = {
    ticks,
    distanceFactor,
    offsetSigma,
    offsetLog: offsetSigma * perTickSigma(config),
    pUpperLower: probs.upperLower,
    pLowerUpper: probs.lowerUpper,
    multUpperLower: offeredMultiplier(probs.upperLower, config.commission),
    multLowerUpper: offeredMultiplier(probs.lowerUpper, config.commission),
  };
  seqPricingCache.set(key, pricing);
  return pricing;
}

export interface BarrierLevels {
  upper: number;
  lower: number;
}

/** Log-symmetric barriers around the entry spot. */
export function computeBarriers(entrySpot: number, offsetLog: number): BarrierLevels {
  return {
    upper: entrySpot * Math.exp(offsetLog),
    lower: entrySpot * Math.exp(-offsetLog),
  };
}

// --- Event tracing ---------------------------------------------------------------

/**
 * Crossing tick indices for a tick series relative to the entry line.
 * Tick 1 establishes the initial side; a tick landing exactly on the line
 * keeps the previous side.
 */
export function countCrossings(prices: number[], entrySpot: number): number[] {
  const crossings: number[] = [];
  let side = 0;
  for (let t = 1; t < prices.length; t++) {
    const diff = prices[t] - entrySpot;
    const tickSide = diff > 0 ? 1 : diff < 0 ? -1 : side;
    if (side !== 0 && tickSide !== 0 && tickSide !== side) crossings.push(t);
    if (tickSide !== 0) side = tickSide;
  }
  return crossings;
}

export function bucketOf(count: number): CountBucket {
  return Math.min(count, 3) as CountBucket;
}

export interface SequenceTrace {
  firstTouch: 'upper' | 'lower' | null;
  firstTouchTick: number | null;
  completedPick: SequencePick | null;
  completionTick: number | null;
}

/**
 * First-touch and round-trip completion events for a tick series against
 * barriers (inclusive touch). Leg 2 can only complete on a tick strictly
 * after leg 1.
 */
export function traceSequence(
  prices: number[],
  upper: number,
  lower: number,
): SequenceTrace {
  let firstTouch: 'upper' | 'lower' | null = null;
  let firstTouchTick: number | null = null;
  let completedPick: SequencePick | null = null;
  let completionTick: number | null = null;

  for (let t = 1; t < prices.length; t++) {
    const p = prices[t];
    if (firstTouch === null) {
      if (p >= upper) {
        firstTouch = 'upper';
        firstTouchTick = t;
      } else if (p <= lower) {
        firstTouch = 'lower';
        firstTouchTick = t;
      }
    } else if (firstTouch === 'upper') {
      if (p <= lower) {
        completedPick = 'upperLower';
        completionTick = t;
        break;
      }
    } else if (p >= upper) {
      completedPick = 'lowerUpper';
      completionTick = t;
      break;
    }
  }

  return { firstTouch, firstTouchTick, completedPick, completionTick };
}

// --- Path generation & settlement --------------------------------------------------

export interface TouchPath {
  /** Tick prices, index 0 = entry spot, full length ticks + 1. */
  prices: number[];
  entrySpot: number;
  /** Barrier levels; null in count mode. */
  upper: number | null;
  lower: number | null;
  crossingTicks: number[];
  crossingCount: number;
  bucket: CountBucket;
  sequence: SequenceTrace | null;
}

/**
 * Pre-generates a full round of GBM ticks (never stops early — count mode
 * needs every tick, and sequence reveals decide their own settle tick).
 */
export function generateTouchPath(
  entrySpot: number,
  ticks: number,
  barriers: BarrierLevels | null,
  config: BarrierTouchConfig = BARRIER_TOUCH_CONFIG,
): TouchPath {
  const drift = -0.5 * config.sigma ** 2 * config.dtYears;
  const volStep = config.sigma * Math.sqrt(config.dtYears);

  const prices: number[] = [entrySpot];
  let logP = Math.log(entrySpot);
  for (let t = 1; t <= ticks; t++) {
    logP += drift + volStep * boxMullerTransform();
    prices.push(Math.exp(logP));
  }

  const crossingTicks = countCrossings(prices, entrySpot);

  return {
    prices,
    entrySpot,
    upper: barriers?.upper ?? null,
    lower: barriers?.lower ?? null,
    crossingTicks,
    crossingCount: crossingTicks.length,
    bucket: bucketOf(crossingTicks.length),
    sequence: barriers ? traceSequence(prices, barriers.upper, barriers.lower) : null,
  };
}

export interface TouchSettlement {
  outcome: TouchOutcome;
  payout: number;
  multiplier: number;
  /** Tick at which the outcome became known (drives the reveal length). */
  settleTick: number;
}

export function settleCount(
  pick: CountBucket,
  path: TouchPath,
  stake: number,
  multiplier: number,
): TouchSettlement {
  const won = path.bucket === pick;
  return {
    outcome: won ? 'win' : 'lose',
    payout: won ? Math.round(stake * multiplier) : 0,
    multiplier: won ? multiplier : 0,
    settleTick: path.prices.length - 1,
  };
}

export function settleSequence(
  pick: SequencePick,
  path: TouchPath,
  stake: number,
  multiplier: number,
): TouchSettlement {
  const seq = path.sequence;
  const maturity = path.prices.length - 1;
  if (!seq) {
    return { outcome: 'lose', payout: 0, multiplier: 0, settleTick: maturity };
  }

  if (seq.completedPick === pick && seq.completionTick !== null) {
    return {
      outcome: 'win',
      payout: Math.round(stake * multiplier),
      multiplier,
      settleTick: seq.completionTick,
    };
  }

  // The bet dies the moment the wrong barrier is touched first; otherwise it
  // runs to maturity as an incomplete sequence.
  const requiredFirst = pick === 'upperLower' ? 'upper' : 'lower';
  const bustedTick =
    seq.firstTouch !== null && seq.firstTouch !== requiredFirst
      ? seq.firstTouchTick
      : null;
  return {
    outcome: 'lose',
    payout: 0,
    multiplier: 0,
    settleTick: bustedTick ?? maturity,
  };
}

/** One ambient tick for the idle preview chart — same GBM as the contract. */
export function nextIdleTick(
  prev: number,
  config: BarrierTouchConfig = BARRIER_TOUCH_CONFIG,
): number {
  const drift = -0.5 * config.sigma ** 2 * config.dtYears;
  const volStep = config.sigma * Math.sqrt(config.dtYears);
  return prev * Math.exp(drift + volStep * boxMullerTransform());
}

/**
 * Distance from the price to a target level, in per-tick σ units. Zero or
 * negative once reached from below (or above for the lower barrier).
 */
export function distanceToLevelSigma(
  price: number,
  level: number,
  config: BarrierTouchConfig = BARRIER_TOUCH_CONFIG,
): number {
  return Math.abs(Math.log(level / price)) / perTickSigma(config);
}

// --- Monte Carlo validation -----------------------------------------------------

export interface CountMonteCarloResult {
  probabilities: [number, number, number, number];
  standardErrors: [number, number, number, number];
}

export function monteCarloCountEstimate(
  n: number,
  ticks: number,
  config: BarrierTouchConfig = BARRIER_TOUCH_CONFIG,
): CountMonteCarloResult {
  const drift = -0.5 * config.sigma ** 2 * config.dtYears;
  const volStep = config.sigma * Math.sqrt(config.dtYears);
  const counts = [0, 0, 0, 0];

  for (let i = 0; i < n; i++) {
    let logP = 0; // log(price / entry)
    let side = 0;
    let crossings = 0;
    for (let t = 1; t <= ticks; t++) {
      logP += drift + volStep * boxMullerTransform();
      const tickSide = logP > 0 ? 1 : logP < 0 ? -1 : side;
      if (side !== 0 && tickSide !== 0 && tickSide !== side) crossings++;
      if (tickSide !== 0) side = tickSide;
    }
    counts[Math.min(crossings, 3)]++;
  }

  const probabilities = counts.map((c) => c / n) as [number, number, number, number];
  const standardErrors = probabilities.map((p) => Math.sqrt((p * (1 - p)) / n)) as [
    number,
    number,
    number,
    number,
  ];
  return { probabilities, standardErrors };
}

export interface SequenceMonteCarloResult {
  pUpperLower: number;
  pLowerUpper: number;
  seUpperLower: number;
  seLowerUpper: number;
}

export function monteCarloSequenceEstimate(
  n: number,
  ticks: number,
  offsetSigma: number,
  config: BarrierTouchConfig = BARRIER_TOUCH_CONFIG,
): SequenceMonteCarloResult {
  const drift = -0.5 * config.sigma ** 2 * config.dtYears;
  const volStep = config.sigma * Math.sqrt(config.dtYears);
  const offsetLog = offsetSigma * perTickSigma(config);

  let completeUL = 0;
  let completeLU = 0;

  for (let i = 0; i < n; i++) {
    let logP = 0;
    // 0 = virgin, 1 = upper touched first, 2 = lower touched first.
    let stage = 0;
    for (let t = 1; t <= ticks; t++) {
      logP += drift + volStep * boxMullerTransform();
      if (stage === 0) {
        if (logP >= offsetLog) stage = 1;
        else if (logP <= -offsetLog) stage = 2;
      } else if (stage === 1) {
        if (logP <= -offsetLog) {
          completeUL++;
          break;
        }
      } else if (logP >= offsetLog) {
        completeLU++;
        break;
      }
    }
  }

  const pUpperLower = completeUL / n;
  const pLowerUpper = completeLU / n;
  const se = (p: number) => Math.sqrt((p * (1 - p)) / n);
  return {
    pUpperLower,
    pLowerUpper,
    seUpperLower: se(pUpperLower),
    seLowerUpper: se(pLowerUpper),
  };
}
