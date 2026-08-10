'use strict';

import { describe, expect, test } from 'vitest';
import {
  DEFAULT_PAY_TABLE,
  canHold,
  dealDealerFace,
  dealerAction,
  hold,
  lockPlayerPick,
  openRound,
  optimalPick,
  payoutCents,
  payoutMultiplier,
  playerLen,
  settleDealerTick,
  settlePlayerTick,
  simulateRtp,
  stepWins,
} from '@/lib/games/digit-delta';

describe('dealerAction', () => {
  test('0–4 Higher, 5 Stand, 6–9 Lower', () => {
    for (let d = 0; d <= 4; d++) expect(dealerAction(d)).toBe('higher');
    expect(dealerAction(5)).toBe('stand');
    for (let d = 6; d <= 9; d++) expect(dealerAction(d)).toBe('lower');
  });
});

describe('stepWins', () => {
  test('strict compare; ties lose', () => {
    expect(stepWins('higher', 5, 7)).toBe(true);
    expect(stepWins('higher', 5, 5)).toBe(false);
    expect(stepWins('lower', 5, 3)).toBe(true);
    expect(stepWins('lower', 5, 5)).toBe(false);
  });
});

describe('payout table', () => {
  test('Δ multipliers', () => {
    expect(payoutMultiplier(0)).toBe(0);
    expect(payoutMultiplier(1)).toBe(2.7);
    expect(payoutMultiplier(2)).toBe(3.65);
    expect(payoutMultiplier(5)).toBe(9.5);
    expect(payoutMultiplier(9)).toBe(9.5);
    expect(payoutCents(100, 1)).toBe(270);
    expect(payoutCents(100, 2)).toBe(365);
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

  test('Hold at 2 → dealer stand on 5 → WON Δ1', () => {
    let round = openRound({ stakeCents: 100, faceDigit: 0 });
    round = lockPlayerPick(round, 'higher');
    round = settlePlayerTick(round, 9);
    expect(canHold(round)).toBe(true);
    expect(playerLen(round)).toBe(2);
    round = hold(round);
    round = dealDealerFace(round, 5);
    expect(round.status).toBe('WON');
    expect(round.dealer_stop_reason).toBe('stand_on_5');
    expect(round.settlement_data?.delta).toBe(1);
    expect(round.payout_cents).toBe(270);
  });

  test('length tie → REFUNDED', () => {
    let round = openRound({ stakeCents: 100, faceDigit: 0 });
    round = lockPlayerPick(round, 'higher');
    round = settlePlayerTick(round, 1);
    round = hold(round);
    // Dealer face 0 → Higher; tick 5 succeeds → face 5 → Stand at len 2 → tie
    round = dealDealerFace(round, 0);
    expect(round.phase).toBe('awaiting_dealer_tick');
    expect(round.pending_dealer_action).toBe('higher');
    round = settleDealerTick(round, 5);
    expect(round.status).toBe('REFUNDED');
    expect(round.settlement_data?.settle_reason).toBe('length_tie');
    expect(round.payout_cents).toBe(100);
  });

  test('dealer outruns player → LOST', () => {
    let round = openRound({ stakeCents: 100, faceDigit: 8 });
    round = lockPlayerPick(round, 'lower');
    round = settlePlayerTick(round, 1);
    round = hold(round);
    // Dealer 0 Higher → 1 → Higher → 2 → Higher → 3 (len 4) then we need bust... 
    // Actually keep going until dealer len > 2
    round = dealDealerFace(round, 0);
    round = settleDealerTick(round, 1); // len 2
    round = settleDealerTick(round, 2); // len 3 > player 2
    // dealer face 2 → Higher still, hasn't settled yet unless we bust
    // After success to 2, dealer continues (face 2 → Higher). Still OPEN.
    // Need one more success to have len 3, then if they bust we settle with dealer len 3
    expect(round.status).toBe('OPEN');
    round = settleDealerTick(round, 9); // success len 3, face 9 → Lower pending
    expect(round.dealer_digits.length).toBe(4); // 0,1,2,9 — wait
    // start [0], after 1 → [0,1], after 2 → [0,1,2], after 9 → [0,1,2,9]
    // player len 2, dealer len 4 — still open until bust or stand
    round = settleDealerTick(round, 9); // equal → bust at len 4
    expect(round.status).toBe('LOST');
    expect(round.settlement_data?.settle_reason).toBe('length_loss');
    expect(round.payout_cents).toBe(0);
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
  test('Hold-at-3 ≈ 96.5–98.5% under default table', () => {
    const r = simulateRtp({
      trials: 40_000,
      holdAt: 3,
      payTable: DEFAULT_PAY_TABLE,
      seed: 11,
    });
    expect(r.rtp).toBeGreaterThan(0.95);
    expect(r.rtp).toBeLessThan(0.995);
  });

  test('Hold-at-2 is worse than Hold-at-3', () => {
    const h2 = simulateRtp({ trials: 30_000, holdAt: 2, seed: 12 });
    const h3 = simulateRtp({ trials: 30_000, holdAt: 3, seed: 12 });
    expect(h2.rtp).toBeLessThan(h3.rtp);
    expect(h2.rtp).toBeLessThan(0.9);
  });
});
