import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import ScreenshotViewer from './ScreenshotViewer'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Breakdown {
  trades: number
  win_rate: number
  avg_pnl: number
}

interface BiasAnalysis {
  aligned_trades: number
  misaligned_trades: number
  aligned_win_rate: number
  misaligned_win_rate: number
}

interface ConfluenceBucket {
  trades: number
  win_rate: number
}

interface Analysis {
  status: string
  total_trades: number
  wins: number
  losses: number
  win_rate: number
  total_pnl: number
  avg_pnl_per_trade: number
  avg_rr_achieved: number
  avg_rr_planned: number
  by_session: Record<string, Breakdown>
  by_instrument: Record<string, Breakdown>
  by_direction: Record<string, Breakdown>
  by_agent: Record<string, Breakdown>
  bias_analysis: BiasAnalysis
  confluence_analysis: Record<string, ConfluenceBucket>
  best_session: string | null
  best_instrument: string | null
  recent_trades: Record<string, string>[]
  improvement_tips: string[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE = (import.meta as any).env?.VITE_RAILWAY_URL ?? ''

function pct(v: number) { return `${(v * 100).toFixed(1)}%` }
function usd(v: number) { return `${v >= 0 ? '+' : ''}$${v.toFixed(2)}` }

function wrColor(wr: number): string {
  if (wr >= 0.6) return '#10b981'
  if (wr >= 0.45) return '#f5c842'
  return '#ef4444'
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 6, padding: '8px 10px', flex: 1, minWidth: 0,
    }}>
      <div style={{ fontSize: 8, color: '#4a5870', fontWeight: 700, letterSpacing: 0.5, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: color ?? '#e0e6f0', fontFamily: 'monospace' }}>{value}</div>
      {sub && <div style={{ fontSize: 8, color: '#4a5870', marginTop: 1 }}>{sub}</div>}
    </div>
  )
}

function BreakdownTable({ title, data, sortKey = 'win_rate' }: {
  title: string
  data: Record<string, Breakdown>
  sortKey?: keyof Breakdown
}) {
  const rows = Object.entries(data)
    .sort((a, b) => (b[1][sortKey] as number) - (a[1][sortKey] as number))

  if (!rows.length) return null

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 8, color: '#4a5870', fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>{title}</div>
      {rows.map(([key, bd]) => (
        <div key={key} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
        }}>
          <span style={{ flex: 1, fontSize: 9, color: '#a0aec0', fontFamily: 'monospace' }}>{key}</span>
          <span style={{ fontSize: 9, fontFamily: 'monospace', color: wrColor(bd.win_rate), minWidth: 36 }}>
            {pct(bd.win_rate)}
          </span>
          <span style={{ fontSize: 9, fontFamily: 'monospace', color: bd.avg_pnl >= 0 ? '#10b981' : '#ef4444', minWidth: 52 }}>
            {usd(bd.avg_pnl)}
          </span>
          <span style={{ fontSize: 8, color: '#4a5870', minWidth: 28, textAlign: 'right' }}>
            {bd.trades}t
          </span>
        </div>
      ))}
    </div>
  )
}

function TipBadge({ tip, idx }: { tip: string; idx: number }) {
  const colors = ['#f97316', '#a78bfa', '#00d4ff', '#10b981', '#f5c842']
  const c = colors[idx % colors.length]
  return (
    <div style={{
      display: 'flex', gap: 6, alignItems: 'flex-start',
      padding: '5px 8px', borderRadius: 5, marginBottom: 5,
      background: `${c}10`, border: `1px solid ${c}30`,
    }}>
      <span style={{ color: c, fontSize: 10, marginTop: 1, flexShrink: 0 }}>💡</span>
      <span style={{ fontSize: 9, color: '#c0cfe0', lineHeight: 1.4 }}>{tip}</span>
    </div>
  )
}

function RecentTrade({ t }: { t: Record<string, string> }) {
  const outcome = (t.outcome ?? '').toLowerCase()
  const isWin = outcome === 'win' || outcome === 'won' || outcome === 'w'
  const isLoss = outcome === 'loss' || outcome === 'lost' || outcome === 'l'
  const color = isWin ? '#10b981' : isLoss ? '#ef4444' : '#f5c842'
  const pnl = parseFloat(t.realized_pnl_dollars ?? '0')
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>
      <span style={{ fontSize: 10, color }}>{isWin ? '✅' : isLoss ? '❌' : '⬜'}</span>
      <span style={{ flex: 1, fontSize: 9, color: '#a0aec0', fontFamily: 'monospace' }}>
        {t.instrument ?? '—'} {t.signal_direction ?? ''}
      </span>
      <span style={{ fontSize: 9, fontFamily: 'monospace', color }}>
        {isNaN(pnl) ? '—' : usd(pnl)}
      </span>
      <span style={{ fontSize: 8, color: '#4a5870' }}>{t.session ?? ''}</span>
    </div>
  )
}

// ── Upload zone ───────────────────────────────────────────────────────────────

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']

function UploadZone({ onFile }: { onFile: (file: File) => void }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) onFile(file)
  }, [onFile])

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `2px dashed ${dragging ? '#a78bfa' : 'rgba(124,58,237,0.25)'}`,
        borderRadius: 8, padding: '16px 12px', textAlign: 'center', cursor: 'pointer',
        background: dragging ? 'rgba(124,58,237,0.08)' : 'rgba(124,58,237,0.03)',
        transition: 'all 0.15s', marginBottom: 10,
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.json,image/png,image/jpeg,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }}
      />
      <div style={{ fontSize: 20, marginBottom: 4 }}>📂</div>
      <div style={{ fontSize: 9, color: '#a78bfa', fontWeight: 700 }}>Drop CSV, JSON, or Screenshot</div>
      <div style={{ fontSize: 8, color: '#4a5870', marginTop: 2 }}>PNG · JPG · WEBP · .csv · .json</div>
    </div>
  )
}

// ── Paste zone ────────────────────────────────────────────────────────────────

function PasteZone({ onPaste }: { onPaste: (e: React.ClipboardEvent) => void }) {
  const [focused, setFocused] = useState(false)
  return (
    <div
      tabIndex={0}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPaste={onPaste}
      style={{
        border: `2px dashed ${focused ? '#10b981' : 'rgba(16,185,129,0.2)'}`,
        borderRadius: 8, padding: '12px 10px', textAlign: 'center', cursor: 'text',
        background: focused ? 'rgba(16,185,129,0.06)' : 'rgba(16,185,129,0.02)',
        transition: 'all 0.15s', marginBottom: 10, outline: 'none',
      }}
    >
      <div style={{ fontSize: 18, marginBottom: 3 }}>📋</div>
      <div style={{ fontSize: 9, fontWeight: 700, color: focused ? '#10b981' : '#4a5870' }}>
        {focused ? 'Ready — paste now (Ctrl+V / ⌘V)' : 'Click here · then Ctrl+V to paste'}
      </div>
      <div style={{ fontSize: 8, color: '#4a5870', marginTop: 2 }}>
        Screenshot · CSV rows · JSON trades
      </div>
    </div>
  )
}

// ── Text paste area ───────────────────────────────────────────────────────────

function TextPasteArea({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')

  function submit() {
    if (text.trim()) { onSubmit(text.trim()); setText(''); setOpen(false) }
  }

  return (
    <div style={{ marginBottom: 10 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 5, padding: '5px 8px', background: 'rgba(255,255,255,0.02)',
          color: '#4a5870', fontSize: 8, fontWeight: 700, cursor: 'pointer',
          textAlign: 'left', display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        <span style={{ color: '#a78bfa' }}>{open ? '▲' : '▼'}</span>
        PASTE RAW TEXT (CSV / JSON)
      </button>
      {open && (
        <div style={{ marginTop: 4 }}>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={'Paste CSV rows or JSON array here…\n\nExamples:\ndate,instrument,outcome,realized_pnl_dollars\n2024-01-15,BTCUSD,win,120\n\nor\n[{"instrument":"NQ","outcome":"win","realized_pnl_dollars":200}]'}
            style={{
              width: '100%', minHeight: 100, resize: 'vertical', boxSizing: 'border-box',
              background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 5, color: '#c0cfe0', fontSize: 8, fontFamily: 'monospace',
              padding: '6px 8px', outline: 'none',
            }}
          />
          <button
            onClick={submit}
            disabled={!text.trim()}
            style={{
              marginTop: 4, padding: '5px 12px', borderRadius: 5, border: 'none',
              background: text.trim() ? '#7c3aed' : 'rgba(124,58,237,0.2)',
              color: text.trim() ? '#fff' : '#4a5870', fontSize: 8, fontWeight: 700,
              cursor: text.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            💪 Send to Hulk
          </button>
        </div>
      )}
    </div>
  )
}

// ── Agent Review (screenshot multi-agent discussion) ─────────────────────────

interface AgentReviewMessage {
  emoji: string
  name: string
  role: string
  color: string
  content: string
  sentiment: 'positive' | 'negative' | 'neutral'
  tags: string[]
}

function buildAgentReview(analysis: Analysis): AgentReviewMessage[] {
  const wr = analysis.win_rate
  const pnl = analysis.total_pnl
  const rr = analysis.avg_rr_achieved

  return [
    {
      emoji: '🦾', name: 'Iron Man', role: 'Tech Analyst', color: '#ef4444',
      content: `Technical review of your trade data complete.\n\nWin rate of ${(wr * 100).toFixed(1)}% ${wr >= 0.6 ? 'is solid — above the 60% threshold I consider minimum for a positive expectancy system.' : wr >= 0.45 ? 'is acceptable but leaves room for improvement. Focus on setup quality over quantity.' : 'needs work. You are likely entering on weaker setups or getting stopped out before the move.'}`,
      sentiment: wr >= 0.5 ? 'positive' : 'negative',
      tags: ['#TechnicalReview', '#WinRate'],
    },
    {
      emoji: '🔯', name: 'Dr. Strange', role: 'Risk Manager', color: '#14b8a6',
      content: `Risk assessment:\n\nAverage R:R achieved: ${rr.toFixed(2)}. ${rr >= 1.5 ? 'This is excellent. You are letting winners run and cutting losses appropriately.' : rr >= 1.0 ? 'Positive R:R — you are extracting value from the market. Can you push for 2:1?' : 'Your R:R needs improvement. Consider moving to break-even at 1:1 and targeting 1:2 minimum.'}\n\nTotal PnL: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}. ${pnl >= 0 ? 'Profitable. Keep the discipline.' : 'In drawdown. Reduce position size until you recover to breakeven.'}`,
      sentiment: rr >= 1.0 && pnl >= 0 ? 'positive' : pnl < 0 ? 'negative' : 'neutral',
      tags: ['#RiskManagement', '#RR'],
    },
    {
      emoji: '💪', name: 'Hulk', role: 'Backtest Engine', color: '#84cc16',
      content: `Hulk smashed ${analysis.total_trades} trades in the data.\n\n${analysis.best_session ? `Best session: ${analysis.best_session} with ${((analysis.by_session[analysis.best_session]?.win_rate ?? 0) * 100).toFixed(1)}% win rate — trade this window more.` : 'Sample size too small for session conclusions.'}\n\n${analysis.best_instrument ? `Best pair: ${analysis.best_instrument} — your edge is clearer here.` : ''}\n\n${analysis.bias_analysis.aligned_trades > 0 ? `HTF Bias: Trading WITH bias wins at ${(analysis.bias_analysis.aligned_win_rate * 100).toFixed(1)}% vs ${(analysis.bias_analysis.misaligned_win_rate * 100).toFixed(1)}% against. Respect the higher timeframe.` : ''}`,
      sentiment: 'neutral',
      tags: ['#Backtesting', '#Patterns'],
    },
    {
      emoji: '🎯', name: 'Nick Fury', role: 'Director', color: '#7c3aed',
      content: `Final assessment:\n\n${analysis.improvement_tips.slice(0, 2).join('\n\n')}\n\n${pnl >= 0 && wr >= 0.5 ? 'Your system has positive expectancy. Focus on execution consistency.' : 'You have an edge to refine. The data is pointing at specific improvements — implement them.'}`,
      sentiment: pnl >= 0 && wr >= 0.5 ? 'positive' : 'neutral',
      tags: ['#Director', '#Strategy'],
    },
  ]
}

function AgentReviewPanel({ analysis }: { analysis: Analysis }) {
  const [expanded, setExpanded] = useState(false)
  const reviews = useMemo(() => buildAgentReview(analysis), [analysis])

  return (
    <div style={{ marginBottom: 10 }}>
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%', border: '1px solid rgba(124,58,237,0.2)',
          borderRadius: 6, padding: '6px 10px',
          background: expanded ? 'rgba(124,58,237,0.08)' : 'rgba(124,58,237,0.03)',
          color: '#a78bfa', fontSize: 9, fontWeight: 700, cursor: 'pointer',
          textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        <span>{expanded ? '▼' : '▶'}</span>
        🛡️ AVENGERS REVIEW YOUR TRADES ({reviews.length} agents)
      </button>
      {expanded && (
        <div style={{ marginTop: 6 }}>
          {reviews.map((r, i) => (
            <div key={i} style={{
              marginBottom: 8, padding: '8px 10px', borderRadius: 6,
              background: 'rgba(255,255,255,0.02)',
              border: `1px solid rgba(255,255,255,0.05)`,
              borderLeft: `3px solid ${r.color}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                <span style={{ fontSize: 16 }}>{r.emoji}</span>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: r.color }}>{r.name}</div>
                  <div style={{ fontSize: 8, color: '#4a5870' }}>{r.role}</div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {r.tags.map((t, j) => (
                    <span key={j} style={{
                      fontSize: 7, color: '#6366f1', background: 'rgba(99,102,241,0.1)',
                      border: '1px solid rgba(99,102,241,0.2)', borderRadius: 3, padding: '1px 4px',
                      fontFamily: 'monospace',
                    }}>{t}</span>
                  ))}
                </div>
              </div>
              <div style={{ fontSize: 9, color: '#9faec0', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {r.content}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function JournalPanel() {
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('Hulk crunching numbers…')
  const [error, setError] = useState<string | null>(null)
  const [section, setSection] = useState<'overview' | 'breakdown' | 'tips' | 'trades'>('overview')
  // Restore preview from localStorage so it survives page refresh
  const [preview, setPreview] = useState<string | null>(() => {
    try { return localStorage.getItem('hulk_preview') } catch { return null }
  })

  // Stable ref so global paste listener always sees latest upload fns
  const uploadScreenshotRef = useRef<(f: File) => Promise<void>>()
  const uploadTextRef = useRef<(t: string, isJSON: boolean) => Promise<void>>()

  // Global Ctrl+V — fires whenever this panel is mounted (journal tab active)
  useEffect(() => {
    const onGlobalPaste = async (e: ClipboardEvent) => {
      // Don't hijack if user is typing in a textarea/input
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT') return

      const items = Array.from(e.clipboardData?.items ?? [])
      const imgItem = items.find(i => i.type.startsWith('image/'))
      if (imgItem) {
        const blob = imgItem.getAsFile()
        if (blob) { await uploadScreenshotRef.current?.(blob); return }
      }
      const textItem = items.find(i => i.type === 'text/plain')
      if (textItem) {
        textItem.getAsString(async (text) => {
          if (text.trim()) {
            const isJSON = text.trim().startsWith('[') || text.trim().startsWith('{')
            await uploadTextRef.current?.(text, isJSON)
          }
        })
      }
    }
    document.addEventListener('paste', onGlobalPaste)
    return () => document.removeEventListener('paste', onGlobalPaste)
  }, [])

  // PasteZone onPaste (React event, same logic)
  const handleReactPaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items)
    const imgItem = items.find(i => i.type.startsWith('image/'))
    if (imgItem) {
      const blob = imgItem.getAsFile()
      if (blob) { await uploadScreenshotRef.current?.(blob); return }
    }
    const textItem = items.find(i => i.type === 'text/plain')
    if (textItem) {
      textItem.getAsString(async (text) => {
        if (text.trim()) {
          const isJSON = text.trim().startsWith('[') || text.trim().startsWith('{')
          await uploadTextRef.current?.(text, isJSON)
        }
      })
    }
  }, [])

  async function handleFile(file: File) {
    setError(null)
    setPreview(null)
    try { localStorage.removeItem('hulk_preview') } catch {}
    if (IMAGE_TYPES.includes(file.type)) {
      await uploadScreenshot(file)
    } else {
      const text = await file.text()
      const isJSON = file.name.endsWith('.json')
      await uploadText(text, isJSON)
    }
  }

  async function uploadScreenshot(file: File) {
    setLoading(true)
    setLoadingMsg('👁️ Claude reading screenshot…')
    try {
      // Read as data URL — inline, no HTTP request, works under any CSP,
      // survives page refresh when persisted. Do NOT use URL.createObjectURL()
      // which produces blob:hostname/uuid — blocked by Vercel's img-src CSP.
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader()
        r.onload = () => res(r.result as string)  // full data:image/...;base64,... string
        r.onerror = rej
        r.readAsDataURL(file)
      })

      // Show immediately (before API round-trip)
      setPreview(dataUrl)
      try {
        // Only persist to localStorage if small enough (<2 MB base64)
        if (dataUrl.length < 2_000_000) localStorage.setItem('hulk_preview', dataUrl)
        else localStorage.removeItem('hulk_preview')
      } catch { /* storage quota exceeded — ignore */ }

      const b64 = dataUrl.split(',')[1]
      const mediaType = file.type === 'image/jpg' ? 'image/jpeg' : file.type

      const resp = await fetch(`${BASE}/journal/screenshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_b64: b64, media_type: mediaType }),
      })
      if (!resp.ok) throw new Error(await resp.text())
      const data = await resp.json()
      if (data.analysis?.status === 'success') {
        setAnalysis(data.analysis)
      } else {
        throw new Error(data.analysis?.error ?? 'No trades found in screenshot')
      }
    } catch (e: any) {
      setError(e.message ?? 'Screenshot upload failed')
    } finally {
      setLoading(false)
    }
  }

  async function uploadText(text: string, isJSON: boolean) {
    setLoading(true)
    setLoadingMsg('💪 Hulk crunching numbers…')
    try {
      let endpoint: string
      let body: string

      if (isJSON) {
        const parsed = JSON.parse(text)
        const trades = Array.isArray(parsed) ? parsed : parsed.trades ?? []
        endpoint = `${BASE}/journal/ingest`
        body = JSON.stringify({ trades })
      } else {
        endpoint = `${BASE}/journal/ingest-csv`
        body = JSON.stringify({ csv_text: text })
      }

      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
      if (!r.ok) throw new Error(await r.text())

      const r2 = await fetch(`${BASE}/journal/analyze`)
      if (!r2.ok) throw new Error(await r2.text())
      const data = await r2.json()
      setAnalysis(data)
    } catch (e: any) {
      setError(e.message ?? 'Upload failed')
    } finally {
      setLoading(false)
    }
  }

  // Keep refs pointing to latest function instances (updated every render)
  uploadScreenshotRef.current = uploadScreenshot
  uploadTextRef.current = uploadText

  const tabBtn = (id: typeof section, label: string) => (
    <button
      key={id}
      onClick={() => setSection(id)}
      style={{
        flex: 1, border: 'none', padding: '5px 2px', fontSize: 8, fontWeight: 700,
        background: section === id ? 'rgba(124,58,237,0.12)' : 'transparent',
        color: section === id ? '#a78bfa' : '#3a4860', cursor: 'pointer',
        borderBottom: section === id ? '2px solid #7c3aed' : '2px solid transparent',
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={{ padding: '10px 10px 0', height: '100%', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 16 }}>💪</span>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#e0e6f0' }}>Hulk Journal Analyzer</div>
          <div style={{ fontSize: 8, color: '#4a5870' }}>Bruce SMASHES your trades for patterns</div>
        </div>
      </div>

      {/* Upload zone */}
      <UploadZone onFile={handleFile} />

      {/* Paste zone — click to focus, then Ctrl+V */}
      <PasteZone onPaste={handleReactPaste} />

      {/* Raw text paste area */}
      <TextPasteArea onSubmit={(text) => {
        const isJSON = text.startsWith('[') || text.startsWith('{')
        uploadText(text, isJSON)
      }} />

      {/* Screenshot preview — full ScreenshotViewer with zoom/pan */}
      {preview && (preview.startsWith('data:') || preview.startsWith('https://')) && (
        <div style={{ marginBottom: 8, borderRadius: 6, overflow: 'hidden',
          border: '1px solid rgba(124,58,237,0.25)', height: 180, flexShrink: 0 }}>
          <ScreenshotViewer
            src={preview}
            alt="journal screenshot"
            compact={true}
          />
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: 16, color: '#a78bfa', fontSize: 10 }}>
          {loadingMsg}
        </div>
      )}

      {error && (
        <div style={{
          padding: '8px 10px', borderRadius: 5, marginBottom: 8,
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
          fontSize: 9, color: '#ef4444',
        }}>
          ❌ {error}
        </div>
      )}

      {!analysis && !loading && (
        <div style={{ textAlign: 'center', padding: '12px 0', color: '#3a4860', fontSize: 9 }}>
          Drop a file · click Paste · or just press Ctrl+V anywhere
        </div>
      )}

      {analysis && analysis.status === 'success' && (
        <>
          {/* Agent review */}
          <AgentReviewPanel analysis={analysis} />

          {/* Section tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: 10 }}>
            {tabBtn('overview',  '📊 Overview')}
            {tabBtn('breakdown', '🔍 Breakdown')}
            {tabBtn('tips',      '💡 Tips')}
            {tabBtn('trades',    '📋 Trades')}
          </div>

          {/* ── Overview ── */}
          {section === 'overview' && (
            <>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <StatCard label="WIN RATE" value={pct(analysis.win_rate)} color={wrColor(analysis.win_rate)} />
                <StatCard label="TOTAL PNL" value={usd(analysis.total_pnl)} color={analysis.total_pnl >= 0 ? '#10b981' : '#ef4444'} />
              </div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                <StatCard label="TRADES" value={String(analysis.total_trades)} sub={`${analysis.wins}W / ${analysis.losses}L`} />
                <StatCard label="AVG PNL" value={usd(analysis.avg_pnl_per_trade)} color={analysis.avg_pnl_per_trade >= 0 ? '#10b981' : '#ef4444'} />
              </div>

              {/* RR bar */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 8, color: '#4a5870', fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>REWARD:RISK</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 4, height: 8, position: 'relative', overflow: 'hidden' }}>
                    <div style={{
                      position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 4,
                      background: analysis.avg_rr_achieved >= analysis.avg_rr_planned * 0.75 ? '#10b981' : '#ef4444',
                      width: `${Math.min(100, (analysis.avg_rr_achieved / Math.max(analysis.avg_rr_planned, 1)) * 100)}%`,
                    }} />
                  </div>
                  <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#a0aec0', whiteSpace: 'nowrap' }}>
                    {analysis.avg_rr_achieved.toFixed(2)} / {analysis.avg_rr_planned.toFixed(2)} planned
                  </span>
                </div>
              </div>

              {/* Bias alignment */}
              {(analysis.bias_analysis.aligned_trades + analysis.bias_analysis.misaligned_trades) > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 8, color: '#4a5870', fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>HTF BIAS ALIGNMENT</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <div style={{
                      flex: 1, padding: '5px 7px', borderRadius: 5,
                      background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)',
                    }}>
                      <div style={{ fontSize: 8, color: '#10b981', fontWeight: 700 }}>WITH BIAS</div>
                      <div style={{ fontSize: 12, color: '#10b981', fontFamily: 'monospace' }}>{pct(analysis.bias_analysis.aligned_win_rate)}</div>
                      <div style={{ fontSize: 8, color: '#4a5870' }}>{analysis.bias_analysis.aligned_trades} trades</div>
                    </div>
                    <div style={{
                      flex: 1, padding: '5px 7px', borderRadius: 5,
                      background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                    }}>
                      <div style={{ fontSize: 8, color: '#ef4444', fontWeight: 700 }}>COUNTER BIAS</div>
                      <div style={{ fontSize: 12, color: '#ef4444', fontFamily: 'monospace' }}>{pct(analysis.bias_analysis.misaligned_win_rate)}</div>
                      <div style={{ fontSize: 8, color: '#4a5870' }}>{analysis.bias_analysis.misaligned_trades} trades</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Confluence buckets */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 8, color: '#4a5870', fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>CONFLUENCE SCORE</div>
                {([
                  { key: 'low_0_2',   label: '0–2 Low',    color: '#ef4444' },
                  { key: 'mid_3_4',   label: '3–4 Mid',    color: '#f5c842' },
                  { key: 'high_5plus',label: '5+ High',    color: '#10b981' },
                ] as const).map(({ key, label, color }) => {
                  const b = analysis.confluence_analysis[key]
                  if (!b || b.trades === 0) return null
                  return (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{ fontSize: 8, color: '#6a7890', minWidth: 40 }}>{label}</span>
                      <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 3, height: 6, overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: color, width: pct(b.win_rate), borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 8, color, minWidth: 32, fontFamily: 'monospace' }}>{pct(b.win_rate)}</span>
                      <span style={{ fontSize: 8, color: '#4a5870' }}>{b.trades}t</span>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* ── Breakdown ── */}
          {section === 'breakdown' && (
            <>
              <BreakdownTable title="BY SESSION" data={analysis.by_session} />
              <BreakdownTable title="BY INSTRUMENT" data={analysis.by_instrument} />
              <BreakdownTable title="BY DIRECTION" data={analysis.by_direction} />
              <BreakdownTable title="BY GENERATING AGENT" data={analysis.by_agent} />
            </>
          )}

          {/* ── Tips ── */}
          {section === 'tips' && (
            <>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 8, color: '#a78bfa', fontWeight: 700, letterSpacing: 0.5, marginBottom: 6 }}>
                  💪 HULK'S IMPROVEMENT PLAYBOOK
                </div>
                {analysis.improvement_tips.map((tip, i) => (
                  <TipBadge key={i} tip={tip} idx={i} />
                ))}
              </div>
              {analysis.best_session && (
                <div style={{
                  padding: '8px 10px', borderRadius: 6, marginBottom: 6,
                  background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)',
                }}>
                  <div style={{ fontSize: 8, color: '#10b981', fontWeight: 700, marginBottom: 2 }}>BEST SESSION</div>
                  <div style={{ fontSize: 13, color: '#10b981', fontFamily: 'monospace' }}>{analysis.best_session}</div>
                  <div style={{ fontSize: 8, color: '#4a5870' }}>
                    {pct(analysis.by_session[analysis.best_session]?.win_rate ?? 0)} win rate
                  </div>
                </div>
              )}
              {analysis.best_instrument && (
                <div style={{
                  padding: '8px 10px', borderRadius: 6,
                  background: 'rgba(245,200,66,0.08)', border: '1px solid rgba(245,200,66,0.2)',
                }}>
                  <div style={{ fontSize: 8, color: '#f5c842', fontWeight: 700, marginBottom: 2 }}>BEST PAIR</div>
                  <div style={{ fontSize: 13, color: '#f5c842', fontFamily: 'monospace' }}>{analysis.best_instrument}</div>
                  <div style={{ fontSize: 8, color: '#4a5870' }}>
                    {pct(analysis.by_instrument[analysis.best_instrument]?.win_rate ?? 0)} win rate
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Recent Trades ── */}
          {section === 'trades' && (
            <>
              <div style={{ fontSize: 8, color: '#4a5870', fontWeight: 700, letterSpacing: 0.5, marginBottom: 6 }}>
                RECENT TRADES (last {analysis.recent_trades.length})
              </div>
              {analysis.recent_trades.length === 0 && (
                <div style={{ fontSize: 9, color: '#4a5870', textAlign: 'center', padding: 12 }}>No trades</div>
              )}
              {[...analysis.recent_trades].reverse().map((t, i) => (
                <RecentTrade key={i} t={t} />
              ))}
            </>
          )}
        </>
      )}
    </div>
  )
}
