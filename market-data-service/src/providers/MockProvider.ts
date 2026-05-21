import { Bar, ContractSpec, DataStatus, Quote, QuoteCallback } from '../types';
import { resolveContract } from '../contracts';
import { MarketDataProvider } from './MarketDataProvider';

// ─── Seed prices ──────────────────────────────────────────────────────────────
const SEED: Record<string, { price: number; exchange: string; tickSize: number }> = {
  ES:     { price: 5918,    exchange: 'CME',   tickSize: 0.25  },
  NQ:     { price: 21045,   exchange: 'CME',   tickSize: 0.25  },
  YM:     { price: 43250,   exchange: 'CBOT',  tickSize: 1     },
  RTY:    { price: 2108,    exchange: 'CME',   tickSize: 0.1   },
  MNQ:    { price: 21045,   exchange: 'CME',   tickSize: 0.25  },
  MES:    { price: 5918,    exchange: 'CME',   tickSize: 0.25  },
  CL:     { price: 78.42,   exchange: 'NYMEX', tickSize: 0.01  },
  NG:     { price: 3.215,   exchange: 'NYMEX', tickSize: 0.001 },
  GC:     { price: 3245,    exchange: 'COMEX', tickSize: 0.1   },
  ZB:     { price: 118.5,   exchange: 'CBOT',  tickSize: 0.03125 },
  ZN:     { price: 109.0,   exchange: 'CBOT',  tickSize: 0.015625 },
  EURUSD: { price: 1.1285,  exchange: 'FOREX', tickSize: 0.00001 },
  GBPUSD: { price: 1.3412,  exchange: 'FOREX', tickSize: 0.00001 },
  USDJPY: { price: 149.28,  exchange: 'FOREX', tickSize: 0.001  },
  XAUUSD: { price: 3245,    exchange: 'FOREX', tickSize: 0.01  },
  USDCAD: { price: 1.3685,  exchange: 'FOREX', tickSize: 0.00001 },
  BTCUSD: { price: 107200,  exchange: 'CRYPTO',tickSize: 0.01  },
  ETHUSD: { price: 2540,    exchange: 'CRYPTO',tickSize: 0.01  },
  SOLUSD: { price: 178,     exchange: 'CRYPTO',tickSize: 0.01  },
};

const SPREAD_PCT: Record<string, number> = {
  CME: 0.00025, CBOT: 0.00025, NYMEX: 0.00030, COMEX: 0.00025,
  FOREX: 0.00008, CRYPTO: 0.00015,
};

/** Drift parameters per symbol class (% per 2-second tick). */
const DRIFT_SIGMA: Record<string, number> = {
  CME: 0.00025, CBOT: 0.00030, NYMEX: 0.00035, COMEX: 0.00030,
  FOREX: 0.00008, CRYPTO: 0.00050,
};

function randn(): number {
  const u = 1 - Math.random();
  const v = 1 - Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function roundToTick(price: number, tick: number): number {
  return Math.round(price / tick) * tick;
}

interface SymState {
  price: number;
  dayVolume: number;
  barOpen: number;
  barHigh: number;
  barLow: number;
  barOpenTime: number; // Unix seconds — floored to current 1m bar
}

export class MockProvider extends MarketDataProvider {
  readonly name = 'mock';

  private readonly state: Record<string, SymState> = {};
  private readonly callbacks: Map<string, QuoteCallback[]> = new Map();
  private tickTimer?: ReturnType<typeof setInterval>;
  private startedAt = 0;

  constructor() {
    super();
    const nowSec = Math.floor(Date.now() / 1000);
    const barStart = nowSec - (nowSec % 60);
    for (const [sym, seed] of Object.entries(SEED)) {
      this.state[sym] = {
        price: seed.price,
        dayVolume: Math.floor(Math.random() * 50000) + 5000,
        barOpen: seed.price,
        barHigh: seed.price,
        barLow: seed.price,
        barOpenTime: barStart,
      };
    }
  }

  async connect(): Promise<void> {
    this.startedAt = Date.now();
    // Emit ticks every 750ms to simulate live market activity
    this.tickTimer = setInterval(() => this.tick(), 750);
  }

  async disconnect(): Promise<void> {
    if (this.tickTimer) clearInterval(this.tickTimer);
  }

  subscribeQuote(symbol: string, callback: QuoteCallback): void {
    const existing = this.callbacks.get(symbol) ?? [];
    this.callbacks.set(symbol, [...existing, callback]);
  }

  unsubscribeQuote(symbol: string): void {
    this.callbacks.delete(symbol);
  }

  async getBars(symbol: string, resolution: string, from: number, to: number): Promise<Bar[]> {
    const seed = SEED[symbol.toUpperCase()];
    if (!seed) return [];

    const resMin = resolutionToMinutes(resolution);
    const resSeconds = resMin * 60;
    const bars: Bar[] = [];

    let t = Math.floor(from / resSeconds) * resSeconds;
    let price = seed.price * (1 - 0.005); // start slightly below current

    while (t <= to) {
      const drift = randn() * DRIFT_SIGMA[seed.exchange] * Math.sqrt(resMin);
      const open  = roundToTick(price, seed.tickSize);
      const close = roundToTick(price * (1 + drift), seed.tickSize);
      const hi    = roundToTick(Math.max(open, close) * (1 + Math.abs(randn()) * DRIFT_SIGMA[seed.exchange] * 0.5), seed.tickSize);
      const lo    = roundToTick(Math.min(open, close) * (1 - Math.abs(randn()) * DRIFT_SIGMA[seed.exchange] * 0.5), seed.tickSize);
      const vol   = Math.max(1, Math.floor(Math.random() * 500 + 50));
      bars.push({ symbol, resolution, t, o: open, h: hi, l: lo, c: close, v: vol });
      price = close;
      t += resSeconds;
    }

    return bars;
  }

  getStatus(): DataStatus {
    return {
      provider: this.name,
      status: 'connected',
      dataDelayed: false,
      lastHeartbeat: Date.now(),
    };
  }

  resolveContract(root: string): ContractSpec {
    return resolveContract(root);
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private tick(): void {
    const nowMs  = Date.now();
    const nowSec = Math.floor(nowMs / 1000);
    const barStart = nowSec - (nowSec % 60);

    for (const [sym, seed] of Object.entries(SEED)) {
      const st = this.state[sym];
      const sigma = DRIFT_SIGMA[seed.exchange];
      const newPrice = roundToTick(st.price * (1 + randn() * sigma * 0.2), seed.tickSize);

      // Bar rollover
      if (barStart > st.barOpenTime) {
        st.barOpen     = newPrice;
        st.barHigh     = newPrice;
        st.barLow      = newPrice;
        st.barOpenTime = barStart;
      }

      st.price      = newPrice;
      st.barHigh    = Math.max(st.barHigh, newPrice);
      st.barLow     = Math.min(st.barLow, newPrice);
      st.dayVolume += Math.floor(Math.random() * 10 + 1);

      const spread = newPrice * SPREAD_PCT[seed.exchange];
      const half   = spread / 2;

      const quote: Quote = {
        symbol:        sym,
        contract:      this.resolveContract(sym).active,
        exchange:      seed.exchange,
        price:         newPrice,
        bid:           roundToTick(newPrice - half, seed.tickSize),
        ask:           roundToTick(newPrice + half, seed.tickSize),
        volume:        st.dayVolume,
        timestamp:     nowMs,
        sessionStatus: 'RTH',
      };

      const cbs = this.callbacks.get(sym);
      if (cbs) cbs.forEach(cb => cb(quote));
    }
  }
}

function resolutionToMinutes(resolution: string): number {
  if (resolution === 'D') return 1440;
  if (resolution === 'W') return 10080;
  return parseInt(resolution, 10) || 1;
}
