import { useState, useEffect } from 'react'
import { useSimStore } from './store'
import { getTzAbbr, clockString } from './engine/TimeSystem'
import WorldCanvas from './components/WorldCanvas'
import AgentInspector from './components/AgentInspector'
import ProfitPanel from './components/ProfitPanel'
import TradingPanel from './components/TradingPanel'
import EventLog from './components/EventLog'
import HQPanel from './components/HQPanel'
import CommandPanel from './components/CommandPanel'
import UpgradesPanel from './components/UpgradesPanel'
import LaunchPlanPanel from './components/LaunchPlanPanel'
import N8nPlanPanel from './components/N8nPlanPanel'

// ── Toolbar ───────────────────────────────────────────────────────────────────

const TZ_ABBR = getTzAbbr()

function Toolbar() {
  const time        = useSimStore(s => s.time)
  const togglePause = useSimStore(s => s.togglePause)
  const save        = useSimStore(s => s.save)
  const load        = useSimStore(s => s.load)
  const reset       = useSimStore(s => s.reset)
  const agents      = useSimStore(s => s.agents)

  // Tick the seconds hand every second for live clock display
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const avengersActive = agents.filter(a => a.isAvenger && a.state === 'working').length
  const totalAvengers  = agents.filter(a => a.isAvenger).length

  const btn = (active = false): React.CSSProperties => ({
    padding: '3px 9px', borderRadius: 5, border: 'none',
    background: active ? '#3a4bff' : '#1e2130',
    color: '#e0e6f0', cursor: 'pointer', fontSize: 10, fontWeight: 600,
  })

  return (
    <div style={{
      height: 40, background: 'rgba(4,6,14,0.99)',
      borderBottom: '1px solid rgba(0,212,255,0.1)',
      display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', flexShrink: 0,
    }}>
      <span style={{ fontSize: 14, fontWeight: 700, background: 'linear-gradient(90deg,#00d4ff,#7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: 1, marginRight: 4 }}>
        🌍 SimWorld
      </span>

      {/* Real-time clock */}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 130 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#f5c842', lineHeight: 1.2 }}>
          🕐 {clockString(time)}
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 8, color: '#6a7890', lineHeight: 1 }}>
          {TZ_ABBR} · Op Day {time.day}
        </span>
      </div>

      <button style={btn(time.paused)} onClick={togglePause}>
        {time.paused ? '▶ Resume' : '⏸ Pause'}
      </button>

      {/* Real-time badge */}
      <div style={{
        padding: '2px 7px', borderRadius: 4, fontSize: 9, fontWeight: 700,
        background: 'rgba(16,185,129,0.12)', color: '#10b981',
        border: '1px solid rgba(16,185,129,0.25)', letterSpacing: 0.5,
      }}>
        ⏱ REAL-TIME
      </div>

      {/* Agents pill */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 5, padding: '2px 8px',
        border: '1px solid rgba(124,58,237,0.3)', borderRadius: 4,
        background: 'rgba(124,58,237,0.06)',
      }}>
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981' }} />
        <span style={{ fontSize: 9, color: '#a78bfa', fontFamily: 'monospace' }}>
          🛡️ {avengersActive}/{totalAvengers} on duty
        </span>
      </div>

      <div style={{ flex: 1 }} />
      <button style={btn()} onClick={save}>💾 Save</button>
      <button style={btn()} onClick={load}>📂 Load</button>
      <button
        style={{ ...btn(), background: '#2a1010', color: '#e74c3c' }}
        onClick={() => { if (confirm('Reset simulation?')) reset() }}
      >
        ↺ Reset
      </button>
    </div>
  )
}

// ── Sidebar tabs ──────────────────────────────────────────────────────────────

type Tab = 'agents' | 'profit' | 'upgrades' | 'trading' | 'hq' | 'command' | 'launch'

const TAB_LABELS: Record<Tab, string> = {
  agents:  '👥',
  profit:  '📊',
  upgrades:'🔧',
  trading: '📈',
  hq:      '🛡️',
  command: '⚡',
  launch:  '🧶',
}

const TAB_TITLES: Record<Tab, string> = {
  agents:  'Agents',
  profit:  'Profit',
  upgrades:'Upgrades',
  trading: 'Trading',
  hq:      'HQ',
  command: 'Command',
  launch:  'Launch',
}

// ── Launch sub-tabs (Etsy Plan | n8n Automation) ─────────────────────────────

function LaunchSubTabs() {
  const [sub, setSub] = useState<'etsy' | 'n8n'>('etsy')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, background: 'rgba(4,6,14,0.99)' }}>
        {([
          { id: 'etsy', label: '🧶 Etsy Plan' },
          { id: 'n8n',  label: '⚡ n8n Auto' },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            style={{
              flex: 1, border: 'none', padding: '6px 4px', fontSize: 9, fontWeight: 700,
              background: sub === t.id ? 'rgba(255,255,255,0.05)' : 'transparent',
              color: sub === t.id ? (t.id === 'n8n' ? '#00d4ff' : '#f97316') : '#3a4860',
              cursor: 'pointer',
              borderBottom: sub === t.id ? `2px solid ${t.id === 'n8n' ? '#00d4ff' : '#f97316'}` : '2px solid transparent',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {sub === 'etsy' ? <LaunchPlanPanel /> : <N8nPlanPanel />}
      </div>
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState<Tab>('hq')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', userSelect: 'none', overflow: 'hidden', background: '#020408' }}>
      <Toolbar />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* World canvas */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <WorldCanvas />
          </div>
          <EventLog />
        </div>

        {/* Right sidebar — fixed 280px */}
        <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', borderLeft: '1px solid rgba(0,212,255,0.08)', overflow: 'hidden' }}>
          {/* Tab strip */}
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, background: 'rgba(4,6,14,0.99)' }}>
            {(Object.keys(TAB_LABELS) as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                title={TAB_TITLES[t]}
                style={{
                  flex: 1, border: 'none', padding: '7px 2px',
                  background: tab === t ? 'rgba(255,255,255,0.05)' : 'transparent',
                  color: tab === t
                    ? (t === 'hq' ? '#a78bfa' : t === 'command' ? '#00d4ff' : t === 'launch' ? '#f97316' : t === 'upgrades' ? '#f5c842' : '#e0e6f0')
                    : '#3a4860',
                  fontSize: 14, cursor: 'pointer',
                  borderBottom: tab === t
                    ? `2px solid ${t === 'hq' ? '#7c3aed' : t === 'command' ? '#00d4ff' : t === 'launch' ? '#f97316' : t === 'upgrades' ? '#f5c842' : '#5060ff'}`
                    : '2px solid transparent',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                }}
              >
                {TAB_LABELS[t]}
                <span style={{ fontSize: 7, fontWeight: tab === t ? 700 : 400, letterSpacing: 0.5 }}>{TAB_TITLES[t]}</span>
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {tab === 'agents'   && <AgentInspector />}
            {tab === 'profit'   && <ProfitPanel />}
            {tab === 'upgrades' && <UpgradesPanel />}
            {tab === 'trading'  && <TradingPanel />}
            {tab === 'hq'       && <HQPanel />}
            {tab === 'command'  && <CommandPanel />}
            {tab === 'launch'   && <LaunchSubTabs />}
          </div>
        </div>
      </div>
    </div>
  )
}
