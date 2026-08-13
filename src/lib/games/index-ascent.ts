'use strict';

import type { CrashSymbol, CrashSymbolInfo } from '@/types';
import { CRASH_SYMBOLS } from '@/types';

export const MAX_MULTIPLIER = 100;
export const MIN_CASHOUT_MULTIPLIER = 1.01;

/**
 * Relative drop threshold for crash detection. Between crash events the
 * synthetic ascent index drifts strictly upward, and every negative move is
 * a crash event. Any decrease beyond float noise therefore counts as a crash.
 */
export const CRASH_DROP_THRESHOLD = 1e-7;

export function getCrashSymbolInfo(symbol: CrashSymbol): CrashSymbolInfo {
  const info = CRASH_SYMBOLS.find((s) => s.id === symbol);
  if (!info) throw new Error(`Unknown ascent symbol: ${symbol}`);
  return info;
}

/** Per-tick crash probability p = 1/N for a house-rounded N. */
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
 * Paid growth multiplier after surviving k ticks: (1+g)^k.
 * House edge comes from paying labeled g while crashing at p = 1/N where
 * N is house-rounded below the exact fair N = (1+g)/g.
 */
export function getGrowthMultiplier(ticksSurvived: number, growthRate: number): number {
  if (ticksSurvived <= 0) return 1;
  return Math.pow(1 + growthRate, ticksSurvived);
}

/**
 * Displayed multiplier: growth curve floored at 1.00, capped at MAX_MULTIPLIER.
 * No separate display-edge multiplier.
 */
export function getDisplayedMultiplier(ticksSurvived: number, growthRate: number): number {
  const growth = getGrowthMultiplier(ticksSurvived, growthRate);
  return Math.min(Math.max(growth, 1), MAX_MULTIPLIER);
}

/**
 * Number of survived ticks required for the displayed multiplier to reach
 * the target. Returns Infinity if the target exceeds the multiplier cap.
 */
export function getTicksToReachMultiplier(target: number, growthRate: number): number {
  if (target > MAX_MULTIPLIER) return Infinity;
  if (target <= 1) return 0;
  if (growthRate <= 0) return Infinity;
  // (1+g)^k >= target  =>  k >= ln(target) / ln(1+g)
  return Math.ceil(Math.log(target) / Math.log(1 + growthRate));
}

/** Probability of surviving at least k more ticks: (1-p)^k. */
export function getSurvivalProbability(ticks: number, avgTicksPerCrash: number): number {
  if (ticks <= 0) return 1;
  const p = getPerTickCrashProbability(avgTicksPerCrash);
  return Math.pow(1 - p, ticks);
}

/** Process RTP at cash-out after k ticks (uncapped): [(1-p)(1+g)]^k. */
export function getProcessRtp(ticksSurvived: number, avgTicksPerCrash: number, growthRate: number): number {
  if (ticksSurvived <= 0) return 1;
  const p = getPerTickCrashProbability(avgTicksPerCrash);
  return Math.pow((1 - p) * (1 + growthRate), ticksSurvived);
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
  growthRate: number,
  autoCashoutTarget: number | null
): CrashTickOutcome {
  if (isCrashTick(prevQuote, quote)) {
    return {
      crashed: true,
      ticksSurvived,
      multiplier: getDisplayedMultiplier(ticksSurvived, growthRate),
      autoCashedOut: false,
    };
  }

  const nextTicks = ticksSurvived + 1;
  const multiplier = getDisplayedMultiplier(nextTicks, growthRate);
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
export function getMilestoneTable(
  avgTicksPerCrash: number,
  growthRate: number
): CrashMilestone[] {
  const targets = [1.1, 1.25, 1.5, 2, 3, 5, 10, 25, 50, 100];
  return targets.map((multiplier) => {
    const ticks = getTicksToReachMultiplier(multiplier, growthRate);
    return {
      multiplier,
      ticks,
      seconds: ticks, // ascent indices tick once per second
      survivalProb: getSurvivalProbability(ticks, avgTicksPerCrash),
    };
  });
}
