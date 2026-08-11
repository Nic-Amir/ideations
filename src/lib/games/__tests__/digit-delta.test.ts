'use strict';

import { describe, expect, test } from 'vitest';
import {
  DEFAULT_PAY_TABLE,
  canHold,
  compareReasonLabel,
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
  winningSetHint,
} from '@/lib/games/digit-delta';

describe('dealerAction', () => {
  test('0–3 Higher, 4–6 Stand, 7–9 Lower', () => {
    for (let d = 0; d <= 3; d++) expect(dealerAction(d)).toBe('higher');
    for (let d = 4; d <= 6; d++) expect(dealerAction(d)).toBe('stand');
    for (let d = 7; d <= 9; d++) expect(dealerAction(d)).toBe('lower');
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

describe('compareReasonLabel / winningSetHint', () => {
  test('labels tie, not higher, collected', () => {
    expect(compareReasonLabel('higher', 5, 5, false)).toBe('Tie · same digit');
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
  test('Δ multipliers', () => {
    expect(payoutMultiplier(0)).toBe(0);
    expect(payoutMultiplier(1)).toBe(DEFAULT_PAY_TABLE[1]);
    expect(payoutMultiplier(2)).toBe(DEFAULT_PAY_TABLE[2]);
    expect(payoutMultiplier(5)).toBe(DEFAULT_PAY_TABLE[5]);
    expect(payoutMultiplier(9)).toBe(DEFAULT_PAY_TABLE[5]);
    expect(payoutCents(100, 1)).toBe(
      Math.floor(100 * (DEFAULT_PAY_TABLE[1] as number)),
    );
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

  test('Hold at 2 → dealer stand on 4 → WON Δ1', () => {
    let round = openRound({ stakeCents: 100, faceDigit: 0 });
    round = lockPlayerPick(round, 'higher');
    round = settlePlayerTick(round, 9);
    expect(canHold(round)).toBe(true);
    expect(playerLen(round)).toBe(2);
    round = hold(round);
    round = dealDealerFace(round, 4);
    expect(round.status).toBe('WON');
    expect(round.dealer_stop_reason).toBe('stand');
    expect(round.settlement_data?.settle_reason).toBe('length_win');
    expect(round.settlement_data?.delta).toBe(1);
    expect(round.payout_cents).toBe(
      Math.floor(100 * (DEFAULT_PAY_TABLE[1] as number)),
    );
  });

  test('dealer stand on 5 or 6 also settles', () => {
    for (const face of [5, 6]) {
      let round = openRound({ stakeCents: 100, faceDigit: 0 });
      round = lockPlayerPick(round, 'higher');
      round = settlePlayerTick(round, 9);
      round = hold(round);
      round = dealDealerFace(round, face);
      expect(round.dealer_stop_reason).toBe('stand');
      expect(round.status).toBe('WON');
      expect(round.settlement_data?.delta).toBe(1);
    }
  });

  test('dealer bust → player wins with Δ = playerLen', () => {
    let round = openRound({ stakeCents: 100, faceDigit: 0 });
    round = lockPlayerPick(round, 'higher');
    round = settlePlayerTick(round, 9);
    round = hold(round);
    // Dealer 0 → Higher; equal tick → bust at dealer len 1
    round = dealDealerFace(round, 0);
    expect(round.phase).toBe('awaiting_dealer_tick');
    round = settleDealerTick(round, 0);
    expect(round.status).toBe('WON');
    expect(round.dealer_stop_reason).toBe('bust');
    expect(round.settlement_data?.settle_reason).toBe('dealer_bust');
    expect(round.settlement_data?.dealer_len).toBe(1);
    expect(round.settlement_data?.delta).toBe(2); // playerLen, not 2−1
    expect(round.payout_cents).toBe(
      Math.floor(100 * (DEFAULT_PAY_TABLE[2] as number)),
    );
  });

  test('length tie → REFUNDED', () => {
    let round = openRound({ stakeCents: 100, faceDigit: 0 });
    round = lockPlayerPick(round, 'higher');
    round = settlePlayerTick(round, 1);
    round = hold(round);
    // Dealer face 0 → Higher; tick 4 succeeds → face 4 → Stand at len 2 → tie
    round = dealDealerFace(round, 0);
    expect(round.phase).toBe('awaiting_dealer_tick');
    expect(round.pending_dealer_action).toBe('higher');
    round = settleDealerTick(round, 4);
    expect(round.status).toBe('REFUNDED');
    expect(round.settlement_data?.settle_reason).toBe('length_tie');
    expect(round.payout_cents).toBe(100);
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

  test('Hold-at-2 is slightly worse than Hold-at-3', () => {
    const h2 = simulateRtp({ trials: 30_000, holdAt: 2, seed: 12 });
    const h3 = simulateRtp({ trials: 30_000, holdAt: 3, seed: 12 });
    expect(h2.rtp).toBeLessThan(h3.rtp);
  });
});
