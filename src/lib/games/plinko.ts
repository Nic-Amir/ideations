'use strict';

import type { PlinkoRisk } from '@/types';

export interface BarrierZone {
  label: string;
  minSigma: number;
  maxSigma: number;
  payout: number;
  color: string;
}

export interface RiskConfig {
  tickCount: number;
  sigma: number;
  targetRTP: number;
  zones: BarrierZone[];
}

/**
 * European multi-barrier option zones.
 * Barriers at ±1σ, ±2σ, ±3σ, ±4σ of effective volatility.
 * Zone probabilities assume Z ~ N(0,1) for analytical RTP (see getZoneProbabilities).
 *
 * GBM drift gap: each step applies drift -(σ²/2)Δt with μ=0, so the terminal
 * log-return mean is slightly negative vs the symmetric normal model. Empirical
 * RTP is validated by Monte Carlo; payouts are calibrated to simulated RTP.
 *
 * Zone probabilities (standard normal CDF):
 *   Center  (|Z| < 1): 68.27%
 *   Inner   (1-2):     27.18%  (13.59% per side)
 *   Mid     (2-3):      4.28%
 *   Outer   (3-4):      0.26%
 *   Extreme (>4):       0.006%
 */
function buildBarrierZones(payouts: {
  center: number;
  inner: number;
  mid: number;
  outer: number;
  extreme: number;
}): BarrierZone[] {
  return [
    { label: 'Extreme +', minSigma: 4, maxSigma: Infinity, payout: payouts.extreme, color: '#FF3B5C' },
    { label: 'Outer +',   minSigma: 3, maxSigma: 4,        payout: payouts.outer,   color: '#FF6B35' },
    { label: 'Mid +',     minSigma: 2, maxSigma: 3,        payout: payouts.mid,     color: '#FFB347' },
    { label: 'Inner +',   minSigma: 1, maxSigma: 2,        payout: payouts.inner,   color: '#00D4AA' },
    { label: 'Center',    minSigma: 0, maxSigma: 1,        payout: payouts.center,  color: '#7B8794' },
    { label: 'Inner -',   minSigma: 1, maxSigma: 2,        payout: payouts.inner,   color: '#00D4AA' },
    { label: 'Mid -',     minSigma: 2, maxSigma: 3,        payout: payouts.mid,     color: '#FFB347' },
    { label: 'Outer -',   minSigma: 3, maxSigma: 4,        payout: payouts.outer,   color: '#FF6B35' },
    { label: 'Extreme -', minSigma: 4, maxSigma: Infinity, payout: payouts.extreme, color: '#FF3B5C' },
  ];
}

/** Payout ladder per risk — calibrated via Monte Carlo to targetRTP. */
const RISK_CONFIGS: Record<PlinkoRisk, RiskConfig> = {
  low: {
    tickCount: 8,
    sigma: 0.15,
    targetRTP: 0.97,
    zones: buildBarrierZones({ center: 0.5, inner: 1.75, mid: 3, outer: 10, extreme: 25 }),
  },
  medium: {
    tickCount: 12,
    sigma: 0.35,
    targetRTP: 0.96,
    zones: buildBarrierZones({ center: 0.29, inner: 1.5, mid: 5, outer: 50, extreme: 170 }),
  },
  high: {
    tickCount: 16,
    sigma: 0.60,
    targetRTP: 0.95,
    zones: buildBarrierZones({ center: 0.034, inner: 2, mid: 5, outer: 50, extreme: 1000 }),
  },
};

export type ZoneBand = 'center' | 'inner' | 'mid' | 'outer' | 'extreme';

export interface ZoneBandProbabilities {
  center: number;
  inner: number;
  mid: number;
  outer: number;
  extreme: number;
}

/** Standard normal CDF (Abramowitz & Stegun). */
export function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-(x * x) / 2);
  const p =
    d *
    t *
    (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

/** Per-side band probabilities under Z ~ N(0,1). */
export function getZoneProbabilities(): ZoneBandProbabilities {
  return {
    center: 2 * normalCDF(1) - 1,
    inner: normalCDF(2) - normalCDF(1),
    mid: normalCDF(3) - normalCDF(2),
    outer: normalCDF(4) - normalCDF(3),
    extreme: 1 - normalCDF(4),
  };
}

/** Analytical RTP assuming symmetric Z ~ N(0,1) zone hits. */
export function computeAnalyticalRTP(risk: PlinkoRisk): number {
  const config = RISK_CONFIGS[risk];
  const probs = getZoneProbabilities();
  const center = config.zones[4].payout;
  const inner = config.zones[3].payout;
  const mid = config.zones[2].payout;
  const outer = config.zones[1].payout;
  const extreme = config.zones[0].payout;
  return (
    probs.center * center +
    2 * (probs.inner * inner + probs.mid * mid + probs.outer * outer + probs.extreme * extreme)
  );
}

/** Monte Carlo RTP using the live GBM engine (includes drift). */
export function computeSimulatedRTP(risk: PlinkoRisk, n: number): number {
  let total = 0;
  for (let i = 0; i < n; i++) {
    total += generateVolatilityRun(risk).payout;
  }
  return total / n;
}

/** Net win: payout multiplier covers the stake (>= 1×). */
export function isNetWin(payout: number): boolean {
  return payout >= 1;
}

// ---------------------------------------------------------------------------
// Target mode — pick a zone, payout priced from hit probability.
// Modeled on Box-O band pricing: multiplier = (1 / pHit) × (1 − margin), capped.
// Payouts are risk-independent because zones are defined in Z-score space.
// ---------------------------------------------------------------------------

export const TARGET_MARGIN = 0.05;
export const TARGET_PAYOUT_CAP = 1000;

/**
 * Probability that the terminal Z lands in a specific zone index.
 * Center (index 4) spans both sides (|Z| < 1); all other zones are
 * single-sided sigma bands.
 */
export function getZoneHitProbability(zoneIndex: number): number {
  const p = getZoneProbabilities();
  switch (zoneIndex) {
    case 4:
      return p.center;
    case 3:
    case 5:
      return p.inner;
    case 2:
    case 6:
      return p.mid;
    case 1:
    case 7:
      return p.outer;
    case 0:
    case 8:
      return p.extreme;
    default:
      return 0;
  }
}

/** Locked multiplier for a target-zone bet. */
export function getTargetPayout(zoneIndex: number): number {
  const prob = getZoneHitProbability(zoneIndex);
  if (prob <= 0) return 0;
  const raw = (1 - TARGET_MARGIN) / prob;
  return Math.min(TARGET_PAYOUT_CAP, Math.round(raw * 100) / 100);
}

/** Assert center < inner < mid < outer < extreme for a risk preset. */
export function isMonotonicLadder(risk: PlinkoRisk): boolean {
  const z = RISK_CONFIGS[risk].zones;
  const center = z[4].payout;
  const inner = z[3].payout;
  const mid = z[2].payout;
  const outer = z[1].payout;
  const extreme = z[0].payout;
  return center < inner && inner < mid && mid < outer && outer < extreme;
}

export function getZoneLabel(risk: PlinkoRisk, zoneIndex: number): string {
  return RISK_CONFIGS[risk].zones[zoneIndex]?.label ?? 'Center';
}

export function getZoneColor(risk: PlinkoRisk, zoneIndex: number): string {
  return RISK_CONFIGS[risk].zones[zoneIndex]?.color ?? '#7B8794';
}

export function getMaxPayout(risk: PlinkoRisk): number {
  return RISK_CONFIGS[risk].zones[0].payout;
}

export function getRiskConfig(risk: PlinkoRisk): RiskConfig {
  return RISK_CONFIGS[risk];
}

function boxMullerTransform(): number {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  const u1 = (buf[0] + 1) / (0xFFFFFFFF + 2);
  const u2 = (buf[1] + 1) / (0xFFFFFFFF + 2);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function generateGBMQuote(currentPrice: number, sigma: number, dt: number = 1): number {
  const mu = 0;
  const z = boxMullerTransform();
  const drift = (mu - (sigma * sigma) / 2) * dt;
  const diffusion = sigma * Math.sqrt(dt) * z;
  return currentPrice * Math.exp(drift + diffusion);
}

export function extractLastDigitFromQuote(quote: number): number {
  const str = quote.toFixed(2).replace('.', '');
  return parseInt(str[str.length - 1], 10);
}

/**
 * Compute the effective volatility for a run configuration.
 * scaledSigma adjusts the base sigma so that the total path variance
 * is proportional to tickCount, then sigma_eff is the std dev of the
 * total log return over all ticks.
 */
export function computeSigmaEff(sigma: number, tickCount: number): number {
  const dt = 0.01;
  const scaledSigma = sigma / Math.sqrt(100 / tickCount);
  return scaledSigma * Math.sqrt(tickCount * dt);
}

/**
 * Compute the actual price levels for each barrier given risk config.
 * Returns an array of { sigma: number, price: number } for barriers
 * at ±1σ, ±2σ, ±3σ, ±4σ relative to startPrice.
 */
export function getBarrierPriceLevels(
  risk: PlinkoRisk,
  startPrice: number = 1000,
): { sigma: number; price: number }[] {
  const config = RISK_CONFIGS[risk];
  const sigmaEff = computeSigmaEff(config.sigma, config.tickCount);
  const levels: { sigma: number; price: number }[] = [];
  for (const k of [-4, -3, -2, -1, 1, 2, 3, 4]) {
    levels.push({ sigma: k, price: startPrice * Math.exp(k * sigmaEff) });
  }
  return levels;
}

/**
 * Resolve the Z-score of the final log return into a zone index and payout.
 * Zones 0-4 = positive side (Extreme+, Outer+, Mid+, Inner+, Center)
 * Zones 5-8 = negative side (Inner-, Mid-, Outer-, Extreme-)
 */
export function resolveZone(
  logReturn: number,
  sigmaEff: number,
  zones: BarrierZone[],
): { zoneIndex: number; payout: number; zScore: number } {
  const zScore = sigmaEff > 0 ? logReturn / sigmaEff : 0;
  const absZ = Math.abs(zScore);
  const isPositive = zScore >= 0;

  if (isPositive) {
    for (let i = 0; i < 5; i++) {
      const zone = zones[i];
      if (absZ >= zone.minSigma && (absZ < zone.maxSigma || zone.maxSigma === Infinity)) {
        return { zoneIndex: i, payout: zone.payout, zScore };
      }
    }
    return { zoneIndex: 4, payout: zones[4].payout, zScore };
  } else {
    for (let i = 8; i >= 5; i--) {
      const zone = zones[i];
      if (absZ >= zone.minSigma && (absZ < zone.maxSigma || zone.maxSigma === Infinity)) {
        return { zoneIndex: i, payout: zone.payout, zScore };
      }
    }
    return { zoneIndex: 4, payout: zones[4].payout, zScore };
  }
}

export interface VolatilityRun {
  quotes: number[];
  digits: number[];
  startPrice: number;
  endPrice: number;
  percentChange: number;
  zScore: number;
  zoneIndex: number;
  payout: number;
  isPositive: boolean;
}

export function generateVolatilityRun(risk: PlinkoRisk): VolatilityRun {
  const config = RISK_CONFIGS[risk];
  const { tickCount, sigma } = config;
  const scaledSigma = sigma / Math.sqrt(100 / tickCount);
  const sigmaEff = computeSigmaEff(sigma, tickCount);

  const startPrice = 1000;
  const quotes: number[] = [startPrice];
  const digits: number[] = [];
  let currentPrice = startPrice;

  for (let i = 0; i < tickCount; i++) {
    const quote = generateGBMQuote(currentPrice, scaledSigma, 0.01);
    currentPrice = quote;
    quotes.push(quote);
    digits.push(extractLastDigitFromQuote(quote));
  }

  const endPrice = quotes[quotes.length - 1];
  const percentChange = (endPrice - startPrice) / startPrice;
  const logReturn = Math.log(endPrice / startPrice);
  const { zoneIndex, payout, zScore } = resolveZone(logReturn, sigmaEff, config.zones);

  return {
    quotes,
    digits,
    startPrice,
    endPrice,
    percentChange,
    zScore,
    zoneIndex,
    payout,
    isPositive: percentChange >= 0,
  };
}
