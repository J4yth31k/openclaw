import { useState, useRef, useEffect, useCallback } from 'react'
import { useSimStore } from '../store'

const BASE: string = (import.meta as any).env?.VITE_RAILWAY_URL ?? ''

// ── Per-agent accent colours ──────────────────────────────────────────────────
const AGENT_ACCENT: Record<string, string> = {
  nova_news:      '#f97316',
  vera_volume:    '#a855f7',
  marlow_liq:     '#06b6d4',
  sana_session:   '#10b981',
  cole_structure: '#4a6cf7',
  research_agent: '#f97316',
  design_agent:   '#ec4899',
  qc_agent:       '#10b981',
  upload_agent:   '#14b8a6',
  trader_agent:   '#3b82f6',
  risk_manager:   '#f97316',
}

// ── Quick persona lookup (name + emoji) for the header ───────────────────────
const AGENT_META: Record<string, { name: string; emoji: string }> = {
  nova_news:      { name: 'Nova',   emoji: '📰' },
  vera_volume:    { name: 'Vera',   emoji: '📊' },
  marlow_liq:     { name: 'Marlow', emoji: '💧' },
  sana_session:   { name: 'Sana',   emoji: '🕐' },
  cole_structure: { name: 'Cole',   emoji: '🧭' },
  research_agent: { name: 'Reya',   emoji: '🔍' },
  design_agent:   { name: 'Dani',   emoji: '🎨' },
  qc_agent:       { name: 'Quinn',  emoji: '✅' },
  upload_agent:   { name: 'Uly',    emoji: '📤' },
  trader_agent:   { name: 'Trae',   emoji: '📈' },
  risk_manager:   { name: 'Remi',   emoji: '🛡️' },
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface ChatMsg { role: 'user' | 'assistant'; content: string }

// ── Bubble ────────────────────────────────────────────────────────────────────
function Bubble({ msg, accent }: { msg: ChatMsg; accent: string }) {
  const isUser = msg.role === 'user'
  return (
    <div style={{
      display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 10,
    }}>
      <div style={{
        maxWidth: '78%',
        background: isUser ? accent + '22' : 'rgba(255,255,255,0.05)',
        border: `1px solid ${isUser ? accent + '55' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
        padding: '8px 12px',
        fontSize: 12,
        color: isUser ? '#e8f0ff' : '#c8d8f0',
        lineHeight: 1.5,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {msg.content}
      </div>
    </div>
  )
}

// ── Typing indicator ──────────────────────────────────────────────────────────
function TypingDots({ accent }: { accent: string }) {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '6px 0 6px 4px', alignItems: 'center' }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 6, height: 6, borderRadius: '50%', background: accent,
          animation: `blink 1.2s ${i * 0.2}s infinite`,
        }} />
      ))}
      <style>{`@keyframes blink { 0%,80%,100%{opacity:.2} 40%{opacity:1} }`}</style>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AgentChatModal() {
  const chatAgentId  = useSimStore(s => s.chatAgentId)
  const openAgentChat = useSimStore(s => s.openAgentChat)
  const agents        = useSimStore(s => s.agents)

  const [history,  setHistory]  = useState<ChatMsg[]>([])
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  // Reset history when agent changes
  useEffect(() => {
    setHistory([])
    setInput('')
    setError(null)
  }, [chatAgentId])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history, loading])

  // Focus input when opened
  useEffect(() => {
    if (chatAgentId) setTimeout(() => inputRef.current?.focus(), 80)
  }, [chatAgentId])

  const send = useCallback(async () => {
    if (!input.trim() || loading || !chatAgentId) return
    const userMsg: ChatMsg = { role: 'user', content: input.trim() }
    setHistory(h => [...h, userMsg])
    setInput('')
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`${BASE}/agents/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: chatAgentId,
          message:  userMsg.content,
          history:  history.map(m => ({ role: m.role, content: m.content })),
        }),
      })
      if (!res.ok) throw new Error(`${res.status}`)
      const data = await res.json()
      setHistory(h => [...h, { role: 'assistant', content: data.response }])
    } catch (e: any) {
      setError(BASE ? `Error: ${e.message}` : 'Set VITE_RAILWAY_URL in simworld/.env.local to connect to Railway')
    } finally {
      setLoading(false)
    }
  }, [input, loading, chatAgentId, history])

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  if (!chatAgentId) return null

  const meta   = AGENT_META[chatAgentId] ?? { name: chatAgentId, emoji: '🤖' }
  const accent = AGENT_ACCENT[chatAgentId] ?? '#7c3aed'
  const liveAgent = agents.find(a => a.id === chatAgentId)

  const greeting = history.length === 0
    ? `${meta.emoji} ${meta.name} is online. What do you need?`
    : null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={() => openAgentChat(null)}
        style={{
          position: 'fixed', inset: 0, zIndex: 1999,
          background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)',
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', right: 0, top: 0, bottom: 0,
        width: 380, zIndex: 2000,
        background: 'linear-gradient(160deg,#0c1018 0%,#101520 60%,#0a0f18 100%)',
        borderLeft: `2px solid ${accent}40`,
        display: 'flex', flexDirection: 'column',
        animation: 'slideInRight 0.22s ease-out',
        boxShadow: `-8px 0 40px ${accent}18`,
      }}>
        <style>{`
          @keyframes slideInRight { from { transform: translateX(40px); opacity:0; } to { transform:none; opacity:1; } }
        `}</style>

        {/* Header */}
        <div style={{
          padding: '14px 16px', borderBottom: `1px solid ${accent}30`,
          background: `linear-gradient(135deg, ${accent}18 0%, transparent 100%)`,
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
            background: `radial-gradient(circle at 35% 35%, ${accent}cc, ${accent}55)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, boxShadow: `0 0 14px ${accent}60`,
          }}>
            {meta.emoji}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#e8f0ff' }}>{meta.name}</div>
            <div style={{ fontSize: 10, color: accent, opacity: 0.85 }}>
              {liveAgent ? (liveAgent.taskName ?? liveAgent.speech ?? 'Standby') : 'Online'}
            </div>
          </div>
          <button
            onClick={() => openAgentChat(null)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#4a6080', fontSize: 18, padding: 4, lineHeight: 1,
            }}
          >×</button>
        </div>

        {/* Messages */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '12px 14px',
          display: 'flex', flexDirection: 'column',
        }}>
          {greeting && (
            <div style={{
              textAlign: 'center', fontSize: 11, color: '#3a5070',
              marginBottom: 14, padding: '8px 12px',
              background: 'rgba(255,255,255,0.03)', borderRadius: 8,
            }}>
              {greeting}
            </div>
          )}

          {history.map((msg, i) => (
            <Bubble key={i} msg={msg} accent={accent} />
          ))}

          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '14px 14px 14px 4px', padding: '4px 10px',
              }}>
                <TypingDots accent={accent} />
              </div>
            </div>
          )}

          {error && (
            <div style={{
              fontSize: 10, color: '#ef4444', padding: '6px 10px',
              background: 'rgba(239,68,68,0.08)', borderRadius: 6, marginTop: 4,
            }}>
              {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Quick prompts */}
        {history.length === 0 && (
          <div style={{
            padding: '0 14px 8px', display: 'flex', flexWrap: 'wrap', gap: 6,
          }}>
            {quickPrompts(chatAgentId).map(p => (
              <button
                key={p}
                onClick={() => { setInput(p); setTimeout(() => inputRef.current?.focus(), 50) }}
                style={{
                  background: `${accent}15`, border: `1px solid ${accent}30`,
                  borderRadius: 12, padding: '4px 9px', fontSize: 10,
                  color: '#a0b8d0', cursor: 'pointer',
                }}
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div style={{
          padding: '10px 14px 14px', borderTop: `1px solid rgba(255,255,255,0.06)`,
          display: 'flex', gap: 8, flexShrink: 0,
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={`Message ${meta.name}…`}
            rows={2}
            style={{
              flex: 1, background: 'rgba(255,255,255,0.04)',
              border: `1px solid ${input ? accent + '50' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: 10, padding: '8px 10px', color: '#d0dff0',
              fontSize: 12, resize: 'none', outline: 'none',
              fontFamily: 'inherit', lineHeight: 1.4,
              transition: 'border-color 0.15s',
            }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || loading}
            style={{
              width: 36, borderRadius: 10, border: 'none',
              background: !input.trim() || loading ? 'rgba(255,255,255,0.06)' : accent,
              color: !input.trim() || loading ? '#3a5070' : '#fff',
              cursor: !input.trim() || loading ? 'default' : 'pointer',
              fontSize: 16, flexShrink: 0,
              transition: 'background 0.15s',
            }}
          >
            ↑
          </button>
        </div>
      </div>
    </>
  )
}

// ── Quick prompt suggestions per agent ────────────────────────────────────────
function quickPrompts(agentId: string): string[] {
  const map: Record<string, string[]> = {
    nova_news:      ['Any big news today?', 'What\'s on the calendar?', 'Macro tone right now?'],
    vera_volume:    ['Where\'s the POC?', 'Volume profile update', 'Any thin spots nearby?'],
    marlow_liq:     ['Where\'s liquidity resting?', 'Nearest pool above/below?', 'Anything swept today?'],
    sana_session:   ['Session levels?', 'Opening range update', 'Best hours today?'],
    cole_structure: ['Structure check', 'Trend context?', 'Did any level break?'],
    research_agent: ['What niches are trending?', 'Competition analysis', 'Price point research'],
    design_agent:   ['What are you designing?', 'Differentiation ideas?', 'Color palette?'],
    qc_agent:       ['QC status?', 'Any listings failing?', 'SEO score?'],
    upload_agent:   ['What\'s live?', 'Upload status', 'Next listing?'],
    trader_agent:   ['Current bias?', 'Any open trades?', 'Session outlook?'],
    risk_manager:   ['Max loss today?', 'Position limits?', 'Risk check'],
  }
  return map[agentId] ?? ['What\'s the status?', 'Anything to report?']
}
