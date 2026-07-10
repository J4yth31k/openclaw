// ── Core primitives ─────────────────────────────────────────────────────────

export interface Vec2 { x: number; y: number }

export type AgentId = string
export type BuildingId = string
export type RoomId = string
export type BusinessId = string

export type AgentRole =
  | 'research_agent'
  | 'design_agent'
  | 'qc_agent'
  | 'upload_agent'
  | 'trader_agent'
  | 'risk_manager'
  // ── Legacy desk roles (kept for old saves) ───────────────────────────────────────────────────────────
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
  // ── Market analysis team (no signals — reads news & markets) ──────────────
  | 'news_analyst'
  | 'volume_analyst'
  | 'liquidity_analyst'
  | 'session_analyst'
  | 'structure_analyst'
  // ── Player-hired agents ─────────────────────────────────────────────────────
  | 'worker'

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

// ── Life-sim needs (all agents) ──────────────────────────────────────────────

export interface LifeNeeds {
  hunger: number    // 0–100 (100 = full)
  fun: number       // 0–100
  social: number    // 0–100
  hygiene: number   // 0–100
}

export function defaultLifeNeeds(): LifeNeeds {
  return { hunger: 80, fun: 75, social: 70, hygiene: 90 }
}

// ── Wishes: small personal goals that pay out when fulfilled ─────────────────

export interface Wish {
  icon: string
  label: string
  need: 'hunger' | 'fun' | 'social' | 'hygiene' | 'energy'
  threshold: number   // need value that fulfils the wish
  reward: number      // cash paid on fulfilment
}

// ── Player commands (click an agent, then click a target) ───────────────────

export interface AgentCommand {
  kind: 'goto' | 'use' | 'chat'
  target: Vec2
  furnitureKind?: FurnitureKind   // set when kind === 'use'
  buildingId?: BuildingId
  targetAgentId?: AgentId         // set when kind === 'chat'
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
  lifeNeeds?: LifeNeeds   // hunger / fun / social / hygiene (life-sim layer)
  command?: AgentCommand | null   // player-issued order (overrides schedule)
  wish?: Wish | null      // current personal goal (pays cash when fulfilled)
  // ── Analyst-specific (optional, HQ analysts only) ────────────────────
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

// ── Furniture ────────────────────────────────────────────────────────────────

export type FurnitureKind = 'bed' | 'desk' | 'fridge' | 'couch' | 'plant' | 'tv' | 'shower'

export interface Furniture {
  id: string
  kind: FurnitureKind
  gridPos: Vec2
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
  // ── Player-built buildings ─────────────────────────────────────────────────
  custom?: boolean        // placed by the player (can be renamed / demolished)
  vacant?: boolean        // no business assigned yet — agents can't be hired
  businessType?: string   // e.g. 'Shop', 'Studio', 'Trading', assigned by player
  floors?: number         // visual height multiplier (1–3)
  furniture?: Furniture[] // beds, desks, fridges… agents walk to and use these
}

export interface WorldMap {
  cols: number
  rows: number
  tiles: TileType[][]
  buildings: Building[]
  hRoads: number[]        // starting row of each 2-lane horizontal road
  vRoads: number[]        // starting col of each 2-lane vertical road
  nextLotId: number       // auto-increment id for player-placed buildings
  expansions: number      // how many times the world has grown
}

// ── Build mode ───────────────────────────────────────────────────────────────

export interface PlacingLot {
  typeName: string
  tileW: number
  tileH: number
  cost: number
  floors: number
  color: string
  roofColor: string
  accentColor: string
}

// ── Upgrades ─────────────────────────────────────────────────────────────────

export type UpgradeCategory = 'tools' | 'agent' | 'ads' | 'milestone'

export interface UpgradeEffect {
  saleRateBoost?: number       // additive fraction per level (0.2 = +20%)
  designSpeedBoost?: number    // fraction faster per level (0.4 = 2× faster at level 1)
  qcSpeedBoost?: number
  listingSpeedBoost?: number
  qcPassBoost?: number         // additive to base 0.85 pass rate per level
  ideaSpeedBoost?: number      // fraction faster per level (0.25 = 25% sooner)
  viewsBoost?: number          // fraction more views per level
  maxProductsBoost?: number    // raise pipeline cap by this per level
  dailyCost?: number           // extra $/sim-day (ads spend)
}

export interface UpgradeDef {
  id: string
  name: string
  description: string
  icon: string
  category: UpgradeCategory
  cost: number
  maxLevel: number
  requires?: string
  effect: UpgradeEffect
}

export interface OwnedUpgrade {
  id: string
  level: number
  purchasedAt: number          // sim-minute
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
  ownedUpgrades: OwnedUpgrade[]
  launchProgress: string[]     // ids of launch-plan items completed by agents
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

// ── Conversation Intelligence ──────────────────────────────────────────────────

export interface ConversationSection {
  title: string
  content: string
}

export type ConversationType =
  | 'trading'
  | 'risk'
  | 'business'
  | 'creative'
  | 'coordination'
  | 'marketing'
  | 'planning'

export type ConversationOutcome =
  | 'approved'
  | 'rejected'
  | 'pending'
  | 'executing'
  | 'completed'
  | 'cancelled'

export type AgentSentiment =
  | 'bullish'
  | 'bearish'
  | 'neutral'
  | 'cautious'
  | 'aggressive'
  | 'optimistic'
  | 'concerned'

export interface ConversationMessage {
  id: string
  agentId: AgentId
  agentName: string
  agentRole: string
  agentEmoji: string
  agentColor: string
  simMinute: number
  timeLabel: string
  content: string
  confidence: number
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  sentiment: AgentSentiment
  tags: string[]
  sections: ConversationSection[]
}

export interface AgentConversation {
  id: string
  simMinute: number
  timeLabel: string
  title: string
  type: ConversationType
  outcome: ConversationOutcome
  messages: ConversationMessage[]
  pair?: string
  finalDecision?: string
  tags: string[]
  sourceEventId?: string
}

// ── Full sim state ────────────────────────────────────────────────────────────

export interface SimState {
  time: GameTime
  agents: Agent[]
  worldMap: WorldMap
  creative: CreativeStudioStats
  trading: TradingStats
  eventLog: EventLogEntry[]
  conversations: AgentConversation[]
  selectedAgentId: AgentId | null
  selectedBuildingId: BuildingId | null
  selectedConversationId: string | null
  totalCash: number
  completedTaskCount: number
  warnings: string[]
  relationships: Record<string, number>   // "idA|idB" (sorted) → 0–100 friendship
}
