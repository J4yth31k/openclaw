import { useEffect, useRef, useCallback } from 'react'
import { useSimStore } from '../store'
import { render } from '../renderer/IsoRenderer'
import { gridToIso } from '../data/worldData'

export default function WorldCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(0)
  const ZOOM = 0.44
  const camRef = useRef({ x: 0, y: 0, isDragging: false, dragStart: { x: 0, y: 0 } })

  const tick = useSimStore(s => s.tick)
  const state = useSimStore(s => s)
  const selectAgent = useSimStore(s => s.selectAgent)

  // Game loop
  useEffect(() => {
    const loop = (now: number) => {
      const dt = lastTimeRef.current ? now - lastTimeRef.current : 16
      lastTimeRef.current = now
      tick(Math.min(dt, 200))  // cap dt to avoid spiral of death

      const canvas = canvasRef.current
      if (!canvas) { animRef.current = requestAnimationFrame(loop); return }
      const ctx = canvas.getContext('2d')
      if (!ctx) { animRef.current = requestAnimationFrame(loop); return }

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Sky gradient
      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height)
      grad.addColorStop(0, '#1a1a2e')
      grad.addColorStop(1, '#16213e')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Apply zoom then pan
      ctx.save()
      ctx.scale(ZOOM, ZOOM)
      const snapshot = useSimStore.getState()
      render(ctx, snapshot, camRef.current.x / ZOOM, camRef.current.y / ZOOM)
      ctx.restore()

      animRef.current = requestAnimationFrame(loop)
    }

    // World center: grid (9.5, 7) → isoPixel ((9.5-7)*24+120, (9.5+7)*12+60) = (180, 258)
    const cw = canvasRef.current ? canvasRef.current.width : 530
    const ch = canvasRef.current ? canvasRef.current.height : 500
    camRef.current.x = cw / 2 - 180 * ZOOM
    camRef.current.y = ch / 2 - 258 * ZOOM

    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [tick])

  // Canvas resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Click to select agent
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = (e.clientX - rect.left - camRef.current.x) / ZOOM
    const my = (e.clientY - rect.top  - camRef.current.y) / ZOOM

    const agents = useSimStore.getState().agents
    let closest: string | null = null
    let minDist = 25

    for (const agent of agents) {
      const dx = agent.pixelPos.x - mx
      const dy = (agent.pixelPos.y - 14) - my
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < minDist) {
        minDist = dist
        closest = agent.id
      }
    }
    selectAgent(closest)
  }, [selectAgent])

  // Pan with mouse drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    camRef.current.isDragging = true
    camRef.current.dragStart = { x: e.clientX - camRef.current.x, y: e.clientY - camRef.current.y }
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!camRef.current.isDragging) return
    camRef.current.x = e.clientX - camRef.current.dragStart.x
    camRef.current.y = e.clientY - camRef.current.dragStart.y
  }, [])

  const handleMouseUp = useCallback(() => {
    camRef.current.isDragging = false
  }, [])

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ width: '100%', height: '100%', cursor: camRef.current.isDragging ? 'grabbing' : 'grab', display: 'block' }}
    />
  )
}
