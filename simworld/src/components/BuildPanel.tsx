import { useState } from 'react'
import { useSimStore } from '../store'
import type { PlacingLot } from '../types'

// ── Lot catalog ───────────────────────────────────────────────────────────────

interface LotType {
  id: string
  icon: string
  name: string
  desc: string
  tileW: number
  tileH: number
  cost: number
  floors: number
}

const LOT_TYPES: LotType[] = [
  { id: 'shop',   icon: '🏪', name: 'Small Shop',   desc: 'Compact storefront — 1–2 agents',   tileW: 4, tileH: 3, cost: 2000,  floors: 1 },
  { id: 'house',  icon: '🏠', name: 'House',        desc: 'Living space for your agents',       tileW: 4, tileH: 4, cost: 3000,  floors: 1 },
  { id: 'office', icon: '🏢', name: 'Office',       desc: 'Mid-size business — up to 4 agents', tileW: 6, tileH: 5, cost: 5000,  floors: 2 },
  { id: 'hq',     icon: '🏛️', name: 'Headquarters', desc: 'Large campus — up to 6 agents',      tileW: 8, tileH: 6, cost: 12000, floors: 3 },
]

interface StylePreset {
  id: string
  name: string
  color: string
  roofColor: string
  accentColor: string
}

const STYLES: StylePreset[] = [
  { id: 'sand',    name: 'Sandstone', color: '#e8c9a0', roofColor: '#c0703a', accentColor: '#f5e6c8' },
  { id: 'sky',     name: 'Skyline',   color: '#a0c4e8', roofColor: '#31547a', accentColor: '#c4ddf5' },
  { id: 'mint',    name: 'Mint',      color: '#a9dfbf', roofColor: '#1e8a5a', accentColor: '#d4f3e2' },
  { id: 'rose',    name: 'Rose',      color: '#f0b8c8', roofColor: '#a3305c', accentColor: '#fadce6' },
  { id: 'slate',   name: 'Slate',     color: '#9aa8ba', roofColor: '#3a4656', accentColor: '#c7d2e0' },
  { id: 'violet',  name: 'Violet',    color: '#c3b1e1', roofColor: '#5b3a8e', accentColor: '#e2d7f2' },
]

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function BuildPanel() {
  const totalCash       = useSimStore(s => s.totalCash)
  const placing         = useSimStore(s => s.placing)
  const startPlacing    = useSimStore(s => s.startPlacing)
  const cancelPlacing   = useSimStore(s => s.cancelPlacing)
  const expandTerritory = useSimStore(s => s.expandTerritory)
  const worldMap        = useSimStore(s => s.worldMap)
  const agents          = useSimStore(s => s.agents)
  const selectBuilding  = useSimStore(s => s.selectBuilding)
  const demolish        = useSimStore(s => s.demolishBuilding)

  const [styleId, setStyleId] = useState('sand')
  const style = STYLES.find(s => s.id === styleId) ?? STYLES[0]

  const customBuildings = worldMap.buildings.filter(b => b.custom)

  const pick = (lot: LotType) => {
    if (placing) { cancelPlacing(); return }
    const p: PlacingLot = {
      typeName: lot.name,
      tileW: lot.tileW, tileH: lot.tileH,
      cost: lot.cost, floors: lot.floors,
      color: style.color, roofColor: style.roofColor, accentColor: style.accentColor,
    }
    startPlacing(p)
  }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12, fontSize: 11, color: '#c0cce0' }}>
      {/* Header */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#48dc8c', letterSpacing: 0.5 }}>🏗️ Build Mode</div>
        <div style={{ fontSize: 9, color: '#6a7890', marginTop: 3, lineHeight: 1.5 }}>
          Place a building first, then click it to assign a business.
          Agents can only be hired once a business is assigned.
        </div>
      </div>

      {/* Funds */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)',
        borderRadius: 8, padding: '7px 10px',
      }}>
        <span style={{ fontSize: 9, color: '#6a7890' }}>AVAILABLE FUNDS</span>
        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#10b981' }}>
          ${Math.floor(totalCash).toLocaleString()}
        </span>
      </div>

      {/* Style picker */}
      <div>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#6a7890', marginBottom: 6, letterSpacing: 0.5 }}>STYLE</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {STYLES.map(s => (
            <button
              key={s.id}
              onClick={() => setStyleId(s.id)}
              title={s.name}
              style={{
                width: 28, height: 28, borderRadius: 7, cursor: 'pointer',
                background: `linear-gradient(135deg, ${s.color} 50%, ${s.roofColor} 50%)`,
                border: styleId === s.id ? '2px solid #00d4ff' : '2px solid rgba(255,255,255,0.1)',
              }}
            />
          ))}
        </div>
      </div>

      {/* Lot catalog */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#6a7890', letterSpacing: 0.5 }}>BUILDINGS</div>
        {LOT_TYPES.map(lot => {
          const affordable = totalCash >= lot.cost
          return (
            <button
              key={lot.id}
              onClick={() => affordable && pick(lot)}
              disabled={!affordable}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: placing?.typeName === lot.name ? 'rgba(72,220,140,0.12)' : 'rgba(255,255,255,0.03)',
                border: placing?.typeName === lot.name
                  ? '1px solid rgba(72,220,140,0.5)'
                  : '1px solid rgba(255,255,255,0.08)',
                borderRadius: 10, padding: '9px 10px',
                cursor: affordable ? 'pointer' : 'not-allowed',
                opacity: affordable ? 1 : 0.45,
                textAlign: 'left', color: '#c0cce0',
              }}
            >
              <span style={{ fontSize: 20 }}>{lot.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#e0e6f0' }}>{lot.name}</div>
                <div style={{ fontSize: 8.5, color: '#6a7890' }}>{lot.desc} · {lot.tileW}×{lot.tileH} tiles</div>
              </div>
              <span style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 700, color: affordable ? '#10b981' : '#e74c3c' }}>
                ${lot.cost.toLocaleString()}
              </span>
            </button>
          )
        })}
      </div>

      {/* Expand territory */}
      <button
        onClick={expandTerritory}
        style={{
          background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.3)',
          borderRadius: 10, padding: '9px 10px', cursor: 'pointer',
          color: '#00d4ff', fontSize: 11, fontWeight: 700,
        }}
      >
        🌱 Expand Territory ({worldMap.cols}×{worldMap.rows} · {worldMap.expansions} expansions)
      </button>
      <div style={{ fontSize: 8.5, color: '#4a5568', marginTop: -6, lineHeight: 1.4 }}>
        The world also grows on its own when buildable land runs low.
      </div>

      {/* Your buildings */}
      {customBuildings.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#6a7890', letterSpacing: 0.5 }}>
            YOUR BUILDINGS ({customBuildings.length})
          </div>
          {customBuildings.map(b => {
            const staff = agents.filter(a => a.workBuilding === b.id).length
            return (
              <div key={b.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 8, padding: '7px 9px',
              }}>
                <div style={{
                  width: 10, height: 10, borderRadius: 3, flexShrink: 0,
                  background: b.vacant ? '#f5a623' : b.roofColor,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#e0e6f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.name}
                  </div>
                  <div style={{ fontSize: 8, color: b.vacant ? '#f5a623' : '#6a7890' }}>
                    {b.vacant ? '⚠ vacant — assign a business' : `${b.businessType} · ${staff} agent${staff !== 1 ? 's' : ''}`}
                  </div>
                </div>
                <button
                  onClick={() => selectBuilding(b.id)}
                  style={{
                    background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.3)',
                    borderRadius: 5, color: '#00d4ff', fontSize: 8.5, fontWeight: 700,
                    padding: '3px 7px', cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  Manage
                </button>
                <button
                  onClick={() => { if (confirm(`Demolish ${b.name}? Its agents will leave.`)) demolish(b.id) }}
                  style={{
                    background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)',
                    borderRadius: 5, color: '#e74c3c', fontSize: 8.5,
                    padding: '3px 6px', cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  💥
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
