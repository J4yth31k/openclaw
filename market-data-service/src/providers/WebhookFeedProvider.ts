import { Bar, ContractSpec, DataStatus, ProviderStatus, Quote, QuoteCallback } from '../types';
import { resolveContract } from '../contracts';
import { MarketDataProvider } from './MarketDataProvider';

/**
 * Price feed driven entirely by incoming TradingView webhooks.
 *
 * No broker credentials needed — TradingView sends price data via Pine Script
 * alerts (POST /webhook/tradingview). Each incoming price updates the quote
 * cache and fires callbacks to all WebSocket subscribers.
 *
 * Set MARKET_PROVIDER=tradingview in .env to activate.
 * Use the openclaw_price_feed.pine script on every symbol you want to track.
 */
export class WebhookFeedProvider extends MarketDataProvider {
  readonly name = 'tradingview';

  private status: ProviderStatus = 'connected';
  private readonly quotes:    Map<string, Quote>          = new Map();
  private readonly bars:      Map<string, Bar[]>          = new Map();
  private readonly callbacks: Map<string, QuoteCallback[]> = new Map();
  private lastUpdate = 0;

  async connect(): Promise<void> {
    console.log('[WebhookFeed] Ready — waiting for TradingView price webhooks');
  }

  async disconnect(): Promise<void> {
    this.status = 'offline';
  }

  subscribeQuote(symbol: string, callback: QuoteCallback): void {
    const existing = this.callbacks.get(symbol) ?? [];
    this.callbacks.set(symbol, [...existing, callback]);

    // Immediately emit the last known price if available
    const q = this.quotes.get(symbol);
    if (q) callback(q);
  }

  unsubscribeQuote(symbol: string): void {
    this.callbacks.delete(symbol);
  }

  async getBars(symbol: string, _resolution: string, _from: number, _to: number): Promise<Bar[]> {
    return this.bars.get(symbol.toUpperCase()) ?? [];
  }

  getStatus(): DataStatus {
    const stale = this.lastUpdate > 0 && Date.now() - this.lastUpdate > 60_000;
    return {
      provider:      this.name,
      status:        stale ? 'delayed' : this.status,
      dataDelayed:   stale,
      lastHeartbeat: this.lastUpdate,
    };
  }

  resolveContract(root: string): ContractSpec {
    return resolveContract(root);
  }

  // ─── Called by the webhook router on every incoming price tick ────────────

  ingestPrice(symbol: string, price: number, bid: number, ask: number, volume: number): void {
    this.lastUpdate  = Date.now();
    this.status      = 'connected';

    const spec  = resolveContract(symbol);
    const quote: Quote = {
      symbol,
      contract:      spec.active,
      exchange:      spec.exchange,
      price,
      bid:           bid  || price,
      ask:           ask  || price,
      volume,
      timestamp:     Date.now(),
      sessionStatus: 'RTH',
    };

    this.quotes.set(symbol, quote);

    // Update 1-minute bar accumulator
    this.updateBar(symbol, price, volume);

    // Fire all subscriber callbacks
    const cbs = this.callbacks.get(symbol);
    cbs?.forEach(cb => cb(quote));
  }

  private updateBar(symbol: string, price: number, volume: number): void {
    const nowSec   = Math.floor(Date.now() / 1000);
    const barStart = nowSec - (nowSec % 60);
    const arr      = this.bars.get(symbol) ?? [];
    const last     = arr[arr.length - 1];

    if (!last || last.t < barStart) {
      arr.push({ symbol, resolution: '1', t: barStart,
        o: price, h: price, l: price, c: price, v: volume });
      // Keep last 500 bars
      if (arr.length > 500) arr.shift();
    } else {
      last.h = Math.max(last.h, price);
      last.l = Math.min(last.l, price);
      last.c = price;
      last.v = volume;
    }
    this.bars.set(symbol, arr);
  }
}

export const webhookFeedProvider = new WebhookFeedProvider();
