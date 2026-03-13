import { describe, test, expect } from 'vitest';
import { evaluateHand, isWrappingStraight, getPayTable } from '../digit-poker';

describe('Digit Poker Engine', () => {
  test('five of a kind', () => {
    expect(evaluateHand([7, 7, 7, 7, 7]).rank).toBe('five_of_a_kind');
    expect(evaluateHand([0, 0, 0, 0, 0]).rank).toBe('five_of_a_kind');
  });

  test('four of a kind', () => {
    expect(evaluateHand([3, 3, 3, 8, 3]).rank).toBe('four_of_a_kind');
  });

  test('full house', () => {
    expect(evaluateHand([4, 4, 4, 2, 2]).rank).toBe('full_house');
  });

  test('straight (normal)', () => {
    expect(evaluateHand([3, 4, 5, 6, 7]).rank).toBe('straight');
    expect(evaluateHand([0, 1, 2, 3, 4]).rank).toBe('straight');
  });

  test('straight (wrapping)', () => {
    expect(evaluateHand([8, 9, 0, 1, 2]).rank).toBe('straight');
    expect(evaluateHand([7, 8, 9, 0, 1]).rank).toBe('straight');
  });

  test('straight detection (order independent)', () => {
    expect(evaluateHand([2, 0, 1, 9, 8]).rank).toBe('straight');
  });

  test('three of a kind', () => {
    expect(evaluateHand([5, 5, 5, 6, 3]).rank).toBe('three_of_a_kind');
  });

  test('two pair', () => {
    expect(evaluateHand([3, 3, 4, 4, 8]).rank).toBe('two_pair');
  });

  test('one pair', () => {
    expect(evaluateHand([3, 3, 5, 6, 7]).rank).toBe('one_pair');
  });

  test('high card', () => {
    expect(evaluateHand([1, 3, 5, 7, 9]).rank).toBe('high_card');
  });

  test('isWrappingStraight detects wrapping', () => {
    expect(isWrappingStraight([8, 9, 0, 1, 2])).toBe(true);
    expect(isWrappingStraight([6, 7, 8, 9, 0])).toBe(true);
    expect(isWrappingStraight([5, 6, 7, 8, 9])).toBe(true);
  });

  test('isWrappingStraight rejects non-straights', () => {
    expect(isWrappingStraight([1, 3, 5, 7, 9])).toBe(false);
    expect(isWrappingStraight([1, 1, 2, 3, 4])).toBe(false);
  });

  test('pay table has correct hand order', () => {
    const table = getPayTable();
    expect(table[0].rank).toBe('five_of_a_kind');
    expect(table[table.length - 1].rank).toBe('high_card');
  });

  test('five of a kind pays 250x', () => {
    const result = evaluateHand([7, 7, 7, 7, 7]);
    expect(result.multiplier).toBe(250);
  });

  test('four of a kind pays 12x', () => {
    const result = evaluateHand([3, 3, 3, 8, 3]);
    expect(result.multiplier).toBe(12);
  });

  test('full house pays 1x', () => {
    const result = evaluateHand([4, 4, 4, 2, 2]);
    expect(result.multiplier).toBe(1);
  });

  test('hands below full house pay 0x', () => {
    expect(evaluateHand([3, 4, 5, 6, 7]).multiplier).toBe(0);
    expect(evaluateHand([5, 5, 5, 6, 3]).multiplier).toBe(0);
    expect(evaluateHand([3, 3, 4, 4, 8]).multiplier).toBe(0);
    expect(evaluateHand([3, 3, 5, 6, 7]).multiplier).toBe(0);
    expect(evaluateHand([1, 3, 5, 7, 9]).multiplier).toBe(0);
  });

  test('brute-force hand counts match combinatorial expectations', () => {
    const counts: Record<string, number> = {
      five_of_a_kind: 0,
      four_of_a_kind: 0,
      full_house: 0,
      straight: 0,
      three_of_a_kind: 0,
      two_pair: 0,
      one_pair: 0,
      high_card: 0,
    };

    for (let i = 0; i < 100_000; i++) {
      const hand = [];
      let n = i;
      for (let j = 0; j < 5; j++) {
        hand.push(n % 10);
        n = Math.floor(n / 10);
      }
      counts[evaluateHand(hand).rank]++;
    }

    expect(counts.five_of_a_kind).toBe(10);
    expect(counts.four_of_a_kind).toBe(450);
    expect(counts.full_house).toBe(900);
    expect(counts.straight).toBe(1200);
    expect(counts.three_of_a_kind).toBe(7200);
    expect(counts.two_pair).toBe(10800);
    expect(counts.one_pair).toBe(50400);
    expect(counts.high_card).toBe(29040);
  });

  test('no-hold RTP is well below 100%', () => {
    let totalPayout = 0;
    for (let i = 0; i < 100_000; i++) {
      const hand: number[] = [];
      let n = i;
      for (let j = 0; j < 5; j++) {
        hand.push(n % 10);
        n = Math.floor(n / 10);
      }
      totalPayout += evaluateHand(hand).multiplier;
    }
    const rtp = totalPayout / 100_000;
    expect(rtp).toBeLessThan(0.15);
  });

  test(
    'optimal-play RTP is between 95% and 99%',
    () => {
      const evCache = new Map<string, number>();

      function heldKey(digits: number[]): string {
        return [...digits].sort((a, b) => a - b).join(',');
      }

      function computeEV(heldDigits: number[]): number {
        const key = heldKey(heldDigits);
        const cached = evCache.get(key);
        if (cached !== undefined) return cached;

        const numRedraw = 5 - heldDigits.length;
        const total = Math.pow(10, numRedraw);
        let payoutSum = 0;

        for (let i = 0; i < total; i++) {
          const redrawn: number[] = [];
          let n = i;
          for (let j = 0; j < numRedraw; j++) {
            redrawn.push(n % 10);
            n = Math.floor(n / 10);
          }
          payoutSum += evaluateHand([...heldDigits, ...redrawn]).multiplier;
        }

        const ev = payoutSum / total;
        evCache.set(key, ev);
        return ev;
      }

      let totalOptimalEV = 0;

      for (let i = 0; i < 100_000; i++) {
        const hand: number[] = [];
        let n = i;
        for (let j = 0; j < 5; j++) {
          hand.push(n % 10);
          n = Math.floor(n / 10);
        }

        let bestEV = 0;
        for (let mask = 0; mask < 32; mask++) {
          const heldDigits: number[] = [];
          for (let j = 0; j < 5; j++) {
            if (mask & (1 << j)) heldDigits.push(hand[j]);
          }
          const ev = computeEV(heldDigits);
          if (ev > bestEV) bestEV = ev;
        }
        totalOptimalEV += bestEV;
      }

      const optimalRTP = totalOptimalEV / 100_000;
      expect(optimalRTP).toBeGreaterThan(0.95);
      expect(optimalRTP).toBeLessThan(0.99);
    },
    60_000,
  );
});
