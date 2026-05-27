import { useState } from 'react'
import { useSimStore } from '../store'

// ── Agent display map ─────────────────────────────────────────────────────────

const AGENT_INFO: Record<string, { name: string; color: string; emoji: string }> = {
  research_agent: { name: 'Reya',  color: '#6366f1', emoji: '🔍' },
  design_agent:   { name: 'Dani',  color: '#ec4899', emoji: '✏️' },
  qc_agent:       { name: 'Quinn', color: '#f59e0b', emoji: '✅' },
  upload_agent:   { name: 'Uly',   color: '#06b6d4', emoji: '📦' },
}

// ── Which agent owns each item ────────────────────────────────────────────────

const ITEM_AGENT: Record<string, string> = {
  etsy_account: 'research_agent', shop_name: 'research_agent',
  competitor: 'research_agent',   canva_pro: 'design_agent',
  shop_banner: 'design_agent',    about_section: 'upload_agent',
  daily_planner: 'design_agent',  weekly_tracker: 'design_agent',
  budget_tracker: 'design_agent', gratitude_journal: 'design_agent',
  goal_workbook: 'design_agent',  mockups: 'qc_agent',
  keyword_research: 'research_agent', erank: 'research_agent',
  titles: 'upload_agent',         tags: 'upload_agent',
  pricing: 'upload_agent',        descriptions: 'upload_agent',
  pinterest_biz: 'research_agent',pinterest_pins: 'research_agent',
  pinterest_boards: 'research_agent', instagram: 'design_agent',
  etsy_share: 'upload_agent',
  bundles: 'design_agent',        reviews: 'upload_agent',
  seasonal_packs: 'design_agent', new_products: 'research_agent',
}

// ── What each item is "waiting for" (shown when in-progress) ─────────────────

const ITEM_WAITING: Record<string, string> = {
  etsy_account: 'Day 1 09:00', shop_name: 'Day 1 09:00', canva_pro: 'Day 1 09:00',
  competitor: 'Day 1 11:00', shop_banner: '18 products live', about_section: 'Day 1 14:00',
  daily_planner: '18 products live', weekly_tracker: '19 products live',
  budget_tracker: '20 products live', gratitude_journal: '21 products live',
  goal_workbook: '22 products live', mockups: '19 products live',
  keyword_research: 'Day 2 09:00', erank: 'Day 2 10:00',
  titles: '20 products live', tags: '21 products live',
  pricing: '22 products live', descriptions: '22 products + Day 2',
  pinterest_biz: 'Day 2 14:00', pinterest_pins: 'Day 3 09:00',
  pinterest_boards: 'Day 3 10:00', instagram: 'Day 3 11:00',
  etsy_share: 'Day 3 12:00', first_sale: 'First new sale',
  bundles: '25 products live', reviews: '130+ reviews',
  etsy_ads_test: 'Day 4', seasonal_packs: '28 products live',
  new_products: '30 products live',
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface CheckItem {
  id: string
  text: string
  detail?: string
  free?: boolean
}

interface Phase {
  id: string
  title: string
  icon: string
  subtitle: string
  color: string
  items: CheckItem[]
}

// ── Phase data ────────────────────────────────────────────────────────────────

const PHASES: Phase[] = [
  {
    id: 'foundation', title: 'Foundation', icon: '🏗️',
    subtitle: 'Day 1 · Agents setting up shop', color: '#6366f1',
    items: [
      { id: 'etsy_account',  text: 'Register Etsy seller account',        detail: 'etsy.com/sell — free, takes 10 min. Use a business email.', free: true },
      { id: 'shop_name',     text: 'Confirm shop name "OpenClaw Crafts"', detail: 'Check availability on Etsy — brand name is clean and memorable.', free: true },
      { id: 'canva_pro',     text: 'Set up Canva Pro Brand Kit',          detail: 'Lock in colors, fonts, and logo for consistent shop aesthetic.', free: true },
      { id: 'competitor',    text: 'Research 10 competitor shops',        detail: 'Analyze titles, tags, prices, and mockup styles of top planner sellers.', free: true },
      { id: 'shop_banner',   text: 'Design shop banner & logo',           detail: 'Light & airy lifestyle aesthetic — think planner on a clean desk.', free: true },
      { id: 'about_section', text: 'Write shop About & Policies',         detail: 'Mention instant download, US Letter + A4, and 5-star guarantee.', free: true },
    ],
  },
  {
    id: 'first_products', title: 'First Products', icon: '✏️',
    subtitle: 'Day 1–2 · Dani designing, Quinn approving, Uly listing', color: '#ec4899',
    items: [
      { id: 'daily_planner',     text: 'Daily Planner Pages (A4 + US Letter)',       detail: 'Undated, time-blocked layout. Top seller in the planner niche.', free: true },
      { id: 'weekly_tracker',    text: 'Weekly Habit Tracker',                        detail: 'Simple grid + reflection box. Evergreen — sells year-round.', free: true },
      { id: 'budget_tracker',    text: 'Monthly Budget Tracker + Bill Pay Calendar', detail: 'Finance planner bundle. One of the highest-search printable niches.', free: true },
      { id: 'gratitude_journal', text: 'Gratitude Journal Pages (30-day edition)',   detail: 'Wellness niche is booming. Soft pastel aesthetic converts well.', free: true },
      { id: 'goal_workbook',     text: 'Goal Setting Workbook + Vision Board',       detail: 'New Year + back-to-school spike annually. Include quarterly reviews.', free: true },
      { id: 'mockups',           text: 'Product mockups (iPad + desk scenes)',        detail: 'Quinn verifies quality + Canva mockup frames. Light, lifestyle aesthetic.', free: true },
    ],
  },
  {
    id: 'listings', title: 'SEO & Listings', icon: '🔎',
    subtitle: 'Day 2 · Uly & Reya optimizing', color: '#06b6d4',
    items: [
      { id: 'keyword_research', text: 'Map high-volume, low-competition keywords',      detail: 'Use Etsy autocomplete + eRank free tier. Long-tail beats single words.', free: true },
      { id: 'erank',            text: 'Install eRank free tier',                        detail: 'erank.com — Etsy-specific keyword tool. Find the gap between search & competition.', free: true },
      { id: 'titles',           text: 'Write keyword-first listing titles',             detail: 'Format: "Daily Planner Printable | Undated Planner Pages | A4 PDF Instant Download"', free: true },
      { id: 'tags',             text: 'Fill all 13 tags per listing',                   detail: 'Long-tail phrases only. "daily planner 2025 printable" > "planner".', free: true },
      { id: 'pricing',          text: 'Set competitive prices',                         detail: 'Singles $3.99–$6.99 · Bundles $9.99–$14.99. Match top sellers initially.', free: true },
      { id: 'descriptions',     text: 'Write keyword-rich descriptions',                detail: 'Lead with the benefit. First 3 lines show in Google. Include "instant download" prominently.', free: true },
    ],
  },
  {
    id: 'traffic', title: 'Free Traffic', icon: '📌',
    subtitle: 'Day 2–3 · Reya building organic channels', color: '#10b981',
    items: [
      { id: 'pinterest_biz',   text: 'Create Pinterest Business account + Rich Pins', detail: 'Free. Rich Pins pull product data automatically from Etsy.', free: true },
      { id: 'pinterest_pins',  text: 'Pin each product 3–5× per week',               detail: 'Vertical pins 1000×1500px in Canva. Text overlay with product title.', free: true },
      { id: 'pinterest_boards',text: 'Build SEO-targeted Pinterest boards',           detail: '"Daily Planner Printables", "Budget Tracker Ideas", "Habit Tracker Printable" — keyword-named boards.', free: true },
      { id: 'instagram',       text: 'Launch OpenClaw Instagram with mockup content', detail: 'Lifestyle shots, flat lays, reel previews of the planner. Link to Etsy in bio.', free: true },
      { id: 'etsy_share',      text: 'Share all listings via Etsy\'s social tools',  detail: 'Etsy shares to Facebook + Pinterest automatically. Announce every new listing.', free: true },
    ],
  },
  {
    id: 'scale', title: 'Scale & Revenue', icon: '📈',
    subtitle: 'Day 3+ · Milestone-driven', color: '#f59e0b',
    items: [
      { id: 'first_sale',    text: 'Land first new product sale 🎉',               detail: 'First organic sale usually comes 1–4 weeks in. Message buyer for a review.', free: true },
      { id: 'bundles',       text: 'Bundle top 3 planners — Ultimate Planner Pack', detail: '$12.99 bundle = 3× the revenue per transaction. Boosts average order value.', free: true },
      { id: 'reviews',       text: 'Follow up with buyers for reviews',             detail: 'Use Etsy\'s "Message to Buyers" automation. Thank + tip for printing.', free: true },
      { id: 'etsy_ads_test', text: 'Test Etsy Ads at $1/day',                      detail: 'Only after 10+ listings + first reviews. Run 30 days, cut poor performers.', free: false },
      { id: 'seasonal_packs',text: 'Launch seasonal collection',                    detail: 'Back-to-school (Jul–Aug), New Year set (Dec), Valentine\'s (Jan). Plan 6 weeks ahead.', free: true },
      { id: 'new_products',  text: 'Reach 30-listing milestone',                   detail: 'Etsy rewards active shops. More listings = more impressions. Target 50 in 3 months.', free: true },
    ],
  },
]

const REVENUE_MILESTONES = [
  { amount: 10,    label: 'First $10',   icon: '🌱', note: 'Proof of concept' },
  { amount: 100,   label: 'First $100',  icon: '🚀', note: 'Cover fees, reinvest' },
  { amount: 500,   label: '$500',        icon: '💪', note: 'Test Etsy Ads' },
  { amount: 1000,  label: '$1K',         icon: '🏅', note: 'Star Seller path' },
  { amount: 5000,  label: '$5K',         icon: '🔥', note: 'Outsource design' },
  { amount: 10000, label: '$10K',        icon: '👑', note: 'Multiple niches' },
]

// ── Item row ──────────────────────────────────────────────────────────────────

function ItemRow({ item, agentDone, manually, onToggle, phase }: {
  item: CheckItem
  agentDone: boolean
  manually: boolean
  onToggle: () => void
  phase: Phase
}) {
  const done = agentDone || manually
  const agentId = ITEM_AGENT[item.id]
  const agent = agentId ? AGENT_INFO[agentId] : null
  const waiting = ITEM_WAITING[item.id]

  return (
    <div
      onClick={!agentDone ? onToggle : undefined}
      style={{
        display: 'flex', gap: 8, padding: '6px 10px',
        background: done ? phase.color + '0a' : 'rgba(255,255,255,0.02)',
        borderRadius: 5,
        border: `1px solid ${done ? phase.color + '30' : 'rgba(255,255,255,0.04)'}`,
        opacity: done ? 0.75 : 1,
        cursor: agentDone ? 'default' : 'pointer',
        transition: 'all 0.2s',
      }}
    >
      {/* Checkbox / agent badge */}
      <div style={{ flexShrink: 0, marginTop: 2 }}>
        {agentDone && agent ? (
          <div style={{
            width: 18, height: 18, borderRadius: 4,
            background: agent.color + '30', border: `1.5px solid ${agent.color}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9,
          }}>
            {agent.emoji}
          </div>
        ) : (
          <div style={{
            width: 16, height: 16, borderRadius: 3,
            border: `2px solid ${manually ? phase.color : '#3a4860'}`,
            background: manually ? phase.color : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {manually && <span style={{ fontSize: 8, color: '#fff' }}>✓</span>}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 9, fontWeight: done ? 400 : 600,
            color: done ? '#5a6880' : '#d0d8e8',
            textDecoration: done ? 'line-through' : 'none',
          }}>
            {item.text}
          </span>
          {item.free && !done && (
            <span style={{ fontSize: 6, color: '#10b981', background: 'rgba(16,185,129,0.12)', padding: '1px 4px', borderRadius: 2, fontWeight: 700 }}>FREE</span>
          )}
          {agentDone && agent && (
            <span style={{ fontSize: 7, color: agent.color, fontFamily: 'monospace' }}>
              ✓ {agent.name}
            </span>
          )}
        </div>
        {!done && item.detail && (
          <div style={{ fontSize: 7, color: '#3a4860', marginTop: 1, lineHeight: 1.4 }}>{item.detail}</div>
        )}
        {!done && waiting && (
          <div style={{ fontSize: 7, color: '#2a3040', marginTop: 2, fontFamily: 'monospace' }}>
            ⏳ {waiting}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Phase section ─────────────────────────────────────────────────────────────

function PhaseSection({ phase, agentCompleted, manually, onToggle, expanded, onToggleExpand }: {
  phase: Phase
  agentCompleted: Set<string>
  manually: Set<string>
  onToggle: (id: string) => void
  expanded: boolean
  onToggleExpand: () => void
}) {
  const doneCount = phase.items.filter(i => agentCompleted.has(i.id) || manually.has(i.id)).length
  const agentCount = phase.items.filter(i => agentCompleted.has(i.id)).length
  const total = phase.items.length
  const pct = Math.round((doneCount / total) * 100)

  return (
    <div style={{ marginBottom: 6 }}>
      <button
        onClick={onToggleExpand}
        style={{
          width: '100%',
          background: expanded ? phase.color + '15' : (doneCount === total ? phase.color + '0a' : 'rgba(255,255,255,0.03)'),
          border: `1px solid ${expanded ? phase.color + '50' : doneCount === total ? phase.color + '30' : 'rgba(255,255,255,0.06)'}`,
          borderRadius: 7, padding: '7px 10px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s',
        }}
      >
        <span style={{ fontSize: 13 }}>{phase.icon}</span>
        <div style={{ flex: 1, textAlign: 'left' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: doneCount === total ? phase.color : expanded ? phase.color : '#c8ccd8' }}>
            {phase.title}
            {doneCount === total && ' ✓'}
          </div>
          <div style={{ fontSize: 7, color: '#4a5870' }}>{phase.subtitle}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 8, color: doneCount === total ? '#10b981' : phase.color, fontFamily: 'monospace', fontWeight: 700 }}>
            {doneCount}/{total}
            {agentCount > 0 && agentCount < doneCount && (
              <span style={{ color: '#3a4060', fontSize: 7 }}> ({agentCount} agent)</span>
            )}
          </div>
          <div style={{ width: 40, background: '#1a1c28', borderRadius: 2, height: 3, marginTop: 2, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: doneCount === total ? '#10b981' : phase.color, transition: 'width 0.5s' }} />
          </div>
        </div>
      </button>

      {expanded && (
        <div style={{ paddingTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {phase.items.map(item => (
            <ItemRow
              key={item.id}
              item={item}
              phase={phase}
              agentDone={agentCompleted.has(item.id)}
              manually={manually.has(item.id)}
              onToggle={() => onToggle(item.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'openclaw_etsy_manual'

export default function LaunchPlanPanel() {
  // Sim-driven completions
  const launchProgress  = useSimStore(s => s.creative.launchProgress ?? [])
  const agentCompleted  = new Set(launchProgress)
  const simDay          = useSimStore(s => s.time.day)
  const simHour         = useSimStore(s => s.time.hour)
  const completedProds  = useSimStore(s => s.creative.completedProducts)

  // Manual overrides (localStorage)
  const [manually, setManually] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? new Set(JSON.parse(saved)) : new Set()
    } catch { return new Set() }
  })
  const [expandedPhase, setExpandedPhase] = useState<string>('foundation')

  function toggleManual(id: string) {
    if (agentCompleted.has(id)) return  // agent already owns it
    setManually(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
      return next
    })
  }

  const allItems    = PHASES.flatMap(p => p.items)
  const totalDone   = allItems.filter(i => agentCompleted.has(i.id) || manually.has(i.id)).length
  const agentTotal  = allItems.filter(i => agentCompleted.has(i.id)).length
  const totalItems  = allItems.length

  // Progress estimate text
  let statusLine = `Day ${simDay} ${String(simHour).padStart(2,'0')}:00`
  if (totalDone === totalItems) statusLine = '🎉 All tasks complete!'
  else if (simDay >= 3)   statusLine = `Day ${simDay} — Scale phase active`
  else if (simDay >= 2)   statusLine = `Day ${simDay} — SEO & traffic phase`
  else if (simDay >= 1)   statusLine = `Day ${simDay} — Building & listing products`

  return (
    <div style={{
      width: '100%', background: 'rgba(10,12,20,0.98)',
      padding: '10px', overflowY: 'auto',
      fontSize: 11, color: '#c8ccd8',
      display: 'flex', flexDirection: 'column', gap: 0,
    }}>

      {/* Header */}
      <div style={{ textAlign: 'center', padding: '6px 0 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#f97316' }}>🧶 Real Etsy Launch Plan</div>
        <div style={{ fontSize: 8, color: '#5a6880' }}>Printables & Planners · Canva Pro · $0 Bootstrap</div>
        <div style={{ fontSize: 8, color: '#f59e0b', marginTop: 3, fontFamily: 'monospace' }}>{statusLine}</div>
        <div style={{ marginTop: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#4a5870', marginBottom: 2 }}>
            <span>{agentTotal} by agents · {manually.size} manual</span>
            <span style={{ color: '#f97316', fontFamily: 'monospace', fontWeight: 700 }}>{totalDone}/{totalItems}</span>
          </div>
          <div style={{ background: '#1a1c28', borderRadius: 4, height: 5, overflow: 'hidden' }}>
            <div style={{ width: `${(totalDone / totalItems) * 100}%`, height: '100%', background: 'linear-gradient(90deg,#f97316,#f5c842)', transition: 'width 0.6s' }} />
          </div>
        </div>
      </div>

      {/* Agent status */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap',
      }}>
        {Object.entries(AGENT_INFO).map(([id, a]) => {
          const count = launchProgress.filter(itemId => ITEM_AGENT[itemId] === id).length
          return (
            <div key={id} style={{
              flex: 1, minWidth: 55, background: a.color + '12',
              border: `1px solid ${a.color}30`, borderRadius: 5,
              padding: '4px 6px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 11 }}>{a.emoji}</div>
              <div style={{ fontSize: 8, color: a.color, fontWeight: 700 }}>{a.name}</div>
              <div style={{ fontSize: 7, color: '#3a4060', fontFamily: 'monospace' }}>{count} done</div>
            </div>
          )
        })}
      </div>

      {/* Progress bar: current sim day */}
      <div style={{
        background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.15)',
        borderRadius: 6, padding: '6px 10px', marginBottom: 10, fontSize: 8,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          {['Day 1\nFoundation', 'Day 2\nSEO', 'Day 3\nTraffic'].map((label, i) => {
            const dayNum = i + 1
            const active = simDay === dayNum
            const done   = simDay > dayNum
            return (
              <div key={i} style={{ textAlign: 'center', flex: 1 }}>
                <div style={{
                  fontSize: 8, fontWeight: 700,
                  color: done ? '#10b981' : active ? '#f97316' : '#2a3040',
                }}>
                  {done ? '✓' : active ? '▶' : '○'} {label.split('\n')[0]}
                </div>
                <div style={{ fontSize: 6, color: done ? '#4a5870' : active ? '#f59e0b' : '#2a3040' }}>
                  {label.split('\n')[1]}
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ background: '#1a1c28', borderRadius: 3, height: 4, overflow: 'hidden' }}>
          <div style={{
            width: `${Math.min(100, ((simDay - 1) / 3) * 100 + (simHour / 24) * 33)}%`,
            height: '100%', background: 'linear-gradient(90deg,#f97316,#f5c842)', transition: 'width 0.8s',
          }} />
        </div>
        <div style={{ fontSize: 7, color: '#3a4060', marginTop: 3, textAlign: 'center' }}>
          {completedProds} products live · Agents completing tasks automatically
        </div>
      </div>

      {/* Phase checklist */}
      {PHASES.map(phase => (
        <PhaseSection
          key={phase.id}
          phase={phase}
          agentCompleted={agentCompleted}
          manually={manually}
          onToggle={toggleManual}
          expanded={expandedPhase === phase.id}
          onToggleExpand={() => setExpandedPhase(p => p === phase.id ? '' : phase.id)}
        />
      ))}

      {/* Revenue milestones */}
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 8, color: '#4a5870', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
          💰 Revenue Milestones
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {REVENUE_MILESTONES.map(m => (
            <div key={m.amount} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '4px 8px', borderRadius: 5,
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.04)',
            }}>
              <span style={{ fontSize: 11 }}>{m.icon}</span>
              <span style={{ fontSize: 8, fontWeight: 700, color: '#d0d8e8', fontFamily: 'monospace', flex: 1 }}>{m.label}</span>
              <span style={{ fontSize: 7, color: '#4a5870' }}>{m.note}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tips */}
      <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 7 }}>
        <div style={{ fontSize: 8, color: '#818cf8', fontWeight: 700, marginBottom: 4 }}>⚡ Bootstrap Strategy</div>
        {[
          'Volume > perfection in the first 90 days',
          'Undated planners = evergreen (no annual redo)',
          'Pinterest drives 60–70% of printables traffic',
          'US Letter + A4 in every product = more buyers',
          'Bundles earn 3–4× more per transaction',
        ].map((tip, i) => (
          <div key={i} style={{ fontSize: 7, color: '#5a6880', padding: '2px 0', borderBottom: i < 4 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}>
            → {tip}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 8, fontSize: 7, color: '#2a3040', textAlign: 'center' }}>
        Agent completions auto-save · Manual checks persist in browser
      </div>
    </div>
  )
}
