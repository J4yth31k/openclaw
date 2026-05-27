import { useSimStore } from '../store'
import type { EtsyProduct } from '../types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function usd(n: number, sign = false) {
  const abs = Math.abs(n)
  const s   = n < 0 ? '-' : (sign && n > 0 ? '+' : '')
  return `${s}$${abs.toFixed(2)}`
}

function plColor(n: number) { return n >= 0 ? '#10b981' : '#ef4444' }

function Stars({ rating, size = 10 }: { rating: number; size?: number }) {
  const full  = Math.floor(rating)
  const half  = rating - full >= 0.5
  const empty = 5 - full - (half ? 1 : 0)
  return (
    <span style={{ fontSize: size, color: '#f5c842', letterSpacing: 1 }}>
      {'★'.repeat(full)}{half ? '½' : ''}{'☆'.repeat(empty)}
    </span>
  )
}

// ── Pipeline funnel ───────────────────────────────────────────────────────────

const STAGE_LABELS: Record<EtsyProduct['stage'], { label: string; color: string; icon: string }> = {
  idea:    { label: 'Idea',    color: '#6366f1', icon: '💡' },
  design:  { label: 'Design',  color: '#ec4899', icon: '✏️' },
  qc:      { label: 'QC',      color: '#f59e0b', icon: '🔍' },
  listing: { label: 'Listing', color: '#06b6d4', icon: '📦' },
  selling: { label: 'Selling', color: '#10b981', icon: '🛒' },
}

function PipelineBar({ product }: { product: EtsyProduct }) {
  const s = STAGE_LABELS[product.stage]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ fontSize: 11 }}>{s.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 9, color: '#e0e0e0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {product.name}
        </div>
        {product.stage !== 'selling' && product.stage !== 'idea' && (
          <div style={{ marginTop: 2, background: '#1a1c28', borderRadius: 2, height: 3, overflow: 'hidden' }}>
            <div style={{ width: `${product.stageProgress}%`, height: '100%', background: s.color, transition: 'width 0.6s ease' }} />
          </div>
        )}
      </div>
      <div style={{ fontSize: 8, color: s.color, fontWeight: 700, fontFamily: 'monospace', flexShrink: 0 }}>
        {s.label.toUpperCase()}
        {product.stage !== 'selling' && product.stage !== 'idea'
          ? ` ${Math.round(product.stageProgress)}%`
          : product.trend === 'hot' ? ' 🔥' : ''}
      </div>
    </div>
  )
}

// ── Top product row ───────────────────────────────────────────────────────────

function ProductRow({ product, rank }: { product: EtsyProduct; rank: number }) {
  const maxSales = 200
  const barW = Math.min(100, (product.salesCount / maxSales) * 100)

  return (
    <div style={{ padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 9, color: '#3a4060', fontFamily: 'monospace', width: 14 }}>#{rank}</span>
        <div style={{ flex: 1, minWidth: 0, marginLeft: 4 }}>
          <div style={{ fontSize: 9, color: '#d0d8e8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {product.name}
            {product.trend === 'hot'     && ' 🔥'}
            {product.trend === 'cooling' && ' 📉'}
          </div>
          <div style={{ fontSize: 8, color: '#4a5870' }}>{product.category}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 6 }}>
          <div style={{ fontSize: 9, color: '#10b981', fontFamily: 'monospace', fontWeight: 700 }}>
            {usd(product.revenue)}
          </div>
          <div style={{ fontSize: 8, color: '#4a5870' }}>{product.salesCount} sales · ${product.price.toFixed(2)}</div>
        </div>
      </div>
      {/* Mini sales bar */}
      <div style={{ marginTop: 3, background: 'rgba(255,255,255,0.04)', borderRadius: 2, height: 3, overflow: 'hidden' }}>
        <div style={{ width: `${barW}%`, height: '100%', background: product.trend === 'hot' ? '#f59e0b' : '#10b981', transition: 'width 0.6s' }} />
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function ProfitPanel() {
  const creative  = useSimStore(s => s.creative)
  const trading   = useSimStore(s => s.trading)
  const total     = useSimStore(s => s.totalCash)
  const agents    = useSimStore(s => s.agents)

  const activeTasks   = agents.filter(a => a.state === 'working' || a.state === 'on_break').length
  const products      = creative.products ?? []
  const sellingCount  = products.filter(p => p.stage === 'selling').length
  const pipelineItems = products.filter(p => p.stage !== 'selling')
  const topSellers    = products
    .filter(p => p.stage === 'selling')
    .sort((a, b) => b.salesCount - a.salesCount)
    .slice(0, 6)

  return (
    <div style={{
      width: '100%', background: 'rgba(10,12,20,0.98)',
      padding: '10px 10px', overflowY: 'auto',
      fontSize: 11, color: '#c8ccd8',
      display: 'flex', flexDirection: 'column', gap: 0,
    }}>

      {/* ── Shop header ──────────────────────────────────────────────────── */}
      <div style={{
        textAlign: 'center', padding: '8px 0 10px',
        borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 8,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#f97316' }}>🧶 OpenClaw Crafts</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 3 }}>
          <Stars rating={creative.shopRating} size={11} />
          <span style={{ fontSize: 9, color: '#9aa0b0' }}>
            {creative.shopRating.toFixed(1)} · {creative.totalReviews} reviews
          </span>
        </div>
        {/* Star Seller progress */}
        <div style={{ marginTop: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#4a5870', marginBottom: 2 }}>
            <span>⭐ Star Seller</span>
            <span style={{ color: creative.starSellerPct >= 100 ? '#f5c842' : '#4a5870' }}>
              {creative.starSellerPct >= 100 ? '✓ EARNED' : `${creative.starSellerPct}%`}
            </span>
          </div>
          <div style={{ background: '#1a1c28', borderRadius: 3, height: 5, overflow: 'hidden' }}>
            <div style={{ width: `${creative.starSellerPct}%`, height: '100%', background: creative.starSellerPct >= 100 ? '#f5c842' : '#6366f1', transition: 'width 0.8s' }} />
          </div>
        </div>
      </div>

      {/* ── Trending niche ───────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '5px 8px', borderRadius: 6, marginBottom: 8,
        background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
      }}>
        <span style={{ fontSize: 10 }}>🔥</span>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 9, color: '#f59e0b', fontWeight: 600 }}>TRENDING: </span>
          <span style={{ fontSize: 9, color: '#e0d8c8' }}>{creative.currentTrend}</span>
        </div>
        <span style={{ fontSize: 8, color: '#f59e0b', fontFamily: 'monospace' }}>×{creative.trendMultiplier.toFixed(1)}</span>
      </div>

      {/* ── Revenue stats ────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 8 }}>
        {[
          { label: 'Total Cash',    value: usd(total),                         color: '#f5c842' },
          { label: 'Etsy Revenue',  value: usd(creative.lifetimeProfit),       color: '#10b981' },
          { label: 'Today Rev',     value: usd(creative.dailyRevenue),         color: plColor(creative.dailyRevenue) },
          { label: 'Today Profit',  value: usd(creative.dailyProfit, true),    color: plColor(creative.dailyProfit) },
          { label: 'Total Sales',   value: creative.mockSales.toString(),      color: '#c8ccd8' },
          { label: 'Live Listings', value: sellingCount.toString(),            color: '#10b981' },
        ].map(s => (
          <div key={s.label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 5, padding: '5px 7px' }}>
            <div style={{ fontSize: 8, color: '#4a5870', marginBottom: 1 }}>{s.label}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: s.color, fontFamily: 'monospace' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Product pipeline ─────────────────────────────────────────────── */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 9, color: '#4a5870', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 5 }}>
          📦 Pipeline ({pipelineItems.length} in progress)
        </div>
        {pipelineItems.length === 0 ? (
          <div style={{ fontSize: 9, color: '#2a3040', textAlign: 'center', padding: '6px 0' }}>
            All products live — Reya is finding new ideas…
          </div>
        ) : (
          pipelineItems.map(p => <PipelineBar key={p.id} product={p} />)
        )}
      </div>

      {/* ── Top sellers ──────────────────────────────────────────────────── */}
      {topSellers.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 9, color: '#4a5870', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 5 }}>
            🏆 Top Sellers
          </div>
          {topSellers.map((p, i) => <ProductRow key={p.id} product={p} rank={i + 1} />)}
        </div>
      )}

      {/* ── Trading office ───────────────────────────────────────────────── */}
      <div>
        <div style={{ fontSize: 9, color: '#4a5870', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 5 }}>
          📈 Trading Desk
        </div>
        {[
          { label: 'Balance',    value: usd(trading.accountBalance),             color: '#f5c842' },
          { label: 'Daily P/L',  value: usd(trading.dailyPL, true),              color: plColor(trading.dailyPL) },
          { label: 'Win Rate',   value: `${trading.winRate}%`,                   color: trading.winRate >= 55 ? '#10b981' : '#f59e0b' },
          { label: 'Drawdown',   value: `${trading.drawdown.toFixed(1)}%`,       color: trading.drawdown > 10 ? '#ef4444' : '#6a7888' },
          { label: 'Market',     value: trading.marketMood.toUpperCase(),        color: trading.marketMood === 'bullish' ? '#10b981' : trading.marketMood === 'bearish' ? '#ef4444' : '#6a7888' },
        ].map(s => (
          <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: 10, color: '#4a5870' }}>{s.label}</span>
            <span style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 600, color: s.color }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#2a3040' }}>
        <span>{activeTasks} agents working</span>
        <span>{sellingCount} live listings</span>
      </div>
    </div>
  )
}
