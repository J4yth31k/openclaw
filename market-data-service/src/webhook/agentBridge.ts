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
      rsi:       alert.rsi,
      atr:       alert.atr,
      vol_ratio: alert.vol_ratio,
      fast_ema:  alert.fast_ema,
      slow_ema:  alert.slow_ema,
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
  const dir     = alert.action === 'BUY' ? 'bullish' : alert.action === 'SELL' ? 'bearish' : 'neutral';
  const rsiNote = alert.rsi !== undefined
    ? alert.rsi > 70 ? ' RSI overbought — watch for fade.'
    : alert.rsi < 30 ? ' RSI oversold — watch for bounce.'
    : ` RSI ${alert.rsi.toFixed(0)} — neutral momentum.`
    : '';
  const sessionNote = session.overlap
    ? ` High-liquidity ${session.overlap} overlap active.`
    : session.name === 'RTH' ? ' RTH session — full liquidity.'
    : session.name === 'OVERNIGHT' ? ' Overnight session — reduced liquidity.'
    : '';
  return `${alert.symbol} showing ${dir} bias at ${alert.price}.${rsiNote}${sessionNote}`;
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
