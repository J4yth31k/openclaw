import { useState, useMemo } from 'react'
import { useSimStore } from '../store'
import type { Agent, EtsyProduct, TradeRecord } from '../types'
import AgentChatModal from './AgentChatModal'
import LiveTradesPanel from './LiveTradesPanel'

// ─────────────────────────────────────────────────────────────────────────────
// SHARED PRIMITIVES
// ─────────────────────────────────────────────────────────────────────────────

const BUILDING_ACCENT: Record<string, string> = {
  trading_office:  '#3b82f6',
  avengers_hq:     '#7c3aed',
  creative_studio: '#f97316',
  home1:           '#10b981',
  home2:           '#06b6d4',
  hq_quarters:     '#6366f1',
}

function fmt$(n: number) {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}k`
  return `$${n.toFixed(2)}`
}
function fmtPct(n: number) { return `${n.toFixed(1)}%` }
function fmtN(n: number) { return n.toLocaleString() }

// ── Metric card ───────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, accent, small }: {
  label: string; value: string; sub?: string; accent: string; small?: boolean
}) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)', border: `1px solid ${accent}25`,
      borderRadius: 10, padding: small ? '8px 12px' : '12px 14px',
      display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 90,
    }}>
      <div style={{ fontSize: 9, color: '#4a5568', textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</div>
      <div style={{ fontSize: small ? 16 : 20, fontWeight: 800, color: '#e0e6f0', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: accent }}>{sub}</div>}
    </div>
  )
}

function MetricRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{children}</div>
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

function TabBar({ tabs, active, onChange, accent }: {
  tabs: string[]; active: string; onChange: (t: string) => void; accent: string
}) {
  return (
    <div style={{
      display: 'flex', gap: 4, borderBottom: `1px solid rgba(255,255,255,0.07)`,
      paddingBottom: 0, marginBottom: 14, overflowX: 'auto', flexShrink: 0,
      scrollbarWidth: 'none',
    }}>
      {tabs.map(t => (
        <button key={t} onClick={() => onChange(t)} style={{
          background: active === t ? `${accent}20` : 'transparent',
          border: 'none', borderBottom: active === t ? `2px solid ${accent}` : '2px solid transparent',
          color: active === t ? accent : '#4a5568',
          padding: '8px 14px', cursor: 'pointer', fontSize: 11, fontWeight: 600,
          whiteSpace: 'nowrap', borderRadius: '6px 6px 0 0', transition: 'all 0.15s',
        }}>
          {t}
        </button>
      ))}
    </div>
  )
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHead({ label, accent }: { label: string; accent: string }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 700, color: accent, letterSpacing: 1.2,
      textTransform: 'uppercase', marginBottom: 6, marginTop: 4,
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      <div style={{ flex: 1, height: 1, background: `${accent}25` }} />
      {label}
      <div style={{ flex: 1, height: 1, background: `${accent}25` }} />
    </div>
  )
}

// ── Agent mini card ───────────────────────────────────────────────────────────

function AgentMini({ agent, accent, task }: { agent: Agent; accent: string; task?: string }) {
  const openAgentChat = useSimStore(s => s.openAgentChat)

  const stateLabel: Record<string, string> = {
    working: '⚙️ Working', talking: '💬 Meeting', at_work: '🪑 At desk',
    on_break: '☕ Break', commuting_to_work: '🚶 Commuting',
    sleeping: '😴 Resting', at_home: '🏠 Home',
  }
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: `1px solid ${agent.color}30`,
      borderRadius: 8, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
        background: `radial-gradient(circle at 35% 35%, ${agent.accentColor}, ${agent.color})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, boxShadow: `0 0 10px ${agent.color}40`,
      }}>
        {agent.emoji ?? agent.name[0]}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#d0d8e8' }}>{agent.name}</div>
        <div style={{ fontSize: 9, color: '#4a6080' }}>{stateLabel[agent.state] ?? agent.state}</div>
        {(task ?? agent.speech) && (
          <div style={{
            fontSize: 9, color: '#a0b0c8', fontStyle: 'italic', marginTop: 2,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {task ?? agent.speech}
          </div>
        )}
      </div>
      {agent.state === 'working' && (
        <div style={{ width: 32, flexShrink: 0 }}>
          <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
            <div style={{
              height: '100%', borderRadius: 2, width: `${agent.taskProgress * 100}%`,
              background: `linear-gradient(90deg, ${agent.color}, ${accent})`,
            }} />
          </div>
        </div>
      )}
      <button
        onClick={() => openAgentChat(agent.id)}
        title={`Message ${agent.name}`}
        style={{
          background: `${accent}18`, border: `1px solid ${accent}40`,
          borderRadius: 6, color: accent, cursor: 'pointer',
          width: 24, height: 24, fontSize: 11, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.15s',
        }}
      >
        💬
      </button>
    </div>
  )
}

// ── Activity row ──────────────────────────────────────────────────────────────

function ActivityRow({ message, type, timeLabel }: {
  message: string; type: string; timeLabel: string
}) {
  const icons: Record<string, string> = {
    trade: '📊', success: '✅', warning: '⚠️', info: 'ℹ️', creative: '🎨',
  }
  const colors: Record<string, string> = {
    trade: '#3b82f6', success: '#10b981', warning: '#f59e0b', info: '#6b7280', creative: '#f97316',
  }
  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'flex-start',
      padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>
      <span style={{ fontSize: 11, flexShrink: 0 }}>{icons[type] ?? 'ℹ️'}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10, color: '#c0cce0', lineHeight: 1.4 }}>{message}</div>
        <div style={{ fontSize: 8, color: '#3a4858', marginTop: 2 }}>{timeLabel}</div>
      </div>
    </div>
  )
}

// ── AI insight box ────────────────────────────────────────────────────────────

function AIInsight({ lines, agent, agentColor }: {
  lines: string[]; agent: string; agentColor: string
}) {
  return (
    <div style={{
      background: `${agentColor}10`, border: `1px solid ${agentColor}30`,
      borderRadius: 10, padding: 12,
    }}>
      <div style={{
        fontSize: 9, fontWeight: 700, color: agentColor, letterSpacing: 1,
        textTransform: 'uppercase', marginBottom: 6,
      }}>
        🤖 {agent} AI Analysis
      </div>
      {lines.map((l, i) => (
        <div key={i} style={{
          fontSize: 10, color: '#b0bece', lineHeight: 1.5,
          paddingLeft: 8, borderLeft: `2px solid ${agentColor}40`,
          marginBottom: i < lines.length - 1 ? 6 : 0,
        }}>
          {l}
        </div>
      ))}
    </div>
  )
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ pct, color, label }: { pct: number; color: string; label?: string }) {
  return (
    <div>
      {label && <div style={{ fontSize: 9, color: '#6b7280', marginBottom: 3 }}>{label}</div>}
      <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
        <div style={{
          height: '100%', borderRadius: 3, width: `${Math.min(100, pct)}%`,
          background: `linear-gradient(90deg, ${color}, ${color}aa)`,
          transition: 'width 0.8s ease',
        }} />
      </div>
    </div>
  )
}

// ── Pill badge ────────────────────────────────────────────────────────────────

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      background: `${color}20`, color, border: `1px solid ${color}40`,
      borderRadius: 20, padding: '2px 8px', fontSize: 9, fontWeight: 700,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TRADING OPERATIONS PANEL
// ─────────────────────────────────────────────────────────────────────────────

const TRADING_TABS = ['Overview', '📡 Live', 'Signals', 'Positions', 'Journal', 'Analytics', 'Agents']

function SignalCard({ trade, accent }: { trade: TradeRecord; accent: string }) {
  const isLong = trade.direction === 'long'
  const dirColor = isLong ? '#10b981' : '#ef4444'
  const pnl = trade.pnl ?? 0
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: `1px solid ${dirColor}25`,
      borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <div style={{
        width: 6, height: 40, borderRadius: 3, background: dirColor, flexShrink: 0,
      }} />
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#e0e6f0' }}>{trade.pair}</span>
          <Pill label={isLong ? 'LONG' : 'SHORT'} color={dirColor} />
          {trade.status === 'open' && <Pill label="OPEN" color={accent} />}
          {trade.status === 'won' && <Pill label="WIN" color="#10b981" />}
          {trade.status === 'lost' && <Pill label="LOSS" color="#ef4444" />}
        </div>
        <div style={{ fontSize: 9, color: '#5a6880' }}>
          Entry: <span style={{ color: '#a0b0c8' }}>{trade.entryPrice.toFixed(trade.pair.includes('/') ? 5 : 2)}</span>
          {trade.exitPrice && (
            <> → Exit: <span style={{ color: '#a0b0c8' }}>{trade.exitPrice.toFixed(trade.pair.includes('/') ? 5 : 2)}</span></>
          )}
        </div>
      </div>
      {pnl !== 0 && (
        <div style={{
          fontSize: 14, fontWeight: 800,
          color: pnl >= 0 ? '#10b981' : '#ef4444',
        }}>
          {pnl >= 0 ? '+' : ''}{fmt$(pnl)}
        </div>
      )}
    </div>
  )
}

function TradingOpsPanel({ agents, accent }: { agents: Agent[]; accent: string }) {
  const [tab, setTab] = useState('Overview')
  const trading   = useSimStore(s => s.trading)
  const eventLog  = useSimStore(s => s.eventLog)
  const convo     = useSimStore(s => s.conversations)

  const tradeEvents = useMemo(() => eventLog.filter(e => e.type === 'trade').slice(-12).reverse(), [eventLog])
  const openTrades  = useMemo(() => trading.recentTrades.filter(t => t.status === 'open'), [trading])
  const closedTrades = useMemo(() => trading.recentTrades.filter(t => t.status !== 'open').slice(-20).reverse(), [trading])
  const totalTrades = trading.wins + trading.losses
  const avgRR = totalTrades > 0 ? (1.8 + Math.random() * 0.4).toFixed(2) : '—'

  const hulkLines = useMemo(() => {
    const lines = []
    if (trading.winRate > 60) lines.push(`Win rate ${fmtPct(trading.winRate)} — strategy is working. Keep the discipline.`)
    else if (trading.winRate > 0) lines.push(`Win rate ${fmtPct(trading.winRate)} — below target. Review recent losses for pattern.`)
    if (trading.drawdown > 5) lines.push(`Drawdown at ${fmtPct(trading.drawdown)} — reduce position size until drawdown recovers.`)
    if (trading.marketMood === 'volatile') lines.push('Market is volatile. Stick to A+ setups only. No FOMO trades.')
    if (trading.wins > trading.losses && trading.wins > 2) lines.push(`${trading.wins} wins vs ${trading.losses} losses today. Positive expectancy confirmed.`)
    if (lines.length === 0) lines.push('Monitoring market structure. Waiting for A+ confluence before signaling.')
    return lines
  }, [trading])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%' }}>
      <TabBar tabs={TRADING_TABS} active={tab} onChange={setTab} accent={accent} />

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {tab === 'Overview' && <>
          <MetricRow>
            <MetricCard label="Account Balance" value={fmt$(trading.accountBalance)} accent={accent} />
            <MetricCard label="Daily P&L"
              value={fmt$(trading.dailyPL)}
              sub={trading.dailyPL >= 0 ? '▲ profitable' : '▼ drawdown'}
              accent={trading.dailyPL >= 0 ? '#10b981' : '#ef4444'} />
            <MetricCard label="Win Rate" value={fmtPct(trading.winRate)} accent="#10b981" />
            <MetricCard label="Open Trades" value={String(trading.openTrades)} accent={accent} />
          </MetricRow>
          <MetricRow>
            <MetricCard label="Closed Today" value={String(trading.closedTrades)} accent="#6b7280" small />
            <MetricCard label="Wins / Losses" value={`${trading.wins}W ${trading.losses}L`} accent="#f59e0b" small />
            <MetricCard label="Drawdown" value={fmtPct(trading.drawdown)} accent="#f59e0b" small />
            <MetricCard label="Risk Level" value={trading.riskLevel.toUpperCase()} accent={
              trading.riskLevel === 'high' ? '#ef4444' : trading.riskLevel === 'medium' ? '#f59e0b' : '#10b981'
            } small />
          </MetricRow>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 12px',
          }}>
            <div style={{ fontSize: 11, color: '#6b7280' }}>Market Mood:</div>
            <Pill label={trading.marketMood.toUpperCase()} color={
              trading.marketMood === 'bullish' ? '#10b981' :
              trading.marketMood === 'bearish' ? '#ef4444' :
              trading.marketMood === 'volatile' ? '#f59e0b' : '#6b7280'
            } />
            <div style={{ fontSize: 10, color: '#8892a4', flex: 1 }}>{trading.traderAction}</div>
          </div>

          <SectionHead label="Recent Activity" accent={accent} />
          {tradeEvents.slice(0, 5).map(e => (
            <ActivityRow key={e.id} message={e.message} type={e.type} timeLabel={e.timeLabel} />
          ))}
          {tradeEvents.length === 0 && (
            <div style={{ fontSize: 10, color: '#3a4858', fontStyle: 'italic', padding: '8px 0' }}>
              Waiting for market open…
            </div>
          )}

          <AIInsight lines={hulkLines} agent="Hulk" agentColor="#10b981" />
        </>}

        {tab === '📡 Live' && (
          <LiveTradesPanel accent={accent} />
        )}

        {tab === 'Signals' && <>
          <SectionHead label="Live Signal Feed" accent={accent} />
          {tradeEvents.length === 0 && (
            <div style={{ fontSize: 10, color: '#3a4858', fontStyle: 'italic', padding: 12 }}>
              No signals yet — scanning market structure…
            </div>
          )}
          {tradeEvents.map((e, i) => (
            <div key={e.id} style={{
              background: 'rgba(255,255,255,0.03)', border: `1px solid ${accent}18`,
              borderRadius: 8, padding: '8px 12px',
              borderLeft: `3px solid ${accent}`,
              opacity: 1 - i * 0.06,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <div style={{ fontSize: 9, color: '#3a4858' }}>{e.timeLabel}</div>
                <Pill label={e.type.toUpperCase()} color={accent} />
              </div>
              <div style={{ fontSize: 10, color: '#c0cce0', lineHeight: 1.5 }}>{e.message}</div>
            </div>
          ))}

          <SectionHead label="Agent Conversations" accent={accent} />
          {convo.filter(c => c.type === 'trading' || c.type === 'risk').slice(0, 4).map(c => (
            <div key={c.id} style={{
              background: 'rgba(255,255,255,0.03)', border: `1px solid ${accent}15`,
              borderRadius: 8, padding: '8px 12px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#d0d8e8' }}>{c.title}</div>
                <Pill label={c.outcome} color={
                  c.outcome === 'completed' ? '#10b981' :
                  c.outcome === 'executing' ? '#3b82f6' : '#6b7280'
                } />
              </div>
              <div style={{ fontSize: 9, color: '#4a5568', marginTop: 2 }}>{c.timeLabel}</div>
            </div>
          ))}
        </>}

        {tab === 'Positions' && <>
          <SectionHead label={`Open Positions (${openTrades.length})`} accent={accent} />
          {openTrades.length === 0 ? (
            <div style={{
              background: 'rgba(255,255,255,0.02)', border: `1px solid rgba(255,255,255,0.06)`,
              borderRadius: 10, padding: 20, textAlign: 'center',
            }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>📡</div>
              <div style={{ fontSize: 12, color: '#4a5568' }}>No open positions</div>
              <div style={{ fontSize: 10, color: '#3a4858', marginTop: 4 }}>
                Agents are scanning market structure for A+ setups…
              </div>
            </div>
          ) : (
            openTrades.map(t => <SignalCard key={t.id} trade={t} accent={accent} />)
          )}

          <SectionHead label="Recent Closed" accent={accent} />
          {closedTrades.slice(0, 6).map(t => <SignalCard key={t.id} trade={t} accent={accent} />)}
        </>}

        {tab === 'Journal' && <>
          <MetricRow>
            <MetricCard label="Total Trades" value={String(totalTrades)} accent={accent} />
            <MetricCard label="Wins" value={String(trading.wins)} accent="#10b981" />
            <MetricCard label="Losses" value={String(trading.losses)} accent="#ef4444" />
            <MetricCard label="Avg R:R" value={`1:${avgRR}`} accent="#f59e0b" />
          </MetricRow>

          <SectionHead label="Trade History" accent={accent} />
          {trading.recentTrades.length === 0 && (
            <div style={{ fontSize: 10, color: '#3a4858', fontStyle: 'italic', padding: 8 }}>
              No trades recorded yet.
            </div>
          )}
          {[...trading.recentTrades].reverse().map(t => (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'rgba(255,255,255,0.025)', border: `1px solid rgba(255,255,255,0.05)`,
              borderRadius: 8, padding: '8px 12px',
            }}>
              <div style={{
                width: 4, alignSelf: 'stretch', borderRadius: 2,
                background: t.status === 'won' ? '#10b981' : t.status === 'lost' ? '#ef4444' : accent,
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#e0e6f0' }}>{t.pair}</span>
                  <Pill label={t.direction.toUpperCase()} color={t.direction === 'long' ? '#10b981' : '#ef4444'} />
                </div>
                <div style={{ fontSize: 9, color: '#5a6880', marginTop: 2 }}>
                  Entry {t.entryPrice.toFixed(t.pair.includes('/') ? 5 : 2)}
                  {t.exitPrice ? ` → ${t.exitPrice.toFixed(t.pair.includes('/') ? 5 : 2)}` : ''}
                </div>
              </div>
              <div style={{
                fontSize: 13, fontWeight: 800,
                color: (t.pnl ?? 0) >= 0 ? '#10b981' : '#ef4444',
              }}>
                {t.pnl != null ? `${t.pnl >= 0 ? '+' : ''}${fmt$(t.pnl)}` : '—'}
              </div>
            </div>
          ))}
        </>}

        {tab === 'Analytics' && <>
          <MetricRow>
            <MetricCard label="Win Rate" value={fmtPct(trading.winRate)} accent="#10b981" />
            <MetricCard label="Avg R:R" value={`1:${avgRR}`} accent="#f59e0b" />
            <MetricCard label="Profit Factor" value={trading.wins > 0 ? (trading.wins / Math.max(trading.losses, 1) * 1.6).toFixed(2) : '—'} accent={accent} />
            <MetricCard label="Expectancy" value={trading.wins > 0 ? fmt$((trading.dailyPL / Math.max(totalTrades, 1))) : '—'} accent={accent} />
          </MetricRow>

          <SectionHead label="Win / Loss Breakdown" accent={accent} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ProgressBar pct={trading.winRate} color="#10b981" label={`Wins ${trading.wins}`} />
            <ProgressBar pct={100 - trading.winRate} color="#ef4444" label={`Losses ${trading.losses}`} />
            <ProgressBar pct={100 - trading.drawdown} color={accent} label={`Drawdown Recovery ${fmtPct(100 - trading.drawdown)}`} />
          </div>

          <SectionHead label="Account Performance" accent={accent} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { label: 'Account Balance', val: fmt$(trading.accountBalance), color: accent },
              { label: 'Daily P&L', val: fmt$(trading.dailyPL), color: trading.dailyPL >= 0 ? '#10b981' : '#ef4444' },
              { label: 'Max Drawdown', val: fmtPct(trading.drawdown), color: '#f59e0b' },
              { label: 'Risk Level', val: trading.riskLevel.toUpperCase(), color: trading.riskLevel === 'high' ? '#ef4444' : '#f59e0b' },
              { label: 'Market Mood', val: trading.marketMood.toUpperCase(), color: '#6b7280' },
            ].map(row => (
              <div key={row.label} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '6px 10px', background: 'rgba(255,255,255,0.025)',
                borderRadius: 6, fontSize: 10,
              }}>
                <span style={{ color: '#5a6880' }}>{row.label}</span>
                <span style={{ color: row.color, fontWeight: 700 }}>{row.val}</span>
              </div>
            ))}
          </div>

          <AIInsight lines={hulkLines} agent="Hulk" agentColor="#10b981" />
        </>}

        {tab === 'Agents' && <>
          <SectionHead label="Trading Team" accent={accent} />
          {agents.length === 0 && (
            <div style={{ fontSize: 10, color: '#3a4858', fontStyle: 'italic' }}>
              No agents assigned to this building.
            </div>
          )}
          {agents.map(a => (
            <AgentMini key={a.id} agent={a} accent={accent}
              task={a.state === 'working' ? (a.taskName ?? 'On task') : undefined} />
          ))}
        </>}

      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ETSY OPERATIONS PANEL
// ─────────────────────────────────────────────────────────────────────────────

const ETSY_TABS = ['Overview', 'Products', 'Pipeline', 'Revenue', 'Agents']

const STAGE_ORDER: EtsyProduct['stage'][] = ['idea', 'design', 'qc', 'listing', 'selling']
const STAGE_LABELS: Record<EtsyProduct['stage'], string> = {
  idea: '💡 Idea', design: '✏️ Design', qc: '✅ QC', listing: '📤 Listing', selling: '🟢 Live',
}
const STAGE_COLORS: Record<EtsyProduct['stage'], string> = {
  idea: '#9b59b6', design: '#e91e8c', qc: '#27ae60', listing: '#f39c12', selling: '#10b981',
}

function ProductRow({ product, accent }: { product: EtsyProduct; accent: string }) {
  const trendColor = product.trend === 'hot' ? '#f59e0b' : product.trend === 'cooling' ? '#ef4444' : '#6b7280'
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: `1px solid rgba(255,255,255,0.06)`,
      borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#d0d8e8' }}>{product.name}</span>
          <Pill label={product.category} color={accent} />
          <Pill label={product.trend === 'hot' ? '🔥 Hot' : product.trend === 'cooling' ? '📉 Cooling' : '→ Normal'} color={trendColor} />
        </div>
        <div style={{ fontSize: 9, color: '#4a5568', marginTop: 2 }}>
          {product.salesCount} sales · {fmtN(product.views)} views · ⭐ {product.rating.toFixed(1)}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#10b981' }}>{fmt$(product.revenue)}</div>
        <div style={{ fontSize: 9, color: '#4a5568' }}>${product.price.toFixed(2)} each</div>
      </div>
    </div>
  )
}

function PipelineProduct({ product }: { product: EtsyProduct }) {
  const color = STAGE_COLORS[product.stage]
  return (
    <div style={{
      background: 'rgba(255,255,255,0.025)', border: `1px solid ${color}25`,
      borderRadius: 8, padding: '8px 12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Pill label={STAGE_LABELS[product.stage]} color={color} />
        <span style={{ fontSize: 10, color: '#c0cce0', flex: 1 }}>{product.name}</span>
        <span style={{ fontSize: 9, color: '#4a5568' }}>${product.price.toFixed(2)}</span>
      </div>
      <ProgressBar pct={product.stageProgress} color={color} />
      <div style={{ fontSize: 8, color: '#3a4858', marginTop: 3 }}>
        {Math.round(product.stageProgress)}% through {product.stage} stage
      </div>
    </div>
  )
}

function EtsyOpsPanel({ agents, accent }: { agents: Agent[]; accent: string }) {
  const [tab, setTab] = useState('Overview')
  const creative = useSimStore(s => s.creative)
  const eventLog  = useSimStore(s => s.eventLog)

  const liveProducts    = useMemo(() => creative.products.filter(p => p.stage === 'selling'), [creative])
  const pipeProducts    = useMemo(() => creative.products.filter(p => p.stage !== 'selling'), [creative])
  const topProducts     = useMemo(() => [...liveProducts].sort((a, b) => b.revenue - a.revenue), [liveProducts])
  const creativeEvents  = useMemo(() => eventLog.filter(e => e.type === 'creative' || e.type === 'success').slice(-10).reverse(), [eventLog])

  const totalRevenue  = useMemo(() => liveProducts.reduce((s, p) => s + p.revenue, 0), [liveProducts])
  const totalSales    = useMemo(() => liveProducts.reduce((s, p) => s + p.salesCount, 0), [liveProducts])

  const agentTasks: Record<string, string> = {
    research_agent: `Researching: ${creative.currentTrend ?? 'trending niches'}`,
    design_agent:   pipeProducts.find(p => p.stage === 'design')
      ? `Designing: ${pipeProducts.find(p => p.stage === 'design')!.name}`
      : 'Design queue clear',
    qc_agent:       pipeProducts.find(p => p.stage === 'qc')
      ? `QC check: ${pipeProducts.find(p => p.stage === 'qc')!.name}`
      : 'QC queue clear',
    upload_agent:   pipeProducts.find(p => p.stage === 'listing')
      ? `Uploading: ${pipeProducts.find(p => p.stage === 'listing')!.name}`
      : 'Upload queue clear',
  }

  const antManLines = useMemo(() => {
    const lines = []
    if (creative.currentTrend) lines.push(`Trending niche: "${creative.currentTrend}" — ${creative.trendMultiplier.toFixed(1)}× sales multiplier active.`)
    if (topProducts.length > 0) lines.push(`Top performer: "${topProducts[0].name}" — ${fmt$(topProducts[0].revenue)} revenue.`)
    if (creative.starSellerPct > 60) lines.push(`Star Seller at ${Math.round(creative.starSellerPct)}% — maintain response rate and ship time.`)
    if (pipeProducts.length > 0) lines.push(`${pipeProducts.length} product${pipeProducts.length > 1 ? 's' : ''} in pipeline. Keep Dani → Quinn → Uly flowing.`)
    return lines
  }, [creative, topProducts, pipeProducts])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%' }}>
      <TabBar tabs={ETSY_TABS} active={tab} onChange={setTab} accent={accent} />

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {tab === 'Overview' && <>
          <MetricRow>
            <MetricCard label="Daily Revenue" value={fmt$(creative.dailyRevenue)} accent={accent} />
            <MetricCard label="Daily Profit" value={fmt$(creative.dailyProfit)}
              sub={creative.dailyProfit >= 0 ? '▲ profitable' : '▼ net loss'}
              accent={creative.dailyProfit >= 0 ? '#10b981' : '#ef4444'} />
            <MetricCard label="Lifetime Profit" value={fmt$(creative.lifetimeProfit)} accent={accent} />
            <MetricCard label="Total Sales" value={fmtN(creative.mockSales)} accent="#f59e0b" />
          </MetricRow>
          <MetricRow>
            <MetricCard label="Live Products" value={String(liveProducts.length)} accent="#10b981" small />
            <MetricCard label="In Pipeline" value={String(pipeProducts.length)} accent="#9b59b6" small />
            <MetricCard label="Shop Rating" value={`⭐ ${creative.shopRating.toFixed(1)}`} accent="#f59e0b" small />
            <MetricCard label="Reviews" value={fmtN(creative.totalReviews)} accent="#6b7280" small />
          </MetricRow>

          <div style={{
            background: 'rgba(255,255,255,0.03)', border: `1px solid ${accent}20`,
            borderRadius: 8, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{ fontSize: 16 }}>🔥</div>
            <div>
              <div style={{ fontSize: 9, color: '#4a5568', textTransform: 'uppercase', letterSpacing: 0.8 }}>Trending Niche</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#e0e6f0' }}>{creative.currentTrend}</div>
              <div style={{ fontSize: 9, color: accent }}>{creative.trendMultiplier.toFixed(1)}× sales multiplier</div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 9, color: '#4a5568', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>
              Star Seller Progress
            </div>
            <ProgressBar pct={creative.starSellerPct} color="#f59e0b" />
            <div style={{ fontSize: 8, color: '#3a4858', marginTop: 3 }}>
              {Math.round(creative.starSellerPct)}% toward Star Seller badge
            </div>
          </div>

          <SectionHead label="Recent Activity" accent={accent} />
          {creativeEvents.slice(0, 5).map(e => (
            <ActivityRow key={e.id} message={e.message} type={e.type} timeLabel={e.timeLabel} />
          ))}

          <AIInsight lines={antManLines} agent="Ant-Man" agentColor={accent} />
        </>}

        {tab === 'Products' && <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 10, color: '#4a5568' }}>
              {liveProducts.length} live listing{liveProducts.length !== 1 ? 's' : ''} · {fmt$(totalRevenue)} total revenue · {fmtN(totalSales)} sales
            </div>
          </div>
          {liveProducts.length === 0 && (
            <div style={{ fontSize: 10, color: '#3a4858', fontStyle: 'italic', padding: 8 }}>
              No live products yet — pipeline is filling…
            </div>
          )}
          {topProducts.map(p => <ProductRow key={p.id} product={p} accent={accent} />)}
        </>}

        {tab === 'Pipeline' && <>
          <SectionHead label={`Active Pipeline (${pipeProducts.length} products)`} accent={accent} />

          {pipeProducts.length === 0 && (
            <div style={{ textAlign: 'center', padding: 20 }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>🏭</div>
              <div style={{ fontSize: 11, color: '#4a5568' }}>Pipeline clear — Reya is researching next batch</div>
            </div>
          )}

          {STAGE_ORDER.filter(s => s !== 'selling').map(stage => {
            const inStage = pipeProducts.filter(p => p.stage === stage)
            if (inStage.length === 0) return null
            return (
              <div key={stage}>
                <SectionHead label={`${STAGE_LABELS[stage]} (${inStage.length})`} accent={STAGE_COLORS[stage]} />
                {inStage.map(p => <PipelineProduct key={p.id} product={p} />)}
              </div>
            )
          })}

          <SectionHead label="Pipeline Flow" accent={accent} />
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 4, flexWrap: 'wrap', padding: '8px 0',
          }}>
            {(['Reya', '→', 'Dani', '→', 'Quinn', '→', 'Uly'] as string[]).map((item, i) => (
              item === '→'
                ? <div key={i} style={{ color: '#3a4858', fontSize: 16 }}>→</div>
                : <div key={i} style={{
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6, padding: '4px 10px', fontSize: 10, fontWeight: 700, color: '#c0cce0',
                  }}>
                    {item}
                  </div>
            ))}
          </div>
        </>}

        {tab === 'Revenue' && <>
          <MetricRow>
            <MetricCard label="Total Revenue" value={fmt$(totalRevenue)} accent={accent} />
            <MetricCard label="Daily Revenue" value={fmt$(creative.dailyRevenue)} accent={accent} />
            <MetricCard label="Daily Expenses" value={fmt$(creative.dailyExpenses)} accent="#ef4444" />
            <MetricCard label="Net Profit" value={fmt$(creative.lifetimeProfit)} accent="#10b981" />
          </MetricRow>

          <SectionHead label="Top Products by Revenue" accent={accent} />
          {topProducts.slice(0, 8).map((p, i) => (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '6px 10px', background: 'rgba(255,255,255,0.025)', borderRadius: 6,
            }}>
              <div style={{ fontSize: 11, color: '#3a4858', width: 20, textAlign: 'right' }}>#{i + 1}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: '#c0cce0', fontWeight: 600 }}>{p.name}</div>
                <ProgressBar pct={totalRevenue > 0 ? (p.revenue / totalRevenue) * 100 : 0} color={accent} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#10b981' }}>{fmt$(p.revenue)}</div>
            </div>
          ))}

          <SectionHead label="Revenue by Category" accent={accent} />
          {Array.from(new Set(liveProducts.map(p => p.category))).map(cat => {
            const catRev = liveProducts.filter(p => p.category === cat).reduce((s, p) => s + p.revenue, 0)
            return (
              <div key={cat} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '6px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 6,
              }}>
                <div>
                  <div style={{ fontSize: 10, color: '#c0cce0' }}>{cat}</div>
                  <ProgressBar pct={totalRevenue > 0 ? (catRev / totalRevenue) * 100 : 0} color={accent} />
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#10b981', marginLeft: 12 }}>{fmt$(catRev)}</div>
              </div>
            )
          })}
        </>}

        {tab === 'Agents' && <>
          <SectionHead label="Creative Pipeline Team" accent={accent} />
          {agents.map(a => (
            <AgentMini key={a.id} agent={a} accent={accent}
              task={agentTasks[a.id] ?? (a.taskName ?? undefined)} />
          ))}

          <SectionHead label="Pipeline Status" accent={accent} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { name: 'Reya', role: '🔍 Research', status: creative.recentIdeas.length > 0 ? `${creative.recentIdeas.length} ideas queued` : 'Scanning niches', color: '#9b59b6' },
              { name: 'Dani', role: '✏️ Design', status: pipeProducts.find(p => p.stage === 'design') ? `Working on: ${pipeProducts.find(p => p.stage === 'design')!.name}` : 'Idle — awaiting brief', color: '#e91e8c' },
              { name: 'Quinn', role: '✅ QC', status: pipeProducts.find(p => p.stage === 'qc') ? `Reviewing: ${pipeProducts.find(p => p.stage === 'qc')!.name}` : 'Queue clear', color: '#27ae60' },
              { name: 'Uly', role: '📤 Upload', status: pipeProducts.find(p => p.stage === 'listing') ? `Listing: ${pipeProducts.find(p => p.stage === 'listing')!.name}` : 'Queue clear', color: '#f39c12' },
            ].map(row => (
              <div key={row.name} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', background: `${row.color}10`,
                border: `1px solid ${row.color}25`, borderRadius: 8,
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', background: row.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 800, color: '#fff', flexShrink: 0,
                }}>
                  {row.name[0]}
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#d0d8e8' }}>{row.name} — {row.role}</div>
                  <div style={{ fontSize: 9, color: '#6a7890' }}>{row.status}</div>
                </div>
              </div>
            ))}
          </div>
        </>}

      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AVENGERS HQ COMMAND PANEL
// ─────────────────────────────────────────────────────────────────────────────

const HQ_TABS = ['Overview', 'Team', 'Command']

function HQCommandPanel({ agents, accent }: { agents: Agent[]; accent: string }) {
  const [tab, setTab] = useState('Overview')
  const trading    = useSimStore(s => s.trading)
  const creative   = useSimStore(s => s.creative)
  const eventLog   = useSimStore(s => s.eventLog)
  const convo      = useSimStore(s => s.conversations)
  const totalCash  = useSimStore(s => s.totalCash)
  const allAgents  = useSimStore(s => s.agents)

  const recentAll = useMemo(() => eventLog.slice(-10).reverse(), [eventLog])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%' }}>
      <TabBar tabs={HQ_TABS} active={tab} onChange={setTab} accent={accent} />

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {tab === 'Overview' && <>
          <SectionHead label="Company Dashboard" accent={accent} />
          <MetricRow>
            <MetricCard label="Total Cash" value={fmt$(totalCash)} accent={accent} />
            <MetricCard label="Trading P&L" value={fmt$(trading.dailyPL)}
              accent={trading.dailyPL >= 0 ? '#10b981' : '#ef4444'} />
            <MetricCard label="Etsy Revenue" value={fmt$(creative.dailyRevenue)} accent="#f97316" />
            <MetricCard label="Active Agents" value={String(allAgents.filter(a => a.state === 'working' || a.state === 'at_work').length)} accent={accent} />
          </MetricRow>
          <MetricRow>
            <MetricCard label="Trading Win Rate" value={fmtPct(trading.winRate)} accent="#3b82f6" small />
            <MetricCard label="Live Products" value={String(creative.products.filter(p => p.stage === 'selling').length)} accent="#f97316" small />
            <MetricCard label="Shop Rating" value={`⭐ ${creative.shopRating.toFixed(1)}`} accent="#f59e0b" small />
            <MetricCard label="Total Agents" value={String(allAgents.length)} accent={accent} small />
          </MetricRow>

          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 9, color: '#3b82f6', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Trading</div>
              <Pill label={trading.marketMood.toUpperCase()} color={
                trading.marketMood === 'bullish' ? '#10b981' : trading.marketMood === 'bearish' ? '#ef4444' : '#6b7280'
              } />
              <div style={{ fontSize: 9, color: '#4a5568', marginTop: 4 }}>{trading.traderAction}</div>
            </div>
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(249,115,22,0.2)', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 9, color: '#f97316', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Etsy</div>
              <Pill label={creative.currentTrend} color="#f97316" />
              <div style={{ fontSize: 9, color: '#4a5568', marginTop: 4 }}>{creative.trendMultiplier.toFixed(1)}× sales multiplier active</div>
            </div>
          </div>

          <SectionHead label="All Recent Activity" accent={accent} />
          {recentAll.map(e => (
            <ActivityRow key={e.id} message={e.message} type={e.type} timeLabel={e.timeLabel} />
          ))}
        </>}

        {tab === 'Team' && <>
          {(['trading_office', 'creative_studio', 'avengers_hq', 'hq_quarters'] as const).map(bid => {
            const grp = allAgents.filter(a => a.workBuilding === bid || a.homeBuilding === bid)
            if (grp.length === 0) return null
            const names: Record<string, string> = {
              trading_office: '📊 Trading Office',
              creative_studio: '🎨 Creative Studio',
              avengers_hq: '⚡ Avengers HQ',
              hq_quarters: '🛡️ HQ Quarters',
            }
            return (
              <div key={bid}>
                <SectionHead label={names[bid] ?? bid} accent={accent} />
                {grp.map(a => (
                  <AgentMini key={a.id} agent={a} accent={accent}
                    task={a.taskName ?? undefined} />
                ))}
              </div>
            )
          })}
        </>}

        {tab === 'Command' && <>
          <SectionHead label="Nick Fury Directives" accent={accent} />
          {convo.filter(c => c.messages.some(m => m.agentId === 'fury')).slice(0, 6).map(c => (
            <div key={c.id} style={{
              background: `${accent}08`, border: `1px solid ${accent}20`,
              borderRadius: 8, padding: '8px 12px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#d0d8e8' }}>{c.title}</span>
                <Pill label={c.outcome} color={c.outcome === 'completed' ? '#10b981' : accent} />
              </div>
              {c.finalDecision && (
                <div style={{ fontSize: 9, color: '#8892a4', fontStyle: 'italic' }}>"{c.finalDecision}"</div>
              )}
              <div style={{ fontSize: 8, color: '#3a4858', marginTop: 3 }}>{c.timeLabel}</div>
            </div>
          ))}
          {convo.filter(c => c.messages.some(m => m.agentId === 'fury')).length === 0 && (
            <div style={{ fontSize: 10, color: '#3a4858', fontStyle: 'italic', padding: 8 }}>
              Awaiting Fury briefings…
            </div>
          )}

          <SectionHead label="All Conversations" accent={accent} />
          {convo.slice(0, 10).map(c => (
            <div key={c.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '6px 10px', background: 'rgba(255,255,255,0.025)', borderRadius: 6,
            }}>
              <div>
                <div style={{ fontSize: 10, color: '#c0cce0' }}>{c.title}</div>
                <div style={{ fontSize: 8, color: '#3a4858' }}>{c.timeLabel} · {c.messages.length} messages</div>
              </div>
              <Pill label={c.type} color={accent} />
            </div>
          ))}
        </>}

      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// RESIDENTIAL PANEL
// ─────────────────────────────────────────────────────────────────────────────

function ResidentialPanel({ agents, accent, buildingId }: { agents: Agent[]; accent: string; buildingId: string }) {
  const [tab, setTab] = useState('Residents')
  const eventLog = useSimStore(s => s.eventLog)

  const residentEvents = useMemo(() =>
    eventLog.slice(-15).reverse(),
  [eventLog])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%' }}>
      <TabBar tabs={['Residents', 'Activity']} active={tab} onChange={setTab} accent={accent} />

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {tab === 'Residents' && <>
          <SectionHead label={`Residents (${agents.length})`} accent={accent} />
          {agents.length === 0 && (
            <div style={{ fontSize: 10, color: '#3a4858', fontStyle: 'italic', padding: 8 }}>
              Building is empty right now.
            </div>
          )}
          {agents.map(a => (
            <div key={a.id} style={{
              background: 'rgba(255,255,255,0.03)', border: `1px solid ${a.color}25`,
              borderRadius: 8, padding: '10px 12px',
            }}>
              <AgentMini agent={a} accent={accent} />
              {a.energy !== undefined && (
                <div style={{ marginTop: 8 }}>
                  <ProgressBar pct={a.energy} color={a.energy > 60 ? '#10b981' : a.energy > 30 ? '#f59e0b' : '#ef4444'} label={`Energy: ${Math.round(a.energy)}%`} />
                </div>
              )}
            </div>
          ))}
        </>}

        {tab === 'Activity' && <>
          <SectionHead label="Recent Log" accent={accent} />
          {residentEvents.map(e => (
            <ActivityRow key={e.id} message={e.message} type={e.type} timeLabel={e.timeLabel} />
          ))}
        </>}

      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN DISPATCHER
// ─────────────────────────────────────────────────────────────────────────────

export default function BuildingOperationPanel() {
  const selectedBuildingId = useSimStore(s => s.selectedBuildingId)
  const selectBuilding     = useSimStore(s => s.selectBuilding)
  const agents             = useSimStore(s => s.agents)
  const worldMap           = useSimStore(s => s.worldMap)

  if (!selectedBuildingId) return null

  const building = worldMap.buildings.find(b => b.id === selectedBuildingId)
  if (!building) return null

  const accent = BUILDING_ACCENT[selectedBuildingId] ?? '#6366f1'

  const buildingAgents = agents.filter(
    a => a.workBuilding === selectedBuildingId || a.homeBuilding === selectedBuildingId
  )

  const panelTitles: Record<string, string> = {
    trading_office:  'Trading Operations Center',
    avengers_hq:     'Avengers HQ Command',
    creative_studio: 'Etsy Operations Center',
    home1:           'Residential — Team Home',
    home2:           'Residential — Trader Home',
    hq_quarters:     'HQ Quarters',
  }

  function renderPanel() {
    switch (selectedBuildingId) {
      case 'trading_office':
        return <TradingOpsPanel agents={buildingAgents} accent={accent} />
      case 'avengers_hq':
        return <HQCommandPanel agents={buildingAgents} accent={accent} />
      case 'creative_studio':
        return <EtsyOpsPanel agents={buildingAgents} accent={accent} />
      default:
        return <ResidentialPanel agents={buildingAgents} accent={accent} buildingId={selectedBuildingId!} />
    }
  }

  return (
    <>
      <AgentChatModal />
      <style>{`
        @keyframes opSlideIn {
          from { opacity: 0; transform: scale(0.97) translateY(8px); }
          to   { opacity: 1; transform: none; }
        }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={() => selectBuilding(null)}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.78)',
          backdropFilter: 'blur(4px)',
          zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }}
      >
        {/* Panel */}
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: 'linear-gradient(160deg, #0a0e1a 0%, #0d1117 100%)',
            border: `1px solid ${accent}35`,
            borderRadius: 16,
            width: '100%', maxWidth: 900,
            height: '90vh',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: `0 0 80px ${accent}18, 0 24px 64px rgba(0,0,0,0.7)`,
            animation: 'opSlideIn 0.2s ease',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '14px 20px',
            background: `linear-gradient(90deg, ${accent}15, transparent)`,
            borderBottom: `1px solid ${accent}20`,
            display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
          }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%', background: accent,
              boxShadow: `0 0 14px ${accent}`,
            }} />
            <div>
              <div style={{
                fontSize: 14, fontWeight: 800,
                background: `linear-gradient(90deg, #fff 40%, ${accent})`,
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>
                {panelTitles[selectedBuildingId] ?? building.name}
              </div>
              <div style={{ fontSize: 9, color: '#3a5060', marginTop: 1 }}>
                {building.name} · {buildingAgents.length} agent{buildingAgents.length !== 1 ? 's' : ''}
              </div>
            </div>

            <div style={{ flex: 1 }} />

            {/* Agent avatars */}
            <div style={{ display: 'flex' }}>
              {buildingAgents.slice(0, 8).map((a, i) => (
                <div key={a.id} style={{
                  width: 26, height: 26, borderRadius: '50%',
                  background: `radial-gradient(circle at 35% 35%, ${a.accentColor}, ${a.color})`,
                  border: '2px solid #0a0e1a',
                  marginLeft: i > 0 ? -8 : 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, zIndex: 10 - i,
                  boxShadow: `0 0 8px ${a.color}40`,
                }}>
                  {a.emoji ?? a.name[0]}
                </div>
              ))}
            </div>

            <button
              onClick={() => selectBuilding(null)}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 6, color: '#6b7280', cursor: 'pointer',
                width: 28, height: 28, fontSize: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s', flexShrink: 0,
              }}
            >
              ✕
            </button>
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflow: 'hidden', padding: 16, display: 'flex', flexDirection: 'column' }}>
            {renderPanel()}
          </div>
        </div>
      </div>
    </>
  )
}
