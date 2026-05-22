import https from 'https';
import http  from 'http';
import { TradingViewAlert } from './types';
import { SessionInfo } from './session';

const AGENT_API_URL = process.env.AGENT_API_URL ?? 'http://localhost:8001/analyze';

/**
 * Sends the alert + session context to the Python agent API.
 * Falls back to a formatted stub if the agent service is unreachable.
 */
export async function getAgentAnalysis(
  alert:   TradingViewAlert,
  session: SessionInfo,
): Promise<string> {
  const payload = JSON.stringify({
    symbol:    alert.symbol,
    action:    alert.action,
    price:     alert.price,
    timeframe: alert.timeframe,
    session:   session.name,
    overlap:   session.overlap ?? null,
    indicators: {
      rsi:         alert.rsi,
      atr:         alert.atr,
      vol_ratio:   alert.vol_ratio,
      fast_ema:    alert.fast_ema,
      slow_ema:    alert.slow_ema,
      stoch_k:     alert.stoch_k,
      stoch_d:     alert.stoch_d,
      ema8:        alert.ema8,
      ema21:       alert.ema21,
      ema55:       alert.ema55,
      vwap:        alert.vwap,
      vwap_u1:     alert.vwap_u1,
      vwap_l1:     alert.vwap_l1,
      momentum:    alert.momentum,
      squeeze:     alert.squeeze,
      ribbon_bull: alert.ribbon_bull,
      signal:      alert.signal,
    },
    strategy:  alert.strategy,
    tier:      alert.tier,
  });

  try {
    const raw  = await httpPost(AGENT_API_URL, payload);
    const resp = JSON.parse(raw) as Record<string, unknown>;
    return String(resp['analysis'] ?? resp['message'] ?? raw).slice(0, 1024);
  } catch (e) {
    console.warn('[agentBridge] Agent API unreachable, using stub:', (e as Error).message);
    return buildStubAnalysis(alert, session);
  }
}

function buildStubAnalysis(alert: TradingViewAlert, session: SessionInfo): string {
  const dir = alert.action === 'BUY' ? 'bullish' : alert.action === 'SELL' ? 'bearish' : 'neutral';
  const parts: string[] = [`${alert.symbol} ${dir} signal at ${alert.price}.`];

  // EMA ribbon
  if (alert.ribbon_bull !== undefined) {
    parts.push(alert.ribbon_bull
      ? 'EMA ribbon aligned bullish (8>13>21>34).'
      : 'EMA ribbon aligned bearish (8<13<21<34).');
  }

  // Stochastic RSI
  if (alert.stoch_k !== undefined) {
    const k = alert.stoch_k;
    if (k > 80)       parts.push(`Stoch RSI ${k.toFixed(0)} — overbought, watch for reversal.`);
    else if (k < 20)  parts.push(`Stoch RSI ${k.toFixed(0)} — oversold, bounce setup.`);
    else              parts.push(`Stoch RSI ${k.toFixed(0)} — momentum building.`);
  } else if (alert.rsi !== undefined) {
    if (alert.rsi > 70)      parts.push('RSI overbought — watch for fade.');
    else if (alert.rsi < 30) parts.push('RSI oversold — watch for bounce.');
    else                     parts.push(`RSI ${alert.rsi.toFixed(0)} neutral.`);
  }

  // VWAP position
  if (alert.vwap !== undefined && alert.price) {
    const aboveBelow = alert.price > alert.vwap ? 'above' : 'below';
    const pctFromVwap = Math.abs((alert.price - alert.vwap) / alert.vwap * 100).toFixed(2);
    parts.push(`Price ${aboveBelow} VWAP by ${pctFromVwap}%.`);
    if (alert.vwap_u1 && alert.vwap_l1) {
      if (alert.price > alert.vwap_u1)      parts.push('Extended above +1SD — potential mean reversion zone.');
      else if (alert.price < alert.vwap_l1) parts.push('Extended below -1SD — potential mean reversion zone.');
    }
  }

  // TTM Squeeze
  if (alert.squeeze !== undefined) {
    if (alert.squeeze) {
      parts.push('Squeeze active — momentum coiling, breakout imminent.');
    } else if (alert.signal === 'squeeze') {
      const momDir = (alert.momentum ?? 0) > 0 ? 'bullish' : 'bearish';
      parts.push(`Squeeze FIRED with ${momDir} momentum.`);
    }
  }

  // Volume
  if (alert.vol_ratio !== undefined && alert.vol_ratio > 1.5) {
    parts.push(`Volume ${alert.vol_ratio.toFixed(1)}x above average — conviction.`);
  }

  // Session
  if (session.overlap) parts.push(`${session.overlap} overlap — high liquidity.`);
  else if (session.name === 'RTH') parts.push('RTH session — full liquidity.');

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
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
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
