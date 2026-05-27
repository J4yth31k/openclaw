import type { Agent, Vec2 } from '../types'
import { gridToPixel } from '../data/worldData'

const MOVE_SPEED = 2.5  // grid tiles per sim-second

// Simple 4-directional pathfinding: go horizontal first, then vertical
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

export function moveAgent(agent: Agent, dtSec: number): Partial<Agent> {
  if (agent.path.length === 0) return {}

  const target = agent.path[0]
  const targetPx = gridToPixel(target)

  const dx = targetPx.x - agent.pixelPos.x
  const dy = targetPx.y - agent.pixelPos.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  const step = MOVE_SPEED * dtSec * 60  // tiles/sec → px/frame-ish

  if (dist <= step) {
    const newPath = agent.path.slice(1)
    return {
      pixelPos: targetPx,
      gridPos: { ...target },
      path: newPath,
    }
  }

  const ratio = step / dist
  return {
    pixelPos: {
      x: agent.pixelPos.x + dx * ratio,
      y: agent.pixelPos.y + dy * ratio,
    },
  }
}
