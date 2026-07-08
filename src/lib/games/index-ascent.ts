'use strict';

import type { CrashSymbol, CrashSymbolInfo } from '@/types';
import { CRASH_SYMBOLS } from '@/types';

export const CRASH_HOUSE_EDGE = 0.02;
export const MAX_MULTIPLIER = 100;
export const MIN_CASHOUT_MULTIPLIER = 1.01;

/**
 * Relative drop threshold for crash detection. Between crash events, Deriv
 * Crash indices tick strictly upward (empirically max +0.004% per tick), and
 * every negative move is a crash event (smallest observed ~-0.002%). Any
 * decrease beyond float noise therefore counts as a crash.
 */
export const CRASH_DROP_THRESHOLD = 1e-7;

export function getCrashSymbolInfo(symbol: CrashSymbol): CrashSymbolInfo {
  const info = CRASH_SYMBOLS.find((s) => s.id === symbol);
  if (!info) throw new Error(`Unknown crash symbol: ${symbol}`);
  return info;
}

/** Per-tick crash probability p = 1/N for a Crash N index. */
export function getPerTickCrashProbability(avgTicksPerCrash: number): number {
  if (avgTicksPerCrash <= 0) return 0;
  return 1 / avgTicksPerCrash;
}

/**
 * A crash tick is any tick where the quote moves down. Between crashes the
 * index drifts strictly upward, so a relative drop is the crash event itself.
 */
export function isCrashTick(prevQuote: number, quote: number): boolean {
  if (!Number.isFinite(prevQuote) || !Number.isFinite(quote) || prevQuote <= 0) {
    return false;
  }
  return (prevQuote - quote) / prevQuote > CRASH_DROP_THRESHOLD;
}

/**
 * Fair cashout multiplier after surviving k ticks: 1 / (1-p)^k.
 * The geometric crash distribution is memoryless, so this holds from any
 * entry tick.
 */
export function getFairMultiplier(ticksSurvived: number, avgTicksPerCrash: number): number {
  if (ticksSurvived <= 0) return 1;
  const p = getPerTickCrashProbability(avgTicksPerCrash);
  return Math.pow(1 - p, -ticksSurvived);
}

/**
 * Displayed multiplier with house edge applied, floored at 1.00 pre-cashout,
 * capped at MAX_MULTIPLIER.
 */
export function getDisplayedMultiplier(
  ticksSurvived: number,
  avgTicksPerCrash: number
): number {
  const fair = getFairMultiplier(ticksSurvived, avgTicksPerCrash);
  const displayed = fair * (1 - CRASH_HOUSE_EDGE);
  return Math.min(Math.max(displayed, 1), MAX_MULTIPLIER);
}

/**
 * Number of survived ticks required for the displayed multiplier to reach
 * the target. Returns Infinity if the target exceeds the multiplier cap.
 */
export function getTicksToReachMultiplier(
  target: number,
  avgTicksPerCrash: number
): number {
  if (target > MAX_MULTIPLIER) return Infinity;
  if (target <= 1) return 0;
  const p = getPerTickCrashProbability(avgTicksPerCrash);
  const fairTarget = target / (1 - CRASH_HOUSE_EDGE);
  // (1-p)^-k >= fairTarget  =>  k >= ln(fairTarget) / -ln(1-p)
  return Math.ceil(Math.log(fairTarget) / -Math.log(1 - p));
}

/** Probability of surviving at least k more ticks: (1-p)^k. */
export function getSurvivalProbability(ticks: number, avgTicksPerCrash: number): number {
  if (ticks <= 0) return 1;
  const p = getPerTickCrashProbability(avgTicksPerCrash);
  return Math.pow(1 - p, ticks);
}

export interface CrashTickOutcome {
  crashed: boolean;
  ticksSurvived: number;
  multiplier: number;
  /** Set when an auto-cashout target was reached on this tick. */
  autoCashedOut: boolean;
}

/**
 * Advance an active round by one tick. Crash is evaluated first: a crash
 * tick busts the bet even if the auto-cashout target would have been reached
 * on the same tick (the crash event terminates the climb).
 */
export function applyTick(
  prevQuote: number,
  quote: number,
  ticksSurvived: number,
  avgTicksPerCrash: number,
  autoCashoutTarget: number | null
): CrashTickOutcome {
  if (isCrashTick(prevQuote, quote)) {
    return {
      crashed: true,
      ticksSurvived,
      multiplier: getDisplayedMultiplier(ticksSurvived, avgTicksPerCrash),
      autoCashedOut: false,
    };
  }

  const nextTicks = ticksSurvived + 1;
  const multiplier = getDisplayedMultiplier(nextTicks, avgTicksPerCrash);
  const autoCashedOut =
    autoCashoutTarget !== null &&
    autoCashoutTarget >= MIN_CASHOUT_MULTIPLIER &&
    multiplier >= autoCashoutTarget;

  return { crashed: false, ticksSurvived: nextTicks, multiplier, autoCashedOut };
}

export interface CrashMilestone {
  multiplier: number;
  ticks: number;
  seconds: number;
  survivalProb: number;
}

/** Milestone table (time to reach common cashout targets) for the info drawer. */
export function getMilestoneTable(avgTicksPerCrash: number): CrashMilestone[] {
  const targets = [1.1, 1.25, 1.5, 2, 3, 5, 10, 25, 50, 100];
  return targets.map((multiplier) => {
    const ticks = getTicksToReachMultiplier(multiplier, avgTicksPerCrash);
    return {
      multiplier,
      ticks,
      seconds: ticks, // crash indices tick once per second
      survivalProb: getSurvivalProbability(ticks, avgTicksPerCrash),
    };
  });
}
