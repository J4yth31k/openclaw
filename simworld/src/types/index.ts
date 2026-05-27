// ── Core primitives ─────────────────────────────────────────────────────────

export interface Vec2 { x: number; y: number }

export type AgentId = string
export type BuildingId = 'home1' | 'home2' | 'creative_studio' | 'trading_office'
export type RoomId = string
export type BusinessId = 'creative_studio' | 'trading_office'

export type AgentRole =
  | 'research_agent'
  | 'design_agent'
  | 'qc_agent'
  | 'upload_agent'
  | 'trader_agent'
  | 'risk_manager'

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
  draftsInProgress: number
  completedProducts: number
  pendingQC: number
  mockSales: number
  recentIdeas: string[]
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
