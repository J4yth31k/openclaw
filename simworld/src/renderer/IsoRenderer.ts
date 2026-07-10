import type { SimState, Agent, Building, TileType, Vec2, WorldMap, Furniture } from '../types'
import { TILE_W, TILE_H, gridToIso } from '../data/worldData'

// ── Render FX passed from WorldCanvas each frame ──────────────────────────────

export interface RenderFX {
  nowMs: number
  nightAmt: number      // 0 = day, 1 = night
  rainAmt: number       // 0 = dry, 1 = downpour
  zoom: number
  ghost?: { pos: Vec2; w: number; h: number; valid: boolean } | null
}

// ── Deterministic hash (stable per-tile variation) ────────────────────────────

function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0
  h = (h ^ (h >> 13)) * 1274126177
  h = h ^ (h >> 16)
  return (h >>> 0) / 4294967295
}

function agentPhase(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff
  return (h / 0xffff) * Math.PI * 2
}

// ── Color helpers ─────────────────────────────────────────────────────────────

function darken(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  if (Number.isNaN(num)) return hex
  const r = Math.max(0, (num >> 16) - Math.round(255 * amount))
  const g = Math.max(0, ((num >> 8) & 0xff) - Math.round(255 * amount))
  const b = Math.max(0, (num & 0xff) - Math.round(255 * amount))
  return `rgb(${r},${g},${b})`
}

function lighten(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  if (Number.isNaN(num)) return hex
  const r = Math.min(255, (num >> 16) + Math.round(255 * amount))
  const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(255 * amount))
  const b = Math.min(255, (num & 0xff) + Math.round(255 * amount))
  return `rgb(${r},${g},${b})`
}

// ── Tile palette (multiple shades per type for texture) ───────────────────────

const GRASS_SHADES = ['#79c479', '#71bd74', '#7fca7c', '#6db56e']
const WALL_H = 60

// ── World bounds ──────────────────────────────────────────────────────────────

export function worldBounds(map: WorldMap) {
  const minX = (0 - map.rows) * (TILE_W / 2) + 120 - TILE_W / 2
  const maxX = map.cols * (TILE_W / 2) + 120 + TILE_W / 2
  const minY = 60 - TILE_H / 2 - 70                     // headroom for trees / labels
  const maxY = (map.cols + map.rows) * (TILE_H / 2) + 60 + TILE_H / 2 + WALL_H + 30
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

// ── Terrain cache (tiles + static décor drawn once per map change) ────────────

let terrainCache: {
  tilesRef: TileType[][]
  canvas: HTMLCanvasElement
  minX: number
  minY: number
} | null = null

function getTerrain(map: WorldMap): { canvas: HTMLCanvasElement; minX: number; minY: number } {
  if (terrainCache && terrainCache.tilesRef === map.tiles) return terrainCache

  const b = worldBounds(map)
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(b.width)
  canvas.height = Math.ceil(b.height)
  const ctx = canvas.getContext('2d')!
  ctx.translate(-b.minX, -b.minY)

  // Tiles (painter's order)
  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.cols; col++) {
      drawTile(ctx, map, col, row)
    }
  }
  // Island edge faces (south + east rim) → floating-diorama look
  drawWorldEdges(ctx, map)

  // Static décor: trees + flowers on safe grass
  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.cols; col++) {
      if (map.tiles[row][col] !== 'grass') continue
      const h = hash2(col, row)
      if (h < 0.055 && allGrassAround(map, col, row)) {
        drawTree(ctx, gridToIso({ x: col, y: row }), h)
      } else if (h > 0.9) {
        drawFlowers(ctx, gridToIso({ x: col, y: row }), h)
      }
    }
  }

  terrainCache = { tilesRef: map.tiles, canvas, minX: b.minX, minY: b.minY }
  return terrainCache
}

function allGrassAround(map: WorldMap, x: number, y: number): boolean {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const nx = x + dx, ny = y + dy
    if (nx < 0 || nx >= map.cols || ny < 0 || ny >= map.rows) return false
    if (map.tiles[ny][nx] !== 'grass') return false
  }
  return true
}

// ── Main render entry ─────────────────────────────────────────────────────────

export function render(ctx: CanvasRenderingContext2D, state: SimState & { placing?: unknown }, fx: RenderFX) {
  const { worldMap, agents, selectedAgentId, selectedBuildingId } = state

  // 1. Cached terrain
  const terrain = getTerrain(worldMap)
  ctx.drawImage(terrain.canvas, terrain.minX, terrain.minY)

  // 1b. Wet-road sheen while it rains
  if (fx.rainAmt > 0.05) drawWetRoads(ctx, worldMap, fx)

  // 2. Street lamps (dynamic: glow at night)
  drawStreetLamps(ctx, worldMap, fx)

  // 2b. Traffic on the roads
  drawTraffic(ctx, worldMap, fx)

  // 3. Ghost placement preview (under buildings so validity tiles read clearly)
  if (fx.ghost) drawGhost(ctx, fx.ghost, fx)

  // 4. Buildings (depth-sorted)
  const sortedBuildings = [...worldMap.buildings].sort(
    (a, b) => (a.gridPos.x + a.tileW + a.gridPos.y + a.tileH) - (b.gridPos.x + b.tileW + b.gridPos.y + b.tileH)
  )
  for (const b of sortedBuildings) {
    drawBuilding(ctx, b, b.id === selectedBuildingId, fx)
  }

  // 5. Command target markers (under agents)
  for (const agent of agents) {
    if (agent.command) drawCommandMarker(ctx, agent, fx)
  }

  // 6. Agents (depth-sorted)
  const sorted = [...agents].sort((a, b) => a.pixelPos.y - b.pixelPos.y)
  for (const agent of sorted) {
    drawAgent(ctx, agent, agent.id === selectedAgentId, fx)
  }

  // 7. Birds crossing the sky
  drawBirds(ctx, worldMap, fx)

  // 8. Drifting clouds (above everything, soft)
  drawClouds(ctx, worldMap, fx)
}

// ── Tile drawing ──────────────────────────────────────────────────────────────

function tilePath(ctx: CanvasRenderingContext2D, sx: number, sy: number, inset = 0) {
  const hw = TILE_W / 2 - inset
  const hh = TILE_H / 2 - inset * 0.5
  ctx.beginPath()
  ctx.moveTo(sx, sy - hh)
  ctx.lineTo(sx + hw, sy)
  ctx.lineTo(sx, sy + hh)
  ctx.lineTo(sx - hw, sy)
  ctx.closePath()
}

function drawTile(ctx: CanvasRenderingContext2D, map: WorldMap, col: number, row: number) {
  const type = map.tiles[row][col]
  const { x: sx, y: sy } = gridToIso({ x: col, y: row })
  const h = hash2(col, row)

  switch (type) {
    case 'grass': {
      tilePath(ctx, sx, sy)
      ctx.fillStyle = GRASS_SHADES[Math.floor(h * GRASS_SHADES.length)]
      ctx.fill()
      // Soft mottling
      if (h > 0.55) {
        tilePath(ctx, sx, sy, 7)
        ctx.fillStyle = 'rgba(255,255,255,0.045)'
        ctx.fill()
      }
      break
    }
    case 'road': {
      tilePath(ctx, sx, sy)
      const g = ctx.createLinearGradient(sx, sy - TILE_H / 2, sx, sy + TILE_H / 2)
      g.addColorStop(0, '#565664')
      g.addColorStop(1, '#4a4a58')
      ctx.fillStyle = g
      ctx.fill()
      // Wear noise
      if (h > 0.7) {
        tilePath(ctx, sx, sy, 8)
        ctx.fillStyle = 'rgba(255,255,255,0.03)'
        ctx.fill()
      }
      // Lane dashes — orientation from neighbours
      const leftRoad  = col > 0 && map.tiles[row][col - 1] === 'road'
      const rightRoad = col < map.cols - 1 && map.tiles[row][col + 1] === 'road'
      const upRoad    = row > 0 && map.tiles[row - 1][col] === 'road'
      const downRoad  = row < map.rows - 1 && map.tiles[row + 1][col] === 'road'
      ctx.strokeStyle = 'rgba(245,220,130,0.4)'
      ctx.lineWidth = 1.6
      ctx.lineCap = 'round'
      if (leftRoad && rightRoad && (col + row) % 2 === 0 && !upRoad) {
        // horizontal road, dash along +x tile axis (only on the top lane)
        const a = gridToIso({ x: col - 0.28 + 0.5, y: row + 0.5 })
        const b = gridToIso({ x: col + 0.28 + 0.5, y: row + 0.5 })
        ctx.beginPath(); ctx.moveTo(a.x, a.y - TILE_H / 2); ctx.lineTo(b.x, b.y - TILE_H / 2); ctx.stroke()
      } else if (upRoad && downRoad && (col + row) % 2 === 0 && !leftRoad) {
        const a = gridToIso({ x: col + 0.5, y: row - 0.28 + 0.5 })
        const b = gridToIso({ x: col + 0.5, y: row + 0.28 + 0.5 })
        ctx.beginPath(); ctx.moveTo(a.x, a.y - TILE_H / 2); ctx.lineTo(b.x, b.y - TILE_H / 2); ctx.stroke()
      }
      break
    }
    case 'sidewalk': {
      tilePath(ctx, sx, sy)
      ctx.fillStyle = h > 0.5 ? '#b4bcc4' : '#adb5bd'
      ctx.fill()
      tilePath(ctx, sx, sy)
      ctx.strokeStyle = 'rgba(0,0,0,0.10)'
      ctx.lineWidth = 0.6
      ctx.stroke()
      break
    }
    case 'path': {
      tilePath(ctx, sx, sy)
      ctx.fillStyle = h > 0.5 ? '#c9ad80' : '#c4a87a'
      ctx.fill()
      // Pebbles
      ctx.fillStyle = 'rgba(120,95,60,0.35)'
      for (let i = 0; i < 3; i++) {
        const px = sx + (hash2(col * 3 + i, row) - 0.5) * TILE_W * 0.5
        const py = sy + (hash2(col, row * 3 + i) - 0.5) * TILE_H * 0.5
        ctx.beginPath(); ctx.arc(px, py, 0.9, 0, Math.PI * 2); ctx.fill()
      }
      break
    }
    case 'building_floor': {
      tilePath(ctx, sx, sy)
      ctx.fillStyle = '#d4c4b0'
      ctx.fill()
      break
    }
  }

  // Hairline grid (very subtle, grounds the iso look)
  tilePath(ctx, sx, sy)
  ctx.strokeStyle = 'rgba(0,0,0,0.05)'
  ctx.lineWidth = 0.5
  ctx.stroke()
}

// ── Floating-island edge ──────────────────────────────────────────────────────

function drawWorldEdges(ctx: CanvasRenderingContext2D, map: WorldMap) {
  const depth = 22
  // South-west rim (row = rows-1)
  for (let col = 0; col < map.cols; col++) {
    const { x: sx, y: sy } = gridToIso({ x: col, y: map.rows - 1 })
    const g = ctx.createLinearGradient(sx, sy, sx, sy + TILE_H / 2 + depth)
    g.addColorStop(0, '#5d4a36')
    g.addColorStop(1, '#2e2117')
    ctx.beginPath()
    ctx.moveTo(sx - TILE_W / 2, sy)
    ctx.lineTo(sx, sy + TILE_H / 2)
    ctx.lineTo(sx, sy + TILE_H / 2 + depth)
    ctx.lineTo(sx - TILE_W / 2, sy + depth)
    ctx.closePath()
    ctx.fillStyle = g
    ctx.fill()
  }
  // South-east rim (col = cols-1)
  for (let row = 0; row < map.rows; row++) {
    const { x: sx, y: sy } = gridToIso({ x: map.cols - 1, y: row })
    const g = ctx.createLinearGradient(sx, sy, sx, sy + TILE_H / 2 + depth)
    g.addColorStop(0, '#4f3d2c')
    g.addColorStop(1, '#261b12')
    ctx.beginPath()
    ctx.moveTo(sx + TILE_W / 2, sy)
    ctx.lineTo(sx, sy + TILE_H / 2)
    ctx.lineTo(sx, sy + TILE_H / 2 + depth)
    ctx.lineTo(sx + TILE_W / 2, sy + depth)
    ctx.closePath()
    ctx.fillStyle = g
    ctx.fill()
  }
}

// ── Trees & flowers ───────────────────────────────────────────────────────────

function drawTree(ctx: CanvasRenderingContext2D, p: Vec2, seed: number) {
  const s = 0.8 + seed * 4  // size variety
  // Shadow
  ctx.beginPath()
  ctx.ellipse(p.x + 3, p.y + 3, 9 + s, 4 + s * 0.4, 0, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.fill()
  // Trunk
  ctx.fillStyle = '#7a5a3a'
  ctx.fillRect(p.x - 1.5, p.y - 10 - s, 3, 12 + s)
  // Canopy — three stacked blobs
  const greens = ['#3e8948', '#4a9b52', '#57ab5e']
  for (let i = 0; i < 3; i++) {
    const r = (11 + s) - i * 3
    ctx.beginPath()
    ctx.arc(p.x, p.y - 14 - s - i * 6, r, 0, Math.PI * 2)
    ctx.fillStyle = greens[i]
    ctx.fill()
  }
  // Highlight
  ctx.beginPath()
  ctx.arc(p.x - 3, p.y - 22 - s, 4, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.14)'
  ctx.fill()
}

function drawFlowers(ctx: CanvasRenderingContext2D, p: Vec2, seed: number) {
  const colors = ['#f8c9d4', '#fde68a', '#c4b5fd', '#fca5a5']
  for (let i = 0; i < 3; i++) {
    const fx = p.x + (hash2(i, seed * 100) - 0.5) * TILE_W * 0.45
    const fy = p.y + (hash2(seed * 100, i) - 0.5) * TILE_H * 0.45
    ctx.beginPath()
    ctx.arc(fx, fy, 1.4, 0, Math.PI * 2)
    ctx.fillStyle = colors[Math.floor(hash2(i * 7, seed * 31) * colors.length)]
    ctx.fill()
  }
}

// ── Street lamps ──────────────────────────────────────────────────────────────

function drawStreetLamps(ctx: CanvasRenderingContext2D, map: WorldMap, fx: RenderFX) {
  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.cols; col++) {
      if (map.tiles[row][col] !== 'sidewalk') continue
      if ((col * 7 + row * 13) % 31 !== 0) continue
      const p = gridToIso({ x: col, y: row })
      // Pole
      ctx.strokeStyle = '#3a3f4a'
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - 26); ctx.stroke()
      // Head
      ctx.beginPath(); ctx.arc(p.x, p.y - 28, 3, 0, Math.PI * 2)
      ctx.fillStyle = fx.nightAmt > 0.25 ? '#ffe9a3' : '#8a8f9a'
      ctx.fill()
      // Night glow
      if (fx.nightAmt > 0.25) {
        const glow = ctx.createRadialGradient(p.x, p.y - 26, 2, p.x, p.y - 20, 30)
        glow.addColorStop(0, `rgba(255,220,130,${0.35 * fx.nightAmt})`)
        glow.addColorStop(1, 'rgba(255,220,130,0)')
        ctx.fillStyle = glow
        ctx.beginPath(); ctx.arc(p.x, p.y - 20, 30, 0, Math.PI * 2); ctx.fill()
      }
    }
  }
}

// ── Buildings ─────────────────────────────────────────────────────────────────

function buildingCorners(b: Building) {
  return {
    tl: gridToIso(b.gridPos),
    tr: gridToIso({ x: b.gridPos.x + b.tileW, y: b.gridPos.y }),
    bl: gridToIso({ x: b.gridPos.x, y: b.gridPos.y + b.tileH }),
    br: gridToIso({ x: b.gridPos.x + b.tileW, y: b.gridPos.y + b.tileH }),
  }
}

function drawBuilding(ctx: CanvasRenderingContext2D, b: Building, selected: boolean, fx: RenderFX) {
  const { tl, tr, bl, br } = buildingCorners(b)
  const vacant = !!b.vacant
  const wallColor = vacant ? '#6a7180' : b.color
  const floorColor = vacant ? '#9aa2ae' : lighten(b.accentColor, 0.06)
  const H = WALL_H + ((b.floors ?? 1) - 1) * 14   // back-wall height
  const STUB = 9                                   // cutaway front-wall height

  // ── Ground contact shadow
  ctx.beginPath()
  ctx.moveTo(tl.x, tl.y + 3)
  ctx.lineTo(tr.x + 5, tr.y + 4)
  ctx.lineTo(br.x, br.y + 7)
  ctx.lineTo(bl.x - 5, bl.y + 4)
  ctx.closePath()
  ctx.fillStyle = 'rgba(0,0,0,0.20)'
  ctx.fill()

  // ── Dollhouse cutaway: BACK walls rise up, front walls stay knee-high ──────
  const wallUp = (a: Vec2, c: Vec2, h: number, shade: number) => {
    const g = ctx.createLinearGradient(0, Math.min(a.y, c.y) - h, 0, Math.max(a.y, c.y))
    g.addColorStop(0, darken(wallColor, shade))
    g.addColorStop(1, darken(wallColor, shade + 0.14))
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(c.x, c.y)
    ctx.lineTo(c.x, c.y - h)
    ctx.lineTo(a.x, a.y - h)
    ctx.closePath()
    ctx.fillStyle = g
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.20)'
    ctx.lineWidth = 1
    ctx.stroke()
    // Wall-thickness cap on top (classic cut-wall look)
    ctx.beginPath()
    ctx.moveTo(a.x, a.y - h)
    ctx.lineTo(c.x, c.y - h)
    ctx.strokeStyle = lighten(wallColor, 0.22)
    ctx.lineWidth = 2.4
    ctx.stroke()
  }

  if (!vacant) {
    wallUp(tl, bl, H, 0.28)   // north-west face (back-left)
    wallUp(tl, tr, H, 0.08)   // north-east face (back-right)

    // Windows on the standing back walls
    drawWallWindows(ctx, b, tl, bl, H, Math.max(2, b.tileH - 1), 1, fx)
    drawWallWindows(ctx, b, tl, tr, H, Math.max(2, b.tileW - 1), 2, fx)
  }

  // ── Interior floor (wood-tone planks)
  ctx.beginPath()
  ctx.moveTo(tl.x, tl.y)
  ctx.lineTo(tr.x, tr.y)
  ctx.lineTo(br.x, br.y)
  ctx.lineTo(bl.x, bl.y)
  ctx.closePath()
  const pg = ctx.createLinearGradient(tl.x, tl.y, br.x, br.y)
  pg.addColorStop(0, lighten(floorColor, 0.05))
  pg.addColorStop(1, darken(floorColor, 0.08))
  ctx.fillStyle = pg
  ctx.fill()
  // Plank seams
  ctx.strokeStyle = 'rgba(0,0,0,0.07)'
  ctx.lineWidth = 0.8
  const planks = Math.max(3, b.tileH)
  for (let i = 1; i < planks; i++) {
    const t = i / planks
    ctx.beginPath()
    ctx.moveTo(tl.x + (bl.x - tl.x) * t, tl.y + (bl.y - tl.y) * t)
    ctx.lineTo(tr.x + (br.x - tr.x) * t, tr.y + (br.y - tr.y) * t)
    ctx.stroke()
  }
  // Baseboard trim along interior edges
  ctx.beginPath()
  ctx.moveTo(tl.x, tl.y)
  ctx.lineTo(tr.x, tr.y)
  ctx.lineTo(br.x, br.y)
  ctx.lineTo(bl.x, bl.y)
  ctx.closePath()
  ctx.strokeStyle = darken(wallColor, 0.15)
  ctx.lineWidth = 1.4
  ctx.stroke()

  const cx = (tl.x + tr.x + bl.x + br.x) / 4
  const cy = (tl.y + tr.y + bl.y + br.y) / 4

  // ── Room zones (cutaway floor-plan feel)
  if (!vacant) {
    for (const room of b.rooms) {
      const rp = gridToIso(room.gridPos)
      tilePath(ctx, rp.x, rp.y, 3)
      ctx.fillStyle = 'rgba(255,255,255,0.10)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'
      ctx.lineWidth = 0.8
      ctx.stroke()
      if (fx.zoom >= 0.85) {
        ctx.font = '600 6.5px system-ui'
        ctx.textAlign = 'center'
        ctx.fillStyle = 'rgba(255,255,255,0.5)'
        ctx.fillText(room.name, rp.x, rp.y - 9)
      }
    }

    // ── Furniture (agents walk to and use these)
    if (b.furniture) {
      const sorted = [...b.furniture].sort(
        (f1, f2) => (f1.gridPos.x + f1.gridPos.y) - (f2.gridPos.x + f2.gridPos.y)
      )
      for (const f of sorted) drawFurniture(ctx, f, b, fx)
    }
  }

  // ── Vacant: dashed marching outline + sign
  if (vacant) {
    ctx.beginPath()
    ctx.moveTo(tl.x, tl.y)
    ctx.lineTo(tr.x, tr.y)
    ctx.lineTo(br.x, br.y)
    ctx.lineTo(bl.x, bl.y)
    ctx.closePath()
    ctx.setLineDash([6, 5])
    ctx.lineDashOffset = -(fx.nowMs / 60) % 11
    ctx.strokeStyle = '#f5a623'
    ctx.lineWidth = 1.6
    ctx.stroke()
    ctx.setLineDash([])

    ctx.font = 'bold 9px system-ui'
    ctx.textAlign = 'center'
    ctx.fillStyle = '#ffcf87'
    ctx.shadowColor = 'rgba(0,0,0,0.7)'
    ctx.shadowBlur = 4
    ctx.fillText('🏗️ VACANT — assign a business', cx, cy + 3)
    ctx.shadowBlur = 0
  }

  // ── Selection pulse
  if (selected) {
    const pulse = 0.6 + Math.sin(fx.nowMs / 220) * 0.4
    ctx.beginPath()
    ctx.moveTo(tl.x, tl.y)
    ctx.lineTo(tr.x, tr.y)
    ctx.lineTo(br.x, br.y)
    ctx.lineTo(bl.x, bl.y)
    ctx.closePath()
    ctx.strokeStyle = `rgba(0,212,255,${(0.5 + pulse * 0.5).toFixed(2)})`
    ctx.lineWidth = 2 + pulse
    ctx.stroke()
  }

  // ── Cutaway front walls (knee-high stubs so the interior stays visible)
  const stub = (a: Vec2, c: Vec2, shade: number) => {
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(c.x, c.y)
    ctx.lineTo(c.x, c.y - STUB)
    ctx.lineTo(a.x, a.y - STUB)
    ctx.closePath()
    ctx.fillStyle = darken(wallColor, shade)
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'
    ctx.lineWidth = 0.8
    ctx.stroke()
    // Cut-wall top cap
    ctx.beginPath()
    ctx.moveTo(a.x, a.y - STUB)
    ctx.lineTo(c.x, c.y - STUB)
    ctx.strokeStyle = lighten(wallColor, 0.25)
    ctx.lineWidth = 2
    ctx.stroke()
  }
  if (!vacant) {
    stub(bl, br, 0.26)   // south-west front
    stub(br, tr, 0.14)   // south-east front

    // ── Doorway in the front stub (frame posts + threshold)
    const doorT = (b.doorTile.x - b.gridPos.x + 0.5) / b.tileW
    const doorX = bl.x + (br.x - bl.x) * doorT
    const doorY = bl.y + (br.y - bl.y) * doorT
    // Opening (break in the stub)
    ctx.fillStyle = darken(floorColor, 0.04)
    ctx.fillRect(doorX - 6, doorY - STUB - 1, 12, STUB + 1)
    // Posts + lintel
    ctx.strokeStyle = darken(wallColor, 0.4)
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(doorX - 6, doorY + 1); ctx.lineTo(doorX - 6, doorY - 20); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(doorX + 6, doorY + 1); ctx.lineTo(doorX + 6, doorY - 20); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(doorX - 7.5, doorY - 20); ctx.lineTo(doorX + 7.5, doorY - 20); ctx.stroke()
    // Welcome mat
    ctx.beginPath()
    roundRectPath(ctx, doorX - 5, doorY + 2, 10, 4, 1.5)
    ctx.fillStyle = 'rgba(160,120,70,0.75)'
    ctx.fill()
  }

  // ── Name plate
  const labelY = vacant ? tl.y - 12 : tl.y - H - 10
  ctx.font = 'bold 11px system-ui'
  const label = b.name
  const tw = ctx.measureText(label).width
  ctx.beginPath()
  roundRectPath(ctx, cx - tw / 2 - 8, labelY - 11, tw + 16, 16, 8)
  ctx.fillStyle = 'rgba(6,9,20,0.72)'
  ctx.fill()
  ctx.strokeStyle = vacant ? 'rgba(245,166,35,0.5)' : `${b.accentColor}66`
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.fillStyle = vacant ? '#ffcf87' : 'rgba(255,255,255,0.92)'
  ctx.fillText(label, cx, labelY + 1)
}

function drawWallWindows(
  ctx: CanvasRenderingContext2D,
  b: Building, a: Vec2, c: Vec2,
  wallH: number, count: number, seedBase: number,
  fx: RenderFX,
) {
  if (b.vacant) return
  const night = fx.nightAmt
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count
    const wx = a.x + (c.x - a.x) * t
    const wy = a.y + (c.y - a.y) * t - wallH * 0.55
    const lit = night > 0.3 && hash2(seedBase * 17 + i, b.tileW * 31 + b.tileH) > 0.35
    ctx.beginPath()
    roundRectPath(ctx, wx - 3.5, wy - 6, 7, 12, 1.5)
    if (lit) {
      ctx.fillStyle = `rgba(255,214,120,${(0.55 + 0.4 * night).toFixed(2)})`
      ctx.shadowColor = 'rgba(255,200,90,0.8)'
      ctx.shadowBlur = 6 * night
    } else {
      ctx.fillStyle = night > 0.5 ? 'rgba(70,90,120,0.85)' : 'rgba(205,230,255,0.85)'
    }
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'
    ctx.lineWidth = 0.8
    ctx.stroke()
    // Cross mullion
    ctx.beginPath()
    ctx.moveTo(wx - 3.5, wy)
    ctx.lineTo(wx + 3.5, wy)
    ctx.moveTo(wx, wy - 6)
    ctx.lineTo(wx, wy + 6)
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'
    ctx.lineWidth = 0.7
    ctx.stroke()
  }
}

// ── Command target marker ─────────────────────────────────────────────────────

function drawCommandMarker(ctx: CanvasRenderingContext2D, agent: Agent, fx: RenderFX) {
  const cmd = agent.command!
  const p = gridToIso(cmd.target)
  const pulse = 0.5 + Math.sin(fx.nowMs / 250) * 0.5

  // Pulsing ground ring
  tilePath(ctx, p.x, p.y, 3 + pulse * 3)
  ctx.strokeStyle = `rgba(0,212,255,${(0.4 + pulse * 0.5).toFixed(2)})`
  ctx.lineWidth = 1.6
  ctx.stroke()

  // Bouncing chevron
  const bob = Math.abs(Math.sin(fx.nowMs / 300)) * 5
  const topY = p.y - 26 - bob
  ctx.beginPath()
  ctx.moveTo(p.x - 5, topY)
  ctx.lineTo(p.x + 5, topY)
  ctx.lineTo(p.x, topY + 7)
  ctx.closePath()
  ctx.fillStyle = agent.color
  ctx.shadowColor = agent.color
  ctx.shadowBlur = 6
  ctx.fill()
  ctx.shadowBlur = 0
}

// ── Furniture sprites ─────────────────────────────────────────────────────────

function drawFurniture(ctx: CanvasRenderingContext2D, f: Furniture, b: Building, fx: RenderFX) {
  const p = gridToIso(f.gridPos)
  const seed = hash2(f.gridPos.x * 7, f.gridPos.y * 11)

  switch (f.kind) {
    case 'bed': {
      // Frame
      ctx.beginPath()
      roundRectPath(ctx, p.x - 13, p.y - 9, 26, 15, 3)
      ctx.fillStyle = '#8a6a48'
      ctx.fill()
      // Mattress
      ctx.beginPath()
      roundRectPath(ctx, p.x - 11, p.y - 8, 22, 12, 2)
      ctx.fillStyle = '#f2f2ea'
      ctx.fill()
      // Blanket
      ctx.beginPath()
      roundRectPath(ctx, p.x - 11, p.y - 3, 22, 7, 2)
      ctx.fillStyle = seed > 0.5 ? '#7aa8d8' : '#c98da8'
      ctx.fill()
      // Pillow
      ctx.beginPath()
      roundRectPath(ctx, p.x - 9, p.y - 7, 7, 4, 1.5)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      break
    }
    case 'desk': {
      // Legs
      ctx.strokeStyle = '#5a4632'
      ctx.lineWidth = 1.6
      ctx.beginPath(); ctx.moveTo(p.x - 8, p.y - 6); ctx.lineTo(p.x - 8, p.y + 2); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(p.x + 8, p.y - 6); ctx.lineTo(p.x + 8, p.y + 2); ctx.stroke()
      // Top
      ctx.beginPath()
      roundRectPath(ctx, p.x - 11, p.y - 9, 22, 5, 2)
      ctx.fillStyle = '#9a7a52'
      ctx.fill()
      // Monitor (glows when dark)
      ctx.beginPath()
      roundRectPath(ctx, p.x - 4, p.y - 17, 8, 6, 1)
      ctx.fillStyle = fx.nightAmt > 0.35 ? '#9fd8ff' : '#28303e'
      if (fx.nightAmt > 0.35) { ctx.shadowColor = 'rgba(120,200,255,0.8)'; ctx.shadowBlur = 5 }
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.strokeStyle = '#1a2028'
      ctx.lineWidth = 0.8
      ctx.stroke()
      ctx.beginPath(); ctx.moveTo(p.x, p.y - 11); ctx.lineTo(p.x, p.y - 9); ctx.strokeStyle = '#3a4048'; ctx.stroke()
      break
    }
    case 'fridge': {
      ctx.beginPath()
      roundRectPath(ctx, p.x - 5, p.y - 22, 10, 24, 2)
      const g = ctx.createLinearGradient(p.x - 5, 0, p.x + 5, 0)
      g.addColorStop(0, '#e8ecf0')
      g.addColorStop(1, '#c2c8d0')
      ctx.fillStyle = g
      ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'
      ctx.lineWidth = 0.8
      ctx.stroke()
      // Door split + handle
      ctx.beginPath(); ctx.moveTo(p.x - 5, p.y - 14); ctx.lineTo(p.x + 5, p.y - 14); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(p.x + 2.5, p.y - 19); ctx.lineTo(p.x + 2.5, p.y - 16); ctx.lineWidth = 1.4; ctx.strokeStyle = '#7a828c'; ctx.stroke()
      break
    }
    case 'couch': {
      const col = seed > 0.5 ? '#c46a4a' : '#5a7a9a'
      // Backrest
      ctx.beginPath()
      roundRectPath(ctx, p.x - 12, p.y - 12, 24, 8, 3)
      ctx.fillStyle = darken(col, 0.12)
      ctx.fill()
      // Seat
      ctx.beginPath()
      roundRectPath(ctx, p.x - 12, p.y - 6, 24, 8, 3)
      ctx.fillStyle = col
      ctx.fill()
      // Armrests
      ctx.beginPath(); roundRectPath(ctx, p.x - 14, p.y - 9, 4, 11, 2); ctx.fillStyle = darken(col, 0.2); ctx.fill()
      ctx.beginPath(); roundRectPath(ctx, p.x + 10, p.y - 9, 4, 11, 2); ctx.fill()
      break
    }
    case 'tv': {
      // Stand
      ctx.strokeStyle = '#3a4048'
      ctx.lineWidth = 1.4
      ctx.beginPath(); ctx.moveTo(p.x, p.y - 4); ctx.lineTo(p.x, p.y + 1); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(p.x - 4, p.y + 1); ctx.lineTo(p.x + 4, p.y + 1); ctx.stroke()
      // Screen (flickers subtly at night)
      ctx.beginPath()
      roundRectPath(ctx, p.x - 8, p.y - 14, 16, 10, 1.5)
      const on = fx.nightAmt > 0.3 || seed > 0.6
      const flicker = on ? 0.75 + Math.sin(fx.nowMs / 320 + seed * 9) * 0.15 : 0
      ctx.fillStyle = on ? `rgba(140,190,255,${flicker.toFixed(2)})` : '#20262e'
      ctx.fill()
      ctx.strokeStyle = '#12161c'
      ctx.lineWidth = 1
      ctx.stroke()
      break
    }
    case 'shower': {
      // Tray
      ctx.beginPath()
      roundRectPath(ctx, p.x - 8, p.y - 3, 16, 6, 2)
      ctx.fillStyle = '#cfe4ee'
      ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.2)'
      ctx.lineWidth = 0.8
      ctx.stroke()
      // Pole + head
      ctx.strokeStyle = '#8a929c'
      ctx.lineWidth = 1.4
      ctx.beginPath(); ctx.moveTo(p.x + 6, p.y - 2); ctx.lineTo(p.x + 6, p.y - 22); ctx.lineTo(p.x + 1, p.y - 22); ctx.stroke()
      ctx.beginPath(); ctx.arc(p.x + 1, p.y - 21, 2, 0, Math.PI * 2); ctx.fillStyle = '#8a929c'; ctx.fill()
      break
    }
    case 'plant': {
      // Pot
      ctx.beginPath()
      ctx.moveTo(p.x - 4, p.y - 6)
      ctx.lineTo(p.x + 4, p.y - 6)
      ctx.lineTo(p.x + 3, p.y)
      ctx.lineTo(p.x - 3, p.y)
      ctx.closePath()
      ctx.fillStyle = '#b06a3a'
      ctx.fill()
      // Leaves
      ctx.fillStyle = '#4a9b52'
      ctx.beginPath(); ctx.ellipse(p.x, p.y - 11, 5, 6, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#57ab5e'
      ctx.beginPath(); ctx.ellipse(p.x - 3, p.y - 13, 3, 4, -0.5, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.ellipse(p.x + 3, p.y - 13, 3, 4, 0.5, 0, Math.PI * 2); ctx.fill()
      break
    }
  }
}

// ── Ghost placement preview ───────────────────────────────────────────────────

function drawGhost(ctx: CanvasRenderingContext2D, ghost: NonNullable<RenderFX['ghost']>, fx: RenderFX) {
  const { pos, w, h, valid } = ghost
  const fill = valid ? 'rgba(72,220,140,0.28)' : 'rgba(240,80,80,0.30)'
  const line = valid ? 'rgba(72,220,140,0.9)' : 'rgba(240,80,80,0.9)'

  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const p = gridToIso({ x: pos.x + dx, y: pos.y + dy })
      tilePath(ctx, p.x, p.y, 1)
      ctx.fillStyle = fill
      ctx.fill()
    }
  }
  const tl = gridToIso(pos)
  const tr = gridToIso({ x: pos.x + w, y: pos.y })
  const bl = gridToIso({ x: pos.x, y: pos.y + h })
  const br = gridToIso({ x: pos.x + w, y: pos.y + h })
  ctx.beginPath()
  ctx.moveTo(tl.x, tl.y); ctx.lineTo(tr.x, tr.y); ctx.lineTo(br.x, br.y); ctx.lineTo(bl.x, bl.y)
  ctx.closePath()
  ctx.setLineDash([7, 5])
  ctx.lineDashOffset = -(fx.nowMs / 50) % 12
  ctx.strokeStyle = line
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.setLineDash([])

  const cx = (tl.x + br.x) / 2
  const cy = (tl.y + br.y) / 2
  ctx.font = 'bold 10px system-ui'
  ctx.textAlign = 'center'
  ctx.fillStyle = line
  ctx.shadowColor = 'rgba(0,0,0,0.8)'
  ctx.shadowBlur = 4
  ctx.fillText(valid ? '✓ Click to build' : '✗ Blocked', cx, cy + 3)
  ctx.shadowBlur = 0
}

// ── Traffic (little cars cruising the road grid) ──────────────────────────────

const CAR_COLORS = ['#c0392b', '#2980b9', '#e8e8e8', '#2c3e50', '#e67e22', '#7f8c8d', '#8e44ad', '#16a085']

function drawCar(ctx: CanvasRenderingContext2D, px: Vec2, angle: number, color: string, fx: RenderFX) {
  ctx.save()
  ctx.translate(px.x, px.y)
  // Shadow
  ctx.beginPath()
  ctx.ellipse(0, 3, 10, 3.5, angle, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0,0,0,0.22)'
  ctx.fill()
  ctx.rotate(angle)
  // Body
  ctx.beginPath()
  roundRectPath(ctx, -9, -6, 18, 8, 3)
  const g = ctx.createLinearGradient(0, -6, 0, 2)
  g.addColorStop(0, lighten(color, 0.12))
  g.addColorStop(1, darken(color, 0.12))
  ctx.fillStyle = g
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'
  ctx.lineWidth = 0.8
  ctx.stroke()
  // Cabin
  ctx.beginPath()
  roundRectPath(ctx, -4, -9, 9, 5, 2)
  ctx.fillStyle = fx.nightAmt > 0.5 ? 'rgba(90,110,140,0.95)' : 'rgba(180,215,240,0.95)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'
  ctx.stroke()
  // Headlights at night (beam forward = +x in local space)
  if (fx.nightAmt > 0.25) {
    const beam = ctx.createRadialGradient(11, -2, 1, 20, -2, 16)
    beam.addColorStop(0, `rgba(255,240,180,${0.5 * fx.nightAmt})`)
    beam.addColorStop(1, 'rgba(255,240,180,0)')
    ctx.fillStyle = beam
    ctx.beginPath()
    ctx.moveTo(9, -2)
    ctx.lineTo(26, -7)
    ctx.lineTo(26, 3)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath(); ctx.arc(9, -3.5, 1.2, 0, Math.PI * 2)
    ctx.fillStyle = '#ffe9a3'
    ctx.fill()
  }
  // Tail light
  ctx.beginPath(); ctx.arc(-8.5, -3.5, 1, 0, Math.PI * 2)
  ctx.fillStyle = '#ff6a5a'
  ctx.fill()
  ctx.restore()
}

// Iso direction angles for the two road axes
const ANGLE_X = Math.atan2(TILE_H / 2, TILE_W / 2)    // grid +x
const ANGLE_Y = Math.atan2(TILE_H / 2, -TILE_W / 2)   // grid +y

function drawTraffic(ctx: CanvasRenderingContext2D, map: WorldMap, fx: RenderFX) {
  const density = fx.nightAmt > 0.6 ? 1 : 2   // quieter roads at night
  const t = fx.nowMs / 1000

  map.hRoads.forEach((r, ri) => {
    for (let c = 0; c < density; c++) {
      const seed = hash2(ri * 31 + c * 7, 91)
      const speed = 2.2 + seed * 1.6                       // tiles per second
      const span = map.cols + 4
      // Lane 1 (row r): travels +x · Lane 2 (row r+1): travels −x
      const p1 = ((t * speed + seed * span) % span) - 2
      drawCar(ctx, gridToIso({ x: p1, y: r + 0.5 }), ANGLE_X, CAR_COLORS[(ri * 2 + c) % CAR_COLORS.length], fx)
      const p2 = span - 2 - ((t * (speed * 0.9) + seed * span * 1.7) % span)
      ctx.save()
      // Opposite direction: rotate 180°
      const px2 = gridToIso({ x: p2, y: r + 1.5 })
      ctx.translate(px2.x, px2.y)
      ctx.rotate(Math.PI)
      ctx.translate(-px2.x, -px2.y)
      drawCar(ctx, px2, ANGLE_X, CAR_COLORS[(ri * 2 + c + 3) % CAR_COLORS.length], fx)
      ctx.restore()
    }
  })

  map.vRoads.forEach((v, vi) => {
    for (let c = 0; c < density; c++) {
      const seed = hash2(vi * 53 + c * 13, 47)
      const speed = 2.0 + seed * 1.4
      const span = map.rows + 4
      const p1 = ((t * speed + seed * span) % span) - 2
      drawCar(ctx, gridToIso({ x: v + 0.5, y: p1 }), ANGLE_Y, CAR_COLORS[(vi * 2 + c + 5) % CAR_COLORS.length], fx)
    }
  })
}

// ── Birds ─────────────────────────────────────────────────────────────────────

// ── Wet roads (rain sheen + drifting reflection shimmer) ─────────────────────

function drawWetRoads(ctx: CanvasRenderingContext2D, map: WorldMap, fx: RenderFX) {
  const sheen = fx.rainAmt * 0.12
  const shimmer = 0.5 + Math.sin(fx.nowMs / 600) * 0.5
  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.cols; col++) {
      if (map.tiles[row][col] !== 'road') continue
      const p = gridToIso({ x: col, y: row })
      tilePath(ctx, p.x, p.y)
      ctx.fillStyle = `rgba(170,200,235,${(sheen * (0.7 + hash2(col, row) * 0.6 * shimmer)).toFixed(3)})`
      ctx.fill()
    }
  }
}

function drawBirds(ctx: CanvasRenderingContext2D, map: WorldMap, fx: RenderFX) {
  if (fx.nightAmt > 0.5 || fx.rainAmt > 0.3) return   // birds shelter from night & rain
  const b = worldBounds(map)
  const t = fx.nowMs / 1000
  ctx.strokeStyle = 'rgba(30,35,50,0.55)'
  ctx.lineWidth = 1.4
  ctx.lineCap = 'round'
  for (let i = 0; i < 4; i++) {
    const seed = hash2(i * 71, 29)
    const speed = 26 + seed * 18
    const bx = b.minX + ((t * speed + seed * b.width * 3) % (b.width + 80)) - 40
    const by = b.minY + 30 + seed * 120 + Math.sin(t * 1.3 + i * 2) * 12
    const flap = Math.sin(t * 9 + i * 1.7) * 3.5
    ctx.beginPath()
    ctx.moveTo(bx - 5, by - flap)
    ctx.quadraticCurveTo(bx - 1.5, by + 2, bx, by)
    ctx.quadraticCurveTo(bx + 1.5, by + 2, bx + 5, by - flap)
    ctx.stroke()
  }
}

// ── Clouds ────────────────────────────────────────────────────────────────────

function drawClouds(ctx: CanvasRenderingContext2D, map: WorldMap, fx: RenderFX) {
  const b = worldBounds(map)
  const alpha = 0.10 - fx.nightAmt * 0.05
  if (alpha <= 0.02) return
  ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`
  for (let i = 0; i < 6; i++) {
    const seed = hash2(i * 97, 13)
    const speed = 6 + seed * 8 // px per second
    const cw = 120 + seed * 160
    const x = b.minX + (((fx.nowMs / 1000) * speed + seed * b.width * 2) % (b.width + cw * 2)) - cw
    const y = b.minY + 40 + seed * (b.height * 0.5)
    ctx.beginPath()
    ctx.ellipse(x, y, cw * 0.5, 16 + seed * 10, 0, 0, Math.PI * 2)
    ctx.ellipse(x + cw * 0.22, y - 8, cw * 0.3, 12 + seed * 8, 0, 0, Math.PI * 2)
    ctx.ellipse(x - cw * 0.22, y - 5, cw * 0.26, 10 + seed * 8, 0, 0, Math.PI * 2)
    ctx.fill()
  }
}

// ── Humanoid agent drawing ────────────────────────────────────────────────────

const SKIN_TONES  = ['#f5d5b8', '#eab88a', '#c98d5f', '#a06a42', '#7a4f30']
const HAIR_COLORS = ['#2a2018', '#4a3220', '#7a5230', '#b8863e', '#d9b380', '#8a8f9a', '#5a2e1a', '#3a3f4a']
const PANTS       = ['#3a4656', '#4a3b2e', '#2e3b4a', '#55585e', '#6a4a3a']

const MOOD_ORB: Record<string, string> = {
  excited:  '#3ef08a',
  happy:    '#7ee06a',
  neutral:  '#d8d24a',
  tired:    '#f0a24a',
  stressed: '#f05a5a',
}

interface Look {
  skin: string
  hair: string
  hairStyle: number   // 0 cap · 1 side-swept · 2 bun · 3 spiky
  pants: string
}

function agentLook(id: string): Look {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) }
  h = h >>> 0
  return {
    skin:  SKIN_TONES[h % SKIN_TONES.length],
    hair:  HAIR_COLORS[(h >> 3) % HAIR_COLORS.length],
    hairStyle: (h >> 7) % 4,
    pants: PANTS[(h >> 11) % PANTS.length],
  }
}

type Pose = 'stand' | 'sit' | 'lie' | 'eat'

function agentPose(agent: Agent): Pose {
  const tn = agent.taskName ?? ''
  const settled = agent.path.length === 0
  if (agent.state === 'sleeping') return 'lie'
  if (settled && tn.includes('Napping')) return 'lie'
  if (settled && (tn.includes('Eating') || tn.includes('bite') || tn.includes('snack'))) return 'eat'
  if (settled && (tn.includes('Relax') || tn.includes('Watch') || tn.includes('couch'))) return 'sit'
  if (settled && agent.state === 'working') return 'sit'
  return 'stand'
}

function drawAgent(ctx: CanvasRenderingContext2D, agent: Agent, selected: boolean, fx: RenderFX) {
  const { x, y } = agent.pixelPos
  const isMoving   = agent.path.length > 0
  const isSleeping = agent.state === 'sleeping'
  const pose = isMoving ? 'stand' : agentPose(agent)
  const look = agentLook(agent.id)

  const phase = agentPhase(agent.id)
  const now   = fx.nowMs

  const walkT   = now / 260 + phase
  const walkAmt = isMoving ? Math.abs(Math.sin(walkT)) : 0
  const walkY   = walkAmt * -3.5
  const breathAmt = isSleeping ? 0 : Math.sin(now / 1800 + phase) * 0.6
  const bounceY = walkY + (isMoving ? 0 : breathAmt)
  const swayAngle = isMoving ? Math.sin(walkT * 2 + phase) * 0.035 : 0
  const swing = isMoving ? Math.sin(walkT + phase) : 0   // −1…1 limb swing

  // Shadow
  ctx.beginPath()
  ctx.ellipse(x, y + 4, 9 + walkAmt, Math.max(1.5, 4.5 - walkAmt), 0, 0, Math.PI * 2)
  ctx.fillStyle = `rgba(0,0,0,${(0.30 - walkAmt * 0.08).toFixed(2)})`
  ctx.fill()

  // Selection ring
  if (selected) {
    ctx.beginPath()
    ctx.arc(x, y - 14, 17, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(x, y - 14, 17, 0, Math.PI * 2)
    ctx.strokeStyle = agent.color
    ctx.lineWidth = 4
    ctx.globalAlpha = 0.25
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  // ── Body (origin: 14px above feet; feet at local y = 18)
  ctx.save()
  ctx.translate(x, y - 16 + bounceY)
  ctx.rotate(swayAngle)
  ctx.scale(1.22, 1.22)

  if (pose === 'lie') {
    // ── Lying flat (in bed / napping): horizontal body + blanket ─────────────
    const breathe = Math.sin(now / 1600 + phase) * 0.5
    // Body
    ctx.beginPath()
    roundRectPath(ctx, -10, 8 - breathe, 22, 9 + breathe, 4)
    ctx.fillStyle = agent.color
    ctx.fill()
    ctx.strokeStyle = darken(agent.color, 0.2)
    ctx.lineWidth = 1
    ctx.stroke()
    // Blanket over the lower body
    ctx.beginPath()
    roundRectPath(ctx, -2, 7.5 - breathe, 15, 10 + breathe, 3)
    ctx.fillStyle = 'rgba(122,168,216,0.92)'
    ctx.fill()
    // Head resting at the pillow end
    ctx.beginPath()
    ctx.arc(-13, 9, 5.6, 0, Math.PI * 2)
    ctx.fillStyle = look.skin
    ctx.fill()
    ctx.strokeStyle = darken(look.skin, 0.18)
    ctx.lineWidth = 0.8
    ctx.stroke()
    // Hair cap
    ctx.fillStyle = look.hair
    ctx.beginPath()
    ctx.arc(-13, 8, 5.6, Math.PI * 0.9, Math.PI * 2.05)
    ctx.closePath()
    ctx.fill()
    // Closed eyes
    ctx.strokeStyle = '#1a1a2e'
    ctx.lineWidth = 1.2
    ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(-15.5, 10); ctx.lineTo(-13.5, 10); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(-12, 10); ctx.lineTo(-10, 10); ctx.stroke()
    ctx.restore()

    // Zzz drifting up
    const zPhase = (now / 900 + phase) % 3
    ctx.font = `${9 + zPhase * 2}px system-ui`
    ctx.textAlign = 'center'
    ctx.fillStyle = `rgba(200,215,255,${(0.8 - zPhase * 0.25).toFixed(2)})`
    ctx.fillText('z', x + 10 + zPhase * 3, y - 16 - zPhase * 6)

    // Name label (lower for lying pose)
    ctx.font = '10px system-ui'
    ctx.fillStyle = '#fff'
    ctx.shadowColor = 'rgba(0,0,0,0.9)'
    ctx.shadowBlur = 4
    ctx.fillText(agent.name, x, y - 26)
    ctx.shadowBlur = 0
    if (agent.speech) drawSpeechBubble(ctx, x, y - 38, agent.speech)
    return
  }

  if (pose === 'sit') {
    // ── Sitting (couch / desk): lowered body, bent legs, typing bob at work ──
    const typing = agent.state === 'working' ? Math.sin(now / 160 + phase) * 1.2 : 0
    // Bent legs forward
    ctx.fillStyle = look.pants
    ctx.beginPath(); roundRectPath(ctx, -5.5, 12, 4.5, 5.5, 2); ctx.fill()
    ctx.beginPath(); roundRectPath(ctx, 1, 12, 4.5, 5.5, 2); ctx.fill()
    // Feet
    ctx.fillStyle = '#22262c'
    ctx.beginPath(); ctx.ellipse(-3.2, 17.8, 2.4, 1.4, 0, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.ellipse(3.2, 17.8, 2.4, 1.4, 0, 0, Math.PI * 2); ctx.fill()
    // Torso (lowered)
    ctx.beginPath()
    roundRectPath(ctx, -6, 0, 12, 13, 4)
    const tg = ctx.createLinearGradient(-6, 0, 6, 0)
    tg.addColorStop(0, agent.color)
    tg.addColorStop(1, darken(agent.color, 0.14))
    ctx.fillStyle = tg
    ctx.fill()
    ctx.strokeStyle = darken(agent.color, 0.25)
    ctx.lineWidth = 0.9
    ctx.stroke()
    // Arms reaching forward (typing bob while working)
    ctx.fillStyle = agent.color
    ctx.beginPath(); roundRectPath(ctx, -7.6, 3 + typing, 3, 7, 1.5); ctx.fill()
    ctx.beginPath(); roundRectPath(ctx, 4.6, 3 - typing, 3, 7, 1.5); ctx.fill()
    ctx.fillStyle = look.skin
    ctx.beginPath(); ctx.arc(-6.1, 10.5 + typing, 1.5, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(6.1, 10.5 - typing, 1.5, 0, Math.PI * 2); ctx.fill()
  } else {
    // Legs (swing while walking)
    const legL = swing * 3.2
    ctx.fillStyle = look.pants
    ctx.beginPath(); roundRectPath(ctx, -4.4 + legL * 0.4, 9, 3.4, 9 - Math.abs(legL) * 0.4, 1.5); ctx.fill()
    ctx.beginPath(); roundRectPath(ctx, 1.0 - legL * 0.4, 9, 3.4, 9 - Math.abs(legL) * 0.4, 1.5); ctx.fill()
    // Shoes
    ctx.fillStyle = '#22262c'
    ctx.beginPath(); ctx.ellipse(-2.7 + legL * 0.5, 17.6, 2.6, 1.5, 0, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.ellipse(2.7 - legL * 0.5, 17.6, 2.6, 1.5, 0, 0, Math.PI * 2); ctx.fill()

    // Arms (opposite swing, behind torso)
    ctx.fillStyle = agent.color
    ctx.beginPath(); roundRectPath(ctx, -8.2, -2 - swing * 1.6, 3, 9.5, 1.5); ctx.fill()
    ctx.beginPath(); roundRectPath(ctx, 5.2, -2 + swing * 1.6, 3, 9.5, 1.5); ctx.fill()
    // Hands
    ctx.fillStyle = look.skin
    ctx.beginPath(); ctx.arc(-6.7, 8.2 - swing * 1.6, 1.6, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(6.7, 8.2 + swing * 1.6, 1.6, 0, Math.PI * 2); ctx.fill()

    // Torso (shirt = agent colour)
    ctx.beginPath()
    roundRectPath(ctx, -6, -4, 12, 14, 4)
    const tg = ctx.createLinearGradient(-6, 0, 6, 0)
    tg.addColorStop(0, agent.color)
    tg.addColorStop(1, darken(agent.color, 0.14))
    ctx.fillStyle = tg
    ctx.fill()
    ctx.strokeStyle = darken(agent.color, 0.25)
    ctx.lineWidth = 0.9
    ctx.stroke()
    // Collar
    ctx.beginPath()
    ctx.moveTo(-2.5, -4); ctx.lineTo(0, -1.5); ctx.lineTo(2.5, -4)
    ctx.strokeStyle = darken(agent.color, 0.3)
    ctx.stroke()

    // ── Eating: raised hand holding a snack, chewing bob ────────────────────
    if (pose === 'eat') {
      const chew = Math.sin(now / 240 + phase) * 1.4
      // Raised forearm
      ctx.fillStyle = agent.color
      ctx.beginPath(); roundRectPath(ctx, 5.2, -8 + chew, 3, 8, 1.5); ctx.fill()
      // Hand
      ctx.fillStyle = look.skin
      ctx.beginPath(); ctx.arc(6.7, -8.5 + chew, 1.7, 0, Math.PI * 2); ctx.fill()
      // Snack (slice)
      ctx.beginPath()
      ctx.moveTo(6.7, -13.5 + chew)
      ctx.lineTo(9.6, -9.2 + chew)
      ctx.lineTo(4.4, -9.2 + chew)
      ctx.closePath()
      ctx.fillStyle = '#e8b04a'
      ctx.fill()
      ctx.strokeStyle = '#b8823a'
      ctx.lineWidth = 0.7
      ctx.stroke()
      // Toppings
      ctx.fillStyle = '#c0392b'
      ctx.beginPath(); ctx.arc(6.2, -10.6 + chew, 0.7, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(7.6, -11.4 + chew, 0.7, 0, Math.PI * 2); ctx.fill()
    }

    // ── Showering: falling droplets overhead ─────────────────────────────────
    if ((agent.taskName ?? '').includes('Shower')) {
      ctx.strokeStyle = 'rgba(140,200,255,0.8)'
      ctx.lineWidth = 1.2
      ctx.lineCap = 'round'
      for (let i = 0; i < 4; i++) {
        const dp = ((now / 350) + i * 0.7 + phase) % 2
        const dy = -22 + dp * 14
        const dx = -4 + i * 2.8
        ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(dx, dy + 3); ctx.stroke()
      }
    }
  }

  // Head
  const headBobY = isMoving ? Math.sin(walkT * 2 + phase + 0.4) * 0.7 : 0
  const headY = (pose === 'sit' ? -5 : -10.5) + headBobY
  ctx.beginPath()
  ctx.arc(0, headY, 6.2, 0, Math.PI * 2)
  ctx.fillStyle = look.skin
  ctx.fill()
  ctx.strokeStyle = darken(look.skin, 0.18)
  ctx.lineWidth = 0.8
  ctx.stroke()

  // Hair
  ctx.fillStyle = look.hair
  switch (look.hairStyle) {
    case 0: // cap of hair
      ctx.beginPath()
      ctx.arc(0, headY - 0.8, 6.2, Math.PI * 1.05, Math.PI * 1.95)
      ctx.closePath()
      ctx.fill()
      break
    case 1: // side-swept
      ctx.beginPath()
      ctx.arc(0, headY - 0.6, 6.3, Math.PI * 0.95, Math.PI * 2.05)
      ctx.closePath()
      ctx.fill()
      ctx.beginPath()
      ctx.ellipse(-4.2, headY - 1.5, 2.4, 3.6, 0.4, 0, Math.PI * 2)
      ctx.fill()
      break
    case 2: // bun
      ctx.beginPath()
      ctx.arc(0, headY - 1, 6.2, Math.PI, Math.PI * 2)
      ctx.closePath()
      ctx.fill()
      ctx.beginPath()
      ctx.arc(0, headY - 7.2, 2.6, 0, Math.PI * 2)
      ctx.fill()
      break
    case 3: // spiky
      ctx.beginPath()
      ctx.arc(0, headY - 0.8, 6.2, Math.PI, Math.PI * 2)
      ctx.closePath()
      ctx.fill()
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath()
        ctx.moveTo(i * 3 - 1.4, headY - 5.4)
        ctx.lineTo(i * 3, headY - 9.2)
        ctx.lineTo(i * 3 + 1.4, headY - 5.4)
        ctx.closePath()
        ctx.fill()
      }
      break
  }

  // Face (mood eyes)
  drawEyes(ctx, isSleeping ? 'sleeping' : agent.mood, headY - 0.5)

  ctx.restore()

  // ── Mood orb (hovers above head)
  const orbY = y - 35 + bounceY + Math.sin(now / 700 + phase) * 1.2
  const orbColor = MOOD_ORB[isSleeping ? 'neutral' : agent.mood] ?? '#d8d24a'
  ctx.beginPath()
  ctx.arc(x, orbY, 3, 0, Math.PI * 2)
  ctx.fillStyle = orbColor
  ctx.shadowColor = orbColor
  ctx.shadowBlur = 6
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.beginPath()
  ctx.arc(x - 0.9, orbY - 0.9, 1, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.fill()

  // Emoji badge (HQ analysts)
  if (agent.emoji) {
    ctx.font = '12px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText(agent.emoji, x + 9, orbY - 6)
  }

  // Active wish badge (a little star of ambition)
  if (agent.wish) {
    const tw = 0.6 + Math.sin(now / 400 + phase) * 0.4
    ctx.globalAlpha = 0.55 + tw * 0.45
    ctx.font = '10px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('✨', x - 10, orbY - 5)
    ctx.globalAlpha = 1
  }

  // Name label
  ctx.font = '10px system-ui'
  ctx.textAlign = 'center'
  ctx.fillStyle = '#fff'
  ctx.shadowColor = 'rgba(0,0,0,0.9)'
  ctx.shadowBlur = 4
  ctx.fillText(agent.name, x, y - 46 + bounceY)
  ctx.shadowBlur = 0

  // Speech bubble
  if (agent.speech) {
    drawSpeechBubble(ctx, x, y - 58 + bounceY, agent.speech)
  } else {
    // Thought bubble: lowest urgent need floats overhead (Sims-style readability)
    drawNeedThought(ctx, agent, x, y - 54 + bounceY, fx)
  }

  // Task progress
  if (agent.state === 'working' && agent.taskProgress > 0) {
    drawProgressBar(ctx, x, y + 2, agent.taskProgress, agent.color)
  }
}

// ── Need thought bubble ───────────────────────────────────────────────────────

function drawNeedThought(ctx: CanvasRenderingContext2D, agent: Agent, x: number, y: number, fx: RenderFX) {
  if (agent.state === 'sleeping') return
  const n = agent.lifeNeeds
  if (!n) return

  // Find the most urgent low need (energy counts too)
  const candidates: Array<[string, number]> = [
    ['🍕', n.hunger],
    ['🎉', n.fun],
    ['💬', n.social],
    ['🚿', n.hygiene],
    ['😴', agent.energy],
  ]
  candidates.sort((a, b) => a[1] - b[1])
  const [icon, value] = candidates[0]
  if (value >= 30) return

  const urgency = 1 - value / 30            // 0..1
  const pulse = 0.75 + Math.sin(fx.nowMs / 300) * 0.25
  const alpha = (0.5 + urgency * 0.5) * pulse

  ctx.globalAlpha = alpha
  // Cloud
  ctx.beginPath()
  ctx.arc(x + 1, y - 4, 8.5, 0, Math.PI * 2)
  ctx.arc(x - 6, y - 1, 5.5, 0, Math.PI * 2)
  ctx.arc(x + 8, y - 1, 5.5, 0, Math.PI * 2)
  ctx.fillStyle = value < 15 ? 'rgba(255,225,225,0.95)' : 'rgba(255,255,255,0.92)'
  ctx.fill()
  ctx.strokeStyle = value < 15 ? 'rgba(220,80,80,0.6)' : 'rgba(0,0,0,0.15)'
  ctx.lineWidth = 1
  ctx.stroke()
  // Trail dots down toward the head
  ctx.beginPath(); ctx.arc(x - 5, y + 7, 2, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill()
  ctx.beginPath(); ctx.arc(x - 7.5, y + 11, 1.2, 0, Math.PI * 2); ctx.fill()
  // Icon
  ctx.font = '10px system-ui'
  ctx.textAlign = 'center'
  ctx.fillText(icon, x + 1, y - 0.5)
  ctx.globalAlpha = 1
}

function drawEyes(ctx: CanvasRenderingContext2D, mood: string, eyeY = -12) {
  const leftX = -2.6
  const rightX = 2.6

  ctx.fillStyle = '#1a1a2e'

  if (mood === 'sleeping') {
    ctx.strokeStyle = '#1a1a2e'
    ctx.lineWidth = 1.5
    ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(leftX - 2, eyeY); ctx.lineTo(leftX + 2, eyeY); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(rightX - 2, eyeY); ctx.lineTo(rightX + 2, eyeY); ctx.stroke()
    return
  }

  if (mood === 'stressed') {
    ctx.beginPath(); ctx.ellipse(leftX,  eyeY, 2, 2.5, -0.35, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.ellipse(rightX, eyeY, 2, 2.5,  0.35, 0, Math.PI * 2); ctx.fill()
  } else if (mood === 'excited' || mood === 'happy') {
    ctx.beginPath(); ctx.arc(leftX,  eyeY - 1, 2.5, 0, Math.PI); ctx.fill()
    ctx.beginPath(); ctx.arc(rightX, eyeY - 1, 2.5, 0, Math.PI); ctx.fill()
  } else if (mood === 'tired') {
    ctx.beginPath(); ctx.ellipse(leftX,  eyeY, 2.5, 1.4, 0, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.ellipse(rightX, eyeY, 2.5, 1.4, 0, 0, Math.PI * 2); ctx.fill()
  } else {
    ctx.beginPath(); ctx.arc(leftX,  eyeY, 2, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(rightX, eyeY, 2, 0, Math.PI * 2); ctx.fill()
  }

  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.beginPath(); ctx.arc(leftX  + 0.8, eyeY - 0.8, 0.9, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(rightX + 0.8, eyeY - 0.8, 0.9, 0, Math.PI * 2); ctx.fill()
}

function drawSpeechBubble(ctx: CanvasRenderingContext2D, x: number, y: number, text: string) {
  ctx.font = '9px system-ui'
  const tw = ctx.measureText(text).width
  const pad = 6
  const bw = tw + pad * 2
  const bh = 18
  const bx = x - bw / 2
  const by = y - bh

  ctx.beginPath()
  roundRectPath(ctx, bx, by, bw, bh, 6)
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.2)'
  ctx.lineWidth = 0.8
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(x - 4, y)
  ctx.lineTo(x, y + 6)
  ctx.lineTo(x + 4, y)
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  ctx.fill()

  ctx.fillStyle = '#222'
  ctx.textAlign = 'center'
  ctx.fillText(text, x, by + 12)
}

function drawProgressBar(ctx: CanvasRenderingContext2D, x: number, y: number, progress: number, color: string) {
  const bw = 28
  const bh = 4
  const bx = x - bw / 2
  const by = y + 8

  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.fillRect(bx, by, bw, bh)
  ctx.fillStyle = color
  ctx.fillRect(bx, by, bw * progress, bh)
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}
