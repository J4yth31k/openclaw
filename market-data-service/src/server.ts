import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import WebSocket, { WebSocketServer } from 'ws';

import { MarketDataProvider } from './providers/MarketDataProvider';
import { MockProvider } from './providers/MockProvider';
import { RithmicProvider } from './providers/RithmicProvider';
import { TradovateProvider } from './providers/TradovateProvider';
import { WebhookFeedProvider, webhookFeedProvider } from './providers/WebhookFeedProvider';
import { buildUdfRouter, updateLatestQuote } from './providers/TradingViewDatafeedProvider';
import { buildWebhookRouter, buildAlertsRouter } from './webhook/router';
import { allContracts, resolveContract } from './contracts';
import { Bar, ClientMessage, ServerMessage } from './types';

// ─── Provider selection ───────────────────────────────────────────────────────
function createProvider(): MarketDataProvider {
  const name = (process.env.MARKET_PROVIDER ?? 'mock').toLowerCase();
  if (name === 'rithmic') {
    try {
      return new RithmicProvider();
    } catch (e) {
      console.warn('[server] RithmicProvider init failed:', (e as Error).message);
      console.warn('[server] Falling back to MockProvider');
      return new MockProvider();
    }
  }
  if (name === 'tradovate') {
    try {
      return new TradovateProvider();
    } catch (e) {
      console.warn('[server] TradovateProvider init failed:', (e as Error).message);
      console.warn('[server] Falling back to MockProvider');
      return new MockProvider();
    }
  }
  if (name === 'tradingview') {
    return webhookFeedProvider;
  }
  return new MockProvider();
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
const provider = createProvider();
const app      = express();
const httpServer = createServer(app);
const wss      = new WebSocketServer({ server: httpServer, path: '/ws/market' });

const HTTP_PORT = parseInt(process.env.PORT ?? process.env.HTTP_PORT ?? '3001', 10);
const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? '*').split(',');

app.use(cors({ origin: CORS_ORIGINS, credentials: true }));
app.use(express.json());

// ─── REST routes ─────────────────────────────────────────────────────────────

/** GET /api/market/quote/:symbol  — latest snapshot */
app.get('/api/market/quote/:symbol', (req, res) => {
  const sym = req.params['symbol'].toUpperCase();
  const { latestQuote } = require('./providers/TradingViewDatafeedProvider');
  const q = latestQuote.get(sym);
  if (!q) { res.status(404).json({ error: `No quote for ${sym}` }); return; }
  res.json(q);
});

/** GET /api/market/bars/:symbol?resolution=1&from=unix&to=unix  — historical bars */
app.get('/api/market/bars/:symbol', async (req, res) => {
  const sym   = req.params['symbol'].toUpperCase();
  const res_  = String(req.query['resolution'] ?? '1');
  const from  = parseInt(String(req.query['from'] ?? '0'), 10);
  const nowSec = Math.floor(Date.now() / 1000);
  const to    = parseInt(String(req.query['to'] ?? String(nowSec)), 10);

  const fromSec = from || nowSec - 60 * 300; // default: last 300 minutes
  try {
    const bars = await provider.getBars(sym, res_, fromSec, to);
    res.json({ symbol: sym, resolution: res_, bars });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** GET /api/market/contracts/:root  — active front-month contract info */
app.get('/api/market/contracts/:root', (req, res) => {
  const root = req.params['root'].toUpperCase();
  const spec = resolveContract(root);
  res.json(spec);
});

/** GET /api/market/contracts  — all active contracts */
app.get('/api/market/contracts', (_req, res) => {
  res.json(allContracts());
});

/** GET /api/health */
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, providerName: provider.name, ...provider.getStatus() });
});

// ─── TradingView UDF datafeed ────────────────────────────────────────────────
app.use('/udf', buildUdfRouter(provider));

// ─── TradingView webhook receiver ────────────────────────────────────────────
app.use('/webhook', buildWebhookRouter());

// ─── Recent alerts API (for mobile dashboard) ────────────────────────────────
app.use('/api/alerts', buildAlertsRouter());

// ─── WebSocket server ─────────────────────────────────────────────────────────
type SymbolSet = Set<string>;
const clientSubs = new WeakMap<WebSocket, SymbolSet>();

// Bar accumulation for the current forming bar (live updates)
const currentBar: Map<string, Bar> = new Map();

function sendTo(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcast(msg: ServerMessage, symbol?: string): void {
  wss.clients.forEach(client => {
    if (client.readyState !== WebSocket.OPEN) return;
    if (symbol) {
      const subs = clientSubs.get(client);
      if (!subs?.has(symbol)) return;
    }
    client.send(JSON.stringify(msg));
  });
}

/** Subscribe this client and wire up the provider callback for that symbol. */
function subscribeSymbol(ws: WebSocket, symbol: string): void {
  const subs = clientSubs.get(ws) ?? new Set();
  if (subs.has(symbol)) return;
  subs.add(symbol);
  clientSubs.set(ws, subs);

  // Register provider callback — one per unique symbol across all clients
  provider.subscribeQuote(symbol, quote => {
    updateLatestQuote(quote);

    // Update forming 1-minute bar
    const nowSec   = Math.floor(Date.now() / 1000);
    const barStart = nowSec - (nowSec % 60);
    const existing = currentBar.get(symbol);

    if (!existing || existing.t < barStart) {
      // New bar
      const bar: Bar = { symbol, resolution: '1', t: barStart,
        o: quote.price, h: quote.price, l: quote.price, c: quote.price, v: quote.volume };
      currentBar.set(symbol, bar);
      broadcast({ type: 'bar', bar }, symbol);
    } else {
      existing.h  = Math.max(existing.h, quote.price);
      existing.l  = Math.min(existing.l, quote.price);
      existing.c  = quote.price;
      existing.v  = quote.volume;
      broadcast({ type: 'bar', bar: existing }, symbol);
    }

    // Always broadcast the raw quote
    broadcast({ type: 'quote', quote }, symbol);
  });
}

wss.on('connection', (ws: WebSocket) => {
  clientSubs.set(ws, new Set());

  // Send current provider status immediately on connect
  sendTo(ws, { type: 'status', status: provider.getStatus() });

  ws.on('message', async (raw: WebSocket.RawData) => {
    let msg: ClientMessage;
    try { msg = JSON.parse(raw.toString()) as ClientMessage; }
    catch { return; }

    if (msg.type === 'ping') {
      sendTo(ws, { type: 'pong' });
      return;
    }

    if (msg.type === 'subscribe') {
      const sym = msg.symbol.toUpperCase();
      subscribeSymbol(ws, sym);

      // Send last known quote immediately if available
      const { latestQuote } = require('./providers/TradingViewDatafeedProvider');
      const q = latestQuote.get(sym);
      if (q) sendTo(ws, { type: 'quote', quote: q });
    }

    if (msg.type === 'unsubscribe') {
      const subs = clientSubs.get(ws);
      subs?.delete(msg.symbol.toUpperCase());
    }

    if (msg.type === 'bars') {
      const { symbol, resolution, from, to } = msg;
      try {
        const bars = await provider.getBars(symbol.toUpperCase(), resolution, from, to);
        sendTo(ws, { type: 'bars', symbol, resolution, bars });
      } catch (e) {
        sendTo(ws, { type: 'error', message: String(e) });
      }
    }
  });

  ws.on('close', () => {
    // Unsubscribe provider callbacks for symbols no longer needed by any client
    const subs = clientSubs.get(ws) ?? new Set();
    subs.forEach(sym => {
      const stillNeeded = [...wss.clients].some(c => c !== ws && clientSubs.get(c)?.has(sym));
      if (!stillNeeded) provider.unsubscribeQuote(sym);
    });
    clientSubs.delete(ws);
  });
});

// Broadcast provider status every 10s
setInterval(() => {
  broadcast({ type: 'status', status: provider.getStatus() });
}, 10_000);

// ─── Start ────────────────────────────────────────────────────────────────────
provider.connect().then(() => {
  httpServer.listen(HTTP_PORT, () => {
    console.log(`[OpenClaw Market Data] listening on :${HTTP_PORT}`);
    console.log(`  Provider   : ${provider.name}`);
    console.log(`  HTTP API   : http://localhost:${HTTP_PORT}/api/market/`);
    console.log(`  WS stream  : ws://localhost:${HTTP_PORT}/ws/market`);
    console.log(`  TradingView: http://localhost:${HTTP_PORT}/udf/`);
  });
}).catch(err => {
  console.error('[server] Provider connect failed:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => provider.disconnect().then(() => process.exit(0)));
process.on('SIGINT',  () => provider.disconnect().then(() => process.exit(0)));
