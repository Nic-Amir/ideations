'use strict';

/**
 * Digit Delta — Hold a Higher/Lower digit streak, then beat the dealer on length Δ.
 *
 * Player collects digits with strict Higher/Lower; Hold at length ≥ 2.
 * House dealer: 0–3 Higher, 4–6 Stand (settle), 7–9 Lower — until stand or bust.
 * Bust → player wins with Δ = playerLen (dealer treated as 0).
 * Stand → Δ = playerLen − dealerLen (win / push / loss).
 * Mesh-shaped rounds (integer cents, locked_pricing, settlement_data).
 */

// --- Config -----------------------------------------------------------------

export interface DigitDeltaConfig {
  instrument: string;
  /** Total-return multipliers keyed by Δ (player − dealer). Δ≥max uses last entry. */
  payTable: number[];
}

/**
 * Index 0 unused; payTable[Δ] = total return incl. stake.
 * Tuned for ~97% RTP under optimal picks + Hold-at-3 (recommended).
 * Hold-at-2 is slightly worse (~95%) with stand-on-4–6 + bust-pays-playerLen.
 */
export const DEFAULT_PAY_TABLE: number[] = [
  0,
  1.5, // Δ1
  2.3, // Δ2
  3.3, // Δ3
  4.75, // Δ4
  6.75, // Δ5+
];

export const DIGIT_DELTA_CONFIG: DigitDeltaConfig = {
  instrument: '1HZ100V',
  payTable: DEFAULT_PAY_TABLE,
};

export const PRICING_MODEL = 'digit_delta_length_v2' as const;
export const PAY_TABLE_VERSION = 'v2';
export const GAME_VERSION = '0.2.0';
export const CONTAINER_SHA_POC = 'ideations-poc';
export const CONTRACT_TYPE = 'DIGIT_DELTA';

export type DigitDeltaPick = 'higher' | 'lower';

export const PICK_LABELS: Record<
  DigitDeltaPick,
  { name: string; tag: string }
> = {
  higher: { name: 'Higher', tag: 'Next digit above face' },
  lower: { name: 'Lower', tag: 'Next digit below face' },
};

export type DealerAction = 'higher' | 'lower' | 'stand';

// --- Money ------------------------------------------------------------------

export function usdtToCents(usdt: number): number {
  return Math.round(usdt * 100);
}

export function centsToUsdt(cents: number): number {
  return cents / 100;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// --- Digits / picks ---------------------------------------------------------

export function isValidDigit(digit: number): boolean {
  return Number.isInteger(digit) && digit >= 0 && digit <= 9;
}

export function baseProb(pick: DigitDeltaPick, entryDigit: number): number {
  if (!isValidDigit(entryDigit)) return 0;
  if (pick === 'higher') return (9 - entryDigit) / 10;
  return entryDigit / 10;
}

export function isSideOffered(pick: DigitDeltaPick, entryDigit: number): boolean {
  return baseProb(pick, entryDigit) > 0;
}

/** Digits 0…9 that win for this pick given face D. */
export function winningSet(pick: DigitDeltaPick, entryDigit: number): number[] {
  if (!isValidDigit(entryDigit)) return [];
  if (pick === 'higher') {
    return Array.from({ length: 9 - entryDigit }, (_, i) => entryDigit + 1 + i);
  }
  return Array.from({ length: entryDigit }, (_, i) => i);
}

export function winningSetHint(pick: DigitDeltaPick, entryDigit: number): string {
  const set = winningSet(pick, entryDigit);
  if (set.length === 0) return '—';
  if (set.length === 1) return String(set[0]);
  return `${set[0]}–${set[set.length - 1]}`;
}

export function stepWins(
  pick: DigitDeltaPick,
  entryDigit: number,
  settlementDigit: number,
): boolean {
  if (!isValidDigit(entryDigit) || !isValidDigit(settlementDigit)) return false;
  if (pick === 'higher') return settlementDigit > entryDigit;
  return settlementDigit < entryDigit;
}

/** Human-readable settle outcome for UI. */
export function compareReasonLabel(
  pick: DigitDeltaPick | 'stand',
  entryDigit: number,
  settlementDigit: number,
  won: boolean,
  side: 'player' | 'dealer' = 'player',
): string {
  if (pick === 'stand') return 'Stand';
  if (settlementDigit === entryDigit) return 'Tie · same digit';
  if (won) {
    return side === 'dealer'
      ? pick === 'higher'
        ? 'Higher · dealer collected'
        : 'Lower · dealer collected'
      : pick === 'higher'
        ? 'Higher · collected'
        : 'Lower · collected';
  }
  return pick === 'higher' ? 'Not higher' : 'Not lower';
}

/** Optimal player call for EV (D=5 → Higher by convention). */
export function optimalPick(face: number): DigitDeltaPick {
  if (face <= 5) return 'higher';
  return 'lower';
}

/**
 * House dealer decision from current face.
 * 0–3 Higher · 4–6 Stand · 7–9 Lower
 */
export function dealerAction(face: number): DealerAction {
  if (!isValidDigit(face)) {
    throw new Error('Invalid dealer face');
  }
  if (face <= 3) return 'higher';
  if (face <= 6) return 'stand';
  return 'lower';
}

export function payoutMultiplier(
  delta: number,
  payTable: number[] = DEFAULT_PAY_TABLE,
): number {
  if (delta <= 0) return 0;
  const capped = Math.min(delta, payTable.length - 1);
  return payTable[capped] ?? 0;
}

export function payoutCents(
  stakeCents: number,
  delta: number,
  payTable: number[] = DEFAULT_PAY_TABLE,
): number {
  const mult = payoutMultiplier(delta, payTable);
  if (mult <= 0) return 0;
  return Math.floor(stakeCents * mult);
}

// --- Round ------------------------------------------------------------------

export type RoundStatus = 'OPEN' | 'WON' | 'LOST' | 'REFUNDED';

export type RoundPhase =
  | 'player_decision'
  | 'awaiting_player_tick'
  | 'awaiting_dealer_face'
  | 'awaiting_dealer_tick'
  | null;

export type DealerStopReason = 'bust' | 'stand' | null;

export interface DigitDeltaPickRecord {
  face: number;
  pick: DigitDeltaPick;
  settlement_digit: number | null;
  won: boolean | null;
}

export interface DigitDeltaDealerStep {
  face: number;
  action: DealerAction;
  settlement_digit: number | null;
  /** null when action is stand (no tick). */
  won: boolean | null;
}

export interface DigitDeltaLockedPricing {
  pricing_model: typeof PRICING_MODEL;
  pay_table_version: typeof PAY_TABLE_VERSION;
  pay_table: number[];
  instrument: string;
  stake_cents: number;
}

export interface DigitDeltaSettlementData {
  outcome: RoundStatus;
  initial_stake_cents: number;
  payout_cents: number;
  player_len: number;
  dealer_len: number;
  delta: number;
  settle_reason:
    | 'player_bust'
    | 'dealer_bust'
    | 'length_win'
    | 'length_tie'
    | 'length_loss';
  dealer_stop_reason: DealerStopReason;
  player_digits: number[];
  dealer_digits: number[];
  player_picks: DigitDeltaPickRecord[];
  dealer_steps: DigitDeltaDealerStep[];
}

export interface DigitDeltaFeedSnapshot {
  instrument: string;
  ticks: Array<{ quote: string; epoch: number; last_digit: number }>;
}

export interface DigitDeltaRound {
  id: string;
  contract_type: typeof CONTRACT_TYPE;
  status: RoundStatus;
  phase: RoundPhase;
  instrument: string;
  currency: 'USDT';
  initial_stake_cents: number;
  payout_cents: number;
  player_digits: number[];
  dealer_digits: number[];
  player_picks: DigitDeltaPickRecord[];
  dealer_steps: DigitDeltaDealerStep[];
  pending_player_pick: DigitDeltaPick | null;
  pending_dealer_action: DealerAction | null;
  dealer_stop_reason: DealerStopReason;
  locked_pricing: DigitDeltaLockedPricing;
  settlement_data: DigitDeltaSettlementData | null;
  feed_snapshot: DigitDeltaFeedSnapshot;
  game_version: string;
  container_sha: string;
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `dd-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function playerLen(round: DigitDeltaRound): number {
  return round.player_digits.length;
}

export function dealerLen(round: DigitDeltaRound): number {
  return round.dealer_digits.length;
}

export function playerFace(round: DigitDeltaRound): number {
  return round.player_digits[round.player_digits.length - 1]!;
}

export function dealerFace(round: DigitDeltaRound): number {
  return round.dealer_digits[round.dealer_digits.length - 1]!;
}

export function canHold(round: DigitDeltaRound): boolean {
  return (
    round.status === 'OPEN' &&
    round.phase === 'player_decision' &&
    playerLen(round) >= 2
  );
}

function appendFeed(
  round: DigitDeltaRound,
  digit: number,
  meta: { quote?: string; epoch?: number },
): DigitDeltaFeedSnapshot {
  return {
    instrument: round.instrument,
    ticks: [
      ...round.feed_snapshot.ticks,
      {
        quote: meta.quote ?? String(digit),
        epoch: meta.epoch ?? 0,
        last_digit: digit,
      },
    ],
  };
}

function finalize(
  round: DigitDeltaRound,
  outcome: RoundStatus,
  settleReason: DigitDeltaSettlementData['settle_reason'],
  config: DigitDeltaConfig,
  /** Settlement Δ used for payout (may differ from raw pLen − dLen on bust). */
  delta: number,
): DigitDeltaRound {
  const pLen = playerLen(round);
  const dLen = dealerLen(round);
  let payout = 0;
  if (outcome === 'WON') {
    payout = payoutCents(round.initial_stake_cents, delta, config.payTable);
  } else if (outcome === 'REFUNDED') {
    payout = round.initial_stake_cents;
  }

  const settlement_data: DigitDeltaSettlementData = {
    outcome,
    initial_stake_cents: round.initial_stake_cents,
    payout_cents: payout,
    player_len: pLen,
    dealer_len: dLen,
    delta,
    settle_reason: settleReason,
    dealer_stop_reason: round.dealer_stop_reason,
    player_digits: [...round.player_digits],
    dealer_digits: [...round.dealer_digits],
    player_picks: round.player_picks.map((p) => ({ ...p })),
    dealer_steps: round.dealer_steps.map((s) => ({ ...s })),
  };

  return {
    ...round,
    status: outcome,
    phase: null,
    payout_cents: payout,
    pending_player_pick: null,
    pending_dealer_action: null,
    settlement_data,
  };
}

export interface OpenRoundParams {
  stakeCents: number;
  faceDigit: number;
  instrument?: string;
  config?: DigitDeltaConfig;
}

export function openRound(params: OpenRoundParams): DigitDeltaRound {
  const config = params.config ?? DIGIT_DELTA_CONFIG;
  const instrument = params.instrument ?? config.instrument;

  if (params.stakeCents <= 0) {
    throw new Error('Stake must be positive');
  }
  if (!isValidDigit(params.faceDigit)) {
    throw new Error('Invalid face digit');
  }

  return {
    id: newId(),
    contract_type: CONTRACT_TYPE,
    status: 'OPEN',
    phase: 'player_decision',
    instrument,
    currency: 'USDT',
    initial_stake_cents: params.stakeCents,
    payout_cents: 0,
    player_digits: [params.faceDigit],
    dealer_digits: [],
    player_picks: [],
    dealer_steps: [],
    pending_player_pick: null,
    pending_dealer_action: null,
    dealer_stop_reason: null,
    locked_pricing: {
      pricing_model: PRICING_MODEL,
      pay_table_version: PAY_TABLE_VERSION,
      pay_table: [...config.payTable],
      instrument,
      stake_cents: params.stakeCents,
    },
    settlement_data: null,
    feed_snapshot: { instrument, ticks: [] },
    game_version: GAME_VERSION,
    container_sha: CONTAINER_SHA_POC,
  };
}

export function lockPlayerPick(
  round: DigitDeltaRound,
  pick: DigitDeltaPick,
): DigitDeltaRound {
  if (round.status !== 'OPEN' || round.phase !== 'player_decision') {
    throw new Error('Round is not in player decision');
  }
  const face = playerFace(round);
  if (!isSideOffered(pick, face)) {
    throw new Error(`Side ${pick} not offered at digit ${face}`);
  }

  return {
    ...round,
    phase: 'awaiting_player_tick',
    pending_player_pick: pick,
    player_picks: [
      ...round.player_picks,
      { face, pick, settlement_digit: null, won: null },
    ],
  };
}

export interface TickMeta {
  quote?: string;
  epoch?: number;
}

export function settlePlayerTick(
  round: DigitDeltaRound,
  settlementDigit: number,
  meta: TickMeta = {},
  config: DigitDeltaConfig = DIGIT_DELTA_CONFIG,
): DigitDeltaRound {
  if (round.status !== 'OPEN' || round.phase !== 'awaiting_player_tick') {
    throw new Error('Round is not awaiting a player tick');
  }
  if (!isValidDigit(settlementDigit)) {
    throw new Error('Invalid settlement digit');
  }
  const pick = round.pending_player_pick;
  if (!pick) {
    throw new Error('No pending player pick');
  }

  const face = playerFace(round);
  const won = stepWins(pick, face, settlementDigit);
  const picks = round.player_picks.map((p, i) =>
    i === round.player_picks.length - 1
      ? { ...p, settlement_digit: settlementDigit, won }
      : p,
  );

  let next: DigitDeltaRound = {
    ...round,
    player_picks: picks,
    pending_player_pick: null,
    feed_snapshot: appendFeed(round, settlementDigit, meta),
  };

  if (!won) {
    return finalize(next, 'LOST', 'player_bust', config, 0);
  }

  next = {
    ...next,
    player_digits: [...next.player_digits, settlementDigit],
    phase: 'player_decision',
  };
  return next;
}

export function hold(round: DigitDeltaRound): DigitDeltaRound {
  if (!canHold(round)) {
    throw new Error('Cannot Hold yet');
  }
  return {
    ...round,
    phase: 'awaiting_dealer_face',
  };
}

/**
 * Deal dealer opening face. If face is 4–6, Stand and settle immediately.
 */
export function dealDealerFace(
  round: DigitDeltaRound,
  faceDigit: number,
  meta: TickMeta = {},
  config: DigitDeltaConfig = DIGIT_DELTA_CONFIG,
): DigitDeltaRound {
  if (round.status !== 'OPEN' || round.phase !== 'awaiting_dealer_face') {
    throw new Error('Round is not awaiting dealer face');
  }
  if (!isValidDigit(faceDigit)) {
    throw new Error('Invalid dealer face');
  }

  const action = dealerAction(faceDigit);
  let next: DigitDeltaRound = {
    ...round,
    dealer_digits: [faceDigit],
    feed_snapshot: appendFeed(round, faceDigit, meta),
  };

  if (action === 'stand') {
    next = {
      ...next,
      dealer_steps: [
        ...next.dealer_steps,
        { face: faceDigit, action: 'stand', settlement_digit: null, won: null },
      ],
      dealer_stop_reason: 'stand',
      pending_dealer_action: null,
    };
    return settleVsDealer(next, config);
  }

  return {
    ...next,
    phase: 'awaiting_dealer_tick',
    pending_dealer_action: action,
    dealer_steps: [
      ...next.dealer_steps,
      { face: faceDigit, action, settlement_digit: null, won: null },
    ],
  };
}

export function settleDealerTick(
  round: DigitDeltaRound,
  settlementDigit: number,
  meta: TickMeta = {},
  config: DigitDeltaConfig = DIGIT_DELTA_CONFIG,
): DigitDeltaRound {
  if (round.status !== 'OPEN' || round.phase !== 'awaiting_dealer_tick') {
    throw new Error('Round is not awaiting a dealer tick');
  }
  if (!isValidDigit(settlementDigit)) {
    throw new Error('Invalid settlement digit');
  }
  const action = round.pending_dealer_action;
  if (action !== 'higher' && action !== 'lower') {
    throw new Error('No pending dealer Higher/Lower call');
  }

  const face = dealerFace(round);
  const won = stepWins(action, face, settlementDigit);
  const steps = round.dealer_steps.map((s, i) =>
    i === round.dealer_steps.length - 1
      ? { ...s, settlement_digit: settlementDigit, won }
      : s,
  );

  let next: DigitDeltaRound = {
    ...round,
    dealer_steps: steps,
    pending_dealer_action: null,
    feed_snapshot: appendFeed(round, settlementDigit, meta),
  };

  if (!won) {
    next = { ...next, dealer_stop_reason: 'bust' };
    return settleVsDealer(next, config);
  }

  next = {
    ...next,
    dealer_digits: [...next.dealer_digits, settlementDigit],
  };

  const nextAction = dealerAction(settlementDigit);
  if (nextAction === 'stand') {
    next = {
      ...next,
      dealer_steps: [
        ...next.dealer_steps,
        {
          face: settlementDigit,
          action: 'stand',
          settlement_digit: null,
          won: null,
        },
      ],
      dealer_stop_reason: 'stand',
      phase: null,
    };
    return settleVsDealer(next, config);
  }

  return {
    ...next,
    phase: 'awaiting_dealer_tick',
    pending_dealer_action: nextAction,
    dealer_steps: [
      ...next.dealer_steps,
      {
        face: settlementDigit,
        action: nextAction,
        settlement_digit: null,
        won: null,
      },
    ],
  };
}

function settleVsDealer(
  round: DigitDeltaRound,
  config: DigitDeltaConfig,
): DigitDeltaRound {
  const pLen = playerLen(round);
  const dLen = dealerLen(round);

  // Dealer bust → player wins; treat dealer length as 0 for Δ.
  if (round.dealer_stop_reason === 'bust') {
    return finalize(round, 'WON', 'dealer_bust', config, pLen);
  }

  const delta = pLen - dLen;
  if (delta > 0) {
    return finalize(round, 'WON', 'length_win', config, delta);
  }
  if (delta === 0) {
    return finalize(round, 'REFUNDED', 'length_tie', config, delta);
  }
  return finalize(round, 'LOST', 'length_loss', config, delta);
}

// --- RTP simulation ---------------------------------------------------------

export interface RtpSimOptions {
  trials?: number;
  /** Hold when player length reaches this (default 2). */
  holdAt?: number;
  payTable?: number[];
  seed?: number;
}

export interface RtpSimResult {
  trials: number;
  holdAt: number;
  totalStake: number;
  totalReturn: number;
  rtp: number;
  wins: number;
  losses: number;
  refunds: number;
  playerBusts: number;
  avgDeltaWhenWon: number;
}

/** Mulberry32 PRNG for deterministic sims. */
function makeRng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function randDigit(rng: () => number): number {
  return Math.floor(rng() * 10);
}

/**
 * Monte Carlo RTP under uniform digits, optimal player picks, Hold-at-N.
 * Stake = 100 cents per trial for integer math.
 */
export function simulateRtp(options: RtpSimOptions = {}): RtpSimResult {
  const trials = options.trials ?? 50_000;
  const holdAt = options.holdAt ?? 2;
  const payTable = options.payTable ?? DEFAULT_PAY_TABLE;
  const rng = makeRng(options.seed ?? 42);
  const config: DigitDeltaConfig = {
    ...DIGIT_DELTA_CONFIG,
    payTable,
  };
  const stake = 100;

  let totalReturn = 0;
  let wins = 0;
  let losses = 0;
  let refunds = 0;
  let playerBusts = 0;
  let wonDeltaSum = 0;

  for (let i = 0; i < trials; i++) {
    let round = openRound({
      stakeCents: stake,
      faceDigit: randDigit(rng),
      config,
    });

    // Player collect until Hold or bust
    while (round.status === 'OPEN' && round.phase === 'player_decision') {
      if (playerLen(round) >= holdAt) {
        round = hold(round);
        break;
      }
      const pick = optimalPick(playerFace(round));
      round = lockPlayerPick(round, pick);
      round = settlePlayerTick(round, randDigit(rng), {}, config);
    }

    if (round.status === 'LOST') {
      losses++;
      playerBusts++;
      continue;
    }

    // Dealer
    round = dealDealerFace(round, randDigit(rng), {}, config);
    while (round.status === 'OPEN' && round.phase === 'awaiting_dealer_tick') {
      round = settleDealerTick(round, randDigit(rng), {}, config);
    }

    totalReturn += round.payout_cents;
    if (round.status === 'WON') {
      wins++;
      wonDeltaSum += round.settlement_data?.delta ?? 0;
    } else if (round.status === 'REFUNDED') {
      refunds++;
    } else {
      losses++;
    }
  }

  const totalStake = trials * stake;
  return {
    trials,
    holdAt,
    totalStake,
    totalReturn,
    rtp: totalReturn / totalStake,
    wins,
    losses,
    refunds,
    playerBusts,
    avgDeltaWhenWon: wins > 0 ? wonDeltaSum / wins : 0,
  };
}
