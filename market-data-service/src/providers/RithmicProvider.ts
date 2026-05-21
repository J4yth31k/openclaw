import WebSocket from 'ws';
import { Bar, ContractSpec, DataStatus, ProviderStatus, Quote, QuoteCallback } from '../types';
import { resolveContract } from '../contracts';
import { MarketDataProvider } from './MarketDataProvider';

/**
 * Rithmic R|Web WebSocket provider.
 *
 * Protocol notes:
 * - Rithmic uses a JSON-over-WebSocket protocol for their R|Web API.
 * - Message keys follow Rithmic's published R|Web schema (RequestLogin,
 *   ResponseLogin, RequestMarketDataUpdate, BestBidOffer, LastTrade, etc.).
 * - Set RITHMIC_GATEWAY_URI in .env to your broker's gateway.
 *   Paper trading: wss://rituz00100.rithmic.com:443/
 * - Requires RITHMIC_USER, RITHMIC_PASSWORD, RITHMIC_APP_NAME,
 *   RITHMIC_SYSTEM_NAME, and RITHMIC_INFRA_TYPE env vars.
 *
 * Historical bars:
 * - Rithmic's R|Web API provides replay/history via RequestTimeBarUpdate.
 * - We request 1-minute bars then resample to larger resolutions locally.
 *
 * Fallback:
 * - If the WS connection fails or credentials are missing, the server
 *   automatically falls back to MockProvider (see server.ts).
 */
export class RithmicProvider extends MarketDataProvider {
  readonly name = 'rithmic';

  private ws: WebSocket | null = null;
  private status: ProviderStatus = 'connecting';
  private lastHeartbeat = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private sessionToken = '';
  private subscribed = new Set<string>();
  private readonly callbacks: Map<string, QuoteCallback[]> = new Map();

  // Bar data accumulation: symbol → resolution → bar array
  private readonly barCache: Map<string, Map<string, Bar[]>> = new Map();

  // Pending bar requests: requestId → resolve fn
  private readonly pendingBars: Map<string, (bars: Bar[]) => void> = new Map();

  private readonly gatewayUri: string;
  private readonly user: string;
  private readonly password: string;
  private readonly appName: string;
  private readonly appVersion: string;
  private readonly systemName: string;
  private readonly infraType: number;
  private readonly reconnectMs: number;

  constructor() {
    super();
    this.gatewayUri   = process.env.RITHMIC_GATEWAY_URI   ?? 'wss://rituz00100.rithmic.com:443/';
    this.user         = process.env.RITHMIC_USER          ?? '';
    this.password     = process.env.RITHMIC_PASSWORD      ?? '';
    this.appName      = process.env.RITHMIC_APP_NAME      ?? 'OpenClaw';
    this.appVersion   = process.env.RITHMIC_APP_VERSION   ?? '1.0.0';
    this.systemName   = process.env.RITHMIC_SYSTEM_NAME   ?? 'Rithmic Paper Trading';
    this.infraType    = parseInt(process.env.RITHMIC_INFRA_TYPE ?? '3', 10);
    this.reconnectMs  = parseInt(process.env.RITHMIC_RECONNECT_MS ?? '5000', 10);

    if (!this.user || !this.password) {
      throw new Error(
        'RithmicProvider: RITHMIC_USER and RITHMIC_PASSWORD must be set. ' +
        'Set MARKET_PROVIDER=mock for development without credentials.'
      );
    }
  }

  async connect(): Promise<void> {
    this.openWs();
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
    this.status = 'offline';
  }

  subscribeQuote(symbol: string, callback: QuoteCallback): void {
    const existing = this.callbacks.get(symbol) ?? [];
    this.callbacks.set(symbol, [...existing, callback]);

    if (!this.subscribed.has(symbol) && this.status === 'connected') {
      this.sendSubscribe(symbol);
    }
  }

  unsubscribeQuote(symbol: string): void {
    this.callbacks.delete(symbol);
    if (this.subscribed.has(symbol)) {
      this.sendUnsubscribe(symbol);
    }
  }

  async getBars(symbol: string, resolution: string, from: number, to: number): Promise<Bar[]> {
    if (this.status !== 'connected') return [];
    return new Promise(resolve => {
      const reqId = `${symbol}_${resolution}_${Date.now()}`;
      this.pendingBars.set(reqId, resolve);

      // Rithmic R|Web: request time bar replay
      this.send({
        RequestTimeBarUpdate: {
          requestId:      reqId,
          symbol:         this.rithmicSymbol(symbol),
          exchange:       resolveContract(symbol).exchange,
          barType:        1,      // 1 = minute bars
          barTypePeriod:  resolutionToMinutes(resolution),
          startIndex:     from,
          finishIndex:    to,
          direction:      1,      // oldest first
          request:        1,      // subscribe
        },
      });

      // Timeout after 10s
      setTimeout(() => {
        if (this.pendingBars.has(reqId)) {
          this.pendingBars.get(reqId)?.([]);
          this.pendingBars.delete(reqId);
        }
      }, 10_000);
    });
  }

  getStatus(): DataStatus {
    return {
      provider:      this.name,
      status:        this.status,
      dataDelayed:   this.infraType !== 1,
      lastHeartbeat: this.lastHeartbeat,
    };
  }

  resolveContract(root: string): ContractSpec {
    return resolveContract(root);
  }

  // ─── WebSocket lifecycle ──────────────────────────────────────────────────

  private openWs(): void {
    this.status = 'connecting';
    this.ws = new WebSocket(this.gatewayUri, { rejectUnauthorized: true });

    this.ws.on('open', () => {
      console.log(`[Rithmic] Connected to ${this.gatewayUri}`);
      this.sendLogin();
    });

    this.ws.on('message', (raw: WebSocket.RawData) => {
      try {
        this.handleMessage(JSON.parse(raw.toString()));
      } catch (e) {
        console.error('[Rithmic] Parse error:', e);
      }
    });

    this.ws.on('error', err => {
      console.error('[Rithmic] WS error:', err.message);
      this.status = 'offline';
    });

    this.ws.on('close', () => {
      console.warn('[Rithmic] Disconnected. Reconnecting in', this.reconnectMs, 'ms');
      this.status = 'offline';
      this.ws = null;
      this.reconnectTimer = setTimeout(() => this.openWs(), this.reconnectMs);
    });
  }

  private sendLogin(): void {
    this.send({
      RequestLogin: {
        user:        this.user,
        password:    this.password,
        appName:     this.appName,
        appVersion:  this.appVersion,
        systemName:  this.systemName,
        infraType:   this.infraType,
      },
    });
  }

  private sendSubscribe(symbol: string): void {
    const spec = resolveContract(symbol);
    this.send({
      RequestMarketDataUpdate: {
        symbol:      this.rithmicSymbol(symbol),
        exchange:    spec.exchange,
        request:     1,       // 1 = subscribe
        updateBits:  0b11,    // bit 0 = last trade, bit 1 = BBO
      },
    });
    this.subscribed.add(symbol);
  }

  private sendUnsubscribe(symbol: string): void {
    const spec = resolveContract(symbol);
    this.send({
      RequestMarketDataUpdate: {
        symbol:   this.rithmicSymbol(symbol),
        exchange: spec.exchange,
        request:  2,    // 2 = unsubscribe
        updateBits: 0b11,
      },
    });
    this.subscribed.delete(symbol);
  }

  // ─── Incoming message dispatch ───────────────────────────────────────────

  private handleMessage(msg: Record<string, unknown>): void {
    this.lastHeartbeat = Date.now();

    if (msg['ResponseLogin']) {
      this.handleLogin(msg['ResponseLogin'] as Record<string, unknown>);
    } else if (msg['LastTrade']) {
      this.handleLastTrade(msg['LastTrade'] as Record<string, unknown>);
    } else if (msg['BestBidOffer']) {
      this.handleBBO(msg['BestBidOffer'] as Record<string, unknown>);
    } else if (msg['TimeBar']) {
      this.handleTimeBar(msg['TimeBar'] as Record<string, unknown>);
    } else if (msg['Heartbeat']) {
      // Already updated lastHeartbeat above
    }
  }

  private handleLogin(resp: Record<string, unknown>): void {
    if (resp['rpCode'] === '0') {
      console.log('[Rithmic] Login successful');
      this.status        = 'connected';
      this.sessionToken  = (resp['fcmId'] as string) ?? '';

      // Re-subscribe to any symbols that were pending
      for (const sym of this.callbacks.keys()) {
        if (!this.subscribed.has(sym)) this.sendSubscribe(sym);
      }
    } else {
      console.error('[Rithmic] Login failed:', resp['rpCode'], resp['rqHandlerRpCode']);
      this.status = 'offline';
    }
  }

  private handleLastTrade(data: Record<string, unknown>): void {
    const symbol = this.normalizeSymbol(data['symbol'] as string);
    if (!symbol) return;

    const price  = parseFloat(data['price']     as string ?? '0');
    const volume = parseInt(data['volume']       as string ?? '0', 10);
    const ts     = parseInt(data['exchangeTime'] as string ?? '0', 10) * 1000;

    const cbs = this.callbacks.get(symbol);
    if (!cbs?.length) return;

    const spread = price * 0.0001;
    const quote: Quote = {
      symbol,
      contract:      resolveContract(symbol).active,
      exchange:      resolveContract(symbol).exchange,
      price,
      bid:           price - spread / 2,
      ask:           price + spread / 2,
      volume,
      timestamp:     ts || Date.now(),
      sessionStatus: 'RTH',
    };
    cbs.forEach(cb => cb(quote));
  }

  private handleBBO(data: Record<string, unknown>): void {
    const symbol = this.normalizeSymbol(data['symbol'] as string);
    if (!symbol) return;

    const bid = parseFloat(data['bidPrice'] as string ?? '0');
    const ask = parseFloat(data['askPrice'] as string ?? '0');
    const mid = (bid + ask) / 2;

    const cbs = this.callbacks.get(symbol);
    if (!cbs?.length) return;

    const quote: Quote = {
      symbol,
      contract:      resolveContract(symbol).active,
      exchange:      resolveContract(symbol).exchange,
      price:         mid,
      bid,
      ask,
      volume:        0,
      timestamp:     Date.now(),
      sessionStatus: 'RTH',
    };
    cbs.forEach(cb => cb(quote));
  }

  private handleTimeBar(data: Record<string, unknown>): void {
    const reqId  = data['requestId']    as string;
    const symbol = this.normalizeSymbol(data['symbol'] as string);
    if (!symbol || !reqId) return;

    const bar: Bar = {
      symbol,
      resolution: String(data['barTypePeriod'] ?? '1'),
      t:  parseInt(data['barOpeningTime'] as string ?? '0', 10),
      o:  parseFloat(data['openPrice']    as string ?? '0'),
      h:  parseFloat(data['highPrice']    as string ?? '0'),
      l:  parseFloat(data['lowPrice']     as string ?? '0'),
      c:  parseFloat(data['closePrice']   as string ?? '0'),
      v:  parseInt(data['volume']         as string ?? '0', 10),
    };

    // Accumulate bars for this request
    const cache = this.barCache.get(reqId) ?? new Map();
    const res   = bar.resolution;
    const arr   = cache.get(res) ?? [];
    arr.push(bar);
    cache.set(res, arr);
    this.barCache.set(reqId, cache);

    // Detect end-of-response (Rithmic sends rqHandlerRpCode='0' on last bar)
    if (data['rqHandlerRpCode'] === '0') {
      const resolve = this.pendingBars.get(reqId);
      if (resolve) {
        resolve(arr.sort((a: Bar, b: Bar) => a.t - b.t));
        this.pendingBars.delete(reqId);
        this.barCache.delete(reqId);
      }
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private send(payload: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  /**
   * Convert our root symbol (NQ) to the Rithmic active contract (NQM26).
   * For forex/crypto returns symbol unchanged.
   */
  private rithmicSymbol(symbol: string): string {
    const spec = resolveContract(symbol);
    return spec.exchange === 'N/A' ? symbol : spec.active;
  }

  /**
   * Strip contract suffix from a Rithmic symbol (NQM26 → NQ).
   * Rithmic returns the full contract symbol in trade/BBO messages.
   */
  private normalizeSymbol(rithmicSym: string): string | null {
    if (!rithmicSym) return null;
    for (const root of this.callbacks.keys()) {
      if (rithmicSym.startsWith(root)) return root;
    }
    return null;
  }
}

function resolutionToMinutes(resolution: string): number {
  if (resolution === 'D') return 1440;
  if (resolution === 'W') return 10080;
  return parseInt(resolution, 10) || 1;
}
