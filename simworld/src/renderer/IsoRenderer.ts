import type { SimState, Agent, Building, TileType } from '../types'
import { TILE_W, TILE_H, gridToIso } from '../data/worldData'
import type { Vec2 } from '../types'

// ── Tile colors ───────────────────────────────────────────────────────────────

const TILE_COLORS: Record<TileType, { top: string; side: string }> = {
  grass:          { top: '#7ec87e', side: '#5a9e5a' },
  road:           { top: '#6b6b7b', side: '#4a4a58' },
  path:           { top: '#c4a87a', side: '#9e8050' },
  building_floor: { top: '#d4c4b0', side: '#b0a090' },
  sidewalk:       { top: '#b0b8c0', side: '#8a9098' },
}

// ── Main render entry ─────────────────────────────────────────────────────────

export function render(ctx: CanvasRenderingContext2D, state: SimState, camX: number, camY: number) {
  ctx.save()
  ctx.translate(camX, camY)

  const { worldMap, agents, selectedAgentId } = state

  // Draw tiles back-to-front (painter's algorithm)
  for (let row = 0; row < worldMap.rows; row++) {
    for (let col = 0; col < worldMap.cols; col++) {
      const tileType = worldMap.tiles[row][col]
      drawTile(ctx, { x: col, y: row }, tileType)
    }
  }

  // Draw buildings
  for (const b of worldMap.buildings) {
    drawBuilding(ctx, b)
  }

  // Draw agents (sorted by y for depth)
  const sorted = [...agents].sort((a, b) => a.pixelPos.y - b.pixelPos.y)
  for (const agent of sorted) {
    drawAgent(ctx, agent, agent.id === selectedAgentId)
  }

  ctx.restore()
}

// ── Tile drawing ──────────────────────────────────────────────────────────────

function drawTile(ctx: CanvasRenderingContext2D, grid: Vec2, type: TileType) {
  const { x: sx, y: sy } = gridToIso(grid)
  const hw = TILE_W / 2
  const hh = TILE_H / 2
  const sideH = 10
  const colors = TILE_COLORS[type]

  // Top face (diamond)
  ctx.beginPath()
  ctx.moveTo(sx, sy - hh)
  ctx.lineTo(sx + hw, sy)
  ctx.lineTo(sx, sy + hh)
  ctx.lineTo(sx - hw, sy)
  ctx.closePath()
  ctx.fillStyle = colors.top
  ctx.fill()

  // Side face (only on road/sidewalk for slight 3D feel)
  if (type === 'road' || type === 'sidewalk') {
    ctx.beginPath()
    ctx.moveTo(sx - hw, sy)
    ctx.lineTo(sx, sy + hh)
    ctx.lineTo(sx, sy + hh + sideH)
    ctx.lineTo(sx - hw, sy + sideH)
    ctx.closePath()
    ctx.fillStyle = colors.side
    ctx.fill()
  }

  // Grid lines (subtle)
  ctx.beginPath()
  ctx.moveTo(sx, sy - hh)
  ctx.lineTo(sx + hw, sy)
  ctx.lineTo(sx, sy + hh)
  ctx.lineTo(sx - hw, sy)
  ctx.closePath()
  ctx.strokeStyle = 'rgba(0,0,0,0.07)'
  ctx.lineWidth = 0.5
  ctx.stroke()
}

// ── Building drawing ──────────────────────────────────────────────────────────

function drawBuilding(ctx: CanvasRenderingContext2D, b: Building) {
  const WALL_H = 60
  const ROOF_H = 20

  // Compute the four iso corners of the building footprint
  const tl = gridToIso(b.gridPos)
  const tr = gridToIso({ x: b.gridPos.x + b.tileW, y: b.gridPos.y })
  const bl = gridToIso({ x: b.gridPos.x, y: b.gridPos.y + b.tileH })
  const br = gridToIso({ x: b.gridPos.x + b.tileW, y: b.gridPos.y + b.tileH })

  // Left wall
  ctx.beginPath()
  ctx.moveTo(tl.x, tl.y)
  ctx.lineTo(bl.x, bl.y)
  ctx.lineTo(bl.x, bl.y + WALL_H)
  ctx.lineTo(tl.x, tl.y + WALL_H)
  ctx.closePath()
  ctx.fillStyle = darken(b.color, 0.35)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.15)'
  ctx.lineWidth = 1
  ctx.stroke()

  // Right wall
  ctx.beginPath()
  ctx.moveTo(tr.x, tr.y)
  ctx.lineTo(br.x, br.y)
  ctx.lineTo(br.x, br.y + WALL_H)
  ctx.lineTo(tr.x, tr.y + WALL_H)
  ctx.closePath()
  ctx.fillStyle = darken(b.color, 0.2)
  ctx.fill()
  ctx.stroke()

  // Roof (top face of box)
  ctx.beginPath()
  ctx.moveTo(tl.x, tl.y)
  ctx.lineTo(tr.x, tr.y)
  ctx.lineTo(br.x, br.y)
  ctx.lineTo(bl.x, bl.y)
  ctx.closePath()
  ctx.fillStyle = b.roofColor
  ctx.fill()
  ctx.stroke()

  // Windows
  drawWindows(ctx, tl, bl, tr, br, b.accentColor, WALL_H)

  // Building label
  const cx = (tl.x + tr.x + bl.x + br.x) / 4
  const cy = (tl.y + tr.y + bl.y + br.y) / 4 - WALL_H / 2
  ctx.font = 'bold 11px system-ui'
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.shadowColor = 'rgba(0,0,0,0.6)'
  ctx.shadowBlur = 4
  ctx.fillText(b.name, cx, cy)
  ctx.shadowBlur = 0
}

function drawWindows(
  ctx: CanvasRenderingContext2D,
  tl: Vec2, bl: Vec2, tr: Vec2, br: Vec2,
  accentColor: string,
  wallH: number
) {
  const windowColor = 'rgba(200,230,255,0.85)'
  // Left wall windows
  for (let i = 0; i < 2; i++) {
    const tx = tl.x + (bl.x - tl.x) * (0.3 + i * 0.35)
    const ty = tl.y + (bl.y - tl.y) * (0.3 + i * 0.35) + wallH * 0.3
    drawSmallDiamond(ctx, { x: tx, y: ty }, 8, windowColor)
  }
  // Right wall windows
  for (let i = 0; i < 2; i++) {
    const tx = tr.x + (br.x - tr.x) * (0.3 + i * 0.35)
    const ty = tr.y + (br.y - tr.y) * (0.3 + i * 0.35) + wallH * 0.3
    drawSmallDiamond(ctx, { x: tx, y: ty }, 8, windowColor)
  }
}

function drawSmallDiamond(ctx: CanvasRenderingContext2D, pos: Vec2, size: number, color: string) {
  ctx.beginPath()
  ctx.moveTo(pos.x, pos.y - size / 2)
  ctx.lineTo(pos.x + size / 2, pos.y)
  ctx.lineTo(pos.x, pos.y + size / 2)
  ctx.lineTo(pos.x - size / 2, pos.y)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}

// ── Agent animation helpers ───────────────────────────────────────────────────

/** Stable per-agent phase: unique float [0, 2π] derived from id string */
function agentPhase(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff
  return (h / 0xffff) * Math.PI * 2
}

// ── Agent drawing ─────────────────────────────────────────────────────────────

function drawAgent(ctx: CanvasRenderingContext2D, agent: Agent, selected: boolean) {
  const { x, y } = agent.pixelPos
  const isMoving   = agent.path.length > 0
  const isSleeping = agent.state === 'sleeping'

  const phase = agentPhase(agent.id)
  const now   = Date.now()

  // ── Walk cycle: heel-strike pattern (abs-sine = two bounces per full period)
  const walkT   = now / 280 + phase      // ~4.5 step-pairs per second
  const walkAmt = isMoving ? Math.abs(Math.sin(walkT)) : 0
  const walkY   = walkAmt * -5           // lift up to 5px (negative = up)

  // ── Idle breathing (slow, very small, unique per agent)
  const breathAmt = isSleeping ? 0 : Math.sin(now / 1800 + phase) * 0.7
  const idleY  = isMoving ? 0 : breathAmt

  // ── Combined vertical offset
  const bounceY = walkY + idleY

  // ── Left-right body sway during walk
  const swayAngle = isMoving ? Math.sin(walkT * 2 + phase) * 0.04 : 0  // ±2.3°

  // ── Leg swing offsets
  const legSwing = isMoving ? Math.sin(walkT + phase) * 4 : 0  // ±4px forward/back

  // ── Shadow: squashes on ground-strike, lifts when airborne
  const shadowRx = 10 + walkAmt * 1.5
  const shadowRy = 5  - walkAmt * 1.2
  const shadowAlpha = 0.30 - walkAmt * 0.08
  ctx.beginPath()
  ctx.ellipse(x, y + 4, shadowRx, Math.max(1.5, shadowRy), 0, 0, Math.PI * 2)
  ctx.fillStyle = `rgba(0,0,0,${shadowAlpha.toFixed(2)})`
  ctx.fill()

  // ── Selection ring
  if (selected) {
    ctx.beginPath()
    ctx.arc(x, y - 14, 17, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 2
    ctx.stroke()
    // Inner glow
    ctx.beginPath()
    ctx.arc(x, y - 14, 17, 0, Math.PI * 2)
    ctx.strokeStyle = agent.color
    ctx.lineWidth = 4
    ctx.globalAlpha = 0.25
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  // ── Draw body in local space (with sway rotation)
  ctx.save()
  ctx.translate(x, y - 14 + bounceY)
  ctx.rotate(swayAngle)

  // Legs (drawn first, behind body)
  if (!isSleeping) {
    ctx.beginPath()
    ctx.ellipse(-3.5 + legSwing * 0.4, 17, 3, 2.2, 0, 0, Math.PI * 2)
    ctx.fillStyle = darken(agent.color, 0.25)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(3.5 - legSwing * 0.4, 17, 3, 2.2, 0, 0, Math.PI * 2)
    ctx.fillStyle = darken(agent.color, 0.25)
    ctx.fill()
  }

  // Body blob — slight squash/stretch: tall when airborne, wide on landing
  const bodyRx = 9  - walkAmt * 0.8
  const bodyRy = 13 + walkAmt * 1.5
  ctx.beginPath()
  ctx.ellipse(0, 4, bodyRx, bodyRy, 0, 0, Math.PI * 2)
  ctx.fillStyle = agent.color
  ctx.fill()
  ctx.strokeStyle = darken(agent.color, 0.2)
  ctx.lineWidth = 1
  ctx.stroke()

  // Head — subtle counter-bounce (lags behind body slightly)
  const headBobY = isMoving ? Math.sin(walkT * 2 + phase + 0.4) * 0.8 : 0
  ctx.beginPath()
  ctx.arc(0, -10 + headBobY, 9, 0, Math.PI * 2)
  ctx.fillStyle = agent.accentColor
  ctx.fill()
  ctx.strokeStyle = darken(agent.accentColor, 0.2)
  ctx.lineWidth = 1
  ctx.stroke()

  // Eyes (with sleeping state)
  drawEyes(ctx, isSleeping ? 'sleeping' : agent.mood, headBobY)

  ctx.restore()

  // ── Emoji badge (Avengers)
  if (agent.emoji) {
    ctx.font = '13px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText(agent.emoji, x, y - 26 + bounceY)
  }

  // ── Name label
  ctx.font = '10px system-ui'
  ctx.textAlign = 'center'
  ctx.fillStyle = '#fff'
  ctx.shadowColor = 'rgba(0,0,0,0.9)'
  ctx.shadowBlur = 4
  ctx.fillText(agent.name, x, y - (agent.emoji ? 38 : 32) + bounceY)
  ctx.shadowBlur = 0

  // ── Speech bubble
  if (agent.speech) {
    drawSpeechBubble(ctx, x, y - (agent.emoji ? 50 : 44) + bounceY, agent.speech)
  }

  // ── Task progress bar
  if (agent.state === 'working' && agent.taskProgress > 0) {
    drawProgressBar(ctx, x, y + 2, agent.taskProgress, agent.color)
  }
}

function drawEyes(ctx: CanvasRenderingContext2D, mood: string, headBobY = 0) {
  const eyeY  = -12 + headBobY
  const leftX = -3.5
  const rightX = 3.5

  ctx.fillStyle = '#1a1a2e'

  if (mood === 'sleeping') {
    // Closed — horizontal squint lines
    ctx.strokeStyle = '#1a1a2e'
    ctx.lineWidth = 1.5
    ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(leftX - 2, eyeY); ctx.lineTo(leftX + 2, eyeY); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(rightX - 2, eyeY); ctx.lineTo(rightX + 2, eyeY); ctx.stroke()
    return
  }

  if (mood === 'stressed') {
    // Worried — angled inward
    ctx.beginPath(); ctx.ellipse(leftX,  eyeY, 2, 2.5, -0.35, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.ellipse(rightX, eyeY, 2, 2.5,  0.35, 0, Math.PI * 2); ctx.fill()
  } else if (mood === 'excited' || mood === 'happy') {
    // Happy — upward arc (^_^)
    ctx.beginPath(); ctx.arc(leftX,  eyeY - 1, 2.5, 0, Math.PI); ctx.fill()
    ctx.beginPath(); ctx.arc(rightX, eyeY - 1, 2.5, 0, Math.PI); ctx.fill()
  } else if (mood === 'tired') {
    // Droopy — wide flat ovals
    ctx.beginPath(); ctx.ellipse(leftX,  eyeY, 2.5, 1.4, 0, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.ellipse(rightX, eyeY, 2.5, 1.4, 0, 0, Math.PI * 2); ctx.fill()
  } else {
    // Neutral dots
    ctx.beginPath(); ctx.arc(leftX,  eyeY, 2, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(rightX, eyeY, 2, 0, Math.PI * 2); ctx.fill()
  }

  // Eye shine
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

  // Bubble background
  ctx.beginPath()
  roundRect(ctx, bx, by, bw, bh, 6)
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.2)'
  ctx.lineWidth = 0.8
  ctx.stroke()

  // Tail
  ctx.beginPath()
  ctx.moveTo(x - 4, y)
  ctx.lineTo(x, y + 6)
  ctx.lineTo(x + 4, y)
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  ctx.fill()

  // Text
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

function darken(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.max(0, (num >> 16) - Math.round(255 * amount))
  const g = Math.max(0, ((num >> 8) & 0xff) - Math.round(255 * amount))
  const b = Math.max(0, (num & 0xff) - Math.round(255 * amount))
  return `rgb(${r},${g},${b})`
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
}
