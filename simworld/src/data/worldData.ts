import type {
  WorldMap, Building, TileType, Agent,
  AgentRole, Mood, Vec2, AgentId, BuildingId, BusinessId, AgentState, RoomId,
  AgentNeeds, AgentSkill,
} from '../types'

// ── Map dimensions ───────────────────────────────────────────────────────────
export const COLS = 34   // expanded: +14 for Avengers HQ wing
export const ROWS = 18

// ── Tile size and ISO offset ─────────────────────────────────────────────────
export const TILE_W = 48
export const TILE_H = 24
export const ISO_OFFSET_X = 120
export const ISO_OFFSET_Y = 60

// ── Pixel helpers ─────────────────────────────────────────────────────────────
export function gridToIso(g: Vec2): Vec2 {
  return {
    x: (g.x - g.y) * (TILE_W / 2) + ISO_OFFSET_X,
    y: (g.x + g.y) * (TILE_H / 2) + ISO_OFFSET_Y,
  }
}
export function gridToPixel(g: Vec2): Vec2 { return gridToIso(g) }

// ── Buildings ────────────────────────────────────────────────────────────────
const buildings: Building[] = [
  // ── Residential (left) ───────────────────────────────────────────────────
  {
    id: 'home1',
    name: 'Home 🏠',
    gridPos: { x: 0, y: 0 },
    tileW: 4, tileH: 4,
    color: '#e8c9a0', roofColor: '#c0392b', accentColor: '#f5e6c8',
    doorTile: { x: 2, y: 3 },
    rooms: [
      { id: 'home1_bedroom', name: 'Bedroom', buildingId: 'home1', gridPos: { x: 1, y: 1 }, occupants: [] },
      { id: 'home1_kitchen', name: 'Kitchen', buildingId: 'home1', gridPos: { x: 2, y: 1 }, occupants: [] },
    ],
  },
  {
    id: 'home2',
    name: 'Home 🏠',
    gridPos: { x: 15, y: 0 },
    tileW: 4, tileH: 4,
    color: '#a0c4e8', roofColor: '#2c3e50', accentColor: '#c4ddf5',
    doorTile: { x: 16, y: 3 },
    rooms: [
      { id: 'home2_bedroom', name: 'Bedroom', buildingId: 'home2', gridPos: { x: 16, y: 1 }, occupants: [] },
      { id: 'home2_kitchen', name: 'Kitchen', buildingId: 'home2', gridPos: { x: 17, y: 1 }, occupants: [] },
    ],
  },
  // ── Avengers HQ Quarters (top-right) ─────────────────────────────────────
  {
    id: 'hq_quarters',
    name: 'HQ Quarters 🛡️',
    gridPos: { x: 25, y: 0 },
    tileW: 7, tileH: 5,
    color: '#1e1b4b', roofColor: '#4f46e5', accentColor: '#312e81',
    doorTile: { x: 28, y: 4 },
    rooms: [
      { id: 'hq_bunka', name: 'Bunk A', buildingId: 'hq_quarters', gridPos: { x: 26, y: 1 }, occupants: [] },
      { id: 'hq_bunkb', name: 'Bunk B', buildingId: 'hq_quarters', gridPos: { x: 29, y: 1 }, occupants: [] },
      { id: 'hq_bunkc', name: 'Bunk C', buildingId: 'hq_quarters', gridPos: { x: 26, y: 3 }, occupants: [] },
      { id: 'hq_bunkd', name: 'Bunk D', buildingId: 'hq_quarters', gridPos: { x: 29, y: 3 }, occupants: [] },
    ],
  },
  // ── Workplaces (bottom) ───────────────────────────────────────────────────
  {
    id: 'creative_studio',
    name: 'Creative Studio',
    gridPos: { x: 0, y: 10 },
    tileW: 8, tileH: 6,
    color: '#f9e4b7', roofColor: '#e67e22', accentColor: '#fdf3dc',
    doorTile: { x: 4, y: 15 },
    rooms: [
      { id: 'research_room',  name: 'Research Room',  buildingId: 'creative_studio', gridPos: { x: 2, y: 11 }, occupants: [] },
      { id: 'design_room',    name: 'Design Room',    buildingId: 'creative_studio', gridPos: { x: 5, y: 11 }, occupants: [] },
      { id: 'qc_room',        name: 'QC Room',        buildingId: 'creative_studio', gridPos: { x: 2, y: 14 }, occupants: [] },
      { id: 'upload_room',    name: 'Upload Room',    buildingId: 'creative_studio', gridPos: { x: 5, y: 14 }, occupants: [] },
    ],
  },
  {
    id: 'trading_office',
    name: 'Trading Office',
    gridPos: { x: 11, y: 10 },
    tileW: 8, tileH: 6,
    color: '#c8daf5', roofColor: '#2c3e50', accentColor: '#deeafc',
    doorTile: { x: 15, y: 15 },
    rooms: [
      { id: 'market_room',   name: 'Market Room',   buildingId: 'trading_office', gridPos: { x: 13, y: 11 }, occupants: [] },
      { id: 'strategy_room', name: 'Strategy Room', buildingId: 'trading_office', gridPos: { x: 16, y: 11 }, occupants: [] },
      { id: 'risk_room',     name: 'Risk Room',     buildingId: 'trading_office', gridPos: { x: 13, y: 14 }, occupants: [] },
      { id: 'review_room',   name: 'Review Room',   buildingId: 'trading_office', gridPos: { x: 16, y: 14 }, occupants: [] },
    ],
  },
  // ── Avengers HQ (bottom-right) ────────────────────────────────────────────
  {
    id: 'avengers_hq',
    name: 'Avengers HQ ⚡',
    gridPos: { x: 22, y: 10 },
    tileW: 11, tileH: 7,
    color: '#0f172a', roofColor: '#7c3aed', accentColor: '#1e1b4b',
    doorTile: { x: 27, y: 16 },
    rooms: [
      { id: 'intel_room',    name: 'Intel Room',    buildingId: 'avengers_hq', gridPos: { x: 24, y: 11 }, occupants: [] },
      { id: 'ops_room',      name: 'Ops Room',      buildingId: 'avengers_hq', gridPos: { x: 27, y: 11 }, occupants: [] },
      { id: 'command_room',  name: 'Command Room',  buildingId: 'avengers_hq', gridPos: { x: 30, y: 11 }, occupants: [] },
      { id: 'hq_risk_room',  name: 'Risk Room',     buildingId: 'avengers_hq', gridPos: { x: 24, y: 15 }, occupants: [] },
      { id: 'backtest_room', name: 'Backtest Room', buildingId: 'avengers_hq', gridPos: { x: 27, y: 15 }, occupants: [] },
      { id: 'briefing_room', name: 'Briefing Room', buildingId: 'avengers_hq', gridPos: { x: 30, y: 15 }, occupants: [] },
    ],
  },
]

// ── Tile map generation ───────────────────────────────────────────────────────
function buildTileMap(): TileType[][] {
  const tiles: TileType[][] = Array.from({ length: ROWS }, () =>
    Array(COLS).fill('grass' as TileType)
  )

  // Horizontal road (separating homes from offices)
  for (let x = 0; x < COLS; x++) {
    tiles[7][x] = 'road'
    tiles[8][x] = 'road'
    if (tiles[6][x] === 'grass') tiles[6][x] = 'sidewalk'
    if (tiles[9][x] === 'grass') tiles[9][x] = 'sidewalk'
  }

  // Vertical road 1 — between left and right sides (existing)
  for (let y = 0; y < ROWS; y++) {
    tiles[y][9]  = 'road'
    tiles[y][10] = 'road'
    if (tiles[y][8]  === 'grass') tiles[y][8]  = 'sidewalk'
    if (tiles[y][11] === 'grass') tiles[y][11] = 'sidewalk'
  }

  // Vertical road 2 — between trading_office and Avengers HQ
  for (let y = 0; y < ROWS; y++) {
    tiles[y][20] = 'road'
    tiles[y][21] = 'road'
    if (tiles[y][19] === 'grass') tiles[y][19] = 'sidewalk'
    if (tiles[y][22] === 'grass') tiles[y][22] = 'sidewalk'
  }

  // Building footprints
  for (const b of buildings) {
    for (let dy = 0; dy < b.tileH; dy++) {
      for (let dx = 0; dx < b.tileW; dx++) {
        const ty = b.gridPos.y + dy
        const tx = b.gridPos.x + dx
        if (ty >= 0 && ty < ROWS && tx >= 0 && tx < COLS) {
          tiles[ty][tx] = 'building_floor'
        }
      }
    }
    if (b.doorTile.y < ROWS && b.doorTile.x < COLS) {
      tiles[b.doorTile.y][b.doorTile.x] = 'path'
    }
  }

  // Paths: home1 → road
  for (let y = 4; y <= 6; y++) if (tiles[y][2] !== 'building_floor') tiles[y][2] = 'path'
  // Paths: home2 → road
  for (let y = 4; y <= 6; y++) if (tiles[y][16] !== 'building_floor') tiles[y][16] = 'path'
  // Paths: hq_quarters → road
  for (let y = 5; y <= 6; y++) if (tiles[y][28] !== 'building_floor') tiles[y][28] = 'path'
  // Paths: creative_studio → road
  if (tiles[9][4] !== 'building_floor') tiles[9][4] = 'path'
  // Paths: trading_office → road
  if (tiles[9][15] !== 'building_floor') tiles[9][15] = 'path'
  // Paths: avengers_hq → road
  if (tiles[9][27] !== 'building_floor') tiles[9][27] = 'path'

  return tiles
}

export const worldMap: WorldMap = {
  cols: COLS,
  rows: ROWS,
  tiles: buildTileMap(),
  buildings,
}

// ── Agent definitions ─────────────────────────────────────────────────────────
export interface AgentDef {
  id: AgentId
  name: string
  role: AgentRole
  color: string
  accentColor: string
  homeBuilding: BuildingId
  workBuilding: BusinessId
  workRoom: RoomId
  spawnTile: Vec2
  startState: AgentState
  mood: Mood
  emoji?: string
  isAvenger?: boolean
  agentNeeds?: AgentNeeds
  agentSkill?: AgentSkill
  accuracy?: number
  signalsGiven?: number
  signalsHit?: number
  streak?: number
  bestStreak?: number
}

// ── Original 6 agents ────────────────────────────────────────────────────────
export const AGENT_DEFS: AgentDef[] = [
  {
    id: 'research_agent', name: 'Reya', role: 'research_agent',
    color: '#9b59b6', accentColor: '#d7bde2',
    homeBuilding: 'home1', workBuilding: 'creative_studio', workRoom: 'research_room',
    spawnTile: { x: 1, y: 1 }, startState: 'sleeping', mood: 'happy',
  },
  {
    id: 'design_agent', name: 'Dani', role: 'design_agent',
    color: '#e91e8c', accentColor: '#f8a9d4',
    homeBuilding: 'home1', workBuilding: 'creative_studio', workRoom: 'design_room',
    spawnTile: { x: 2, y: 1 }, startState: 'sleeping', mood: 'happy',
  },
  {
    id: 'qc_agent', name: 'Quinn', role: 'qc_agent',
    color: '#27ae60', accentColor: '#a9dfbf',
    homeBuilding: 'home1', workBuilding: 'creative_studio', workRoom: 'qc_room',
    spawnTile: { x: 1, y: 2 }, startState: 'sleeping', mood: 'neutral',
  },
  {
    id: 'upload_agent', name: 'Uly', role: 'upload_agent',
    color: '#f39c12', accentColor: '#fad7a0',
    homeBuilding: 'home1', workBuilding: 'creative_studio', workRoom: 'upload_room',
    spawnTile: { x: 2, y: 2 }, startState: 'sleeping', mood: 'neutral',
  },
  {
    id: 'trader_agent', name: 'Trae', role: 'trader_agent',
    color: '#3498db', accentColor: '#aed6f1',
    homeBuilding: 'home2', workBuilding: 'trading_office', workRoom: 'market_room',
    spawnTile: { x: 16, y: 1 }, startState: 'sleeping', mood: 'excited',
  },
  {
    id: 'risk_manager', name: 'Remi', role: 'risk_manager',
    color: '#e74c3c', accentColor: '#f1948a',
    homeBuilding: 'home2', workBuilding: 'trading_office', workRoom: 'risk_room',
    spawnTile: { x: 17, y: 1 }, startState: 'sleeping', mood: 'neutral',
  },
]

// ── 11 Avengers agents ────────────────────────────────────────────────────────
export const AVENGERS_DEFS: AgentDef[] = [
  {
    id: 'ironman', name: 'Iron Man', role: 'tech_analyst', emoji: '🦾',
    color: '#ef4444', accentColor: '#fca5a5',
    homeBuilding: 'hq_quarters', workBuilding: 'avengers_hq', workRoom: 'intel_room',
    spawnTile: { x: 26, y: 1 }, startState: 'sleeping', mood: 'excited',
    isAvenger: true,
    agentNeeds: { dataFreshness: 85, apiHealth: 95, rest: 80, morale: 85 },
    agentSkill: { name: 'Technical Analysis', level: 8, xp: 0, xpToNext: 100 },
    accuracy: 0.72, signalsGiven: 45, signalsHit: 32, streak: 3, bestStreak: 7,
  },
  {
    id: 'captain', name: 'Capt. America', role: 'fundamentals_agent', emoji: '🛡️',
    color: '#4a6cf7', accentColor: '#a5b4fc',
    homeBuilding: 'hq_quarters', workBuilding: 'avengers_hq', workRoom: 'intel_room',
    spawnTile: { x: 27, y: 1 }, startState: 'sleeping', mood: 'happy',
    isAvenger: true,
    agentNeeds: { dataFreshness: 90, apiHealth: 92, rest: 88, morale: 92 },
    agentSkill: { name: 'Fundamental Analysis', level: 9, xp: 45, xpToNext: 120 },
    accuracy: 0.68, signalsGiven: 38, signalsHit: 26, streak: 1, bestStreak: 5,
  },
  {
    id: 'scarlet', name: 'Scarlet Witch', role: 'sentiment_agent', emoji: '🔮',
    color: '#ec4899', accentColor: '#f9a8d4',
    homeBuilding: 'hq_quarters', workBuilding: 'avengers_hq', workRoom: 'intel_room',
    spawnTile: { x: 28, y: 1 }, startState: 'sleeping', mood: 'neutral',
    isAvenger: true,
    agentNeeds: { dataFreshness: 78, apiHealth: 88, rest: 82, morale: 78 },
    agentSkill: { name: 'Sentiment Analysis', level: 7, xp: 70, xpToNext: 90 },
    accuracy: 0.65, signalsGiven: 52, signalsHit: 34, streak: 0, bestStreak: 4,
  },
  {
    id: 'vision', name: 'Vision', role: 'orderflow_agent', emoji: '👁️',
    color: '#a855f7', accentColor: '#d8b4fe',
    homeBuilding: 'hq_quarters', workBuilding: 'avengers_hq', workRoom: 'intel_room',
    spawnTile: { x: 29, y: 1 }, startState: 'sleeping', mood: 'happy',
    isAvenger: true,
    agentNeeds: { dataFreshness: 92, apiHealth: 90, rest: 92, morale: 90 },
    agentSkill: { name: 'Order Flow', level: 10, xp: 10, xpToNext: 140 },
    accuracy: 0.75, signalsGiven: 60, signalsHit: 45, streak: 5, bestStreak: 9,
  },
  {
    id: 'thor', name: 'Thor', role: 'correlation_agent', emoji: '⚡',
    color: '#06b6d4', accentColor: '#67e8f9',
    homeBuilding: 'hq_quarters', workBuilding: 'avengers_hq', workRoom: 'ops_room',
    spawnTile: { x: 26, y: 2 }, startState: 'sleeping', mood: 'excited',
    isAvenger: true,
    agentNeeds: { dataFreshness: 88, apiHealth: 95, rest: 95, morale: 95 },
    agentSkill: { name: 'Cross-Asset Correlation', level: 11, xp: 55, xpToNext: 150 },
    accuracy: 0.70, signalsGiven: 30, signalsHit: 21, streak: 2, bestStreak: 6,
  },
  {
    id: 'fury', name: 'Nick Fury', role: 'director_agent', emoji: '🎯',
    color: '#7c3aed', accentColor: '#c4b5fd',
    homeBuilding: 'hq_quarters', workBuilding: 'avengers_hq', workRoom: 'command_room',
    spawnTile: { x: 27, y: 2 }, startState: 'sleeping', mood: 'neutral',
    isAvenger: true,
    agentNeeds: { dataFreshness: 70, apiHealth: 80, rest: 60, morale: 70 },
    agentSkill: { name: 'Colony Management', level: 12, xp: 80, xpToNext: 160 },
    accuracy: 0.80, signalsGiven: 0, signalsHit: 0, streak: 0, bestStreak: 0,
  },
  {
    id: 'widow', name: 'Black Widow', role: 'tradeideas_agent', emoji: '🕷️',
    color: '#10b981', accentColor: '#6ee7b7',
    homeBuilding: 'hq_quarters', workBuilding: 'avengers_hq', workRoom: 'ops_room',
    spawnTile: { x: 28, y: 2 }, startState: 'sleeping', mood: 'happy',
    isAvenger: true,
    agentNeeds: { dataFreshness: 85, apiHealth: 90, rest: 75, morale: 88 },
    agentSkill: { name: 'Signal Generation', level: 9, xp: 30, xpToNext: 120 },
    accuracy: 0.74, signalsGiven: 80, signalsHit: 59, streak: 4, bestStreak: 8,
  },
  {
    id: 'spiderman', name: 'Spider-Man', role: 'news_agent', emoji: '🕸️',
    color: '#f97316', accentColor: '#fdba74',
    homeBuilding: 'hq_quarters', workBuilding: 'avengers_hq', workRoom: 'ops_room',
    spawnTile: { x: 29, y: 2 }, startState: 'sleeping', mood: 'happy',
    isAvenger: true,
    agentNeeds: { dataFreshness: 82, apiHealth: 88, rest: 88, morale: 86 },
    agentSkill: { name: 'News Intelligence', level: 6, xp: 60, xpToNext: 80 },
    accuracy: 0.62, signalsGiven: 25, signalsHit: 16, streak: 1, bestStreak: 3,
  },
  {
    id: 'hawkeye', name: 'Hawkeye', role: 'webhook_agent', emoji: '🏹',
    color: '#f59e0b', accentColor: '#fcd34d',
    homeBuilding: 'hq_quarters', workBuilding: 'avengers_hq', workRoom: 'backtest_room',
    spawnTile: { x: 26, y: 3 }, startState: 'sleeping', mood: 'neutral',
    isAvenger: true,
    agentNeeds: { dataFreshness: 80, apiHealth: 85, rest: 85, morale: 80 },
    agentSkill: { name: 'Webhook Operations', level: 5, xp: 20, xpToNext: 70 },
    accuracy: 0.90, signalsGiven: 100, signalsHit: 90, streak: 8, bestStreak: 15,
  },
  {
    id: 'strange', name: 'Dr. Strange', role: 'hq_risk_manager', emoji: '🔯',
    color: '#14b8a6', accentColor: '#5eead4',
    homeBuilding: 'hq_quarters', workBuilding: 'avengers_hq', workRoom: 'hq_risk_room',
    spawnTile: { x: 27, y: 3 }, startState: 'sleeping', mood: 'neutral',
    isAvenger: true,
    agentNeeds: { dataFreshness: 88, apiHealth: 92, rest: 78, morale: 82 },
    agentSkill: { name: 'Risk Management', level: 13, xp: 90, xpToNext: 170 },
    accuracy: 0.85, signalsGiven: 200, signalsHit: 170, streak: 10, bestStreak: 22,
  },
  {
    id: 'hulk', name: 'Hulk', role: 'backtest_agent', emoji: '💪',
    color: '#84cc16', accentColor: '#bef264',
    homeBuilding: 'hq_quarters', workBuilding: 'avengers_hq', workRoom: 'backtest_room',
    spawnTile: { x: 28, y: 3 }, startState: 'sleeping', mood: 'excited',
    isAvenger: true,
    agentNeeds: { dataFreshness: 90, apiHealth: 95, rest: 99, morale: 96 },
    agentSkill: { name: 'Backtesting', level: 7, xp: 40, xpToNext: 90 },
    accuracy: 0.67, signalsGiven: 15, signalsHit: 10, streak: 0, bestStreak: 3,
  },
]

export const ALL_AGENT_DEFS = [...AGENT_DEFS, ...AVENGERS_DEFS]

export function makeInitialAgents(): Agent[] {
  return ALL_AGENT_DEFS.map(def => ({
    id: def.id, name: def.name, role: def.role,
    color: def.color, accentColor: def.accentColor,
    homeBuilding: def.homeBuilding, workBuilding: def.workBuilding, workRoom: def.workRoom,
    gridPos: { ...def.spawnTile },
    pixelPos: gridToPixel(def.spawnTile),
    path: [], state: def.startState, mood: def.mood,
    energy: 100, stress: 0, taskProgress: 0,
    taskName: null, speech: null, speechTimer: 0, currentRoom: null,
    // Avengers extras
    emoji: def.emoji,
    isAvenger: def.isAvenger ?? false,
    agentNeeds: def.agentNeeds ? { ...def.agentNeeds } : undefined,
    agentSkill: def.agentSkill ? { ...def.agentSkill } : undefined,
    accuracy: def.accuracy,
    signalsGiven: def.signalsGiven ?? 0,
    signalsHit: def.signalsHit ?? 0,
    streak: def.streak ?? 0,
    bestStreak: def.bestStreak ?? 0,
  } satisfies Agent))
}
