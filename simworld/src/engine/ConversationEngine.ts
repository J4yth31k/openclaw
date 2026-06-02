import type {
  AgentConversation, ConversationMessage, ConversationSection,
  AgentSentiment, ConversationType, ConversationOutcome, AgentId,
} from '../types'
import { AVENGERS_DEFS, AGENT_DEFS } from '../data/worldData'
import type { GameTime, TradeRecord } from '../types'
import { timeLabel } from './TimeSystem'

// ── ID factories ──────────────────────────────────────────────────────────────

let _convId = 0
function uid()   { return `conv_${++_convId}_${Date.now()}` }
function msgUid() { return `msg_${_convId}_${Math.random().toString(36).slice(2, 7)}` }

// ── Agent roster lookup ───────────────────────────────────────────────────────

const ALL_DEFS = [...AGENT_DEFS, ...AVENGERS_DEFS]

function agentDef(id: string) {
  return ALL_DEFS.find(a => a.id === id) ?? ALL_DEFS[0]
}

// ── Message builder ───────────────────────────────────────────────────────────

function msg(
  agentId: string,
  simMinute: number,
  label: string,
  content: string,
  opts: {
    confidence?: number
    riskLevel?: 'low' | 'medium' | 'high' | 'critical'
    sentiment?: AgentSentiment
    tags?: string[]
    sections?: ConversationSection[]
  } = {}
): ConversationMessage {
  const a = agentDef(agentId)
  return {
    id: msgUid(),
    agentId: agentId as AgentId,
    agentName: a.name,
    agentRole: a.role,
    agentEmoji: a.emoji ?? '🤖',
    agentColor: a.color,
    simMinute,
    timeLabel: label,
    content,
    confidence: opts.confidence ?? 72,
    riskLevel: opts.riskLevel ?? 'medium',
    sentiment: opts.sentiment ?? 'neutral',
    tags: opts.tags ?? [],
    sections: opts.sections ?? [],
  }
}

// ── Random helpers ─────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }
function rand(min: number, max: number) { return +(min + Math.random() * (max - min)).toFixed(4) }
function pct(n: number) { return `${Math.round(n)}%` }
function fmt(p: number) { return p.toFixed(4) }
function pip(p: number) { return Math.round(p * 10000) }

// ── Instrument catalog ─────────────────────────────────────────────────────────

// Forex pairs
const FOREX_PAIRS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'NZD/USD', 'GBP/JPY', 'EUR/GBP', 'USD/CAD']

// Futures instruments
const FUTURES = ['NQ', 'ES', 'CL', 'ZN', 'GC', 'RTY']

const PAIRS = [...FOREX_PAIRS, ...FUTURES]

// Instrument metadata: base price, SL range (in price units), tick description
const INSTRUMENT_META: Record<string, {
  basePrice: number
  slRange: [number, number]   // [min, max] SL distance in price units
  tpMult: [number, number]    // TP = SL * random(min, max)
  decimals: number
  tickLabel: string           // "pips" | "points" | "ticks"
  category: 'forex' | 'futures_index' | 'futures_commodity' | 'futures_bond' | 'futures_metal'
}> = {
  'EUR/USD': { basePrice: 1.0842, slRange: [0.0010, 0.0025], tpMult: [1.5, 3.5], decimals: 4, tickLabel: 'pips',   category: 'forex' },
  'GBP/USD': { basePrice: 1.2640, slRange: [0.0012, 0.0028], tpMult: [1.5, 3.0], decimals: 4, tickLabel: 'pips',   category: 'forex' },
  'USD/JPY': { basePrice: 149.80, slRange: [0.15,   0.40],   tpMult: [1.5, 3.0], decimals: 2, tickLabel: 'pips',   category: 'forex' },
  'AUD/USD': { basePrice: 0.6540, slRange: [0.0008, 0.0020], tpMult: [1.5, 3.0], decimals: 4, tickLabel: 'pips',   category: 'forex' },
  'NZD/USD': { basePrice: 0.6040, slRange: [0.0008, 0.0020], tpMult: [1.5, 3.0], decimals: 4, tickLabel: 'pips',   category: 'forex' },
  'GBP/JPY': { basePrice: 189.40, slRange: [0.20,   0.55],   tpMult: [1.5, 3.0], decimals: 2, tickLabel: 'pips',   category: 'forex' },
  'EUR/GBP': { basePrice: 0.8560, slRange: [0.0008, 0.0018], tpMult: [1.5, 2.5], decimals: 4, tickLabel: 'pips',   category: 'forex' },
  'USD/CAD': { basePrice: 1.3680, slRange: [0.0010, 0.0025], tpMult: [1.5, 3.0], decimals: 4, tickLabel: 'pips',   category: 'forex' },
  // Futures
  'NQ':  { basePrice: 18240, slRange: [20,  60],   tpMult: [1.5, 4.0], decimals: 0, tickLabel: 'points', category: 'futures_index' },
  'ES':  { basePrice: 5420,  slRange: [8,   20],   tpMult: [1.5, 3.5], decimals: 2, tickLabel: 'points', category: 'futures_index' },
  'CL':  { basePrice: 81.40, slRange: [0.40, 1.20],tpMult: [1.5, 3.5], decimals: 2, tickLabel: 'ticks',  category: 'futures_commodity' },
  'ZN':  { basePrice: 111.12,slRange: [0.08, 0.24],tpMult: [1.5, 3.0], decimals: 2, tickLabel: 'ticks',  category: 'futures_bond' },
  'GC':  { basePrice: 2344,  slRange: [8,   22],   tpMult: [1.5, 3.5], decimals: 1, tickLabel: 'ticks',  category: 'futures_metal' },
  'RTY': { basePrice: 2080,  slRange: [6,   18],   tpMult: [1.5, 3.5], decimals: 1, tickLabel: 'points', category: 'futures_index' },
}

// Context labels per category
const CATEGORY_CONTEXT: Record<string, { session: string; driver: string }> = {
  forex:             { session: 'London / NY Overlap',   driver: 'DXY correlation and central bank differentials' },
  futures_index:     { session: 'RTH (Regular Trading Hours)',  driver: 'SPX breadth, VIX, and macro risk sentiment' },
  futures_commodity: { session: 'NY Mercantile session', driver: 'EIA inventory data and OPEC supply signals' },
  futures_bond:      { session: 'NY Bond session',       driver: 'Fed rate expectations and yield curve shape' },
  futures_metal:     { session: 'NY Comex session',      driver: 'Real yields, DXY, and safe-haven demand' },
}

const SESSIONS = ['London', 'New York', 'Asian', 'London-NY Overlap', 'RTH Open', 'RTH Close']
const ICT_CONCEPTS = ['FVG', 'OTE zone', 'breaker block', 'order block', 'liquidity sweep', 'displacement candle', 'CISD', 'VWAP reclaim']
const HTF_BIASES = ['daily bullish', 'daily bearish', 'weekly bullish', 'weekly bearish']

function getMeta(pair: string) {
  return INSTRUMENT_META[pair] ?? INSTRUMENT_META['EUR/USD']
}

function fmtPrice(price: number, pair: string): string {
  const meta = getMeta(pair)
  return price.toFixed(meta.decimals)
}

function isFutures(pair: string): boolean {
  return FUTURES.includes(pair)
}

// ── SMC Index Futures Scalp (NQ / ES) — 4-step checklist ─────────────────────
// Framework: 1H Bias → 15M Narrative → 5M Setup → 1M Execution
// "NO SWEEP + NO DISPLACEMENT + NO CONFIRMATION = NO TRADE"

const SMC_KILLZONES = ['NY AM Kill Zone (9:30–11:00 EST)', 'London Open (7:00–9:00 EST)', 'NY PM Kill Zone (1:30–3:00 EST)']
const SMC_STRUCTURES_BULL = ['HH/HL', 'HH/HL with premium liquidity above', 'HH/HL — last BOS to the upside']
const SMC_STRUCTURES_BEAR = ['LH/LL', 'LH/LL with discount liquidity below', 'LH/LL — last BOS to the downside']
const SMC_LIQUIDITY_BULL = ['equal lows (sell-side liquidity)', 'swing lows below structure', 'double bottom wicks']
const SMC_LIQUIDITY_BEAR = ['equal highs (buy-side liquidity)', 'swing highs above structure', 'double top wicks']
const SMC_DISP_CANDLES = ['large-bodied bullish engulfing', 'hammer with strong close', 'bullish marubozu', 'institutional displacement candle (large body, near-zero upper wick)']
const SMC_DISP_CANDLES_BEAR = ['large-bodied bearish engulfing', 'shooting star with strong close', 'bearish marubozu', 'displacement candle with near-zero lower wick']

export function generateSMCScalpConversation(
  time: GameTime,
  trade: TradeRecord,
): AgentConversation {
  const label  = timeLabel(time)
  const sm     = time.day * 1440 + time.hour * 60 + Math.floor(time.minute)
  const isBull = trade.direction === 'long'
  const pair   = trade.pair  // 'NQ' or 'ES'
  const meta   = getMeta(pair)

  const entry   = trade.entryPrice
  const maxSL   = pair === 'NQ' ? 10 : 3   // checklist max: <10 NQ pts, <3 ES pts
  const slDist  = Math.min(+(rand(meta.slRange[0], meta.slRange[1])), maxSL)
  const tp1Dist = slDist * 2
  const tp2Dist = slDist * (2.5 + Math.random() * 1.5)
  const sl      = isBull ? entry - slDist   : entry + slDist
  const tp1     = isBull ? entry + tp1Dist  : entry - tp1Dist
  const tp2     = isBull ? entry + tp2Dist  : entry - tp2Dist
  const fp      = (p: number) => fmtPrice(p, pair)
  const killzone = pick(SMC_KILLZONES)

  // Price context
  const structure    = isBull ? pick(SMC_STRUCTURES_BULL) : pick(SMC_STRUCTURES_BEAR)
  const liquidityZone = isBull ? pick(SMC_LIQUIDITY_BULL) : pick(SMC_LIQUIDITY_BEAR)
  const dispCandle   = isBull ? pick(SMC_DISP_CANDLES) : pick(SMC_DISP_CANDLES_BEAR)
  const pricePos     = isBull ? 'discount (below 50% of 1H range)' : 'premium (above 50% of 1H range)'
  const htfOB        = isBull ? `bullish order block around ${fp(sl + slDist * 0.5)}` : `bearish order block around ${fp(sl - slDist * 0.5)}`
  const equalLiqLabel = isBull ? 'Equal Lows (SSL)' : 'Equal Highs (BSL)'
  const sweepDir     = isBull ? 'sell-side liquidity swept (equal lows taken)' : 'buy-side liquidity swept (equal highs taken)'
  const chochLabel   = 'CHoCH'
  const fvgRange     = `${fp(isBull ? entry - slDist * 0.6 : entry + slDist * 0.6)}–${fp(isBull ? entry - slDist * 0.2 : entry + slDist * 0.2)}`
  const conf         = Math.round(72 + Math.random() * 18)

  // ── Step 1: Iron Man — 1H Bias ──────────────────────────────────────────────
  const ironManMsg = msg('ironman', sm, label,
    `1H Bias confirmed on ${pair}. Market structure is ${isBull ? 'BULLISH' : 'BEARISH'} — ${structure}. Checklist Step 1: PASS ✅`,
    {
      confidence: conf - 8, riskLevel: 'low', sentiment: isBull ? 'bullish' : 'bearish',
      tags: [`#${pair}`, '#1HBias', '#SMC', isBull ? '#Bullish' : '#Bearish', '#HH_HL'],
      sections: [
        {
          title: '1H Bias Checklist',
          content: `✅ Market Structure: ${structure}\n✅ Last BOS: ${isBull ? 'Up' : 'Down'}\n✅ Major Liquidity: ${isBull ? 'Equal highs above (buy-side target)' : 'Equal lows below (sell-side target)'}\n✅ Price Position: ${pricePos}\n✅ HTF Order Block: ${htfOB}\n✅ Bias: ${isBull ? 'LONG' : 'SHORT'}`,
        },
        {
          title: '1H Chart Context',
          content: `Price is ${isBull ? 'making higher highs and higher lows — last BOS to the upside — sitting in discount of the daily range' : 'making lower highs and lower lows — last BOS to the downside — sitting in premium of the daily range'}.\n\nLiquidity target above: ${isBull ? fp(tp2) : fp(sl)}\nHTF Order Block: ${htfOB}\n\nBias direction: ${isBull ? 'LONG only until liquidity target reached' : 'SHORT only until liquidity target reached'}`,
        },
      ],
    }
  )

  // ── Step 2: Scarlet Witch — 15M Narrative ──────────────────────────────────
  const scarletMsg = msg('scarlet', sm + 1, label,
    `15M Narrative confirmed. ${equalLiqLabel} swept → ${chochLabel} formed → strong displacement → FVG created. Checklist Step 2: PASS ✅`,
    {
      confidence: conf - 4, riskLevel: 'low', sentiment: isBull ? 'bullish' : 'cautious',
      tags: [`#${pair}`, '#15MNarrative', '#SMC', '#SSL', '#ChoCH', '#FVG'],
      sections: [
        {
          title: '15M Narrative Checklist',
          content: `✅ Sweep of Liquidity (${equalLiqLabel === 'Equal Lows (SSL)' ? 'SSL' : 'BSL'}): ${sweepDir}\n✅ ${chochLabel} After Sweep: confirmed on 15M\n✅ Strong Displacement Candle: ${dispCandle}\n✅ FVG Created: ${fvgRange}\n✅ Bias Alignment (1H): ${isBull ? 'LONG' : 'SHORT'} ✓\n✅ Target: ${isBull ? 'Equal Highs / PDH' : 'Equal Lows / PDL'}`,
        },
        {
          title: '15M Narrative Breakdown',
          content: `Price swept ${isBull ? 'below' : 'above'} ${liquidityZone}, taking ${isBull ? 'sell-side' : 'buy-side'} liquidity.\n\nAfter the sweep, ${chochLabel} confirmed — structure flipped from ${isBull ? 'bearish to bullish' : 'bullish to bearish'} on 15M.\n\nStrong ${isBull ? 'bullish' : 'bearish'} displacement candle created a Fair Value Gap (FVG) at ${fvgRange}.\n\nThis FVG is our refined entry zone on the 5M.`,
        },
      ],
    }
  )

  // ── Step 3: Black Widow — 5M Setup ─────────────────────────────────────────
  const widowMsg = msg('widow', sm + 2, label,
    `5M Setup valid. BOS in direction of 1H bias, price retracing into FVG. Waiting for 1M confirmation. Checklist Step 3: PASS ✅`,
    {
      confidence: conf, riskLevel: 'low', sentiment: isBull ? 'bullish' : 'aggressive',
      tags: [`#${pair}`, '#5MSetup', '#BOS', '#FVG', '#OB', '#Retrace'],
      sections: [
        {
          title: '5M Setup Checklist',
          content: `✅ BOS in Direction of Bias: ${isBull ? 'Bullish BOS on 5M ✓' : 'Bearish BOS on 5M ✓'}\n✅ Retrace into FVG / OB: Price retracing to ${fvgRange}\n✅ Price in Discount: ${isBull ? 'Yes — below 50% of displacement move' : 'Yes — above 50% of displacement move'}\n✅ Clean Structure: No messy wicks or overlap\n✅ Risk Mgmt: SL = ${slDist.toFixed(1)} ${meta.tickLabel} (max ${maxSL} ${meta.tickLabel} for ${pair})`,
        },
        {
          title: 'Setup Narrative',
          content: `BOS to the ${isBull ? 'upside' : 'downside'} on 5M confirmed.\nPrice is retracing into the FVG created by the displacement — this is the OTE (Optimal Trade Entry) zone.\n\nFVG entry zone: ${fvgRange}\nDo NOT enter until 1M confirms with: liquidity sweep → displacement → BOS.\n\nInvalidation: Price closes ${isBull ? 'below' : 'above'} the sweep low at ${fp(sl)}.`,
        },
        {
          title: 'Risk Parameters',
          content: `Entry target: ${fp(entry)} (FVG retest)\nStop Loss: ${fp(sl)} (below sweep low — ${slDist.toFixed(1)} ${meta.tickLabel})\nMax SL rule: ${maxSL} ${meta.tickLabel} for ${pair} — ${slDist <= maxSL ? '✅ WITHIN LIMIT' : '⚠️ EXCEEDS LIMIT — SKIP'}\nTP1: ${fp(tp1)} (2R = +${tp1Dist.toFixed(1)} ${meta.tickLabel})\nTP2: ${fp(tp2)} (+${tp2Dist.toFixed(1)} ${meta.tickLabel})`,
        },
      ],
    }
  )

  // ── Step 4: Vision — 1M Execution ──────────────────────────────────────────
  const visionMsg = msg('vision', sm + 3, label,
    `1M Execution confirmed. Liquidity taken, displacement seen, BOS printed, FVG retest live. Entry valid. Checklist Step 4: PASS ✅`,
    {
      confidence: conf + 5, riskLevel: 'low', sentiment: isBull ? 'bullish' : 'bearish',
      tags: [`#${pair}`, '#1MExecution', '#Entry', '#FVGRetest', '#StopBelowSweep'],
      sections: [
        {
          title: '1M Execution Checklist',
          content: `✅ Liquidity Taken: ${isBull ? 'Equal lows swept on 1M' : 'Equal highs swept on 1M'}\n✅ Displacement: ${dispCandle} — large body, minimal wick\n✅ BOS After Displacement: ${isBull ? 'Bullish' : 'Bearish'} BOS confirmed on 1M\n✅ Entry: FVG / OB retest at ${fp(entry)}\n✅ Stop Below Sweep Low: ${fp(sl)}\n✅ 2R+ Available: ${(tp1Dist / slDist).toFixed(1)}R to TP1, ${(tp2Dist / slDist).toFixed(1)}R to TP2\n✅ Session: ${killzone}`,
        },
        {
          title: 'Execution Sequence',
          content: `1. ${isBull ? 'Equal lows' : 'Equal highs'} swept (liquidity taken) ✓\n2. ${isBull ? 'Bullish' : 'Bearish'} displacement candle printed ✓\n3. BOS after displacement confirmed ✓\n4. Price retraced into FVG — this is the retest entry ✓\n5. Stop: ${fp(sl)} (${slDist.toFixed(1)} ${meta.tickLabel} below sweep low) ✓\n\n${killzone} — session timing is optimal.`,
        },
      ],
    }
  )

  // ── Dr. Strange — Risk Management sign-off ───────────────────────────────────
  const strangeMsg = msg('strange', sm + 4, label,
    `ALL 4 CHECKLIST STEPS CLEARED. Risk parameters confirmed. Authorizing execution on ${pair}.`,
    {
      confidence: 95, riskLevel: 'low', sentiment: 'cautious',
      tags: [`#${pair}`, '#Authorized', '#RiskApproved', '#SMCChecklist'],
      sections: [
        {
          title: 'Full SMC Checklist Summary',
          content: `✅ Step 1 — 1H Bias: ${isBull ? 'BULLISH' : 'BEARISH'} (${structure})\n✅ Step 2 — 15M Narrative: SSL swept → CHoCH → Displacement → FVG\n✅ Step 3 — 5M Setup: BOS confirmed, retrace into FVG, clean structure\n✅ Step 4 — 1M Execution: Liquidity taken, displacement, BOS, FVG retest\n\n"TRADE ONLY WHEN ALL CHECKLIST BOXES ARE CHECKED ✅"`,
        },
        {
          title: 'Final Trade Card',
          content: `Instrument: ${pair} Futures\nDirection: ${isBull ? 'LONG' : 'SHORT'}\nEntry: ${fp(entry)}\nStop Loss: ${fp(sl)} (${slDist.toFixed(1)} ${meta.tickLabel} — below sweep)\nTP1: ${fp(tp1)} (2R — partial close)\nTP2: ${fp(tp2)} (${(tp2Dist / slDist).toFixed(1)}R — runners)\nSession: ${killzone}\nRule: NO SWEEP + NO DISPLACEMENT + NO CONFIRMATION = NO TRADE`,
        },
      ],
    }
  )

  return {
    id: uid(),
    simMinute: sm,
    timeLabel: label,
    title: `${pair} ${isBull ? 'Long' : 'Short'} — SMC Scalp Setup (${killzone.split('(')[0].trim()})`,
    type: 'trading',
    outcome: 'approved',
    messages: [ironManMsg, scarletMsg, widowMsg, visionMsg, strangeMsg],
    pair,
    finalDecision: `${isBull ? 'LONG' : 'SHORT'} ${pair} at ${fp(entry)} — SL ${fp(sl)} (${slDist.toFixed(1)} pts) — TP1 ${fp(tp1)} — TP2 ${fp(tp2)}. All 4 SMC steps cleared.`,
    tags: [`#${pair}`, '#SMCScalp', '#FVG', '#SSL', '#ChoCH', isBull ? '#Long' : '#Short', killzone.includes('NY AM') ? '#KillZone' : '#Session'],
    sourceEventId: trade.id,
  }
}

// ── Trading conversation generators ──────────────────────────────────────────

export function generateTradingSetupConversation(
  time: GameTime,
  trade: TradeRecord,
): AgentConversation {
  const label  = timeLabel(time)
  const sm     = time.day * 1440 + time.hour * 60 + Math.floor(time.minute)
  const isBull = trade.direction === 'long'
  const pair   = trade.pair
  const meta   = getMeta(pair)
  const catCtx = CATEGORY_CONTEXT[meta.category] ?? CATEGORY_CONTEXT.forex

  // Use metadata-driven SL/TP rather than hardcoded FOREX offsets
  const entry  = trade.entryPrice
  const slDist = rand(meta.slRange[0], meta.slRange[1])
  const tpMult = rand(meta.tpMult[0], meta.tpMult[1])
  const sl     = isBull ? entry - slDist : entry + slDist
  const tp1    = isBull ? entry + slDist * 1.5 : entry - slDist * 1.5
  const tp2    = isBull ? entry + slDist * tpMult : entry - slDist * tpMult
  const slPips = slDist.toFixed(meta.decimals)
  const rrRaw  = tpMult
  const rr     = rrRaw.toFixed(1)
  const conf   = Math.round(65 + Math.random() * 20)
  const session = isFutures(pair) ? catCtx.session : pick(SESSIONS)
  const concept = pick(ICT_CONCEPTS)
  const htfBias = pick(HTF_BIASES)
  const ema9    = isBull ? 'above EMA 21' : 'below EMA 21'
  const macd    = isBull ? 'bullish crossover' : 'bearish crossover'
  const hh1     = fmtPrice(entry - (isBull ? slDist * 2 : -slDist * 2), pair)
  const hh2     = fmtPrice(entry - (isBull ? slDist * 0.5 : -slDist * 0.5), pair)

  const fp = (p: number) => fmtPrice(p, pair)
  const slBuffer = slDist * 0.15

  const ironManMsg = msg('ironman', sm, label,
    `Full technical scan complete on ${pair}. Structure is clearly ${isBull ? 'bullish' : 'bearish'}.`,
    {
      confidence: conf - 5, riskLevel: 'medium',
      sentiment: isBull ? 'bullish' : 'bearish',
      tags: [`#${pair.replace('/', '')}`, '#TechnicalAnalysis', isBull ? '#Bullish' : '#Bearish', isFutures(pair) ? '#Futures' : '#Forex'],
      sections: [
        {
          title: 'Market Structure Analysis',
          content: `• ${isBull ? 'Higher highs' : 'Lower lows'} confirmed: ${hh1} → ${hh2} → current\n• ${isBull ? 'Higher lows holding' : 'Lower highs forming'} at structure\n• EMA 9 ${ema9} — trend momentum confirmed\n• MACD: ${macd} on H1 chart\n• Volume expanding on ${isBull ? 'up' : 'down'}-candles`,
        },
        {
          title: 'Key Levels',
          content: `Support: ${fp(sl + (isBull ? slBuffer : -slBuffer))}\nResistance: ${fp(tp1)}\nSwing Target: ${fp(tp2)}`,
        },
        {
          title: 'Market Context',
          content: `Session: ${session}\nHTF Bias: ${htfBias}\nPrimary Driver: ${catCtx.driver}\nRecent structure: ${concept} identified on M15`,
        },
      ],
    }
  )

  const widowMsg = msg('widow', sm + 1, label,
    `Iron Man's read aligns with my signal model. ${concept.toUpperCase()} confirmed — this is high-probability.`,
    {
      confidence: conf, riskLevel: 'medium',
      sentiment: isBull ? 'bullish' : 'aggressive',
      tags: [`#${pair.replace('/', '')}`, '#ICT', `#${concept.replace(/\s/g, '')}`],
      sections: [
        {
          title: 'Setup Quality Assessment',
          content: `• Liquidity sweep: ${isBull ? 'session low taken' : 'session high taken'} at ${fp(sl - (isBull ? slBuffer : -slBuffer))}\n• Price reclaimed ${fp(isBull ? sl + slBuffer : sl - slBuffer)} structure in last 3 candles\n• ICT ${concept} identified on M15\n• OTE zone: ${fp(entry - slDist * 0.3)}–${fp(entry + slDist * 0.3)}`,
        },
        {
          title: 'Trade Parameters',
          content: `Entry: ${fp(entry)} (limit order)\nStop Loss: ${fp(sl)} (below ${isBull ? 'liquidity sweep' : 'liquidity pool'} + buffer)\nTP1: ${fp(tp1)} (1:1.5 partial)\nTP2: ${fp(tp2)} (1:${rr} full target)`,
        },
        {
          title: 'Risk/Reward',
          content: `R:R Ratio: 1:${rr}\nSL distance: ${slPips} ${meta.tickLabel}\nConditional on candle close ${isBull ? 'above' : 'below'} entry zone.`,
        },
      ],
    }
  )

  const visionMsg = msg('vision', sm + 1, label,
    `Delta analysis confirms ${isBull ? 'institutional accumulation' : 'distribution'} in this zone. Order flow is ${isBull ? 'positive' : 'negative'}.`,
    {
      confidence: conf + 3, riskLevel: 'low',
      sentiment: isBull ? 'bullish' : 'bearish',
      tags: ['#OrderFlow', '#DeltaAnalysis', '#InstitutionalFlow'],
      sections: [
        {
          title: 'Order Flow Observations',
          content: `• ${isBull ? 'Buy' : 'Sell'}-side delta: ${isBull ? '+' : '-'}${Math.round(1500 + Math.random() * 2000).toLocaleString()} at entry zone\n• ${isBull ? 'Passive bid' : 'Passive offer'} wall detected at ${fp(sl + (isBull ? slBuffer : -slBuffer))}\n• No visible ${isBull ? 'offer absorption' : 'bid absorption'} at current price level`,
        },
        {
          title: 'Market Microstructure',
          content: `Imbalance Direction: ${isBull ? 'Bullish' : 'Bearish'}\nOrder Imbalance Score: ${(6 + Math.random() * 3).toFixed(1)}/10\nCumulative Delta Trend: ${isBull ? 'Rising' : 'Falling'} for past 4 candles`,
        },
      ],
    }
  )

  const maxLoss = Math.round(slDist * (isFutures(pair) ? 20 : 10000))
  const strangeMsg = msg('strange', sm + 2, label,
    `Risk profile analyzed. Position sizing within acceptable parameters. Proceeding with ${pct(conf)} confidence.`,
    {
      confidence: 90, riskLevel: 'low',
      sentiment: 'cautious',
      tags: ['#RiskManagement', '#PositionSizing', '#Approved'],
      sections: [
        {
          title: 'Position Sizing',
          content: `Risk per trade: 1% of account\nSL distance: ${slPips} ${meta.tickLabel}\n${isFutures(pair) ? 'Recommended: 1 contract' : 'Recommended lot: 0.1 standard'}\nMax loss exposure: ~$${maxLoss}`,
        },
        {
          title: 'Portfolio Exposure',
          content: `Current open trades: ${Math.floor(Math.random() * 2)}\nDaily loss budget remaining: 100%\nMax concurrent risk: within limits`,
        },
        {
          title: 'Risk Verdict',
          content: `VERDICT: APPROVED\nStop placement: ${fp(sl)} (structural, not arbitrary)\nPartial TP at ${fp(tp1)} recommended to lock in 1:1.5`,
        },
      ],
    }
  )

  const furyMsg = msg('fury', sm + 3, label,
    `Signal confirmed by 4/4 systems. This trade has my authorization. Execute on next candle close.`,
    {
      confidence: conf, riskLevel: 'medium',
      sentiment: isBull ? 'bullish' : 'bearish',
      tags: [`#${pair.replace('/', '')}`, '#Authorized', '#Execute'],
      sections: [
        {
          title: 'Final Order Parameters',
          content: `Instrument: ${pair}${isFutures(pair) ? ' Futures' : ''}\nDirection: ${trade.direction.toUpperCase()}\nEntry: ${fp(entry)}\nStop Loss: ${fp(sl)}\nTP1: ${fp(tp1)} (partial close)\nTP2: ${fp(tp2)} (full target)\n${isFutures(pair) ? 'Size: 1 contract' : 'Size: 0.1 lot'}`,
        },
        {
          title: 'Execution Conditions',
          content: `Trigger: Candle close ${isBull ? 'above' : 'below'} ${fp(entry - (isBull ? slDist * 0.1 : -slDist * 0.1))}\nInvalidation: Close ${isBull ? 'below' : 'above'} ${fp(sl + (isBull ? slBuffer : -slBuffer))}\nSession: ${session}`,
        },
        {
          title: 'Mission Briefing',
          content: `All agents on standby. Hawkeye monitoring webhook feed. Spider-Man watching for news catalysts. Black Widow running position management protocols.`,
        },
      ],
    }
  )

  return {
    id: uid(),
    simMinute: sm,
    timeLabel: label,
    title: `${pair} ${isBull ? 'Long' : 'Short'} Setup — ${pct(conf)} Confidence`,
    type: 'trading',
    outcome: 'approved',
    messages: [ironManMsg, widowMsg, visionMsg, strangeMsg, furyMsg],
    pair,
    finalDecision: `Execute ${trade.direction} on ${pair}${isFutures(pair) ? ' futures' : ''} at ${fmtPrice(entry, pair)}, SL: ${fmtPrice(sl, pair)}, TP: ${fmtPrice(tp2, pair)}`,
    tags: [`#${pair.replace('/', '')}`, '#TradeSetup', isBull ? '#Bullish' : '#Bearish', `#ICT`],
    sourceEventId: trade.id,
  }
}

// ── Trade closed conversation ──────────────────────────────────────────────────

export function generateTradeClosedConversation(
  time: GameTime,
  trade: TradeRecord,
): AgentConversation {
  const label  = timeLabel(time)
  const sm     = time.day * 1440 + time.hour * 60 + Math.floor(time.minute)
  const isWin  = trade.status === 'won'
  const pnl    = trade.pnl ?? 0
  const pair   = trade.pair
  const entry  = trade.entryPrice
  const exit   = trade.exitPrice ?? entry

  const ironManMsg = msg('ironman', sm, label,
    `${pair} trade has closed ${isWin ? '✅ in profit' : '❌ at a loss'}. PnL: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}.`,
    {
      confidence: 95, riskLevel: 'low',
      sentiment: isWin ? 'optimistic' : 'concerned',
      tags: [`#${pair.replace('/', '')}`, isWin ? '#Winner' : '#Loser', '#TradeReview'],
      sections: [
        {
          title: 'Trade Summary',
          content: `Pair: ${pair}\nDirection: ${trade.direction.toUpperCase()}\nEntry: ${fmt(entry)}\nExit: ${fmt(exit)}\nResult: ${isWin ? 'WIN' : 'LOSS'}\nPnL: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`,
        },
        {
          title: 'Technical Outcome',
          content: isWin
            ? `• Setup played out as anticipated\n• Price respected the ${pick(ICT_CONCEPTS)} level\n• Momentum carried to target\n• EMA structure remained intact throughout`
            : `• Setup was invalidated by ${pick(['unexpected news catalyst', 'spread widening', 'false breakout', 'stop hunt below structure'])}\n• Price ${trade.direction === 'long' ? 'broke below' : 'broke above'} key level\n• Re-entry may be valid on next session`,
        },
      ],
    }
  )

  const hulkMsg = msg('hulk', sm, label,
    isWin
      ? `HULK SMASH the backtest data — this setup has a ${pct(65 + Math.random() * 20)} historical win rate. Execution was solid.`
      : `Backtest says this setup fails ${pct(25 + Math.random() * 20)} of the time in similar conditions. Not an anomaly.`,
    {
      confidence: 85, riskLevel: isWin ? 'low' : 'medium',
      sentiment: isWin ? 'optimistic' : 'neutral',
      tags: ['#Backtesting', '#HistoricalAnalysis'],
      sections: [
        {
          title: 'Historical Comparison',
          content: isWin
            ? `Last 20 similar setups: 14W / 6L (70% WR)\nAvg win: $${(80 + Math.random() * 120).toFixed(0)}\nThis trade: within expected parameters`
            : `Last 20 similar setups: 12W / 8L (60% WR)\nAvg loss: $${(40 + Math.random() * 80).toFixed(0)}\nThis loss is within expected distribution`,
        },
        {
          title: 'Key Learning Points',
          content: isWin
            ? `• ICT ${pick(ICT_CONCEPTS)} confirmation worked\n• Session timing was optimal\n• R:R achieved exceeded planned target\n• Repeat this setup criteria going forward`
            : `• Review entry timing — slightly late\n• Consider tighter SL placement\n• Monitor session liquidity before entry\n• Document in journal for pattern review`,
        },
      ],
    }
  )

  const furyMsg = msg('fury', sm + 1, label,
    isWin
      ? `Good execution. Mark the journal. Move on to next setup.`
      : `Loss acknowledged. Stay disciplined. Risk management held — that's what matters. Next setup.`,
    {
      confidence: 99, riskLevel: 'low',
      sentiment: isWin ? 'optimistic' : 'cautious',
      tags: ['#Director', '#PostMortem'],
      sections: [
        {
          title: 'Final Assessment',
          content: isWin
            ? `Performance: Above average\nProcess: Followed correctly\nAction: Log the win, maintain discipline\nStreak update: Hawkeye to record`
            : `Performance: Loss within acceptable range\nProcess: Followed correctly — loss is part of the game\nAction: Log the setup, identify refinements\nPsychology: No revenge trades. Wait for next A+ setup.`,
        },
      ],
    }
  )

  return {
    id: uid(),
    simMinute: sm,
    timeLabel: label,
    title: `${pair} Trade ${isWin ? 'Win' : 'Loss'} Review — ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`,
    type: 'trading',
    outcome: 'completed',
    messages: [ironManMsg, hulkMsg, furyMsg],
    pair,
    finalDecision: isWin ? `Trade closed profitably. Pattern confirmed.` : `Trade closed at loss. Refine entry criteria.`,
    tags: [`#${pair.replace('/', '')}`, '#PostMortem', isWin ? '#Win' : '#Loss'],
    sourceEventId: trade.id,
  }
}

// ── Risk review conversation ───────────────────────────────────────────────────

export function generateRiskReviewConversation(
  time: GameTime,
  context: { drawdown: number; winRate: number; openTrades: number },
): AgentConversation {
  const label = timeLabel(time)
  const sm    = time.day * 1440 + time.hour * 60 + Math.floor(time.minute)
  const isAlert = context.drawdown > 5

  const strangeMsg = msg('strange', sm, label,
    `Initiating daily risk review. ${isAlert ? '⚠️ Elevated drawdown detected.' : 'All metrics within normal parameters.'}`,
    {
      confidence: 95, riskLevel: isAlert ? 'high' : 'low',
      sentiment: isAlert ? 'concerned' : 'neutral',
      tags: ['#RiskReview', '#DailyCheck'],
      sections: [
        {
          title: 'Current Risk Metrics',
          content: `Drawdown: ${context.drawdown.toFixed(1)}%\nWin Rate (rolling): ${pct(context.winRate * 100)}\nOpen Positions: ${context.openTrades}\nRisk Status: ${isAlert ? '⚠️ ELEVATED' : '✅ NORMAL'}`,
        },
        {
          title: 'Risk Assessment',
          content: isAlert
            ? `• Drawdown approaching caution threshold (5%)\n• Recommend reducing position size by 50%\n• No new trades until drawdown recovers to 3%\n• Review recent losing trades for pattern`
            : `• All metrics within expected range\n• Standard position sizing approved\n• Continue current strategy\n• Next review: end of session`,
        },
        {
          title: 'Recommendation',
          content: isAlert
            ? 'REDUCE EXPOSURE — wait for recovery before full size'
            : 'CONTINUE NORMAL OPERATIONS — risk within limits',
        },
      ],
    }
  )

  const furyMsg = msg('fury', sm + 1, label,
    isAlert
      ? `Dr. Strange's assessment is correct. Pulling back to half-size until we recover. Discipline over ego.`
      : `Risk review complete. Green across the board. Proceed with standard protocol.`,
    {
      confidence: 99, riskLevel: isAlert ? 'high' : 'low',
      sentiment: isAlert ? 'cautious' : 'neutral',
      tags: ['#Director', '#RiskDecision'],
      sections: [
        {
          title: 'Director Decision',
          content: isAlert
            ? `Decision: REDUCE RISK\nPosition Size: 50% of normal\nCondition to return: Drawdown < 3%\nAll agents: Acknowledge and comply`
            : `Decision: PROCEED NORMALLY\nAll systems nominal\nStandard operating procedures in effect`,
        },
      ],
    }
  )

  return {
    id: uid(),
    simMinute: sm,
    timeLabel: label,
    title: `Daily Risk Review — ${isAlert ? '⚠️ Alert' : '✅ Clear'}`,
    type: 'risk',
    outcome: isAlert ? 'pending' : 'completed',
    messages: [strangeMsg, furyMsg],
    finalDecision: isAlert ? 'Reduce position size, await drawdown recovery.' : 'Proceed with normal operations.',
    tags: ['#RiskReview', '#DailyCheck', isAlert ? '#Alert' : '#Clear'],
  }
}

// ── Market briefing conversation ───────────────────────────────────────────────

export function generateMarketBriefingConversation(
  time: GameTime,
  marketMood: string,
): AgentConversation {
  const label  = timeLabel(time)
  const sm     = time.day * 1440 + time.hour * 60 + Math.floor(time.minute)
  const pair   = pick(PAIRS)
  const session = pick(SESSIONS)
  const isBull  = marketMood === 'bullish'

  const captainMsg = msg('captain', sm, label,
    `Morning macro briefing complete. ${session} session opening with ${marketMood} bias.`,
    {
      confidence: 78, riskLevel: 'low',
      sentiment: isBull ? 'bullish' : marketMood === 'bearish' ? 'bearish' : 'neutral',
      tags: ['#Fundamentals', '#MacroBriefing', `#${session.replace(' ', '')}`],
      sections: [
        {
          title: 'Macro Environment',
          content: `Central Bank Stance: ${pick(['Hawkish', 'Dovish', 'Neutral', 'Data-dependent'])}\nInflation Trend: ${pick(['Cooling', 'Sticky', 'Rising', 'At target'])}\nGrowth Outlook: ${pick(['Expanding', 'Contracting', 'Stagnant', 'Recovering'])}\nMarket Risk Mode: ${pick(['Risk-on', 'Risk-off', 'Selective', 'Wait-and-see'])}`,
        },
        {
          title: 'Key Events Today',
          content: `${pick(['CPI report at 8:30 EST', 'FOMC minutes at 2:00 PM EST', 'NFP Friday — no major events', 'BoE rate decision at 7:00 AM EST', 'Quiet data day — technical setups preferred'])}\nEarnings: ${pick(['None market-moving', 'Several tech names after close', 'Financial sector heavy'])}\nRecommendation: ${isBull ? 'Lean long on dips' : 'Fade rallies into resistance'}`,
        },
        {
          title: 'Currency Focus',
          content: `Primary Watch: ${pair}\nBias: ${isBull ? 'Bullish' : marketMood === 'bearish' ? 'Bearish' : 'Neutral'}\nHTF Context: ${pick(HTF_BIASES)}\nKey level to watch: ${fmt(rand(1.05, 1.15))}`,
        },
      ],
    }
  )

  const spideyMsg = msg('spiderman', sm + 1, label,
    `News scan complete. ${pick(['No major surprises in the headlines.', 'Geopolitical risk elevated — monitor closely.', 'Central bank official hawkish comments overnight.', 'Risk sentiment improving on positive data.'])}`,
    {
      confidence: 70, riskLevel: 'low',
      sentiment: 'neutral',
      tags: ['#NewsIntel', '#HeadlineScan'],
      sections: [
        {
          title: 'Top Headlines',
          content: `• ${pick(['Fed official signals patience on rate cuts', 'GDP data beats expectations by 0.3%', 'Trade balance narrows, dollar supportive', 'BoJ intervenes — JPY pairs volatile', 'EU energy prices stabilizing'])}\n• ${pick(['Oil prices steady near $80', 'Gold holding $2,350 support', 'Risk assets bid in Asia session', 'Bond yields little changed overnight'])}\n• ${pick(['No tier-1 data until Thursday', 'G7 summit remarks expected this week', 'ECB speaker schedule: 3 speeches today'])}`,
        },
        {
          title: 'News Risk Assessment',
          content: `News Risk Level: ${pick(['Low', 'Medium', 'Low'])}\nRecommendation: ${isBull ? 'News supports bullish bias' : 'Headline risk present — size down'}`,
        },
      ],
    }
  )

  const thorMsg = msg('thor', sm + 1, label,
    `Cross-asset correlation matrix updated. DXY ${pick(['weakening', 'strengthening', 'ranging'])} — ${isBull ? 'constructive for risk assets' : 'headwind for majors'}.`,
    {
      confidence: 75, riskLevel: 'low',
      sentiment: isBull ? 'bullish' : 'cautious',
      tags: ['#Correlations', '#DXY', '#CrossAsset'],
      sections: [
        {
          title: 'Correlation Matrix',
          content: `DXY: ${pick(['+0.3%', '-0.2%', 'flat', '+0.1%'])}\nGold: ${pick(['-0.4%', '+0.5%', 'flat'])}\nS&P 500 Futures: ${pick(['+0.2%', '-0.1%', '+0.4%'])}\nWTI Oil: ${pick(['flat', '+0.6%', '-0.3%'])}\nBTC: ${pick(['+1.2%', '-0.8%', 'flat'])}`,
        },
        {
          title: 'Cross-Pair Signals',
          content: `${pair}: ${isBull ? 'Positive divergence from DXY' : 'Tracking DXY weakness'}\nCorrelated pairs: ${PAIRS.slice(0, 3).join(', ')}\nRecommended focus: ${pair} and ${pick(PAIRS)}`,
        },
      ],
    }
  )

  return {
    id: uid(),
    simMinute: sm,
    timeLabel: label,
    title: `${session} Market Briefing — ${marketMood.charAt(0).toUpperCase() + marketMood.slice(1)} Bias`,
    type: 'coordination',
    outcome: 'completed',
    messages: [captainMsg, spideyMsg, thorMsg],
    finalDecision: `${session} session: ${isBull ? 'Look for long setups on pullbacks.' : marketMood === 'bearish' ? 'Fade rallies, prefer short setups.' : 'Range-bound — wait for clear directional break.'}`,
    tags: ['#MarketBriefing', `#${session.replace(/\s/g, '')}`, `#${marketMood.charAt(0).toUpperCase() + marketMood.slice(1)}`],
  }
}

// ── Etsy product pipeline: Reya → Dani → Quinn → Uly ────────────────────────

export function generateEtsyConversation(
  time: GameTime,
  productName: string,
  category: string,
  stage: string,
): AgentConversation {
  const label    = timeLabel(time)
  const sm       = time.day * 1440 + time.hour * 60 + Math.floor(time.minute)
  const price    = (4.99 + Math.random() * 25).toFixed(2)
  const estSales = Math.round(5 + Math.random() * 40)
  const qcScore  = Math.round(80 + Math.random() * 18)
  const style    = pick(['Minimalist modern', 'Bold contemporary', 'Elegant classic', 'Playful hand-drawn', 'Professional corporate'])
  const format   = pick(['Letter + A4 compatible', 'Square (Instagram-ready)', 'US Letter + A4 dual-format'])
  const diff     = pick(['Editable Canva templates', 'Print-ready PDF + editable source', 'Lifetime updates included', 'Commercial license included'])

  // ── Step 1: Reya researches and hands brief to Dani ─────────────────────────
  const reyaMsg = msg('research_agent', sm, label,
    `Research complete for "${productName}" (${category}). Dani — passing design brief now. Price target $${price}, est. ${estSales} sales/mo.`,
    {
      confidence: 76, riskLevel: 'low', sentiment: 'optimistic',
      tags: [`#${category.replace(/\s/g, '')}`, '#Etsy', '#ProductResearch', '#HandoffToDani'],
      sections: [
        {
          title: '📊 Market Research',
          content: `Product: ${productName}\nCategory: ${category}\nSearch Volume: ${pick(['High', 'Medium-High', 'Growing'])}\nCompetition: ${pick(['Low', 'Medium', 'Moderate'])}\nTop competitor avg: $${(parseFloat(price) * (0.8 + Math.random() * 0.4)).toFixed(2)}\nTrend: ${pick(['Rising ↑', 'Steady →', 'Seasonal peak approaching'])}\nKeyword opportunity: ${pick(['Strong long-tail available', 'Niche gap found', 'High-volume room for new sellers'])}`,
        },
        {
          title: '💰 Revenue Projection',
          content: `Suggested Price: $${price}\nMonth 1 est. sales: ${estSales} units\nProjected monthly revenue: $${(parseFloat(price) * estSales).toFixed(2)}\nROI rating: ${pick(['Excellent', 'Good', 'Solid'])}`,
        },
        {
          title: '📋 Design Brief for Dani',
          content: `Style direction: ${style}\nFormat required: ${format}\nKey differentiator: ${diff}\nDeadline: ${pick(['ASAP — trend window open', 'Within 48h', 'This sprint'])}\nTag set: ${pick(['15 optimized Etsy tags provided', '13 high-volume tags ready', '12 niche + broad tag mix prepared'])}`,
        },
      ],
    }
  )

  // ── Step 2: Dani designs and hands file to Quinn ─────────────────────────────
  const daniMsg = msg('design_agent', sm + 2, label,
    `Got Reya's brief — design done. "${productName}" is looking ${pick(['clean', 'sharp', 'gorgeous', 'polished'])}. Quinn, sending to you now for QC.`,
    {
      confidence: 84, riskLevel: 'low', sentiment: 'optimistic',
      tags: ['#Design', '#Creative', `#${category.replace(/\s/g, '')}`, '#HandoffToQuinn'],
      sections: [
        {
          title: '🎨 Design Summary',
          content: `Style: ${style}\nColor palette: ${pick(['Neutral + accent pop', 'Monochromatic', 'Complementary duo', 'Analogous earth tones'])}\nFont: ${pick(['Sans-serif clean', 'Mixed editorial', 'Script + sans combo', 'Geometric display'])}\nFormat: ${format}\nFiles delivered: PDF, PNG (300 DPI), editable source`,
        },
        {
          title: '⭐ Differentiator Applied',
          content: `${diff}\nMockups: ${pick(['5 lifestyle shots created', '7 preview images done', '3 styled mockups included'])}\nBonus: ${pick(['Size guide included', 'How-to-use card added', 'Commercial license doc attached'])}`,
        },
        {
          title: '📤 Handoff to Quinn',
          content: `Files ready for QC review\nBrief alignment: ✅ followed Reya's spec exactly\nDesign notes: ${pick(['No known issues', 'Font double-checked for licensing', 'Tested print at actual size'])}\nAction: Quinn — please review and approve for upload`,
        },
      ],
    }
  )

  // ── Step 3: Quinn QC-checks and approves for Uly ─────────────────────────────
  const quinnMsg = msg('qc_agent', sm + 4, label,
    `QC pass complete on "${productName}". Score: ${qcScore}/100. ${qcScore >= 90 ? '✅ Approved' : '⚠️ Approved with note'}. Uly — clear to upload.`,
    {
      confidence: 90, riskLevel: 'low', sentiment: qcScore >= 90 ? 'optimistic' : 'neutral',
      tags: ['#QualityControl', '#Approved', '#HandoffToUly'],
      sections: [
        {
          title: '✅ QC Checklist',
          content: `✅ File format OK (PDF/PNG/JPG)\n✅ Resolution 300 DPI\n✅ Color profile: ${pick(['CMYK + sRGB', 'sRGB for digital', 'Both profiles'])}\n✅ Fonts: commercial license confirmed\n✅ Layers organized & named\n${qcScore >= 88 ? '✅' : '⚠️'} Mockups: ${pick(['5 lifestyle shots', '7 previews', '3 styled mockups'])}`,
        },
        {
          title: '📋 Quality Verdict',
          content: `Score: ${qcScore}/100\nStatus: ${qcScore >= 90 ? 'APPROVED — no revisions' : 'APPROVED with note'}\nNote: ${pick(['All clear', 'Minor description refinement suggested', 'Consider adding size guide'])}\nDani's work: ${pick(['Exactly on brief', 'Exceeded expectations', 'Solid execution'])}\nUly — listing details below`,
        },
        {
          title: '📦 Listing Instructions for Uly',
          content: `Title: ${productName}\nCategory: ${category}\nPrice: $${price}\nDigital download: Yes\nTags: use Reya's optimized set\nDescription: ${pick(['Use template A', 'Lead with the differentiator', 'Open with the use case'])}\nShipping profile: Digital — no shipping required`,
        },
      ],
    }
  )

  // ── Step 4: Uly uploads and confirms live ────────────────────────────────────
  const ulyMsg = msg('upload_agent', sm + 6, label,
    `Listing live! "${productName}" is up on Etsy at $${price}. Got Quinn's approval — all done. 🚀`,
    {
      confidence: 95, riskLevel: 'low', sentiment: 'optimistic',
      tags: ['#Listed', '#EtsyLive', `#${category.replace(/\s/g, '')}`],
      sections: [
        {
          title: '🚀 Listing Status',
          content: `Status: ACTIVE ✅\nTitle: ${productName}\nPrice: $${price}\nCategory: ${category}\nFiles uploaded: PDF + PNG + source\nMockups: uploaded & ordered`,
        },
        {
          title: '🏷️ SEO Applied',
          content: `Tags: Reya's 13-tag set applied\nTitle keywords: front-loaded\nDescription: ${pick(['Use-case first', 'Benefit-led', 'Keyword-rich opener'])}\nShop section: assigned\nProcessing profile: Instant digital download`,
        },
        {
          title: '📈 Next Steps',
          content: `Monitor: first 48h views & favorites\nPromo: ${pick(['Pin to Pinterest board', 'Share to Instagram story', 'Add to Etsy ads at $1/day'])}\nPrice test: ${pick(['Hold price for 2 weeks', 'A/B test after 10 views', 'Undercut top competitor by $1'])}\nEst. first sale: ${pick(['Within 24h if ads on', '3–5 days organic', '1–2 weeks organic'])}`,
        },
      ],
    }
  )

  return {
    id: uid(),
    simMinute: sm,
    timeLabel: label,
    title: `Etsy Pipeline: "${productName}" (${category})`,
    type: 'business',
    outcome: stage === 'listing' || stage === 'selling' ? 'completed' : 'executing',
    messages: [reyaMsg, daniMsg, quinnMsg, ulyMsg],
    finalDecision: `"${productName}" live at $${price}. Reya → Dani → Quinn → Uly pipeline complete. Est. ${estSales} sales/mo.`,
    tags: ['#Etsy', `#${category.replace(/\s/g, '')}`, '#ProductLaunch', '#PipelineComplete'],
  }
}

// ── Trend shift conversation ───────────────────────────────────────────────────

export function generateTrendShiftConversation(
  time: GameTime,
  newTrend: string,
): AgentConversation {
  const label = timeLabel(time)
  const sm    = time.day * 1440 + time.hour * 60 + Math.floor(time.minute)

  const reyaMsg = msg('research_agent', sm, label,
    `🔥 Market trend shift detected! "${newTrend}" is gaining significant traction on Etsy.`,
    {
      confidence: 81, riskLevel: 'low',
      sentiment: 'optimistic',
      tags: ['#TrendAlert', '#Etsy', '#MarketShift'],
      sections: [
        {
          title: 'Trend Analysis',
          content: `New Trend: ${newTrend}\nTrend Source: ${pick(['Etsy search data', 'Pinterest trending', 'Social media signals', 'Google Trends spike'])}\nGrowth Rate: ${pick(['+145%', '+230%', '+89%', '+312%'])} week-over-week\nEstimated Peak: ${pick(['2–4 weeks', '4–6 weeks', '6–8 weeks'])}`,
        },
        {
          title: 'Opportunity Assessment',
          content: `Competition Window: ${pick(['3–5 days to establish early position', '1–2 weeks before saturation', 'Currently low competition'])}\nRevenue Potential: ${pick(['High', 'Very High', 'Exceptional'])}\nRecommended Products: ${pick(['3–5 items targeting this niche', '2–3 hero products + accessories', '1 comprehensive bundle'])}`,
        },
        {
          title: 'Action Plan',
          content: `Priority: ${pick(['URGENT — move now', 'HIGH — act this week', 'MEDIUM — plan next sprint'])}\nDani: Begin design immediately\nQuinn: Fast-track QC for trend items\nUly: Optimize listings for trend keywords`,
        },
      ],
    }
  )

  const daniTrendMsg = msg('design_agent', sm + 1, label,
    `On it! Starting "${newTrend}" designs right now. Reya — confirmed receipt of brief. Quinn + Uly, expect files within ${pick(['24h', '48h', '36h'])}.`,
    {
      confidence: 86, riskLevel: 'low', sentiment: 'aggressive',
      tags: ['#Design', '#TrendPivot', '#HandoffToQuinn'],
      sections: [
        {
          title: '🎨 Design Sprint Plan',
          content: `Trend: ${newTrend}\nProducts planned: ${pick(['3 variations', '2 hero products + upsell', '4 quick wins'])}\nStyle: ${pick(['Match trending aesthetic', 'Bold standout look', 'Minimal — launches fastest'])}\nETA to Quinn: ${pick(['24h', '36h', '48h'])}`,
        },
      ],
    }
  )

  const furyMsg = msg('fury', sm + 2, label,
    `Trend confirmed. Reya flagged it, Dani's designing, Quinn on standby. Target: 3 products live within ${pick(['48h', '72h', '5 days'])}. Move fast.`,
    {
      confidence: 90, riskLevel: 'low',
      sentiment: 'aggressive',
      tags: ['#Director', '#TrendCapture', '#Pivot'],
      sections: [
        {
          title: 'Resource Reallocation',
          content: `Pipeline: Reya → Dani → Quinn → Uly\nDesign queue: "${newTrend}" at front\nTarget: 3 products live within ${pick(['48 hours', '72 hours', '5 days'])}\nExpected revenue impact: +${pick(['15', '25', '35', '45'])}% this week\nQuinn: fast-track QC\nUly: optimize all listings for trend keywords`,
        },
      ],
    }
  )

  return {
    id: uid(),
    simMinute: sm,
    timeLabel: label,
    title: `Trend Alert: ${newTrend}`,
    type: 'marketing',
    outcome: 'executing',
    messages: [reyaMsg, daniTrendMsg, furyMsg],
    finalDecision: `Pivot resources to capture "${newTrend}" trend. Reya → Dani → Quinn → Uly pipeline activated.`,
    tags: ['#TrendAlert', '#Etsy', '#MarketOpportunity'],
  }
}

// ── Generic event → conversation dispatcher ───────────────────────────────────

export function generateConversationForLogEntry(
  time: GameTime,
  message: string,
  type: string,
): AgentConversation | null {
  const label = timeLabel(time)
  const sm    = time.day * 1440 + time.hour * 60 + Math.floor(time.minute)

  if (type === 'trade') {
    const isShort = message.toLowerCase().includes('short')
    const isBull  = !isShort && (message.toLowerCase().includes('long') || message.toLowerCase().includes('buy'))
    // Match both slash pairs (EUR/USD) and bare futures (NQ, ES, CL, ZN, GC, RTY)
    const pairMatch = message.match(/\b(NQ|ES|CL|ZN|GC|RTY)\b/) ?? message.match(/([A-Z]{3}\/[A-Z]{3})/)
    const pair = pairMatch ? pairMatch[1] : pick(PAIRS)
    const meta = getMeta(pair)
    const basePrice = meta.basePrice

    const tradeRecord: TradeRecord = {
      id: `auto_${sm}`,
      pair,
      direction: isBull ? 'long' : 'short',
      entryPrice: basePrice * (1 + (Math.random() - 0.5) * 0.001),
      exitPrice: null,
      pnl: null,
      status: 'open',
      timestamp: sm,
    }

    // NQ and ES use the full 4-step SMC checklist conversation
    if (pair === 'NQ' || pair === 'ES') {
      return generateSMCScalpConversation(time, tradeRecord)
    }

    return generateTradingSetupConversation(time, tradeRecord)
  }

  if (type === 'creative') {
    const productMatch = message.match(/"([^"]+)"/)
    const productName = productMatch ? productMatch[1] : 'New Digital Product'
    return generateEtsyConversation(time, productName, pick(['Templates', 'Printables', 'SVG', 'Notion']), 'listing')
  }

  // Generic coordination conversation for other events
  const scarlettMsg = msg('scarlet', sm, label,
    `${message}`,
    {
      confidence: 70, riskLevel: 'low',
      sentiment: type === 'success' ? 'optimistic' : type === 'warning' ? 'concerned' : 'neutral',
      tags: [`#${type.charAt(0).toUpperCase() + type.slice(1)}`],
      sections: [
        {
          title: 'Context Analysis',
          content: `Event type: ${type}\nSentiment reading: ${type === 'success' ? 'Positive' : type === 'warning' ? 'Cautious' : 'Neutral'}\nMarket mood: ${pick(['Stable', 'Building', 'Shifting'])}\nRecommendation: ${pick(['Monitor closely', 'Proceed as planned', 'Adjust strategy slightly'])}`,
        },
      ],
    }
  )

  return {
    id: uid(),
    simMinute: sm,
    timeLabel: label,
    title: message.slice(0, 60),
    type: type === 'trade' ? 'trading' : type === 'creative' ? 'business' : 'coordination',
    outcome: type === 'success' ? 'completed' : 'pending',
    messages: [scarlettMsg],
    finalDecision: `Event logged and acknowledged.`,
    tags: [`#${type}`],
  }
}
