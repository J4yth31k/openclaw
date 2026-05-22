/**
 * Pure TypeScript scalping indicator engine.
 * Computes EMA ribbon, RSI, Stoch RSI, VWAP+bands, ATR, TTM Squeeze
 * across 1m, 5m, and 15m timeframes.
 */

import { Bar } from './types';
import { getProvider } from './shared';

export interface TFSnapshot {
  resolution:  string;
  price:       number;
  ema8:        number;
  ema13:       number;
  ema21:       number;
  ema55:       number;
  ribbon_bull: boolean;
  ribbon_bear: boolean;
  rsi:         number;
  stoch_k:     number;
  stoch_d:     number;
  vwap:        number;
  vwap_u1:     number;
  vwap_l1:     number;
  atr:         number;
  squeeze_on:  boolean;
  momentum:    number;
  vol_ratio:   number;
  bars_used:   number;
}

// Keep old name as alias so agentBridge doesn't break
export type ScalpingSnapshot = TFSnapshot & { symbol: string };

export interface MultiTFSnapshot {
  symbol: string;
  tf1m:   TFSnapshot | null;
  tf5m:   TFSnapshot | null;
  tf15m:  TFSnapshot | null;
}

// ── Maths helpers ─────────────────────────────────────────────────────────────

function emaArr(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const out: number[] = [...new Array(period - 1).fill(NaN), prev];
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function smaArr(values: number[], period: number): number[] {
  return values.map((_, i) => {
    if (i < period - 1) return NaN;
    return values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
  });
}

function stddevArr(values: number[], period: number): number[] {
  return values.map((_, i) => {
    if (i < period - 1) return NaN;
    const sl = values.slice(i - period + 1, i + 1);
    const mean = sl.reduce((a, b) => a + b, 0) / period;
    return Math.sqrt(sl.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
  });
}

function rsiArr(closes: number[], period = 14): number[] {
  const out: number[] = new Array(period).fill(NaN);
  if (closes.length <= period) return out;
  let avgG = 0, avgL = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) avgG += d; else avgL -= d;
  }
  avgG /= period; avgL /= period;
  const push = () => { const rs = avgL === 0 ? 100 : avgG / avgL; out.push(100 - 100 / (1 + rs)); };
  push();
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgG = (avgG * (period - 1) + (d > 0 ? d : 0)) / period;
    avgL = (avgL * (period - 1) + (d < 0 ? -d : 0)) / period;
    push();
  }
  return out;
}

function atrArr(bars: Bar[], period = 14): number[] {
  const trs = bars.map((b, i) =>
    i === 0 ? b.h - b.l : Math.max(b.h - b.l, Math.abs(b.h - bars[i-1].c), Math.abs(b.l - bars[i-1].c))
  );
  return smaArr(trs, period);
}

function linregLast(values: number[], period: number): number {
  const sl = values.slice(-period).filter(v => !isNaN(v));
  if (sl.length < 2) return sl[sl.length - 1] ?? 0;
  const n = sl.length;
  const mx = (n - 1) / 2;
  const my = sl.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  sl.forEach((v, i) => { num += (i - mx) * (v - my); den += (i - mx) ** 2; });
  const slope = den !== 0 ? num / den : 0;
  return my + slope * (n - 1 - mx);
}

// ── Core: compute indicators from a bar array ─────────────────────────────────

function computeFromBars(resolution: string, bars: Bar[]): TFSnapshot | null {
  if (!bars || bars.length < 30) return null;

  const closes = bars.map(b => b.c);
  const highs  = bars.map(b => b.h);
  const lows   = bars.map(b => b.l);
  const vols   = bars.map(b => b.v);
  const n      = closes.length - 1;
  const price  = closes[n];

  // ── EMA Ribbon ──────────────────────────────────────────────────
  const e8s  = emaArr(closes, 8);
  const e13s = emaArr(closes, 13);
  const e21s = emaArr(closes, 21);
  const e34s = emaArr(closes, 34);
  const e55s = emaArr(closes, 55);
  const [e8, e13, e21, e34, e55] = [e8s[n], e13s[n], e21s[n], e34s[n], e55s[n]];
  const ribbonBull = e8 > e13 && e13 > e21 && e21 > e34;
  const ribbonBear = e8 < e13 && e13 < e21 && e21 < e34;

  // ── RSI + Stoch RSI ─────────────────────────────────────────────
  const rsiVals  = rsiArr(closes, 14);
  const rsiLast  = rsiVals[n];
  const rsiClean = rsiVals.filter(v => !isNaN(v));
  let stochK = 50;
  if (rsiClean.length >= 14) {
    const sl = rsiClean.slice(-14);
    const lo = Math.min(...sl), hi = Math.max(...sl);
    stochK = hi - lo > 0 ? ((rsiClean[rsiClean.length - 1] - lo) / (hi - lo)) * 100 : 50;
  }

  // ── VWAP with ±1σ ───────────────────────────────────────────────
  const todayStart = (() => { const d = new Date(); d.setHours(0,0,0,0); return Math.floor(d.getTime()/1000); })();
  let cumVol = 0, cumVP = 0, cumVP2 = 0;
  bars.forEach(b => {
    if (b.t < todayStart) return;
    const hlc = (b.h + b.l + b.c) / 3;
    cumVol += b.v; cumVP += hlc * b.v; cumVP2 += hlc * hlc * b.v;
  });
  const vwapVal  = cumVol > 0 ? cumVP / cumVol : price;
  const variance = cumVol > 0 ? cumVP2 / cumVol - vwapVal ** 2 : 0;
  const vwapSd   = variance > 0 ? Math.sqrt(variance) : 0;

  // ── ATR ─────────────────────────────────────────────────────────
  const atrLast = atrArr(bars, 14)[n];

  // ── TTM Squeeze ─────────────────────────────────────────────────
  const sqP    = 20;
  const smaV   = smaArr(closes, sqP);
  const sdV    = stddevArr(closes, sqP);
  const ema20V = emaArr(closes, sqP);
  const atr20V = atrArr(bars, sqP);
  const bbU = smaV[n] + 2.0 * sdV[n];
  const bbL = smaV[n] - 2.0 * sdV[n];
  const kcU = ema20V[n] + 1.5 * atr20V[n];
  const kcL = ema20V[n] - 1.5 * atr20V[n];
  const squeezeOn = bbL > kcL && bbU < kcU;

  const momDeltas: number[] = [];
  for (let i = sqP; i < closes.length; i++) {
    const hh = Math.max(...highs.slice(Math.max(0, i - sqP + 1), i + 1));
    const ll = Math.min(...lows.slice(Math.max(0, i - sqP + 1), i + 1));
    momDeltas.push(closes[i] - ((hh + ll) / 2 + smaV[i]) / 2);
  }
  const momentum = linregLast(momDeltas, sqP);

  // ── Relative Volume ─────────────────────────────────────────────
  const volSma   = smaArr(vols, 20)[n];
  const volRatio = volSma > 0 ? vols[n] / volSma : 1;

  return {
    resolution, price, bars_used: bars.length,
    ema8: e8, ema13: e13, ema21: e21, ema55: e55,
    ribbon_bull: ribbonBull, ribbon_bear: ribbonBear,
    rsi: rsiLast, stoch_k: stochK, stoch_d: stochK,
    vwap: vwapVal, vwap_u1: vwapVal + vwapSd, vwap_l1: vwapVal - vwapSd,
    atr: atrLast, squeeze_on: squeezeOn, momentum, vol_ratio: volRatio,
  };
}

// ── Multi-timeframe entry point ───────────────────────────────────────────────

export async function computeMultiTFSnapshot(symbol: string): Promise<MultiTFSnapshot> {
  const provider = getProvider();
  const result: MultiTFSnapshot = { symbol, tf1m: null, tf5m: null, tf15m: null };
  if (!provider) return result;

  const now = Math.floor(Date.now() / 1000);

  // Fetch all three timeframes in parallel
  const [bars1m, bars5m, bars15m] = await Promise.allSettled([
    provider.getBars(symbol, '1',  now - 60 * 250,  now),  // ~250 1m bars
    provider.getBars(symbol, '5',  now - 60 * 625,  now),  // ~125 5m bars
    provider.getBars(symbol, '15', now - 60 * 1500, now),  // ~100 15m bars
  ]);

  try { result.tf1m  = computeFromBars('1m',  bars1m.status  === 'fulfilled' ? bars1m.value  : []); } catch {}
  try { result.tf5m  = computeFromBars('5m',  bars5m.status  === 'fulfilled' ? bars5m.value  : []); } catch {}
  try { result.tf15m = computeFromBars('15m', bars15m.status === 'fulfilled' ? bars15m.value : []); } catch {}

  return result;
}

// ── Legacy single-TF export (backward compat) ─────────────────────────────────

export async function computeScalpingSnapshot(symbol: string): Promise<ScalpingSnapshot | null> {
  const provider = getProvider();
  if (!provider) return null;
  try {
    const now  = Math.floor(Date.now() / 1000);
    const bars = await provider.getBars(symbol, '1', now - 60 * 250, now);
    const snap = computeFromBars('1m', bars ?? []);
    return snap ? { ...snap, symbol } : null;
  } catch {
    return null;
  }
}
