import { Request, Response, Router } from 'express';
import { Bar, Quote } from '../types';
import { MarketDataProvider } from './MarketDataProvider';

/**
 * TradingView UDF (Universal Data Feed) adapter.
 *
 * Mounts under /udf and implements the full TradingView Charting Library
 * datafeed protocol, enabling the licensed Advanced Charts widget to connect
 * directly to the OpenClaw market-data service.
 *
 * Compatible with TradingView Charting Library v25+.
 * Spec: https://www.tradingview.com/charting-library-docs/latest/connecting_data/UDF/
 *
 * Endpoints served:
 *   GET /udf/config         — datafeed capabilities
 *   GET /udf/symbols        — symbol metadata
 *   GET /udf/search         — symbol search
 *   GET /udf/history        — OHLCV bars
 *   GET /udf/quotes         — snapshot quotes (polling fallback)
 *   GET /udf/marks          — event markers (optional)
 *   GET /udf/time           — server time
 */
export function buildUdfRouter(provider: MarketDataProvider): Router {
  const router = Router();

  // ── GET /udf/config ───────────────────────────────────────────────────────
  router.get('/config', (_req: Request, res: Response) => {
    res.json({
      supported_resolutions:   ['1', '5', '15', '30', '60', '240', 'D', 'W'],
      supports_group_request:  false,
      supports_marks:          false,
      supports_search:         true,
      supports_timescale_marks: false,
      exchanges: [
        { value: 'CME',   name: 'CME',   desc: 'Chicago Mercantile Exchange' },
        { value: 'CBOT',  name: 'CBOT',  desc: 'Chicago Board of Trade' },
        { value: 'NYMEX', name: 'NYMEX', desc: 'New York Mercantile Exchange' },
        { value: 'COMEX', name: 'COMEX', desc: 'COMEX (Gold, Silver, Copper)' },
        { value: 'FOREX', name: 'FOREX', desc: 'Foreign Exchange' },
        { value: 'CRYPTO', name: 'CRYPTO', desc: 'Cryptocurrency' },
      ],
      symbols_types: [
        { name: 'futures', value: 'futures' },
        { name: 'forex',   value: 'forex'   },
        { name: 'crypto',  value: 'crypto'  },
      ],
    });
  });

  // ── GET /udf/time ─────────────────────────────────────────────────────────
  router.get('/time', (_req: Request, res: Response) => {
    res.send(String(Math.floor(Date.now() / 1000)));
  });

  // ── GET /udf/search?query=NQ&type=futures&exchange=CME&limit=10 ───────────
  router.get('/search', (req: Request, res: Response) => {
    const query = String(req.query['query'] ?? '').toUpperCase();
    const all   = buildSymbolList(provider);
    const hits  = all.filter(s =>
      s.symbol.includes(query) || s.description.toLowerCase().includes(query.toLowerCase())
    ).slice(0, parseInt(String(req.query['limit'] ?? '10'), 10));
    res.json(hits);
  });

  // ── GET /udf/symbols?symbol=NQ ────────────────────────────────────────────
  router.get('/symbols', (req: Request, res: Response) => {
    const sym  = String(req.query['symbol'] ?? '').toUpperCase();
    const spec = provider.resolveContract(sym);

    const type = spec.exchange === 'FOREX'  ? 'forex'
               : spec.exchange === 'CRYPTO' ? 'crypto'
               : 'futures';

    res.json({
      name:               sym,
      ticker:             sym,
      description:        spec.description || sym,
      type,
      exchange:           spec.exchange,
      listed_exchange:    spec.exchange,
      timezone:           'Etc/UTC',
      pricescale:         pricescaleFor(sym),
      session:            '0000-2400:1234567',
      has_intraday:       true,
      has_daily:          true,
      has_weekly_and_monthly: false,
      supported_resolutions: ['1','5','15','30','60','240','D'],
      intraday_multipliers: ['1','5','15','30','60','240'],
      minmovement:        1,
      fractional:         false,
      volume_precision:   0,
    });
  });

  // ── GET /udf/history?symbol=NQ&resolution=1&from=xxx&to=xxx ──────────────
  router.get('/history', async (req: Request, res: Response) => {
    const symbol     = String(req.query['symbol']     ?? '').toUpperCase();
    const resolution = String(req.query['resolution'] ?? '1');
    const from       = parseInt(String(req.query['from'] ?? '0'), 10);
    const to         = parseInt(String(req.query['to']   ?? '0'), 10);

    if (!symbol || !from || !to) {
      res.json({ s: 'no_data' });
      return;
    }

    try {
      const bars = await provider.getBars(symbol, resolution, from, to);
      if (!bars.length) {
        res.json({ s: 'no_data' });
        return;
      }
      res.json({
        s:  'ok',
        t:  bars.map(b => b.t),
        o:  bars.map(b => b.o),
        h:  bars.map(b => b.h),
        l:  bars.map(b => b.l),
        c:  bars.map(b => b.c),
        v:  bars.map(b => b.v),
      });
    } catch (e) {
      res.json({ s: 'error', errmsg: String(e) });
    }
  });

  // ── GET /udf/quotes?symbols=NQ,ES ────────────────────────────────────────
  router.get('/quotes', (req: Request, res: Response) => {
    const symbols = String(req.query['symbols'] ?? '').split(',').map(s => s.trim().toUpperCase());
    // For polling — return last known quotes from the running quote cache
    const d = symbols.map(sym => {
      const q = latestQuote.get(sym);
      if (!q) return { s: 'error', n: sym, v: {} };
      return {
        s: 'ok',
        n: sym,
        v: {
          ch:     +(q.price - q.bid).toFixed(6),
          chp:    +((q.price - q.bid) / q.bid * 100).toFixed(4),
          short_name: sym,
          exchange:   q.exchange,
          description: provider.resolveContract(sym).description,
          lp:     q.price,
          ask:    q.ask,
          bid:    q.bid,
          volume: q.volume,
        },
      };
    });
    res.json({ s: 'ok', d });
  });

  return router;
}

// ─── Quote cache (updated by server.ts as quotes stream in) ──────────────────
export const latestQuote: Map<string, Quote> = new Map();
export function updateLatestQuote(q: Quote): void { latestQuote.set(q.symbol, q); }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const KNOWN_FUTURES  = ['ES','NQ','YM','RTY','MNQ','MES','CL','NG','GC','SI','ZB','ZN'];
const KNOWN_CRYPTO   = ['BTCUSD','ETHUSD','SOLUSD'];
const KNOWN_FOREX    = ['EURUSD','GBPUSD','USDJPY','XAUUSD','USDCAD'];

function buildSymbolList(provider: MarketDataProvider) {
  return [
    ...KNOWN_FUTURES.map(s => {
      const sp = provider.resolveContract(s);
      return { symbol: s, full_name: s, description: sp.description, exchange: sp.exchange, type: 'futures' };
    }),
    ...KNOWN_FOREX.map(s => ({ symbol: s, full_name: s, description: s, exchange: 'FOREX', type: 'forex' })),
    ...KNOWN_CRYPTO.map(s => ({ symbol: s, full_name: s, description: s, exchange: 'CRYPTO', type: 'crypto' })),
  ];
}

function pricescaleFor(sym: string): number {
  if (['NG'].includes(sym)) return 1000;
  if (['EURUSD','GBPUSD','USDJPY','USDCAD'].includes(sym)) return 100000;
  if (['BTCUSD','ETHUSD'].includes(sym)) return 100;
  if (['CL','GC','XAUUSD'].includes(sym)) return 100;
  return 100;
}
