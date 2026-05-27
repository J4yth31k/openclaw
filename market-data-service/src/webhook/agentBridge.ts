import https from 'https';
import http  from 'http';
import { TradingViewAlert } from './types';
import { SessionInfo } from './session';
import { computeMultiTFSnapshot, MultiTFSnapshot, TFSnapshot } from '../indicators';

const AGENT_API_URL = process.env.AGENT_API_URL ?? 'http://localhost:8001/analyze';

/**
 * Sends alert + live-computed scalping indicators to the Python agent API.
 * Falls back to a full Iron Man-style inline analysis if the agent is unreachable.
 */
export async function getAgentAnalysis(
  alert:   TradingViewAlert,
  session: SessionInfo,
): Promise<string> {

  // Compute live scalping indicators across 1m / 5m / 15m
  const multi = await computeMultiTFSnapshot(alert.symbol).catch(() => ({ symbol: alert.symbol, tf1m: null, tf5m: null, tf15m: null }));
  const snap  = multi.tf1m; // use 1m as primary for alert payload merge

  // Merge alert fields with computed snapshot (alert fields take priority if present)
  const merged = mergeIndicators(alert, snap);

  const payload = JSON.stringify({
    symbol:     alert.symbol,
    action:     alert.action,
    price:      alert.price,
    timeframe:  alert.timeframe,
    session:    session.name,
    overlap:    session.overlap ?? null,
    indicators: merged,
    strategy:   alert.strategy,
    tier:       alert.tier,
    // Flat PriceFeed v2 fields — agent_api.py reads these via _ind() helper
    rsi:        alert.rsi        ?? null,
    atr:        alert.atr        ?? null,
    ema21:      alert.ema21      ?? null,
    ema55:      alert.ema55      ?? null,
    vwap:       alert.vwap       ?? null,
    prev_high:  alert.prev_high  ?? null,
    prev_low:   alert.prev_low   ?? null,
    rsi_context: alert.rsi_context ?? null,
    level_hint:  alert.level_hint  ?? null,
  });

  try {
    const raw  = await httpPost(AGENT_API_URL, payload);
    const resp = JSON.parse(raw) as Record<string, unknown>;
    return String(resp['analysis'] ?? resp['message'] ?? raw).slice(0, 1400);
  } catch {
    return buildIronManAnalysis(alert, session, multi);
  }
}

// ── Merge alert payload fields with live-computed snapshot ────────────────────
function mergeIndicators(alert: TradingViewAlert, snap: TFSnapshot | null) {
  return {
    rsi:          alert.rsi         ?? snap?.rsi,
    atr:          alert.atr         ?? snap?.atr,
    vol_ratio:    alert.vol_ratio   ?? snap?.vol_ratio,
    stoch_k:      alert.stoch_k     ?? snap?.stoch_k,
    stoch_d:      alert.stoch_d     ?? snap?.stoch_d,
    ema8:         alert.ema8        ?? snap?.ema8,
    ema21:        alert.ema21       ?? snap?.ema21,
    ema55:        alert.ema55       ?? snap?.ema55,
    vwap:         alert.vwap        ?? snap?.vwap,
    vwap_u1:      alert.vwap_u1     ?? snap?.vwap_u1,
    vwap_l1:      alert.vwap_l1     ?? snap?.vwap_l1,
    momentum:     alert.momentum    ?? snap?.momentum,
    squeeze:      alert.squeeze     ?? snap?.squeeze_on,
    ribbon_bull:  alert.ribbon_bull ?? snap?.ribbon_bull,
    signal:       alert.signal,
    // PriceFeed v2 extras
    prev_high:    alert.prev_high   ?? null,
    prev_low:     alert.prev_low    ?? null,
    nwog_present: alert.nwog_present ?? null,
    nwog_level:   alert.nwog_level   ?? null,
    eqh:          alert.eqh          ?? null,
    eql:          alert.eql          ?? null,
    rsi_context:  alert.rsi_context  ?? null,
    level_hint:   alert.level_hint   ?? null,
  };
}

// ── Iron Man inline analysis — multi-timeframe ────────────────────────────────
function buildIronManAnalysis(
  alert:   TradingViewAlert,
  session: SessionInfo,
  multi:   MultiTFSnapshot,
): string {
  const { symbol, tf1m, tf5m, tf15m } = multi;
  const price = alert.price;
  const dir   = alert.action === 'BUY' ? 'bullish' : alert.action === 'SELL' ? 'bearish' : 'neutral';
  const pFmt  = price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const lines: string[] = [];
  lines.push(`[Iron Man] ${symbol} ${dir} @ ${pFmt}`);

  // ── Per-timeframe summary rows ────────────────────────────────
  const tfRows: string[] = [];
  for (const [label, tf] of [['15m', tf15m], ['5m', tf5m], ['1m', tf1m]] as [string, TFSnapshot | null][]) {
    if (!tf) continue;

    const ribbon = tf.ribbon_bull ? '🟢 Ribbon▲' : tf.ribbon_bear ? '🔴 Ribbon▼' : '⚪ Ribbon—';
    const k      = tf.stoch_k;
    const stoch  = k > 80 ? `K=${k.toFixed(0)}⚠️OB` : k < 20 ? `K=${k.toFixed(0)}⚠️OS` : `K=${k.toFixed(0)}`;
    const vwapSide = price > tf.vwap ? '▲VWAP' : '▼VWAP';
    const sqz    = tf.squeeze_on ? '🟡SQZ' : tf.momentum > 0 ? '💚MOM+' : tf.momentum < 0 ? '❤️MOM-' : '';
    const rvol   = tf.vol_ratio > 1.5 ? `🔥${tf.vol_ratio.toFixed(1)}x` : '';

    const row = [label, ribbon, stoch, vwapSide, sqz, rvol].filter(Boolean).join(' | ');
    tfRows.push(row);
  }
  if (tfRows.length) lines.push(tfRows.join('\n'));

  // ── Confluence read ───────────────────────────────────────────
  const tfs = [tf15m, tf5m, tf1m].filter(Boolean) as TFSnapshot[];
  if (tfs.length >= 2) {
    const bullCount = tfs.filter(t => t.ribbon_bull).length;
    const bearCount = tfs.filter(t => t.ribbon_bear).length;
    if (bullCount === tfs.length)       lines.push('✅ All TFs aligned BULLISH — high confluence.');
    else if (bearCount === tfs.length)  lines.push('✅ All TFs aligned BEARISH — high confluence.');
    else if (bullCount > bearCount)     lines.push('⚠️ Mixed — majority bullish. Wait for 5m/1m alignment.');
    else if (bearCount > bullCount)     lines.push('⚠️ Mixed — majority bearish. Wait for 5m/1m alignment.');
    else                                lines.push('⚠️ TF conflict — stand aside until alignment clears.');
  }

  // ── VWAP band context (from 5m or 1m) ────────────────────────
  const ref = tf5m ?? tf1m;
  if (ref) {
    const vwap  = alert.vwap ?? ref.vwap;
    const vwapU = alert.vwap_u1 ?? ref.vwap_u1;
    const vwapL = alert.vwap_l1 ?? ref.vwap_l1;
    const pct   = Math.abs((price - vwap) / vwap * 100).toFixed(2);
    const zone  = price > vwapU ? '(+1SD — extended, fade risk)'
                : price < vwapL ? '(-1SD — extended, bounce watch)'
                : '(inside bands — trend continuation ok)';
    lines.push(`📍 Price ${price > vwap ? 'above' : 'below'} VWAP ${pct}% ${zone}`);
  }

  // ── ATR + session ─────────────────────────────────────────────
  const atr = alert.atr ?? tf1m?.atr ?? tf5m?.atr;
  if (atr) lines.push(`ATR ${atr.toFixed(2)} — projected range ±${(atr * 1.5).toFixed(1)} pts`);

  if (session.overlap)           lines.push(`⚡ ${session.overlap} overlap — peak liquidity.`);
  else if (session.name === 'RTH') lines.push('🔔 RTH session — full liquidity.');

  const ribbonBull = alert.ribbon_bull ?? tf5m?.ribbon_bull ?? tf1m?.ribbon_bull;
  const bias = ribbonBull === true ? 'longs' : ribbonBull === false ? 'shorts' : dir === 'bullish' ? 'longs' : 'shorts';
  lines.push(`Favor ${bias}. Size accordingly.`);

  return lines.join('\n');
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
