import { useSimStore } from '../store'

const ROLE_LABELS: Record<string, string> = {
  research_agent:     'Research Agent',
  design_agent:       'Design Agent',
  qc_agent:           'QC Agent',
  upload_agent:       'Upload Agent',
  trader_agent:       'Trader Agent',
  risk_manager:       'Risk Manager',
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
}

const STATE_LABELS: Record<string, string> = {
  sleeping:           '💤 Sleeping',
  waking:             '☀️ Waking up',
  at_home:            '🏠 At home',
  commuting_to_work:  '🚶 Commuting',
  at_work:            '🏢 Entering',
  working:            '💼 Working',
  talking:            '💬 Talking',
  on_break:           '☕ On break',
  commuting_home:     '🚶 Going home',
  arriving_home:      '🏠 Arriving home',
}

const MOOD_EMOJI: Record<string, string> = {
  happy:   '😊',
  neutral: '😐',
  stressed:'😰',
  excited: '🤩',
  tired:   '😴',
}

function Bar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  return (
    <div style={{ background: '#1a1c28', borderRadius: 3, height: 6, overflow: 'hidden', marginTop: 2 }}>
      <div style={{ width: `${(value / max) * 100}%`, height: '100%', background: color, transition: 'width 0.3s' }} />
    </div>
  )
}

export default function AgentInspector() {
  const agents = useSimStore(s => s.agents)
  const selectedId = useSimStore(s => s.selectedAgentId)
  const selectAgent = useSimStore(s => s.selectAgent)

  const agent = agents.find(a => a.id === selectedId)

  return (
    <div style={{
      width: '100%',
      background: 'rgba(16,18,28,0.95)',
      borderRight: '1px solid #2a2d3a',
      display: 'flex',
      flexDirection: 'column',
      fontSize: 12,
      color: '#c8ccd8',
    }}>
      <div style={{ padding: '10px', borderBottom: '1px solid #2a2d3a' }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#e0e6f0', marginBottom: 6 }}>👥 Agents</div>
        {agents.map(a => (
          <div
            key={a.id}
            onClick={() => selectAgent(a.id === selectedId ? null : a.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 6px',
              borderRadius: 6,
              cursor: 'pointer',
              background: a.id === selectedId ? 'rgba(255,255,255,0.08)' : 'transparent',
              marginBottom: 1,
              transition: 'background 0.15s',
              borderLeft: a.isAvenger ? `2px solid ${a.color}` : 'none',
              paddingLeft: a.isAvenger ? 4 : 6,
            }}
          >
            {a.emoji
              ? <span style={{ fontSize: 13, flexShrink: 0 }}>{a.emoji}</span>
              : <div style={{ width: 9, height: 9, borderRadius: '50%', background: a.color, flexShrink: 0 }} />
            }
            <span style={{ fontSize: 10, color: a.id === selectedId ? '#fff' : '#b0b8c0' }}>{a.name}</span>
            <span style={{ fontSize: 9, marginLeft: 'auto', color: '#6a7080' }}>{MOOD_EMOJI[a.mood]}</span>
          </div>
        ))}
      </div>

      <div style={{ flex: 1, padding: '10px', overflowY: 'auto' }}>
        {!agent ? (
          <div style={{ color: '#4a5060', fontSize: 11, textAlign: 'center', marginTop: 20 }}>
            Click an agent to inspect
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              {agent.emoji
                ? <span style={{ fontSize: 24 }}>{agent.emoji}</span>
                : <div style={{ width: 24, height: 24, borderRadius: '50%', background: agent.color, border: `2px solid ${agent.accentColor}` }} />
              }
              <div>
                <div style={{ fontWeight: 700, color: agent.color, fontSize: 13 }}>{agent.name}</div>
                <div style={{ color: '#6a7080', fontSize: 10 }}>{ROLE_LABELS[agent.role] ?? agent.role}</div>
                {agent.isAvenger && (
                  <div style={{ fontSize: 8, color: '#7c3aed', fontWeight: 600, marginTop: 1 }}>AVENGERS HQ</div>
                )}
              </div>
            </div>

            <div style={{ marginBottom: 8 }}>
              <div style={{ color: '#9aa0b0', fontSize: 10, marginBottom: 2 }}>Status</div>
              <div style={{ color: '#e0e6f0', fontWeight: 600, fontSize: 11 }}>{STATE_LABELS[agent.state]}</div>
            </div>

            {agent.taskName && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ color: '#9aa0b0', fontSize: 10, marginBottom: 2 }}>Task</div>
                <div style={{ color: '#c8ccd8', fontSize: 11 }}>{agent.taskName}</div>
                {agent.state === 'working' && agent.taskProgress > 0 && (
                  <Bar value={agent.taskProgress * 100} color={agent.color} />
                )}
              </div>
            )}

            <div style={{ marginBottom: 6 }}>
              <div style={{ color: '#9aa0b0', fontSize: 10 }}>Mood {MOOD_EMOJI[agent.mood]}</div>
            </div>

            <div style={{ marginBottom: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9aa0b0' }}>
                <span>Energy</span><span>{Math.round(agent.energy)}%</span>
              </div>
              <Bar value={agent.energy} color="#2ecc71" />
            </div>

            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9aa0b0' }}>
                <span>Stress</span><span>{Math.round(agent.stress)}%</span>
              </div>
              <Bar value={agent.stress} color="#e74c3c" />
            </div>

            {agent.speech && (
              <div style={{
                background: 'rgba(255,255,255,0.06)',
                borderRadius: 6,
                padding: '6px 8px',
                fontSize: 10,
                color: '#e0e6f0',
                fontStyle: 'italic',
                marginBottom: 6,
              }}>
                "{agent.speech}"
              </div>
            )}

            {/* Avengers-specific stats */}
            {agent.isAvenger && agent.agentSkill && (
              <div style={{ marginTop: 6, padding: '6px 8px', borderRadius: 6, background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.18)' }}>
                <div style={{ fontSize: 9, color: '#7c3aed', fontWeight: 600, marginBottom: 4 }}>{agent.agentSkill.name} — Lv{agent.agentSkill.level}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#5a6070' }}>
                  <span>🎯 Acc: <span style={{ color: '#c8ccd8' }}>{Math.round((agent.accuracy ?? 0) * 100)}%</span></span>
                  <span>📊 {agent.signalsHit}/{agent.signalsGiven}</span>
                  <span>🔥 {agent.streak ?? 0} streak</span>
                </div>
              </div>
            )}

            <div style={{ color: '#4a5060', fontSize: 9, marginTop: 4 }}>
              Grid: ({Math.round(agent.gridPos.x)}, {Math.round(agent.gridPos.y)})
            </div>
          </>
        )}
      </div>
    </div>
  )
}
