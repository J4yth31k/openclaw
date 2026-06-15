import { useState, useEffect, useCallback } from 'react'

const BASE: string = (import.meta as any).env?.VITE_RAILWAY_URL ?? ''

interface Article {
  id: number
  headline: string
  summary: string
  source: string
  url: string
  image?: string
  category: string
  datetime: number
  related: string
}

function timeAgo(unix: number): string {
  const s = Math.floor(Date.now() / 1000 - unix)
  if (s < 60)    return `${s}s ago`
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function headlineColor(h: string): string {
  const t = h.toLowerCase()
  if (/crash|plunge|tumble|falls?|drops?|slump|bear|loss|sell.?off/.test(t)) return '#ef4444'
  if (/surge|rally|gains?|rises?|soar|bull|record|jump/.test(t))             return '#10b981'
  if (/fed|fomc|rate|inflation|cpi|pce|powell|treasury/.test(t))             return '#f59e0b'
  return '#94a3b8'
}

function CategoryChip({ label }: { label: string }) {
  return (
    <span style={{
      background: 'rgba(148,163,184,0.12)', color: '#64748b',
      border: '1px solid rgba(148,163,184,0.2)',
      borderRadius: 20, padding: '1px 7px', fontSize: 8, fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: 0.6, whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

function ArticleCard({ article, accent }: { article: Article; accent: string }) {
  const color = headlineColor(article.headline)
  const ago   = article.datetime ? timeAgo(article.datetime) : ''

  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ textDecoration: 'none', display: 'block' }}
    >
      <div style={{
        background: 'rgba(255,255,255,0.025)',
        border: `1px solid rgba(255,255,255,0.06)`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 8,
        padding: '10px 12px',
        transition: 'background 0.15s, border-color 0.15s',
        cursor: 'pointer',
      }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          {article.image && (
            <img
              src={article.image}
              alt=""
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              style={{ width: 52, height: 38, objectFit: 'cover', borderRadius: 5, flexShrink: 0 }}
            />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#d0d8e8', lineHeight: 1.4, marginBottom: 4 }}>
              {article.headline}
            </div>
            {article.summary && (
              <div style={{
                fontSize: 9, color: '#5a6880', lineHeight: 1.5,
                display: '-webkit-box', WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical', overflow: 'hidden',
              }}>
                {article.summary}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 8, color: '#3a4858' }}>{ago}</span>
              <span style={{ fontSize: 8, color: '#3a4858' }}>·</span>
              <span style={{ fontSize: 8, color: accent, fontWeight: 600 }}>{article.source}</span>
              {article.related && <CategoryChip label={article.related} />}
            </div>
          </div>
        </div>
      </div>
    </a>
  )
}

export default function NewsPanel({ accent }: { accent: string }) {
  const [articles, setArticles]     = useState<Article[]>([])
  const [loading,  setLoading]      = useState(false)
  const [error,    setError]        = useState<string | null>(null)
  const [noKey,    setNoKey]        = useState(false)
  const [lastFetch, setLastFetch]   = useState<Date | null>(null)

  const fetchNews = useCallback(async () => {
    if (!BASE) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${BASE}/news?limit=30`)
      if (res.status === 503) { setNoKey(true); setLoading(false); return }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setArticles(data.articles ?? [])
      setLastFetch(new Date())
      setNoKey(false)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchNews()
    const id = setInterval(fetchNews, 3 * 60 * 1000)
    return () => clearInterval(id)
  }, [fetchNews])

  // ── No Railway URL ─────────────────────────────────────────────────────────
  if (!BASE) {
    return (
      <div style={{
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12, padding: 20, textAlign: 'center',
      }}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>📰</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#d0d8e8', marginBottom: 6 }}>
          Live Futures News
        </div>
        <div style={{ fontSize: 10, color: '#4a5568', marginBottom: 16 }}>
          Set <code style={{ color: '#f59e0b' }}>VITE_RAILWAY_URL</code> in <code>simworld/.env.local</code> to enable
        </div>
      </div>
    )
  }

  // ── No API key configured ──────────────────────────────────────────────────
  if (noKey) {
    return (
      <div style={{
        background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)',
        borderRadius: 12, padding: 20,
      }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>🔑</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', marginBottom: 8 }}>
          Finnhub API Key Required
        </div>
        <div style={{ fontSize: 10, color: '#a08060', lineHeight: 1.6, marginBottom: 12 }}>
          1. Sign up free at <span style={{ color: '#f59e0b' }}>finnhub.io</span><br />
          2. Copy your API key from the dashboard<br />
          3. Add to Railway: <code style={{ color: '#f59e0b' }}>FINNHUB_API_KEY=your_key_here</code><br />
          4. Redeploy — news loads automatically
        </div>
        <div style={{ fontSize: 9, color: '#6b5030' }}>
          Free tier: 60 calls/min · General market news · No credit card needed
        </div>
      </div>
    )
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error && articles.length === 0) {
    return (
      <div style={{
        background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
        borderRadius: 10, padding: 16, textAlign: 'center',
      }}>
        <div style={{ fontSize: 11, color: '#ef4444', marginBottom: 8 }}>News fetch error: {error}</div>
        <button
          onClick={fetchNews}
          style={{
            background: `${accent}20`, border: `1px solid ${accent}40`,
            color: accent, borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 10,
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loading && articles.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} style={{
            background: 'rgba(255,255,255,0.025)', borderRadius: 8, padding: '12px',
            height: 64, opacity: 1 - i * 0.12,
          }}>
            <div style={{ height: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 4, marginBottom: 8, width: `${70 + i * 5}%` }} />
            <div style={{ height: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 4, width: '50%' }} />
          </div>
        ))}
      </div>
    )
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        <div style={{ fontSize: 9, color: '#3a4858', flex: 1 }}>
          {lastFetch ? `Updated ${timeAgo(Math.floor(lastFetch.getTime() / 1000))}` : 'Loading…'}
          {' · auto-refreshes every 3 min'}
        </div>
        <button
          onClick={fetchNews}
          disabled={loading}
          style={{
            background: `${accent}15`, border: `1px solid ${accent}30`,
            color: loading ? '#3a4858' : accent, borderRadius: 5, padding: '3px 10px',
            cursor: loading ? 'not-allowed' : 'pointer', fontSize: 9, fontWeight: 600,
          }}
        >
          {loading ? '…' : '↻ Refresh'}
        </button>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 2 }}>
        {[
          { color: '#10b981', label: 'Bullish' },
          { color: '#ef4444', label: 'Bearish' },
          { color: '#f59e0b', label: 'Macro / Fed' },
          { color: '#94a3b8', label: 'Neutral' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
            <span style={{ fontSize: 8, color: '#3a4858' }}>{label}</span>
          </div>
        ))}
      </div>

      {articles.length === 0 && !loading && (
        <div style={{ fontSize: 10, color: '#3a4858', fontStyle: 'italic', padding: '12px 0' }}>
          No news articles matched futures keywords — check back soon.
        </div>
      )}

      {articles.map(a => (
        <ArticleCard key={a.id} article={a} accent={accent} />
      ))}
    </div>
  )
}
