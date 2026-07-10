import type {
  AgentConversation, ConversationMessage, ConversationSection,
  AgentSentiment, AgentId, GameTime,
} from '../types'
import { ANALYST_DEFS, AGENT_DEFS } from '../data/worldData'
import { timeLabel } from './TimeSystem'

// ── ID factories ──────────────────────────────────────────────────────────────

let _convId = 0
function uid()    { return `conv_${++_convId}_${Date.now()}` }
function msgUid() { return `msg_${_convId}_${Math.random().toString(36).slice(2, 7)}` }

// ── Roster lookup ─────────────────────────────────────────────────────────────

const ALL_DEFS = [...AGENT_DEFS, ...ANALYST_DEFS]

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
    riskLevel: opts.riskLevel ?? 'low',
    sentiment: opts.sentiment ?? 'neutral',
    tags: opts.tags ?? [],
    sections: opts.sections ?? [],
  }
}

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }
function simMin(time: GameTime) { return time.day * 1440 + time.hour * 60 + Math.floor(time.minute) }

// ── Market desk briefing (analysis only — reads the tape, never trades) ──────

const MOOD_READS: Record<string, { nova: string[]; cole: string[]; sentiment: AgentSentiment }> = {
  bullish: {
    nova: [
      'Overnight tone is constructive — yields soft, no hostile headlines on the calendar.',
      'Macro backdrop leaning supportive this morning; tech futures bid pre-market.',
    ],
    cole: [
      'Structure agrees — higher lows are stacking on the hourly and value is migrating up.',
      'We are printing acceptance above yesterday\'s value area. Context is trend-up until a low breaks.',
    ],
    sentiment: 'optimistic',
  },
  bearish: {
    nova: [
      'Risk-off tone in the overnight session — defensive flows showing up early.',
      'Headline risk is elevated today; overnight sellers pressed futures under value.',
    ],
    cole: [
      'The hourly lost its last higher low — structure is now heavy until proven otherwise.',
      'Price is being rejected from value; rotations keep failing at the same shelf.',
    ],
    sentiment: 'concerned',
  },
  neutral: {
    nova: [
      'Calendar is quiet — nothing scheduled that should force direction.',
      'No macro catalyst on deck; expect the technicals to do the talking.',
    ],
    cole: [
      'Both indices are balanced inside yesterday\'s range. This is rotation, not trend.',
      'Two-sided auction so far — respect both extremes of the range.',
    ],
    sentiment: 'neutral',
  },
  volatile: {
    nova: [
      'High-impact release windows today — expect air pockets around the prints.',
      'Fed speakers on the wires this afternoon; headlines can whip both directions.',
    ],
    cole: [
      'Expansion candles are breaking the range both ways — acceptance is the only tell that matters.',
      'Wide rotations, thin follow-through. Treat every level as suspect until retested.',
    ],
    sentiment: 'cautious',
  },
}

export function generateMarketBriefingConversation(
  time: GameTime,
  mood: string,
): AgentConversation {
  const label = timeLabel(time)
  const sm = simMin(time)
  const read = MOOD_READS[mood] ?? MOOD_READS.neutral

  const veraLines = [
    'Volume profile updated: POC is the magnet — note where we open relative to value.',
    'Profile shows a thin low-volume pocket nearby; price tends to travel fast through it.',
    'Heavy acceptance node overhead — expect responsive sellers on first touch.',
  ]
  const marlowLines = [
    'Liquidity map refreshed: equal highs above the session range, pool marked.',
    'Sell-side liquidity resting under a set of equal lows — worth watching for a sweep.',
    'Overnight extreme is still untested — that pool remains a draw.',
  ]
  const sanaLines = [
    'Session plan: opening range first, then watch which extreme gets tested.',
    'We are inside the strongest hours — levels get honest here.',
    'Marking session high and low now; everything else is noise until one breaks.',
  ]

  return {
    id: uid(),
    simMinute: sm,
    timeLabel: label,
    title: `🧭 Desk Briefing — ${mood.toUpperCase()} context`,
    type: 'trading',
    outcome: 'completed',
    tags: ['#analysis', '#volumeprofile', '#liquidity', `#${mood}`],
    finalDecision: 'Context shared with the trader. Levels on the board — no signals, decisions stay with you.',
    messages: [
      msg('nova_news', sm, label, pick(read.nova), {
        sentiment: read.sentiment, tags: ['#macro', '#news'], confidence: 78,
      }),
      msg('vera_volume', sm, label, pick(veraLines), {
        sentiment: 'neutral', tags: ['#volumeprofile'], confidence: 80,
        sections: [{ title: 'What to check', content: 'POC · value area high/low · nearest HVN/LVN — see the Levels tab for exact prices.' }],
      }),
      msg('marlow_liq', sm, label, pick(marlowLines), {
        sentiment: 'neutral', tags: ['#liquidity'], confidence: 76,
      }),
      msg('sana_session', sm, label, pick(sanaLines), {
        sentiment: 'neutral', tags: ['#session'], confidence: 74,
      }),
      msg('cole_structure', sm, label, pick(read.cole), {
        sentiment: read.sentiment, tags: ['#structure'], confidence: 77,
      }),
    ],
  }
}

// ── Etsy pipeline conversations (creative team, unchanged cast) ───────────────

export function generateEtsyConversation(
  time: GameTime,
  productName: string,
  category: string,
  stage: 'idea' | 'listing',
): AgentConversation {
  const label = timeLabel(time)
  const sm = simMin(time)

  if (stage === 'idea') {
    return {
      id: uid(),
      simMinute: sm,
      timeLabel: label,
      title: `💡 New product idea: ${productName}`,
      type: 'creative',
      outcome: 'approved',
      tags: ['#etsy', '#newproduct', `#${category.replace(/\s/g, '')}`],
      finalDecision: `${productName} approved for the design pipeline.`,
      messages: [
        msg('research_agent', sm, label,
          `Spotted demand in ${category} — "${productName}" fits the gap. Search volume looks healthy and competition is thin.`,
          { sentiment: 'optimistic', tags: ['#research'], confidence: 76 }),
        msg('design_agent', sm, label,
          `I can start on ${productName} today. Clean layout, on-trend palette — should move quickly.`,
          { sentiment: 'optimistic', tags: ['#design'], confidence: 80 }),
        msg('qc_agent', sm, label,
          'Adding it to my review queue — standard checklist: resolution, margins, typography.',
          { tags: ['#qc'], confidence: 82 }),
      ],
    }
  }

  return {
    id: uid(),
    simMinute: sm,
    timeLabel: label,
    title: `📦 Listed: ${productName}`,
    type: 'creative',
    outcome: 'completed',
    tags: ['#etsy', '#listing', `#${category.replace(/\s/g, '')}`],
    finalDecision: `${productName} is live on the shop.`,
    messages: [
      msg('qc_agent', sm, label,
        `${productName} passed QC — files are crisp, bleed margins correct.`,
        { sentiment: 'optimistic', tags: ['#qc'], confidence: 85 }),
      msg('upload_agent', sm, label,
        `Listing is live: keyword-first title, all 13 tags filled, mockups attached. Now we watch the views.`,
        { sentiment: 'optimistic', tags: ['#seo', '#listing'], confidence: 83 }),
    ],
  }
}

// ── Trend shift ───────────────────────────────────────────────────────────────

export function generateTrendShiftConversation(
  time: GameTime,
  nicheName: string,
): AgentConversation {
  const label = timeLabel(time)
  const sm = simMin(time)

  return {
    id: uid(),
    simMinute: sm,
    timeLabel: label,
    title: `📈 Trend shift: ${nicheName}`,
    type: 'marketing',
    outcome: 'executing',
    tags: ['#trend', '#etsy'],
    finalDecision: `Catalog pivoting toward ${nicheName}.`,
    messages: [
      msg('research_agent', sm, label,
        `Market moved — ${nicheName} is the hot niche now. Re-prioritizing the idea backlog around it.`,
        { sentiment: 'optimistic', tags: ['#research', '#trend'], confidence: 74 }),
      msg('design_agent', sm, label,
        'On it — adjusting current drafts to match the new direction where it makes sense.',
        { sentiment: 'neutral', tags: ['#design'], confidence: 78 }),
    ],
  }
}

// ── Generic event → conversation dispatcher (EventLog click-through) ──────────

export function generateConversationForLogEntry(
  time: GameTime,
  message: string,
  type: string,
): AgentConversation | null {
  const label = timeLabel(time)
  const sm = simMin(time)

  if (type === 'trade') {
    // Desk observation → short analysis thread
    return {
      id: uid(),
      simMinute: sm,
      timeLabel: label,
      title: `🧭 Desk note: ${message.slice(0, 60)}${message.length > 60 ? '…' : ''}`,
      type: 'trading',
      outcome: 'completed',
      tags: ['#analysis'],
      finalDecision: 'Observation logged — levels available in the Levels tab.',
      messages: [
        msg('cole_structure', sm, label, message, { tags: ['#analysis'], confidence: 75 }),
        msg('vera_volume', sm, label,
          'Cross-checking against the profile — the relevant levels are marked on the board.',
          { tags: ['#volumeprofile'], confidence: 78 }),
      ],
    }
  }

  if (type === 'creative' || type === 'success') {
    return {
      id: uid(),
      simMinute: sm,
      timeLabel: label,
      title: `🎨 ${message.slice(0, 60)}${message.length > 60 ? '…' : ''}`,
      type: 'creative',
      outcome: 'completed',
      tags: ['#etsy'],
      finalDecision: 'Noted and tracked in the shop pipeline.',
      messages: [
        msg('research_agent', sm, label, message, { sentiment: 'optimistic', confidence: 80 }),
        msg('upload_agent', sm, label, 'Logged — shop metrics updated.', { confidence: 82 }),
      ],
    }
  }

  return null
}
