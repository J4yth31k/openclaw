import type {
  WorldMap, Building, TileType, Agent,
  AgentRole, Mood, Vec2, AgentId, BuildingId, BusinessId, AgentState, RoomId
} from '../types'

// ── Map dimensions ───────────────────────────────────────────────────────────
export const COLS = 20
export const ROWS = 16

// ── Tile size and ISO offset ─────────────────────────────────────────────────
export const TILE_W = 48    // smaller tiles → more compact world
export const TILE_H = 24
export const ISO_OFFSET_X = 120   // world origin offset
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
  {
    id: 'home1',
    name: 'Home 🏠',
    gridPos: { x: 0, y: 0 },
    tileW: 4,
    tileH: 4,
    color: '#e8c9a0',
    roofColor: '#c0392b',
    accentColor: '#f5e6c8',
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
    tileW: 4,
    tileH: 4,
    color: '#a0c4e8',
    roofColor: '#2c3e50',
    accentColor: '#c4ddf5',
    doorTile: { x: 16, y: 3 },
    rooms: [
      { id: 'home2_bedroom', name: 'Bedroom', buildingId: 'home2', gridPos: { x: 16, y: 1 }, occupants: [] },
      { id: 'home2_kitchen', name: 'Kitchen', buildingId: 'home2', gridPos: { x: 17, y: 1 }, occupants: [] },
    ],
  },
  {
    id: 'creative_studio',
    name: 'Creative Studio',
    gridPos: { x: 0, y: 9 },
    tileW: 8,
    tileH: 6,
    color: '#f9e4b7',
    roofColor: '#e67e22',
    accentColor: '#fdf3dc',
    doorTile: { x: 4, y: 14 },
    rooms: [
      { id: 'research_room',  name: 'Research Room',  buildingId: 'creative_studio', gridPos: { x: 2, y: 10 }, occupants: [] },
      { id: 'design_room',    name: 'Design Room',    buildingId: 'creative_studio', gridPos: { x: 5, y: 10 }, occupants: [] },
      { id: 'qc_room',        name: 'QC Room',        buildingId: 'creative_studio', gridPos: { x: 2, y: 13 }, occupants: [] },
      { id: 'upload_room',    name: 'Upload Room',    buildingId: 'creative_studio', gridPos: { x: 5, y: 13 }, occupants: [] },
    ],
  },
  {
    id: 'trading_office',
    name: 'Trading Office',
    gridPos: { x: 11, y: 9 },
    tileW: 8,
    tileH: 6,
    color: '#c8daf5',
    roofColor: '#2c3e50',
    accentColor: '#deeafc',
    doorTile: { x: 15, y: 14 },
    rooms: [
      { id: 'market_room',   name: 'Market Room',    buildingId: 'trading_office', gridPos: { x: 13, y: 10 }, occupants: [] },
      { id: 'strategy_room', name: 'Strategy Room',  buildingId: 'trading_office', gridPos: { x: 16, y: 10 }, occupants: [] },
      { id: 'risk_room',     name: 'Risk Room',      buildingId: 'trading_office', gridPos: { x: 13, y: 13 }, occupants: [] },
      { id: 'review_room',   name: 'Review Room',    buildingId: 'trading_office', gridPos: { x: 16, y: 13 }, occupants: [] },
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
    tiles[6][x] = 'road'
    tiles[7][x] = 'road'
    tiles[5][x] = tiles[5][x] === 'grass' ? 'sidewalk' : tiles[5][x]
    tiles[8][x] = tiles[8][x] === 'grass' ? 'sidewalk' : tiles[8][x]
  }

  // Vertical road (separating left and right sides)
  for (let y = 0; y < ROWS; y++) {
    tiles[y][9] = 'road'
    tiles[y][10] = 'road'
    if (tiles[y][8] === 'grass') tiles[y][8] = 'sidewalk'
    if (tiles[y][11] === 'grass') tiles[y][11] = 'sidewalk'
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
    tiles[b.doorTile.y][b.doorTile.x] = 'path'
  }

  // Paths from home doors to road
  for (let y = 4; y <= 5; y++) tiles[y][2] = 'path'   // home1 path
  for (let y = 4; y <= 5; y++) tiles[y][16] = 'path'  // home2 path
  // Paths from office doors to road
  for (let y = 8; y <= 8; y++) tiles[y][4] = 'path'   // creative studio path
  for (let y = 8; y <= 8; y++) tiles[y][15] = 'path'  // trading office path

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
}

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

export function makeInitialAgents(): Agent[] {
  return AGENT_DEFS.map(def => ({
    id: def.id, name: def.name, role: def.role,
    color: def.color, accentColor: def.accentColor,
    homeBuilding: def.homeBuilding, workBuilding: def.workBuilding, workRoom: def.workRoom,
    gridPos: { ...def.spawnTile },
    pixelPos: gridToPixel(def.spawnTile),
    path: [], state: def.startState, mood: def.mood,
    energy: 100, stress: 0, taskProgress: 0,
    taskName: null, speech: null, speechTimer: 0, currentRoom: null,
  } satisfies Agent))
}
