import { describe, test, expect } from 'vitest';
import {
  MOCK_PIP_SIZE,
  seedQuoteForSymbol,
  nextMockQuote,
  buildMockTickPayload,
} from '../mock-tick';
import { extractLastDigit, resolveFeedMode } from '../client';

describe('mock tick helpers', () => {
  test('seedQuoteForSymbol differs by symbol family', () => {
    expect(seedQuoteForSymbol('1HZ100V')).toBeGreaterThan(0);
    expect(seedQuoteForSymbol('CRASH50')).not.toBe(seedQuoteForSymbol('1HZ100V'));
    expect(seedQuoteForSymbol('R_100')).not.toBe(seedQuoteForSymbol('1HZ100V'));
  });

  test('nextMockQuote keeps two decimal places and a valid last digit', () => {
    const rng = () => 0.75; // positive step
    const quote = nextMockQuote(1000, rng);
    expect(quote).toMatch(/^\d+\.\d{2}$/);
    expect(quote.split('.')[1]).toHaveLength(MOCK_PIP_SIZE);
    const digit = extractLastDigit(quote);
    expect(digit).toBeGreaterThanOrEqual(0);
    expect(digit).toBeLessThanOrEqual(9);
  });

  test('nextMockQuote never drops below 1', () => {
    const rng = () => 0; // max negative step
    const quote = nextMockQuote(1.01, rng);
    expect(parseFloat(quote)).toBeGreaterThanOrEqual(1);
  });

  test('buildMockTickPayload matches Deriv tick shape', () => {
    const tick = buildMockTickPayload('1HZ100V', '1000.42', 1_700_000_000);
    expect(tick).toEqual({
      epoch: 1_700_000_000,
      quote: '1000.42',
      symbol: '1HZ100V',
      pip_size: 2,
    });
    expect(extractLastDigit(tick.quote)).toBe(2);
  });
});

describe('resolveFeedMode', () => {
  test('defaults to auto', () => {
    expect(resolveFeedMode(undefined)).toBe('auto');
    expect(resolveFeedMode('')).toBe('auto');
    expect(resolveFeedMode('nope')).toBe('auto');
  });

  test('accepts live mock auto', () => {
    expect(resolveFeedMode('live')).toBe('live');
    expect(resolveFeedMode('mock')).toBe('mock');
    expect(resolveFeedMode('auto')).toBe('auto');
  });
});
