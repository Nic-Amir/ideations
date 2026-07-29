'use strict';

import type { DerivTick, ParsedTick, ConnectionStatus } from '@/types';
import { normalizePipSize } from '@/types';
import {
  MOCK_TICK_INTERVAL_MS,
  seedQuoteForSymbol,
  nextMockQuoteForSymbol,
  buildMockTickPayload,
} from '@/lib/deriv/mock-tick';

type TickHandler = (tick: ParsedTick) => void;
type StatusHandler = (status: ConnectionStatus) => void;
type FeedSourceHandler = (source: FeedSource) => void;
type FeedErrorHandler = (error: FeedError) => void;

export type FeedMode = 'auto' | 'live' | 'mock';
export type FeedSource = 'live' | 'demo';

export interface FeedError {
  code: string;
  message: string;
  symbol?: string;
}

interface TickSubscription {
  id: string | null;
  symbol: string;
  handlers: Set<TickHandler>;
  /** True when this symbol is served by the local mock ticker. */
  mock: boolean;
}

const DERIV_WS_URL = 'wss://ws.derivws.com/websockets/v3';
const MAX_RECONNECT_DELAY = 30_000;
const INITIAL_RECONNECT_DELAY = 1_000;

export function extractLastDigit(quote: string): number {
  const cleaned = quote.replace('.', '');
  return parseInt(cleaned[cleaned.length - 1], 10);
}

export function resolveFeedMode(
  raw: string | undefined = process.env.NEXT_PUBLIC_FEED_MODE,
): FeedMode {
  if (raw === 'live' || raw === 'mock' || raw === 'auto') return raw;
  return 'auto';
}

export class DerivClient {
  private ws: WebSocket | null = null;
  private appId: string;
  private feedMode: FeedMode;
  private status: ConnectionStatus = 'disconnected';
  private feedSource: FeedSource = 'live';
  private statusHandlers = new Set<StatusHandler>();
  private feedSourceHandlers = new Set<FeedSourceHandler>();
  private feedErrorHandlers = new Set<FeedErrorHandler>();
  private subscriptions = new Map<string, TickSubscription>();
  private pendingSubscribes = new Set<string>();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  /** When true, all new/active symbol subscriptions use the mock ticker. */
  private forceDemo = false;
  private mockQuotes = new Map<string, number>();
  private mockTimers = new Map<string, ReturnType<typeof setInterval>>();
  private activeSymbolSet: Set<string> | null = null;
  private probedActiveSymbols = false;

  constructor(appId: string, feedMode: FeedMode = resolveFeedMode()) {
    this.appId = appId;
    this.feedMode = feedMode;
    if (feedMode === 'mock') {
      this.forceDemo = true;
      this.feedSource = 'demo';
    }
  }

  connect(): void {
    if (this.disposed) return;

    if (this.feedMode === 'mock') {
      this.forceDemo = true;
      this.setFeedSource('demo');
      this.setStatus('connected');
      this.startMockForAllSubscriptions();
      return;
    }

    if (this.ws?.readyState === WebSocket.OPEN) return;
    if (this.ws?.readyState === WebSocket.CONNECTING) return;

    this.setStatus(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    try {
      this.ws = new WebSocket(`${DERIV_WS_URL}?app_id=${this.appId}`);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.probedActiveSymbols = false;
        this.activeSymbolSet = null;
        this.setStatus('connected');
        this.probeActiveSymbols();
        this.resubscribeAll();
        this.flushPendingSubscribes();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.error) {
            this.handleApiError(data);
            return;
          }

          if (data.msg_type === 'active_symbols') {
            this.handleActiveSymbols(data.active_symbols ?? []);
          }

          if (data.msg_type === 'tick' && data.tick) {
            this.handleTick(data.tick);
          }

          if (data.subscription) {
            const symbol = data.echo_req?.ticks;
            if (symbol && this.subscriptions.has(symbol)) {
              const sub = this.subscriptions.get(symbol)!;
              sub.id = data.subscription.id;
            }
          }
        } catch (err) {
          console.warn('[DerivClient] Failed to parse message:', err);
        }
      };

      this.ws.onclose = (event) => {
        console.info('[DerivClient] Connection closed:', event.code, event.reason);
        if (this.forceDemo || this.feedMode === 'mock') {
          // Stay on demo feed; do not thrash reconnect while mocking.
          this.setStatus('connected');
          return;
        }
        this.setStatus('disconnected');
        if (!this.disposed) this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        console.warn('[DerivClient] WebSocket error');
        this.ws?.close();
      };
    } catch (err) {
      console.warn('[DerivClient] Failed to create WebSocket:', err);
      if (this.feedMode === 'auto') {
        this.enableDemoFeed('WebSocketUnavailable', 'Failed to create WebSocket');
        return;
      }
      this.setStatus('disconnected');
      if (!this.disposed) this.scheduleReconnect();
    }
  }

  private probeActiveSymbols(): void {
    if (!this.isConnected()) return;
    this.ws!.send(JSON.stringify({ active_symbols: 'brief', product_type: 'basic' }));
  }

  private handleActiveSymbols(symbols: Array<{ symbol?: string }>): void {
    this.probedActiveSymbols = true;
    this.activeSymbolSet = new Set(
      symbols.map((s) => s.symbol).filter((s): s is string => Boolean(s)),
    );

    if (this.activeSymbolSet.size === 0 && this.feedMode === 'auto') {
      this.enableDemoFeed(
        'NoActiveSymbols',
        'Deriv returned no active symbols for this region',
      );
      return;
    }

    // Re-check pending live subscriptions against the catalog.
    for (const [symbol, sub] of this.subscriptions) {
      if (sub.mock) continue;
      if (this.activeSymbolSet.size > 0 && !this.activeSymbolSet.has(symbol)) {
        this.fallbackSymbolToMock(
          symbol,
          'InvalidSymbol',
          `Symbol ${symbol} is not available`,
        );
      }
    }
  }

  private handleApiError(data: {
    error?: { code?: string; message?: string };
    echo_req?: { ticks?: string };
  }): void {
    const code = data.error?.code ?? 'UnknownError';
    const message = data.error?.message ?? 'Unknown Deriv API error';
    const symbol = data.echo_req?.ticks;

    console.warn('[DerivClient] API error:', message, code);

    this.emitFeedError({ code, message, symbol });

    const isInvalidSymbol =
      code === 'InvalidSymbol' || /invalid symbol/i.test(message);

    if (
      this.feedMode === 'auto' &&
      isInvalidSymbol &&
      typeof symbol === 'string'
    ) {
      this.fallbackSymbolToMock(symbol, code, message);
      return;
    }

    if (this.feedMode === 'auto' && isInvalidSymbol && !symbol) {
      this.enableDemoFeed(code, message);
    }
  }

  private enableDemoFeed(code: string, message: string): void {
    if (this.forceDemo) {
      this.startMockForAllSubscriptions();
      return;
    }
    console.info('[DerivClient] Switching to demo feed:', code, message);
    this.forceDemo = true;
    this.setFeedSource('demo');
    this.setStatus('connected');
    this.emitFeedError({ code, message });
    this.startMockForAllSubscriptions();
  }

  private fallbackSymbolToMock(
    symbol: string,
    code: string,
    message: string,
  ): void {
    const sub = this.subscriptions.get(symbol);
    if (!sub) {
      this.enableDemoFeed(code, message);
      return;
    }
    if (sub.mock) return;

    console.info(`[DerivClient] Demo feed for ${symbol}:`, code, message);
    this.forceDemo = true;
    this.setFeedSource('demo');
    this.setStatus('connected');
    sub.mock = true;
    sub.id = null;
    this.startMock(symbol);
  }

  private startMockForAllSubscriptions(): void {
    for (const [symbol, sub] of this.subscriptions) {
      sub.mock = true;
      sub.id = null;
      this.startMock(symbol);
    }
  }

  private startMock(symbol: string): void {
    if (this.mockTimers.has(symbol)) return;

    if (!this.mockQuotes.has(symbol)) {
      this.mockQuotes.set(symbol, seedQuoteForSymbol(symbol));
    }

    // Emit one tick immediately so marketReady flips without waiting a full second.
    this.emitMockTick(symbol);

    const timer = setInterval(() => {
      if (this.disposed) return;
      const sub = this.subscriptions.get(symbol);
      if (!sub || sub.handlers.size === 0) {
        this.stopMock(symbol);
        return;
      }
      this.emitMockTick(symbol);
    }, MOCK_TICK_INTERVAL_MS);

    this.mockTimers.set(symbol, timer);
  }

  private emitMockTick(symbol: string): void {
    const prev = this.mockQuotes.get(symbol) ?? seedQuoteForSymbol(symbol);
    const quote = nextMockQuoteForSymbol(symbol, prev);
    this.mockQuotes.set(symbol, parseFloat(quote));
    this.handleTick(buildMockTickPayload(symbol, quote));
  }

  private stopMock(symbol: string): void {
    const timer = this.mockTimers.get(symbol);
    if (timer) {
      clearInterval(timer);
      this.mockTimers.delete(symbol);
    }
  }

  private stopAllMocks(): void {
    for (const symbol of [...this.mockTimers.keys()]) {
      this.stopMock(symbol);
    }
  }

  private scheduleReconnect(): void {
    if (this.forceDemo || this.feedMode === 'mock') return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = Math.min(
      INITIAL_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts),
      MAX_RECONNECT_DELAY,
    );
    this.reconnectAttempts++;
    console.info(
      `[DerivClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`,
    );
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private handleTick(raw: DerivTick): void {
    const quoteStr = typeof raw.quote === 'number' ? String(raw.quote) : raw.quote;
    const pipSize = normalizePipSize({ quote: quoteStr, pip_size: raw.pip_size });
    const parsed: ParsedTick = {
      ...raw,
      quote: quoteStr,
      pip_size: pipSize,
      lastDigit: extractLastDigit(quoteStr),
      numericQuote: parseFloat(quoteStr),
      timestamp: new Date(raw.epoch * 1000),
    };

    const sub = this.subscriptions.get(raw.symbol);
    if (sub) {
      sub.handlers.forEach((handler) => {
        try {
          handler(parsed);
        } catch (err) {
          console.warn('[DerivClient] Handler error:', err);
        }
      });
    }
  }

  subscribe(symbol: string, handler: TickHandler): () => void {
    let created = false;
    if (!this.subscriptions.has(symbol)) {
      const useMock =
        this.forceDemo ||
        this.feedMode === 'mock' ||
        (this.probedActiveSymbols &&
          this.activeSymbolSet !== null &&
          this.activeSymbolSet.size > 0 &&
          !this.activeSymbolSet.has(symbol) &&
          this.feedMode === 'auto');

      this.subscriptions.set(symbol, {
        id: null,
        symbol,
        handlers: new Set(),
        mock: useMock,
      });
      created = true;

      if (!useMock) {
        if (this.isConnected()) {
          this.sendSubscribe(symbol);
        } else if (this.feedMode !== 'mock') {
          this.pendingSubscribes.add(symbol);
        }
      }
    }

    const sub = this.subscriptions.get(symbol)!;
    sub.handlers.add(handler);

    // Start mock after the handler is registered so the first tick is delivered.
    if (sub.mock) {
      this.setFeedSource('demo');
      if (created || !this.mockTimers.has(symbol)) {
        this.startMock(symbol);
      }
    }

    return () => {
      sub.handlers.delete(handler);
      if (sub.handlers.size === 0) {
        this.sendUnsubscribe(symbol);
        this.stopMock(symbol);
        this.subscriptions.delete(symbol);
        this.pendingSubscribes.delete(symbol);
      }
    };
  }

  private isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private sendSubscribe(symbol: string): void {
    const sub = this.subscriptions.get(symbol);
    if (sub?.mock) {
      this.startMock(symbol);
      this.pendingSubscribes.delete(symbol);
      return;
    }
    if (this.isConnected()) {
      this.ws!.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
      this.pendingSubscribes.delete(symbol);
    }
  }

  private sendUnsubscribe(symbol: string): void {
    const sub = this.subscriptions.get(symbol);
    if (this.isConnected() && sub?.id) {
      this.ws!.send(JSON.stringify({ forget: sub.id }));
    }
  }

  private flushPendingSubscribes(): void {
    for (const symbol of this.pendingSubscribes) {
      if (this.subscriptions.has(symbol)) {
        this.sendSubscribe(symbol);
      }
    }
    this.pendingSubscribes.clear();
  }

  private resubscribeAll(): void {
    for (const [, sub] of this.subscriptions) {
      if (sub.mock) {
        this.startMock(sub.symbol);
        continue;
      }
      sub.id = null;
      this.sendSubscribe(sub.symbol);
    }
  }

  onStatusChange(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    handler(this.status);
    return () => this.statusHandlers.delete(handler);
  }

  onFeedSourceChange(handler: FeedSourceHandler): () => void {
    this.feedSourceHandlers.add(handler);
    handler(this.feedSource);
    return () => this.feedSourceHandlers.delete(handler);
  }

  onFeedError(handler: FeedErrorHandler): () => void {
    this.feedErrorHandlers.add(handler);
    return () => this.feedErrorHandlers.delete(handler);
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  getFeedSource(): FeedSource {
    return this.feedSource;
  }

  getFeedMode(): FeedMode {
    return this.feedMode;
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.statusHandlers.forEach((h) => {
      try {
        h(status);
      } catch (err) {
        console.warn('[DerivClient] Status handler error:', err);
      }
    });
  }

  private setFeedSource(source: FeedSource): void {
    if (this.feedSource === source) return;
    this.feedSource = source;
    this.feedSourceHandlers.forEach((h) => {
      try {
        h(source);
      } catch (err) {
        console.warn('[DerivClient] Feed source handler error:', err);
      }
    });
  }

  private emitFeedError(error: FeedError): void {
    this.feedErrorHandlers.forEach((h) => {
      try {
        h(error);
      } catch (err) {
        console.warn('[DerivClient] Feed error handler error:', err);
      }
    });
  }

  dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.stopAllMocks();
    this.subscriptions.clear();
    this.statusHandlers.clear();
    this.feedSourceHandlers.clear();
    this.feedErrorHandlers.clear();
    this.pendingSubscribes.clear();
    this.ws?.close();
    this.ws = null;
  }
}

let clientInstance: DerivClient | null = null;

export function getDerivClient(): DerivClient {
  if (!clientInstance) {
    const appId = process.env.NEXT_PUBLIC_DERIV_APP_ID || '1089';
    clientInstance = new DerivClient(appId, resolveFeedMode());
  }
  return clientInstance;
}

/** Test helper — reset the singleton between unit tests. */
export function __resetDerivClientForTests(): void {
  clientInstance?.dispose();
  clientInstance = null;
}
