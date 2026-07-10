import { useState } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface WorkflowNode {
  icon: string
  label: string
  note?: string
  branch?: boolean
  branches?: { label: string; note: string; color: string }[]
}

interface Workflow {
  id: string
  name: string
  icon: string
  trigger: string
  triggerIcon: string
  color: string
  est: string
  nodes: WorkflowNode[]
  creds: string[]
  priority: 'high' | 'medium' | 'low'
}

interface DeployStep {
  id: string
  text: string
  detail: string
  cmd?: string
}

// ── Railway deploy checklist ───────────────────────────────────────────────────

const DEPLOY_STEPS: DeployStep[] = [
  {
    id: 'railway_service',
    text: 'Add n8n service to Railway project',
    detail: 'In Railway dashboard → New Service → Docker Image → n8nio/n8n',
    cmd: 'railway add',
  },
  {
    id: 'postgres',
    text: 'Add PostgreSQL database',
    detail: 'Railway → Add Plugin → PostgreSQL. n8n uses it for execution history & credentials.',
  },
  {
    id: 'env_vars',
    text: 'Set environment variables',
    detail: 'N8N_HOST, N8N_PORT=5678, DB_TYPE=postgresdb, DB_POSTGRESDB_DATABASE, N8N_ENCRYPTION_KEY, WEBHOOK_URL',
    cmd: 'railway variables set N8N_HOST=0.0.0.0 N8N_PORT=5678 DB_TYPE=postgresdb',
  },
  {
    id: 'expose_port',
    text: 'Expose port 5678 + set custom domain',
    detail: 'Railway → Settings → Networking → Generate Domain. This becomes your webhook base URL.',
  },
  {
    id: 'internal_net',
    text: 'Wire n8n → agent_api.py via Railway private network',
    detail: 'Use service.railway.internal URLs — no public internet hop between n8n and your agent API.',
    cmd: 'http://agent-api.railway.internal:8000',
  },
  {
    id: 'credentials',
    text: 'Add credentials in n8n UI',
    detail: 'Discord webhook URL, Etsy API key, Pinterest OAuth, Instagram Graph API, OpenAI key, Google Sheets OAuth.',
  },
  {
    id: 'import_workflows',
    text: 'Import workflow JSON files',
    detail: 'n8n → Import from File. Build and export each workflow, version-control the JSON in this repo.',
  },
]

// ── Workflow definitions ───────────────────────────────────────────────────────

const WORKFLOWS: Workflow[] = [
  {
    id: 'trading',
    name: 'Trading Signal Pipeline',
    icon: '📈',
    trigger: 'TradingView Webhook',
    triggerIcon: '📡',
    color: '#10b981',
    est: '~2 hrs to build',
    priority: 'high',
    creds: ['Railway agent_api.py URL', 'Discord Webhook', 'Google Sheets OAuth'],
    nodes: [
      { icon: '📡', label: 'Webhook', note: 'TradingView fires on alert — receives pair, direction, price, RSI' },
      { icon: '⚙️', label: 'Function: Parse & validate signal', note: 'Check required fields, normalize pair names (EURUSD → EUR/USD)' },
      { icon: '🔍', label: 'HTTP GET → agent_api.py /ict-gate', note: 'Run signal through 6-node ICT/SMC gate — returns pass/fail + score' },
      {
        icon: '🔀', label: 'Switch on gate score', branch: true,
        branches: [
          { label: '≥ 5/6 STRONG', note: 'Discord #alerts + execute trade', color: '#10b981' },
          { label: '3–4/6 MEDIUM', note: 'Discord #watchlist only', color: '#f59e0b' },
          { label: '< 3/6 WEAK',   note: 'Discard — log to Sheets only', color: '#ef4444' },
        ],
      },
      { icon: '🤖', label: 'HTTP POST → agent_api.py /execute', note: 'Sends trade order (pair, size, SL, TP) to the execution agent' },
      { icon: '📣', label: 'Discord: #trading-alerts', note: 'Rich embed: pair, direction, entry, SL, TP, ICT score, agent assigned' },
      { icon: '📊', label: 'Google Sheets: Log trade', note: 'Append row — timestamp, pair, direction, entry, score, result (filled later)' },
    ],
  },
  {
    id: 'trade_result',
    name: 'Trade Result & P&L Logger',
    icon: '💹',
    trigger: 'TradingView Close Alert',
    triggerIcon: '🏁',
    color: '#6366f1',
    est: '~1 hr to build',
    priority: 'high',
    creds: ['Railway agent_api.py', 'Discord Webhook', 'Google Sheets OAuth'],
    nodes: [
      { icon: '🏁', label: 'Webhook: trade closed alert', note: 'TradingView fires on SL/TP hit with exit price and P&L' },
      { icon: '⚙️', label: 'Function: Calculate final P&L + win/loss', note: 'Compare against open trade log in Sheets' },
      { icon: '📊', label: 'Google Sheets: Update trade row', note: 'Fill exit price, P&L, result (WIN/LOSS), duration' },
      { icon: '📣', label: 'Discord: #trade-results', note: '🎉 WIN or 😬 LOSS embed with running daily P&L and win rate' },
      { icon: '🤖', label: 'HTTP POST → agent_api.py /post-trade', note: 'Update agent memory: which setup worked, adjust confluence weights' },
    ],
  },
  {
    id: 'etsy_sale',
    name: 'Etsy Sale Automation',
    icon: '🧶',
    trigger: 'Etsy Order Webhook',
    triggerIcon: '🛒',
    color: '#f97316',
    est: '~3 hrs to build',
    priority: 'high',
    creds: ['Etsy API v3 key', 'Discord Webhook', 'Gmail / SMTP', 'Google Sheets OAuth'],
    nodes: [
      { icon: '🛒', label: 'Webhook: Etsy new order', note: 'Etsy fires on purchase — buyer name, email, product, price' },
      { icon: '⚙️', label: 'Function: Parse order data', note: 'Extract product name, category, revenue (after 6.5% + payment fees)' },
      { icon: '📣', label: 'Discord: #etsy-sales', note: '💸 Sale! "[Product Name]" +$X.XX — running daily total' },
      { icon: '📊', label: 'Google Sheets: Log sale', note: 'Product, price, net revenue, buyer country, date — builds revenue dashboard' },
      { icon: '⏰', label: 'Wait: 5 days', note: 'Give buyer time to download and use the product before asking for review' },
      { icon: '✉️', label: 'Etsy Message: Review request', note: 'Personalized thank-you + gentle review ask. Template by product category.' },
      { icon: '🎁', label: 'If: Bundle buyer → Upsell message', note: 'If they bought a planner, offer the matching habit tracker bundle at 20% off' },
    ],
  },
  {
    id: 'new_listing',
    name: 'New Listing → Social Pipeline',
    icon: '📌',
    trigger: 'HTTP trigger (called on new listing)',
    triggerIcon: '🚀',
    color: '#ec4899',
    est: '~4 hrs to build',
    priority: 'medium',
    creds: ['Pinterest OAuth', 'Instagram Graph API', 'OpenAI API', 'Canva API (optional)', 'Discord Webhook'],
    nodes: [
      { icon: '🚀', label: 'HTTP trigger from listing workflow', note: 'Called when Uly completes a new Etsy listing — passes product name, image URL, price' },
      { icon: '🤖', label: 'OpenAI: Generate social captions', note: 'GPT-4o writes Pinterest pin description + Instagram caption with relevant hashtags' },
      { icon: '📌', label: 'Pinterest: Create pin', note: 'Uploads product mockup image + keyword-rich description + Etsy link' },
      { icon: '⏰', label: 'Wait: 2 hours', note: 'Space out posts to avoid platform spam flags' },
      { icon: '📸', label: 'Instagram: Create post', note: 'Lifestyle mockup image + caption + #printable #planner hashtags + link in bio update' },
      { icon: '📣', label: 'Discord: #shop-updates', note: '📦 New listing live: "[Product]" $X.XX — Pinterest + Instagram posted' },
    ],
  },
  {
    id: 'content_calendar',
    name: 'Pinterest Content Calendar',
    icon: '🗓️',
    trigger: 'Schedule: 9am, 2pm, 7pm EST',
    triggerIcon: '⏰',
    color: '#e11d48',
    est: '~2 hrs to build',
    priority: 'medium',
    creds: ['Pinterest OAuth', 'Google Sheets OAuth (content calendar)'],
    nodes: [
      { icon: '⏰', label: 'Cron: 3× daily at peak Pinterest hours', note: '9am, 2pm, 7pm EST — highest engagement windows for planners niche' },
      { icon: '📊', label: 'Google Sheets: Pull next scheduled pin', note: 'Content calendar sheet — product, caption, board, image URL, status' },
      { icon: '🔀', label: 'Switch: Is there a scheduled pin?', branch: true,
        branches: [
          { label: 'Yes → Pin it', note: 'Create pin + mark as posted', color: '#10b981' },
          { label: 'No → Pick evergreen', note: 'Random top seller re-pin', color: '#6366f1' },
        ],
      },
      { icon: '📌', label: 'Pinterest: Create / Re-pin', note: 'Post to relevant board (Daily Planner Printables, Budget Tracker Ideas, etc.)' },
      { icon: '📊', label: 'Sheets: Mark posted + log', note: 'Update status, timestamp for analytics' },
    ],
  },
  {
    id: 'agent_orchestration',
    name: 'Analysis Desk Health Monitor',
    icon: '🛡️',
    trigger: 'Schedule: Every 15 min (market hours)',
    triggerIcon: '⏱️',
    color: '#7c3aed',
    est: '~3 hrs to build',
    priority: 'medium',
    creds: ['Railway agent_api.py URL (internal)', 'Discord Webhook'],
    nodes: [
      { icon: '⏱️', label: 'Cron: Every 15 min, 8am–5pm EST Mon–Fri', note: 'Only during market hours — no unnecessary pings overnight' },
      { icon: '🌐', label: 'HTTP GET → agent_api.py /health', note: 'Checks all desk analysts: state, last update, error count' },
      { icon: '🔀', label: 'Switch: Any agent unhealthy?', branch: true,
        branches: [
          { label: 'All healthy', note: 'Run signal aggregation loop', color: '#10b981' },
          { label: 'Agent down', note: 'Discord alert + attempt restart', color: '#ef4444' },
        ],
      },
      { icon: '🔁', label: 'Loop: Collect signals from each agent', note: 'tech_analyst → fundamentals → sentiment → orderflow → correlation → tradeideas' },
      { icon: '⚙️', label: 'Function: Aggregate confluence score', note: 'Count agents in agreement. 5+/6 = strong signal. Weight by agent accuracy.' },
      { icon: '🔀', label: 'If score ≥ 5/6 → route to trading pipeline', branch: true,
        branches: [
          { label: 'High confluence', note: 'POST to trading workflow webhook', color: '#10b981' },
          { label: 'Low confluence', note: 'Log + wait for next cycle', color: '#3a4060' },
        ],
      },
    ],
  },
  {
    id: 'daily_report',
    name: 'Daily Business Report',
    icon: '📋',
    trigger: 'Schedule: 5:30pm EST daily',
    triggerIcon: '🌅',
    color: '#f5c842',
    est: '~2 hrs to build',
    priority: 'low',
    creds: ['Etsy API', 'Railway agent_api.py', 'OpenAI API', 'Discord Webhook', 'Google Sheets OAuth'],
    nodes: [
      { icon: '🌅', label: 'Cron: 5:30pm EST Mon–Fri', note: 'After market close — captures full trading day + Etsy sales' },
      { icon: '🌐', label: 'HTTP GET → Etsy API /stats', note: 'Fetch today\'s views, visits, orders, revenue' },
      { icon: '🌐', label: 'HTTP GET → agent_api.py /daily-summary', note: 'Trading P&L, win rate, open trades, agent activity' },
      { icon: '🤖', label: 'OpenAI: Generate report narrative', note: 'GPT-4o writes a 3-sentence business summary: wins, concerns, tomorrow\'s focus' },
      { icon: '📣', label: 'Discord: #daily-report', note: 'Rich embed: Etsy revenue, trading P&L, top product, agent performance, AI summary' },
      { icon: '📊', label: 'Google Sheets: Append daily row', note: 'Date, Etsy rev, trading P&L, total cash, new listings, reviews — builds P&L history chart' },
    ],
  },
]

// ── Components ────────────────────────────────────────────────────────────────

const PRIORITY_COLOR = { high: '#ef4444', medium: '#f59e0b', low: '#6366f1' }
const PRIORITY_LABEL = { high: 'P1', medium: 'P2', low: 'P3' }
const STORAGE_KEY = 'openclaw_n8n_deploy'

function NodeFlow({ nodes, color }: { nodes: WorkflowNode[]; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
      {nodes.map((node, i) => (
        <div key={i}>
          <div style={{
            display: 'flex', gap: 7, padding: '4px 8px',
            background: 'rgba(255,255,255,0.03)', borderRadius: 4,
            borderLeft: `2px solid ${color}50`,
          }}>
            <span style={{ fontSize: 11, flexShrink: 0 }}>{node.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 8, fontWeight: 700, color: '#c8ccd8' }}>{node.label}</div>
              {node.note && <div style={{ fontSize: 7, color: '#4a5870', marginTop: 1 }}>{node.note}</div>}
            </div>
          </div>
          {node.branches && (
            <div style={{ marginLeft: 14, marginTop: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {node.branches.map((b, bi) => (
                <div key={bi} style={{
                  display: 'flex', gap: 6, padding: '3px 8px',
                  background: b.color + '10', borderRadius: 3,
                  borderLeft: `2px solid ${b.color}`,
                }}>
                  <span style={{ fontSize: 7, color: b.color, fontWeight: 700, minWidth: 70 }}>{b.label}</span>
                  <span style={{ fontSize: 7, color: '#4a5870' }}>{b.note}</span>
                </div>
              ))}
            </div>
          )}
          {i < nodes.length - 1 && (
            <div style={{ textAlign: 'left', paddingLeft: 15, color: '#2a3040', fontSize: 8, lineHeight: 1 }}>↓</div>
          )}
        </div>
      ))}
    </div>
  )
}

function WorkflowCard({ wf, expanded, onToggle }: {
  wf: Workflow
  expanded: boolean
  onToggle: () => void
}) {
  const pColor = PRIORITY_COLOR[wf.priority]
  return (
    <div style={{ marginBottom: 6 }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          background: expanded ? wf.color + '12' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${expanded ? wf.color + '40' : 'rgba(255,255,255,0.06)'}`,
          borderRadius: 7, padding: '7px 10px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s',
        }}
      >
        <span style={{ fontSize: 14 }}>{wf.icon}</span>
        <div style={{ flex: 1, textAlign: 'left' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: expanded ? wf.color : '#c8ccd8' }}>{wf.name}</div>
          <div style={{ fontSize: 7, color: '#4a5870' }}>
            {wf.triggerIcon} {wf.trigger} · {wf.est}
          </div>
        </div>
        <div style={{
          fontSize: 7, fontWeight: 700, color: pColor, fontFamily: 'monospace',
          background: pColor + '18', padding: '2px 5px', borderRadius: 3,
        }}>
          {PRIORITY_LABEL[wf.priority]}
        </div>
      </button>

      {expanded && (
        <div style={{
          padding: '8px 10px',
          background: 'rgba(255,255,255,0.02)',
          border: `1px solid ${wf.color}20`,
          borderTop: 'none', borderRadius: '0 0 7px 7px',
          marginTop: -1,
        }}>
          <NodeFlow nodes={wf.nodes} color={wf.color} />
          <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize: 7, color: '#3a4060', marginBottom: 3 }}>🔑 Credentials needed:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {wf.creds.map(c => (
                <span key={c} style={{
                  fontSize: 6, color: wf.color, background: wf.color + '15',
                  padding: '1px 5px', borderRadius: 10, fontFamily: 'monospace',
                }}>
                  {c}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function N8nPlanPanel() {
  const [expandedWf, setExpandedWf] = useState<string>('trading')
  const [showDeploy, setShowDeploy] = useState(true)
  const [deployChecked, setDeployChecked] = useState<Set<string>>(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY)
      return s ? new Set(JSON.parse(s)) : new Set()
    } catch { return new Set() }
  })

  function toggleDeploy(id: string) {
    setDeployChecked(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
      return next
    })
  }

  const deployDone = DEPLOY_STEPS.filter(s => deployChecked.has(s.id)).length
  const p1Count = WORKFLOWS.filter(w => w.priority === 'high').length

  return (
    <div style={{
      width: '100%', background: 'rgba(10,12,20,0.98)',
      padding: '10px', overflowY: 'auto',
      fontSize: 11, color: '#c8ccd8',
      display: 'flex', flexDirection: 'column', gap: 0,
    }}>

      {/* Header */}
      <div style={{ textAlign: 'center', padding: '6px 0 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#00d4ff' }}>⚡ n8n Automation Plan</div>
        <div style={{ fontSize: 8, color: '#5a6880', marginTop: 2 }}>Hosted on Railway · 7 workflows · ~17 hrs total build</div>
      </div>

      {/* Architecture diagram */}
      <div style={{
        background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.15)',
        borderRadius: 7, padding: '8px 10px', marginBottom: 10,
        fontFamily: 'monospace', fontSize: 7, color: '#4a6880', lineHeight: 1.8,
      }}>
        <div style={{ fontSize: 8, color: '#00d4ff', fontWeight: 700, marginBottom: 4 }}>OpenClaw Stack Architecture</div>
        <div style={{ color: '#f59e0b' }}>TradingView</div>
        <div style={{ paddingLeft: 8 }}>↓ webhook</div>
        <div style={{ color: '#00d4ff', paddingLeft: 8 }}>n8n (Railway)</div>
        <div style={{ paddingLeft: 16 }}>├─→ <span style={{ color: '#10b981' }}>agent_api.py</span> (Railway internal)</div>
        <div style={{ paddingLeft: 16 }}>├─→ <span style={{ color: '#5865f2' }}>Discord</span> (webhooks)</div>
        <div style={{ paddingLeft: 16 }}>├─→ <span style={{ color: '#f97316' }}>Etsy API</span></div>
        <div style={{ paddingLeft: 16 }}>├─→ <span style={{ color: '#e11d48' }}>Pinterest + Instagram</span></div>
        <div style={{ paddingLeft: 16 }}>├─→ <span style={{ color: '#34a853' }}>Google Sheets</span> (logging)</div>
        <div style={{ paddingLeft: 16 }}>└─→ <span style={{ color: '#7c3aed' }}>OpenAI</span> (captions + reports)</div>
      </div>

      {/* Priority summary */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {(['high', 'medium', 'low'] as const).map(p => {
          const count = WORKFLOWS.filter(w => w.priority === p).length
          const color = PRIORITY_COLOR[p]
          const labels = { high: 'P1 · Build first', medium: 'P2 · Week 2', low: 'P3 · When stable' }
          return (
            <div key={p} style={{
              flex: 1, background: color + '10', border: `1px solid ${color}30`,
              borderRadius: 5, padding: '5px 6px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color, fontFamily: 'monospace' }}>{count} wf</div>
              <div style={{ fontSize: 6, color: '#4a5870', marginTop: 1 }}>{labels[p]}</div>
            </div>
          )
        })}
      </div>

      {/* Railway deploy checklist */}
      <div style={{ marginBottom: 10 }}>
        <button
          onClick={() => setShowDeploy(d => !d)}
          style={{
            width: '100%', background: showDeploy ? 'rgba(0,212,255,0.08)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${showDeploy ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.06)'}`,
            borderRadius: 7, padding: '7px 10px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <span style={{ fontSize: 13 }}>🚀</span>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: showDeploy ? '#00d4ff' : '#c8ccd8' }}>Railway Deployment</div>
            <div style={{ fontSize: 7, color: '#4a5870' }}>Setup once — all 7 workflows run here</div>
          </div>
          <div style={{ fontSize: 8, color: deployDone === DEPLOY_STEPS.length ? '#10b981' : '#00d4ff', fontFamily: 'monospace', fontWeight: 700 }}>
            {deployDone}/{DEPLOY_STEPS.length}
          </div>
        </button>

        {showDeploy && (
          <div style={{ paddingTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {DEPLOY_STEPS.map(step => {
              const done = deployChecked.has(step.id)
              return (
                <div
                  key={step.id}
                  onClick={() => toggleDeploy(step.id)}
                  style={{
                    display: 'flex', gap: 8, padding: '5px 10px',
                    background: done ? 'rgba(0,212,255,0.05)' : 'rgba(255,255,255,0.02)',
                    borderRadius: 5, cursor: 'pointer',
                    border: `1px solid ${done ? 'rgba(0,212,255,0.25)' : 'rgba(255,255,255,0.04)'}`,
                    opacity: done ? 0.7 : 1,
                  }}
                >
                  <div style={{
                    width: 14, height: 14, borderRadius: 3, flexShrink: 0, marginTop: 1,
                    border: `2px solid ${done ? '#00d4ff' : '#3a4860'}`,
                    background: done ? '#00d4ff' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {done && <span style={{ fontSize: 8, color: '#000' }}>✓</span>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 8, fontWeight: done ? 400 : 600, color: done ? '#4a5870' : '#d0d8e8', textDecoration: done ? 'line-through' : 'none' }}>
                      {step.text}
                    </div>
                    <div style={{ fontSize: 7, color: '#3a4060', marginTop: 1 }}>{step.detail}</div>
                    {step.cmd && !done && (
                      <div style={{ fontSize: 6, fontFamily: 'monospace', color: '#00d4ff', marginTop: 2, background: 'rgba(0,212,255,0.06)', padding: '1px 4px', borderRadius: 3, display: 'inline-block' }}>
                        {step.cmd}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Workflows */}
      <div style={{ fontSize: 8, color: '#4a5870', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
        ⚡ Workflows
      </div>
      {WORKFLOWS.map(wf => (
        <WorkflowCard
          key={wf.id}
          wf={wf}
          expanded={expandedWf === wf.id}
          onToggle={() => setExpandedWf(id => id === wf.id ? '' : wf.id)}
        />
      ))}

      {/* Build order */}
      <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: 7 }}>
        <div style={{ fontSize: 8, color: '#a78bfa', fontWeight: 700, marginBottom: 5 }}>🗓️ Recommended Build Order</div>
        {[
          { day: 'Day 1', task: 'Railway deploy + credentials setup', color: '#00d4ff' },
          { day: 'Day 2', task: 'Trading Signal Pipeline + Trade Result Logger', color: '#10b981' },
          { day: 'Day 3', task: 'Etsy Sale Automation', color: '#f97316' },
          { day: 'Day 4', task: 'New Listing → Social Pipeline', color: '#ec4899' },
          { day: 'Day 5', task: 'Pinterest Content Calendar', color: '#e11d48' },
          { day: 'Day 6', task: 'Analysis Desk Health Monitor', color: '#7c3aed' },
          { day: 'Day 7', task: 'Daily Business Report', color: '#f5c842' },
        ].map((r, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, padding: '3px 0', borderBottom: i < 6 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
            <span style={{ fontSize: 7, color: r.color, fontFamily: 'monospace', fontWeight: 700, width: 34, flexShrink: 0 }}>{r.day}</span>
            <span style={{ fontSize: 7, color: '#5a6880' }}>{r.task}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 8, fontSize: 7, color: '#2a3040', textAlign: 'center' }}>
        Deploy checklist persists in browser · Workflows version-controlled in repo
      </div>
    </div>
  )
}
