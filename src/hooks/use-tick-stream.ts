'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useDerivClient } from '@/lib/deriv/provider';
import type { ParsedTick, ConnectionStatus } from '@/types';

const TICK_TIMEOUT_MS = 15_000;

export function useTickStream(symbol: string) {
  const client = useDerivClient();
  const [latestTick, setLatestTick] = useState<ParsedTick | null>(null);
  const [ticks, setTicks] = useState<ParsedTick[]>([]);
  const maxTicks = 100;

  useEffect(() => {
    const unsubscribe = client.subscribe(symbol, (tick) => {
      setLatestTick(tick);
      setTicks((prev) => {
        const next = [...prev, tick];
        return next.length > maxTicks ? next.slice(-maxTicks) : next;
      });
    });

    return unsubscribe;
  }, [client, symbol]);

  const clearTicks = useCallback(() => {
    setTicks([]);
    setLatestTick(null);
  }, []);

  return { latestTick, ticks, clearTicks };
}

export function useLastDigit(symbol: string) {
  const { latestTick, ticks, clearTicks } = useTickStream(symbol);
  return {
    lastDigit: latestTick?.lastDigit ?? null,
    tick: latestTick,
    digits: ticks.map((t) => t.lastDigit),
    clearTicks,
  };
}

export function useDerivConnection() {
  const client = useDerivClient();
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');

  useEffect(() => {
    return client.onStatusChange(setStatus);
  }, [client]);

  return status;
}

export function useNextTick(symbol: string): () => Promise<ParsedTick> {
  const client = useDerivClient();
  const subscriptionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let handler: ((tick: ParsedTick) => void) | null = null;
    const unsub = client.subscribe(symbol, (tick) => {
      if (handler) handler(tick);
    });
    subscriptionRef.current = unsub;

    (subscriptionRef as any)._setHandler = (h: ((tick: ParsedTick) => void) | null) => {
      handler = h;
    };

    return () => {
      unsub();
      subscriptionRef.current = null;
    };
  }, [client, symbol]);

  return useCallback(() => {
    return new Promise<ParsedTick>((resolve, reject) => {
      const timeout = setTimeout(() => {
        (subscriptionRef as any)._setHandler?.(null);
        reject(new Error('Tick timeout: no data received. Check connection.'));
      }, TICK_TIMEOUT_MS);

      (subscriptionRef as any)._setHandler?.((tick: ParsedTick) => {
        clearTimeout(timeout);
        (subscriptionRef as any)._setHandler?.(null);
        resolve(tick);
      });
    });
  }, []);
}

export function useNextNTicks(symbol: string): (n: number) => Promise<ParsedTick[]> {
  const client = useDerivClient();
  const subscriptionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let handler: ((tick: ParsedTick) => void) | null = null;
    const unsub = client.subscribe(symbol, (tick) => {
      if (handler) handler(tick);
    });
    subscriptionRef.current = unsub;

    (subscriptionRef as any)._setHandler = (h: ((tick: ParsedTick) => void) | null) => {
      handler = h;
    };

    return () => {
      unsub();
      subscriptionRef.current = null;
    };
  }, [client, symbol]);

  return useCallback(
    (n: number) => {
      return new Promise<ParsedTick[]>((resolve, reject) => {
        const collected: ParsedTick[] = [];

        const timeout = setTimeout(() => {
          (subscriptionRef as any)._setHandler?.(null);
          reject(new Error(`Tick timeout: received ${collected.length}/${n} ticks.`));
        }, TICK_TIMEOUT_MS * n);

        (subscriptionRef as any)._setHandler?.((tick: ParsedTick) => {
          collected.push(tick);
          if (collected.length >= n) {
            clearTimeout(timeout);
            (subscriptionRef as any)._setHandler?.(null);
            resolve(collected);
          }
        });
      });
    },
    []
  );
}
