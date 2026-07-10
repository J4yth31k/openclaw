import type { CreativeStudioStats, TradingStats, EtsyProduct, ProductCategory } from '../types'

// ── Product catalog ───────────────────────────────────────────────────────────

const PRODUCT_NAMES: Record<ProductCategory, string[]> = {
  Templates: [
    'Minimal Resume Pack', 'Modern Invoice Template', 'Canva Social Kit',
    'Portfolio Presentation', 'Business Proposal', 'Client Welcome Pack',
    'Press Kit Template', 'Email Newsletter Bundle', 'Wedding Invitation Set',
    'YouTube Banner Pack', 'Etsy Shop Banner', 'Pinterest Pins Pack',
    'Instagram Stories Kit', 'Brand Identity Bundle', 'Freelancer Starter Pack',
    'Real Estate Flyer', 'Food Menu Template', 'Event Program Template',
  ],
  Printables: [
    'Daily Planner Pages', 'Weekly Habit Tracker', 'Budget Worksheet',
    'Meal Planner Printable', 'Gratitude Journal Pages', 'Goal Setting Workbook',
    'Kids Chore Chart', 'Reading Log', 'Travel Packing List',
    'Wedding Planning Bundle', 'Baby Milestone Cards', 'Vision Board Kit',
    'Monthly Budget Tracker', 'Self-Care Checklist', 'Study Planner Pack',
    'Kids Learning Worksheets', 'Recipe Cards', 'Plant Care Cards',
  ],
  SVG: [
    'Floral Wreath Bundle', 'Boho Moon SVG Set', 'Christmas Cut Files',
    'Mandala Designs Pack', 'Calligraphy Quotes SVG', 'Farmhouse SVG Bundle',
    'Wildflower Bundle', 'Butterfly Collection', 'Celestial Elements Set',
    'Retro Text Effects', 'Nature Elements Pack', 'Holiday Mega Bundle',
    'Monogram Frames', 'Alphabet SVG Set', 'Tropical Leaves Bundle',
  ],
  'Digital Art': [
    'Watercolor Texture Pack', 'Procreate Brush Set', 'Abstract Backgrounds Bundle',
    'Aesthetic Desktop Wallpapers', 'Phone Wallpaper Pack', 'Boho Art Prints',
    'Gradient Collection', 'Vintage Illustration Set', 'Mushroom Art Prints',
    'Retro Poster Pack', 'Floral Pattern Collection', 'Celestial Art Prints',
  ],
  Notion: [
    'Ultimate Life OS', 'Student Dashboard', 'Freelancer Client Hub',
    'Content Creator Workspace', 'Finance Tracker Pro', 'Book Notes Template',
    'Project Manager Notion', 'Habit Tracker Dashboard', 'Business OS Bundle',
    'Second Brain Setup', 'Reading List Database', 'Travel Planner',
    'Fitness Tracker', 'Recipe & Meal Planner', 'Startup Dashboard',
  ],
  'Clip Art': [
    'Cute Animal Stickers', 'Kawaii Bundle', 'Boho Floral Clipart',
    'Watercolor Fruits Set', 'Halloween Clipart Bundle', 'Christmas Icons Pack',
    'Vintage Labels Collection', 'School Supplies Set', 'Food Illustration Pack',
    'Baby Shower Clipart', 'Spring Flowers Bundle', 'Fall Foliage Set',
  ],
}

const CATEGORY_PRICES: Record<ProductCategory, [number, number]> = {
  Templates:    [5.99, 18.99],
  Printables:   [2.99,  9.99],
  SVG:          [4.99, 14.99],
  'Digital Art':[6.99, 24.99],
  Notion:       [8.99, 34.99],
  'Clip Art':   [3.99, 11.99],
}

const ALL_CATEGORIES: ProductCategory[] = ['Templates', 'Printables', 'SVG', 'Digital Art', 'Notion', 'Clip Art']

// ── Trending niches ───────────────────────────────────────────────────────────

export interface TrendingNiche {
  name: string
  categories: ProductCategory[]
  multiplier: number
}

export const TRENDING_NICHES: TrendingNiche[] = [
  { name: 'Aesthetic Planners 📋',     categories: ['Printables', 'Notion'],          multiplier: 2.3 },
  { name: 'AI Productivity Tools 🤖',  categories: ['Templates', 'Notion'],           multiplier: 2.0 },
  { name: 'Small Biz Templates 💼',    categories: ['Templates', 'Printables'],       multiplier: 2.1 },
  { name: 'Boho Home Decor 🌿',        categories: ['SVG', 'Digital Art', 'Clip Art'],multiplier: 1.8 },
  { name: 'Self-Care & Wellness 🧘',   categories: ['Printables', 'Digital Art'],     multiplier: 1.9 },
  { name: 'Back to School 🏫',         categories: ['Printables', 'Templates', 'Clip Art'], multiplier: 2.2 },
  { name: 'Cottagecore Vibes 🍄',      categories: ['SVG', 'Digital Art', 'Clip Art'],multiplier: 1.7 },
  { name: 'Notion Templates Boom 📒',  categories: ['Notion'],                        multiplier: 2.5 },
  { name: 'Digital Scrapbooking ✂️',   categories: ['Clip Art', 'Digital Art'],       multiplier: 1.6 },
  { name: 'Minimalist Design 🎨',      categories: ['Templates', 'Digital Art'],      multiplier: 1.8 },
]

// ── Product factory ───────────────────────────────────────────────────────────

let _productCounter = 100

export function makeProductId() { return `p${++_productCounter}` }

export function makeProduct(
  stage: EtsyProduct['stage'] = 'idea',
  opts: { category?: ProductCategory; salesCount?: number; stageProgress?: number } = {}
): EtsyProduct {
  const category = opts.category ?? ALL_CATEGORIES[Math.floor(Math.random() * ALL_CATEGORIES.length)]
  const names    = PRODUCT_NAMES[category]
  const name     = names[Math.floor(Math.random() * names.length)]
  const [lo, hi] = CATEGORY_PRICES[category]
  // Price points: round to .99
  const rawPrice = lo + Math.random() * (hi - lo)
  const price    = Math.floor(rawPrice) + 0.99

  const salesCount = opts.salesCount ?? 0
  return {
    id: makeProductId(),
    name, category, price, stage,
    stageProgress: opts.stageProgress ?? (stage === 'selling' ? 100 : 0),
    salesCount,
    revenue: salesCount * price * 0.92,
    views:   salesCount * (8 + Math.floor(Math.random() * 20)),
    trend:   'normal',
    rating:  salesCount > 5 ? 4.2 + Math.random() * 0.7 : 0,
    reviewCount: Math.floor(salesCount / 8),
  }
}

// ── Initial selling products (established shop baseline) ──────────────────────

function makeInitialProducts(): EtsyProduct[] {
  // 17 established products with varying sales history
  const salesCounts = [182, 94, 71, 55, 48, 34, 27, 22, 18, 14, 11, 8, 6, 4, 3, 2, 1]
  const cats: ProductCategory[] = [
    'Templates', 'Printables', 'Notion', 'SVG', 'Templates',
    'Digital Art', 'Printables', 'Clip Art', 'Notion', 'Templates',
    'Printables', 'SVG', 'Digital Art', 'Clip Art', 'Notion',
    'Templates', 'Printables',
  ]
  return salesCounts.map((sc, i) => makeProduct('selling', { category: cats[i], salesCount: sc }))
}

// ── Initial state factories ───────────────────────────────────────────────────

export function makeInitialCreative(): CreativeStudioStats {
  const products = makeInitialProducts()
  const totalSales = products.reduce((s, p) => s + p.salesCount, 0)
  const lifetimeRevenue = products.reduce((s, p) => s + p.revenue, 0)

  return {
    cash:             lifetimeRevenue * 0.65,  // some spent on tools/expenses
    dailyRevenue:     0,
    dailyExpenses:    85,
    dailyProfit:      0,
    lifetimeProfit:   lifetimeRevenue - 1200,  // expenses over time
    draftsInProgress: 1,
    completedProducts: products.length,
    pendingQC:        0,
    mockSales:        totalSales,
    recentIdeas:      ['Minimal Resume Pack', 'Boho Moon SVG', 'Ultimate Life OS'],
    products,
    ownedUpgrades:    [],
    launchProgress:   [],
    shopRating:       4.7,
    totalReviews:     Math.floor(totalSales / 8),
    starSellerPct:    68,
    currentTrend:     TRENDING_NICHES[0].name,
    trendMultiplier:  TRENDING_NICHES[0].multiplier,
  }
}

export function makeInitialTrading(): TradingStats {
  return {
    accountBalance: 12500,
    dailyPL:        0,
    openTrades:     0,
    closedTrades:   0,
    wins:           0,
    losses:         0,
    winRate:        0,
    riskLevel:      'medium',
    drawdown:       0,
    marketMood:     'neutral',
    traderAction:   'Desk preparing the session map…',
    recentTrades:   [],
  }
}

// ── Analysis observations (no trades, no signals — market readings only) ─────

export interface AnalysisEvent {
  message: string
  mood?: TradingStats['marketMood']
  action?: string
}

export const ANALYSIS_EVENTS: AnalysisEvent[] = [
  // Volume profile readings — Vera 📊
  { message: 'Vera 📊: NQ building acceptance above yesterday\'s POC — value migrating higher', mood: 'bullish', action: 'Volume profile update' },
  { message: 'Vera 📊: ES value area narrow today — balanced profile, rotation likely', mood: 'neutral', action: 'Value area mapped' },
  { message: 'Vera 📊: thin LVN pocket sits just under current NQ price — fast moves through there', action: 'LVN flagged' },
  { message: 'Vera 📊: HVN overhead acting as resistance — heavy volume traded there last week', action: 'HVN flagged' },
  { message: 'Vera 📊: POC untested from the morning session — still a magnet below', action: 'POC note' },
  // Liquidity readings — Marlow 💧
  { message: 'Marlow 💧: equal highs stacked above session range — buy-side pool marked', action: 'Liquidity map updated' },
  { message: 'Marlow 💧: sell-side liquidity resting under three equal lows on ES', action: 'Liquidity map updated' },
  { message: 'Marlow 💧: overnight low swept in the first hour — that pool is spent', action: 'Sweep noted' },
  { message: 'Marlow 💧: round number just above price lining up with equal highs — confluence pool', action: 'Confluence noted' },
  // Session timing — Sana 🕐
  { message: 'Sana 🕐: NY open in 30 min — expect the overnight range to get tested', action: 'Session prep' },
  { message: 'Sana 🕐: opening range set — high and low marked on the board', action: 'Opening range marked' },
  { message: 'Sana 🕐: lunch hours — volume drying up, ranges compressing', mood: 'neutral', action: 'Midday lull' },
  { message: 'Sana 🕐: final hour — watch for a push toward untested levels', action: 'Closing hour watch' },
  // Structure context — Cole 🧭
  { message: 'Cole 🧭: NQ printing higher highs and higher lows on the hourly — trend context intact', mood: 'bullish', action: 'Structure update' },
  { message: 'Cole 🧭: ES lost its last hourly higher low — structure now questionable', mood: 'bearish', action: 'Structure update' },
  { message: 'Cole 🧭: both indices ranging inside yesterday\'s value — no directional conviction', mood: 'neutral', action: 'Range day noted' },
  { message: 'Cole 🧭: expansion candle broke the range — watching whether price accepts outside value', mood: 'volatile', action: 'Range break noted' },
  // News & macro — Nova 📰
  { message: 'Nova 📰: CPI print tomorrow morning — expect positioning to thin out late today', mood: 'volatile', action: 'Macro calendar' },
  { message: 'Nova 📰: no high-impact releases today — technicals should lead', action: 'Calendar clear' },
  { message: 'Nova 📰: Fed speakers this afternoon — headlines can move the indices', mood: 'volatile', action: 'Headline risk flagged' },
  { message: 'Nova 📰: yields easing overnight — mild tailwind for tech-heavy NQ', mood: 'bullish', action: 'Macro context' },
  { message: 'Nova 📰: risk-off tone in overnight markets — defensive rotation in early flows', mood: 'bearish', action: 'Macro context' },
]


// ── Agent speeches ────────────────────────────────────────────────────────────

export const AGENT_SPEECHES: Record<string, string[]> = {
  research_agent:    ['New niche spotted! 🔍', 'Researching competitors...', 'Trend found!', 'SEO keywords updated!'],
  design_agent:      ['Almost done! ✏️', 'Colors look perfect!', 'Creative block... 😓', 'Draft complete!'],
  qc_agent:          ['Approved! ✅', 'Needs more work.', 'Quality check done.', 'Sending back to Dani.'],
  upload_agent:      ['Listing live! 🚀', 'SEO tags added!', 'Tags optimized!', 'Thumbnail uploaded!'],
  trader_agent:      ['Watching the charts 👀', 'Marking key levels...', 'Session map ready!', 'Levels updated!'],
  risk_manager:      ['Numbers double-checked ✅', 'Reviewing exposure ⚠️', 'Checking the levels...', 'Books look clean.'],
  // ── Market Analysis Team ─────────────────────────────────────────────────────
  news_analyst:      ['Scanning headlines 📰', 'CPI on deck tomorrow!', 'Calendar is clear today', 'Fed speakers this afternoon', 'Yields moving overnight', 'Macro tone: risk-on'],
  volume_analyst:    ['Profile updated 📊', 'POC holding as magnet', 'Value migrating higher', 'Thin LVN below price!', 'HVN acting as a shelf', 'Acceptance above value'],
  liquidity_analyst: ['Liquidity map fresh 💧', 'Equal highs stacked above', 'Sell-side pool below', 'Overnight low swept', 'Round number confluence', 'Pools marked on the board'],
  session_analyst:   ['Opening range marked 🕐', 'NY open in 30!', 'Lunch lull — ranges tight', 'Final hour — stay sharp', 'Overnight range holding', 'Session levels posted'],
  structure_analyst: ['Structure intact 🧭', 'Higher lows holding', 'Range day so far', 'Expansion candle printed', 'Hourly trend unchanged', 'Watching for acceptance'],
}
