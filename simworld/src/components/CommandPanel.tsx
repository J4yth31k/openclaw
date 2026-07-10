import { useState, useEffect } from 'react'
import { useSimStore } from '../store'

// ── Mock signal data ──────────────────────────────────────────────────────────

const PAIRS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD', 'BTC/USD', 'ETH/USD']

interface MockSignal {
  id: string
  pair: string
  action: 'BUY' | 'SELL'
  price: number
  rsi: number
  confluence: string
  session: string
  agent: string
  time: string
}

function genPrice(pair: string): number {
  const base: Record<string, number> = {
    'EUR/USD': 1.0842, 'GBP/USD': 1.2640, 'USD/JPY': 149.85,
    'XAU/USD': 4721.0, 'BTC/USD': 80660, 'ETH/USD': 2302,
  }
  const p = base[pair] ?? 1.0
  return p + (Math.random() - 0.5) * p * 0.002
}

const CONFLUENCES = [
  '5/6 (SMA|MACD|ST|STOCH|ADX)', '4/6 (SMA|RSI|MACD|ST)',
  '6/6 (SMA|MACD|ST|STOCH|ADX|EMA)', '3/5 (RSI|MACD|ADX)',
  '4/5 (SMA|ST|STOCH|EMA)',
]

const SESSIONS = ['NEW_YORK', 'LONDON', 'TOKYO', 'LONDON+NEW_YORK']

let sigCounter = 0

function makeSignal(): MockSignal {
  const pair = PAIRS[Math.floor(Math.random() * PAIRS.length)]
  const action = Math.random() > 0.48 ? 'BUY' : 'SELL'
  const agents = ['Vera', 'Marlow', 'Nova', 'Sana', 'Cole']
  return {
    id: `sig-${++sigCounter}`,
    pair,
    action,
    price: genPrice(pair),
    rsi: 30 + Math.random() * 40,
    confluence: CONFLUENCES[Math.floor(Math.random() * CONFLUENCES.length)],
    session: SESSIONS[Math.floor(Math.random() * SESSIONS.length)],
    agent: agents[Math.floor(Math.random() * agents.length)],
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  }
}

const PAIR_PRICES: Record<string, number> = {
  'EUR/USD': 1.0842, 'GBP/USD': 1.2640, 'USD/JPY': 149.85,
  'XAU/USD': 4721.0, 'BTC/USD': 80660,  'ETH/USD': 2302,
}
const PAIR_CHANGE: Record<string, number> = {
  'EUR/USD': +0.12, 'GBP/USD': -0.08, 'USD/JPY': +0.34,
  'XAU/USD': +1.2,  'BTC/USD': -0.45, 'ETH/USD': +2.1,
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CommandPanel() {
  const trading = useSimStore(s => s.trading)
  const [signals, setSignals] = useState<MockSignal[]>(() => [makeSignal(), makeSignal(), makeSignal()])
  const [prices, setPrices] = useState({ ...PAIR_PRICES })
  const [tab, setTab] = useState<'signals' | 'market' | 'agents'>('signals')

  // Simulate incoming signals every 18–30s
  useEffect(() => {
    const tick = () => {
      if (Math.random() < 0.45) {
        setSignals(prev => [makeSignal(), ...prev].slice(0, 20))
      }
      // Drift prices
      setPrices(prev => {
        const next = { ...prev }
        for (const pair of PAIRS) {
          const drift = (Math.random() - 0.499) * (next[pair] * 0.0005)
          next[pair] = +(next[pair] + drift).toFixed(pair.includes('JPY') ? 2 : 4)
        }
        return next
      })
    }
    const id = setInterval(tick, 5000)
    return () => clearInterval(id)
  }, [])

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, border: 'none', padding: '6px 4px',
    background: active ? 'rgba(0,212,255,0.08)' : 'transparent',
    color: active ? '#00d4ff' : '#4a5870',
    fontSize: 9, fontWeight: active ? 700 : 400, cursor: 'pointer',
    borderBottom: active ? '2px solid #00d4ff' : '2px solid transparent',
  })

  const moodColor: Record<string, string> = {
    bullish: '#10b981', bearish: '#ef4444', neutral: '#6a7888', volatile: '#f59e0b'
  }

  return (
    <div style={{
      width: '100%', background: 'rgba(2,4,8,0.99)',
      fontSize: 11, color: '#c8ccd8',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '8px 10px 6px',
        borderBottom: '1px solid rgba(0,212,255,0.12)',
        background: 'rgba(0,212,255,0.03)',
      }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: '#00d4ff', letterSpacing: 2, fontFamily: 'monospace' }}>
          ⚡ COMMAND CENTER
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', animation: 'pulse 2s infinite' }} />
          <span style={{ fontSize: 9, color: '#10b981', fontFamily: 'monospace' }}>SIMULATED</span>
          <span style={{ fontSize: 9, color: '#3a5870', fontFamily: 'monospace', marginLeft: 8 }}>
            {signals.length} signals
          </span>
        </div>
      </div>

      {/* Market mood banner */}
      <div style={{
        padding: '5px 10px',
        background: `${moodColor[trading.marketMood]}11`,
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: 9, color: '#3a5070' }}>MARKET</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: moodColor[trading.marketMood], fontFamily: 'monospace' }}>
          {trading.marketMood.toUpperCase()} {trading.marketMood === 'bullish' ? '🐂' : trading.marketMood === 'bearish' ? '🐻' : '⚡'}
        </span>
        <span style={{ fontSize: 9, color: '#3a5070' }}>
          P/L: <span style={{ color: trading.dailyPL >= 0 ? '#10b981' : '#ef4444' }}>
            {trading.dailyPL >= 0 ? '+' : ''}${trading.dailyPL.toFixed(0)}
          </span>
        </span>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
        <button style={tabStyle(tab === 'signals')} onClick={() => setTab('signals')}>📡 SIGNALS</button>
        <button style={tabStyle(tab === 'market')}  onClick={() => setTab('market')}>💹 MARKET</button>
        <button style={tabStyle(tab === 'agents')}  onClick={() => setTab('agents')}>🤖 AGENTS</button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>

        {/* ── Signals tab ────────────────────────────────────────────────── */}
        {tab === 'signals' && (
          <div>
            {signals.length === 0 && (
              <div style={{ color: '#3a4050', fontSize: 10, textAlign: 'center', marginTop: 16 }}>
                Waiting for signals…
              </div>
            )}
            {signals.map(sig => (
              <div key={sig.id} style={{
                borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)',
                background: sig.action === 'BUY' ? 'rgba(16,185,129,0.05)' : 'rgba(239,68,68,0.05)',
                padding: '7px 8px', marginBottom: 5,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 800, padding: '1px 7px', borderRadius: 3,
                      background: sig.action === 'BUY' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                      color: sig.action === 'BUY' ? '#10b981' : '#ef4444',
                      border: `1px solid ${sig.action === 'BUY' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                      fontFamily: 'monospace',
                    }}>{sig.action}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#e0e6f0' }}>{sig.pair}</span>
                  </div>
                  <span style={{ fontSize: 9, color: '#3a5060', fontFamily: 'monospace' }}>{sig.time}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#5a6878' }}>
                  <span>🎯 <span style={{ color: '#c8ccd8' }}>{sig.confluence}</span></span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#5a6878', marginTop: 3 }}>
                  <span>📊 RSI: <span style={{ color: sig.rsi > 65 ? '#ef4444' : sig.rsi < 35 ? '#10b981' : '#c8ccd8' }}>{sig.rsi.toFixed(1)}</span></span>
                  <span>💵 {sig.price.toFixed(sig.pair.includes('JPY') ? 2 : 4)}</span>
                  <span>🌐 {sig.session}</span>
                </div>
                <div style={{ fontSize: 8, color: '#3a4858', marginTop: 3 }}>via {sig.agent}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Market tab ─────────────────────────────────────────────────── */}
        {tab === 'market' && (
          <div>
            <div style={{ fontSize: 9, color: '#3a5060', letterSpacing: 1, marginBottom: 6, fontFamily: 'monospace' }}>
              LIVE PRICES (SIMULATED)
            </div>
            {PAIRS.map(pair => {
              const chg = PAIR_CHANGE[pair] ?? 0
              const price = prices[pair] ?? 0
              const dec = pair.includes('JPY') ? 2 : pair.includes('BTC') || pair.includes('ETH') || pair.includes('XAU') ? 2 : 4
              return (
                <div key={pair} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '5px 4px', borderBottom: '1px solid rgba(255,255,255,0.03)',
                }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#b0b8c8', width: 70 }}>{pair}</span>
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#e0e6f0' }}>{price.toFixed(dec)}</span>
                  <span style={{ fontSize: 9, fontFamily: 'monospace', color: chg >= 0 ? '#10b981' : '#ef4444', width: 45, textAlign: 'right' }}>
                    {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%
                  </span>
                </div>
              )
            })}

            <div style={{ marginTop: 10, padding: '7px 8px', borderRadius: 6, border: '1px solid rgba(0,212,255,0.1)', background: 'rgba(0,212,255,0.03)' }}>
              <div style={{ fontSize: 9, color: '#3a5060', marginBottom: 4 }}>TRADING DESK</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, fontFamily: 'monospace' }}>
                <span style={{ color: '#5a6878' }}>Balance</span>
                <span style={{ color: '#f5c842' }}>${trading.accountBalance.toFixed(0)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, fontFamily: 'monospace', marginTop: 2 }}>
                <span style={{ color: '#5a6878' }}>Win Rate</span>
                <span style={{ color: trading.winRate >= 55 ? '#10b981' : '#f59e0b' }}>{trading.winRate}%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, fontFamily: 'monospace', marginTop: 2 }}>
                <span style={{ color: '#5a6878' }}>Open Trades</span>
                <span style={{ color: '#c8ccd8' }}>{trading.openTrades}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Agents tab ─────────────────────────────────────────────────── */}
        {tab === 'agents' && (
          <div>
            <div style={{ fontSize: 9, color: '#3a5060', letterSpacing: 1, marginBottom: 6, fontFamily: 'monospace' }}>
              AGENT NETWORK
            </div>
            {[
              { name: 'Vera',           emoji: '📊', role: 'Volume Profile',  status: 'MAPPING',  color: '#a855f7', conf: '—' },
              { name: 'Marlow',         emoji: '💧', role: 'Liquidity Map',   status: 'MARKING',  color: '#06b6d4', conf: '—'   },
              { name: 'Nova',           emoji: '📰', role: 'News & Macro',    status: 'READING',  color: '#f97316', conf: '—'   },
              { name: 'Sana',           emoji: '🕐', role: 'Session Timing',  status: 'TIMING',   color: '#10b981', conf: '—'   },
              { name: 'Cole',           emoji: '🧭', role: 'Structure',       status: 'CHARTING', color: '#4a6cf7', conf: '—'   },
            ].map(ag => (
              <div key={ag.name} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 4px', borderBottom: '1px solid rgba(255,255,255,0.025)',
              }}>
                <span style={{ fontSize: 14 }}>{ag.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: ag.color }}>{ag.name}</div>
                  <div style={{ fontSize: 8, color: '#3a4858' }}>{ag.role}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 8, fontFamily: 'monospace', color: '#10b981' }}>{ag.status}</div>
                  {ag.conf !== '—' && (
                    <div style={{ fontSize: 8, color: '#f5c842', fontFamily: 'monospace' }}>{ag.conf}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
