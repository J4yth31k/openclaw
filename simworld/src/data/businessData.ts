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
    traderAction:   'Waiting for session open…',
    recentTrades:   [],
  }
}

// ── Trade events (unchanged) ──────────────────────────────────────────────────

export const TRADE_EVENTS: Array<{
  message: string; plDelta: number; openDelta: number; closeDelta: number
  won?: boolean; pair?: string; mood?: TradingStats['marketMood']; action?: string
}> = [
  { message: 'Trae spotted a bullish structure on EUR/USD 👀',  plDelta: 0,   openDelta: 0,  closeDelta: 0, action: 'Analyzing EUR/USD structure' },
  { message: 'Remi reviewed the setup — approved ✅',           plDelta: 0,   openDelta: 0,  closeDelta: 0, action: 'Risk approved' },
  { message: 'Trade opened: EUR/USD long at 1.0842 📈',         plDelta: 0,   openDelta: 1,  closeDelta: 0, pair: 'EUR/USD', action: 'Trade open: EUR/USD long' },
  { message: 'EUR/USD hit TP — trade closed +$120 WIN 🎉',      plDelta: 120, openDelta: -1, closeDelta: 1, won: true,  pair: 'EUR/USD', action: 'Taking profits' },
  { message: 'Trae spotted a bearish BOS on GBP/JPY 📉',        plDelta: 0,   openDelta: 0,  closeDelta: 0, action: 'Analyzing GBP/JPY BOS' },
  { message: 'Remi flagged high spread — trade rejected ⚠️',   plDelta: 0,   openDelta: 0,  closeDelta: 0, action: 'Reviewing rejection', mood: 'volatile' },
  { message: 'Trade opened: GBP/USD short at 1.2640 📉',        plDelta: 0,   openDelta: 1,  closeDelta: 0, pair: 'GBP/USD', action: 'Trade open: GBP/USD short' },
  { message: 'GBP/USD hit SL — trade closed -$55 LOSS 😬',      plDelta: -55, openDelta: -1, closeDelta: 1, won: false, pair: 'GBP/USD', action: 'Reviewing loss' },
  { message: 'Market session shifted — USD bullish momentum 🐂',plDelta: 0,   openDelta: 0,  closeDelta: 0, mood: 'bullish', action: 'Monitoring USD strength' },
  { message: 'Trade opened: USD/JPY long 📈',                   plDelta: 0,   openDelta: 1,  closeDelta: 0, pair: 'USD/JPY', action: 'Trade open: USD/JPY long' },
  { message: 'USD/JPY closed +$200 WIN 🎉',                     plDelta: 200, openDelta: -1, closeDelta: 1, won: true,  action: 'Booking profits' },
  { message: 'XAU/USD long signal confirmed 🥇',                plDelta: 0,   openDelta: 1,  closeDelta: 0, pair: 'XAU/USD', action: 'Trade open: XAU/USD long' },
  { message: 'XAU/USD TP hit — +$320 WIN 🎉',                   plDelta: 320, openDelta: -1, closeDelta: 1, won: true,  action: 'Locking in gold gains' },
  { message: 'GBP/JPY short confirmed 📉',                      plDelta: 0,   openDelta: 1,  closeDelta: 0, pair: 'GBP/JPY', action: 'Trade open: GBP/JPY short' },
  { message: 'GBP/JPY SL hit — -$80 LOSS 😬',                   plDelta: -80, openDelta: -1, closeDelta: 1, won: false, action: 'Post-trade review' },
]

// ── Agent speeches ────────────────────────────────────────────────────────────

export const AGENT_SPEECHES: Record<string, string[]> = {
  research_agent:    ['New niche spotted! 🔍', 'Researching competitors...', 'Trend found!', 'SEO keywords updated!'],
  design_agent:      ['Almost done! ✏️', 'Colors look perfect!', 'Creative block... 😓', 'Draft complete!'],
  qc_agent:          ['Approved! ✅', 'Needs more work.', 'Quality check done.', 'Sending back to Dani.'],
  upload_agent:      ['Listing live! 🚀', 'SEO tags added!', 'Tags optimized!', 'Thumbnail uploaded!'],
  trader_agent:      ['Watching the charts 👀', 'ICT setup forming!', 'Entry confirmed!', 'Risk looks good!'],
  risk_manager:      ['Risk approved ✅', 'Too much drawdown ⚠️', 'Checking SL levels...', 'Position size OK.'],
  // ── Avengers ────────────────────────────────────────────────────────────────
  tech_analyst:      ['EMAs aligned! 🦾', 'MACD cross confirmed!', 'RSI approaching OB...', 'Bollinger squeeze!'],
  fundamentals_agent:['Fed holds rates! 🛡️', 'NFP beats forecast!', 'ECB hawkish pivot...', 'Rates differential widening!'],
  sentiment_agent:   ['Fear & Greed at 72! 🔮', 'Whales accumulating!', 'Options flow bullish!', 'Sentiment shifting...'],
  orderflow_agent:   ['Order book imbalance! 👁️', 'VWAP computed!', 'Large bid wall forming!', 'Liquidations incoming!'],
  correlation_agent: ['Bifrost open! ⚡', 'DXY diverging!', 'VIX spiking—be careful!', 'Gold-USD correlation flipped!'],
  director_agent:    ['Assemble! 🎯', 'Status check in progress...', 'Colony morale rising!', 'All agents report!'],
  tradeideas_agent:  ['Setup confirmed! 🕷️', 'Confluence: 5/6 ✅', 'Entry zone mapped!', 'Filtering noise...'],
  news_agent:        ['Breaking news! 🕸️', 'Headline parsed!', 'Sentiment: BULLISH!', 'High-impact event incoming!'],
  webhook_agent:     ['Signal received! 🏹', 'Webhook fired!', 'Alert forwarded!', 'Pine script triggered!'],
  hq_risk_manager:   ['Position sized! 🔯', 'Monte Carlo: green!', 'Kelly criterion OK!', 'Drawdown within limits ✅'],
  backtest_agent:    ['SMASH! History crunched! 💪', '89% win rate found!', 'Optimizing params...', 'Walk-forward passed!'],
}
