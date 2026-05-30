import { useEffect, useRef, useCallback } from 'react'
import { useSimStore } from '../store'
import { render } from '../renderer/IsoRenderer'
import { gridToIso } from '../data/worldData'
import type { Building, BuildingId } from '../types'

const ZOOM    = 0.44
const WALL_H  = 60

// ── Building hit-test (world-space coordinates) ───────────────────────────────

function hitBuilding(worldX: number, worldY: number, b: Building): boolean {
  const tl = gridToIso(b.gridPos)
  const tr = gridToIso({ x: b.gridPos.x + b.tileW, y: b.gridPos.y })
  const bl = gridToIso({ x: b.gridPos.x,            y: b.gridPos.y + b.tileH })
  const br = gridToIso({ x: b.gridPos.x + b.tileW,  y: b.gridPos.y + b.tileH })

  const xMin = Math.min(tl.x, bl.x)
  const xMax = Math.max(tr.x, br.x)
  const yMin = tl.y - 4
  const yMax = Math.max(bl.y, br.y) + WALL_H

  return worldX >= xMin && worldX <= xMax && worldY >= yMin && worldY <= yMax
}

// ── Hover cursor detection ────────────────────────────────────────────────────

function overBuilding(worldX: number, worldY: number, buildings: Building[]): boolean {
  return buildings.some(b => hitBuilding(worldX, worldY, b))
}

export default function WorldCanvas() {
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const animRef      = useRef<number>(0)
  const lastTimeRef  = useRef<number>(0)
  const camRef       = useRef({ x: 0, y: 0, isDragging: false, dragStart: { x: 0, y: 0 }, didDrag: false })
  const cursorRef    = useRef<'grab' | 'grabbing' | 'pointer'>('grab')

  const tick           = useSimStore(s => s.tick)
  const selectAgent    = useSimStore(s => s.selectAgent)
  const selectBuilding = useSimStore(s => s.selectBuilding)

  // Game loop
  useEffect(() => {
    const loop = (now: number) => {
      const dt = lastTimeRef.current ? now - lastTimeRef.current : 16
      lastTimeRef.current = now
      tick(Math.min(dt, 200))

      const canvas = canvasRef.current
      if (!canvas) { animRef.current = requestAnimationFrame(loop); return }
      const ctx = canvas.getContext('2d')
      if (!ctx) { animRef.current = requestAnimationFrame(loop); return }

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height)
      grad.addColorStop(0, '#1a1a2e')
      grad.addColorStop(1, '#16213e')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      ctx.save()
      ctx.scale(ZOOM, ZOOM)
      const snapshot = useSimStore.getState()
      render(ctx, snapshot, camRef.current.x / ZOOM, camRef.current.y / ZOOM)
      ctx.restore()

      animRef.current = requestAnimationFrame(loop)
    }

    const cw = canvasRef.current ? canvasRef.current.width : 530
    const ch = canvasRef.current ? canvasRef.current.height : 500
    camRef.current.x = cw / 2 - 180 * ZOOM
    camRef.current.y = ch / 2 - 258 * ZOOM

    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [tick])

  // Resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width  = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Click: agent first, then building
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (camRef.current.didDrag) return   // ignore drag-release
    const canvas = canvasRef.current
    if (!canvas) return
    const rect   = canvas.getBoundingClientRect()
    const worldX = (e.clientX - rect.left  - camRef.current.x) / ZOOM
    const worldY = (e.clientY - rect.top   - camRef.current.y) / ZOOM

    const { agents, worldMap } = useSimStore.getState()

    // 1. Try agent click first
    let closestAgent: string | null = null
    let minDist = 25
    for (const agent of agents) {
      const dx = agent.pixelPos.x - worldX
      const dy = (agent.pixelPos.y - 14) - worldY
      const d  = Math.sqrt(dx * dx + dy * dy)
      if (d < minDist) { minDist = d; closestAgent = agent.id }
    }
    if (closestAgent) { selectAgent(closestAgent); return }

    // 2. Try building click (front buildings first — reverse order)
    const buildings = [...worldMap.buildings].reverse()
    for (const b of buildings) {
      if (hitBuilding(worldX, worldY, b)) {
        selectBuilding(b.id as BuildingId)
        return
      }
    }

    // 3. Deselect
    selectAgent(null)
    selectBuilding(null)
  }, [selectAgent, selectBuilding])

  // Mouse move: update cursor + hover tracking
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (camRef.current.isDragging) {
      camRef.current.didDrag = true
      camRef.current.x = e.clientX - camRef.current.dragStart.x
      camRef.current.y = e.clientY - camRef.current.dragStart.y
      cursorRef.current = 'grabbing'
      if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing'
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return
    const rect   = canvas.getBoundingClientRect()
    const worldX = (e.clientX - rect.left - camRef.current.x) / ZOOM
    const worldY = (e.clientY - rect.top  - camRef.current.y) / ZOOM
    const { worldMap } = useSimStore.getState()

    const onBuilding = overBuilding(worldX, worldY, worldMap.buildings)
    const cursor = onBuilding ? 'pointer' : 'grab'
    if (cursorRef.current !== cursor) {
      cursorRef.current = cursor
      canvas.style.cursor = cursor
    }
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    camRef.current.isDragging = true
    camRef.current.didDrag    = false
    camRef.current.dragStart  = { x: e.clientX - camRef.current.x, y: e.clientY - camRef.current.y }
  }, [])

  const handleMouseUp = useCallback(() => {
    camRef.current.isDragging = false
    if (canvasRef.current) canvasRef.current.style.cursor = cursorRef.current === 'grabbing' ? 'grab' : cursorRef.current
    cursorRef.current = 'grab'
  }, [])

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ width: '100%', height: '100%', cursor: 'grab', display: 'block' }}
    />
  )
}
