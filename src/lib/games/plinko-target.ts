'use strict';

/**
 * Target bet type — pick a band group, get paid by its hit probability.
 *
 * Modeled on trading-game Box-O band pricing:
 *   multiplier = (1 / pHit) × (1 − margin), capped.
 * Terms are locked at placement; settlement only checks whether the
 * terminal zone's displayGroup matches the locked target.
 *
 * Orthogonal to the wall pricing modes (Split/Stripes): the same GBM path
 * and zone resolution are used, only the payout rule differs.
 */

import type { BarrierZone, PlinkoModeId } from '@/lib/games/plinko-modes';
import { getPlinkoMode } from '@/lib/games/plinko-modes';
import { getZoneProbabilities } from '@/lib/games/plinko';

export type PlinkoBetType = 'wall' | 'target';

export type TargetGroup = BarrierZone['displayGroup'];

export const TARGET_GROUPS: TargetGroup[] = [
  'core',
  'micro',
  'inner',
  'mid',
  'outer',
  'extreme',
];

export const TARGET_GROUP_LABELS: Record<TargetGroup, string> = {
  core: 'Core',
  micro: 'Micro',
  inner: 'Inner',
  mid: 'Mid',
  outer: 'Outer',
  extreme: 'Extreme',
};

/** Matches the wall's 98% RTP: 2% margin off fair odds. */
export const TARGET_MARGIN = 0.02;
export const TARGET_PAYOUT_CAP = 500;

/**
 * Two-sided hit probability for a band group (path can land on either the
 * + or − side of the wall). Core spans both sides by construction.
 */
export function getTargetHitProbability(group: TargetGroup): number {
  const p = getZoneProbabilities();
  switch (group) {
    case 'core':
      return p.core;
    case 'micro':
      return 2 * p.micro;
    case 'inner':
      return 2 * p.inner;
    case 'mid':
      return 2 * p.mid;
    case 'outer':
      return 2 * p.outer;
    case 'extreme':
      return 2 * p.extreme;
    default:
      return 0;
  }
}

/** Locked multiplier for a target bet on a band group. */
export function getTargetPayout(group: TargetGroup): number {
  const prob = getTargetHitProbability(group);
  if (prob <= 0) return 0;
  const raw = (1 - TARGET_MARGIN) / prob;
  return Math.min(TARGET_PAYOUT_CAP, Math.round(raw * 100) / 100);
}

/** Did the resolved zone land inside the targeted band group (either side)? */
export function isTargetHit(
  group: TargetGroup,
  zoneIndex: number,
  modeId: PlinkoModeId,
): boolean {
  const zones = getPlinkoMode(modeId).config.zones;
  return zones[zoneIndex]?.displayGroup === group;
}

/** Map an absolute Z-score to the band group it falls in. */
export function groupForAbsZ(absZ: number): TargetGroup {
  if (absZ < 0.5) return 'core';
  if (absZ < 1) return 'micro';
  if (absZ < 2) return 'inner';
  if (absZ < 3) return 'mid';
  if (absZ < 4) return 'outer';
  return 'extreme';
}

export function formatTargetProbability(group: TargetGroup): string {
  const p = getTargetHitProbability(group) * 100;
  return `${p.toFixed(p < 1 ? 3 : 1)}%`;
}
