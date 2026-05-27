import type { Agent, Vec2 } from '../types'
import { gridToPixel, TILE_W, TILE_H } from '../data/worldData'

// ── Constants ─────────────────────────────────────────────────────────────────

// Pixel distance between adjacent iso tiles (diagonal hop)
const ISO_TILE_PX = Math.sqrt((TILE_W / 2) ** 2 + (TILE_H / 2) ** 2)  // ≈ 26.8

// Pixels moved per sim-second.
// At 1× (800ms/sim-min), dtSec ≈ 1.2 per 16ms frame → step ≈ 19.2px < 26.8px tile width
// → smooth sub-tile interpolation at all normal speeds.
const MOVE_SPEED = 16  // px / sim-second

// ── Path builder ──────────────────────────────────────────────────────────────
// Simple rectilinear path: move horizontally first, then vertically.

export function buildPath(from: Vec2, to: Vec2): Vec2[] {
  const path: Vec2[] = []
  let cx = from.x
  let cy = from.y

  while (cx !== to.x) {
    cx += cx < to.x ? 1 : -1
    path.push({ x: cx, y: cy })
  }
  while (cy !== to.y) {
    cy += cy < to.y ? 1 : -1
    path.push({ x: cx, y: cy })
  }
  return path
}

// ── Per-frame movement ────────────────────────────────────────────────────────

export function moveAgent(agent: Agent, dtSec: number): Partial<Agent> {
  if (agent.path.length === 0) return {}

  const target   = agent.path[0]
  const targetPx = gridToPixel(target)

  const dx   = targetPx.x - agent.pixelPos.x
  const dy   = targetPx.y - agent.pixelPos.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  const step = MOVE_SPEED * dtSec   // px this frame — dimensionally correct

  if (dist <= step) {
    // Reached this waypoint — snap and advance
    return {
      pixelPos: { ...targetPx },
      gridPos:  { ...target },
      path:     agent.path.slice(1),
    }
  }

  // Smooth sub-tile interpolation
  const ratio = step / dist
  return {
    pixelPos: {
      x: agent.pixelPos.x + dx * ratio,
      y: agent.pixelPos.y + dy * ratio,
    },
  }
}

// Export for use in animation
export { ISO_TILE_PX }
