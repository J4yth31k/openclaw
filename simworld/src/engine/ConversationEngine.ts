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

// ── Etsy product conversation ─────────────────────────────────────────────────

export function generateEtsyConversation(
  time: GameTime,
  productName: string,
  category: string,
  stage: string,
): AgentConversation {
  const label = timeLabel(time)
  const sm    = time.day * 1440 + time.hour * 60 + Math.floor(time.minute)
  const price = (4.99 + Math.random() * 25).toFixed(2)
  const estSales = Math.round(5 + Math.random() * 40)

  const reyaMsg = msg('research_agent', sm, label,
    `New product opportunity identified: "${productName}" in the ${category} category. Market research complete.`,
    {
      confidence: 76, riskLevel: 'low',
      sentiment: 'optimistic',
      tags: [`#${category.replace(/\s/g, '')}`, '#Etsy', '#ProductResearch'],
      sections: [
        {
          title: 'Market Research',
          content: `Product: ${productName}\nCategory: ${category}\nSearch Volume: ${pick(['High', 'Medium-High', 'Growing'])}\nCompetition Level: ${pick(['Low', 'Medium', 'Moderate'])}\nTop competitor avg price: $${(parseFloat(price) * (0.8 + Math.random() * 0.4)).toFixed(2)}`,
        },
        {
          title: 'Market Analysis',
          content: `Trend Direction: ${pick(['Rising', 'Steady', 'Seasonal peak approaching'])}\nSeasonal Factor: ${pick(['Year-round demand', 'Q4 peak', 'Spring boost'])}\nKeyword Opportunity: ${pick(['Strong long-tail keywords available', 'Niche market with less competition', 'High-volume keywords with room for new sellers'])}`,
        },
        {
          title: 'Revenue Projection',
          content: `Suggested Price: $${price}\nEstimated Month 1 Sales: ${estSales} units\nProjected Monthly Revenue: $${(parseFloat(price) * estSales).toFixed(2)}\nROI vs Time Investment: ${pick(['Excellent', 'Good', 'Solid'])}`,
        },
      ],
    }
  )

  const daniMsg = msg('design_agent', sm + 1, label,
    `Design brief accepted. Starting on "${productName}". Going for a ${pick(['minimal', 'bold', 'elegant', 'playful', 'professional'])} aesthetic.`,
    {
      confidence: 82, riskLevel: 'low',
      sentiment: 'optimistic',
      tags: ['#Design', '#Creative', `#${category.replace(/\s/g, '')}`],
      sections: [
        {
          title: 'Design Approach',
          content: `Style: ${pick(['Minimalist modern', 'Bold contemporary', 'Elegant classic', 'Playful hand-drawn', 'Professional corporate'])}\nColor Palette: ${pick(['Neutral + accent pop', 'Monochromatic', 'Complementary duo', 'Analogous earth tones'])}\nFont Direction: ${pick(['Sans-serif clean', 'Mixed editorial', 'Script + sans combo', 'Geometric display'])}\nFormat: ${pick(['Letter + A4 compatible', 'Square (Instagram-ready)', 'US Letter + A4 dual-format'])}`,
        },
        {
          title: 'Competitive Differentiation',
          content: `Key differentiator: ${pick(['Editable Canva templates', 'Print-ready PDF + editable source', 'Lifetime updates included', 'Commercial license included', 'Multiple size variations'])}\nUnique value: ${pick(['More comprehensive than competitors', 'Better organized file structure', 'Customer support included'])}`,
        },
      ],
    }
  )

  const quinnMsg = msg('qc_agent', sm + 2, label,
    `QC review of "${productName}" in progress. Checking against shop standards.`,
    {
      confidence: 88, riskLevel: 'low',
      sentiment: 'neutral',
      tags: ['#QualityControl', '#Etsy', '#ProductReview'],
      sections: [
        {
          title: 'QC Checklist',
          content: `✅ File format compliance (PDF/PNG/JPG)\n✅ Resolution: 300 DPI for print\n✅ Color profile: ${pick(['CMYK for print', 'sRGB for digital', 'Both profiles included'])}\n✅ Font licensing: All commercial-use fonts\n✅ Editable layers organized\n${pick(['✅', '⚠️'])} Mockup previews: ${pick(['5 lifestyle shots included', '3 mockups attached', '7 preview images ready'])}`,
        },
        {
          title: 'Quality Verdict',
          content: `Overall Quality Score: ${Math.round(80 + Math.random() * 18)}/100\nRecommendation: ${stage === 'qc' ? 'APPROVED — proceed to listing' : 'In review'}\nNotes: ${pick(['No revisions needed', 'Minor description tweak suggested', 'Consider adding size guide'])}`,
        },
      ],
    }
  )

  return {
    id: uid(),
    simMinute: sm,
    timeLabel: label,
    title: `Product Launch: "${productName}" (${category})`,
    type: 'business',
    outcome: stage === 'listing' || stage === 'selling' ? 'completed' : 'pending',
    messages: [reyaMsg, daniMsg, quinnMsg],
    finalDecision: `Proceed with "${productName}" at $${price}. Estimated ${estSales} monthly sales.`,
    tags: ['#Etsy', `#${category.replace(/\s/g, '')}`, '#ProductLaunch'],
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

  const furyMsg = msg('fury', sm + 1, label,
    `Trend confirmed. Reallocating design bandwidth to capitalize on "${newTrend}". All hands on deck.`,
    {
      confidence: 90, riskLevel: 'low',
      sentiment: 'aggressive',
      tags: ['#Director', '#TrendCapture', '#Pivot'],
      sections: [
        {
          title: 'Resource Reallocation',
          content: `Design Queue: "${newTrend}" items jump to front\nTarget: 3 products live within ${pick(['48 hours', '72 hours', '5 days'])}\nExpected revenue impact: +${pick(['15', '25', '35', '45'])}% this week`,
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
    messages: [reyaMsg, furyMsg],
    finalDecision: `Pivot resources to capture "${newTrend}" trend immediately.`,
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
    const isBull = message.toLowerCase().includes('long') || message.toLowerCase().includes('buy')
    const pairMatch = message.match(/([A-Z]{3}\/[A-Z]{3})/)
    const pair = pairMatch ? pairMatch[1] : pick(PAIRS)

    return generateTradingSetupConversation(time, {
      id: `auto_${sm}`,
      pair,
      direction: isBull ? 'long' : 'short',
      entryPrice: rand(1.05, 1.15),
      exitPrice: null,
      pnl: null,
      status: 'open',
      timestamp: sm,
    })
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
