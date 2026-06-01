import { useState, useEffect, useCallback } from 'react'
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
import BuildingModal from './components/BuildingModal'
import JournalPanel from './components/JournalPanel'
import ConversationViewer from './components/ConversationViewer'

// ── Mobile detection ──────────────────────────────────────────────────────────

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isMobile
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

const TZ_ABBR = getTzAbbr()

function Toolbar({ isMobile }: { isMobile: boolean }) {
  const time        = useSimStore(s => s.time)
  const togglePause = useSimStore(s => s.togglePause)
  const save        = useSimStore(s => s.save)
  const load        = useSimStore(s => s.load)
  const reset       = useSimStore(s => s.reset)
  const agents      = useSimStore(s => s.agents)
  const conversations = useSimStore(s => s.conversations)

  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const avengersActive = agents.filter(a => a.isAvenger && a.state === 'working').length
  const totalAvengers  = agents.filter(a => a.isAvenger).length

  const btn = (active = false): React.CSSProperties => ({
    padding: isMobile ? '3px 7px' : '3px 9px',
    borderRadius: 5, border: 'none',
    background: active ? '#3a4bff' : '#1e2130',
    color: '#e0e6f0', cursor: 'pointer',
    fontSize: isMobile ? 9 : 10, fontWeight: 600,
  })

  return (
    <div style={{
      height: 40, background: 'rgba(4,6,14,0.99)',
      borderBottom: '1px solid rgba(0,212,255,0.1)',
      display: 'flex', alignItems: 'center', gap: isMobile ? 5 : 8,
      padding: '0 10px', flexShrink: 0,
    }}>
      <span style={{
        fontSize: isMobile ? 12 : 14, fontWeight: 700,
        background: 'linear-gradient(90deg,#00d4ff,#7c3aed)',
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        letterSpacing: 1, marginRight: 2, whiteSpace: 'nowrap',
      }}>
        🌍 SimWorld
      </span>

      {/* Clock */}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: isMobile ? 100 : 130 }}>
        <span style={{ fontFamily: 'monospace', fontSize: isMobile ? 10 : 12, color: '#f5c842', lineHeight: 1.2 }}>
          🕐 {clockString(time)}
        </span>
        {!isMobile && (
          <span style={{ fontFamily: 'monospace', fontSize: 8, color: '#6a7890', lineHeight: 1 }}>
            {TZ_ABBR} · Op Day {time.day}
          </span>
        )}
      </div>

      <button style={btn(time.paused)} onClick={togglePause}>
        {time.paused ? '▶' : '⏸'}
        {!isMobile && (time.paused ? ' Resume' : ' Pause')}
      </button>

      {/* Live badge */}
      <div style={{
        padding: '2px 6px', borderRadius: 4, fontSize: 8, fontWeight: 700,
        background: 'rgba(16,185,129,0.12)', color: '#10b981',
        border: '1px solid rgba(16,185,129,0.25)', letterSpacing: 0.5,
        whiteSpace: 'nowrap',
      }}>
        ⏱ LIVE
      </div>

      {/* Agents pill */}
      {!isMobile && (
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
      )}

      {/* Conversation count badge */}
      {conversations.length > 0 && (
        <div style={{
          padding: '2px 7px', borderRadius: 4, fontSize: 8, fontWeight: 700,
          background: 'rgba(99,102,241,0.12)', color: '#a5b4fc',
          border: '1px solid rgba(99,102,241,0.25)', whiteSpace: 'nowrap',
        }}>
          💬 {conversations.length}
        </div>
      )}

      <div style={{ flex: 1 }} />
      {!isMobile && <button style={btn()} onClick={save}>💾 Save</button>}
      {!isMobile && <button style={btn()} onClick={load}>📂 Load</button>}
      <button
        style={{ ...btn(), background: '#2a1010', color: '#e74c3c', fontSize: 9 }}
        onClick={() => { if (confirm('Reset simulation?')) reset() }}
      >
        ↺{!isMobile && ' Reset'}
      </button>
    </div>
  )
}

// ── Sidebar tabs ──────────────────────────────────────────────────────────────

type Tab = 'agents' | 'profit' | 'upgrades' | 'trading' | 'hq' | 'command' | 'launch' | 'journal' | 'ops'

const TAB_LABELS: Record<Tab, string> = {
  agents:   '👥',
  profit:   '📊',
  upgrades: '🔧',
  trading:  '📈',
  hq:       '🛡️',
  command:  '⚡',
  launch:   '🧶',
  journal:  '💪',
  ops:      '💬',
}

const TAB_TITLES: Record<Tab, string> = {
  agents:   'Agents',
  profit:   'Profit',
  upgrades: 'Upgrades',
  trading:  'Trading',
  hq:       'HQ',
  command:  'Command',
  launch:   'Launch',
  journal:  'Journal',
  ops:      'Ops',
}

const TAB_ACCENT: Record<Tab, string> = {
  agents:   '#5060ff',
  profit:   '#5060ff',
  upgrades: '#f5c842',
  trading:  '#5060ff',
  hq:       '#7c3aed',
  command:  '#00d4ff',
  launch:   '#f97316',
  journal:  '#10b981',
  ops:      '#6366f1',
}

// ── Launch sub-tabs ───────────────────────────────────────────────────────────

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

// ── Tab content renderer ──────────────────────────────────────────────────────

function TabContent({ tab }: { tab: Tab }) {
  switch (tab) {
    case 'agents':   return <AgentInspector />
    case 'profit':   return <ProfitPanel />
    case 'upgrades': return <UpgradesPanel />
    case 'trading':  return <TradingPanel />
    case 'hq':       return <HQPanel />
    case 'command':  return <CommandPanel />
    case 'launch':   return <LaunchSubTabs />
    case 'journal':  return <JournalPanel />
    case 'ops':      return <ConversationViewer />
    default:         return null
  }
}

// ── Sidebar tab strip ─────────────────────────────────────────────────────────

function SidebarTabStrip({ tab, setTab, conversations }: {
  tab: Tab
  setTab: (t: Tab) => void
  conversations: number
}) {
  const tabs = Object.keys(TAB_LABELS) as Tab[]

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      flexShrink: 0, background: 'rgba(4,6,14,0.99)',
    }}>
      {tabs.map(t => (
        <button
          key={t}
          onClick={() => setTab(t)}
          title={TAB_TITLES[t]}
          style={{
            flex: 1, border: 'none', padding: '7px 2px',
            background: tab === t ? 'rgba(255,255,255,0.05)' : 'transparent',
            color: tab === t ? TAB_ACCENT[t] : '#3a4860',
            fontSize: 14, cursor: 'pointer',
            borderBottom: tab === t ? `2px solid ${TAB_ACCENT[t]}` : '2px solid transparent',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
            position: 'relative',
          }}
        >
          {TAB_LABELS[t]}
          <span style={{ fontSize: 7, fontWeight: tab === t ? 700 : 400, letterSpacing: 0.5 }}>
            {TAB_TITLES[t]}
          </span>
          {/* Badge for ops tab */}
          {t === 'ops' && conversations > 0 && (
            <span style={{
              position: 'absolute', top: 3, right: 3,
              background: '#6366f1', color: '#fff',
              fontSize: 7, fontWeight: 700,
              borderRadius: 4, padding: '0px 3px',
              lineHeight: 1.4, minWidth: 12, textAlign: 'center',
            }}>
              {conversations > 99 ? '99+' : conversations}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

// ── Mobile bottom navigation ──────────────────────────────────────────────────

function MobileBottomNav({ tab, setTab, conversations }: {
  tab: Tab
  setTab: (t: Tab) => void
  conversations: number
}) {
  // On mobile only show the most important tabs
  const mobileTabs: Tab[] = ['hq', 'ops', 'trading', 'journal', 'command']

  return (
    <div style={{
      height: 52, background: 'rgba(4,6,14,0.99)',
      borderTop: '1px solid rgba(255,255,255,0.08)',
      display: 'flex', flexShrink: 0,
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      {mobileTabs.map(t => (
        <button
          key={t}
          onClick={() => setTab(t)}
          style={{
            flex: 1, border: 'none', padding: '6px 2px 4px',
            background: 'transparent',
            color: tab === t ? TAB_ACCENT[t] : '#4a5870',
            cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            position: 'relative',
            borderTop: tab === t ? `2px solid ${TAB_ACCENT[t]}` : '2px solid transparent',
          }}
        >
          <span style={{ fontSize: 18 }}>{TAB_LABELS[t]}</span>
          <span style={{ fontSize: 8, fontWeight: tab === t ? 700 : 400 }}>{TAB_TITLES[t]}</span>
          {t === 'ops' && conversations > 0 && (
            <span style={{
              position: 'absolute', top: 4, right: '22%',
              background: '#6366f1', color: '#fff',
              fontSize: 7, fontWeight: 700,
              borderRadius: 4, padding: '0px 3px',
              lineHeight: 1.4,
            }}>
              {conversations > 9 ? '9+' : conversations}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

// ── Conversation detail auto-switch ──────────────────────────────────────────

function useAutoSwitchToOps(setTab: (t: Tab) => void) {
  const selectedConvId = useSimStore(s => s.selectedConversationId)
  const prevId = useState<string | null>(null)

  useEffect(() => {
    if (selectedConvId && selectedConvId !== prevId[0]) {
      setTab('ops')
    }
  }, [selectedConvId])  // eslint-disable-line react-hooks/exhaustive-deps
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab] = useState<Tab>('hq')
  const isMobile      = useIsMobile()
  const conversations = useSimStore(s => s.conversations)

  // Auto-switch to Ops tab when a conversation is selected (e.g. from EventLog click)
  useAutoSwitchToOps(setTab)

  if (isMobile) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', height: '100vh',
        userSelect: 'none', overflow: 'hidden', background: '#020408',
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}>
        <Toolbar isMobile={true} />
        <BuildingModal />

        {/* World canvas (compact on mobile) */}
        <div style={{ height: '32vh', flexShrink: 0, overflow: 'hidden', position: 'relative' }}>
          <WorldCanvas />
        </div>

        {/* Main content panel */}
        <div style={{ flex: 1, overflow: 'hidden', background: 'rgba(4,6,14,0.99)' }}>
          {/* More tabs row on mobile */}
          <div style={{
            display: 'flex', overflowX: 'auto', borderBottom: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(4,6,14,0.99)', flexShrink: 0, scrollbarWidth: 'none',
          }}>
            {(Object.keys(TAB_LABELS) as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flexShrink: 0, border: 'none', padding: '5px 10px',
                  background: tab === t ? 'rgba(255,255,255,0.05)' : 'transparent',
                  color: tab === t ? TAB_ACCENT[t] : '#3a4860',
                  fontSize: 10, cursor: 'pointer', whiteSpace: 'nowrap',
                  borderBottom: tab === t ? `2px solid ${TAB_ACCENT[t]}` : '2px solid transparent',
                }}
              >
                {TAB_LABELS[t]} {TAB_TITLES[t]}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, height: 'calc(100% - 32px)', overflowY: 'auto' }}>
            <TabContent tab={tab} />
          </div>
        </div>

        <MobileBottomNav tab={tab} setTab={setTab} conversations={conversations.length} />
      </div>
    )
  }

  // ── Desktop layout ────────────────────────────────────────────────────────

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      userSelect: 'none', overflow: 'hidden', background: '#020408',
    }}>
      <Toolbar isMobile={false} />
      <BuildingModal />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* World canvas + event log */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <WorldCanvas />
          </div>
          <EventLog />
        </div>

        {/* Right sidebar */}
        <div style={{
          width: 285, flexShrink: 0, display: 'flex', flexDirection: 'column',
          borderLeft: '1px solid rgba(0,212,255,0.08)', overflow: 'hidden',
        }}>
          <SidebarTabStrip tab={tab} setTab={setTab} conversations={conversations.length} />

          <div style={{ flex: 1, overflowY: 'auto' }}>
            <TabContent tab={tab} />
          </div>
        </div>
      </div>
    </div>
  )
}
