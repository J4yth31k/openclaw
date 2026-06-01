import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useSimStore } from '../store'
import type { AgentConversation, ConversationMessage, ConversationType } from '../types'

// ── Constants ─────────────────────────────────────────────────────────────────

const OUTCOME_COLOR: Record<string, string> = {
  approved:  '#10b981',
  rejected:  '#ef4444',
  pending:   '#f59e0b',
  executing: '#3b82f6',
  completed: '#6366f1',
  cancelled: '#6b7280',
}

const TYPE_ICON: Record<ConversationType, string> = {
  trading:      '📈',
  risk:         '🛡️',
  business:     '🏪',
  creative:     '🎨',
  coordination: '🎯',
  marketing:    '📣',
  planning:     '📋',
}

const SENTIMENT_COLOR: Record<string, string> = {
  bullish:    '#10b981',
  bearish:    '#ef4444',
  neutral:    '#6b7280',
  cautious:   '#f59e0b',
  aggressive: '#f97316',
  optimistic: '#3b82f6',
  concerned:  '#a855f7',
}

const RISK_COLOR: Record<string, string> = {
  low:      '#10b981',
  medium:   '#f59e0b',
  high:     '#ef4444',
  critical: '#7c3aed',
}

const ROLE_LABELS: Record<string, string> = {
  tech_analyst:       'Tech Analyst',
  fundamentals_agent: 'Fundamentals',
  sentiment_agent:    'Sentiment',
  orderflow_agent:    'Order Flow',
  correlation_agent:  'Correlations',
  director_agent:     'Director',
  tradeideas_agent:   'Trade Ideas',
  news_agent:         'News Intel',
  webhook_agent:      'Webhooks',
  hq_risk_manager:    'Risk Mgmt',
  backtest_agent:     'Backtesting',
  trader_agent:       'Trader',
  risk_manager:       'Risk Manager',
  research_agent:     'Researcher',
  design_agent:       'Designer',
  qc_agent:           'QC',
  upload_agent:       'Lister',
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ConfidenceBadge({ value }: { value: number }) {
  const color = value >= 80 ? '#10b981' : value >= 65 ? '#f59e0b' : '#ef4444'
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: `${color}14`, border: `1px solid ${color}30`,
      borderRadius: 4, padding: '1px 6px',
    }}>
      <div style={{ width: 4, height: 4, borderRadius: '50%', background: color }} />
      <span style={{ fontSize: 9, color, fontWeight: 700, fontFamily: 'monospace' }}>
        {value}% conf
      </span>
    </div>
  )
}

function TagChip({ tag }: { tag: string }) {
  return (
    <span style={{
      fontSize: 8, color: '#6366f1', background: 'rgba(99,102,241,0.1)',
      border: '1px solid rgba(99,102,241,0.25)', borderRadius: 3,
      padding: '1px 5px', fontFamily: 'monospace',
    }}>
      {tag}
    </span>
  )
}

function ExpandableSection({ title, content }: { title: string; content: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: 6 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', padding: '5px 0',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 9, color: '#4a5870', transition: 'transform 0.15s',
          display: 'inline-block', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
        <span style={{ fontSize: 9, color: '#7c8a9e', fontWeight: 700, letterSpacing: 0.5 }}>
          {title.toUpperCase()}
        </span>
      </button>
      {open && (
        <div style={{
          fontSize: 10, color: '#9faec0', lineHeight: 1.6,
          padding: '4px 0 6px 16px',
          whiteSpace: 'pre-wrap',
          fontFamily: 'monospace',
          borderLeft: '2px solid rgba(99,102,241,0.2)',
          marginLeft: 4,
        }}>
          {content}
        </div>
      )}
    </div>
  )
}

function AgentMessageCard({
  message,
  zoom,
}: {
  message: ConversationMessage
  zoom: number
}) {
  const fontSize = Math.round(11 * zoom)
  const smallFontSize = Math.round(9 * zoom)
  const tinyFontSize = Math.round(8 * zoom)

  return (
    <div style={{
      marginBottom: Math.round(12 * zoom),
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.05)',
      borderRadius: 8,
      padding: Math.round(10 * zoom),
      borderLeft: `3px solid ${message.agentColor}`,
      transition: 'all 0.15s',
    }}>
      {/* Agent header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: Math.round(8 * zoom), marginBottom: Math.round(8 * zoom) }}>
        {/* Avatar */}
        <div style={{
          width: Math.round(32 * zoom), height: Math.round(32 * zoom),
          borderRadius: '50%', flexShrink: 0,
          background: `${message.agentColor}20`,
          border: `2px solid ${message.agentColor}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: Math.round(16 * zoom),
        }}>
          {message.agentEmoji}
        </div>

        {/* Name + role + time */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
            <span style={{ fontSize: smallFontSize + 1, fontWeight: 700, color: message.agentColor }}>
              {message.agentName}
            </span>
            <span style={{ fontSize: tinyFontSize, color: '#4a5870', background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3, padding: '1px 5px' }}>
              {ROLE_LABELS[message.agentRole] ?? message.agentRole}
            </span>
            <span style={{ fontSize: tinyFontSize, color: '#3a4860', marginLeft: 'auto' }}>
              {message.timeLabel}
            </span>
          </div>

          {/* Metadata badges */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
            <ConfidenceBadge value={message.confidence} />
            <span style={{
              fontSize: tinyFontSize, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
              background: `${RISK_COLOR[message.riskLevel]}14`,
              border: `1px solid ${RISK_COLOR[message.riskLevel]}30`,
              color: RISK_COLOR[message.riskLevel],
            }}>
              {message.riskLevel} risk
            </span>
            <span style={{
              fontSize: tinyFontSize, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
              background: `${SENTIMENT_COLOR[message.sentiment]}14`,
              border: `1px solid ${SENTIMENT_COLOR[message.sentiment]}30`,
              color: SENTIMENT_COLOR[message.sentiment],
            }}>
              {message.sentiment}
            </span>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div style={{
        fontSize,
        color: '#c8d4e4',
        lineHeight: 1.6,
        marginBottom: message.sections.length > 0 ? 4 : 0,
      }}>
        {message.content}
      </div>

      {/* Expandable sections */}
      {message.sections.map((s, i) => (
        <ExpandableSection key={i} title={s.title} content={s.content} />
      ))}

      {/* Tags */}
      {message.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
          {message.tags.map((t, i) => <TagChip key={i} tag={t} />)}
        </div>
      )}
    </div>
  )
}

// ── Conversation Card (list view) ─────────────────────────────────────────────

function ConversationCard({
  conv,
  selected,
  onClick,
}: {
  conv: AgentConversation
  selected: boolean
  onClick: () => void
}) {
  const typeIcon = TYPE_ICON[conv.type] ?? '💬'
  const outcomeColor = OUTCOME_COLOR[conv.outcome] ?? '#6b7280'

  return (
    <div
      onClick={onClick}
      style={{
        padding: '8px 10px',
        borderRadius: 7,
        marginBottom: 5,
        cursor: 'pointer',
        background: selected ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.02)',
        border: selected ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.05)',
        transition: 'all 0.12s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
        <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{typeIcon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: selected ? '#a5b4fc' : '#c8d4e4',
            marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {conv.title}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 8, color: '#3a4860', fontFamily: 'monospace' }}>
              {conv.timeLabel}
            </span>
            <span style={{ fontSize: 8, color: outcomeColor, fontWeight: 700 }}>
              {conv.outcome}
            </span>
            <span style={{ fontSize: 8, color: '#4a5870' }}>
              {conv.messages.length} msg{conv.messages.length !== 1 ? 's' : ''}
            </span>
          </div>
          {conv.finalDecision && (
            <div style={{ fontSize: 8, color: '#4a5870', marginTop: 3,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              → {conv.finalDecision}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Timeline ──────────────────────────────────────────────────────────────────

function ConversationTimeline({ conversations, selectedId, onSelect }: {
  conversations: AgentConversation[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div style={{ padding: '8px 4px' }}>
      {conversations.slice(0, 20).map((conv, i) => {
        const isFirst = i === 0
        const typeIcon = TYPE_ICON[conv.type] ?? '💬'
        const outcomeColor = OUTCOME_COLOR[conv.outcome] ?? '#6b7280'
        const isSelected = conv.id === selectedId

        return (
          <div key={conv.id} style={{ display: 'flex', gap: 8, position: 'relative' }}>
            {/* Timeline line */}
            {!isFirst && (
              <div style={{
                position: 'absolute', left: 10, top: 0, bottom: '50%',
                width: 1, background: 'rgba(255,255,255,0.06)',
              }} />
            )}
            {i < conversations.slice(0, 20).length - 1 && (
              <div style={{
                position: 'absolute', left: 10, top: '50%', bottom: 0,
                width: 1, background: 'rgba(255,255,255,0.06)',
              }} />
            )}

            {/* Node */}
            <div style={{
              width: 21, height: 21, flexShrink: 0,
              borderRadius: '50%', marginTop: 6,
              background: isSelected ? outcomeColor : `${outcomeColor}20`,
              border: `2px solid ${outcomeColor}60`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, cursor: 'pointer', zIndex: 1,
              transition: 'all 0.15s',
            }}
              onClick={() => onSelect(conv.id)}
            >
              {typeIcon}
            </div>

            {/* Content */}
            <div
              onClick={() => onSelect(conv.id)}
              style={{
                flex: 1, cursor: 'pointer', paddingBottom: 8,
                paddingTop: 4,
              }}
            >
              <div style={{ fontSize: 9, fontWeight: 700,
                color: isSelected ? '#a5b4fc' : '#9faec0',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {conv.title}
              </div>
              <div style={{ fontSize: 8, color: '#3a4860', fontFamily: 'monospace' }}>
                {conv.timeLabel}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Search & Filter bar ───────────────────────────────────────────────────────

type FilterType = 'all' | ConversationType

function SearchBar({
  query, setQuery, filterType, setFilterType,
}: {
  query: string
  setQuery: (q: string) => void
  filterType: FilterType
  setFilterType: (t: FilterType) => void
}) {
  const types: FilterType[] = ['all', 'trading', 'risk', 'business', 'creative', 'coordination', 'marketing', 'planning']

  return (
    <div style={{ padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
      {/* Search input */}
      <div style={{ position: 'relative', marginBottom: 6 }}>
        <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
          fontSize: 10, color: '#4a5870', pointerEvents: 'none' }}>🔍</span>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search conversations…"
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 5, padding: '5px 8px 5px 26px',
            color: '#c8d4e4', fontSize: 9, outline: 'none',
            fontFamily: 'inherit',
          }}
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', color: '#4a5870', fontSize: 11 }}
          >×</button>
        )}
      </div>

      {/* Type filter chips */}
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {types.map(t => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            style={{
              padding: '2px 7px', borderRadius: 4, border: 'none', cursor: 'pointer',
              fontSize: 8, fontWeight: 700, letterSpacing: 0.3,
              background: filterType === t ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.03)',
              color: filterType === t ? '#a5b4fc' : '#4a5870',
              borderBottom: filterType === t ? '1px solid #6366f1' : '1px solid transparent',
            }}
          >
            {t === 'all' ? 'All' : `${TYPE_ICON[t as ConversationType]} ${t}`}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Zoom Controls ─────────────────────────────────────────────────────────────

function ZoomControls({ zoom, setZoom }: { zoom: number; setZoom: (z: number) => void }) {
  const steps = [0.75, 0.875, 1, 1.125, 1.25, 1.5]

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '4px 8px', borderTop: '1px solid rgba(255,255,255,0.04)',
      background: 'rgba(0,0,0,0.2)', flexShrink: 0,
    }}>
      <span style={{ fontSize: 8, color: '#3a4860', marginRight: 2 }}>Zoom</span>
      <button
        onClick={() => setZoom(Math.max(0.75, zoom - 0.125))}
        disabled={zoom <= 0.75}
        style={{ ...zoomBtn, opacity: zoom <= 0.75 ? 0.3 : 1 }}
      >−</button>
      <span style={{ fontSize: 9, color: '#6b7890', fontFamily: 'monospace', minWidth: 34, textAlign: 'center' }}>
        {Math.round(zoom * 100)}%
      </span>
      <button
        onClick={() => setZoom(Math.min(1.5, zoom + 0.125))}
        disabled={zoom >= 1.5}
        style={{ ...zoomBtn, opacity: zoom >= 1.5 ? 0.3 : 1 }}
      >+</button>
      <button
        onClick={() => setZoom(1)}
        style={{ ...zoomBtn, marginLeft: 2, fontSize: 7 }}
      >⟳</button>
      <div style={{ flex: 1 }} />
      {steps.map(s => (
        <button
          key={s}
          onClick={() => setZoom(s)}
          style={{
            ...zoomBtn,
            background: zoom === s ? 'rgba(99,102,241,0.2)' : 'transparent',
            color: zoom === s ? '#a5b4fc' : '#3a4860',
          }}
        >
          {Math.round(s * 100)}
        </button>
      ))}
    </div>
  )
}

const zoomBtn: React.CSSProperties = {
  padding: '2px 6px', borderRadius: 3, border: '1px solid rgba(255,255,255,0.06)',
  background: 'rgba(255,255,255,0.03)', color: '#8090a8',
  fontSize: 9, cursor: 'pointer', fontFamily: 'monospace',
}

// ── Full Conversation Detail ───────────────────────────────────────────────────

function ConversationDetail({
  conv,
  onBack,
  zoom,
  setZoom,
  onWheel,
}: {
  conv: AgentConversation
  onBack: () => void
  zoom: number
  setZoom: (z: number) => void
  onWheel: (e: React.WheelEvent) => void
}) {
  const outcomeColor = OUTCOME_COLOR[conv.outcome] ?? '#6b7280'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'flex-start', gap: 8, flexShrink: 0,
        background: 'rgba(0,0,0,0.15)',
      }}>
        <button
          onClick={onBack}
          style={{ ...zoomBtn, padding: '3px 8px', marginTop: 2, flexShrink: 0 }}
        >← Back</button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#e0e8f8', marginBottom: 3,
            lineHeight: 1.3 }}>
            {TYPE_ICON[conv.type]} {conv.title}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
            <span style={{ fontSize: 8, color: '#3a4860', fontFamily: 'monospace' }}>{conv.timeLabel}</span>
            <span style={{
              fontSize: 8, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
              background: `${outcomeColor}20`, border: `1px solid ${outcomeColor}40`,
              color: outcomeColor,
            }}>
              {conv.outcome}
            </span>
            <span style={{ fontSize: 8, color: '#4a5870' }}>
              {conv.messages.length} agent{conv.messages.length !== 1 ? 's' : ''}
            </span>
            {conv.pair && (
              <span style={{ fontSize: 8, color: '#6366f1', fontFamily: 'monospace',
                background: 'rgba(99,102,241,0.1)', padding: '1px 5px', borderRadius: 3 }}>
                {conv.pair}
              </span>
            )}
          </div>
          {conv.tags.map((t, i) => <TagChip key={i} tag={t} />)}
        </div>
      </div>

      {/* Final decision banner */}
      {conv.finalDecision && (
        <div style={{
          padding: '6px 10px', fontSize: 9, color: '#a5b4fc',
          background: 'rgba(99,102,241,0.08)', borderBottom: '1px solid rgba(99,102,241,0.15)',
          flexShrink: 0,
        }}>
          <span style={{ color: '#6366f1', fontWeight: 700 }}>Decision: </span>
          {conv.finalDecision}
        </div>
      )}

      {/* Messages */}
      <div
        onWheel={onWheel}
        style={{ flex: 1, overflowY: 'auto', padding: '10px 10px' }}
      >
        {conv.messages.map(m => (
          <AgentMessageCard key={m.id} message={m} zoom={zoom} />
        ))}
      </div>

      {/* Zoom controls */}
      <ZoomControls zoom={zoom} setZoom={setZoom} />
    </div>
  )
}

// ── Main ConversationViewer ────────────────────────────────────────────────────

export default function ConversationViewer() {
  const conversations      = useSimStore(s => s.conversations)
  const selectedId         = useSimStore(s => s.selectedConversationId)
  const selectConversation = useSimStore(s => s.selectConversation)

  const [view, setView]           = useState<'list' | 'timeline'>('list')
  const [query, setQuery]         = useState('')
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [zoom, setZoom]           = useState(() => {
    try { return parseFloat(localStorage.getItem('sw_conv_zoom') ?? '1') || 1 } catch { return 1 }
  })

  // Persist zoom
  useEffect(() => {
    try { localStorage.setItem('sw_conv_zoom', String(zoom)) } catch {}
  }, [zoom])

  // Keyboard zoom shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '=') { e.preventDefault(); setZoom(z => Math.min(1.5, z + 0.125)) }
      if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); setZoom(z => Math.max(0.75, z - 0.125)) }
      if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); setZoom(1) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Mouse wheel zoom for conversation detail
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      setZoom(z => {
        const next = z - e.deltaY * 0.005
        return Math.max(0.75, Math.min(1.5, next))
      })
    }
  }, [])

  const filtered = useMemo(() => {
    return conversations.filter(c => {
      if (filterType !== 'all' && c.type !== filterType) return false
      if (!query) return true
      const q = query.toLowerCase()
      return (
        c.title.toLowerCase().includes(q) ||
        c.finalDecision?.toLowerCase().includes(q) ||
        c.tags.some(t => t.toLowerCase().includes(q)) ||
        c.messages.some(m =>
          m.content.toLowerCase().includes(q) ||
          m.agentName.toLowerCase().includes(q)
        )
      )
    })
  }, [conversations, query, filterType])

  const selected = useMemo(
    () => conversations.find(c => c.id === selectedId) ?? null,
    [conversations, selectedId]
  )

  if (conversations.length === 0) {
    return (
      <div style={{ padding: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>🎯</div>
        <div style={{ fontSize: 10, color: '#4a5870', fontWeight: 700, marginBottom: 4 }}>
          Ops Center Standing By
        </div>
        <div style={{ fontSize: 9, color: '#3a4060', lineHeight: 1.5 }}>
          Agent conversations will appear here as the simulation runs. Each major decision generates a detailed multi-agent discussion.
        </div>
      </div>
    )
  }

  if (selected) {
    return (
      <ConversationDetail
        conv={selected}
        onBack={() => selectConversation(null)}
        zoom={zoom}
        setZoom={setZoom}
        onWheel={handleWheel}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* View toggle */}
      <div style={{
        display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0, background: 'rgba(4,6,14,0.99)',
      }}>
        {([
          { id: 'list',     label: '📋 Conversations' },
          { id: 'timeline', label: '🕐 Timeline' },
        ] as const).map(v => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            style={{
              flex: 1, border: 'none', padding: '6px 4px', fontSize: 9, fontWeight: 700,
              background: view === v.id ? 'rgba(99,102,241,0.08)' : 'transparent',
              color: view === v.id ? '#a5b4fc' : '#4a5870', cursor: 'pointer',
              borderBottom: view === v.id ? '2px solid #6366f1' : '2px solid transparent',
            }}
          >
            {v.label}
          </button>
        ))}
        <div style={{ padding: '4px 8px', display: 'flex', alignItems: 'center',
          fontSize: 8, color: '#3a4060', fontFamily: 'monospace' }}>
          {filtered.length}/{conversations.length}
        </div>
      </div>

      {/* Search */}
      <SearchBar
        query={query}
        setQuery={setQuery}
        filterType={filterType}
        setFilterType={setFilterType}
      />

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: view === 'list' ? '6px 8px' : '4px 8px' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 16, fontSize: 9, color: '#3a4060' }}>
            No conversations match your search.
          </div>
        ) : view === 'list' ? (
          filtered.map(c => (
            <ConversationCard
              key={c.id}
              conv={c}
              selected={c.id === selectedId}
              onClick={() => selectConversation(c.id)}
            />
          ))
        ) : (
          <ConversationTimeline
            conversations={filtered}
            selectedId={selectedId}
            onSelect={selectConversation}
          />
        )}
      </div>

      {/* Footer stats */}
      <div style={{
        padding: '4px 10px', borderTop: '1px solid rgba(255,255,255,0.04)',
        display: 'flex', gap: 12, background: 'rgba(0,0,0,0.15)', flexShrink: 0,
      }}>
        {(['trading', 'business', 'risk'] as ConversationType[]).map(type => {
          const count = conversations.filter(c => c.type === type).length
          return (
            <div key={type} style={{ fontSize: 8, color: '#4a5870' }}>
              {TYPE_ICON[type]} {count} {type}
            </div>
          )
        })}
      </div>
    </div>
  )
}
