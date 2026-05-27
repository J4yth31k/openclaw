import type { CreativeStudioStats, TradingStats } from '../types'

export function makeInitialCreative(): CreativeStudioStats {
  return {
    cash: 2400,
    dailyRevenue: 0,
    dailyExpenses: 85,
    dailyProfit: 0,
    lifetimeProfit: 1240,
    draftsInProgress: 2,
    completedProducts: 17,
    pendingQC: 1,
    mockSales: 0,
    recentIdeas: ['Canva Resume Pack', 'Social Media Kit', 'Notion Template'],
  }
}

export function makeInitialTrading(): TradingStats {
  return {
    accountBalance: 12500,
    dailyPL: 0,
    openTrades: 0,
    closedTrades: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    riskLevel: 'medium',
    drawdown: 0,
    marketMood: 'neutral',
    traderAction: 'Waiting for session open…',
    recentTrades: [],
  }
}

// ── Mock creative events ──────────────────────────────────────────────────────

export const CREATIVE_EVENTS: Array<{
  message: string
  revenueDelta: number
  draftDelta: number
  salesDelta: number
}> = [
  { message: 'Reya found a trending niche: Aesthetic Planners 📋', revenueDelta: 0, draftDelta: 1, salesDelta: 0 },
  { message: 'Dani completed a Digital Wall Art pack 🎨', revenueDelta: 0, draftDelta: -1, salesDelta: 0 },
  { message: 'Quinn approved the Social Media Kit ✅', revenueDelta: 0, draftDelta: 0, salesDelta: 0 },
  { message: 'Uly uploaded Resume Pack to mock Etsy store 🚀', revenueDelta: 34, draftDelta: 0, salesDelta: 1 },
  { message: 'Mock sale! Resume Pack sold for $8.99 🛒', revenueDelta: 8.99, draftDelta: 0, salesDelta: 1 },
  { message: 'Mock sale! Notion Template sold for $12 🛒', revenueDelta: 12, draftDelta: 0, salesDelta: 1 },
  { message: 'Quinn rejected a low-quality draft ❌ — sent back to Dani', revenueDelta: 0, draftDelta: 0, salesDelta: 0 },
  { message: 'Reya researched competitor pricing 🔍', revenueDelta: 0, draftDelta: 0, salesDelta: 0 },
  { message: 'Mock sale! Social Media Kit sold for $15 🛒', revenueDelta: 15, draftDelta: 0, salesDelta: 1 },
]

// ── Mock trade events ────────────────────────────────────────────────────────

export const TRADE_EVENTS: Array<{
  message: string
  plDelta: number
  openDelta: number
  closeDelta: number
  won?: boolean
  pair?: string
  mood?: TradingStats['marketMood']
  action?: string
}> = [
  { message: 'Trae spotted a bullish structure on EUR/USD 👀', plDelta: 0, openDelta: 0, closeDelta: 0, action: 'Analyzing EUR/USD structure' },
  { message: 'Remi reviewed the setup — approved ✅', plDelta: 0, openDelta: 0, closeDelta: 0, action: 'Risk approved' },
  { message: 'Trade opened: EUR/USD long at 1.0842 📈', plDelta: 0, openDelta: 1, closeDelta: 0, pair: 'EUR/USD', action: 'Trade open: EUR/USD long' },
  { message: 'EUR/USD hit TP — trade closed +$120 WIN 🎉', plDelta: 120, openDelta: -1, closeDelta: 1, won: true, pair: 'EUR/USD', action: 'Taking profits' },
  { message: 'Trae spotted a bearish BOS on GBP/JPY 📉', plDelta: 0, openDelta: 0, closeDelta: 0, action: 'Analyzing GBP/JPY BOS' },
  { message: 'Remi flagged high spread — trade rejected ⚠️', plDelta: 0, openDelta: 0, closeDelta: 0, action: 'Reviewing rejection', mood: 'volatile' },
  { message: 'Trade opened: GBP/USD short at 1.2640 📉', plDelta: 0, openDelta: 1, closeDelta: 0, pair: 'GBP/USD', action: 'Trade open: GBP/USD short' },
  { message: 'GBP/USD hit SL — trade closed -$55 LOSS 😬', plDelta: -55, openDelta: -1, closeDelta: 1, won: false, pair: 'GBP/USD', action: 'Reviewing loss' },
  { message: 'Market session shifted — USD bullish momentum 🐂', plDelta: 0, openDelta: 0, closeDelta: 0, mood: 'bullish', action: 'Monitoring USD strength' },
  { message: 'Trade opened: USD/JPY long 📈', plDelta: 0, openDelta: 1, closeDelta: 0, pair: 'USD/JPY', action: 'Trade open: USD/JPY long' },
  { message: 'USD/JPY closed +$200 WIN 🎉', plDelta: 200, openDelta: -1, closeDelta: 1, won: true, action: 'Booking profits' },
]

// ── Speeches ────────────────────────────────────────────────────────────────

export const AGENT_SPEECHES: Record<string, string[]> = {
  research_agent: ['Trending niche found! 🔍', 'Research complete!', 'Hmm, interesting data...', 'We need more ideas!'],
  design_agent: ['Almost done! ✏️', 'Colors look perfect!', 'Creative block... 😓', 'Finished the draft!'],
  qc_agent: ['This needs more work.', 'Approved! ✅', 'Quality check done.', 'Sending back for revision.'],
  upload_agent: ['Uploading now! 🚀', 'Mock listing live!', 'SEO tags added!', 'Draft ready to go!'],
  trader_agent: ['Watching the charts 👀', 'ICT setup forming!', 'Entry confirmed!', 'Risk looks good!'],
  risk_manager: ['Risk approved ✅', 'Too much drawdown ⚠️', 'Checking SL levels...', 'Position size OK.'],
}
