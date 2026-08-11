'use strict';

import { describe, expect, test } from 'vitest';
import {
  DEFAULT_PAY_TABLE,
  MIN_STOP_LENGTH,
  AUTO_WIN_LENGTH,
  AUTO_WIN_PAYOUT_MULT,
  canHold,
  compareReasonLabel,
  dealDealerFace,
  dealerAction,
  hold,
  lockPlayerPick,
  openRound,
  optimalPick,
  payoutCents,
  payoutCentsFromMult,
  payoutMultiplier,
  playerLen,
  settleDealerTick,
  settlePlayerTick,
  simulateRtp,
  stepOutcome,
  stepWins,
  winningSetHint,
} from '@/lib/games/digit-delta';

describe('dealerAction', () => {
  test('length 1: never Stand — must call (optimal)', () => {
    for (let d = 0; d <= 5; d++) {
      expect(dealerAction(d, 1)).toBe('higher');
    }
    for (let d = 6; d <= 9; d++) {
      expect(dealerAction(d, 1)).toBe('lower');
    }
  });

  test(`length ≥ ${MIN_STOP_LENGTH}: 0–3 Higher, 4–6 Stand, 7–9 Lower`, () => {
    for (const len of [2, 3, 5]) {
      for (let d = 0; d <= 3; d++) expect(dealerAction(d, len)).toBe('higher');
      for (let d = 4; d <= 6; d++) expect(dealerAction(d, len)).toBe('stand');
      for (let d = 7; d <= 9; d++) expect(dealerAction(d, len)).toBe('lower');
    }
  });
});

describe('stepWins / stepOutcome', () => {
  test('strict compare; equal is not a win', () => {
    expect(stepWins('higher', 5, 7)).toBe(true);
    expect(stepWins('higher', 5, 5)).toBe(false);
    expect(stepWins('lower', 5, 3)).toBe(true);
    expect(stepWins('lower', 5, 5)).toBe(false);
  });

  test('equal → reroll; wrong way → bust; right way → collect', () => {
    expect(stepOutcome('higher', 5, 5)).toBe('reroll');
    expect(stepOutcome('higher', 5, 3)).toBe('bust');
    expect(stepOutcome('higher', 5, 7)).toBe('collect');
    expect(stepOutcome('lower', 5, 5)).toBe('reroll');
    expect(stepOutcome('lower', 5, 7)).toBe('bust');
  });
});

describe('compareReasonLabel / winningSetHint', () => {
  test('labels reroll, not higher, collected', () => {
    expect(compareReasonLabel('higher', 5, 5, false, 'player', 'reroll')).toBe(
      'Reroll · not collected',
    );
    expect(compareReasonLabel('higher', 5, 3, false)).toBe('Not higher');
    expect(compareReasonLabel('lower', 5, 7, false)).toBe('Not lower');
    expect(compareReasonLabel('higher', 5, 8, true)).toBe('Higher · collected');
    expect(compareReasonLabel('higher', 5, 8, true, 'dealer')).toBe(
      'Higher · dealer collected',
    );
  });

  test('winning set hints', () => {
    expect(winningSetHint('higher', 5)).toBe('6–9');
    expect(winningSetHint('lower', 5)).toBe('0–4');
    expect(winningSetHint('higher', 9)).toBe('—');
  });
});

describe('payout table', () => {
  test('tapered Δ table + auto-win jackpot mult', () => {
    expect(payoutMultiplier(0)).toBe(0);
    expect(payoutMultiplier(1)).toBe(2.25);
    expect(payoutMultiplier(2)).toBe(2.55);
    expect(payoutMultiplier(5)).toBe(3.15);
    expect(payoutMultiplier(9)).toBe(3.15); // capped
    expect(payoutCents(100, 1)).toBe(225);
    expect(payoutCents(100, 2)).toBe(254); // floor(100 * 2.55)
    expect(AUTO_WIN_PAYOUT_MULT).toBe(3.6);
    expect(payoutCentsFromMult(100, AUTO_WIN_PAYOUT_MULT)).toBe(360);
  });
});

describe('player collect → Hold → dealer', () => {
  test('player bust on wrong call', () => {
    let round = openRound({ stakeCents: 100, faceDigit: 5 });
    expect(playerLen(round)).toBe(1);
    expect(canHold(round)).toBe(false);
    round = lockPlayerPick(round, 'higher');
    round = settlePlayerTick(round, 2);
    expect(round.status).toBe('LOST');
    expect(round.settlement_data?.settle_reason).toBe('player_bust');
    expect(round.payout_cents).toBe(0);
  });

  test('opening face 4–6 must call — never Stand at length 1', () => {
    for (const face of [4, 5, 6]) {
      let round = openRound({ stakeCents: 100, faceDigit: 0 });
      round = lockPlayerPick(round, 'higher');
      round = settlePlayerTick(round, 9);
      round = hold(round);
      round = dealDealerFace(round, face);
      expect(round.status).toBe('OPEN');
      expect(round.phase).toBe('awaiting_dealer_tick');
      expect(round.dealer_stop_reason).toBeNull();
      expect(round.pending_dealer_action).toBe(face <= 5 ? 'higher' : 'lower');
    }
  });

  test('Hold at 2 → dealer collects then stands on 4 → tie refund', () => {
    let round = openRound({ stakeCents: 100, faceDigit: 0 });
    round = lockPlayerPick(round, 'higher');
    round = settlePlayerTick(round, 9);
    expect(canHold(round)).toBe(true);
    expect(playerLen(round)).toBe(2);
    round = hold(round);
    // Dealer 0 → Higher; tick 4 → Stand at len 2 → tie
    round = dealDealerFace(round, 0);
    expect(round.pending_dealer_action).toBe('higher');
    round = settleDealerTick(round, 4);
    expect(round.status).toBe('REFUNDED');
    expect(round.dealer_stop_reason).toBe('stand');
    expect(round.settlement_data?.settle_reason).toBe('length_tie');
    expect(round.settlement_data?.delta).toBe(0);
    expect(round.payout_cents).toBe(100);
  });

  test('equal digit → reroll; then collect', () => {
    let round = openRound({ stakeCents: 100, faceDigit: 5 });
    round = lockPlayerPick(round, 'higher');
    round = settlePlayerTick(round, 5);
    expect(round.status).toBe('OPEN');
    expect(round.phase).toBe('awaiting_player_tick');
    expect(round.pending_player_pick).toBe('higher');
    expect(playerLen(round)).toBe(1);
    round = settlePlayerTick(round, 8);
    expect(round.status).toBe('OPEN');
    expect(round.phase).toBe('player_decision');
    expect(playerLen(round)).toBe(2);
  });

  test('dealer equal → reroll; then collect to stand', () => {
    let round = openRound({ stakeCents: 100, faceDigit: 0 });
    round = lockPlayerPick(round, 'higher');
    round = settlePlayerTick(round, 9);
    round = hold(round);
    round = dealDealerFace(round, 0);
    round = settleDealerTick(round, 0); // equal → reroll
    expect(round.status).toBe('OPEN');
    expect(round.phase).toBe('awaiting_dealer_tick');
    expect(round.pending_dealer_action).toBe('higher');
    round = settleDealerTick(round, 0); // equal again
    expect(round.status).toBe('OPEN');
    round = settleDealerTick(round, 9); // collect
    expect(round.status).toBe('OPEN');
    expect(round.pending_dealer_action).toBe('lower');
    round = settleDealerTick(round, 9); // equal reroll on lower
    expect(round.status).toBe('OPEN');
    round = settleDealerTick(round, 5); // collect lower → face 5 len 3 → stand
    expect(round.dealer_stop_reason).toBe('stand');
  });

  test('dealer bust on first call → player wins with Δ = pLen − dLen', () => {
    let round = openRound({ stakeCents: 100, faceDigit: 0 });
    round = lockPlayerPick(round, 'higher');
    round = settlePlayerTick(round, 9);
    round = hold(round);
    // Dealer 3 → Higher; tick 1 → bust at dealer len 1
    round = dealDealerFace(round, 3);
    round = settleDealerTick(round, 1);
    expect(round.status).toBe('WON');
    expect(round.dealer_stop_reason).toBe('bust');
    expect(round.settlement_data?.settle_reason).toBe('dealer_bust');
    expect(round.settlement_data?.dealer_len).toBe(1);
    expect(round.settlement_data?.delta).toBe(1); // 2 − 1
    expect(round.payout_cents).toBe(225);
  });

  test('dealer bust after longer run still pays at least Δ1', () => {
    let round = openRound({ stakeCents: 100, faceDigit: 8 });
    round = lockPlayerPick(round, 'lower');
    round = settlePlayerTick(round, 1);
    round = hold(round);
    // Dealer builds to len 3 then busts → raw Δ = 2−3 = −1 → floor to Δ1
    round = dealDealerFace(round, 0);
    round = settleDealerTick(round, 1); // len 2
    round = settleDealerTick(round, 2); // len 3
    round = settleDealerTick(round, 0); // bust (not higher; equal would reroll)
    expect(round.status).toBe('WON');
    expect(round.dealer_stop_reason).toBe('bust');
    expect(round.settlement_data?.dealer_len).toBe(3);
    expect(round.settlement_data?.delta).toBe(1);
    expect(round.payout_cents).toBe(225);
  });

  test('dealer stands at len 2 after collect → player Δ1 win', () => {
    let round = openRound({ stakeCents: 100, faceDigit: 0 });
    round = lockPlayerPick(round, 'higher');
    round = settlePlayerTick(round, 1);
    round = lockPlayerPick(round, 'higher');
    round = settlePlayerTick(round, 2);
    expect(playerLen(round)).toBe(3);
    round = hold(round);
    // Dealer 7 → Lower; tick 4 → Stand at len 2 → Δ = 3−2 = 1
    round = dealDealerFace(round, 7);
    expect(round.pending_dealer_action).toBe('lower');
    round = settleDealerTick(round, 4);
    expect(round.status).toBe('WON');
    expect(round.dealer_stop_reason).toBe('stand');
    expect(round.settlement_data?.settle_reason).toBe('length_win');
    expect(round.settlement_data?.delta).toBe(1);
    expect(round.payout_cents).toBe(
      Math.floor(100 * (DEFAULT_PAY_TABLE[1] as number)),
    );
  });

  test('dealer stands longer → LOST', () => {
    let round = openRound({ stakeCents: 100, faceDigit: 8 });
    round = lockPlayerPick(round, 'lower');
    round = settlePlayerTick(round, 1);
    round = hold(round);
    // Dealer 0 Higher → 1 → 2 → 3 → 5 Stand at len 5 > player 2
    round = dealDealerFace(round, 0);
    round = settleDealerTick(round, 1); // len 2
    round = settleDealerTick(round, 2); // len 3
    round = settleDealerTick(round, 3); // len 4
    round = settleDealerTick(round, 5); // len 5 → stand
    expect(round.status).toBe('LOST');
    expect(round.dealer_stop_reason).toBe('stand');
    expect(round.settlement_data?.settle_reason).toBe('length_loss');
    expect(round.settlement_data?.delta).toBe(-3);
    expect(round.payout_cents).toBe(0);
  });

  test('collect length 6 → auto-win 6–0, dealer skipped', () => {
    // Climb 0→1→2→3→7→8 = length 6
    let round = openRound({ stakeCents: 100, faceDigit: 0 });
    for (const next of [1, 2, 3, 7]) {
      round = lockPlayerPick(round, 'higher');
      round = settlePlayerTick(round, next);
      expect(round.status).toBe('OPEN');
    }
    expect(playerLen(round)).toBe(5);
    round = lockPlayerPick(round, 'higher');
    round = settlePlayerTick(round, 8);
    expect(playerLen(round)).toBe(AUTO_WIN_LENGTH);
    expect(round.status).toBe('WON');
    expect(round.settlement_data?.settle_reason).toBe('auto_win_cap');
    expect(round.settlement_data?.delta).toBe(6);
    expect(round.dealer_digits).toHaveLength(0);
    expect(round.payout_cents).toBe(360); // AUTO_WIN_PAYOUT_MULT 3.6×
  });
});

describe('optimalPick', () => {
  test('≤5 Higher, ≥6 Lower', () => {
    expect(optimalPick(0)).toBe('higher');
    expect(optimalPick(5)).toBe('higher');
    expect(optimalPick(6)).toBe('lower');
    expect(optimalPick(9)).toBe('lower');
  });
});

describe('RTP', () => {
  test('tapered table: Hold-3 ~98–99%, all holds ≤99%, Hold-2 worse', () => {
    const h2 = simulateRtp({ trials: 80_000, holdAt: 2, seed: 42 });
    const h3 = simulateRtp({ trials: 80_000, holdAt: 3, seed: 42 });
    const h4 = simulateRtp({ trials: 80_000, holdAt: 4, seed: 42 });
    const h5 = simulateRtp({ trials: 80_000, holdAt: 5, seed: 42 });
    const h6 = simulateRtp({ trials: 80_000, holdAt: 6, seed: 42 });
    expect(h3.rtp).toBeGreaterThanOrEqual(0.98);
    expect(h3.rtp).toBeLessThanOrEqual(0.99);
    expect(h2.rtp).toBeLessThan(h3.rtp);
    for (const r of [h2, h3, h4, h5, h6]) {
      expect(r.rtp).toBeLessThanOrEqual(0.99);
    }
  });
});
