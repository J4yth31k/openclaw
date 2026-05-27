import { useState } from 'react'
import { useSimStore } from './store'
import WorldCanvas from './components/WorldCanvas'
import AgentInspector from './components/AgentInspector'
import ProfitPanel from './components/ProfitPanel'
import TradingPanel from './components/TradingPanel'
import EventLog from './components/EventLog'

// ── Toolbar ───────────────────────────────────────────────────────────────────

function Toolbar() {
  const time = useSimStore(s => s.time)
  const setSpeed   = useSimStore(s => s.setSpeed)
  const togglePause = useSimStore(s => s.togglePause)
  const save  = useSimStore(s => s.save)
  const load  = useSimStore(s => s.load)
  const reset = useSimStore(s => s.reset)

  const h = String(time.hour).padStart(2, '0')
  const m = String(Math.floor(time.minute)).padStart(2, '0')

  const btn = (active = false): React.CSSProperties => ({
    padding: '4px 10px', borderRadius: 6, border: 'none',
    background: active ? '#3a4bff' : '#2a2d3a',
    color: '#e0e6f0', cursor: 'pointer', fontSize: 11, fontWeight: 600,
  })

  return (
    <div style={{
      height: 40, background: 'rgba(10,12,20,0.98)', borderBottom: '1px solid #2a2d3a',
      display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', flexShrink: 0,
    }}>
      <span style={{ fontSize: 14, fontWeight: 700, color: '#7f8fff', letterSpacing: 1, marginRight: 6 }}>
        🌍 SimWorld
      </span>
      <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#f5c842', minWidth: 120 }}>
        🕐 Day {time.day} {h}:{m}
      </span>
      <button style={btn(time.paused)} onClick={togglePause}>
        {time.paused ? '▶ Play' : '⏸ Pause'}
      </button>
      <span style={{ color: '#4a5060', fontSize: 11 }}>Speed:</span>
      {[1, 2, 4, 8].map(spd => {
        const active = Math.round(800 / time.speed) === spd
        return <button key={spd} style={btn(active)} onClick={() => setSpeed(800 / spd)}>{spd}×</button>
      })}
      <div style={{ flex: 1 }} />
      <button style={btn()} onClick={save}>💾 Save</button>
      <button style={btn()} onClick={load}>📂 Load</button>
      <button
        style={{ ...btn(), background: '#3a1515', color: '#e74c3c' }}
        onClick={() => { if (confirm('Reset simulation?')) reset() }}
      >
        ↺ Reset
      </button>
    </div>
  )
}

// ── Sidebar tabs ──────────────────────────────────────────────────────────────

type Tab = 'agents' | 'profit' | 'trading'

const TAB_LABELS: Record<Tab, string> = {
  agents:  '👥 Agents',
  profit:  '📊 Profit',
  trading: '📈 Trading',
}

export default function App() {
  const [tab, setTab] = useState<Tab>('profit')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', userSelect: 'none', overflow: 'hidden' }}>
      <Toolbar />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* World canvas — takes all remaining horizontal space */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <WorldCanvas />
          </div>
          <EventLog />
        </div>

        {/* Right sidebar — fixed 270px */}
        <div style={{ width: 270, flexShrink: 0, display: 'flex', flexDirection: 'column', borderLeft: '1px solid #2a2d3a', overflow: 'hidden' }}>
          {/* Tab strip */}
          <div style={{ display: 'flex', borderBottom: '1px solid #2a2d3a', flexShrink: 0 }}>
            {(Object.keys(TAB_LABELS) as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex: 1, border: 'none', padding: '7px 4px',
                  background: tab === t ? 'rgba(255,255,255,0.07)' : 'transparent',
                  color: tab === t ? '#e0e6f0' : '#5a6070',
                  fontSize: 10, fontWeight: tab === t ? 700 : 400,
                  cursor: 'pointer', borderBottom: tab === t ? '2px solid #5060ff' : '2px solid transparent',
                }}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {tab === 'agents'  && <AgentInspector />}
            {tab === 'profit'  && <ProfitPanel />}
            {tab === 'trading' && <TradingPanel />}
          </div>
        </div>
      </div>
    </div>
  )
}
