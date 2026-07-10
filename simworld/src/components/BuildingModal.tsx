import { useEffect, useRef, useState } from 'react'
import { useSimStore, HIRE_COST } from '../store'
import type { Agent, Building, Room } from '../types'

// ── Business types for player buildings ───────────────────────────────────────

const BUSINESS_TYPES = ['Shop', 'Studio', 'Trading', 'Services', 'Tech', 'Restaurant', 'Agency', 'Other']

const AGENT_NAMES = [
  'Alex', 'Bailey', 'Casey', 'Devon', 'Ellis', 'Frankie', 'Gray', 'Harper',
  'Indie', 'Jules', 'Kai', 'Lane', 'Marlo', 'Nico', 'Oakley', 'Parker',
  'Quincy', 'Rio', 'Sage', 'Tatum',
]

// ── Manage section (custom buildings: assign business, hire agents) ──────────

// ── Decor palettes (walls & floors for player buildings) ─────────────────────

const WALL_SWATCHES = ['#e8c9a0', '#a0c4e8', '#a9dfbf', '#f0b8c8', '#9aa8ba', '#c3b1e1', '#e8dcc4', '#8fb8a8']
const FLOOR_SWATCHES = ['#f5e6c8', '#c4ddf5', '#d4f3e2', '#fadce6', '#c7d2e0', '#e2d7f2', '#d9c9a8', '#b8d8c8']

export function ManageSection({ building, accent }: { building: Building; accent: string }) {
  const assignBusiness = useSimStore(s => s.assignBusiness)
  const hireAgent      = useSimStore(s => s.hireAgent)
  const totalCash      = useSimStore(s => s.totalCash)
  const agents         = useSimStore(s => s.agents)
  const setBuildingStyle = useSimStore(s => s.setBuildingStyle)

  const [name, setName] = useState(building.vacant ? '' : building.name)
  const [bizType, setBizType] = useState(building.businessType ?? 'Shop')

  const staff = agents.filter(a => a.workBuilding === building.id)
  const canHire = !building.vacant && totalCash >= HIRE_COST && staff.length < building.rooms.length * 2

  const doHire = () => {
    const used = new Set(agents.map(a => a.name))
    const fresh = AGENT_NAMES.filter(n => !used.has(n))
    const agentName = fresh.length > 0
      ? fresh[Math.floor(Math.random() * fresh.length)]
      : `Agent ${agents.length + 1}`
    hireAgent(building.id, agentName)
  }

  return (
    <div style={{
      background: building.vacant ? 'rgba(245,166,35,0.06)' : 'rgba(255,255,255,0.02)',
      border: building.vacant ? '1px dashed rgba(245,166,35,0.45)' : '1px solid rgba(255,255,255,0.07)',
      borderRadius: 12, padding: 14,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: building.vacant ? '#f5a623' : accent, textTransform: 'uppercase' }}>
        {building.vacant ? '🏗️ Set Up Your Business' : '⚙️ Manage Business'}
      </div>

      {building.vacant && (
        <div style={{ fontSize: 10, color: '#8892a4', lineHeight: 1.5 }}>
          This building is vacant. Give it a name and pick a business type — then you can hire agents to work here.
        </div>
      )}

      {/* Name + type */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Business name…"
          maxLength={26}
          style={{
            flex: 2, minWidth: 140, background: 'rgba(0,0,0,0.35)',
            border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
            color: '#e0e6f0', fontSize: 11, padding: '7px 10px', outline: 'none',
          }}
        />
        <select
          value={bizType}
          onChange={e => setBizType(e.target.value)}
          style={{
            flex: 1, minWidth: 90, background: 'rgba(0,0,0,0.35)',
            border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
            color: '#e0e6f0', fontSize: 11, padding: '7px 8px', outline: 'none',
          }}
        >
          {BUSINESS_TYPES.map(t => <option key={t} value={t} style={{ background: '#0d1117' }}>{t}</option>)}
        </select>
        <button
          onClick={() => name.trim() && assignBusiness(building.id, name.trim(), bizType)}
          disabled={!name.trim()}
          style={{
            background: name.trim() ? 'rgba(72,220,140,0.15)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${name.trim() ? 'rgba(72,220,140,0.5)' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 8, color: name.trim() ? '#48dc8c' : '#4a5568',
            fontSize: 10, fontWeight: 700, padding: '7px 12px',
            cursor: name.trim() ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap',
          }}
        >
          {building.vacant ? '✓ Open Business' : '✓ Update'}
        </button>
      </div>

      {/* Decor: wall + floor colors */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.5, color: '#6a7890', marginBottom: 4 }}>
            🧱 WALLS
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {WALL_SWATCHES.map(c => (
              <button
                key={c}
                onClick={() => setBuildingStyle(building.id, { color: c })}
                style={{
                  width: 18, height: 18, borderRadius: 5, cursor: 'pointer', background: c,
                  border: building.color === c ? '2px solid #00d4ff' : '2px solid rgba(255,255,255,0.12)',
                }}
              />
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.5, color: '#6a7890', marginBottom: 4 }}>
            🪵 FLOOR
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {FLOOR_SWATCHES.map(c => (
              <button
                key={c}
                onClick={() => setBuildingStyle(building.id, { accentColor: c })}
                style={{
                  width: 18, height: 18, borderRadius: 5, cursor: 'pointer', background: c,
                  border: building.accentColor === c ? '2px solid #00d4ff' : '2px solid rgba(255,255,255,0.12)',
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Hiring */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button
          onClick={doHire}
          disabled={!canHire}
          title={building.vacant ? 'Assign a business first' : undefined}
          style={{
            background: canHire ? `${accent}20` : 'rgba(255,255,255,0.04)',
            border: `1px solid ${canHire ? `${accent}60` : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 8, color: canHire ? accent : '#4a5568',
            fontSize: 10, fontWeight: 700, padding: '7px 12px',
            cursor: canHire ? 'pointer' : 'not-allowed',
          }}
        >
          👋 Hire Agent (${HIRE_COST.toLocaleString()})
        </button>
        <span style={{ fontSize: 9, color: '#6a7890' }}>
          {building.vacant
            ? 'Hiring unlocks once a business is assigned'
            : `${staff.length}/${building.rooms.length * 2} staff · agents live & work here`}
        </span>
      </div>
    </div>
  )
}

// ── Team chat messages (generated from agent activity) ─────────────────────────

const TEAM_MSGS: Record<string, string[][]> = {
  creative_studio: [
    ['Reya', '🔍', 'Found a trending niche — aesthetic planners up 2.3× this week!'],
    ['Reya', '🔍', 'Top competitor has 800 sales on their planner bundle. Studying their tags.'],
    ['Dani', '✏️', 'Working on the Daily Planner layout — going with a clean time-block grid.'],
    ['Dani', '✏️', 'Color palette locked in. Soft lavender + charcoal. Very on-trend.'],
    ['Quinn', '✅', 'Reviewed the mockups — resolution is good, typography is clean. Approved!'],
    ['Quinn', '✅', 'Sending the Gratitude Journal back to Dani — needs A4 bleed margins.'],
    ['Uly', '📦', 'Listings are live! SEO titles are keyword-first. Tags filled to all 13.'],
    ['Uly', '📦', 'Pricing set: singles $4.99, bundles $12.99. Matches market average.'],
    ['Reya', '🔍', 'Pinterest boards indexed by Google — organic traffic incoming in 3–5 days.'],
    ['Dani', '✏️', 'Goal Workbook is done! Vision board page looks great with the grid layout.'],
  ],
  trading_office: [
    ['Vera', '📊', 'Profile update: POC sitting mid-range — price keeps rotating back to it.'],
    ['Marlow', '💧', 'Equal highs stacked above the session range — buy-side pool marked on the board.'],
    ['Nova', '📰', 'Calendar check: CPI tomorrow morning. Expect thinner books late today.'],
    ['Sana', '🕐', 'Opening range is set. Now we watch which extreme gets tested first.'],
    ['Cole', '🧭', 'Hourly structure intact — higher lows holding since yesterday\'s close.'],
    ['Trae', '📈', 'Levels look clean. I\'ll mark the confluence zones on the main chart.'],
    ['Vera', '📊', 'Thin LVN pocket just below — if we enter it, price should travel fast.'],
    ['Marlow', '💧', 'Overnight low swept in the first hour — that liquidity is spent.'],
    ['Remi', '🛡️', 'Reminder from the books: expenses logged, balances reconciled.'],
    ['Nova', '📰', 'Fed speakers this afternoon — headline risk window from 1pm.'],
    ['Sana', '🕐', 'Lunch lull — ranges compress, levels get noisy. Patience hours.'],
    ['Cole', '🧭', 'Expansion candle broke the range — watching for acceptance, not chasing.'],
  ],
  avengers_hq: [
    ['Vera', '📊', 'Building the composite profile for the week — value is clearly migrating higher.'],
    ['Marlow', '💧', 'Mapped every untested pool from the last three sessions. Board is current.'],
    ['Nova', '📰', 'Overnight recap drafted: yields soft, risk tone constructive, calendar quiet.'],
    ['Sana', '🕐', 'Session stats updated — the first 90 minutes keep setting the day\'s range.'],
    ['Cole', '🧭', 'Weekly structure review done. Trend context unchanged until a daily low breaks.'],
    ['Vera', '📊', 'HVN shelf overhead did its job again today — responsive sellers on first touch.'],
    ['Marlow', '💧', 'Round-number confluence above lines up with equal highs — strong magnet.'],
    ['Nova', '📰', 'No surprises in the data drop — market barely blinked.'],
    ['Sana', '🕐', 'Closing hour: untested levels above are the draw into the bell.'],
    ['Cole', '🧭', 'Reminder: we read the market, we don\'t call trades. Levels are on the board.'],
  ],
  home1: [
    ['Reya', '🔍', 'Getting ready for the day — reviewed overnight Etsy stats over coffee.'],
    ['Dani', '✏️', 'Taking a short break. Back to the studio in 10.'],
    ['Quinn', '✅', 'Recharging — checked the shop reviews. 4.8 stars! Great week.'],
    ['Uly', '📦', 'Off-hours but monitoring listing views on mobile.'],
  ],
  home2: [
    ['Trae', '📈', 'Markets are closed. Reviewing today\'s levels — which ones held, which broke.'],
    ['Remi', '🛡️', 'Running the end-of-week books. Everything reconciled.'],
  ],
  hq_quarters: [
    ['Vera', '📊', 'Charts are off. Composite profile rebuilds overnight — fresh board tomorrow.'],
    ['Nova', '📰', 'Skimming tomorrow\'s calendar over tea. Early prints worth waking up for.'],
    ['Sana', '🕐', 'Session recap filed. Rest now — the open sets the tone tomorrow.'],
  ],
}

// ── Room accent colors by building ────────────────────────────────────────────

const ROOM_COLORS: Record<string, string> = {
  creative_studio: '#f97316',
  trading_office:  '#3b82f6',
  avengers_hq:     '#7c3aed',
  home1:           '#10b981',
  home2:           '#06b6d4',
  hq_quarters:     '#6366f1',
}

// ── Agent mini-card ───────────────────────────────────────────────────────────

function AgentCard({ agent, accent }: { agent: Agent; accent: string }) {
  const stateLabel: Record<string, string> = {
    working:         '⚙️ Working',
    talking:         '💬 In meeting',
    at_work:         '🪑 At desk',
    on_break:        '☕ On break',
    commuting_to_work: '🚶 Commuting',
    commuting_home:  '🚶 Heading home',
    sleeping:        '😴 Resting',
    at_home:         '🏠 Home',
    waking:          '🌅 Waking up',
    arriving_home:   '🏠 Arrived home',
  }

  const moodColor: Record<string, string> = {
    happy:   '#10b981',
    excited: '#f59e0b',
    neutral: '#6b7280',
    tired:   '#9ca3af',
    stressed:'#ef4444',
  }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: `1px solid ${accent}30`,
      borderRadius: 10,
      padding: '10px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      minWidth: 130,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Glow top bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: agent.color }} />

      {/* Avatar + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: `radial-gradient(circle at 35% 35%, ${agent.accentColor}, ${agent.color})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, flexShrink: 0,
          boxShadow: `0 0 12px ${agent.color}50`,
        }}>
          {agent.emoji ?? agent.name[0]}
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#e0e6f0' }}>{agent.name}</div>
          <div style={{ fontSize: 9, color: accent, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {agent.role.replace(/_/g, ' ')}
          </div>
        </div>
      </div>

      {/* Status */}
      <div style={{ fontSize: 9, color: '#8892a4' }}>
        {stateLabel[agent.state] ?? agent.state}
      </div>

      {/* Progress bar */}
      {agent.state === 'working' && (
        <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
          <div style={{
            height: '100%', borderRadius: 2,
            width: `${agent.taskProgress * 100}%`,
            background: `linear-gradient(90deg, ${agent.color}, ${accent})`,
            transition: 'width 0.5s ease',
          }} />
        </div>
      )}

      {/* Mood dot */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: moodColor[agent.mood] ?? '#6b7280', flexShrink: 0 }} />
        <span style={{ fontSize: 8, color: '#6a7890' }}>{agent.mood}</span>
        {agent.energy !== undefined && (
          <span style={{ fontSize: 8, color: '#6a7890', marginLeft: 'auto' }}>⚡ {Math.round(agent.energy)}%</span>
        )}
      </div>

      {/* Speech */}
      {agent.speech && (
        <div style={{
          fontSize: 9, color: '#c0cce0', fontStyle: 'italic',
          background: 'rgba(255,255,255,0.05)',
          borderRadius: 6, padding: '4px 6px',
          borderLeft: `2px solid ${accent}`,
          lineHeight: 1.4,
          animation: 'fadein 0.3s ease',
        }}>
          "{agent.speech}"
        </div>
      )}

      {/* Animated typing dots when working */}
      {agent.state === 'working' && !agent.speech && (
        <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: 4, height: 4, borderRadius: '50%',
              background: accent,
              opacity: 0.6,
              animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
            }} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Room card ─────────────────────────────────────────────────────────────────

function RoomCard({ room, agents, accent }: { room: Room; agents: Agent[]; accent: string }) {
  const roomAgents = agents.filter(a => a.workRoom === room.id || a.currentRoom === room.id)

  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: `1px solid rgba(255,255,255,0.07)`,
      borderRadius: 12,
      padding: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      {/* Room header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 3, height: 18, background: accent, borderRadius: 2, flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: '#c0cce0' }}>{room.name}</span>
        <span style={{ fontSize: 9, color: '#4a5568', marginLeft: 'auto' }}>
          {roomAgents.length} agent{roomAgents.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Agents in room */}
      {roomAgents.length === 0 ? (
        <div style={{ fontSize: 9, color: '#3a4858', fontStyle: 'italic', padding: '4px 0' }}>
          No agents in this room right now
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {roomAgents.map(a => <AgentCard key={a.id} agent={a} accent={accent} />)}
        </div>
      )}
    </div>
  )
}

// ── Team chat feed ────────────────────────────────────────────────────────────

function TeamChat({ buildingId, accent }: { buildingId: string; accent: string }) {
  const msgs   = TEAM_MSGS[buildingId] ?? []
  const logRef = useRef<HTMLDivElement>(null)
  const [visibleIdx, setVisibleIdx] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setVisibleIdx(i => (i + 1) % msgs.length)
    }, 3500)
    return () => clearInterval(id)
  }, [msgs.length])

  // Show last 5 messages cycling
  const displayed = Array.from({ length: Math.min(5, msgs.length) }, (_, i) =>
    msgs[(visibleIdx + i) % msgs.length]
  )

  return (
    <div style={{
      background: 'rgba(0,0,0,0.3)',
      border: `1px solid ${accent}20`,
      borderRadius: 10,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '6px 12px', background: `${accent}15`,
        borderBottom: `1px solid ${accent}20`,
        fontSize: 9, fontWeight: 700, color: accent, letterSpacing: 1,
        textTransform: 'uppercase',
      }}>
        📡 Team Communications — Live Feed
      </div>
      <div ref={logRef} style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
        {displayed.map(([name, emoji, msg], i) => (
          <div key={`${visibleIdx}-${i}`} style={{
            display: 'flex', gap: 8, alignItems: 'flex-start',
            opacity: 1 - i * 0.15,
            animation: i === 0 ? 'fadein 0.4s ease' : undefined,
          }}>
            <span style={{ fontSize: 12, flexShrink: 0 }}>{emoji}</span>
            <div>
              <span style={{ fontSize: 9, fontWeight: 700, color: accent }}>{name}</span>
              <span style={{ fontSize: 9, color: '#8892a4', marginLeft: 6 }}>{msg}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Building modal ────────────────────────────────────────────────────────────

export default function BuildingModal() {
  const selectedBuildingId = useSimStore(s => s.selectedBuildingId)
  const selectBuilding     = useSimStore(s => s.selectBuilding)
  const agents             = useSimStore(s => s.agents)
  const worldMap           = useSimStore(s => s.worldMap)

  if (!selectedBuildingId) return null

  const building = worldMap.buildings.find(b => b.id === selectedBuildingId)
  if (!building) return null

  const accent = ROOM_COLORS[selectedBuildingId] ?? '#6366f1'

  const buildingAgents = agents.filter(
    a => a.workBuilding === selectedBuildingId || a.homeBuilding === selectedBuildingId
  )

  return (
    <>
      {/* CSS animations */}
      <style>{`
        @keyframes fadein { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
        @keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={() => selectBuilding(null)}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)',
          backdropFilter: 'blur(3px)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }}
      >
        {/* Modal panel */}
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: 'linear-gradient(160deg, #0d1117 0%, #0a0e1a 100%)',
            border: `1px solid ${accent}40`,
            borderRadius: 16,
            width: '100%',
            maxWidth: 860,
            maxHeight: '88vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: `0 0 60px ${accent}20, 0 24px 48px rgba(0,0,0,0.6)`,
          }}
        >
          {/* Header */}
          <div style={{
            padding: '14px 20px',
            background: `linear-gradient(90deg, ${accent}18, transparent)`,
            borderBottom: `1px solid ${accent}25`,
            display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%', background: accent,
              boxShadow: `0 0 10px ${accent}`,
            }} />
            <span style={{
              fontSize: 15, fontWeight: 800, color: '#e0e6f0', letterSpacing: 0.5,
              background: `linear-gradient(90deg, #fff, ${accent})`,
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              {building.name}
            </span>
            <span style={{ fontSize: 10, color: '#4a5568', marginLeft: 4 }}>
              {buildingAgents.length} agent{buildingAgents.length !== 1 ? 's' : ''} assigned
            </span>
            <div style={{ flex: 1 }} />

            {/* Occupant avatars */}
            <div style={{ display: 'flex', gap: -4 }}>
              {buildingAgents.slice(0, 8).map((a, i) => (
                <div key={a.id} style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: a.color,
                  border: '2px solid #0d1117',
                  marginLeft: i > 0 ? -8 : 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, zIndex: 10 - i,
                }}>
                  {a.emoji ?? a.name[0]}
                </div>
              ))}
            </div>

            <button
              onClick={() => selectBuilding(null)}
              style={{
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 6, color: '#8892a4', cursor: 'pointer',
                fontSize: 14, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              ✕
            </button>
          </div>

          {/* Scrollable body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Manage section (player-built buildings) */}
            {building.custom && <ManageSection key={building.id} building={building} accent={accent} />}

            {/* Rooms grid */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {building.rooms.map(room => (
                <RoomCard
                  key={room.id}
                  room={room}
                  agents={buildingAgents}
                  accent={accent}
                />
              ))}
            </div>

            {/* Team chat (buildings with a scripted feed) */}
            {(TEAM_MSGS[selectedBuildingId]?.length ?? 0) > 0 && (
              <TeamChat buildingId={selectedBuildingId} accent={accent} />
            )}
          </div>
        </div>
      </div>
    </>
  )
}
