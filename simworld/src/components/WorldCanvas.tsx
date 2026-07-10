import { useEffect, useRef, useCallback, useState } from 'react'
import { useSimStore } from '../store'
import { render, worldBounds } from '../renderer/IsoRenderer'
import { gridToIso, isoToGrid, canPlaceBuilding } from '../data/worldData'
import { ambientTick, playClick } from '../engine/Sound'
import type { Building, FurnitureKind, Vec2 } from '../types'

// ── Weather: deterministic rain blocks derived from sim time ─────────────────

function rainTarget(day: number, hourFloat: number): number {
  const block = Math.floor(hourFloat / 3)                 // 8 weather blocks per day
  const s = Math.sin(day * 127.1 + block * 311.7) * 43758.5453
  const r = s - Math.floor(s)                             // 0..1 pseudo-random per block
  return r < 0.26 ? 0.45 + r * 2 : 0                      // ~1 in 4 blocks rains
}

// ── Action menu (Sims-style: click a target, pick an interaction) ────────────

interface MenuAction { label: string; run: () => void }
interface MenuState { x: number; y: number; title: string; actions: MenuAction[] }

const FURNITURE_ACTIONS: Record<FurnitureKind, string> = {
  fridge: '🍕 Have a snack',
  couch:  '🛋️ Relax a while',
  tv:     '📺 Watch TV',
  bed:    '💤 Take a nap',
  shower: '🚿 Freshen up',
  desk:   '💼 Work here',
  plant:  '🌿 Admire the plant',
}

const WALL_H   = 60
const MIN_ZOOM = 0.18
const MAX_ZOOM = 2.4

// ── Building hit-test (world-space coordinates) ───────────────────────────────

function hitBuilding(worldX: number, worldY: number, b: Building): boolean {
  const tl = gridToIso(b.gridPos)
  const tr = gridToIso({ x: b.gridPos.x + b.tileW, y: b.gridPos.y })
  const bl = gridToIso({ x: b.gridPos.x,            y: b.gridPos.y + b.tileH })
  const br = gridToIso({ x: b.gridPos.x + b.tileW,  y: b.gridPos.y + b.tileH })

  const xMin = Math.min(tl.x, bl.x)
  const xMax = Math.max(tr.x, br.x)
  // Walls now rise upward (dollhouse style) — clickable area extends above the footprint
  const yMin = tl.y - (b.vacant ? 8 : WALL_H + 14)
  const yMax = Math.max(bl.y, br.y) + 8

  return worldX >= xMin && worldX <= xMax && worldY >= yMin && worldY <= yMax
}

// ── Day/night curve ───────────────────────────────────────────────────────────

function nightAmount(hourFloat: number): number {
  if (hourFloat >= 7 && hourFloat < 17) return 0
  if (hourFloat >= 17 && hourFloat < 20) return (hourFloat - 17) / 3
  if (hourFloat >= 20 || hourFloat < 5) return 1
  return 1 - (hourFloat - 5) / 2   // 5–7 dawn
}

// ── Deterministic stars (screen-space, for night sky) ─────────────────────────

const STARS = Array.from({ length: 70 }, (_, i) => ({
  x: ((i * 137.5) % 100) / 100,
  y: ((i * 73.3) % 47) / 100,
  r: 0.5 + ((i * 29) % 10) / 10,
  tw: (i % 7) / 7 * Math.PI * 2,
}))

// ── Camera ────────────────────────────────────────────────────────────────────

interface Cam {
  x: number; y: number
  zoom: number; targetZoom: number
  anchorScreen: { x: number; y: number } | null
  anchorWorld: { x: number; y: number } | null
  isDragging: boolean
  didDrag: boolean
  dragStart: { x: number; y: number }
  // touch
  pinchDist: number
  pinchZoom: number
}

export default function WorldCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef   = useRef<number>(0)
  const lastTimeRef = useRef<number>(0)
  const camRef = useRef<Cam>({
    x: 0, y: 0, zoom: 0.6, targetZoom: 0.6,
    anchorScreen: null, anchorWorld: null,
    isDragging: false, didDrag: false, dragStart: { x: 0, y: 0 },
    pinchDist: 0, pinchZoom: 0.6,
  })
  const fittedRef = useRef(false)
  const followRef = useRef(false)
  const rainRef   = useRef(0)
  const soundAtRef = useRef(0)
  const [menu, setMenu] = useState<MenuState | null>(null)

  const tick           = useSimStore(s => s.tick)
  const selectAgent    = useSimStore(s => s.selectAgent)
  const selectBuilding = useSimStore(s => s.selectBuilding)

  // ── Fit world in view ───────────────────────────────────────────────────────
  const fitCamera = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const cw = canvas.offsetWidth, ch = canvas.offsetHeight
    if (cw === 0 || ch === 0) return
    const b = worldBounds(useSimStore.getState().worldMap)
    const zoom = Math.min(cw / b.width, ch / b.height) * 0.92
    const cam = camRef.current
    cam.zoom = cam.targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom))
    cam.x = (cw - b.width * cam.zoom) / 2 - b.minX * cam.zoom
    cam.y = (ch - b.height * cam.zoom) / 2 - b.minY * cam.zoom
    cam.anchorScreen = cam.anchorWorld = null
    followRef.current = false
  }, [])

  // ── Sims-style intro framing: start close, centred on the town ─────────────
  const focusTown = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const cw = canvas.offsetWidth, ch = canvas.offsetHeight
    if (cw === 0 || ch === 0) return
    const { worldMap } = useSimStore.getState()
    const b = worldBounds(worldMap)
    const fitZoom = Math.min(cw / b.width, ch / b.height) * 0.92
    const cam = camRef.current
    // Closer than full-fit, but never further out than the fit
    cam.zoom = cam.targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.max(fitZoom, 0.85)))
    const centre = gridToIso({ x: worldMap.cols / 2, y: worldMap.rows / 2 })
    cam.x = cw / 2 - centre.x * cam.zoom
    cam.y = ch / 2 - centre.y * cam.zoom
    cam.anchorScreen = cam.anchorWorld = null
  }, [])

  // ── Game loop ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const loop = (now: number) => {
      const dt = lastTimeRef.current ? now - lastTimeRef.current : 16
      lastTimeRef.current = now
      tick(Math.min(dt, 200))

      const canvas = canvasRef.current
      if (!canvas) { animRef.current = requestAnimationFrame(loop); return }
      const ctx = canvas.getContext('2d')
      if (!ctx) { animRef.current = requestAnimationFrame(loop); return }

      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      const cssW = canvas.offsetWidth, cssH = canvas.offsetHeight
      if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
        canvas.width  = Math.round(cssW * dpr)
        canvas.height = Math.round(cssH * dpr)
      }
      if (!fittedRef.current && cssW > 0) {
        focusTown()
        fittedRef.current = true
      }

      const cam = camRef.current

      // ── Follow the selected agent (Sims-style tracking camera) ────────────
      if (followRef.current && !cam.isDragging) {
        const st = useSimStore.getState()
        const ag = st.agents.find(a => a.id === st.selectedAgentId)
        if (ag) {
          const tx = cssW / 2 - ag.pixelPos.x * cam.zoom
          const ty = cssH / 2 - (ag.pixelPos.y - 14) * cam.zoom
          cam.x += (tx - cam.x) * 0.07
          cam.y += (ty - cam.y) * 0.07
        } else {
          followRef.current = false
        }
      }

      // Smooth zoom toward target, anchored under the cursor
      if (Math.abs(cam.targetZoom - cam.zoom) > 0.0005) {
        cam.zoom += (cam.targetZoom - cam.zoom) * 0.22
        if (cam.anchorScreen && cam.anchorWorld) {
          cam.x = cam.anchorScreen.x - cam.anchorWorld.x * cam.zoom
          cam.y = cam.anchorScreen.y - cam.anchorWorld.y * cam.zoom
        }
      } else {
        cam.zoom = cam.targetZoom
      }

      const snapshot = useSimStore.getState()
      const hourFloat = snapshot.time.hour + snapshot.time.minute / 60
      const nightAmt = nightAmount(hourFloat)

      // Rain eases toward the current weather block's target
      const rTarget = rainTarget(snapshot.time.day, hourFloat)
      rainRef.current += (rTarget - rainRef.current) * Math.min(1, dt / 4000)
      const rainAmt = rainRef.current < 0.02 ? 0 : Math.min(1, rainRef.current)

      // Ambient audio conditions (throttled)
      if (now - soundAtRef.current > 500) {
        soundAtRef.current = now
        ambientTick(nightAmt, rainAmt)
      }

      // ── Sky background (day → dusk → night) ──────────────────────────────
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const grad = ctx.createLinearGradient(0, 0, 0, cssH)
      const dayTop = [26, 26, 46], dayBot = [22, 33, 62]
      const nightTop = [4, 6, 18], nightBot = [8, 12, 30]
      const mix = (a: number[], b: number[]) => a.map((v, i) => Math.round(v + (b[i] - v) * nightAmt))
      const top = mix(dayTop, nightTop), bot = mix(dayBot, nightBot)
      grad.addColorStop(0, `rgb(${top[0]},${top[1]},${top[2]})`)
      grad.addColorStop(1, `rgb(${bot[0]},${bot[1]},${bot[2]})`)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, cssW, cssH)

      // Stars at night
      if (nightAmt > 0.25) {
        for (const s of STARS) {
          const tw = 0.5 + Math.sin(now / 900 + s.tw) * 0.5
          ctx.beginPath()
          ctx.arc(s.x * cssW, s.y * cssH, s.r, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(255,255,255,${(nightAmt * 0.7 * tw).toFixed(2)})`
          ctx.fill()
        }
      }

      // ── World render ──────────────────────────────────────────────────────
      ctx.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, dpr * cam.x, dpr * cam.y)

      // Ghost preview info
      let ghost = null
      if (snapshot.placing && snapshot.hoverTile) {
        const lot = snapshot.placing
        const pos = {
          x: snapshot.hoverTile.x - Math.floor(lot.tileW / 2),
          y: snapshot.hoverTile.y - Math.floor(lot.tileH / 2),
        }
        ghost = {
          pos, w: lot.tileW, h: lot.tileH,
          valid: canPlaceBuilding(snapshot.worldMap, pos, lot.tileW, lot.tileH),
        }
      }

      render(ctx, snapshot, { nowMs: now, nightAmt, rainAmt, zoom: cam.zoom, ghost })

      // ── Weather + night overlays (screen-space) ───────────────────────────
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Storm dimming
      if (rainAmt > 0.02) {
        ctx.fillStyle = `rgba(40, 48, 66, ${(rainAmt * 0.22).toFixed(2)})`
        ctx.fillRect(0, 0, cssW, cssH)

        // Falling rain streaks (angled, deterministic, endlessly wrapping)
        const drops = Math.floor(rainAmt * 130)
        ctx.strokeStyle = `rgba(190,215,245,${(0.14 + rainAmt * 0.14).toFixed(2)})`
        ctx.lineWidth = 1
        ctx.lineCap = 'round'
        ctx.beginPath()
        for (let i = 0; i < drops; i++) {
          const seedX = ((i * 97.31) % 1) * (cssW + 80) - 40
          const speed = 380 + ((i * 37) % 5) * 60
          const len = 9 + ((i * 13) % 4) * 3
          const yy = ((now / 1000) * speed + i * 173) % (cssH + 40) - 20
          ctx.moveTo(seedX, yy)
          ctx.lineTo(seedX - len * 0.25, yy + len)
        }
        ctx.stroke()
      }

      if (nightAmt > 0.01) {
        ctx.fillStyle = `rgba(8, 10, 40, ${(nightAmt * 0.38).toFixed(2)})`
        ctx.fillRect(0, 0, cssW, cssH)
      }
      // Warm dusk / dawn tint
      if (nightAmt > 0.05 && nightAmt < 0.75) {
        const warm = Math.sin(Math.min(1, nightAmt / 0.75) * Math.PI)
        ctx.fillStyle = `rgba(255, 120, 40, ${(warm * 0.07).toFixed(3)})`
        ctx.fillRect(0, 0, cssW, cssH)
      }

      animRef.current = requestAnimationFrame(loop)
    }

    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [tick, focusTown])

  // ── Coordinate helpers ─────────────────────────────────────────────────────
  const toWorld = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const cam = camRef.current
    return {
      x: (clientX - rect.left - cam.x) / cam.zoom,
      y: (clientY - rect.top  - cam.y) / cam.zoom,
      sx: clientX - rect.left,
      sy: clientY - rect.top,
    }
  }, [])

  // ── Wheel zoom ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const cam = camRef.current
      const factor = e.deltaY < 0 ? 1.14 : 1 / 1.14
      cam.targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cam.targetZoom * factor))
      const w = toWorld(e.clientX, e.clientY)
      cam.anchorScreen = { x: w.sx, y: w.sy }
      cam.anchorWorld  = { x: w.x, y: w.y }
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [toWorld])

  // ── Escape closes menu / cancels placing / deselects agent ────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const s = useSimStore.getState()
        setMenu(null)
        if (s.placing) s.cancelPlacing()
        else if (s.selectedAgentId) { s.selectAgent(null); followRef.current = false }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── Click: place → agent → action menu → building ─────────────────────────
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (camRef.current.didDrag) return
    const w = toWorld(e.clientX, e.clientY)
    const state = useSimStore.getState()

    // 0. An open menu absorbs the click (close it)
    if (menu) { setMenu(null); return }

    // 1. Build placement
    if (state.placing) {
      state.confirmPlaceAt(isoToGrid({ x: w.x, y: w.y }))
      return
    }

    // 2. Agent click (select + follow / re-click to release)
    let closestAgent: string | null = null
    let minDist = 25
    for (const agent of state.agents) {
      const dx = agent.pixelPos.x - w.x
      const dy = (agent.pixelPos.y - 14) - w.y
      const d  = Math.sqrt(dx * dx + dy * dy)
      if (d < minDist) { minDist = d; closestAgent = agent.id }
    }
    if (closestAgent) {
      // Clicking another agent while one is selected → interaction menu
      if (state.selectedAgentId && closestAgent !== state.selectedAgentId) {
        const selId = state.selectedAgentId
        const sel = state.agents.find(a => a.id === selId)
        const other = state.agents.find(a => a.id === closestAgent)!
        setMenu({
          x: w.sx, y: w.sy,
          title: other.name,
          actions: [
            {
              label: `💬 ${sel?.name ?? 'Agent'}: chat with ${other.name}`,
              run: () => useSimStore.getState().commandAgent(selId, {
                kind: 'chat', target: { ...other.gridPos }, targetAgentId: other.id,
              }),
            },
            {
              label: `👤 Switch to ${other.name}`,
              run: () => { selectAgent(other.id); followRef.current = true },
            },
          ],
        })
        return
      }
      const deselect = closestAgent === state.selectedAgentId
      selectAgent(deselect ? null : closestAgent)
      followRef.current = !deselect
      if (!deselect) playClick()
      return
    }

    // 3. With an agent selected: pop an action menu at the cursor
    if (state.selectedAgentId) {
      const selId = state.selectedAgentId

      // 3a. Furniture target
      for (const b of state.worldMap.buildings) {
        if (b.vacant || !b.furniture) continue
        for (const f of b.furniture) {
          const fp = gridToIso(f.gridPos)
          const dx = fp.x - w.x
          const dy = (fp.y - 8) - w.y
          if (dx * dx + dy * dy < 240) {
            const target: Vec2 = { ...f.gridPos }
            const kind = f.kind
            setMenu({
              x: w.sx, y: w.sy,
              title: kind.charAt(0).toUpperCase() + kind.slice(1),
              actions: [{
                label: FURNITURE_ACTIONS[kind],
                run: () => useSimStore.getState().commandAgent(selId, {
                  kind: 'use', target, furnitureKind: kind, buildingId: b.id,
                }),
              }],
            })
            return
          }
        }
      }

      // 3b. Walkable ground
      const tile = isoToGrid({ x: w.x, y: w.y })
      const { worldMap } = state
      if (tile.x >= 0 && tile.x < worldMap.cols && tile.y >= 0 && tile.y < worldMap.rows) {
        const t = worldMap.tiles[tile.y][tile.x]
        if (t !== 'building_floor') {
          setMenu({
            x: w.sx, y: w.sy,
            title: 'Ground',
            actions: [{
              label: '🚶 Go here',
              run: () => useSimStore.getState().commandAgent(selId, { kind: 'goto', target: tile }),
            }],
          })
          return
        }
      }
    }

    // 4. Building click (front first)
    const buildings = [...state.worldMap.buildings].reverse()
    for (const b of buildings) {
      if (hitBuilding(w.x, w.y, b)) {
        selectBuilding(b.id)
        return
      }
    }

    // 5. Deselect
    selectAgent(null)
    selectBuilding(null)
    followRef.current = false
  }, [selectAgent, selectBuilding, toWorld, menu])

  // ── Mouse move: drag / hover ───────────────────────────────────────────────
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const cam = camRef.current
    const canvas = canvasRef.current
    if (!canvas) return

    if (cam.isDragging) {
      cam.didDrag = true
      followRef.current = false        // manual pan releases the follow camera
      cam.x = e.clientX - cam.dragStart.x
      cam.y = e.clientY - cam.dragStart.y
      cam.anchorScreen = cam.anchorWorld = null
      canvas.style.cursor = 'grabbing'
      return
    }

    const w = toWorld(e.clientX, e.clientY)
    const state = useSimStore.getState()

    if (state.placing) {
      const tile = isoToGrid({ x: w.x, y: w.y })
      const prev = state.hoverTile
      if (!prev || prev.x !== tile.x || prev.y !== tile.y) state.setHoverTile(tile)
      canvas.style.cursor = 'crosshair'
      return
    }

    const over = state.worldMap.buildings.some(b => hitBuilding(w.x, w.y, b))
    canvas.style.cursor = over ? 'pointer' : 'grab'
  }, [toWorld])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const cam = camRef.current
    cam.isDragging = true
    cam.didDrag    = false
    cam.dragStart  = { x: e.clientX - cam.x, y: e.clientY - cam.y }
  }, [])

  const handleMouseUp = useCallback(() => {
    const cam = camRef.current
    cam.isDragging = false
    if (canvasRef.current) canvasRef.current.style.cursor = 'grab'
  }, [])

  // ── Touch: pan + pinch ─────────────────────────────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const cam = camRef.current
    if (e.touches.length === 1) {
      const t = e.touches[0]
      cam.isDragging = true
      cam.didDrag = false
      cam.dragStart = { x: t.clientX - cam.x, y: t.clientY - cam.y }
    } else if (e.touches.length === 2) {
      cam.isDragging = false
      const [a, b] = [e.touches[0], e.touches[1]]
      cam.pinchDist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)
      cam.pinchZoom = cam.zoom
    }
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const cam = camRef.current
    if (e.touches.length === 1 && cam.isDragging) {
      const t = e.touches[0]
      cam.didDrag = true
      cam.x = t.clientX - cam.dragStart.x
      cam.y = t.clientY - cam.dragStart.y
      cam.anchorScreen = cam.anchorWorld = null
    } else if (e.touches.length === 2 && cam.pinchDist > 0) {
      const [a, b] = [e.touches[0], e.touches[1]]
      const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)
      const midX = (a.clientX + b.clientX) / 2
      const midY = (a.clientY + b.clientY) / 2
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cam.pinchZoom * (dist / cam.pinchDist)))
      const w = toWorld(midX, midY)
      cam.zoom = cam.targetZoom = newZoom
      cam.x = w.sx - w.x * newZoom
      cam.y = w.sy - w.y * newZoom
    }
  }, [toWorld])

  const handleTouchEnd = useCallback(() => {
    const cam = camRef.current
    cam.isDragging = false
    cam.pinchDist = 0
  }, [])

  const placing = useSimStore(s => s.placing)
  const cancelPlacing = useSimStore(s => s.cancelPlacing)

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ width: '100%', height: '100%', cursor: 'grab', display: 'block', touchAction: 'none' }}
      />

      {/* Recenter */}
      <button
        onClick={fitCamera}
        title="Recenter map"
        style={{
          position: 'absolute', bottom: 12, right: 12,
          width: 34, height: 34, borderRadius: 8,
          background: 'rgba(10,14,28,0.85)', border: '1px solid rgba(0,212,255,0.25)',
          color: '#00d4ff', fontSize: 16, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        ⌖
      </button>

      {/* Action menu (Sims-style interaction picker) */}
      {menu && (
        <div style={{
          position: 'absolute',
          left: Math.min(menu.x, (canvasRef.current?.offsetWidth ?? 300) - 170),
          top: Math.min(menu.y, (canvasRef.current?.offsetHeight ?? 300) - 90),
          background: 'rgba(10,14,28,0.96)',
          border: '1px solid rgba(0,212,255,0.35)',
          borderRadius: 10, padding: 5, minWidth: 150,
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          zIndex: 20,
        }}>
          <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: 1, color: '#4a6a80', padding: '3px 8px 5px', textTransform: 'uppercase' }}>
            {menu.title}
          </div>
          {menu.actions.map((a, i) => (
            <button
              key={i}
              onClick={() => { playClick(); a.run(); setMenu(null) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                background: 'rgba(0,212,255,0.07)', border: '1px solid rgba(0,212,255,0.18)',
                borderRadius: 7, color: '#d8e6f2', fontSize: 11, fontWeight: 600,
                padding: '7px 10px', cursor: 'pointer', marginBottom: 4,
              }}
            >
              {a.label}
            </button>
          ))}
          <button
            onClick={() => setMenu(null)}
            style={{
              display: 'block', width: '100%', textAlign: 'center',
              background: 'transparent', border: 'none',
              color: '#4a5568', fontSize: 9, padding: '3px 0 2px', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Placing banner */}
      {placing && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(10,14,28,0.92)', border: '1px solid rgba(72,220,140,0.4)',
          borderRadius: 10, padding: '8px 14px',
          display: 'flex', alignItems: 'center', gap: 10,
          fontSize: 11, color: '#e0e6f0', whiteSpace: 'nowrap',
        }}>
          <span>🏗️ Placing <b style={{ color: '#48dc8c' }}>{placing.typeName}</b> — click a green spot</span>
          <button
            onClick={cancelPlacing}
            style={{
              background: 'rgba(240,80,80,0.15)', border: '1px solid rgba(240,80,80,0.4)',
              borderRadius: 6, color: '#f08080', fontSize: 10, fontWeight: 700,
              padding: '3px 8px', cursor: 'pointer',
            }}
          >
            Cancel (Esc)
          </button>
        </div>
      )}
    </div>
  )
}
