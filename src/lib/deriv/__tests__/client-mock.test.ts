import { describe, test, expect, afterEach, vi } from 'vitest';
import { DerivClient, getDerivClient, __resetDerivClientForTests } from '../client';

afterEach(() => {
  __resetDerivClientForTests();
  vi.useRealTimers();
});

describe('DerivClient mock mode', () => {
  test('emits ticks without a live WebSocket', async () => {
    vi.useFakeTimers();
    const client = new DerivClient('1089', 'mock');
    client.connect();

    expect(client.getFeedSource()).toBe('demo');
    expect(client.getStatus()).toBe('connected');

    const ticks: string[] = [];
    const unsub = client.subscribe('1HZ100V', (tick) => {
      ticks.push(tick.quote);
      expect(tick.symbol).toBe('1HZ100V');
      expect(tick.lastDigit).toBeGreaterThanOrEqual(0);
      expect(tick.lastDigit).toBeLessThanOrEqual(9);
    });

    expect(ticks.length).toBeGreaterThanOrEqual(1);

    await vi.advanceTimersByTimeAsync(2100);
    expect(ticks.length).toBeGreaterThanOrEqual(3);

    unsub();
    client.dispose();
  });

  test('getDerivClient always constructs mock mode', () => {
    const client = getDerivClient();
    expect(client.getFeedMode()).toBe('mock');
    expect(client.getFeedSource()).toBe('demo');
  });
});
