import { useState, useEffect, useCallback } from 'react'

const BASE: string = (import.meta as any).env?.VITE_RAILWAY_URL ?? ''

// ── Types ─────────────────────────────────────────────────────────────────────

interface LiveTrade {
  id: string
  symbol: string
  action: 'BUY' | 'SELL' | string
  price: number
  timeframe: string
  session: string
  timestamp: string
  analysis: string
  status: 'open' | 'won' | 'loss' | 'breakeven'
  pnl: number | null
  exit_price: number | null
  notes: string | null
  ict_passed: boolean
  risk_verdict: 'APPROVED' | 'REJECTED' | 'REVIEW'
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60)  return `${Math.round(diff)}s ago`
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`
  return `${Math.round(diff / 3600)}h ago`
}

// Parse analysis string into labelled sections for display
function parseAnalysis(raw: string): Array<{ label: string; color: string; text: string }> {
  if (!raw) return []
  const sections: Array<{ label: string; color: string; text: string }> = []
  const parts = raw.split(' || ')
  for (const part of parts) {
    if (part.startsWith('[ICT')) {
      const pass = part.includes('✅')
      sections.push({ label: 'ICT Pipeline', color: pass ? '#10b981' : '#ef4444', text: part })
    } else if (part.startsWith('[Risk')) {
      const color = part.includes('APPROVED') ? '#10b981' : part.includes('REJECTED') ? '#ef4444' : '#f59e0b'
      sections.push({ label: 'Marlow — Risk Read', color, text: part })
    } else if (part.startsWith('[Bias]')) {
      sections.push({ label: 'Cole — Bias Context', color: '#7c3aed', text: part.replace('[Bias] ', '') })
    } else if (part.startsWith('[Mkt]')) {
      sections.push({ label: 'Market Context', color: '#3b82f6', text: part.replace('[Mkt] ', '') })
    } else if (part.includes('SF')) {
      sections.push({ label: 'Signal Forge', color: '#f97316', text: part })
    } else if (part.trim()) {
      sections.push({ label: 'Analysis', color: '#6b7280', text: part })
    }
  }
  return sections
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AgentTag({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
      color, border: `1px solid ${color}50`,
      borderRadius: 4, padding: '1px 5px',
      background: `${color}12`,
    }}>
      {label}
    </span>
  )
}

function TradeCard({ trade, accent }: { trade: LiveTrade; accent: string }) {
  const [expanded, setExpanded] = useState(false)
  const isBull   = trade.action === 'BUY'
  const isOpen   = trade.status === 'open'
  const isWon    = trade.status === 'won'
  const isLoss   = trade.status === 'loss'
  const sections = parseAnalysis(trade.analysis)

  const statusColor = isOpen ? '#f59e0b' : isWon ? '#10b981' : isLoss ? '#ef4444' : '#6b7280'
  const statusLabel = isOpen ? '📡 LIVE' : isWon ? '✅ WIN' : isLoss ? '❌ LOSS' : '↔️ BE'

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${isOpen ? accent + '50' : statusColor + '30'}`,
      borderRadius: 10, marginBottom: 10, overflow: 'hidden',
      boxShadow: isOpen ? `0 0 12px ${accent}18` : 'none',
    }}>
      {/* Header row */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          padding: '10px 12px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 10,
        }}
      >
        {/* Direction badge */}
        <div style={{
          width: 36, height: 36, borderRadius: 8, flexShrink: 0,
          background: isBull ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
          border: `1px solid ${isBull ? '#10b981' : '#ef4444'}40`,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 1,
        }}>
          <span style={{ fontSize: 12 }}>{isBull ? '📈' : '📉'}</span>
          <span style={{ fontSize: 8, fontWeight: 700, color: isBull ? '#10b981' : '#ef4444' }}>
            {trade.action}
          </span>
        </div>

        {/* Symbol + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#e8f0ff' }}>{trade.symbol}</span>
            <span style={{ fontSize: 10, color: '#4a6080' }}>{trade.timeframe}m · @{trade.price}</span>
          </div>
          <div style={{ display: 'flex', gap: 5, marginTop: 3, flexWrap: 'wrap' }}>
            <AgentTag label={statusLabel} color={statusColor} />
            {trade.ict_passed && <AgentTag label="ICT ✅" color="#10b981" />}
            <AgentTag
              label={trade.risk_verdict === 'APPROVED' ? 'Risk OK' : trade.risk_verdict === 'REJECTED' ? 'Risk ❌' : 'Risk ?'}
              color={trade.risk_verdict === 'APPROVED' ? '#10b981' : trade.risk_verdict === 'REJECTED' ? '#ef4444' : '#f59e0b'}
            />
          </div>
        </div>

        {/* Right side */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {trade.pnl !== null && (
            <div style={{
              fontSize: 13, fontWeight: 700,
              color: trade.pnl >= 0 ? '#10b981' : '#ef4444',
            }}>
              {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(0)}
            </div>
          )}
          <div style={{ fontSize: 9, color: '#3a5070', marginTop: 2 }}>{timeAgo(trade.timestamp)}</div>
          <div style={{ fontSize: 9, color: '#3a5070', marginTop: 1 }}>{expanded ? '▲' : '▼'} details</div>
        </div>
      </div>

      {/* Expanded analysis */}
      {expanded && (
        <div style={{ padding: '0 12px 12px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          {sections.length > 0 ? (
            sections.map((s, i) => (
              <div key={i} style={{ marginTop: 8 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: s.color, marginBottom: 3, letterSpacing: 0.5 }}>
                  {s.label.toUpperCase()}
                </div>
                <div style={{
                  fontSize: 10, color: '#a0b8d0', lineHeight: 1.6,
                  background: `${s.color}08`, borderRadius: 6,
                  padding: '5px 8px', border: `1px solid ${s.color}20`,
                  wordBreak: 'break-word',
                }}>
                  {s.text}
                </div>
              </div>
            ))
          ) : (
            <div style={{ fontSize: 10, color: '#3a5070', marginTop: 8 }}>{trade.analysis}</div>
          )}
          {trade.notes && (
            <div style={{ marginTop: 8, fontSize: 10, color: '#a0b8d0', fontStyle: 'italic' }}>
              📝 {trade.notes}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Setup card (shown when no Railway URL or no trades yet) ───────────────────

function SetupCard({ accent }: { accent: string }) {
  const railwayUrl = BASE || 'https://YOUR-RAILWAY-URL.up.railway.app'
  const webhookUrl = `${railwayUrl}/analyze`

  const alertJson = `{
  "symbol": "{{ticker}}",
  "action": "BUY",
  "price": {{close}},
  "timeframe": "{{interval}}",
  "session": "{{time}}",
  "strategy": "ICT_SMC"
}`

  return (
    <div style={{ padding: 16 }}>
      <div style={{
        background: `${accent}12`, border: `1px solid ${accent}30`,
        borderRadius: 10, padding: 16, marginBottom: 16,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: accent, marginBottom: 8 }}>
          📡 Connect TradingView
        </div>
        <div style={{ fontSize: 11, color: '#a0b8d0', lineHeight: 1.7 }}>
          Every TradingView alert you fire hits Railway, gets analyzed by the full agent team, and appears here live.
        </div>
      </div>

      {/* Step 1 */}
      <Step n={1} title="Open TradingView → any futures chart (NQ, ES, CL…)" accent={accent}>
        <div style={{ fontSize: 10, color: '#7a9ab8' }}>
          NQ1! · ES1! · MNQ1! · MES1! · CL1! · GC1! · ZN1! · RTY1!
        </div>
      </Step>

      {/* Step 2 */}
      <Step n={2} title="Create an Alert → Notifications → Webhook URL" accent={accent}>
        <div style={{
          fontFamily: 'monospace', fontSize: 9, color: '#10b981',
          background: 'rgba(16,185,129,0.08)', borderRadius: 6,
          padding: '6px 8px', wordBreak: 'break-all',
          border: '1px solid rgba(16,185,129,0.2)',
        }}>
          {webhookUrl}
        </div>
      </Step>

      {/* Step 3 */}
      <Step n={3} title='Set Alert Message → paste this JSON' accent={accent}>
        <pre style={{
          fontFamily: 'monospace', fontSize: 9, color: '#c8d8f0',
          background: 'rgba(255,255,255,0.04)', borderRadius: 6,
          padding: '8px 10px', margin: 0, overflowX: 'auto',
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          {alertJson}
        </pre>
        <div style={{ fontSize: 9, color: '#4a6080', marginTop: 6 }}>
          Change "BUY" to "SELL" for short alerts. Keep {`{{ticker}}`} and {`{{close}}`} as-is — TradingView fills them automatically.
        </div>
      </Step>

      {/* Step 4 */}
      <Step n={4} title="Fire the alert → trade appears here instantly" accent={accent}>
        <div style={{ fontSize: 10, color: '#7a9ab8' }}>
          Your analysis desk (volume profile, liquidity map, bias context) reviews it within seconds.
          Expand any trade card to see the full breakdown.
        </div>
      </Step>

      {/* Close alert tip */}
      <div style={{
        marginTop: 16, padding: '10px 12px',
        background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
        borderRadius: 8, fontSize: 10, color: '#f59e0b', lineHeight: 1.6,
      }}>
        <strong>Logging trade results:</strong> Create a second alert for your TP/SL level.
        Set the message to the same JSON but add <code style={{ fontSize: 9 }}>"action": "CLOSE"</code>.
        Or message Nova in the agent chat — she can walk you through automating it.
      </div>
    </div>
  )
}

function Step({ n, title, accent, children }: {
  n: number; title: string; accent: string; children?: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={{
          width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
          background: `${accent}30`, border: `1px solid ${accent}60`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700, color: accent,
        }}>
          {n}
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#c8d8f0', paddingTop: 2 }}>{title}</div>
      </div>
      {children && <div style={{ paddingLeft: 28 }}>{children}</div>}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function LiveTradesPanel({ accent }: { accent: string }) {
  const [trades,  setTrades]  = useState<LiveTrade[]>([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [lastPoll, setLastPoll] = useState<Date | null>(null)

  const fetchTrades = useCallback(async () => {
    if (!BASE) { setError('no-url'); return }
    setLoading(true)
    try {
      const res = await fetch(`${BASE}/trades/live?limit=20`)
      if (!res.ok) throw new Error(`${res.status}`)
      const data = await res.json()
      setTrades(data.trades ?? [])
      setLastPoll(new Date())
      setError(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Poll every 15 seconds
  useEffect(() => {
    fetchTrades()
    const id = setInterval(fetchTrades, 15_000)
    return () => clearInterval(id)
  }, [fetchTrades])

  const openTrades = trades.filter(t => t.status === 'open')
  const closedTrades = trades.filter(t => t.status !== 'open')

  // Show setup guide if no URL configured or no trades yet
  if (!BASE || (error === 'no-url')) return <SetupCard accent={accent} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
        paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%', background: accent,
          boxShadow: `0 0 8px ${accent}`,
          animation: loading ? 'none' : 'livePulse 2s infinite',
        }} />
        <style>{`@keyframes livePulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
        <span style={{ fontSize: 10, color: '#4a6080' }}>
          {loading ? 'Syncing…' : lastPoll ? `Synced ${timeAgo(lastPoll.toISOString())}` : 'Connecting…'}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: accent }}>
          {openTrades.length} open · {closedTrades.length} closed
        </span>
        <button
          onClick={fetchTrades}
          style={{
            background: `${accent}18`, border: `1px solid ${accent}40`,
            borderRadius: 6, color: accent, cursor: 'pointer',
            fontSize: 10, padding: '3px 8px',
          }}
        >
          ↻
        </button>
      </div>

      {/* Error state */}
      {error && error !== 'no-url' && (
        <div style={{
          fontSize: 10, color: '#ef4444', padding: '6px 10px',
          background: 'rgba(239,68,68,0.08)', borderRadius: 6, marginBottom: 10,
        }}>
          Railway unreachable: {error} — check VITE_RAILWAY_URL
        </div>
      )}

      {/* Trade list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {trades.length === 0 && !loading && (
          <div style={{ textAlign: 'center', marginTop: 40 }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>📡</div>
            <div style={{ fontSize: 12, color: '#3a5070', marginBottom: 6 }}>
              No trades yet
            </div>
            <div style={{ fontSize: 10, color: '#2a3f58', lineHeight: 1.6 }}>
              Fire a TradingView alert to see your<br />
              full agent team analyze it here.
            </div>
          </div>
        )}

        {openTrades.length > 0 && (
          <>
            <div style={{ fontSize: 9, color: '#4a6080', fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>
              LIVE POSITIONS
            </div>
            {openTrades.map(t => <TradeCard key={t.id} trade={t} accent={accent} />)}
          </>
        )}

        {closedTrades.length > 0 && (
          <>
            <div style={{ fontSize: 9, color: '#4a6080', fontWeight: 700, letterSpacing: 1, marginTop: 14, marginBottom: 8 }}>
              CLOSED
            </div>
            {closedTrades.map(t => <TradeCard key={t.id} trade={t} accent={accent} />)}
          </>
        )}
      </div>
    </div>
  )
}
