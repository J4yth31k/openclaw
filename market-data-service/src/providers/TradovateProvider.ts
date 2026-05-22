import https from 'https';
import WebSocket from 'ws';
import { Bar, ContractSpec, DataStatus, ProviderStatus, Quote, QuoteCallback } from '../types';
import { resolveContract } from '../contracts';
import { MarketDataProvider } from './MarketDataProvider';

/**
 * Tradovate market data provider.
 *
 * Auth flow: POST credentials → accessToken → WebSocket MD stream.
 * Token expires; reconnect re-authenticates automatically.
 *
 * Env vars:
 *   TRADOVATE_USERNAME, TRADOVATE_PASSWORD
 *   TRADOVATE_CID, TRADOVATE_SECRET   — from app.tradovate.com/api-access
 *   TRADOVATE_APP_NAME, TRADOVATE_APP_VERSION
 *   TRADOVATE_ENVIRONMENT             — "demo" (default) | "live"
 *   TRADOVATE_RECONNECT_MS            — default 5000
 */

const ENVIRONMENTS = {
  demo: {
    authUrl: 'https://demo.tradovateapi.com/v1/auth/accesstokenrequest',
    mdWsUrl: 'wss://md-demo.tradovateapi.com/v1/websocket',
  },
  live: {
    authUrl: 'https://live.tradovateapi.com/v1/auth/accesstokenrequest',
    mdWsUrl: 'wss://md.tradovateapi.com/v1/websocket',
  },
};

const STALE_THRESHOLD_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 2_500;

export class TradovateProvider extends MarketDataProvider {
  readonly name = 'tradovate';

  private ws: WebSocket | null = null;
  private status: ProviderStatus = 'connecting';
  private accessToken = '';
  private lastDataReceived = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private reqCounter = 1;

  private readonly callbacks: Map<string, QuoteCallback[]> = new Map();
  private readonly contractIdToSymbol: Map<number, string> = new Map();
  private readonly pendingBars: Map<number, { resolve: (bars: Bar[]) => void; symbol: string; resolution: string }> = new Map();
  private readonly barAccumulator: Map<number, Bar[]> = new Map();

  private readonly username: string;
  private readonly password: string;
  private readonly cid: number;
  private readonly secret: string;
  private readonly appName: string;
  private readonly appVersion: string;
  private readonly authUrl: string;
  private readonly mdWsUrl: string;
  private readonly reconnectMs: number;

  constructor() {
    super();
    const envName = (process.env.TRADOVATE_ENVIRONMENT || 'demo').toLowerCase();
    const env = ENVIRONMENTS[envName as keyof typeof ENVIRONMENTS] ?? ENVIRONMENTS.demo;

    this.username    = process.env.TRADOVATE_USERNAME    || '';
    this.password    = process.env.TRADOVATE_PASSWORD    || '';
    this.cid         = parseInt(process.env.TRADOVATE_CID || '0', 10);
    this.secret      = process.env.TRADOVATE_SECRET      || '';
    this.appName     = process.env.TRADOVATE_APP_NAME    || 'OpenClaw';
    this.appVersion  = process.env.TRADOVATE_APP_VERSION || '1.0.0';
    this.authUrl     = process.env.TRADOVATE_AUTH_URL    || env.authUrl;
    this.mdWsUrl     = process.env.TRADOVATE_MD_WS_URL   || env.mdWsUrl;
    this.reconnectMs = parseInt(process.env.TRADOVATE_RECONNECT_MS || '5000', 10);

    if (!this.username || !this.password) {
      throw new Error(
        'TradovateProvider: TRADOVATE_USERNAME and TRADOVATE_PASSWORD must be set. ' +
        'Set MARKET_PROVIDER=mock for development without credentials.'
      );
    }
  }

  async connect(): Promise<void> {
    await this.authenticate();
  }

  async disconnect(): Promise<void> {
    clearTimeout(this.reconnectTimer);
    clearInterval(this.heartbeatTimer);
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
    if (this.status === 'connected') {
      this.sendSubscribeQuote(symbol);
    }
  }

  unsubscribeQuote(symbol: string): void {
    this.callbacks.delete(symbol);
    if (this.status === 'connected') {
      this.sendUnsubscribeQuote(symbol);
    }
  }

  async getBars(symbol: string, resolution: string, from: number, to: number): Promise<Bar[]> {
    if (this.status !== 'connected') return [];

    return new Promise(resolve => {
      const reqId = this.nextId();
      this.pendingBars.set(reqId, { resolve, symbol, resolution });
      this.barAccumulator.set(reqId, []);

      const elementSize = resolutionToMinutes(resolution);
      const body = JSON.stringify({
        symbol:           this.tradovateSymbol(symbol),
        chartDescription: {
          underlyingType:   'MinuteBar',
          elementSize,
          elementSizeUnit:  'UnderlyingUnits',
          withHistogram:    false,
        },
        timeRange: {
          asFarAsTimestamp: new Date(from * 1000).toISOString(),
          asMuchAsElements: 300,
        },
      });

      this.sendWs(`md/getChart\n${reqId}\n\n${body}`);

      setTimeout(() => {
        if (this.pendingBars.has(reqId)) {
          this.pendingBars.get(reqId)?.resolve([]);
          this.pendingBars.delete(reqId);
          this.barAccumulator.delete(reqId);
        }
      }, 10_000);
    });
  }

  getStatus(): DataStatus {
    const isStale = this.status === 'connected' &&
      this.lastDataReceived > 0 &&
      Date.now() - this.lastDataReceived > STALE_THRESHOLD_MS;
    return {
      provider:      this.name,
      status:        isStale ? 'delayed' : this.status,
      dataDelayed:   isStale,
      lastHeartbeat: this.lastDataReceived,
    };
  }

  resolveContract(root: string): ContractSpec {
    return resolveContract(root);
  }

  // ─── Auth ─────────────────────────────────────────────────────────────────

  private async authenticate(): Promise<void> {
    this.status = 'connecting';
    try {
      const body = JSON.stringify({
        name:       this.username,
        password:   this.password,
        appId:      this.appName,
        appVersion: this.appVersion,
        cid:        this.cid,
        sec:        this.secret,
      });

      const raw  = await this.httpPost(this.authUrl, body);
      const resp = JSON.parse(raw) as Record<string, unknown>;

      if (resp['errorText'] || resp['p-ticket']) {
        throw new Error(String(resp['errorText'] ?? 'Auth challenge — check credentials or CID/secret'));
      }

      this.accessToken = resp['accessToken'] as string;
      console.log('[Tradovate] Auth successful');
      this.openWs();
    } catch (e) {
      console.error('[Tradovate] Auth failed:', (e as Error).message);
      this.status = 'reconnecting';
      this.reconnectTimer = setTimeout(() => this.authenticate(), this.reconnectMs);
    }
  }

  private httpPost(url: string, body: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const u    = new URL(url);
      const opts = {
        hostname: u.hostname,
        path:     u.pathname,
        method:   'POST',
        headers:  {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      };
      const req = https.request(opts, res => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end',  () => resolve(data));
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  // ─── WebSocket lifecycle ──────────────────────────────────────────────────

  private openWs(): void {
    this.ws = new WebSocket(this.mdWsUrl);

    this.ws.on('open', () => {
      console.log(`[Tradovate] WS connected to ${this.mdWsUrl}`);
      const reqId = this.nextId();
      this.sendWs(`authorize\n${reqId}\n\n{"token":"${this.accessToken}"}`);
      this.startHeartbeat();
    });

    this.ws.on('message', (raw: WebSocket.RawData) => {
      this.lastDataReceived = Date.now();
      this.handleFrame(raw.toString());
    });

    this.ws.on('error', err => {
      console.error('[Tradovate] WS error:', err.message);
      this.status = 'reconnecting';
    });

    this.ws.on('close', () => {
      console.warn('[Tradovate] Disconnected. Reconnecting in', this.reconnectMs, 'ms');
      this.status = 'reconnecting';
      this.ws = null;
      clearInterval(this.heartbeatTimer);
      this.reconnectTimer = setTimeout(() => this.authenticate(), this.reconnectMs);
    });
  }

  private startHeartbeat(): void {
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => this.sendWs('[]'), HEARTBEAT_INTERVAL_MS);
  }

  // ─── Frame / message handling ─────────────────────────────────────────────

  private handleFrame(frame: string): void {
    if (frame === 'o' || frame === 'h') return;
    if (frame.startsWith('c')) return;
    if (!frame.startsWith('a')) return;

    let messages: string[];
    try { messages = JSON.parse(frame.slice(1)) as string[]; }
    catch { return; }

    for (const raw of messages) {
      try { this.handleMessage(JSON.parse(raw) as Record<string, unknown>); }
      catch { /* skip malformed */ }
    }
  }

  private handleMessage(msg: Record<string, unknown>): void {
    const s = msg['s'] as number | undefined;
    const d = msg['d'] as Record<string, unknown> | undefined;
    const e = msg['e'] as string | undefined;

    // Auth/command response
    if (s !== undefined && d) {
      if (d['accessToken'] || s === 200) {
        if (!this.status || this.status !== 'connected') {
          console.log('[Tradovate] Authorized on WS');
          this.status = 'connected';
          for (const sym of this.callbacks.keys()) {
            this.sendSubscribeQuote(sym);
          }
        }
      }

      // Chart / bar data response
      if (d['historicalData'] || d['charts']) {
        const reqId = msg['i'] as number;
        this.handleChartResponse(reqId, d);
      }
      return;
    }

    // Server-push event
    if (e === 'md' && d) {
      const entityType = d['entityType'] as string | undefined;
      if (entityType === 'Quote') this.handleQuoteEvent(d);
    }
  }

  private handleQuoteEvent(data: Record<string, unknown>): void {
    const contractId = data['contractId'] as number | undefined;
    const entries    = data['entries']    as Record<string, Record<string, unknown>> | undefined;
    if (!contractId || !entries) return;

    const symbol = this.contractIdToSymbol.get(contractId);
    if (!symbol) return;

    const bid   = parseFloat(String(entries['Bid']?.['price']               ?? '0'));
    const ask   = parseFloat(String(entries['Offer']?.['price']             ?? '0'));
    const last  = parseFloat(String(entries['Trade']?.['price']             ?? '0'));
    const vol   = parseInt(  String(entries['TotalTradeVolume']?.['size']   ?? '0'), 10);
    const price = last || (bid + ask) / 2;

    if (!price) return;

    const cbs = this.callbacks.get(symbol);
    if (!cbs?.length) return;

    const spec  = resolveContract(symbol);
    const quote: Quote = {
      symbol,
      contract:      spec.active,
      exchange:      spec.exchange,
      price,
      bid:           bid || price,
      ask:           ask || price,
      volume:        vol,
      timestamp:     Date.now(),
      sessionStatus: 'RTH',
    };
    cbs.forEach(cb => cb(quote));
  }

  private handleChartResponse(reqId: number, data: Record<string, unknown>): void {
    const pending = this.pendingBars.get(reqId);
    if (!pending) return;

    const raw = (data['historicalData'] ?? data['charts']) as Array<Record<string, unknown>> | undefined;
    if (!raw?.length) return;

    const acc = this.barAccumulator.get(reqId) ?? [];
    for (const item of raw) {
      const bar: Bar = {
        symbol:     pending.symbol,
        resolution: pending.resolution,
        t:  Math.floor(new Date(item['timestamp'] as string).getTime() / 1000),
        o:  parseFloat(String(item['open']  ?? '0')),
        h:  parseFloat(String(item['high']  ?? '0')),
        l:  parseFloat(String(item['low']   ?? '0')),
        c:  parseFloat(String(item['close'] ?? '0')),
        v:  parseInt(  String(item['upVolume'] ?? item['volume'] ?? '0'), 10),
      };
      if (bar.t && bar.c) acc.push(bar);
    }
    this.barAccumulator.set(reqId, acc);

    // Tradovate sends eoh=true on the last historical chunk
    if (data['eoh'] === true || data['s'] === 'Complete') {
      pending.resolve(acc.sort((a, b) => a.t - b.t));
      this.pendingBars.delete(reqId);
      this.barAccumulator.delete(reqId);
    }
  }

  // ─── Subscriptions ────────────────────────────────────────────────────────

  private sendSubscribeQuote(symbol: string): void {
    const reqId     = this.nextId();
    const tvSymbol  = this.tradovateSymbol(symbol);
    this.sendWs(`md/subscribeQuote\n${reqId}\n\n{"symbol":"${tvSymbol}"}`);

    // The subscription response includes contractId; capture it from the next response
    // by temporarily wiring a one-shot listener on the WS
    const captureId = (raw: WebSocket.RawData) => {
      try {
        const frame = raw.toString();
        if (!frame.startsWith('a')) return;
        const msgs = JSON.parse(frame.slice(1)) as string[];
        for (const m of msgs) {
          const msg = JSON.parse(m) as Record<string, unknown>;
          if ((msg['i'] as number) === reqId && (msg['d'] as Record<string, unknown>)?.['contractId']) {
            const cid = (msg['d'] as Record<string, unknown>)['contractId'] as number;
            this.contractIdToSymbol.set(cid, symbol);
            this.ws?.off('message', captureId);
          }
        }
      } catch { /* ignore */ }
    };
    this.ws?.on('message', captureId);
    // Clean up listener after 5s regardless
    setTimeout(() => this.ws?.off('message', captureId), 5_000);
  }

  private sendUnsubscribeQuote(symbol: string): void {
    const reqId = this.nextId();
    this.sendWs(`md/unsubscribeQuote\n${reqId}\n\n{"symbol":"${this.tradovateSymbol(symbol)}"}`);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private sendWs(msg: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(msg);
  }

  private nextId(): number {
    return this.reqCounter++;
  }

  private tradovateSymbol(root: string): string {
    return resolveContract(root).active;
  }
}

function resolutionToMinutes(resolution: string): number {
  if (resolution === 'D') return 1440;
  if (resolution === 'W') return 10080;
  return parseInt(resolution, 10) || 1;
}
