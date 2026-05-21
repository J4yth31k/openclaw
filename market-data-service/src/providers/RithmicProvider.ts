import fs from 'fs';
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
 * - Set RITHMIC_ENVIRONMENT or RITHMIC_GATEWAY_URI in .env to your gateway.
 *   Paper trading: wss://rituz00100.rithmic.com:443/
 * - Requires RITHMIC_USERNAME and RITHMIC_PASSWORD env vars.
 *
 * Environment presets (RITHMIC_ENVIRONMENT):
 *   paper     — Rithmic Paper Trading (default)
 *   rithmic01 — Rithmic 01 live infrastructure
 *   rithmic04 — Rithmic 04 live infrastructure
 * Individual env vars (RITHMIC_GATEWAY_URI, RITHMIC_SYSTEM_NAME,
 * RITHMIC_INFRA_TYPE) always override the preset.
 *
 * Prop-firm setup:
 *   Set RITHMIC_ENVIRONMENT=paper (or rithmic01), RITHMIC_SYSTEM_NAME to
 *   the system name provided by your prop firm (e.g. "Apex Trader Funding"),
 *   and RITHMIC_INFRA_TYPE=3 for sim or 1 for live.
 *
 * SSL / custom certs:
 *   If your broker uses a self-signed CA, set RITHMIC_CERT_PATH to the
 *   path of the PEM file. The cert is loaded at startup; the connection
 *   still validates with rejectUnauthorized=true.
 *
 * Stale data detection:
 *   If no message is received for 30 s while connected, getStatus()
 *   returns 'delayed' so the UI can warn the user.
 *
 * Fallback:
 *   If the WS connection fails or credentials are missing, server.ts
 *   automatically falls back to MockProvider.
 */

// ─── Environment presets ─────────────────────────────────────────────────────
const ENVIRONMENTS: Record<string, { uri: string; infraType: number; systemName: string }> = {
  paper:      { uri: 'wss://rituz00100.rithmic.com:443/', infraType: 3, systemName: 'Rithmic Paper Trading' },
  rithmic01:  { uri: 'wss://rithmic01.rithmic.com:443/',  infraType: 1, systemName: 'Rithmic 01' },
  rithmic04:  { uri: 'wss://rithmic04.rithmic.com:443/',  infraType: 1, systemName: 'Rithmic 04' },
};

const STALE_THRESHOLD_MS = 30_000;

export class RithmicProvider extends MarketDataProvider {
  readonly name = 'rithmic';

  private ws: WebSocket | null = null;
  private status: ProviderStatus = 'connecting';
  private lastDataReceived = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private sessionToken = '';
  private subscribed = new Set<string>();
  private readonly callbacks: Map<string, QuoteCallback[]> = new Map();

  private readonly barCache: Map<string, Map<string, Bar[]>> = new Map();
  private readonly pendingBars: Map<string, (bars: Bar[]) => void> = new Map();

  private readonly gatewayUri: string;
  private readonly user: string;
  private readonly password: string;
  private readonly appName: string;
  private readonly appVersion: string;
  private readonly systemName: string;
  private readonly infraType: number;
  private readonly certPath: string;
  private readonly reconnectMs: number;

  constructor() {
    super();
    const envName  = (process.env.RITHMIC_ENVIRONMENT ?? '').toLowerCase();
    const preset   = ENVIRONMENTS[envName];

    // Individual env vars take precedence over the environment preset
    this.gatewayUri  = process.env.RITHMIC_GATEWAY_URI  ?? preset?.uri        ?? 'wss://rituz00100.rithmic.com:443/';
    this.user        = process.env.RITHMIC_USERNAME      ?? process.env.RITHMIC_USER ?? '';
    this.password    = process.env.RITHMIC_PASSWORD      ?? '';
    this.appName     = process.env.RITHMIC_APP_NAME      ?? 'OpenClaw';
    this.appVersion  = process.env.RITHMIC_APP_VERSION   ?? '1.0.0';
    this.systemName  = process.env.RITHMIC_SYSTEM_NAME   ?? preset?.systemName ?? 'Rithmic Paper Trading';
    this.infraType   = parseInt(process.env.RITHMIC_INFRA_TYPE ?? String(preset?.infraType ?? 3), 10);
    this.certPath    = process.env.RITHMIC_CERT_PATH     ?? '';
    this.reconnectMs = parseInt(process.env.RITHMIC_RECONNECT_MS ?? '5000', 10);

    if (!this.user || !this.password) {
      throw new Error(
        'RithmicProvider: RITHMIC_USERNAME and RITHMIC_PASSWORD must be set. ' +
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

      setTimeout(() => {
        if (this.pendingBars.has(reqId)) {
          this.pendingBars.get(reqId)?.([]);
          this.pendingBars.delete(reqId);
        }
      }, 10_000);
    });
  }

  getStatus(): DataStatus {
    // Derive stale state from last received timestamp; no timer needed
    const isStale = this.status === 'connected' &&
      this.lastDataReceived > 0 &&
      Date.now() - this.lastDataReceived > STALE_THRESHOLD_MS;
    return {
      provider:      this.name,
      status:        isStale ? 'delayed' : this.status,
      dataDelayed:   isStale || this.infraType !== 1,
      lastHeartbeat: this.lastDataReceived,
    };
  }

  resolveContract(root: string): ContractSpec {
    return resolveContract(root);
  }

  // ─── WebSocket lifecycle ──────────────────────────────────────────────────

  private openWs(): void {
    this.status = 'connecting';

    const wsOpts: WebSocket.ClientOptions = { rejectUnauthorized: true };
    if (this.certPath) {
      try {
        wsOpts.ca = fs.readFileSync(this.certPath);
        console.log(`[Rithmic] Using custom CA cert: ${this.certPath}`);
      } catch (e) {
        console.warn(`[Rithmic] Cannot read cert at ${this.certPath}:`, (e as Error).message);
      }
    }

    this.ws = new WebSocket(this.gatewayUri, wsOpts);

    this.ws.on('open', () => {
      console.log(`[Rithmic] Connected to ${this.gatewayUri} (${this.systemName})`);
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
      this.status = 'reconnecting';
    });

    this.ws.on('close', () => {
      console.warn('[Rithmic] Disconnected. Reconnecting in', this.reconnectMs, 'ms');
      this.status = 'reconnecting';
      this.ws = null;
      this.reconnectTimer = setTimeout(() => this.openWs(), this.reconnectMs);
    });
  }

  private sendLogin(): void {
    console.log(`[Rithmic] Logging in as ${this.user} @ ${this.systemName} (infraType ${this.infraType})`);
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
    this.lastDataReceived = Date.now();

    if (msg['ResponseLogin']) {
      this.handleLogin(msg['ResponseLogin'] as Record<string, unknown>);
    } else if (msg['LastTrade']) {
      this.handleLastTrade(msg['LastTrade'] as Record<string, unknown>);
    } else if (msg['BestBidOffer']) {
      this.handleBBO(msg['BestBidOffer'] as Record<string, unknown>);
    } else if (msg['TimeBar']) {
      this.handleTimeBar(msg['TimeBar'] as Record<string, unknown>);
    } else if (msg['Heartbeat']) {
      // lastDataReceived already updated above
    }
  }

  private handleLogin(resp: Record<string, unknown>): void {
    if (resp['rpCode'] === '0') {
      console.log('[Rithmic] Login successful');
      this.status       = 'connected';
      this.sessionToken = (resp['fcmId'] as string) ?? '';

      // Re-subscribe to any symbols that were pending before reconnect
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

    const cache = this.barCache.get(reqId) ?? new Map();
    const res   = bar.resolution;
    const arr   = cache.get(res) ?? [];
    arr.push(bar);
    cache.set(res, arr);
    this.barCache.set(reqId, cache);

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
   * Convert root symbol (NQ) to the active Rithmic contract (NQM26).
   * Forex/crypto symbols pass through unchanged.
   */
  private rithmicSymbol(symbol: string): string {
    const spec = resolveContract(symbol);
    return spec.exchange === 'N/A' ? symbol : spec.active;
  }

  /**
   * Strip contract suffix from a Rithmic symbol (NQM26 → NQ).
   * Matches by checking if the full contract starts with a subscribed root.
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
