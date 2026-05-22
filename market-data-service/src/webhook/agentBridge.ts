import https from 'https';
import http  from 'http';
import { TradingViewAlert } from './types';
import { SessionInfo } from './session';
import { computeScalpingSnapshot, ScalpingSnapshot } from '../indicators';

const AGENT_API_URL = process.env.AGENT_API_URL ?? 'http://localhost:8001/analyze';

/**
 * Sends alert + live-computed scalping indicators to the Python agent API.
 * Falls back to a full Iron Man-style inline analysis if the agent is unreachable.
 */
export async function getAgentAnalysis(
  alert:   TradingViewAlert,
  session: SessionInfo,
): Promise<string> {

  // Compute live scalping indicators from 1m bar data
  const snap = await computeScalpingSnapshot(alert.symbol).catch(() => null);

  // Merge alert fields with computed snapshot (alert fields take priority if present)
  const merged = mergeIndicators(alert, snap);

  const payload = JSON.stringify({
    symbol:    alert.symbol,
    action:    alert.action,
    price:     alert.price,
    timeframe: alert.timeframe,
    session:   session.name,
    overlap:   session.overlap ?? null,
    indicators: merged,
    strategy:  alert.strategy,
    tier:      alert.tier,
  });

  try {
    const raw  = await httpPost(AGENT_API_URL, payload);
    const resp = JSON.parse(raw) as Record<string, unknown>;
    return String(resp['analysis'] ?? resp['message'] ?? raw).slice(0, 1400);
  } catch {
    return buildIronManAnalysis(alert, session, snap);
  }
}

// ── Merge alert payload fields with live-computed snapshot ────────────────────
function mergeIndicators(alert: TradingViewAlert, snap: ScalpingSnapshot | null) {
  return {
    rsi:         alert.rsi         ?? snap?.rsi,
    atr:         alert.atr         ?? snap?.atr,
    vol_ratio:   alert.vol_ratio   ?? snap?.vol_ratio,
    stoch_k:     alert.stoch_k     ?? snap?.stoch_k,
    stoch_d:     alert.stoch_d     ?? snap?.stoch_d,
    ema8:        alert.ema8        ?? snap?.ema8,
    ema21:       alert.ema21       ?? snap?.ema21,
    ema55:       alert.ema55       ?? snap?.ema55,
    vwap:        alert.vwap        ?? snap?.vwap,
    vwap_u1:     alert.vwap_u1     ?? snap?.vwap_u1,
    vwap_l1:     alert.vwap_l1     ?? snap?.vwap_l1,
    momentum:    alert.momentum    ?? snap?.momentum,
    squeeze:     alert.squeeze     ?? snap?.squeeze_on,
    ribbon_bull: alert.ribbon_bull ?? snap?.ribbon_bull,
    signal:      alert.signal,
  };
}

// ── Iron Man inline analysis (runs when Python API is unreachable) ────────────
function buildIronManAnalysis(
  alert:   TradingViewAlert,
  session: SessionInfo,
  snap:    ScalpingSnapshot | null,
): string {
  const price = alert.price;
  const sym   = alert.symbol;
  const dir   = alert.action === 'BUY' ? 'bullish' : alert.action === 'SELL' ? 'bearish' : 'neutral';

  // Use computed snapshot when alert fields are missing
  const ribbonBull = alert.ribbon_bull ?? snap?.ribbon_bull;
  const stochK     = alert.stoch_k     ?? snap?.stoch_k;
  const vwap       = alert.vwap        ?? snap?.vwap;
  const vwapU1     = alert.vwap_u1     ?? snap?.vwap_u1;
  const vwapL1     = alert.vwap_l1     ?? snap?.vwap_l1;
  const squeeze    = alert.squeeze     ?? snap?.squeeze_on;
  const momentum   = alert.momentum    ?? snap?.momentum;
  const rsi        = alert.rsi         ?? snap?.rsi;
  const atr        = alert.atr         ?? snap?.atr;
  const volRatio   = alert.vol_ratio   ?? snap?.vol_ratio;
  const ema8       = alert.ema8        ?? snap?.ema8;
  const ema21      = alert.ema21       ?? snap?.ema21;
  const ema55      = alert.ema55       ?? snap?.ema55;

  const parts: string[] = [];
  parts.push(`[Iron Man] ${sym} ${dir} @ ${price.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}.`);

  // EMA Ribbon
  if (ribbonBull !== undefined) {
    parts.push(ribbonBull
      ? '🟢 EMA ribbon aligned UP (8>13>21>34).'
      : '🔴 EMA ribbon aligned DOWN (8<13<21<34).');
  } else if (ema8 && ema21 && ema55) {
    const trend = ema8 > ema21 ? 'Short-term bullish' : 'Short-term bearish';
    parts.push(`📊 ${trend} — EMA8 ${ema8.toFixed(1)} vs EMA21 ${ema21.toFixed(1)} vs EMA55 ${ema55.toFixed(1)}.`);
  }

  // Stoch RSI
  if (stochK !== undefined) {
    const k = stochK;
    const kLabel = k > 80 ? '⚠️ Overbought' : k < 20 ? '⚠️ Oversold' : '✅ Neutral zone';
    parts.push(`Stoch RSI K=${k.toFixed(0)} — ${kLabel}.`);
  } else if (rsi !== undefined) {
    const rLabel = rsi > 70 ? '⚠️ Overbought' : rsi < 30 ? '⚠️ Oversold' : 'neutral';
    parts.push(`RSI ${rsi.toFixed(0)} — ${rLabel}.`);
  }

  // VWAP
  if (vwap !== undefined) {
    const side    = price > vwap ? 'above' : 'below';
    const pct     = Math.abs((price - vwap) / vwap * 100).toFixed(2);
    const zone    = vwapU1 && vwapL1
      ? price > vwapU1 ? ' (+1σ band — extended).'
        : price < vwapL1 ? ' (-1σ band — extended).'
        : ' (inside VWAP bands).'
      : '.';
    parts.push(`📍 Price ${side} VWAP by ${pct}%${zone}`);
  }

  // TTM Squeeze
  if (squeeze !== undefined) {
    if (squeeze) {
      parts.push('🟡 TTM Squeeze ACTIVE — momentum coiling, breakout incoming.');
    } else if (momentum !== undefined) {
      const momDir = momentum > 0 ? '⬆️ bullish' : '⬇️ bearish';
      parts.push(`💥 Squeeze released with ${momDir} momentum (${momentum.toFixed(2)}).`);
    }
  }

  // ATR context
  if (atr !== undefined) {
    parts.push(`ATR ${atr.toFixed(2)} — expect ${(atr * 2).toFixed(2)}-pt range on this bar.`);
  }

  // Volume
  if (volRatio !== undefined && volRatio > 1.3) {
    parts.push(`🔥 RVOL ${volRatio.toFixed(1)}x avg — elevated participation.`);
  }

  // Session
  if (session.overlap) parts.push(`⚡ ${session.overlap} overlap — peak liquidity.`);
  else if (session.name === 'RTH') parts.push('🔔 RTH session — full liquidity.');

  // Risk note
  const bias = ribbonBull === true ? 'longs' : ribbonBull === false ? 'shorts' : dir === 'bullish' ? 'longs' : 'shorts';
  parts.push(`Favor ${bias}. Manage size — RTH only.`);

  if (snap) {
    parts.push(`[${snap.bars_used} bars analyzed]`);
  }

  return parts.join(' ');
}

function httpPost(url: string, body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const u      = new URL(url);
    const client = u.protocol === 'https:' ? https : http;
    const req    = client.request({
      hostname: u.hostname,
      port:     u.port || (u.protocol === 'https:' ? 443 : 80),
      path:     u.pathname,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end',  () => resolve(data));
    });
    req.setTimeout(5_000, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
