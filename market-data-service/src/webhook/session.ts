export type SessionName =
  | 'RTH' | 'PRE-MARKET' | 'POST-MARKET' | 'OVERNIGHT'
  | 'LONDON' | 'NEW_YORK' | 'TOKYO' | 'SYDNEY' | 'CLOSED';

export interface SessionInfo {
  name:     SessionName;
  active:   boolean;
  timezone: string;
  overlap?: string;   // e.g. "LONDON+NEW_YORK" during overlap
}

const FOREX_ROOTS = new Set([
  'EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD','USDCHF','NZDUSD',
  'GBPJPY','EURJPY','EURGBP','AUDJPY','CADJPY','CHFJPY',
]);

const FUTURES_ROOTS = new Set(['NQ','ES','YM','RTY','CL','GC','NG','SI','ZB','ZN','MNQ','MES']);

/** Returns minutes-since-midnight in the given IANA timezone. */
function minutesIn(tz: string, now: Date): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: 'numeric', minute: 'numeric', hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const h = parseInt(parts.find(p => p.type === 'hour')?.value   ?? '0', 10);
  const m = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
  return h * 60 + m;
}

/** True if `t` falls in [start, end). Handles overnight windows (start > end). */
function inWindow(t: number, startH: number, startM: number, endH: number, endM: number): boolean {
  const start = startH * 60 + startM;
  const end   = endH   * 60 + endM;
  if (start <= end) return t >= start && t < end;
  return t >= start || t < end;   // overnight
}

function isFuturesRoot(symbol: string): boolean {
  const root = symbol.replace(/[0-9!]+$/, '').toUpperCase();
  return FUTURES_ROOTS.has(root);
}

function isForexSymbol(symbol: string): boolean {
  const s = symbol.replace('/', '').toUpperCase();
  return FOREX_ROOTS.has(s);
}

export function getSessionForSymbol(symbol: string, now: Date = new Date()): SessionInfo {
  if (isForexSymbol(symbol))   return getForexSession(now);
  if (isFuturesRoot(symbol))   return getFuturesSession(now);
  return getFuturesSession(now);  // default to futures for unknown
}

// ─── Futures sessions (ET) ────────────────────────────────────────────────────

function getFuturesSession(now: Date): SessionInfo {
  const ET = 'America/New_York';
  const t  = minutesIn(ET, now);

  if (inWindow(t,  9, 30, 16,  0)) return { name: 'RTH',          active: true,  timezone: ET };
  if (inWindow(t,  4,  0,  9, 30)) return { name: 'PRE-MARKET',   active: true,  timezone: ET };
  if (inWindow(t, 16,  0, 18,  0)) return { name: 'POST-MARKET',  active: true,  timezone: ET };
  if (inWindow(t, 18,  0, 28,  0)) return { name: 'OVERNIGHT',    active: true,  timezone: ET };  // 6PM–4AM
  return { name: 'CLOSED', active: false, timezone: ET };
}

// ─── Forex sessions (all anchored to ET) ─────────────────────────────────────

function getForexSession(now: Date): SessionInfo {
  const ET = 'America/New_York';
  const t  = minutesIn(ET, now);

  const inSydney   = inWindow(t, 17,  0,  2,  0);   // 5PM–2AM ET
  const inTokyo    = inWindow(t, 19,  0,  4,  0);   // 7PM–4AM ET
  const inLondon   = inWindow(t,  3,  0, 12,  0);   // 3AM–12PM ET
  const inNewYork  = inWindow(t,  8,  0, 17,  0);   // 8AM–5PM ET

  if (inLondon && inNewYork) return { name: 'NEW_YORK', active: true, timezone: ET, overlap: 'LONDON+NEW_YORK' };
  if (inTokyo  && inLondon)  return { name: 'LONDON',   active: true, timezone: ET, overlap: 'TOKYO+LONDON' };
  if (inLondon)              return { name: 'LONDON',   active: true, timezone: ET };
  if (inNewYork)             return { name: 'NEW_YORK', active: true, timezone: ET };
  if (inTokyo)               return { name: 'TOKYO',    active: true, timezone: ET };
  if (inSydney)              return { name: 'SYDNEY',   active: true, timezone: ET };
  return { name: 'CLOSED', active: false, timezone: ET };
}
