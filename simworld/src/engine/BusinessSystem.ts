import type {
  SimState, CreativeStudioStats, TradingStats,
  EventLogEntry, EtsyProduct, OwnedUpgrade,
} from '../types'
import { TRADE_EVENTS, TRENDING_NICHES, makeProduct, makeProductId } from '../data/businessData'
import { UPGRADE_DEFS, computeEffects } from '../data/upgradeData'
import { timeLabel, simMinuteOfDay } from './TimeSystem'

// ── Unique ID util ────────────────────────────────────────────────────────────
let uniqueId = 0
function uid() { return `evt_${++uniqueId}` }

// ── Trade event cycling ───────────────────────────────────────────────────────
let tradeEventIdx = 0
let tradeTimer    = 0

// ── Etsy pipeline stage durations (sim-seconds of agent work needed) ──────────
// At 1×, 1 sim-second ≈ 0.8 real-ms → stages feel quick but visible
const STAGE_DURATION: Record<EtsyProduct['stage'], number> = {
  idea:    0,    // idea is instant (Reya generates it)
  design:  1400, // ~23 sim-min of Dani working
  qc:      700,  // ~12 sim-min of Quinn working
  listing: 400,  // ~7 sim-min of Uly working
  selling: 0,    // passive forever
}

// How often Reya spawns a new idea (sim-seconds of her work accumulated)
const IDEA_INTERVAL = 1800  // ~30 sim-min
let reserachAccum = 0       // sim-sec of Reya's work

// Passive sales: each selling product has a per-sim-minute chance of a sale
// Base rate * trend multiplier * price coefficient
function saleChancePerMinute(product: EtsyProduct, trendMult: number): number {
  const base = 0.06  // 6% chance per sim-minute per product at normal trend
  const trendBonus = product.trend === 'hot' ? trendMult : product.trend === 'cooling' ? 0.4 : 1.0
  // Cheaper products sell more often
  const priceCoeff = 1 + (20 - Math.min(20, product.price)) / 20 * 0.5
  return Math.min(0.98, base * trendBonus * priceCoeff)
}

// Trend rotation — changes every ~5 sim-days (7200 sim-minutes)
let trendTimer = 0
let trendIdx   = Math.floor(Math.random() * TRENDING_NICHES.length)

export interface BusinessUpdate {
  creative?: Partial<CreativeStudioStats>
  trading?:  Partial<TradingStats>
  logEntries: EventLogEntry[]
  completedDelta: number
}

export function updateBusinesses(state: SimState, dtSec: number): BusinessUpdate {
  const result: BusinessUpdate = { logEntries: [], completedDelta: 0 }
  const minuteOfDay = simMinuteOfDay(state.time)
  const workHours   = minuteOfDay >= 8 * 60 && minuteOfDay < 17 * 60

  // ── Trend rotation ──────────────────────────────────────────────────────────
  trendTimer -= dtSec
  if (trendTimer <= 0) {
    trendTimer = 7200 + Math.random() * 3600  // 5–8 sim-days between shifts
    trendIdx = (trendIdx + 1) % TRENDING_NICHES.length
    const niche = TRENDING_NICHES[trendIdx]
    result.logEntries.push({
      id: uid(),
      simMinute: state.time.day * 1440 + minuteOfDay,
      timeLabel: timeLabel(state.time),
      message: `📈 Trending on Etsy: ${niche.name}! Sales boost incoming.`,
      type: 'success',
    })
    result.creative = {
      ...result.creative,
      currentTrend: niche.name,
      trendMultiplier: niche.multiplier,
    }
  }

  const currentTrend  = result.creative?.currentTrend  ?? state.creative.currentTrend
  const trendMult     = result.creative?.trendMultiplier ?? state.creative.trendMultiplier
  const activeTrend   = TRENDING_NICHES.find(n => n.name === currentTrend) ?? TRENDING_NICHES[0]

  // ── Agent availability ──────────────────────────────────────────────────────
  const reyaWorking   = workHours && state.agents.find(a => a.id === 'research_agent')?.state === 'working'
  const daniWorking   = workHours && state.agents.find(a => a.id === 'design_agent')?.state === 'working'
  const quinnWorking  = workHours && state.agents.find(a => a.id === 'qc_agent')?.state === 'working'
  const ulyWorking    = workHours && state.agents.find(a => a.id === 'upload_agent')?.state === 'working'

  // ── Upgrade effects ─────────────────────────────────────────────────────────
  const fx = computeEffects(state.creative.ownedUpgrades ?? [])

  // ── Auto-unlock milestones ──────────────────────────────────────────────────
  const ownedIds = new Set((state.creative.ownedUpgrades ?? []).map(u => u.id))
  const newMilestones: OwnedUpgrade[] = []
  const simMin = state.time.day * 1440 + minuteOfDay

  if (state.creative.starSellerPct >= 100 && !ownedIds.has('star_seller')) {
    newMilestones.push({ id: 'star_seller', level: 1, purchasedAt: simMin })
    result.logEntries.push({ id: uid(), simMinute: simMin, timeLabel: timeLabel(state.time),
      message: '⭐ OpenClaw Crafts earned the Star Seller badge! +10% sales boost!', type: 'success' })
  }
  if (state.creative.mockSales >= 100 && !ownedIds.has('milestone_100')) {
    newMilestones.push({ id: 'milestone_100', level: 1, purchasedAt: simMin })
    result.logEntries.push({ id: uid(), simMinute: simMin, timeLabel: timeLabel(state.time),
      message: '🏅 100 Sales milestone hit! Etsy algorithm is warming to the shop.', type: 'success' })
  }
  if (state.creative.mockSales >= 1000 && !ownedIds.has('milestone_1000')) {
    newMilestones.push({ id: 'milestone_1000', level: 1, purchasedAt: simMin })
    result.logEntries.push({ id: uid(), simMinute: simMin, timeLabel: timeLabel(state.time),
      message: '🏆 1000 Sales milestone! Elite seller status unlocked!', type: 'success' })
  }
  if (newMilestones.length > 0) {
    const updatedOwned = [...(state.creative.ownedUpgrades ?? []), ...newMilestones]
    result.creative = { ...result.creative, ownedUpgrades: updatedOwned }
  }

  // ── Build mutable product list ──────────────────────────────────────────────
  const products: EtsyProduct[] = state.creative.products.map(p => ({ ...p }))

  let cashDelta    = 0
  let revenueDelta = 0
  let salesDelta   = 0
  let completedDelta = 0

  // ── 1. RESEARCH: Reya accumulates work toward a new idea ───────────────────
  if (reyaWorking) {
    reserachAccum += dtSec
    const effectiveIdleInterval = IDEA_INTERVAL / fx.ideaIntervalDivisor
    if (reserachAccum >= effectiveIdleInterval) {
      reserachAccum = 0
      // Only add idea if we don't have too many in the pipeline
      const inPipeline = products.filter(p => p.stage !== 'selling').length
      if (inPipeline < fx.pipelineCap) {
        const newProduct = makeProduct('idea')
        // Mark as trending if category matches
        if (activeTrend.categories.includes(newProduct.category)) {
          newProduct.trend = 'hot'
        }
        products.push(newProduct)
        result.logEntries.push({
          id: uid(),
          simMinute: state.time.day * 1440 + minuteOfDay,
          timeLabel: timeLabel(state.time),
          message: `💡 Reya researched: "${newProduct.name}" — ${newProduct.category} ${newProduct.trend === 'hot' ? '🔥' : ''}`,
          type: 'creative',
        })
      }
    }
  }

  // ── 2. DESIGN: Dani works on the first 'idea' product ─────────────────────
  if (daniWorking) {
    const ideaProduct = products.find(p => p.stage === 'idea')
    if (ideaProduct) {
      ideaProduct.stageProgress += (dtSec / (STAGE_DURATION.design / fx.designDivisor)) * 100
      if (ideaProduct.stageProgress >= 100) {
        ideaProduct.stage = 'qc'
        ideaProduct.stageProgress = 0
        result.logEntries.push({
          id: uid(),
          simMinute: state.time.day * 1440 + minuteOfDay,
          timeLabel: timeLabel(state.time),
          message: `✏️ Dani finished design: "${ideaProduct.name}" — ready for QC`,
          type: 'creative',
        })
      }
    }
  }

  // ── 3. QC: Quinn checks the first 'qc' product ────────────────────────────
  if (quinnWorking) {
    const qcProduct = products.find(p => p.stage === 'qc')
    if (qcProduct) {
      qcProduct.stageProgress += (dtSec / (STAGE_DURATION.qc / fx.qcDivisor)) * 100
      if (qcProduct.stageProgress >= 100) {
        // Pass rate boosted by QC upgrades (base 85%)
        if (Math.random() < fx.qcPassRate) {
          qcProduct.stage = 'listing'
          qcProduct.stageProgress = 0
          result.logEntries.push({
            id: uid(),
            simMinute: state.time.day * 1440 + minuteOfDay,
            timeLabel: timeLabel(state.time),
            message: `✅ Quinn approved: "${qcProduct.name}" — ready to list`,
            type: 'creative',
          })
        } else {
          // Send back to design
          qcProduct.stage = 'idea'
          qcProduct.stageProgress = 0
          result.logEntries.push({
            id: uid(),
            simMinute: state.time.day * 1440 + minuteOfDay,
            timeLabel: timeLabel(state.time),
            message: `❌ Quinn rejected: "${qcProduct.name}" — back to Dani for revision`,
            type: 'warning',
          })
        }
      }
    }
  }

  // ── 4. LISTING: Uly uploads the first 'listing' product ───────────────────
  if (ulyWorking) {
    const listProduct = products.find(p => p.stage === 'listing')
    if (listProduct) {
      listProduct.stageProgress += (dtSec / (STAGE_DURATION.listing / fx.listingDivisor)) * 100
      if (listProduct.stageProgress >= 100) {
        listProduct.stage = 'selling'
        listProduct.stageProgress = 100
        completedDelta++
        result.logEntries.push({
          id: uid(),
          simMinute: state.time.day * 1440 + minuteOfDay,
          timeLabel: timeLabel(state.time),
          message: `🚀 Uly listed: "${listProduct.name}" — $${listProduct.price.toFixed(2)} on Etsy! ${listProduct.trend === 'hot' ? '🔥' : ''}`,
          type: 'success',
        })
      }
    }
  }

  // ── 5. PASSIVE SALES: all selling products earn revenue ───────────────────
  const dtMin = dtSec / 60  // convert sim-seconds → sim-minutes
  const sellingProducts = products.filter(p => p.stage === 'selling')

  for (const product of sellingProducts) {
    // Apply trend tag
    if (activeTrend.categories.includes(product.category)) {
      if (product.trend !== 'hot') product.trend = 'hot'
    } else if (product.trend === 'hot') {
      product.trend = 'cooling'
    } else if (product.trend === 'cooling') {
      product.trend = 'normal'
    }

    const chance = saleChancePerMinute(product, trendMult) * dtMin * fx.saleRateMultiplier
    if (Math.random() < chance) {
      const earnedRaw = product.price * 0.92  // ~8% fees
      product.salesCount++
      product.revenue    += earnedRaw
      product.views      += Math.round((3 + Math.floor(Math.random() * 12)) * fx.viewsMultiplier)
      cashDelta          += earnedRaw
      revenueDelta       += earnedRaw
      salesDelta++

      // Accumulate reviews (roughly 1 review per 12 sales)
      if (product.salesCount % 12 === 0) {
        product.reviewCount++
        const newRating = 4.1 + Math.random() * 0.85  // 4.1–4.95
        product.rating = (product.rating * (product.reviewCount - 1) + newRating) / product.reviewCount
      }

      // Only log notable sales (top products or first sale of a new listing)
      const isBigSeller = product.salesCount <= 3 || product.salesCount % 25 === 0
      if (isBigSeller || sellingProducts.length <= 5) {
        result.logEntries.push({
          id: uid(),
          simMinute: state.time.day * 1440 + minuteOfDay,
          timeLabel: timeLabel(state.time),
          message: `🛒 Sale! "${product.name}" — +$${earnedRaw.toFixed(2)} ${product.trend === 'hot' ? '🔥' : ''}`,
          type: 'success',
        })
      }
    }
  }

  // ── 6. Update shop stats ─────────────────────────────────────────────────
  if (cashDelta > 0 || completedDelta > 0 || result.logEntries.some(e => e.type === 'creative' || e.type === 'warning')) {
    const cs = state.creative
    const totalReviews = products.reduce((s, p) => s + p.reviewCount, 0)
    const ratedProducts = products.filter(p => p.reviewCount > 0)
    const shopRating = ratedProducts.length > 0
      ? ratedProducts.reduce((s, p) => s + p.rating * p.reviewCount, 0) / Math.max(1, totalReviews)
      : cs.shopRating

    const totalSales = cs.mockSales + salesDelta
    // Star Seller: need 20+ sales, 4.8+ rating → progress 0–100
    const starSellerPct = Math.min(100, Math.round(
      (Math.min(totalSales, 20) / 20) * 50 +
      (Math.max(0, shopRating - 4.0) / 1.0) * 50
    ))

    const newRevenue = cs.dailyRevenue + revenueDelta
    result.creative = {
      ...result.creative,
      cash:             cs.cash + cashDelta,
      dailyRevenue:     newRevenue,
      dailyProfit:      newRevenue - cs.dailyExpenses,
      lifetimeProfit:   cs.lifetimeProfit + cashDelta,
      mockSales:        totalSales,
      completedProducts: cs.completedProducts + completedDelta,
      draftsInProgress: products.filter(p => p.stage === 'idea' || p.stage === 'design').length,
      pendingQC:        products.filter(p => p.stage === 'qc').length,
      products:         products.slice(-30),   // keep max 30 (old selling products get archived)
      shopRating:       +shopRating.toFixed(2),
      totalReviews,
      starSellerPct,
    }
    result.completedDelta += completedDelta + salesDelta
  }

  // ── 7. Trading ────────────────────────────────────────────────────────────
  tradeTimer -= dtSec
  if (workHours && tradeTimer <= 0) {
    tradeTimer = 60 + Math.random() * 90

    const ev = TRADE_EVENTS[tradeEventIdx % TRADE_EVENTS.length]
    tradeEventIdx++

    const tr = state.trading
    const newPL      = tr.dailyPL + ev.plDelta
    const newBalance = tr.accountBalance + ev.plDelta
    const newOpen    = Math.max(0, tr.openTrades + ev.openDelta)
    const newClosed  = tr.closedTrades + ev.closeDelta
    const newWins    = ev.won === true  ? tr.wins   + 1 : tr.wins
    const newLosses  = ev.won === false ? tr.losses + 1 : tr.losses
    const total      = newWins + newLosses
    const winRate    = total > 0 ? Math.round((newWins / total) * 100) : tr.winRate
    const newDD      = ev.plDelta < 0
      ? Math.min(25, tr.drawdown + Math.abs(ev.plDelta) / 100)
      : Math.max(0, tr.drawdown - 0.5)

    result.trading = {
      dailyPL: newPL, accountBalance: newBalance,
      openTrades: newOpen, closedTrades: newClosed,
      wins: newWins, losses: newLosses, winRate, drawdown: newDD,
      ...(ev.mood   ? { marketMood:   ev.mood   } : {}),
      ...(ev.action ? { traderAction: ev.action } : {}),
    }
    result.completedDelta += ev.closeDelta
    result.logEntries.push({
      id: uid(),
      simMinute: state.time.day * 1440 + minuteOfDay,
      timeLabel: timeLabel(state.time),
      message: ev.message,
      type: ev.plDelta > 0 ? 'success' : ev.plDelta < 0 ? 'warning' : 'trade',
    })
  }

  // ── 8. Daily reset at midnight ────────────────────────────────────────────
  if (minuteOfDay < 1) {
    const totalDailyExpenses = 85 + fx.extraDailyCost
    result.creative = {
      ...result.creative,
      dailyRevenue: 0, dailyExpenses: totalDailyExpenses, dailyProfit: 0,
      cash: (result.creative?.cash ?? state.creative.cash) - totalDailyExpenses,
    }
    result.trading = {
      ...result.trading,
      dailyPL: 0, openTrades: 0, closedTrades: 0, wins: 0, losses: 0,
    }
    result.logEntries.push({
      id: uid(),
      simMinute: state.time.day * 1440,
      timeLabel: timeLabel(state.time),
      message: `🌅 Day ${state.time.day + 1} begins! Etsy shop open for business.`,
      type: 'info',
    })
  }

  // ── 9. Launch plan: agents work through real Etsy tasks over 2-3 sim days ────
  {
    const done     = new Set(state.creative.launchProgress ?? [])
    const newly: string[] = []
    const t        = state.time
    const completed = result.creative?.completedProducts ?? state.creative.completedProducts
    const sales     = result.creative?.mockSales ?? state.creative.mockSales
    const reviews   = result.creative?.totalReviews ?? state.creative.totalReviews

    // Helper: mark item done + emit event log entry once
    function launch(id: string, msg: string, agentId?: string) {
      if (done.has(id)) return
      newly.push(id)
      done.add(id)
      result.logEntries.push({
        id: uid(), simMinute: simMin, timeLabel: timeLabel(t),
        message: `🧶 ${msg}`, type: 'creative', agentId,
      })
    }

    // ── FOUNDATION (Day 1 morning) ────────────────────────────────────────
    if (t.day >= 1 && t.hour >= 9) {
      launch('etsy_account',  'Reya registered the OpenClaw Crafts Etsy seller account!',       'research_agent')
      launch('shop_name',     'Shop name "OpenClaw Crafts" confirmed — available on Etsy!',     'research_agent')
      launch('canva_pro',     'Dani set up the Canva Pro Brand Kit — colors & fonts locked in!','design_agent')
    }
    if (t.day >= 1 && t.hour >= 11) {
      launch('competitor',    'Reya analyzed 10 top planner shops — price & tag strategy mapped!', 'research_agent')
    }
    if (completed >= 18) {
      launch('shop_banner',   'Dani designed the shop banner — lifestyle planner aesthetic!',    'design_agent')
    }
    if (t.day >= 1 && t.hour >= 14) {
      launch('about_section', 'Uly wrote the shop About page with full SEO keywords!',          'upload_agent')
    }

    // ── FIRST PRODUCTS (Day 1–2, driven by pipeline completions) ─────────
    if (completed >= 18)  launch('daily_planner',     'Dani completed Daily Planner Pages — A4 + US Letter! ✏️',       'design_agent')
    if (completed >= 19)  launch('weekly_tracker',    'Dani designed the Weekly Habit Tracker!',                        'design_agent')
    if (completed >= 20)  launch('budget_tracker',    'Budget Tracker + Bill Pay Calendar bundle ready!',               'design_agent')
    if (completed >= 21)  launch('gratitude_journal', 'Gratitude Journal Pages — 30-day edition complete! 🌸',          'design_agent')
    if (completed >= 22)  launch('goal_workbook',     'Goal Setting Workbook with vision board page — done!',           'design_agent')
    if (completed >= 19)  launch('mockups',           'Quinn finalized iPad + desk mockup images for all listings! 🖼️', 'qc_agent')

    // ── SEO & LISTINGS (Day 2, driven by time + pipeline count) ──────────
    if (t.day >= 2 && t.hour >= 9)  launch('keyword_research', 'Reya mapped low-competition, high-volume planner keywords! 🔎', 'research_agent')
    if (t.day >= 2 && t.hour >= 10) launch('erank',            'eRank free tier installed — keyword data feeding in!',          'research_agent')
    if (completed >= 20)            launch('titles',            'Uly wrote SEO-optimized titles — keyword-first format!',        'upload_agent')
    if (completed >= 21)            launch('tags',              'Uly filled all 13 tags on every listing!',                      'upload_agent')
    if (completed >= 22)            launch('pricing',           'Uly set prices: singles $3.99–$6.99, bundles $9.99–$14.99',    'upload_agent')
    if (completed >= 22 && t.day >= 2) launch('descriptions',  'Uly wrote keyword-rich descriptions — "instant download" in every listing!', 'upload_agent')

    // ── FREE TRAFFIC (Day 2–3) ─────────────────────────────────────────────
    if (t.day >= 2 && t.hour >= 14) launch('pinterest_biz',   'Reya created Pinterest Business account + Rich Pins enabled! 📌', 'research_agent')
    if (t.day >= 3 && t.hour >= 9)  launch('pinterest_pins',  'Reya pinned all products — 3 pins per listing, scheduled!',      'research_agent')
    if (t.day >= 3 && t.hour >= 10) launch('pinterest_boards','Reya built SEO-targeted boards: "Daily Planner Printables" etc.', 'research_agent')
    if (t.day >= 3 && t.hour >= 11) launch('instagram',       'Dani launched the OpenClaw Instagram — lifestyle mockups live! 📸','design_agent')
    if (t.day >= 3 && t.hour >= 12) launch('etsy_share',      'Uly shared all listings via Etsy\'s social tools — shop announced!','upload_agent')

    // ── SCALE (Day 3+ / milestone-driven) ─────────────────────────────────
    if (sales > 1059)               launch('first_sale',     '🎉 First NEW product sale landed! Buyer messaged for a review!', undefined)
    if (completed >= 25)            launch('bundles',        'Dani bundled top 3 planners → $12.99 Ultimate Planner Pack! 🎁', 'design_agent')
    if (reviews > 130)              launch('reviews',        'Uly sent review follow-ups — response rate +40%!',               'upload_agent')
    if (t.day >= 4)                 launch('etsy_ads_test',  'Test Etsy Ads at $1/day started — 30-day experiment running! 📢', undefined)
    if (completed >= 28)            launch('seasonal_packs', 'Dani launched Back-to-School seasonal collection! 🏫',           'design_agent')
    if (completed >= 30)            launch('new_products',   '30 listings milestone! Shop is publishing 2–3 new designs/week!', 'research_agent')

    if (newly.length > 0) {
      result.creative = {
        ...result.creative,
        launchProgress: [...(state.creative.launchProgress ?? []), ...newly],
      }
    }
  }

  return result
}
