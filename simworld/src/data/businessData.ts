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
    traderAction:   'Waiting for session open…',
    recentTrades:   [],
  }
}

// ── Trade events (unchanged) ──────────────────────────────────────────────────

export const TRADE_EVENTS: Array<{
  message: string; plDelta: number; openDelta: number; closeDelta: number
  won?: boolean; pair?: string; mood?: TradingStats['marketMood']; action?: string
}> = [
  // ── MNQ (Micro NQ) ────────────────────────────────────────────────────────
  { message: 'Trae: MNQ sell-side swept pre-market — bias flipped bullish 👀',   plDelta: 0,    openDelta: 0,  closeDelta: 0, action: 'MNQ pre-market sweep read' },
  { message: 'Remi reviewed MNQ size — 2 contracts approved ✅',                  plDelta: 0,    openDelta: 0,  closeDelta: 0, action: 'Risk approved' },
  { message: 'Trade opened: MNQ long at 18,240 — FVG fill 📈',                   plDelta: 0,    openDelta: 1,  closeDelta: 0, pair: 'MNQ', action: 'MNQ long entry' },
  { message: 'MNQ TP hit — +$140 WIN 🎉',                                         plDelta: 140,  openDelta: -1, closeDelta: 1, won: true,  pair: 'MNQ', action: 'MNQ profit booked' },
  { message: 'Trae: MNQ VWAP rejection — bearish short setup forming 📉',         plDelta: 0,    openDelta: 0,  closeDelta: 0, action: 'MNQ VWAP rejection read' },
  { message: 'Remi: max daily loss 60% used — scaling back to 1 contract ⚠️',    plDelta: 0,    openDelta: 0,  closeDelta: 0, action: 'Risk scaling', mood: 'volatile' },
  { message: 'Trade opened: MNQ short at 18,510 — OB retest 📉',                  plDelta: 0,    openDelta: 1,  closeDelta: 0, pair: 'MNQ', action: 'MNQ short entry' },
  { message: 'MNQ hit SL — -$60 LOSS 😬 — news spike (review rule)',              plDelta: -60,  openDelta: -1, closeDelta: 1, won: false, pair: 'MNQ', action: 'MNQ loss review' },
  { message: 'RTH open — NQ printing higher — bias remains bullish 🐂',           plDelta: 0,    openDelta: 0,  closeDelta: 0, mood: 'bullish', action: 'RTH open read' },
  { message: 'Trade opened: MES long at 5,420 — NY AM Kill Zone 📈',              plDelta: 0,    openDelta: 1,  closeDelta: 0, pair: 'MES', action: 'MES long entry' },
  { message: 'MES closed +$175 WIN 🎉 — 2.1R clean',                              plDelta: 175,  openDelta: -1, closeDelta: 1, won: true,  pair: 'MES', action: 'MES profit locked' },
  { message: 'GC (Gold) long signal — safe haven bid building 🥇',                plDelta: 0,    openDelta: 1,  closeDelta: 0, pair: 'GC', action: 'GC long entry' },
  { message: 'GC TP hit — +$310 WIN 🎉',                                           plDelta: 310,  openDelta: -1, closeDelta: 1, won: true,  pair: 'GC', action: 'Gold gains locked' },
  { message: 'CL short confirmed — EIA inventory bearish 📉',                     plDelta: 0,    openDelta: 1,  closeDelta: 0, pair: 'CL', action: 'CL short entry' },
  { message: 'CL SL hit — -$90 LOSS 😬 — tight chop pre-EIA',                    plDelta: -90,  openDelta: -1, closeDelta: 1, won: false, pair: 'CL', action: 'CL loss post-mortem' },

  // ── NQ (NASDAQ-100 Futures) — SMC 4-Step Checklist ────────────────────────
  { message: 'Iron Man: NQ 1H bias BULLISH — HH/HL structure, price in discount 🦾',           plDelta: 0,    openDelta: 0,  closeDelta: 0, action: 'NQ 1H bias analysis' },
  { message: 'Scarlet Witch: NQ 15M — SSL swept, CHoCH confirmed, FVG created 🔮',             plDelta: 0,    openDelta: 0,  closeDelta: 0, action: 'NQ 15M narrative' },
  { message: 'Black Widow: NQ 5M BOS to upside, retracing into FVG — setup valid 🕷️',         plDelta: 0,    openDelta: 0,  closeDelta: 0, action: 'NQ 5M setup confirmed' },
  { message: 'Vision: NQ 1M — liquidity taken, displacement printed, BOS confirmed 👁️',        plDelta: 0,    openDelta: 0,  closeDelta: 0, action: 'NQ 1M execution check' },
  { message: 'Dr. Strange: All 4 SMC steps cleared — NQ long authorized ✅ NY AM Kill Zone',   plDelta: 0,    openDelta: 0,  closeDelta: 0, action: 'NQ SMC checklist passed' },
  { message: 'Trade opened: NQ long at 18,240 — FVG retest, SL below sweep 📈',                plDelta: 0,    openDelta: 1,  closeDelta: 0, pair: 'NQ', action: 'NQ long entry: FVG retest' },
  { message: 'NQ TP1 hit at 18,260 (+2R) — partial closed, runners to 18,295 🎉',             plDelta: 400,  openDelta: 0,  closeDelta: 0, won: true,  pair: 'NQ', action: 'NQ TP1 reached, holding runners' },
  { message: 'NQ TP2 hit — full position closed +$640 WIN 🎉',                                  plDelta: 640,  openDelta: -1, closeDelta: 1, won: true,  pair: 'NQ', action: 'NQ trade fully closed' },
  { message: 'Iron Man: NQ 1H bias BEARISH — LH/LL, price in premium, BSL above 🦾',          plDelta: 0,    openDelta: 0,  closeDelta: 0, action: 'NQ bearish 1H bias', mood: 'bearish' },
  { message: 'Scarlet Witch: NQ 15M — BSL swept, CHoCH bearish, FVG to downside 🔮',          plDelta: 0,    openDelta: 0,  closeDelta: 0, action: 'NQ bearish 15M narrative' },
  { message: 'Trade opened: NQ short at 18,510 — OB retest, SL above sweep 📉',                plDelta: 0,    openDelta: 1,  closeDelta: 0, pair: 'NQ', action: 'NQ short entry: OB retest' },
  { message: 'NQ short closed +$480 WIN 🎉 — 2.4R — equal lows target reached',               plDelta: 480,  openDelta: -1, closeDelta: 1, won: true,  pair: 'NQ', action: 'NQ short winner' },
  { message: 'NQ SL hit — -$200 LOSS 😬 — no sweep before entry (rule violation)',             plDelta: -200, openDelta: -1, closeDelta: 1, won: false, pair: 'NQ', action: 'NQ stopped — checklist miss' },

  // ── ES (S&P 500 Futures) — SMC 4-Step Checklist ───────────────────────────
  { message: 'Iron Man: ES 1H bias BULLISH — HH/HL, price at HTF OB in discount 🦾',         plDelta: 0,    openDelta: 0,  closeDelta: 0, action: 'ES 1H bias analysis' },
  { message: 'Scarlet Witch: ES 15M — sell-side swept, CHoCH confirmed, displacement 🔮',     plDelta: 0,    openDelta: 0,  closeDelta: 0, action: 'ES 15M narrative' },
  { message: 'Black Widow: ES 5M BOS confirmed, retracing into FVG — clean structure 🕷️',     plDelta: 0,    openDelta: 0,  closeDelta: 0, action: 'ES 5M setup' },
  { message: 'Vision: ES 1M — sweep taken, displacement, BOS → FVG retest entry 👁️',          plDelta: 0,    openDelta: 0,  closeDelta: 0, action: 'ES 1M execution' },
  { message: 'Trade opened: ES long at 5,418 — SL 3 pts below sweep, 2R+ available 📈',       plDelta: 0,    openDelta: 1,  closeDelta: 0, pair: 'ES', action: 'ES long entry: SMC checklist passed' },
  { message: 'ES TP1 hit +$250 WIN 🎉 — 2R, partial closed — holding to equal highs',         plDelta: 250,  openDelta: 0,  closeDelta: 0, won: true,  pair: 'ES', action: 'ES TP1 reached' },
  { message: 'ES trade fully closed +$375 WIN 🎉 — 3R achieved',                               plDelta: 375,  openDelta: -1, closeDelta: 1, won: true,  pair: 'ES', action: 'ES full close' },
  { message: 'Iron Man: ES 1H bias BEARISH — LH/LL at premium, BSL above equal highs 🦾',    plDelta: 0,    openDelta: 0,  closeDelta: 0, action: 'ES bearish 1H bias', mood: 'bearish' },
  { message: 'Trade opened: ES short at 5,490 — bearish FVG retest, SL above sweep 📉',       plDelta: 0,    openDelta: 1,  closeDelta: 0, pair: 'ES', action: 'ES short entry' },
  { message: 'ES short closed +$500 WIN 🎉 — 2.5R — equal lows swept as target',              plDelta: 500,  openDelta: -1, closeDelta: 1, won: true,  pair: 'ES', action: 'ES short winner' },
  { message: 'ES SL hit — -$150 LOSS 😬 — no confirmation candle present (rule: NO CONF = NO TRADE)', plDelta: -150, openDelta: -1, closeDelta: 1, won: false, pair: 'ES', action: 'ES stopped — no confirmation' },

  // ── CL (Crude Oil Futures) ────────────────────────────────────────────────
  { message: 'Thor reading CL — inverse correlation with DXY confirmed ⚡', plDelta: 0,   openDelta: 0,  closeDelta: 0, action: 'CL-DXY correlation check' },
  { message: 'Trade opened: CL long at 81.40 🛢️',                          plDelta: 0,   openDelta: 1,  closeDelta: 0, pair: 'CL', action: 'Trade open: CL long' },
  { message: 'CL TP hit at 82.80 — +$280 WIN 🎉',                          plDelta: 280, openDelta: -1, closeDelta: 1, won: true,  pair: 'CL', action: 'CL target reached' },
  { message: 'CL inventory report bearish — short opportunity 📉',          plDelta: 0,   openDelta: 0,  closeDelta: 0, action: 'CL inventory reaction', mood: 'bearish' },
  { message: 'Trade opened: CL short at 80.15 📉',                          plDelta: 0,   openDelta: 1,  closeDelta: 0, pair: 'CL', action: 'Trade open: CL short' },
  { message: 'CL closed +$420 WIN 🎉 — supply zone held perfectly',         plDelta: 420, openDelta: -1, closeDelta: 1, won: true,  pair: 'CL', action: 'CL supply zone trade won' },
  { message: 'CL SL hit — -$140 LOSS 😬 — news spike',                      plDelta: -140,openDelta: -1, closeDelta: 1, won: false, pair: 'CL', action: 'CL news stop-out' },

  // ── ZN (10-Year Treasury Futures) ────────────────────────────────────────
  { message: 'Capt. America tracking ZN — yields inverted, bonds bullish 🛡️', plDelta: 0,   openDelta: 0,  closeDelta: 0, action: 'ZN yield curve analysis' },
  { message: 'Trade opened: ZN long at 111.12 📈',                            plDelta: 0,   openDelta: 1,  closeDelta: 0, pair: 'ZN', action: 'Trade open: ZN long' },
  { message: 'ZN TP hit — +$187 WIN 🎉 — Fed pivot trade paid off',           plDelta: 187, openDelta: -1, closeDelta: 1, won: true,  pair: 'ZN', action: 'ZN pivot trade won' },
  { message: 'ZN SL hit — -$94 LOSS 😬 — strong jobs data pressured bonds',   plDelta: -94, openDelta: -1, closeDelta: 1, won: false, pair: 'ZN', action: 'ZN stopped out on jobs' },

  // ── GC (Gold Futures) ────────────────────────────────────────────────────
  { message: 'Vision sees GC order block at 2,340 — institutional buy 👁️', plDelta: 0,    openDelta: 0,  closeDelta: 0, action: 'GC order block analysis' },
  { message: 'Trade opened: GC long at 2,344.50 🥇',                       plDelta: 0,    openDelta: 1,  closeDelta: 0, pair: 'GC', action: 'Trade open: GC long' },
  { message: 'GC TP hit at 2,362 — +$350 WIN 🎉',                          plDelta: 350,  openDelta: -1, closeDelta: 1, won: true,  pair: 'GC', action: 'GC profits locked' },
  { message: 'GC rejected at 2,400 resistance — short setup forming 📉',   plDelta: 0,    openDelta: 0,  closeDelta: 0, action: 'GC resistance rejection', mood: 'volatile' },

  // ── RTY (Russell 2000 Futures) ───────────────────────────────────────────
  { message: 'Spider-Man: small-cap rotation news confirms RTY long setup 🕸️', plDelta: 0,   openDelta: 0,  closeDelta: 0, action: 'RTY news catalyst confirmed' },
  { message: 'Trade opened: RTY long at 2,080 📈',                              plDelta: 0,   openDelta: 1,  closeDelta: 0, pair: 'RTY', action: 'Trade open: RTY long' },
  { message: 'RTY closed +$310 WIN 🎉 — risk-on session delivered',             plDelta: 310, openDelta: -1, closeDelta: 1, won: true,  pair: 'RTY', action: 'RTY risk-on trade won' },
  { message: 'RTY SL hit — -$155 LOSS 😬 — large-cap rotation headwind',        plDelta: -155,openDelta: -1, closeDelta: 1, won: false, pair: 'RTY', action: 'RTY stopped out' },
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
  tech_analyst:      ['NQ 1H bias: BULLISH HH/HL 🦾', 'ES price in discount ✅', 'HTF order block holding!', 'Last BOS to the upside!', 'Equal highs above — target set!', 'CL at supply zone!', '1H structure confirmed!'],
  fundamentals_agent:['Fed holds rates! 🛡️', 'NFP beats — risk on!', 'ES bias aligns with macro!', 'ZN yield inversion!', 'ECB hawkish — NQ headwind!', 'GDP beat — discount zone!'],
  sentiment_agent:   ['NQ 15M — SSL swept! 🔮', 'CHoCH confirmed!', 'Strong displacement candle!', 'FVG created on 15M!', 'Bias aligned 1H→15M!', 'Equal lows taken — flip incoming!'],
  orderflow_agent:   ['NQ 1M — liquidity taken 👁️', 'Displacement confirmed!', 'BOS after displacement!', 'FVG retest live — entry zone!', 'Stop below sweep low!', '2R+ available!'],
  correlation_agent: ['NQ-ES correlated move ⚡', 'VIX dropping — NQ long bias!', 'DXY diverging from ES!', 'Kill zone active!', 'NY AM window open!', 'SPX breadth supporting!'],
  director_agent:    ['All 4 steps cleared! 🎯', 'TRADE ONLY WHEN ALL BOXES CHECKED!', 'No sweep = no trade!', 'NY AM Kill Zone active!', 'Checklist pass — execute!', 'Risk small. Manage well.'],
  tradeideas_agent:  ['NQ 5M BOS confirmed! 🕷️', 'ES retracing into FVG!', 'OB retest — clean structure!', 'Price in discount ✅', 'SL within 10 NQ pts!', 'SL within 3 ES pts!'],
  news_agent:        ['No high-impact news — clean window 🕸️', 'FOMC minutes in 2h — sized down!', 'NFP in 30min — no trade!', 'Low volatility window — kill zone active!', 'News: clear for NY AM!'],
  webhook_agent:     ['NQ SMC alert fired! 🏹', 'ES checklist complete — signal sent!', 'Webhook: all 4 steps cleared!', 'Pine script triggered — FVG retest!', 'Alert: BOS after displacement!'],
  hq_risk_manager:   ['NQ SL: 8 pts ✅ (max 10) 🔯', 'ES SL: 2.5 pts ✅ (max 3)', '1R risk approved!', 'Drawdown within limits ✅', '2R+ confirmed before entry!', 'Risk small. Manage well. Stay consistent.'],
  backtest_agent:    ['SMASH! NQ SMC: 73% WR! 💪', 'ES FVG retest: 68% hit rate!', 'SSL sweep → CHoCH: 71% WR!', 'Kill zone entries outperform!', 'NY AM best session confirmed!', 'Walk-forward: SMC edge holds!'],
}
