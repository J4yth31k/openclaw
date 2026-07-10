// ── Market data engine ────────────────────────────────────────────────────────
// Real analysis, no signals: volume profile (POC / value area / HVN / LVN) and
// liquidity levels (equal highs/lows, session extremes, round numbers).
//
// Live source: Twelve Data (free API key) using QQQ / SPY as NQ / ES proxies —
// true CME futures feeds are licensed, the ETFs track them almost tick-for-tick.
// Falls back to a realistic simulator when no key / offline.

export interface Candle { t: number; o: number; h: number; l: number; c: number; v: number }

export type LevelType =
  | 'POC' | 'VAH' | 'VAL' | 'HVN' | 'LVN'
  | 'EQH' | 'EQL' | 'SessionHigh' | 'SessionLow' | 'Round'

export interface PriceLevel {
  price: number
  type: LevelType
  strength: number      // 1–3
  note: string
}

export interface InstrumentAnalysis {
  symbol: string        // display: NQ / ES
  proxySymbol: string   // data: QQQ / SPY
  price: number
  changePct: number
  levels: PriceLevel[]
  updatedAt: number     // real-clock ms
  source: 'live' | 'sim'
  observations: string[]   // derived, human-readable market notes
}

export interface MarketState {
  apiKey: string
  instruments: Record<string, InstrumentAnalysis>
  lastError: string | null
  fetching: boolean
}

export const INSTRUMENTS: Array<{ symbol: string; proxy: string; simBase: number; roundStep: number }> = [
  { symbol: 'NQ', proxy: 'QQQ', simBase: 530, roundStep: 5 },
  { symbol: 'ES', proxy: 'SPY', simBase: 610, roundStep: 5 },
]

export const API_KEY_STORAGE = 'simworld_twelvedata_key'

export function loadApiKey(): string {
  try { return localStorage.getItem(API_KEY_STORAGE) ?? '' } catch { return '' }
}

export function saveApiKey(key: string) {
  try { localStorage.setItem(API_KEY_STORAGE, key) } catch { /* ignore */ }
}

// ── Live fetch (Twelve Data) ──────────────────────────────────────────────────

async function fetchCandles(proxy: string, apiKey: string): Promise<Candle[]> {
  const url = `https://api.twelvedata.com/time_series?symbol=${proxy}&interval=5min&outputsize=156&apikey=${encodeURIComponent(apiKey)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  if (json.status === 'error' || !json.values) throw new Error(json.message ?? 'No data')
  interface Row { datetime: string; open: string; high: string; low: string; close: string; volume: string }
  return (json.values as Row[])
    .map(v => ({
      t: new Date(v.datetime.replace(' ', 'T')).getTime(),
      o: parseFloat(v.open), h: parseFloat(v.high),
      l: parseFloat(v.low),  c: parseFloat(v.close),
      v: parseFloat(v.volume) || 1,
    }))
    .reverse()   // oldest → newest
}

// ── Simulator fallback (realistic intraday price action) ─────────────────────

function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function simulateCandles(base: number): Candle[] {
  const daySeed = Math.floor(Date.now() / 86400000)
  const rnd = mulberry(daySeed * 7919)
  const candles: Candle[] = []
  let price = base * (0.995 + rnd() * 0.01)
  const start = Date.now() - 156 * 5 * 60 * 1000

  for (let i = 0; i < 156; i++) {
    const sessionPos = (i % 78) / 78                       // intraday position
    const vol = 0.0009 * (1 + Math.sin(sessionPos * Math.PI) * -0.4 + (sessionPos < 0.12 || sessionPos > 0.88 ? 0.9 : 0))
    const drift = (rnd() - 0.5) * 2 * vol * price
    const o = price
    const c = price + drift
    const wick = vol * price * (0.4 + rnd())
    const h = Math.max(o, c) + wick * rnd()
    const l = Math.min(o, c) - wick * rnd()
    // U-shaped volume: heavy at open/close
    const volume = Math.round(1000 * (0.6 + (sessionPos < 0.12 || sessionPos > 0.85 ? 1.6 : 0) + rnd()))
    candles.push({ t: start + i * 5 * 60 * 1000, o, h, l, c, v: volume })
    price = c
  }
  return candles
}

// ── Volume profile ────────────────────────────────────────────────────────────

function computeVolumeProfile(candles: Candle[], out: PriceLevel[]) {
  const lo = Math.min(...candles.map(c => c.l))
  const hi = Math.max(...candles.map(c => c.h))
  if (hi <= lo) return
  const BINS = 40
  const binSize = (hi - lo) / BINS
  const vols = new Array<number>(BINS).fill(0)

  for (const c of candles) {
    // Spread each candle's volume across the bins its range covers
    const b0 = Math.max(0, Math.min(BINS - 1, Math.floor((c.l - lo) / binSize)))
    const b1 = Math.max(0, Math.min(BINS - 1, Math.floor((c.h - lo) / binSize)))
    const per = c.v / (b1 - b0 + 1)
    for (let b = b0; b <= b1; b++) vols[b] += per
  }

  const binPrice = (b: number) => lo + (b + 0.5) * binSize
  const total = vols.reduce((s, v) => s + v, 0)

  // POC
  let pocBin = 0
  for (let b = 1; b < BINS; b++) if (vols[b] > vols[pocBin]) pocBin = b
  out.push({ price: binPrice(pocBin), type: 'POC', strength: 3, note: 'Point of control — highest traded volume' })

  // Value area (70%)
  let vaVol = vols[pocBin]
  let up = pocBin + 1, dn = pocBin - 1
  while (vaVol < total * 0.7 && (up < BINS || dn >= 0)) {
    const upV = up < BINS ? vols[up] : -1
    const dnV = dn >= 0 ? vols[dn] : -1
    if (upV >= dnV) { vaVol += upV; up++ } else { vaVol += dnV; dn-- }
  }
  out.push({ price: binPrice(Math.min(BINS - 1, up - 1)), type: 'VAH', strength: 2, note: 'Value area high' })
  out.push({ price: binPrice(Math.max(0, dn + 1)),        type: 'VAL', strength: 2, note: 'Value area low' })

  // HVN / LVN: local extremes
  const sorted = [...vols].sort((a, b) => a - b)
  const p80 = sorted[Math.floor(BINS * 0.8)]
  const p25 = sorted[Math.floor(BINS * 0.25)]
  let hvn = 0, lvn = 0
  for (let b = 2; b < BINS - 2 && (hvn < 2 || lvn < 2); b++) {
    if (Math.abs(b - pocBin) <= 2) continue
    const isMax = vols[b] >= vols[b - 1] && vols[b] >= vols[b + 1]
    const isMin = vols[b] <= vols[b - 1] && vols[b] <= vols[b + 1]
    if (hvn < 2 && isMax && vols[b] >= p80) {
      out.push({ price: binPrice(b), type: 'HVN', strength: 2, note: 'High-volume node — acceptance area' })
      hvn++
    } else if (lvn < 2 && isMin && vols[b] <= p25 && vols[b] > 0) {
      out.push({ price: binPrice(b), type: 'LVN', strength: 1, note: 'Low-volume node — price moves fast through here' })
      lvn++
    }
  }
}

// ── Liquidity levels ──────────────────────────────────────────────────────────

function computeLiquidity(candles: Candle[], roundStep: number, out: PriceLevel[]) {
  const price = candles[candles.length - 1].c

  // Swing highs / lows (fractal: higher/lower than 2 neighbours each side)
  const swingHighs: number[] = []
  const swingLows: number[] = []
  for (let i = 2; i < candles.length - 2; i++) {
    const c = candles[i]
    if (c.h > candles[i-1].h && c.h > candles[i-2].h && c.h > candles[i+1].h && c.h > candles[i+2].h) swingHighs.push(c.h)
    if (c.l < candles[i-1].l && c.l < candles[i-2].l && c.l < candles[i+1].l && c.l < candles[i+2].l) swingLows.push(c.l)
  }

  // Cluster near-equal swings → resting liquidity
  const tol = price * 0.0008
  const cluster = (values: number[], type: 'EQH' | 'EQL') => {
    const used = new Set<number>()
    for (let i = 0; i < values.length; i++) {
      if (used.has(i)) continue
      const group = [values[i]]
      for (let j = i + 1; j < values.length; j++) {
        if (!used.has(j) && Math.abs(values[j] - values[i]) < tol) { group.push(values[j]); used.add(j) }
      }
      if (group.length >= 2) {
        const level = group.reduce((s, v) => s + v, 0) / group.length
        out.push({
          price: level,
          type,
          strength: Math.min(3, group.length),
          note: type === 'EQH'
            ? `Buy-side liquidity — equal highs (${group.length} touches)`
            : `Sell-side liquidity — equal lows (${group.length} touches)`,
        })
      }
    }
  }
  cluster(swingHighs, 'EQH')
  cluster(swingLows, 'EQL')

  // Session extremes (last ~78 bars ≈ one RTH day of 5-min candles)
  const session = candles.slice(-78)
  out.push({ price: Math.max(...session.map(c => c.h)), type: 'SessionHigh', strength: 3, note: 'Session high — liquidity resting above' })
  out.push({ price: Math.min(...session.map(c => c.l)), type: 'SessionLow',  strength: 3, note: 'Session low — liquidity resting below' })

  // Nearest round numbers
  const below = Math.floor(price / roundStep) * roundStep
  const above = below + roundStep
  out.push({ price: above, type: 'Round', strength: 1, note: 'Round number magnet' })
  out.push({ price: below, type: 'Round', strength: 1, note: 'Round number magnet' })
}

// ── Observations (derived, human-readable — analysis, not signals) ───────────

function deriveObservations(candles: Candle[], levels: PriceLevel[], symbol: string): string[] {
  const obs: string[] = []
  const price = candles[candles.length - 1].c
  const poc = levels.find(l => l.type === 'POC')
  const vah = levels.find(l => l.type === 'VAH')
  const val = levels.find(l => l.type === 'VAL')

  if (poc && vah && val) {
    if (price > vah.price)      obs.push(`${symbol} trading above value — acceptance or look for rotation back to POC ${poc.price.toFixed(2)}`)
    else if (price < val.price) obs.push(`${symbol} trading below value — watch POC ${poc.price.toFixed(2)} as magnet overhead`)
    else                        obs.push(`${symbol} inside value area — balanced; POC at ${poc.price.toFixed(2)}`)
  }

  const eqhAbove = levels.filter(l => l.type === 'EQH' && l.price > price).sort((a, b) => a.price - b.price)[0]
  const eqlBelow = levels.filter(l => l.type === 'EQL' && l.price < price).sort((a, b) => b.price - a.price)[0]
  if (eqhAbove) obs.push(`Nearest buy-side pool above at ${eqhAbove.price.toFixed(2)} (${(((eqhAbove.price - price) / price) * 100).toFixed(2)}% away)`)
  if (eqlBelow) obs.push(`Nearest sell-side pool below at ${eqlBelow.price.toFixed(2)} (${(((price - eqlBelow.price) / price) * 100).toFixed(2)}% away)`)

  // Volume spike in the last few bars
  const recent = candles.slice(-6)
  const avgV = candles.slice(-40, -6).reduce((s, c) => s + c.v, 0) / 34
  const maxRecent = Math.max(...recent.map(c => c.v))
  if (maxRecent > avgV * 2.2) obs.push(`Volume spike in the last 30 min (${(maxRecent / avgV).toFixed(1)}× average) — participation increasing`)

  // Session-extreme sweep check
  const sh = levels.find(l => l.type === 'SessionHigh')
  const sl = levels.find(l => l.type === 'SessionLow')
  const last3 = candles.slice(-3)
  if (sh && last3.some(c => c.h >= sh.price) && price < sh.price * 0.9995) obs.push('Session high was tagged and rejected — possible sweep of buy-side liquidity')
  if (sl && last3.some(c => c.l <= sl.price) && price > sl.price * 1.0005) obs.push('Session low was tagged and reclaimed — possible sweep of sell-side liquidity')

  return obs
}

// ── Public: build a full analysis for one instrument ─────────────────────────

export async function analyzeInstrument(
  def: { symbol: string; proxy: string; simBase: number; roundStep: number },
  apiKey: string,
): Promise<InstrumentAnalysis> {
  let candles: Candle[]
  let source: 'live' | 'sim'

  if (apiKey) {
    try {
      candles = await fetchCandles(def.proxy, apiKey)
      source = 'live'
    } catch {
      candles = simulateCandles(def.simBase)
      source = 'sim'
    }
  } else {
    candles = simulateCandles(def.simBase)
    source = 'sim'
  }

  if (candles.length < 20) {
    candles = simulateCandles(def.simBase)
    source = 'sim'
  }

  const levels: PriceLevel[] = []
  computeVolumeProfile(candles, levels)
  computeLiquidity(candles, def.roundStep, levels)
  levels.sort((a, b) => b.price - a.price)

  const price = candles[candles.length - 1].c
  const dayOpen = candles[Math.max(0, candles.length - 78)].o

  return {
    symbol: def.symbol,
    proxySymbol: def.proxy,
    price,
    changePct: ((price - dayOpen) / dayOpen) * 100,
    levels: levels.slice(0, 16),
    updatedAt: Date.now(),
    source,
    observations: deriveObservations(candles, levels, def.symbol),
  }
}

export function makeInitialMarket(): MarketState {
  return { apiKey: loadApiKey(), instruments: {}, lastError: null, fetching: false }
}

// ── Live speech lines for the world's analyst agents ─────────────────────────
// Short, real numbers from the current analysis — shown in speech bubbles.

function pickOne<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }

export function analystSpeechLine(role: string, market: MarketState | undefined): string | null {
  if (!market) return null
  const symbols = Object.keys(market.instruments)
  if (symbols.length === 0) return null
  const inst = market.instruments[pickOne(symbols)]
  const price = inst.price
  const p2 = (n: number) => n.toFixed(2)
  const opts: string[] = []

  switch (role) {
    case 'volume_analyst': {
      const poc = inst.levels.find(l => l.type === 'POC')
      const vah = inst.levels.find(l => l.type === 'VAH')
      const val = inst.levels.find(l => l.type === 'VAL')
      const hvn = inst.levels.find(l => l.type === 'HVN')
      const lvn = inst.levels.find(l => l.type === 'LVN')
      if (poc) opts.push(`📊 ${inst.symbol} POC ${p2(poc.price)}`)
      if (vah && val) opts.push(`📊 ${inst.symbol} value ${p2(val.price)}–${p2(vah.price)}`)
      if (hvn) opts.push(`📊 HVN shelf ${p2(hvn.price)} on ${inst.symbol}`)
      if (lvn) opts.push(`📊 Thin spot ${p2(lvn.price)} — fast zone`)
      break
    }
    case 'liquidity_analyst': {
      const eqh = inst.levels.filter(l => l.type === 'EQH' && l.price > price).sort((a, b) => a.price - b.price)[0]
      const eql = inst.levels.filter(l => l.type === 'EQL' && l.price < price).sort((a, b) => b.price - a.price)[0]
      const sh = inst.levels.find(l => l.type === 'SessionHigh')
      const sl = inst.levels.find(l => l.type === 'SessionLow')
      if (eqh) opts.push(`💧 BSL ${p2(eqh.price)} over ${inst.symbol}`)
      if (eql) opts.push(`💧 SSL ${p2(eql.price)} under ${inst.symbol}`)
      if (sh) opts.push(`💧 Pool above S-high ${p2(sh.price)}`)
      if (sl) opts.push(`💧 Pool below S-low ${p2(sl.price)}`)
      break
    }
    case 'session_analyst': {
      const sh = inst.levels.find(l => l.type === 'SessionHigh')
      const sl = inst.levels.find(l => l.type === 'SessionLow')
      if (sh && sl) opts.push(`🕐 ${inst.symbol} range ${p2(sl.price)}–${p2(sh.price)}`)
      if (sh) opts.push(`🕐 Session high ${p2(sh.price)} untested?`)
      if (sl) opts.push(`🕐 Session low ${p2(sl.price)} marked`)
      break
    }
    case 'structure_analyst': {
      const vah = inst.levels.find(l => l.type === 'VAH')
      const val = inst.levels.find(l => l.type === 'VAL')
      if (vah && price > vah.price) opts.push(`🧭 ${inst.symbol} above value @ ${p2(price)}`)
      else if (val && price < val.price) opts.push(`🧭 ${inst.symbol} below value @ ${p2(price)}`)
      else opts.push(`🧭 ${inst.symbol} balanced @ ${p2(price)}`)
      break
    }
    case 'news_analyst': {
      const up = inst.changePct >= 0
      opts.push(`📰 ${inst.symbol} ${up ? '+' : ''}${inst.changePct.toFixed(2)}% today`)
      opts.push(`📰 ${inst.symbol} at ${p2(price)} (${inst.source === 'live' ? 'live' : 'sim'})`)
      break
    }
    default:
      return null
  }

  return opts.length > 0 ? pickOne(opts) : null
}
