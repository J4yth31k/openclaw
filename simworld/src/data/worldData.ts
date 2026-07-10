import type {
  WorldMap, Building, TileType, Agent, Room, Furniture, FurnitureKind,
  AgentRole, Mood, Vec2, AgentId, BuildingId, BusinessId, AgentState, RoomId,
  AgentNeeds, AgentSkill,
} from '../types'
import { defaultLifeNeeds } from '../types'

// ── Map dimensions ───────────────────────────────────────────────────────────
export const COLS = 34   // expanded: +14 for the Analysis HQ wing
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

/** Inverse of gridToIso — world-pixel → tile coordinates */
export function isoToGrid(p: Vec2): Vec2 {
  const ix = (p.x - ISO_OFFSET_X) / (TILE_W / 2)
  const iy = (p.y - ISO_OFFSET_Y) / (TILE_H / 2)
  return { x: Math.round((ix + iy) / 2), y: Math.round((iy - ix) / 2) }
}

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
  // ── Analyst Quarters (top-right) ──────────────────────────────────────────
  {
    id: 'hq_quarters',
    name: 'Analyst Quarters 🏙️',
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
  // ── Analysis HQ (bottom-right) ────────────────────────────────────────────
  {
    id: 'avengers_hq',
    name: 'Analysis HQ 🧭',
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

// ── Tile map generation (dynamic — works for any size / road / building set) ──

export function generateTiles(
  cols: number, rows: number,
  hRoads: number[], vRoads: number[],
  blds: Building[],
): TileType[][] {
  const tiles: TileType[][] = Array.from({ length: rows }, () =>
    Array(cols).fill('grass' as TileType)
  )
  const inBounds = (x: number, y: number) => x >= 0 && x < cols && y >= 0 && y < rows

  for (const r of hRoads) {
    for (let x = 0; x < cols; x++) {
      if (inBounds(x, r))     tiles[r][x] = 'road'
      if (inBounds(x, r + 1)) tiles[r + 1][x] = 'road'
      if (inBounds(x, r - 1) && tiles[r - 1][x] === 'grass') tiles[r - 1][x] = 'sidewalk'
      if (inBounds(x, r + 2) && tiles[r + 2][x] === 'grass') tiles[r + 2][x] = 'sidewalk'
    }
  }
  for (const c of vRoads) {
    for (let y = 0; y < rows; y++) {
      if (inBounds(c, y))     tiles[y][c] = 'road'
      if (inBounds(c + 1, y)) tiles[y][c + 1] = 'road'
      if (inBounds(c - 1, y) && tiles[y][c - 1] === 'grass') tiles[y][c - 1] = 'sidewalk'
      if (inBounds(c + 2, y) && tiles[y][c + 2] === 'grass') tiles[y][c + 2] = 'sidewalk'
    }
  }

  // Building footprints
  for (const b of blds) {
    for (let dy = 0; dy < b.tileH; dy++) {
      for (let dx = 0; dx < b.tileW; dx++) {
        const ty = b.gridPos.y + dy
        const tx = b.gridPos.x + dx
        if (inBounds(tx, ty)) tiles[ty][tx] = 'building_floor'
      }
    }
    if (inBounds(b.doorTile.x, b.doorTile.y)) tiles[b.doorTile.y][b.doorTile.x] = 'path'
  }

  // Auto-path: BFS from each door to the nearest road, paint grass along the way
  for (const b of blds) {
    paintPathToRoad(tiles, cols, rows, b.doorTile)
  }

  return tiles
}

/** BFS from door to nearest road tile; converts grass/sidewalk-adjacent grass to path */
function paintPathToRoad(tiles: TileType[][], cols: number, rows: number, door: Vec2) {
  const key = (x: number, y: number) => y * cols + x
  const prev = new Map<number, number>()
  const queue: Vec2[] = [door]
  const seen = new Set<number>([key(door.x, door.y)])
  let found: Vec2 | null = null

  while (queue.length > 0 && !found) {
    const cur = queue.shift()!
    for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]] as const) {
      const nx = cur.x + dx, ny = cur.y + dy
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue
      const k = key(nx, ny)
      if (seen.has(k)) continue
      const t = tiles[ny][nx]
      if (t === 'building_floor') continue
      seen.add(k)
      prev.set(k, key(cur.x, cur.y))
      if (t === 'road' || t === 'sidewalk') { found = { x: nx, y: ny }; break }
      queue.push({ x: nx, y: ny })
    }
  }
  if (!found) return

  // Walk back, painting grass as path
  let k = prev.get(key(found.x, found.y))
  while (k !== undefined) {
    const x = k % cols, y = Math.floor(k / cols)
    if (tiles[y][x] === 'grass') tiles[y][x] = 'path'
    k = prev.get(k)
  }
}

// ── Placement validation ─────────────────────────────────────────────────────

/** True if a w×h footprint at pos fits: inside bounds, all grass, 1-tile gap from other buildings */
export function canPlaceBuilding(map: WorldMap, pos: Vec2, w: number, h: number): boolean {
  if (pos.x < 1 || pos.y < 1 || pos.x + w > map.cols - 1 || pos.y + h > map.rows - 1) return false
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      if (map.tiles[pos.y + dy][pos.x + dx] !== 'grass') return false
    }
  }
  // 1-tile buffer from existing buildings
  for (const b of map.buildings) {
    const gap = 1
    const overlapX = pos.x < b.gridPos.x + b.tileW + gap && pos.x + w + gap > b.gridPos.x
    const overlapY = pos.y < b.gridPos.y + b.tileH + gap && pos.y + h + gap > b.gridPos.y
    if (overlapX && overlapY) return false
  }
  return true
}

/** Auto-generate rooms for a player-placed building */
export function makeRoomsForLot(id: string, pos: Vec2, w: number, h: number): Room[] {
  const rooms: Room[] = []
  const names = ['Room A', 'Room B', 'Room C', 'Room D', 'Room E', 'Room F']
  let n = 0
  for (let dy = 1; dy < h - 1 && n < 6; dy += 2) {
    for (let dx = 1; dx < w - 1 && n < 6; dx += 2) {
      rooms.push({
        id: `${id}_room${n}`,
        name: names[n],
        buildingId: id,
        gridPos: { x: pos.x + dx, y: pos.y + dy },
        occupants: [],
      })
      n++
    }
  }
  if (rooms.length === 0) {
    rooms.push({ id: `${id}_room0`, name: 'Main Room', buildingId: id, gridPos: { ...pos }, occupants: [] })
  }
  return rooms
}

// ── Auto-furnishing ──────────────────────────────────────────────────────────

const HOME_IDS = new Set(['home1', 'home2', 'hq_quarters'])

/**
 * Generate furniture for a building.
 * style 'home'  → beds at rooms + fridge, couch, tv, shower, plant
 * style 'work'  → desks at rooms + fridge, couch, plant
 * style 'mixed' → desks at rooms + beds nearby + fridge, couch, tv, shower, plant
 *   (player lots are mixed because hired agents live where they work)
 */
export function autoFurnish(b: Building, style: 'home' | 'work' | 'mixed'): Furniture[] {
  const furniture: Furniture[] = []
  let n = 0
  const add = (kind: FurnitureKind, gridPos: Vec2) => {
    furniture.push({ id: `${b.id}_f${n++}`, kind, gridPos })
  }
  const taken = (p: Vec2) =>
    furniture.some(f => f.gridPos.x === p.x && f.gridPos.y === p.y) ||
    b.rooms.some(r => r.gridPos.x === p.x && r.gridPos.y === p.y) ||
    (b.doorTile.x === p.x && b.doorTile.y === p.y)

  // Anchor furniture at room centres (this is where agents stand)
  for (const room of b.rooms) {
    add(style === 'home' ? 'bed' : 'desk', { ...room.gridPos })
  }

  // Mixed: tuck a bed next to each of the first two desks
  if (style === 'mixed') {
    let beds = 0
    for (const room of b.rooms) {
      if (beds >= 2) break
      const spot = { x: room.gridPos.x, y: room.gridPos.y + 1 }
      if (
        spot.x > b.gridPos.x && spot.x < b.gridPos.x + b.tileW - 1 &&
        spot.y > b.gridPos.y && spot.y < b.gridPos.y + b.tileH - 1 &&
        !taken(spot)
      ) {
        add('bed', spot)
        beds++
      }
    }
  }

  // Amenities on free interior tiles (edges preferred)
  const wanted: FurnitureKind[] =
    style === 'work' ? ['fridge', 'couch', 'plant'] : ['fridge', 'couch', 'tv', 'shower', 'plant']

  const candidates: Vec2[] = []
  for (let dy = 1; dy < b.tileH - 1; dy++) {
    for (let dx = 1; dx < b.tileW - 1; dx++) {
      candidates.push({ x: b.gridPos.x + dx, y: b.gridPos.y + dy })
    }
  }
  // Prefer edge tiles first
  candidates.sort((a, c) => {
    const edgeScore = (p: Vec2) => {
      const dx = Math.min(p.x - b.gridPos.x, b.gridPos.x + b.tileW - 1 - p.x)
      const dy = Math.min(p.y - b.gridPos.y, b.gridPos.y + b.tileH - 1 - p.y)
      return Math.min(dx, dy)
    }
    return edgeScore(a) - edgeScore(c)
  })

  for (const kind of wanted) {
    const spot = candidates.find(p => !taken(p))
    if (!spot) break
    add(kind, { x: spot.x, y: spot.y })
  }

  return furniture
}

export function furnishStyleFor(b: Building): 'home' | 'work' | 'mixed' {
  if (b.custom) return 'mixed'
  return HOME_IDS.has(b.id) ? 'home' : 'work'
}

// ── World expansion ──────────────────────────────────────────────────────────

export const MAX_COLS = 110
export const MAX_ROWS = 74

/** Grow the world — alternates east / south, adding a new road each time */
export function expandWorld(map: WorldMap): WorldMap {
  const growEast = map.cols <= map.rows * 2.1 && map.cols + 14 <= MAX_COLS
  const growSouth = map.rows + 11 <= MAX_ROWS

  if (!growEast && !growSouth) return map

  let cols = map.cols
  let rows = map.rows
  const hRoads = [...map.hRoads]
  const vRoads = [...map.vRoads]

  if (growEast) {
    vRoads.push(cols)       // new avenue where the old edge was
    cols += 14
  } else {
    hRoads.push(rows)       // new street where the old edge was
    rows += 11
  }

  return {
    ...map,
    cols, rows, hRoads, vRoads,
    tiles: generateTiles(cols, rows, hRoads, vRoads, map.buildings),
    expansions: map.expansions + 1,
  }
}

/** Fraction of tiles still free grass — used to decide when the world should grow */
export function freeGrassRatio(map: WorldMap): number {
  let grass = 0
  for (let y = 0; y < map.rows; y++)
    for (let x = 0; x < map.cols; x++)
      if (map.tiles[y][x] === 'grass') grass++
  return grass / (map.cols * map.rows)
}

// ── Initial world ────────────────────────────────────────────────────────────

export function makeInitialWorld(): WorldMap {
  const hRoads = [7]
  const vRoads = [9, 20]
  return {
    cols: COLS,
    rows: ROWS,
    tiles: generateTiles(COLS, ROWS, hRoads, vRoads, buildings),
    buildings: buildings.map(b => {
      const copy = { ...b, rooms: b.rooms.map(r => ({ ...r })) }
      copy.furniture = autoFurnish(copy, furnishStyleFor(copy))
      return copy
    }),
    hRoads, vRoads,
    nextLotId: 1,
    expansions: 0,
  }
}

export const worldMap: WorldMap = makeInitialWorld()

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

// ── Market Analysis Team (original characters — analysis only, no signals) ───
export const ANALYST_DEFS: AgentDef[] = [
  {
    id: 'nova_news', name: 'Nova', role: 'news_analyst', emoji: '📰',
    color: '#f97316', accentColor: '#fdba74',
    homeBuilding: 'hq_quarters', workBuilding: 'trading_office', workRoom: 'review_room',
    spawnTile: { x: 26, y: 1 }, startState: 'sleeping', mood: 'happy',
    isAvenger: true,
    agentNeeds: { dataFreshness: 88, apiHealth: 92, rest: 85, morale: 88 },
    agentSkill: { name: 'Macro & News Context', level: 8, xp: 20, xpToNext: 110 },
  },
  {
    id: 'vera_volume', name: 'Vera', role: 'volume_analyst', emoji: '📊',
    color: '#a855f7', accentColor: '#d8b4fe',
    homeBuilding: 'hq_quarters', workBuilding: 'trading_office', workRoom: 'market_room',
    spawnTile: { x: 27, y: 1 }, startState: 'sleeping', mood: 'neutral',
    isAvenger: true,
    agentNeeds: { dataFreshness: 92, apiHealth: 95, rest: 88, morale: 90 },
    agentSkill: { name: 'Volume Profile', level: 10, xp: 40, xpToNext: 140 },
  },
  {
    id: 'marlow_liq', name: 'Marlow', role: 'liquidity_analyst', emoji: '💧',
    color: '#06b6d4', accentColor: '#67e8f9',
    homeBuilding: 'hq_quarters', workBuilding: 'trading_office', workRoom: 'market_room',
    spawnTile: { x: 28, y: 1 }, startState: 'sleeping', mood: 'happy',
    isAvenger: true,
    agentNeeds: { dataFreshness: 90, apiHealth: 90, rest: 90, morale: 92 },
    agentSkill: { name: 'Liquidity Mapping', level: 9, xp: 60, xpToNext: 130 },
  },
  {
    id: 'sana_session', name: 'Sana', role: 'session_analyst', emoji: '🕐',
    color: '#10b981', accentColor: '#6ee7b7',
    homeBuilding: 'hq_quarters', workBuilding: 'trading_office', workRoom: 'strategy_room',
    spawnTile: { x: 26, y: 2 }, startState: 'sleeping', mood: 'excited',
    isAvenger: true,
    agentNeeds: { dataFreshness: 85, apiHealth: 88, rest: 92, morale: 90 },
    agentSkill: { name: 'Session Timing', level: 8, xp: 35, xpToNext: 115 },
  },
  {
    id: 'cole_structure', name: 'Cole', role: 'structure_analyst', emoji: '🧭',
    color: '#4a6cf7', accentColor: '#a5b4fc',
    homeBuilding: 'hq_quarters', workBuilding: 'trading_office', workRoom: 'strategy_room',
    spawnTile: { x: 27, y: 2 }, startState: 'sleeping', mood: 'neutral',
    isAvenger: true,
    agentNeeds: { dataFreshness: 87, apiHealth: 90, rest: 80, morale: 85 },
    agentSkill: { name: 'Market Structure', level: 11, xp: 70, xpToNext: 150 },
  },
]

/** Kept as an alias so older imports keep working */
export const AVENGERS_DEFS = ANALYST_DEFS

export const ALL_AGENT_DEFS = [...AGENT_DEFS, ...ANALYST_DEFS]

/** Ids of the retired signal-era roster — purged from old saves on load */
export const RETIRED_AGENT_IDS = new Set([
  'ironman', 'captain', 'scarlet', 'vision', 'thor', 'fury',
  'widow', 'spiderman', 'hawkeye', 'strange', 'hulk',
])

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
    lifeNeeds: defaultLifeNeeds(),
    // Analyst extras
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
