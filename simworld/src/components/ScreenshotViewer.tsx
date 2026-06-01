import { useState, useRef, useCallback, useEffect } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  src: string
  alt?: string
  onClose?: () => void
  compact?: boolean   // thumbnail mode (no controls shown by default)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val))
}

const BTN: React.CSSProperties = {
  padding: '4px 9px', borderRadius: 4,
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.06)', color: '#c8d4e4',
  fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
  transition: 'background 0.1s',
}

// ── Screenshot Viewer ─────────────────────────────────────────────────────────

export default function ScreenshotViewer({ src, alt = 'screenshot', onClose, compact = false }: Props) {
  const [zoom, setZoom]       = useState(1)
  const [panX, setPanX]       = useState(0)
  const [panY, setPanY]       = useState(0)
  const [isFullscreen, setFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(!compact)
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const isDragging   = useRef(false)
  const lastPos      = useRef({ x: 0, y: 0 })
  const lastDist     = useRef(0)

  // Reset on src change
  useEffect(() => {
    setZoom(1); setPanX(0); setPanY(0)
  }, [src])

  // Persist zoom pref
  useEffect(() => {
    try { localStorage.setItem('sw_screenshot_zoom', String(zoom)) } catch {}
  }, [zoom])

  // Load saved zoom
  useEffect(() => {
    try {
      const saved = parseFloat(localStorage.getItem('sw_screenshot_zoom') ?? '1')
      if (saved && saved >= 0.5 && saved <= 8) setZoom(saved)
    } catch {}
  }, [])

  // ── Mouse wheel zoom ──────────────────────────────────────────────────────

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
    setZoom(z => clamp(z * factor, 0.5, 8))
  }, [])

  // ── Mouse drag pan ────────────────────────────────────────────────────────

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom <= 1) return
    isDragging.current = true
    lastPos.current = { x: e.clientX, y: e.clientY }
    e.preventDefault()
  }, [zoom])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return
    const dx = e.clientX - lastPos.current.x
    const dy = e.clientY - lastPos.current.y
    lastPos.current = { x: e.clientX, y: e.clientY }
    setPanX(x => x + dx)
    setPanY(y => y + dy)
  }, [])

  const onMouseUp = useCallback(() => { isDragging.current = false }, [])

  // ── Touch events ──────────────────────────────────────────────────────────

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      isDragging.current = true
      lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    } else if (e.touches.length === 2) {
      isDragging.current = false
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      lastDist.current = Math.sqrt(dx * dx + dy * dy)
    }
  }, [])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault()
    if (e.touches.length === 1 && isDragging.current && zoom > 1) {
      const dx = e.touches[0].clientX - lastPos.current.x
      const dy = e.touches[0].clientY - lastPos.current.y
      lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      setPanX(x => x + dx)
      setPanY(y => y + dy)
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (lastDist.current > 0) {
        const scale = dist / lastDist.current
        setZoom(z => clamp(z * scale, 0.5, 8))
      }
      lastDist.current = dist
    }
  }, [zoom])

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    isDragging.current = false
    if (e.touches.length < 2) lastDist.current = 0
  }, [])

  // ── Double-tap reset ──────────────────────────────────────────────────────

  const lastTapTime = useRef(0)
  const onTap = useCallback(() => {
    const now = Date.now()
    if (now - lastTapTime.current < 300) {
      setZoom(1); setPanX(0); setPanY(0)
    }
    lastTapTime.current = now
  }, [])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    if (!showControls && compact) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setFullscreen(false); onClose?.() }
      if (e.key === '+' || (e.ctrlKey && e.key === '=')) { e.preventDefault(); setZoom(z => clamp(z * 1.15, 0.5, 8)) }
      if (e.key === '-' || (e.ctrlKey && e.key === '-')) { e.preventDefault(); setZoom(z => clamp(z / 1.15, 0.5, 8)) }
      if (e.key === '0' || (e.ctrlKey && e.key === '0')) { e.preventDefault(); setZoom(1); setPanX(0); setPanY(0) }
      if (e.key === 'f' || e.key === 'F') setFullscreen(fs => !fs)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showControls, compact, onClose])

  // ── Fullscreen API ────────────────────────────────────────────────────────

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement && containerRef.current) {
      containerRef.current.requestFullscreen?.().catch(() => setFullscreen(fs => !fs))
    } else {
      document.exitFullscreen?.().catch(() => setFullscreen(fs => !fs))
    }
    setFullscreen(fs => !fs)
  }, [])

  // ── Image load ─────────────────────────────────────────────────────────────

  const onImgLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    setImageSize({ w: img.naturalWidth, h: img.naturalHeight })
  }, [])

  // ── Fit to screen ──────────────────────────────────────────────────────────

  const fitToScreen = useCallback(() => {
    if (!containerRef.current || !imageSize) return
    const cw = containerRef.current.clientWidth
    const ch = containerRef.current.clientHeight - 80  // subtract controls
    const scale = Math.min(cw / imageSize.w, ch / imageSize.h, 1)
    setZoom(scale)
    setPanX(0)
    setPanY(0)
  }, [imageSize])

  const containerStyle: React.CSSProperties = isFullscreen ? {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: '#000', display: 'flex', flexDirection: 'column',
  } : {
    display: 'flex', flexDirection: 'column',
    background: '#06080f', borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.08)',
    overflow: 'hidden',
    height: '100%',
  }

  return (
    <div ref={containerRef} style={containerStyle}>
      {/* Header controls */}
      {showControls && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px',
          background: 'rgba(0,0,0,0.4)', borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 9, color: '#4a5870', fontWeight: 700, letterSpacing: 0.5 }}>
            SCREENSHOT VIEWER
          </span>
          {imageSize && (
            <span style={{ fontSize: 8, color: '#3a4060', fontFamily: 'monospace' }}>
              {imageSize.w}×{imageSize.h}
            </span>
          )}
          <div style={{ flex: 1 }} />

          {/* Zoom controls */}
          <button style={BTN} onClick={() => setZoom(z => clamp(z / 1.15, 0.5, 8))}>−</button>
          <span style={{ fontSize: 9, color: '#7c8a9e', fontFamily: 'monospace', minWidth: 38, textAlign: 'center' }}>
            {Math.round(zoom * 100)}%
          </span>
          <button style={BTN} onClick={() => setZoom(z => clamp(z * 1.15, 0.5, 8))}>+</button>

          <button style={BTN} onClick={() => { setZoom(1); setPanX(0); setPanY(0) }}>1:1</button>
          <button style={BTN} onClick={fitToScreen}>Fit</button>
          <button style={{ ...BTN, color: isFullscreen ? '#10b981' : '#c8d4e4' }} onClick={toggleFullscreen}>
            {isFullscreen ? '⊡' : '⊞'} Full
          </button>
          {onClose && (
            <button style={{ ...BTN, color: '#ef4444' }} onClick={onClose}>✕</button>
          )}
        </div>
      )}

      {/* Image area */}
      <div
        style={{
          flex: 1, overflow: 'hidden', position: 'relative',
          cursor: zoom > 1 ? 'grab' : 'default',
          touchAction: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'repeating-conic-gradient(rgba(255,255,255,0.02) 0% 25%, transparent 0% 50%) 0 0 / 20px 20px',
        }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={compact ? () => setShowControls(s => !s) : onTap}
      >
        <img
          src={src}
          alt={alt}
          onLoad={onImgLoad}
          style={{
            maxWidth: zoom <= 1 ? '100%' : 'none',
            maxHeight: zoom <= 1 ? '100%' : 'none',
            transform: `scale(${zoom}) translate(${panX / zoom}px, ${panY / zoom}px)`,
            transformOrigin: 'center center',
            transition: isDragging.current ? 'none' : 'transform 0.1s ease-out',
            display: 'block',
            userSelect: 'none',
            pointerEvents: 'none',
          }}
          draggable={false}
        />

        {/* Compact overlay hint */}
        {compact && !showControls && (
          <div style={{
            position: 'absolute', bottom: 6, right: 6,
            background: 'rgba(0,0,0,0.6)', borderRadius: 4,
            padding: '3px 7px', fontSize: 8, color: 'rgba(255,255,255,0.5)',
            pointerEvents: 'none',
          }}>
            tap for controls
          </div>
        )}
      </div>

      {/* Bottom zoom strip (compact mode) */}
      {compact && showControls && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '5px 8px',
          background: 'rgba(0,0,0,0.5)', borderTop: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          <button style={{ ...BTN, fontSize: 9 }} onClick={() => setZoom(z => clamp(z / 1.15, 0.5, 8))}>−</button>
          <span style={{ fontSize: 8, color: '#7c8a9e', fontFamily: 'monospace', minWidth: 34, textAlign: 'center' }}>
            {Math.round(zoom * 100)}%
          </span>
          <button style={{ ...BTN, fontSize: 9 }} onClick={() => setZoom(z => clamp(z * 1.15, 0.5, 8))}>+</button>
          <button style={{ ...BTN, fontSize: 9 }} onClick={() => { setZoom(1); setPanX(0); setPanY(0) }}>⟳</button>
          <button style={{ ...BTN, fontSize: 9 }} onClick={fitToScreen}>Fit</button>
          <button style={{ ...BTN, fontSize: 9 }} onClick={toggleFullscreen}>⊞</button>
          <div style={{ flex: 1 }} />
          <button style={{ ...BTN, fontSize: 9, color: '#4a5870' }} onClick={() => setShowControls(false)}>hide</button>
        </div>
      )}
    </div>
  )
}
