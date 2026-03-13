'use strict';

import type { DerivTick, ParsedTick, ConnectionStatus } from '@/types';

type TickHandler = (tick: ParsedTick) => void;
type StatusHandler = (status: ConnectionStatus) => void;

interface TickSubscription {
  id: string | null;
  symbol: string;
  handlers: Set<TickHandler>;
}

const DERIV_WS_URL = 'wss://ws.derivws.com/websockets/v3';
const MAX_RECONNECT_DELAY = 30_000;
const INITIAL_RECONNECT_DELAY = 1_000;

export function extractLastDigit(quote: string): number {
  const cleaned = quote.replace('.', '');
  return parseInt(cleaned[cleaned.length - 1], 10);
}

export class DerivClient {
  private ws: WebSocket | null = null;
  private appId: string;
  private status: ConnectionStatus = 'disconnected';
  private statusHandlers = new Set<StatusHandler>();
  private subscriptions = new Map<string, TickSubscription>();
  private pendingSubscribes = new Set<string>();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(appId: string) {
    this.appId = appId;
  }

  connect(): void {
    if (this.disposed) return;
    if (this.ws?.readyState === WebSocket.OPEN) return;
    if (this.ws?.readyState === WebSocket.CONNECTING) return;

    this.setStatus(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    try {
      this.ws = new WebSocket(`${DERIV_WS_URL}?app_id=${this.appId}`);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.setStatus('connected');
        this.resubscribeAll();
        this.flushPendingSubscribes();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.error) {
            console.warn('[DerivClient] API error:', data.error.message, data.error.code);
            return;
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
        this.setStatus('disconnected');
        if (!this.disposed) this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        console.warn('[DerivClient] WebSocket error');
        this.ws?.close();
      };
    } catch (err) {
      console.warn('[DerivClient] Failed to create WebSocket:', err);
      this.setStatus('disconnected');
      if (!this.disposed) this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = Math.min(
      INITIAL_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts),
      MAX_RECONNECT_DELAY
    );
    this.reconnectAttempts++;
    console.info(`[DerivClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private handleTick(raw: DerivTick): void {
    const quoteStr = typeof raw.quote === 'number' ? String(raw.quote) : raw.quote;
    const parsed: ParsedTick = {
      ...raw,
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
    if (!this.subscriptions.has(symbol)) {
      this.subscriptions.set(symbol, {
        id: null,
        symbol,
        handlers: new Set(),
      });
      if (this.isConnected()) {
        this.sendSubscribe(symbol);
      } else {
        this.pendingSubscribes.add(symbol);
      }
    }

    const sub = this.subscriptions.get(symbol)!;
    sub.handlers.add(handler);

    return () => {
      sub.handlers.delete(handler);
      if (sub.handlers.size === 0) {
        this.sendUnsubscribe(symbol);
        this.subscriptions.delete(symbol);
        this.pendingSubscribes.delete(symbol);
      }
    };
  }

  private isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private sendSubscribe(symbol: string): void {
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
      sub.id = null;
      this.sendSubscribe(sub.symbol);
    }
  }

  onStatusChange(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    handler(this.status);
    return () => this.statusHandlers.delete(handler);
  }

  getStatus(): ConnectionStatus {
    return this.status;
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

  dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.subscriptions.clear();
    this.statusHandlers.clear();
    this.pendingSubscribes.clear();
    this.ws?.close();
    this.ws = null;
  }
}

let clientInstance: DerivClient | null = null;

export function getDerivClient(): DerivClient {
  if (!clientInstance) {
    const appId = process.env.NEXT_PUBLIC_DERIV_APP_ID || '1089';
    clientInstance = new DerivClient(appId);
  }
  return clientInstance;
}
