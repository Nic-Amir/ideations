'use strict';

import type { PlinkoModeId, PlinkoConfig, BarrierZone } from '@/lib/games/plinko-modes';
import {
  DEFAULT_PLINKO_MODE,
  getPlinkoMode,
  isNearMissForMode,
  resolveZoneForMode,
  STRIPE_CORE_INDEX,
} from '@/lib/games/plinko-modes';

export type { BarrierZone, PlinkoConfig, PlinkoModeId, PlinkoModeDefinition, PlinkoChartStyle } from '@/lib/games/plinko-modes';
export {
  PLINKO_MODES,
  PLINKO_MODE_IDS,
  DEFAULT_PLINKO_MODE,
  getPlinkoMode,
  resolveZoneForMode,
  isNearMissForMode,
  SPLIT_CORE_INDEX,
  STRIPE_CORE_INDEX,
  buildStripeZones,
} from '@/lib/games/plinko-modes';

/** Wall-clock path reveal — smooth interpolation over full quote series. */
export const PLINKO_PATH_ANIM_MS = 1500;
export const PLINKO_SETTLE_MS = 500;
export const PLINKO_START_PRICE = 10000;
export const PLINKO_REFERENCE_TICK_COUNT = 60;
export const PLINKO_GBM_HORIZON = 0.6;

export const CORE_ZONE_INDEX = 5;

export function getPlinkoStepDt(tickCount: number = getPlinkoConfig().tickCount): number {
  return PLINKO_GBM_HORIZON / tickCount;
}

export function getPlinkoScaledSigma(
  sigma: number = getPlinkoConfig().sigma,
  tickCount: number = getPlinkoConfig().tickCount,
): number {
  return sigma / Math.sqrt(tickCount / PLINKO_REFERENCE_TICK_COUNT);
}

export function getPlinkoAnimTickMs(tickCount: number = getPlinkoConfig().tickCount): number {
  return PLINKO_PATH_ANIM_MS / tickCount;
}

export function getPlinkoConfig(modeId: PlinkoModeId = DEFAULT_PLINKO_MODE): PlinkoConfig {
  return getPlinkoMode(modeId).config;
}

export function getZoneCount(modeId: PlinkoModeId = DEFAULT_PLINKO_MODE): number {
  return getPlinkoConfig(modeId).zones.length;
}

export const ZONE_COUNT = 11;

export type ZoneBand = 'core' | 'micro' | 'inner' | 'mid' | 'outer' | 'extreme';

export interface ZoneBandProbabilities {
  core: number;
  micro: number;
  inner: number;
  mid: number;
  outer: number;
  extreme: number;
}

export function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-(x * x) / 2);
  const p =
    d *
    t *
    (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

export function getZoneProbabilities(): ZoneBandProbabilities {
  return {
    core: 2 * normalCDF(0.5) - 1,
    micro: normalCDF(1) - normalCDF(0.5),
    inner: normalCDF(2) - normalCDF(1),
    mid: normalCDF(3) - normalCDF(2),
    outer: normalCDF(4) - normalCDF(3),
    extreme: 1 - normalCDF(4),
  };
}

export function computeNetWinRate(modeId: PlinkoModeId = 'split'): number {
  const probs = getZoneProbabilities();
  const z = getPlinkoConfig(modeId).zones;
  let rate = 0;
  for (const zone of z) {
    if (zone.payout < 1) continue;
    if (zone.displayGroup === 'core') rate += probs.core;
    else if (zone.displayGroup === 'micro') rate += probs.micro;
    else if (zone.displayGroup === 'inner') rate += probs.inner;
    else if (zone.displayGroup === 'mid') rate += probs.mid;
    else if (zone.displayGroup === 'outer') rate += probs.outer;
    else if (zone.displayGroup === 'extreme') rate += probs.extreme;
  }
  return Math.min(rate, 1);
}

export function computeAnalyticalRTP(modeId: PlinkoModeId = 'split'): number {
  const probs = getZoneProbabilities();
  const zones = getPlinkoConfig(modeId).zones;
  const coreIdx = modeId === 'balanced' ? STRIPE_CORE_INDEX : CORE_ZONE_INDEX;
  const core = zones[coreIdx].payout;
  const micro = zones[coreIdx - 1].payout;
  const inner = zones[coreIdx - 2].payout;
  const mid = zones[coreIdx - 3].payout;
  const outer = zones[coreIdx - 4].payout;
  const extreme = zones[coreIdx - 5].payout;
  return (
    probs.core * core +
    2 * probs.micro * micro +
    2 * (probs.inner * inner + probs.mid * mid + probs.outer * outer + probs.extreme * extreme)
  );
}

export function isNetWin(payout: number): boolean {
  return payout >= 1;
}

export function isNearMiss(
  zoneIndex: number,
  zScore: number,
  modeId: PlinkoModeId = DEFAULT_PLINKO_MODE,
): boolean {
  return isNearMissForMode(modeId, zoneIndex, zScore);
}

export function isMonotonicLadder(modeId: PlinkoModeId = 'split'): boolean {
  if (modeId !== 'split') return false;
  const z = getPlinkoConfig(modeId).zones;
  const core = z[CORE_ZONE_INDEX].payout;
  return (
    core < z[4].payout &&
    z[4].payout < z[3].payout &&
    z[3].payout < z[2].payout &&
    z[2].payout < z[1].payout &&
    z[1].payout < z[0].payout
  );
}

export function getZoneLabel(zoneIndex: number, modeId: PlinkoModeId = DEFAULT_PLINKO_MODE): string {
  return getPlinkoConfig(modeId).zones[zoneIndex]?.label ?? 'Core';
}

export function getZoneColor(zoneIndex: number, modeId: PlinkoModeId = DEFAULT_PLINKO_MODE): string {
  return getPlinkoConfig(modeId).zones[zoneIndex]?.color ?? '#7B8794';
}

export function getMaxPayout(modeId: PlinkoModeId = DEFAULT_PLINKO_MODE): number {
  const zones = getPlinkoConfig(modeId).zones;
  return Math.max(...zones.map((z) => z.payout));
}

export function getDisplayZoneGroups(modeId: PlinkoModeId = DEFAULT_PLINKO_MODE): {
  group: BarrierZone['displayGroup'];
  label: string;
  payout: number;
  color: string;
}[] {
  const mode = getPlinkoMode(modeId);
  const zones = mode.config.zones;

  const order: BarrierZone['displayGroup'][] = ['extreme', 'outer', 'mid', 'inner', 'micro', 'core'];
  const labels: Record<BarrierZone['displayGroup'], string> = {
    extreme: 'Extreme',
    outer: 'Outer',
    mid: 'Mid',
    inner: 'Inner',
    micro: 'Micro',
    core: 'Core',
  };
  return order.map((group) => {
    const idx = zones.findIndex((z) => z.displayGroup === group);
    const zone = zones[idx]!;
    return {
      group,
      label: labels[group],
      payout: zone.payout,
      color: zone.color,
    };
  });
}

function boxMullerTransform(): number {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  const u1 = (buf[0] + 1) / (0xffffffff + 2);
  const u2 = (buf[1] + 1) / (0xffffffff + 2);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function generateGBMQuote(currentPrice: number, sigma: number, dt: number = 1): number {
  const z = boxMullerTransform();
  const drift = (-(sigma * sigma) / 2) * dt;
  return currentPrice * Math.exp(drift + sigma * Math.sqrt(dt) * z);
}

export function computeSigmaEff(
  sigma: number = getPlinkoConfig().sigma,
  tickCount: number = getPlinkoConfig().tickCount,
): number {
  const scaledSigma = getPlinkoScaledSigma(sigma, tickCount);
  const dt = getPlinkoStepDt(tickCount);
  return scaledSigma * Math.sqrt(tickCount * dt);
}

/**
 * One-shot terminal log-return — equivalent to simulating all GBM steps with dt = horizon/tickCount.
 * Use for RTP calibration/Monte Carlo instead of stepping tick-by-tick.
 */
export function sampleTerminalLogReturn(
  sigma: number = getPlinkoConfig().sigma,
  tickCount: number = getPlinkoConfig().tickCount,
): number {
  const scaledSigma = getPlinkoScaledSigma(sigma, tickCount);
  const dt = getPlinkoStepDt(tickCount);
  const mu = (-(scaledSigma * scaledSigma) / 2) * tickCount * dt;
  const sigmaEff = computeSigmaEff(sigma, tickCount);
  return mu + sigmaEff * boxMullerTransform();
}

/** Settlement-only simulation (no quote array). Matches full-path RTP. */
export function simulatePlinkoPayout(modeId: PlinkoModeId = DEFAULT_PLINKO_MODE): number {
  const config = getPlinkoConfig(modeId);
  const logReturn = sampleTerminalLogReturn(config.sigma, config.tickCount);
  const sigmaEff = computeSigmaEff(config.sigma, config.tickCount);
  return resolveZoneForMode(modeId, logReturn, sigmaEff, config.zones).payout;
}

export function computeSimulatedRTP(n: number, modeId: PlinkoModeId = DEFAULT_PLINKO_MODE): number {
  let total = 0;
  for (let i = 0; i < n; i++) {
    total += simulatePlinkoPayout(modeId);
  }
  return total / n;
}

export function getBarrierPriceLevels(
  startPrice: number = PLINKO_START_PRICE,
  modeId: PlinkoModeId = DEFAULT_PLINKO_MODE,
): { sigma: number; price: number }[] {
  const { sigma, tickCount } = getPlinkoConfig(modeId);
  const sigmaEff = computeSigmaEff(sigma, tickCount);
  const levels: { sigma: number; price: number }[] = [];
  for (const k of [-4, -3, -2, -1, -0.5, 0.5, 1, 2, 3, 4]) {
    levels.push({ sigma: k, price: startPrice * Math.exp(k * sigmaEff) });
  }
  return levels;
}

/** @deprecated Use resolveZoneForMode */
export function resolveZone(
  logReturn: number,
  sigmaEff: number,
  zones: BarrierZone[],
): { zoneIndex: number; payout: number; zScore: number } {
  return resolveZoneForMode('split', logReturn, sigmaEff, zones);
}

export interface VolatilityRun {
  quotes: number[];
  startPrice: number;
  endPrice: number;
  percentChange: number;
  zScore: number;
  zoneIndex: number;
  payout: number;
  isPositive: boolean;
}

export function generateVolatilityRun(modeId: PlinkoModeId = DEFAULT_PLINKO_MODE): VolatilityRun {
  const config = getPlinkoConfig(modeId);
  const { tickCount, sigma } = config;
  const scaledSigma = getPlinkoScaledSigma(sigma, tickCount);
  const dt = getPlinkoStepDt(tickCount);
  const sigmaEff = computeSigmaEff(sigma, tickCount);

  const startPrice = PLINKO_START_PRICE;
  const quotes: number[] = [startPrice];
  let currentPrice = startPrice;

  for (let i = 0; i < tickCount; i++) {
    currentPrice = generateGBMQuote(currentPrice, scaledSigma, dt);
    quotes.push(currentPrice);
  }

  const endPrice = quotes[quotes.length - 1];
  const percentChange = (endPrice - startPrice) / startPrice;
  const logReturn = Math.log(endPrice / startPrice);
  const { zoneIndex, payout, zScore } = resolveZoneForMode(
    modeId,
    logReturn,
    sigmaEff,
    config.zones,
  );

  return {
    quotes,
    startPrice,
    endPrice,
    percentChange,
    zScore,
    zoneIndex,
    payout,
    isPositive: percentChange >= 0,
  };
}

export function estimateLiveZScore(
  currentPrice: number,
  startPrice: number = PLINKO_START_PRICE,
  modeId: PlinkoModeId = DEFAULT_PLINKO_MODE,
): number {
  const { sigma, tickCount } = getPlinkoConfig(modeId);
  const sigmaEff = computeSigmaEff(sigma, tickCount);
  if (sigmaEff <= 0) return 0;
  return Math.log(currentPrice / startPrice) / sigmaEff;
}

export function getDistanceToNextZoneLabel(
  zScore: number,
  modeId: PlinkoModeId = DEFAULT_PLINKO_MODE,
): string | null {
  const absZ = Math.abs(zScore);
  if (modeId === 'simple') {
    if (absZ >= 1) return 'In the win zone';
    return `${(1 - absZ).toFixed(2)}σ to the win zone`;
  }
  if (absZ < 0.5) {
    const dist = 0.5 - absZ;
    return modeId === 'balanced'
      ? `${dist.toFixed(2)}σ to Slot 5/7`
      : `${dist.toFixed(2)}σ to Micro`;
  }
  if (absZ < 1) return `${(1 - absZ).toFixed(2)}σ to next slot`;
  if (absZ < 2) return `${(2 - absZ).toFixed(2)}σ to next slot`;
  if (absZ < 3) return `${(3 - absZ).toFixed(2)}σ to next slot`;
  if (absZ < 4) return `${(4 - absZ).toFixed(2)}σ to edge slot`;
  return modeId === 'balanced' ? 'Edge slot' : 'Extreme zone';
}
