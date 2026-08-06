'use strict';

/**
 * Digit Ladder — next-digit Higher/Lower with parlay continue.
 *
 * Face digit D vs next tick last digit D′. Strict > / < wins; tie busts.
 * Pricing mirrors Digits Over/Under: mult = 1 / (base_prob + commission).
 * Mesh-shaped rounds (integer cents, locked_pricing, settlement_data).
 */

// --- Config -----------------------------------------------------------------

export interface DigitLadderConfig {
  commissionRate: number;
  instrument: string;
}

export const DIGIT_LADDER_CONFIG: DigitLadderConfig = {
  commissionRate: 0.02,
  instrument: '1HZ100V',
};

export const PRICING_MODEL = 'digit_ladder_vs_current_v1' as const;
export const GAME_VERSION = '0.1.0';
export const CONTAINER_SHA_POC = 'ideations-poc';
export const CONTRACT_TYPE = 'DIGIT_LADDER';

export type DigitLadderPick = 'higher' | 'lower';

export const PICK_LABELS: Record<
  DigitLadderPick,
  { name: string; tag: string }
> = {
  higher: { name: 'Higher', tag: 'Next digit above face' },
  lower: { name: 'Lower', tag: 'Next digit below face' },
};

// --- Money (platform_standard §23.7) ----------------------------------------

export function usdtToCents(usdt: number): number {
  return Math.round(usdt * 100);
}

export function centsToUsdt(cents: number): number {
  return cents / 100;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Integer-cent pot after applying a locked step multiplier. */
export function applyStepMult(potCents: number, mult: number): number {
  return Math.floor(potCents * mult);
}

// --- Pricing ----------------------------------------------------------------

export function isValidDigit(digit: number): boolean {
  return Number.isInteger(digit) && digit >= 0 && digit <= 9;
}

/** Fair P(Higher) = (9 − D) / 10; P(Lower) = D / 10. */
export function baseProb(pick: DigitLadderPick, entryDigit: number): number {
  if (!isValidDigit(entryDigit)) return 0;
  if (pick === 'higher') return (9 - entryDigit) / 10;
  return entryDigit / 10;
}

export function isSideOffered(pick: DigitLadderPick, entryDigit: number): boolean {
  return baseProb(pick, entryDigit) > 0;
}

/** Digits 0…9 that win for this pick given face D. */
export function winningSet(pick: DigitLadderPick, entryDigit: number): number[] {
  if (!isValidDigit(entryDigit)) return [];
  if (pick === 'higher') {
    return Array.from({ length: 9 - entryDigit }, (_, i) => entryDigit + 1 + i);
  }
  return Array.from({ length: entryDigit }, (_, i) => i);
}

export function winningSetHint(pick: DigitLadderPick, entryDigit: number): string {
  const set = winningSet(pick, entryDigit);
  if (set.length === 0) return '—';
  if (set.length === 1) return String(set[0]);
  return `${set[0]}–${set[set.length - 1]}`;
}

export interface DigitLadderSidePricing {
  pick: DigitLadderPick;
  entryDigit: number;
  baseProb: number;
  impliedProb: number;
  multiplier: number;
  offered: boolean;
}

export function priceSide(
  pick: DigitLadderPick,
  entryDigit: number,
  config: DigitLadderConfig = DIGIT_LADDER_CONFIG,
): DigitLadderSidePricing {
  const p = baseProb(pick, entryDigit);
  const offered = p > 0;
  if (!offered) {
    return {
      pick,
      entryDigit,
      baseProb: 0,
      impliedProb: 0,
      multiplier: 0,
      offered: false,
    };
  }
  const implied = round2(p + config.commissionRate);
  return {
    pick,
    entryDigit,
    baseProb: round2(p),
    impliedProb: implied,
    multiplier: Math.max(1.01, round2(1 / implied)),
    offered: true,
  };
}

export function livePricing(
  entryDigit: number | null,
  config: DigitLadderConfig = DIGIT_LADDER_CONFIG,
): { higher: DigitLadderSidePricing; lower: DigitLadderSidePricing } | null {
  if (entryDigit === null || !isValidDigit(entryDigit)) return null;
  return {
    higher: priceSide('higher', entryDigit, config),
    lower: priceSide('lower', entryDigit, config),
  };
}

// --- Round / steps ----------------------------------------------------------

export type RoundStatus = 'OPEN' | 'WON' | 'LOST';
export type RoundPhase = 'awaiting_tick' | 'decision';
export type StepResult = 'won' | 'lost';

export interface DigitLadderStepSnapshot {
  entry_digit: number;
  pick: DigitLadderPick;
  base_prob: number;
  implied_prob: number;
  multiplier: number;
}

export interface DigitLadderStepRecord extends DigitLadderStepSnapshot {
  settlement_digit: number | null;
  pot_after_cents: number | null;
  result: StepResult | null;
  quote?: string;
  epoch?: number;
}

export interface DigitLadderLockedPricing {
  pricing_model: typeof PRICING_MODEL;
  commission_rate: number;
  instrument: string;
  steps: DigitLadderStepSnapshot[];
}

export interface DigitLadderSettlementData {
  outcome: RoundStatus;
  initial_stake_cents: number;
  final_pot_cents: number;
  cash_out: boolean;
  steps: Array<{
    entry_digit: number;
    pick: DigitLadderPick;
    settlement_digit: number | null;
    step_mult: number;
    pot_after_cents: number | null;
    result: StepResult | null;
  }>;
}

export interface DigitLadderFeedSnapshot {
  instrument: string;
  ticks: Array<{ quote: string; epoch: number; last_digit: number }>;
}

export interface DigitLadderRound {
  id: string;
  contract_type: typeof CONTRACT_TYPE;
  status: RoundStatus;
  phase: RoundPhase | null;
  instrument: string;
  currency: 'USDT';
  initial_stake_cents: number;
  pot_cents: number;
  steps: DigitLadderStepRecord[];
  locked_pricing: DigitLadderLockedPricing;
  settlement_data: DigitLadderSettlementData | null;
  feed_snapshot: DigitLadderFeedSnapshot;
  game_version: string;
  container_sha: string;
  /** Face digit for the active awaiting step (entry of last open step). */
  face_digit: number;
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `dl-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function snapshotFromPricing(pricing: DigitLadderSidePricing): DigitLadderStepSnapshot {
  return {
    entry_digit: pricing.entryDigit,
    pick: pricing.pick,
    base_prob: pricing.baseProb,
    implied_prob: pricing.impliedProb,
    multiplier: pricing.multiplier,
  };
}

function rebuildLockedPricing(
  round: DigitLadderRound,
  config: DigitLadderConfig,
): DigitLadderLockedPricing {
  return {
    pricing_model: PRICING_MODEL,
    commission_rate: config.commissionRate,
    instrument: round.instrument,
    steps: round.steps.map((s) => ({
      entry_digit: s.entry_digit,
      pick: s.pick,
      base_prob: s.base_prob,
      implied_prob: s.implied_prob,
      multiplier: s.multiplier,
    })),
  };
}

function buildSettlementData(
  round: DigitLadderRound,
  outcome: RoundStatus,
  cashOut: boolean,
): DigitLadderSettlementData {
  return {
    outcome,
    initial_stake_cents: round.initial_stake_cents,
    final_pot_cents: round.pot_cents,
    cash_out: cashOut,
    steps: round.steps.map((s) => ({
      entry_digit: s.entry_digit,
      pick: s.pick,
      settlement_digit: s.settlement_digit,
      step_mult: s.multiplier,
      pot_after_cents: s.pot_after_cents,
      result: s.result,
    })),
  };
}

export function stepWins(
  pick: DigitLadderPick,
  entryDigit: number,
  settlementDigit: number,
): boolean {
  if (!isValidDigit(entryDigit) || !isValidDigit(settlementDigit)) return false;
  if (pick === 'higher') return settlementDigit > entryDigit;
  return settlementDigit < entryDigit;
}

export interface OpenRoundParams {
  stakeCents: number;
  pick: DigitLadderPick;
  entryDigit: number;
  instrument?: string;
  config?: DigitLadderConfig;
}

export function openRound(params: OpenRoundParams): DigitLadderRound {
  const config = params.config ?? DIGIT_LADDER_CONFIG;
  const instrument = params.instrument ?? config.instrument;

  if (params.stakeCents <= 0) {
    throw new Error('Stake must be positive');
  }
  if (!isValidDigit(params.entryDigit)) {
    throw new Error('Invalid entry digit');
  }

  const pricing = priceSide(params.pick, params.entryDigit, config);
  if (!pricing.offered) {
    throw new Error(`Side ${params.pick} not offered at digit ${params.entryDigit}`);
  }

  const snap = snapshotFromPricing(pricing);
  const step: DigitLadderStepRecord = {
    ...snap,
    settlement_digit: null,
    pot_after_cents: null,
    result: null,
  };

  return {
    id: newId(),
    contract_type: CONTRACT_TYPE,
    status: 'OPEN',
    phase: 'awaiting_tick',
    instrument,
    currency: 'USDT',
    initial_stake_cents: params.stakeCents,
    pot_cents: params.stakeCents,
    steps: [step],
    locked_pricing: {
      pricing_model: PRICING_MODEL,
      commission_rate: config.commissionRate,
      instrument,
      steps: [snap],
    },
    settlement_data: null,
    feed_snapshot: { instrument, ticks: [] },
    game_version: GAME_VERSION,
    container_sha: CONTAINER_SHA_POC,
    face_digit: params.entryDigit,
  };
}

export interface SettleTickMeta {
  quote?: string;
  epoch?: number;
}

/**
 * Settle the open awaiting step against settlementDigit.
 * Mutates a new round object (immutable-style return).
 */
export function settleStep(
  round: DigitLadderRound,
  settlementDigit: number,
  meta: SettleTickMeta = {},
  config: DigitLadderConfig = DIGIT_LADDER_CONFIG,
): DigitLadderRound {
  if (round.status !== 'OPEN' || round.phase !== 'awaiting_tick') {
    throw new Error('Round is not awaiting a tick');
  }
  if (!isValidDigit(settlementDigit)) {
    throw new Error('Invalid settlement digit');
  }

  const steps = round.steps.map((s) => ({ ...s }));
  const active = steps[steps.length - 1];
  if (!active || active.result !== null) {
    throw new Error('No open step to settle');
  }

  const won = stepWins(active.pick, active.entry_digit, settlementDigit);
  const next: DigitLadderRound = {
    ...round,
    steps,
    feed_snapshot: {
      instrument: round.instrument,
      ticks: [
        ...round.feed_snapshot.ticks,
        {
          quote: meta.quote ?? String(settlementDigit),
          epoch: meta.epoch ?? 0,
          last_digit: settlementDigit,
        },
      ],
    },
  };

  active.settlement_digit = settlementDigit;
  active.quote = meta.quote;
  active.epoch = meta.epoch;

  if (!won) {
    active.result = 'lost';
    active.pot_after_cents = 0;
    next.pot_cents = 0;
    next.status = 'LOST';
    next.phase = null;
    next.face_digit = settlementDigit;
    next.locked_pricing = rebuildLockedPricing(next, config);
    next.settlement_data = buildSettlementData(next, 'LOST', false);
    return next;
  }

  const newPot = applyStepMult(round.pot_cents, active.multiplier);
  active.result = 'won';
  active.pot_after_cents = newPot;
  next.pot_cents = newPot;
  next.phase = 'decision';
  next.face_digit = settlementDigit;
  next.locked_pricing = rebuildLockedPricing(next, config);
  return next;
}

export function continueRound(
  round: DigitLadderRound,
  pick: DigitLadderPick,
  entryDigit: number,
  config: DigitLadderConfig = DIGIT_LADDER_CONFIG,
): DigitLadderRound {
  if (round.status !== 'OPEN' || round.phase !== 'decision') {
    throw new Error('Round is not in decision phase');
  }
  if (!isValidDigit(entryDigit)) {
    throw new Error('Invalid entry digit');
  }
  if (entryDigit !== round.face_digit) {
    throw new Error('Continue entry digit must match face digit');
  }

  const pricing = priceSide(pick, entryDigit, config);
  if (!pricing.offered) {
    throw new Error(`Side ${pick} not offered at digit ${entryDigit}`);
  }

  const snap = snapshotFromPricing(pricing);
  const step: DigitLadderStepRecord = {
    ...snap,
    settlement_digit: null,
    pot_after_cents: null,
    result: null,
  };

  const next: DigitLadderRound = {
    ...round,
    phase: 'awaiting_tick',
    steps: [...round.steps, step],
    face_digit: entryDigit,
  };
  next.locked_pricing = rebuildLockedPricing(next, config);
  return next;
}

export function cashOut(
  round: DigitLadderRound,
  config: DigitLadderConfig = DIGIT_LADDER_CONFIG,
): DigitLadderRound {
  if (round.status !== 'OPEN' || round.phase !== 'decision') {
    throw new Error('Round is not cashable');
  }
  if (round.pot_cents <= 0) {
    throw new Error('Nothing to cash out');
  }

  const next: DigitLadderRound = {
    ...round,
    status: 'WON',
    phase: null,
  };
  next.locked_pricing = rebuildLockedPricing(next, config);
  next.settlement_data = buildSettlementData(next, 'WON', true);
  return next;
}

/** Rung count = completed winning steps (or all settled steps for display). */
export function rungCount(round: DigitLadderRound): number {
  return round.steps.filter((s) => s.result === 'won').length;
}
