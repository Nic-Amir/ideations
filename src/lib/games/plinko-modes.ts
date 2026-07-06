'use strict';

export interface BarrierZone {
  label: string;
  minSigma: number;
  maxSigma: number;
  payout: number;
  color: string;
  displayGroup: 'extreme' | 'outer' | 'mid' | 'inner' | 'core' | 'micro';
}

export interface PlinkoConfig {
  tickCount: number;
  sigma: number;
  targetRTP: number;
  zones: BarrierZone[];
}

export type PlinkoModeId = 'split' | 'balanced';

export type PlinkoChartStyle = 'ladder';

export interface PlinkoModeDefinition {
  id: PlinkoModeId;
  label: string;
  shortPitch: string;
  config: PlinkoConfig;
  coreZoneIndex: number | null;
  chartStyle: PlinkoChartStyle;
}

const BASE_TICK = 3600;
const BASE_SIGMA = 0.35;
const TARGET_RTP = 0.98;

/** Split ladder — teal center, blue tails (brand primary at extreme). */
export const LADDER_GROUP_COLORS: Record<BarrierZone['displayGroup'], string> = {
  extreme: '#2323FF',
  outer: '#3D52FF',
  mid: '#6B84FF',
  inner: '#00D4AA',
  micro: '#4ECDC4',
  core: '#7B8794',
};

function ladderColor(group: BarrierZone['displayGroup']): string {
  return LADDER_GROUP_COLORS[group];
}

function buildSplitZones(payouts: {
  core: number;
  micro: number;
  inner: number;
  mid: number;
  outer: number;
  extreme: number;
}): BarrierZone[] {
  return [
    { label: 'Extreme +', minSigma: 4, maxSigma: Infinity, payout: payouts.extreme, color: ladderColor('extreme'), displayGroup: 'extreme' },
    { label: 'Outer +', minSigma: 3, maxSigma: 4, payout: payouts.outer, color: ladderColor('outer'), displayGroup: 'outer' },
    { label: 'Mid +', minSigma: 2, maxSigma: 3, payout: payouts.mid, color: ladderColor('mid'), displayGroup: 'mid' },
    { label: 'Inner +', minSigma: 1, maxSigma: 2, payout: payouts.inner, color: ladderColor('inner'), displayGroup: 'inner' },
    { label: 'Micro +', minSigma: 0.5, maxSigma: 1, payout: payouts.micro, color: ladderColor('micro'), displayGroup: 'micro' },
    { label: 'Core', minSigma: 0, maxSigma: 0.5, payout: payouts.core, color: ladderColor('core'), displayGroup: 'core' },
    { label: 'Micro -', minSigma: 0.5, maxSigma: 1, payout: payouts.micro, color: ladderColor('micro'), displayGroup: 'micro' },
    { label: 'Inner -', minSigma: 1, maxSigma: 2, payout: payouts.inner, color: ladderColor('inner'), displayGroup: 'inner' },
    { label: 'Mid -', minSigma: 2, maxSigma: 3, payout: payouts.mid, color: ladderColor('mid'), displayGroup: 'mid' },
    { label: 'Outer -', minSigma: 3, maxSigma: 4, payout: payouts.outer, color: ladderColor('outer'), displayGroup: 'outer' },
    { label: 'Extreme -', minSigma: 4, maxSigma: Infinity, payout: payouts.extreme, color: ladderColor('extreme'), displayGroup: 'extreme' },
  ];
}

/** Stripes strip tints — win = inner green, loss = fixed red (not split ladder). */
export const STRIPE_WIN_COLOR = LADDER_GROUP_COLORS.inner;
export const STRIPE_LOSS_COLOR = '#FF3B5C';

export function stripePayoutColor(payout: number): string {
  return payout >= 1 ? STRIPE_WIN_COLOR : STRIPE_LOSS_COLOR;
}

/** Stripes wall — strip color follows payout (green win / red loss). */
export function buildStripeZones(payouts: {
  core: number;
  micro: number;
  inner: number;
  mid: number;
  outer: number;
  extreme: number;
}): BarrierZone[] {
  const c = (payout: number) => stripePayoutColor(payout);
  return [
    { label: 'Extreme +', minSigma: 4, maxSigma: Infinity, payout: payouts.extreme, color: c(payouts.extreme), displayGroup: 'extreme' },
    { label: 'Outer +', minSigma: 3, maxSigma: 4, payout: payouts.outer, color: c(payouts.outer), displayGroup: 'outer' },
    { label: 'Mid +', minSigma: 2, maxSigma: 3, payout: payouts.mid, color: c(payouts.mid), displayGroup: 'mid' },
    { label: 'Inner +', minSigma: 1, maxSigma: 2, payout: payouts.inner, color: c(payouts.inner), displayGroup: 'inner' },
    { label: 'Micro +', minSigma: 0.5, maxSigma: 1, payout: payouts.micro, color: c(payouts.micro), displayGroup: 'micro' },
    { label: 'Core', minSigma: 0, maxSigma: 0.5, payout: payouts.core, color: c(payouts.core), displayGroup: 'core' },
    { label: 'Micro -', minSigma: 0.5, maxSigma: 1, payout: payouts.micro, color: c(payouts.micro), displayGroup: 'micro' },
    { label: 'Inner -', minSigma: 1, maxSigma: 2, payout: payouts.inner, color: c(payouts.inner), displayGroup: 'inner' },
    { label: 'Mid -', minSigma: 2, maxSigma: 3, payout: payouts.mid, color: c(payouts.mid), displayGroup: 'mid' },
    { label: 'Outer -', minSigma: 3, maxSigma: 4, payout: payouts.outer, color: c(payouts.outer), displayGroup: 'outer' },
    { label: 'Extreme -', minSigma: 4, maxSigma: Infinity, payout: payouts.extreme, color: c(payouts.extreme), displayGroup: 'extreme' },
  ];
}

export const SPLIT_CORE_INDEX = 5;
export const STRIPE_CORE_INDEX = 5;

export function resolveZoneForMode(
  modeId: PlinkoModeId,
  logReturn: number,
  sigmaEff: number,
  zones: BarrierZone[],
): { zoneIndex: number; payout: number; zScore: number } {
  const zScore = sigmaEff > 0 ? logReturn / sigmaEff : 0;
  const absZ = Math.abs(zScore);
  const coreIdx = modeId === 'balanced' ? STRIPE_CORE_INDEX : SPLIT_CORE_INDEX;

  if (absZ < 0.5) {
    return { zoneIndex: coreIdx, payout: zones[coreIdx].payout, zScore };
  }
  if (zScore >= 0) {
    for (let i = 0; i < coreIdx; i++) {
      const zone = zones[i];
      if (absZ >= zone.minSigma && (absZ < zone.maxSigma || zone.maxSigma === Infinity)) {
        return { zoneIndex: i, payout: zone.payout, zScore };
      }
    }
  } else {
    for (let i = zones.length - 1; i > coreIdx; i--) {
      const zone = zones[i];
      if (absZ >= zone.minSigma && (absZ < zone.maxSigma || zone.maxSigma === Infinity)) {
        return { zoneIndex: i, payout: zone.payout, zScore };
      }
    }
  }
  return { zoneIndex: coreIdx, payout: zones[coreIdx].payout, zScore };
}

export function isNearMissForMode(
  modeId: PlinkoModeId,
  zoneIndex: number,
  zScore: number,
): boolean {
  if (modeId !== 'split') return false;
  return zoneIndex === SPLIT_CORE_INDEX && Math.abs(zScore) >= 0.38;
}

export const PLINKO_MODES: Record<PlinkoModeId, PlinkoModeDefinition> = {
  split: {
    id: 'split',
    label: 'Split',
    shortPitch: 'Hunt the tails, dodge the core',
    coreZoneIndex: SPLIT_CORE_INDEX,
    chartStyle: 'ladder',
    config: {
      tickCount: BASE_TICK,
      sigma: BASE_SIGMA,
      targetRTP: TARGET_RTP,
      zones: buildSplitZones({
        core: 0.23,
        micro: 1.2,
        inner: 1.42,
        mid: 2.76,
        outer: 9.13,
        extreme: 37.58,
      }),
    },
  },
  balanced: {
    id: 'balanced',
    label: 'Stripes',
    shortPitch: 'Same wall — mixed payouts per band',
    coreZoneIndex: STRIPE_CORE_INDEX,
    chartStyle: 'ladder',
    config: {
      tickCount: BASE_TICK,
      sigma: BASE_SIGMA,
      targetRTP: TARGET_RTP,
      zones: buildStripeZones({
        core: 0.72,
        micro: 1.61,
        inner: 0.48,
        mid: 2.07,
        outer: 0.32,
        extreme: 3.88,
      }),
    },
  },
};

export const PLINKO_MODE_IDS = Object.keys(PLINKO_MODES) as PlinkoModeId[];

export const DEFAULT_PLINKO_MODE: PlinkoModeId = 'split';

export function getPlinkoMode(id: PlinkoModeId = DEFAULT_PLINKO_MODE): PlinkoModeDefinition {
  return PLINKO_MODES[id] ?? PLINKO_MODES.split;
}

export function isPlinkoModeId(value: string): value is PlinkoModeId {
  return value in PLINKO_MODES;
}
