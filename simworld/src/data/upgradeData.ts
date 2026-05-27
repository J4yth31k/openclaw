import type { UpgradeDef } from '../types'

// ── Upgrade definitions ───────────────────────────────────────────────────────
// All costs in USD (deducted from creative.cash).
// Effects stack multiplicatively for speed boosts, additively for pass rates.

export const UPGRADE_DEFS: UpgradeDef[] = [

  // ── Tools ──────────────────────────────────────────────────────────────────

  {
    id: 'brand_kit',
    name: 'Brand Kit',
    description: 'Consistent colors & fonts across all listings — looks pro, builds trust',
    icon: '🎨',
    category: 'tools',
    cost: 45,
    maxLevel: 1,
    effect: { saleRateBoost: 0.08 },
  },

  {
    id: 'mockup_kit',
    name: 'Mockup Kit',
    description: 'Styled product mockups on desk & iPad — dramatically boosts click-through rate',
    icon: '🖼️',
    category: 'tools',
    cost: 85,
    maxLevel: 1,
    requires: 'brand_kit',
    effect: { saleRateBoost: 0.20, viewsBoost: 0.25 },
  },

  {
    id: 'seo_toolkit',
    name: 'SEO Toolkit',
    description: 'Deep keyword research finds low-competition, high-volume terms',
    icon: '🔎',
    category: 'tools',
    cost: 120,
    maxLevel: 2,
    effect: { saleRateBoost: 0.15, viewsBoost: 0.20 },
  },

  {
    id: 'pinterest',
    name: 'Pinterest Engine',
    description: 'Automated pins drive evergreen organic traffic — biggest free traffic source',
    icon: '📌',
    category: 'tools',
    cost: 60,
    maxLevel: 3,
    effect: { viewsBoost: 0.30, saleRateBoost: 0.10 },
  },

  {
    id: 'bulk_creator',
    name: 'Bulk Creator Mode',
    description: 'Expand pipeline capacity — double how many products can be in-progress',
    icon: '⚡',
    category: 'tools',
    cost: 200,
    maxLevel: 2,
    requires: 'mockup_kit',
    effect: { maxProductsBoost: 4 },
  },

  {
    id: 'bundle_maker',
    name: 'Bundle Packs',
    description: 'Group 3-5 related products — raises average order value by +30%',
    icon: '🎁',
    category: 'tools',
    cost: 150,
    maxLevel: 2,
    requires: 'seo_toolkit',
    effect: { saleRateBoost: 0.12, viewsBoost: 0.10 },
  },

  {
    id: 'seasonal',
    name: 'Seasonal Collections',
    description: 'Holiday-themed bundles spike during Q4 and back-to-school seasons',
    icon: '🍂',
    category: 'tools',
    cost: 100,
    maxLevel: 1,
    effect: { saleRateBoost: 0.15 },
  },

  // ── Ads ────────────────────────────────────────────────────────────────────

  {
    id: 'etsy_ads_basic',
    name: 'Etsy Ads — $1/day',
    description: 'Paid ads put top listings in front of buyers. Costs $1/sim-day.',
    icon: '📢',
    category: 'ads',
    cost: 0,                  // free to enable — recurring daily cost
    maxLevel: 1,
    effect: { saleRateBoost: 0.30, dailyCost: 30 },
  },

  {
    id: 'etsy_ads_pro',
    name: 'Etsy Ads — $5/day',
    description: 'Heavy ad spend — maximum exposure across your whole catalog.',
    icon: '📣',
    category: 'ads',
    cost: 0,
    maxLevel: 1,
    requires: 'etsy_ads_basic',
    effect: { saleRateBoost: 0.60, viewsBoost: 0.40, dailyCost: 150 },
  },

  // ── Agent upgrades ─────────────────────────────────────────────────────────

  {
    id: 'design_system',
    name: 'Design System',
    description: 'Dani uses a pre-built component library — designs 40% faster per level',
    icon: '🗂️',
    category: 'agent',
    cost: 200,
    maxLevel: 2,
    effect: { designSpeedBoost: 0.40 },
  },

  {
    id: 'qc_app',
    name: 'QC Checklist App',
    description: 'Quinn follows a structured review process — 95% pass rate & 30% faster',
    icon: '✅',
    category: 'agent',
    cost: 100,
    maxLevel: 1,
    effect: { qcPassBoost: 0.10, qcSpeedBoost: 0.30 },
  },

  {
    id: 'batch_lister',
    name: 'Batch Listing Tool',
    description: 'Uly auto-fills tags, descriptions, and shipping profiles — 50% faster per level',
    icon: '📦',
    category: 'agent',
    cost: 150,
    maxLevel: 2,
    effect: { listingSpeedBoost: 0.50 },
  },

  {
    id: 'trend_alerts',
    name: 'Trend Alert Pro',
    description: 'Reya gets real-time niche signals — ideas arrive 25% faster per level',
    icon: '📡',
    category: 'agent',
    cost: 175,
    maxLevel: 2,
    effect: { ideaSpeedBoost: 0.25 },
  },

  // ── Milestones (auto-unlock, no cost) ─────────────────────────────────────

  {
    id: 'star_seller',
    name: 'Star Seller Badge',
    description: 'Earned at 100% Star Seller progress. Etsy promotes your shop shop-wide.',
    icon: '⭐',
    category: 'milestone',
    cost: 0,
    maxLevel: 1,
    effect: { saleRateBoost: 0.10 },
  },

  {
    id: 'milestone_100',
    name: '100 Sales Club',
    description: 'Shop authority increases — Etsy algorithm favors established sellers.',
    icon: '🏅',
    category: 'milestone',
    cost: 0,
    maxLevel: 1,
    effect: { saleRateBoost: 0.05, viewsBoost: 0.10 },
  },

  {
    id: 'milestone_1000',
    name: '1000 Sales Milestone',
    description: 'Elite seller status — unlock premium price points and Featured Shop slot.',
    icon: '🏆',
    category: 'milestone',
    cost: 0,
    maxLevel: 1,
    effect: { saleRateBoost: 0.10, viewsBoost: 0.20 },
  },
]

// ── Computed effects from owned upgrades ──────────────────────────────────────

export interface ActiveEffects {
  saleRateMultiplier: number    // multiplicative on base sale chance
  designDivisor: number         // divide STAGE_DURATION.design by this
  qcDivisor: number
  listingDivisor: number
  qcPassRate: number            // 0–0.99
  ideaIntervalDivisor: number   // divide IDEA_INTERVAL by this
  viewsMultiplier: number
  pipelineCap: number
  extraDailyCost: number        // additional daily expense from ads
}

export function computeEffects(
  ownedUpgrades: Array<{ id: string; level: number }>,
): ActiveEffects {
  let saleMult         = 1.0
  let designSpeed      = 1.0
  let qcSpeed          = 1.0
  let listingSpeed     = 1.0
  let qcPassRate       = 0.85
  let ideaSpeed        = 1.0
  let viewsMult        = 1.0
  let pipelineCap      = 4
  let extraDailyCost   = 0

  for (const owned of ownedUpgrades) {
    const def = UPGRADE_DEFS.find(u => u.id === owned.id)
    if (!def) continue
    const { effect: e } = def
    const lvl = owned.level

    if (e.saleRateBoost)      saleMult       += e.saleRateBoost * lvl
    if (e.designSpeedBoost)   designSpeed    += e.designSpeedBoost * lvl
    if (e.qcSpeedBoost)       qcSpeed        += e.qcSpeedBoost * lvl
    if (e.listingSpeedBoost)  listingSpeed   += e.listingSpeedBoost * lvl
    if (e.qcPassBoost)        qcPassRate      = Math.min(0.99, qcPassRate + e.qcPassBoost * lvl)
    if (e.ideaSpeedBoost)     ideaSpeed      += e.ideaSpeedBoost * lvl
    if (e.viewsBoost)         viewsMult      += e.viewsBoost * lvl
    if (e.maxProductsBoost)   pipelineCap    += e.maxProductsBoost * lvl
    if (e.dailyCost)          extraDailyCost += e.dailyCost * lvl
  }

  return {
    saleRateMultiplier:  saleMult,
    designDivisor:       designSpeed,
    qcDivisor:           qcSpeed,
    listingDivisor:      listingSpeed,
    qcPassRate,
    ideaIntervalDivisor: ideaSpeed,
    viewsMultiplier:     viewsMult,
    pipelineCap,
    extraDailyCost,
  }
}
