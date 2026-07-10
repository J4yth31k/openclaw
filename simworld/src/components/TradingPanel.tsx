import { useState } from 'react'
import { useSimStore } from '../store'
import type { InstrumentAnalysis, PriceLevel, LevelType } from '../engine/MarketData'

// ── Level styling ─────────────────────────────────────────────────────────────

const LEVEL_STYLE: Record<LevelType, { label: string; color: string }> = {
  POC:         { label: 'POC',    color: '#f5c842' },
  VAH:         { label: 'VAH',    color: '#e0a838' },
  VAL:         { label: 'VAL',    color: '#e0a838' },
  HVN:         { label: 'HVN',    color: '#a855f7' },
  LVN:         { label: 'LVN',    color: '#7a6a9a' },
  EQH:         { label: 'BSL',    color: '#ef4444' },
  EQL:         { label: 'SSL',    color: '#10b981' },
  SessionHigh: { label: 'S-HIGH', color: '#ef4444' },
  SessionLow:  { label: 'S-LOW',  color: '#10b981' },
  Round:       { label: 'RND',    color: '#5a6a80' },
}

function fmtAge(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

// ── Level row ─────────────────────────────────────────────────────────────────

function LevelRow({ level, price }: { level: PriceLevel; price: number }) {
  const st = LEVEL_STYLE[level.type]
  const distPct = ((level.price - price) / price) * 100
  const above = level.price >= price

  return (
    <div
      title={level.note}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '3px 6px', borderRadius: 5,
        background: 'rgba(255,255,255,0.025)',
        marginBottom: 2, fontSize: 10,
      }}
    >
      <span style={{
        fontSize: 7.5, fontWeight: 800, letterSpacing: 0.5,
        color: st.color, background: `${st.color}18`,
        border: `1px solid ${st.color}40`,
        borderRadius: 4, padding: '1px 5px', width: 44, textAlign: 'center', flexShrink: 0,
      }}>
        {st.label}
      </span>
      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#e0e6f0' }}>
        {level.price.toFixed(2)}
      </span>
      {/* Strength pips */}
      <span style={{ display: 'flex', gap: 1.5 }}>
        {Array.from({ length: level.strength }, (_, i) => (
          <span key={i} style={{ width: 3, height: 3, borderRadius: '50%', background: st.color, opacity: 0.8 }} />
        ))}
      </span>
      <span style={{
        marginLeft: 'auto', fontFamily: 'monospace', fontSize: 9,
        color: above ? '#e08a8a' : '#7ec87e',
      }}>
        {above ? '+' : ''}{distPct.toFixed(2)}%
      </span>
    </div>
  )
}

// ── Instrument card ───────────────────────────────────────────────────────────

function InstrumentCard({ a }: { a: InstrumentAnalysis }) {
  const up = a.changePct >= 0
  const above = a.levels.filter(l => l.price >= a.price)
  const below = a.levels.filter(l => l.price < a.price)

  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 10, padding: 10,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: '#e0e6f0' }}>{a.symbol}</span>
        <span style={{ fontSize: 8, color: '#5a6a80' }}>via {a.proxySymbol}</span>
        <span style={{
          marginLeft: 'auto', fontFamily: 'monospace', fontSize: 13, fontWeight: 700,
          color: up ? '#2ecc71' : '#e74c3c',
        }}>
          {a.price.toFixed(2)}
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 9, color: up ? '#2ecc71' : '#e74c3c' }}>
          {up ? '▲' : '▼'} {Math.abs(a.changePct).toFixed(2)}%
        </span>
      </div>

      {/* Levels above price */}
      <div style={{ fontSize: 7.5, color: '#5a6a80', fontWeight: 700, letterSpacing: 1, margin: '4px 0 3px' }}>
        ABOVE — resistance / buy-side liquidity
      </div>
      {above.map((l, i) => <LevelRow key={`a${i}`} level={l} price={a.price} />)}

      {/* Current price divider */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, margin: '5px 0',
      }}>
        <div style={{ flex: 1, height: 1, background: 'rgba(0,212,255,0.4)' }} />
        <span style={{ fontFamily: 'monospace', fontSize: 9, fontWeight: 800, color: '#00d4ff' }}>
          ● {a.price.toFixed(2)}
        </span>
        <div style={{ flex: 1, height: 1, background: 'rgba(0,212,255,0.4)' }} />
      </div>

      {/* Levels below price */}
      <div style={{ fontSize: 7.5, color: '#5a6a80', fontWeight: 700, letterSpacing: 1, margin: '4px 0 3px' }}>
        BELOW — support / sell-side liquidity
      </div>
      {below.map((l, i) => <LevelRow key={`b${i}`} level={l} price={a.price} />)}

      {/* Team observations */}
      {a.observations.length > 0 && (
        <div style={{ marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 6 }}>
          <div style={{ fontSize: 7.5, color: '#5a6a80', fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>
            TEAM NOTES
          </div>
          {a.observations.map((o, i) => (
            <div key={i} style={{ fontSize: 9, color: '#9ab0c8', lineHeight: 1.5, marginBottom: 3 }}>
              · {o}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function TradingPanel() {
  const market = useSimStore(s => s.market)
  const setKey = useSimStore(s => s.setMarketApiKey)
  const refresh = useSimStore(s => s.refreshMarket)
  const [keyDraft, setKeyDraft] = useState(market.apiKey)
  const [showSettings, setShowSettings] = useState(!market.apiKey)

  const instruments = Object.values(market.instruments)
  const live = instruments.some(i => i.source === 'live')

  return (
    <div style={{
      padding: 10, display: 'flex', flexDirection: 'column', gap: 10,
      fontSize: 11, color: '#c8ccd8',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 800, fontSize: 12, color: '#e0e6f0' }}>📐 Market Levels</span>
        <span style={{
          fontSize: 7.5, fontWeight: 800, letterSpacing: 0.5,
          padding: '2px 6px', borderRadius: 4,
          background: live ? 'rgba(16,185,129,0.15)' : 'rgba(245,166,35,0.12)',
          color: live ? '#10b981' : '#f5a623',
          border: `1px solid ${live ? 'rgba(16,185,129,0.4)' : 'rgba(245,166,35,0.35)'}`,
        }}>
          {live ? '● LIVE' : '◌ SIM'}
        </span>
        <button
          onClick={() => void refresh()}
          disabled={market.fetching}
          style={{
            marginLeft: 'auto', background: 'rgba(0,212,255,0.08)',
            border: '1px solid rgba(0,212,255,0.3)', borderRadius: 5,
            color: '#00d4ff', fontSize: 9, fontWeight: 700, padding: '3px 8px',
            cursor: market.fetching ? 'wait' : 'pointer', opacity: market.fetching ? 0.5 : 1,
          }}
        >
          {market.fetching ? '…' : '⟳ Refresh'}
        </button>
        <button
          onClick={() => setShowSettings(v => !v)}
          style={{
            background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 5, color: '#6a7890', fontSize: 9, padding: '3px 7px', cursor: 'pointer',
          }}
        >
          ⚙
        </button>
      </div>

      {/* Settings */}
      {showSettings && (
        <div style={{
          background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.15)',
          borderRadius: 8, padding: 9, display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <div style={{ fontSize: 9, color: '#8892a4', lineHeight: 1.5 }}>
            For <b style={{ color: '#10b981' }}>live prices</b>, paste a free API key from{' '}
            <a href="https://twelvedata.com/pricing" target="_blank" rel="noreferrer" style={{ color: '#00d4ff' }}>
              twelvedata.com
            </a>. NQ/ES are tracked via QQQ/SPY (futures feeds are licensed; the ETFs mirror them closely).
            Without a key you get a realistic simulation, clearly marked SIM.
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={keyDraft}
              onChange={e => setKeyDraft(e.target.value)}
              placeholder="Twelve Data API key…"
              type="password"
              style={{
                flex: 1, background: 'rgba(0,0,0,0.35)',
                border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6,
                color: '#e0e6f0', fontSize: 10, padding: '6px 8px', outline: 'none',
              }}
            />
            <button
              onClick={() => { setKey(keyDraft); setShowSettings(false) }}
              style={{
                background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)',
                borderRadius: 6, color: '#10b981', fontSize: 9, fontWeight: 700,
                padding: '6px 10px', cursor: 'pointer',
              }}
            >
              Save
            </button>
          </div>
          {market.lastError && (
            <div style={{ fontSize: 9, color: '#e74c3c' }}>⚠ {market.lastError}</div>
          )}
        </div>
      )}

      {/* Instruments */}
      {instruments.length === 0 ? (
        <div style={{ color: '#4a5060', fontSize: 10, textAlign: 'center', padding: 20 }}>
          Loading market analysis…
        </div>
      ) : (
        instruments.map(a => <InstrumentCard key={a.symbol} a={a} />)
      )}

      {instruments.length > 0 && (
        <div style={{ fontSize: 8, color: '#3a4658', textAlign: 'center' }}>
          Updated {fmtAge(instruments[0].updatedAt)} · analysis only — no signals, no advice
        </div>
      )}
    </div>
  )
}
