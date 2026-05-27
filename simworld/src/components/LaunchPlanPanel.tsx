import { useState, useEffect } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CheckItem {
  id: string
  text: string
  detail?: string
  link?: string
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

// ── Data ──────────────────────────────────────────────────────────────────────

const PHASES: Phase[] = [
  {
    id: 'foundation',
    title: 'Foundation',
    icon: '🏗️',
    subtitle: 'Week 1–2 · Zero Cost',
    color: '#6366f1',
    items: [
      { id: 'etsy_account', text: 'Create Etsy seller account', detail: 'etsy.com/sell — free, takes 10 min. Use a business email.', free: true },
      { id: 'shop_name',    text: 'Choose a shop name', detail: 'OpenClaw Prints, OpenClaw Planners, or similar. Check it\'s available on Etsy.', free: true },
      { id: 'competitor',   text: 'Research 10 competitor shops', detail: 'Search "daily planner printable" — study titles, tags, mockups, prices of top sellers.', free: true },
      { id: 'canva_pro',    text: 'Organize Canva Pro workspace', detail: 'Create a Brand Kit (colors, fonts). Set up template folders per product type.', free: true },
      { id: 'shop_banner',  text: 'Design shop banner & logo', detail: 'Use Canva\'s Etsy shop banner template. Keep it clean — lifestyle + planner aesthetic.', free: true },
      { id: 'about_section',text: 'Write shop About & Policies', detail: 'Tell your story. Mention instant digital download, printable at home, US Letter & A4 versions.', free: true },
    ],
  },
  {
    id: 'first_products',
    title: 'First Products',
    icon: '✏️',
    subtitle: 'Week 2–3 · Design in Canva',
    color: '#ec4899',
    items: [
      { id: 'daily_planner',    text: 'Daily Planner Pages (A4 + US Letter)', detail: 'Time-blocked layout. Make undated so it sells forever. First product to list.', free: true },
      { id: 'weekly_tracker',   text: 'Weekly Habit Tracker', detail: 'Simple grid layout. Add a "reflection" box. Very searchable niche.', free: true },
      { id: 'budget_tracker',   text: 'Monthly Budget Tracker + Bill Tracker', detail: 'Bundle these. Finance planners sell year-round — huge niche.', free: true },
      { id: 'gratitude_journal',text: 'Gratitude Journal Pages (30 days)', detail: 'Wellness niche is booming. Soft pastel aesthetic sells well.', free: true },
      { id: 'goal_workbook',    text: 'Goal Setting Workbook', detail: 'New year & back-to-school season spike. Include vision board page.', free: true },
      { id: 'mockups',          text: 'Create mockup images in Canva', detail: 'Use Canva\'s phone/tablet mockup frames. Show printed on a desk. Light & airy.', free: true },
    ],
  },
  {
    id: 'listings',
    title: 'SEO & Listings',
    icon: '🔎',
    subtitle: 'Week 3 · Keywords are everything',
    color: '#06b6d4',
    items: [
      { id: 'keyword_research', text: 'Research keywords with Etsy search bar', detail: 'Type "daily planner" and note every autocomplete suggestion — these are real search terms.', free: true },
      { id: 'erank',            text: 'Install eRank (free tier)', detail: 'erank.com — free keyword research tool specific to Etsy. Find low-competition, high-traffic terms.', link: 'https://erank.com', free: true },
      { id: 'titles',           text: 'Write SEO titles (lead with keywords)', detail: 'Format: [Main Keyword] | [Secondary Keyword] — [Feature] — Printable PDF. First 3 words matter most.', free: true },
      { id: 'tags',             text: 'Fill all 13 tags per listing', detail: 'Use long-tail phrases, not single words. "daily planner printable 2025" beats "planner".', free: true },
      { id: 'pricing',          text: 'Price singles $3.99–$6.99, bundles $9.99–$14.99', detail: 'Match top competitors to start. Once you have reviews, test 10% price increases.', free: true },
      { id: 'descriptions',     text: 'Write keyword-rich descriptions', detail: 'First 3 lines appear in Google. Lead with the benefit, list what\'s included, mention "instant download".', free: true },
    ],
  },
  {
    id: 'traffic',
    title: 'Free Traffic',
    icon: '📌',
    subtitle: 'Ongoing · Pinterest first',
    color: '#10b981',
    items: [
      { id: 'pinterest_biz',  text: 'Create Pinterest Business account', detail: 'Free. Enable Rich Pins. Connect to Etsy shop for automatic product pins.', link: 'https://business.pinterest.com', free: true },
      { id: 'pinterest_pins', text: 'Pin each product 3–5 times per week', detail: 'Design vertical pins (1000×1500px) in Canva. Include product title as text overlay.', free: true },
      { id: 'pinterest_boards',text: 'Create keyword-targeted boards', detail: '"Daily Planner Printables", "Budget Tracker Ideas", "Bullet Journal Inspiration" — search-optimized board names.', free: true },
      { id: 'instagram',      text: 'Set up Instagram business account', detail: 'Post mockup images + lifestyle shots. Use 15–20 relevant hashtags. Link to Etsy in bio.', free: true },
      { id: 'etsy_share',     text: 'Share listings via Etsy\'s built-in social tools', detail: 'Etsy lets you share to Facebook/Pinterest directly. Use it for every new listing.', free: true },
    ],
  },
  {
    id: 'scale',
    title: 'Scale & Revenue',
    icon: '📈',
    subtitle: 'Month 2+ · Reinvest & grow',
    color: '#f59e0b',
    items: [
      { id: 'first_sale',   text: 'Land first sale (milestone 🎉)', detail: 'First sale usually comes from SEO in 2–4 weeks. Message the buyer and ask for a review.', free: true },
      { id: 'bundles',      text: 'Create 3-product bundles', detail: 'Bundle daily planner + habit tracker + goal workbook = $12.99 bundle. Higher perceived value.', free: true },
      { id: 'reviews',      text: 'Follow up with buyers for reviews', detail: 'Use Etsy\'s Message to Buyers feature. Send a thank-you with tips for printing.', free: true },
      { id: 'etsy_ads_test',text: 'Test Etsy Ads at $1/day', detail: 'Once you have 10+ listings and first few reviews. Run for 30 days, pause poor performers.', free: false },
      { id: 'seasonal_packs',text: 'Launch seasonal collection', detail: 'Back-to-school (July–Aug), New Year planning set (Dec), Valentine\'s Day (Jan). Plan 6 weeks ahead.', free: true },
      { id: 'new_products',  text: 'Add 2–3 new products per week', detail: 'Etsy rewards active shops. More listings = more organic impressions. Aim for 50 listings in 3 months.', free: true },
    ],
  },
]

const REVENUE_MILESTONES = [
  { amount: 10,    label: 'First $10',    icon: '🌱', note: 'Proof of concept' },
  { amount: 100,   label: 'First $100',   icon: '🚀', note: 'Cover Etsy fees, reinvest' },
  { amount: 500,   label: 'First $500',   icon: '💪', note: 'Test Etsy Ads, buy mockup tool' },
  { amount: 1000,  label: '$1K Revenue',  icon: '🏅', note: 'Star Seller path, real income' },
  { amount: 5000,  label: '$5K Revenue',  icon: '🔥', note: 'Hire designer for bundles' },
  { amount: 10000, label: '$10K Revenue', icon: '👑', note: 'Full product line + multiple niches' },
]

const STORAGE_KEY = 'openclaw_etsy_checklist'

// ── Components ────────────────────────────────────────────────────────────────

function PhaseSection({ phase, checked, onToggle, expanded, onToggleExpand }: {
  phase: Phase
  checked: Set<string>
  onToggle: (id: string) => void
  expanded: boolean
  onToggleExpand: () => void
}) {
  const doneCount = phase.items.filter(i => checked.has(i.id)).length
  const total = phase.items.length
  const pct = Math.round((doneCount / total) * 100)

  return (
    <div style={{ marginBottom: 8 }}>
      {/* Phase header */}
      <button
        onClick={onToggleExpand}
        style={{
          width: '100%', background: expanded ? phase.color + '15' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${expanded ? phase.color + '40' : 'rgba(255,255,255,0.06)'}`,
          borderRadius: 7, padding: '8px 10px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s',
        }}
      >
        <span style={{ fontSize: 14 }}>{phase.icon}</span>
        <div style={{ flex: 1, textAlign: 'left' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: expanded ? phase.color : '#c8ccd8' }}>
            {phase.title}
          </div>
          <div style={{ fontSize: 8, color: '#4a5870' }}>{phase.subtitle}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 9, color: doneCount === total ? '#10b981' : phase.color, fontFamily: 'monospace', fontWeight: 700 }}>
            {doneCount}/{total}
          </div>
          <div style={{ width: 40, background: '#1a1c28', borderRadius: 2, height: 3, marginTop: 2 }}>
            <div style={{ width: `${pct}%`, height: '100%', background: doneCount === total ? '#10b981' : phase.color, transition: 'width 0.4s' }} />
          </div>
        </div>
      </button>

      {/* Items */}
      {expanded && (
        <div style={{ paddingTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {phase.items.map(item => {
            const done = checked.has(item.id)
            return (
              <div
                key={item.id}
                onClick={() => onToggle(item.id)}
                style={{
                  display: 'flex', gap: 8, padding: '6px 10px',
                  background: done ? phase.color + '0a' : 'rgba(255,255,255,0.02)',
                  borderRadius: 5, cursor: 'pointer',
                  border: `1px solid ${done ? phase.color + '30' : 'rgba(255,255,255,0.04)'}`,
                  opacity: done ? 0.7 : 1, transition: 'all 0.15s',
                }}
              >
                <div style={{
                  width: 14, height: 14, borderRadius: 3, flexShrink: 0, marginTop: 1,
                  border: `2px solid ${done ? phase.color : '#3a4860'}`,
                  background: done ? phase.color : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {done && <span style={{ fontSize: 8, color: '#fff' }}>✓</span>}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 9, color: done ? '#5a6880' : '#d0d8e8', fontWeight: done ? 400 : 600, textDecoration: done ? 'line-through' : 'none' }}>
                    {item.text}
                    {item.free && <span style={{ marginLeft: 4, fontSize: 7, color: '#10b981', background: 'rgba(16,185,129,0.15)', padding: '1px 3px', borderRadius: 2 }}>FREE</span>}
                  </div>
                  {item.detail && (
                    <div style={{ fontSize: 7, color: '#3a4860', marginTop: 1, lineHeight: 1.4 }}>{item.detail}</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function LaunchPlanPanel() {
  const [checked, setChecked] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? new Set(JSON.parse(saved)) : new Set()
    } catch { return new Set() }
  })
  const [expandedPhase, setExpandedPhase] = useState<string>('foundation')

  const totalItems = PHASES.reduce((s, p) => s + p.items.length, 0)
  const totalDone  = PHASES.reduce((s, p) => s + p.items.filter(i => checked.has(i.id)).length, 0)

  function toggle(id: string) {
    setChecked(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
      return next
    })
  }

  return (
    <div style={{
      width: '100%', background: 'rgba(10,12,20,0.98)',
      padding: '10px', overflowY: 'auto',
      fontSize: 11, color: '#c8ccd8',
      display: 'flex', flexDirection: 'column', gap: 0,
    }}>

      {/* Header */}
      <div style={{ textAlign: 'center', padding: '6px 0 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#f97316' }}>🧶 Real Etsy Launch Plan</div>
        <div style={{ fontSize: 9, color: '#5a6880', marginTop: 2 }}>
          Printables & Planners · Canva Pro · $0 Bootstrap
        </div>
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#4a5870', marginBottom: 3 }}>
            <span>Overall Progress</span>
            <span style={{ color: '#f97316', fontFamily: 'monospace', fontWeight: 700 }}>{totalDone}/{totalItems} steps</span>
          </div>
          <div style={{ background: '#1a1c28', borderRadius: 4, height: 6, overflow: 'hidden' }}>
            <div style={{ width: `${(totalDone / totalItems) * 100}%`, height: '100%', background: 'linear-gradient(90deg, #f97316, #f59e0b)', transition: 'width 0.5s' }} />
          </div>
        </div>
      </div>

      {/* Niche info */}
      <div style={{
        background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.2)',
        borderRadius: 7, padding: '8px 10px', marginBottom: 12, fontSize: 8, color: '#d0c8b8',
        lineHeight: 1.5,
      }}>
        <span style={{ color: '#f97316', fontWeight: 700 }}>Why printables + Canva Pro?</span>
        {' '}Zero inventory, instant delivery, made once — sold forever. Canva Pro templates = professional quality without design school. Average Etsy printables seller earns $500–$3K/month within 6 months starting with free traffic only.
      </div>

      {/* Phase checklist */}
      {PHASES.map(phase => (
        <PhaseSection
          key={phase.id}
          phase={phase}
          checked={checked}
          onToggle={toggle}
          expanded={expandedPhase === phase.id}
          onToggleExpand={() => setExpandedPhase(p => p === phase.id ? '' : phase.id)}
        />
      ))}

      {/* Revenue milestones */}
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 9, color: '#4a5870', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
          💰 Revenue Milestones
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {REVENUE_MILESTONES.map(m => (
            <div
              key={m.amount}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 8px', borderRadius: 5,
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.04)',
              }}
            >
              <span style={{ fontSize: 12 }}>{m.icon}</span>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: '#d0d8e8', fontFamily: 'monospace' }}>{m.label}</span>
                <span style={{ fontSize: 8, color: '#4a5870', marginLeft: 6 }}>{m.note}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Key tips */}
      <div style={{ marginTop: 12, padding: '8px 10px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 7 }}>
        <div style={{ fontSize: 8, color: '#818cf8', fontWeight: 700, marginBottom: 5 }}>⚡ Bootstrap Tips</div>
        {[
          'First 90 days: focus on volume of listings, not perfection',
          'Undated planners = no annual redesign needed (evergreen)',
          'Pinterest drives 60–70% of traffic for printables sellers',
          'Offer US Letter + A4 in every product — more buyers',
          'Bundles earn 3–4× more per transaction than singles',
          'Reply to every review and message within 24 hours',
        ].map((tip, i) => (
          <div key={i} style={{ fontSize: 7, color: '#5a6880', padding: '2px 0', borderBottom: i < 5 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}>
            → {tip}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 8, fontSize: 7, color: '#2a3040', textAlign: 'center' }}>
        Progress saved in browser · Not connected to live Etsy API
      </div>
    </div>
  )
}
