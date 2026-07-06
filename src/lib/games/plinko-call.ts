'use strict';

/**
 * "Call your shot" side bet — the player optionally calls the display band
 * (core / micro / inner / mid / outer / extreme, both sides) they think the
 * path will land in. The side bet is priced from the exact normal-CDF band
 * probabilities at the same 98% RTP as the base game.
 */

import type { BarrierZone, PlinkoModeId } from '@/lib/games/plinko-modes';
import { getPlinkoMode } from '@/lib/games/plinko-modes';
import { getZoneProbabilities } from '@/lib/games/plinko';

export type CallGroup = BarrierZone['displayGroup'];

export const CALLABLE_GROUPS: CallGroup[] = [
  'core',
  'micro',
  'inner',
  'mid',
  'outer',
  'extreme',
];

export const CALL_RTP = 0.98;

/** Side-bet stake as a fraction of the main stake. */
export const CALL_STAKE_FRACTION = 0.25;

export interface ShotCall {
  group: CallGroup;
  stake: number;
  odds: number;
}

/**
 * Probability that a run lands in the given display band (either side).
 * Core is a single central band; every other group has a + and a − band.
 */
export function getCallProbability(group: CallGroup): number {
  const probs = getZoneProbabilities();
  if (group === 'core') return probs.core;
  return 2 * probs[group];
}

/**
 * Offered odds on a called band: fair odds at 98% RTP, floored to 2 decimals
 * so rounding never favors the player.
 */
export function getCallOdds(group: CallGroup): number {
  const p = getCallProbability(group);
  const raw = CALL_RTP / p;
  return Math.floor(raw * 100) / 100;
}

export function getCallStake(mainStake: number): number {
  return Math.max(1, Math.round(mainStake * CALL_STAKE_FRACTION));
}

export function buildShotCall(group: CallGroup, mainStake: number): ShotCall {
  return {
    group,
    stake: getCallStake(mainStake),
    odds: getCallOdds(group),
  };
}

/** A call hits when the landing zone belongs to the called display band. */
export function isCallHit(
  group: CallGroup,
  zoneIndex: number,
  modeId: PlinkoModeId,
): boolean {
  const zone = getPlinkoMode(modeId).config.zones[zoneIndex];
  return zone !== undefined && zone.displayGroup === group;
}

/** Net P&L of a settled call (win pays stake × odds; stake is always spent). */
export function settleCall(
  call: ShotCall,
  zoneIndex: number,
  modeId: PlinkoModeId,
): { hit: boolean; winAmount: number; net: number } {
  const hit = isCallHit(call.group, zoneIndex, modeId);
  const winAmount = hit ? call.stake * call.odds : 0;
  return { hit, winAmount, net: winAmount - call.stake };
}

export const CALL_GROUP_LABELS: Record<CallGroup, string> = {
  core: 'Core',
  micro: 'Micro',
  inner: 'Inner',
  mid: 'Mid',
  outer: 'Outer',
  extreme: 'Extreme',
};
