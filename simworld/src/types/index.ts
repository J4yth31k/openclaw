// ── Core primitives ─────────────────────────────────────────────────────────

export interface Vec2 { x: number; y: number }

export type AgentId = string
export type BuildingId = 'home1' | 'home2' | 'hq_quarters' | 'creative_studio' | 'trading_office' | 'avengers_hq'
export type RoomId = string
export type BusinessId = 'creative_studio' | 'trading_office' | 'avengers_hq'

export type AgentRole =
  | 'research_agent'
  | 'design_agent'
  | 'qc_agent'
  | 'upload_agent'
  | 'trader_agent'
  | 'risk_manager'
  // ── Avengers roles ───────────────────────────────────────────────────────────
  | 'tech_analyst'
  | 'fundamentals_agent'
  | 'sentiment_agent'
  | 'orderflow_agent'
  | 'correlation_agent'
  | 'director_agent'
  | 'tradeideas_agent'
  | 'news_agent'
  | 'webhook_agent'
  | 'hq_risk_manager'
  | 'backtest_agent'

export type AgentState =
  | 'sleeping'
  | 'waking'
  | 'at_home'
  | 'commuting_to_work'
  | 'at_work'
  | 'working'
  | 'talking'
  | 'on_break'
  | 'commuting_home'
  | 'arriving_home'

export type Mood = 'happy' | 'neutral' | 'stressed' | 'excited' | 'tired'
export type TileType = 'grass' | 'road' | 'path' | 'building_floor' | 'sidewalk'

// ── Agent ────────────────────────────────────────────────────────────────────

export interface AgentNeeds {
  dataFreshness: number   // 0–100
  apiHealth: number       // 0–100
  rest: number            // 0–100
  morale: number          // 0–100
}

export interface AgentSkill {
  name: string
  level: number
  xp: number
  xpToNext: number
}

export interface Agent {
  id: AgentId
  name: string
  role: AgentRole
  color: string
  accentColor: string
  homeBuilding: BuildingId
  workBuilding: BusinessId
  workRoom: RoomId
  gridPos: Vec2
  pixelPos: Vec2          // smoothly interpolated screen position
  path: Vec2[]            // remaining grid waypoints
  state: AgentState
  mood: Mood
  energy: number          // 0–100
  stress: number          // 0–100
  taskProgress: number    // 0–1
  taskName: string | null
  speech: string | null
  speechTimer: number     // sim-seconds remaining
  currentRoom: RoomId | null
  // ── Avengers-specific (optional, Avengers agents only) ────────────────────
  emoji?: string
  agentNeeds?: AgentNeeds
  agentSkill?: AgentSkill
  accuracy?: number       // 0–1 hit rate
  signalsGiven?: number
  signalsHit?: number
  streak?: number
  bestStreak?: number
  isAvenger?: boolean
}

// ── World ────────────────────────────────────────────────────────────────────

export interface Room {
  id: RoomId
  name: string
  buildingId: BuildingId
  gridPos: Vec2           // center tile of this room
  occupants: AgentId[]
}

export interface Building {
  id: BuildingId
  name: string
  gridPos: Vec2           // top-left corner tile
  tileW: number
  tileH: number
  color: string
  roofColor: string
  accentColor: string
  doorTile: Vec2          // which tile is the entrance
  rooms: Room[]
}

export interface WorldMap {
  cols: number
  rows: number
  tiles: TileType[][]
  buildings: Building[]
}

// ── Etsy shop ─────────────────────────────────────────────────────────────────

export type ProductCategory = 'Templates' | 'Printables' | 'SVG' | 'Digital Art' | 'Notion' | 'Clip Art'
export type ProductStage    = 'idea' | 'design' | 'qc' | 'listing' | 'selling'

export interface EtsyProduct {
  id: string
  name: string
  category: ProductCategory
  price: number
  stage: ProductStage
  stageProgress: number   // 0–100, progress through current stage
  salesCount: number
  revenue: number
  views: number
  trend: 'hot' | 'normal' | 'cooling'
  rating: number          // 0–5
  reviewCount: number
}

// ── Business / financials ────────────────────────────────────────────────────

export interface TradeRecord {
  id: string
  pair: string
  direction: 'long' | 'short'
  entryPrice: number
  exitPrice: number | null
  pnl: number | null
  status: 'open' | 'won' | 'lost'
  timestamp: number       // sim-minute absolute
}

export interface CreativeStudioStats {
  cash: number
  dailyRevenue: number
  dailyExpenses: number
  dailyProfit: number
  lifetimeProfit: number
  // counts (derived from products[] but kept for quick access)
  draftsInProgress: number
  completedProducts: number
  pendingQC: number
  mockSales: number          // total all-time sales
  recentIdeas: string[]
  // Etsy shop
  products: EtsyProduct[]
  shopRating: number         // weighted avg 0–5
  totalReviews: number
  starSellerPct: number      // 0–100 progress toward Star Seller badge
  currentTrend: string       // active trending niche
  trendMultiplier: number    // 1.0–2.5 sales-rate boost
}

export interface TradingStats {
  accountBalance: number
  dailyPL: number
  openTrades: number
  closedTrades: number
  wins: number
  losses: number
  winRate: number
  riskLevel: 'low' | 'medium' | 'high'
  drawdown: number
  marketMood: 'bullish' | 'bearish' | 'neutral' | 'volatile'
  traderAction: string
  recentTrades: TradeRecord[]
}

// ── Time ─────────────────────────────────────────────────────────────────────

export interface GameTime {
  day: number
  hour: number
  minute: number
  speed: number           // real-ms per sim-minute
  paused: boolean
}

// ── Events ───────────────────────────────────────────────────────────────────

export type LogType = 'info' | 'success' | 'warning' | 'trade' | 'creative'

export interface EventLogEntry {
  id: string
  simMinute: number       // absolute sim minute for sorting
  timeLabel: string       // "Day 1 08:30"
  message: string
  type: LogType
  agentId?: AgentId
}

// ── Full sim state ────────────────────────────────────────────────────────────

export interface SimState {
  time: GameTime
  agents: Agent[]
  worldMap: WorldMap
  creative: CreativeStudioStats
  trading: TradingStats
  eventLog: EventLogEntry[]
  selectedAgentId: AgentId | null
  totalCash: number
  completedTaskCount: number
  warnings: string[]
}
