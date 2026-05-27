import { useSimStore } from '../store'
import type { Agent } from '../types'

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
}

function NeedsBar({ label, value }: { label: string; value: number }) {
  const color =
    value >= 70 ? '#10b981'
    : value >= 40 ? '#f59e0b'
    : '#ef4444'
  return (
    <div style={{ marginBottom: 3 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#6a7888' }}>
        <span>{label}</span><span style={{ color }}>{Math.round(value)}%</span>
      </div>
      <div style={{ background: '#1a1c28', borderRadius: 2, height: 4, overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', background: color, transition: 'width 0.4s' }} />
      </div>
    </div>
  )
}

function SkillXP({ level, xp, xpToNext }: { level: number; xp: number; xpToNext: number }) {
  const pct = (xp / xpToNext) * 100
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ fontSize: 10, color: '#f5c842', fontFamily: 'monospace', fontWeight: 700 }}>Lv{level}</span>
      <div style={{ flex: 1, background: '#1a1c28', borderRadius: 2, height: 5, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: '#f5c842', transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: 8, color: '#4a5060' }}>{xp}/{xpToNext}xp</span>
    </div>
  )
}

function AgentCard({ agent }: { agent: Agent }) {
  const needs = agent.agentNeeds
  const skill = agent.agentSkill
  const acc   = agent.accuracy ?? 0
  const hits  = agent.signalsHit ?? 0
  const given = agent.signalsGiven ?? 0

  const stateColor =
    agent.state === 'working'  ? '#10b981' :
    agent.state === 'sleeping' ? '#4a5060' :
    agent.state === 'on_break' ? '#f59e0b' :
    '#3498db'

  return (
    <div style={{
      borderRadius: 7,
      border: '1px solid rgba(255,255,255,0.06)',
      background: 'rgba(255,255,255,0.02)',
      padding: '8px 9px',
      marginBottom: 6,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
        <span style={{ fontSize: 18 }}>{agent.emoji ?? '🤖'}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: agent.color }}>{agent.name}</div>
          <div style={{ fontSize: 9, color: '#5a6070' }}>{ROLE_LABELS[agent.role] ?? agent.role}</div>
        </div>
        <div style={{
          fontSize: 8, fontFamily: 'monospace', fontWeight: 600,
          padding: '1px 6px', borderRadius: 3,
          background: `${stateColor}18`, color: stateColor, border: `1px solid ${stateColor}44`,
        }}>
          {agent.state.toUpperCase().replace('_', ' ')}
        </div>
      </div>

      {/* Needs bars */}
      {needs && (
        <div style={{ marginBottom: 6 }}>
          <NeedsBar label="Data Fresh" value={needs.dataFreshness} />
          <NeedsBar label="API Health" value={needs.apiHealth} />
          <NeedsBar label="Rest"       value={needs.rest} />
          <NeedsBar label="Morale"     value={needs.morale} />
        </div>
      )}

      {/* Skill */}
      {skill && (
        <div style={{ marginBottom: 5 }}>
          <div style={{ fontSize: 9, color: '#4a5060', marginBottom: 3 }}>{skill.name}</div>
          <SkillXP level={skill.level} xp={skill.xp} xpToNext={skill.xpToNext} />
        </div>
      )}

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 10, fontSize: 9, fontFamily: 'monospace', color: '#5a6070' }}>
        <span>🎯 <span style={{ color: `${(acc * 100) >= 70 ? '#10b981' : '#f59e0b'}` }}>{Math.round(acc * 100)}%</span></span>
        <span>📊 {hits}/{given}</span>
        <span>🔥 <span style={{ color: (agent.streak ?? 0) >= 3 ? '#f5c842' : '#5a6070' }}>{agent.streak ?? 0}</span></span>
        {(agent.bestStreak ?? 0) > 0 && (
          <span>🏆 {agent.bestStreak}</span>
        )}
      </div>

      {/* Current task */}
      {agent.taskName && (
        <div style={{ marginTop: 5, fontSize: 9, color: '#7a8898', fontStyle: 'italic' }}>
          ↪ {agent.taskName}
        </div>
      )}
    </div>
  )
}

export default function HQPanel() {
  const agents = useSimStore(s => s.agents)
  const avengers = agents.filter(a => a.isAvenger)

  const totalSigs  = avengers.reduce((sum, a) => sum + (a.signalsGiven ?? 0), 0)
  const totalHits  = avengers.reduce((sum, a) => sum + (a.signalsHit  ?? 0), 0)
  const avgMorale  = avengers.length > 0
    ? Math.round(avengers.reduce((sum, a) => sum + (a.agentNeeds?.morale ?? 0), 0) / avengers.length)
    : 0
  const working    = avengers.filter(a => a.state === 'working').length

  return (
    <div style={{
      width: '100%', background: 'rgba(10,8,24,0.98)',
      fontSize: 11, color: '#c8ccd8',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 10px 8px',
        borderBottom: '1px solid #1a1c2e',
        background: 'rgba(124,58,237,0.08)',
      }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#a78bfa', marginBottom: 6 }}>
          🛡️ Avengers HQ
        </div>
        {/* Summary stats */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { label: 'On Duty', value: `${working}/${avengers.length}`, color: '#10b981' },
            { label: 'Signals', value: `${totalHits}/${totalSigs}`,     color: '#f5c842' },
            { label: 'Morale',  value: `${avgMorale}%`,                  color: avgMorale >= 70 ? '#10b981' : '#f59e0b' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: s.color, fontFamily: 'monospace' }}>{s.value}</div>
              <div style={{ fontSize: 8, color: '#4a5060' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Agent cards */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
        {avengers.length === 0 ? (
          <div style={{ color: '#3a4050', fontSize: 11, textAlign: 'center', marginTop: 20 }}>
            No Avengers found
          </div>
        ) : (
          avengers.map(a => <AgentCard key={a.id} agent={a} />)
        )}
      </div>
    </div>
  )
}
