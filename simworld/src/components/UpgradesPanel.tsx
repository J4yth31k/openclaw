import { useState } from 'react'
import { useSimStore } from '../store'
import { UPGRADE_DEFS, computeEffects } from '../data/upgradeData'
import type { UpgradeCategory, UpgradeDef } from '../types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function usd(n: number) {
  return `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function effectLabel(def: UpgradeDef, level: number): string {
  const e = def.effect
  const l = level + 1  // preview next level
  const parts: string[] = []
  if (e.saleRateBoost)     parts.push(`+${Math.round(e.saleRateBoost * l * 100)}% sales`)
  if (e.viewsBoost)        parts.push(`+${Math.round(e.viewsBoost * l * 100)}% views`)
  if (e.designSpeedBoost)  parts.push(`${Math.round(e.designSpeedBoost * l * 100)}% faster design`)
  if (e.qcSpeedBoost)      parts.push(`${Math.round(e.qcSpeedBoost * l * 100)}% faster QC`)
  if (e.listingSpeedBoost) parts.push(`${Math.round(e.listingSpeedBoost * l * 100)}% faster listing`)
  if (e.qcPassBoost)       parts.push(`${Math.round((0.85 + e.qcPassBoost * l) * 100)}% QC pass`)
  if (e.ideaSpeedBoost)    parts.push(`${Math.round(e.ideaSpeedBoost * l * 100)}% faster ideas`)
  if (e.maxProductsBoost)  parts.push(`+${e.maxProductsBoost * l} pipeline slots`)
  if (e.dailyCost)         parts.push(`$${e.dailyCost * l}/day ad spend`)
  return parts.join(' · ')
}

const CATEGORY_ORDER: UpgradeCategory[] = ['tools', 'ads', 'agent', 'milestone']
const CATEGORY_LABELS: Record<UpgradeCategory, string> = {
  tools:     '🛠️ Tools',
  ads:       '📢 Ads',
  agent:     '🤖 Agents',
  milestone: '🏆 Milestones',
}
const CATEGORY_COLORS: Record<UpgradeCategory, string> = {
  tools:     '#3b82f6',
  ads:       '#f59e0b',
  agent:     '#10b981',
  milestone: '#f5c842',
}

// ── Upgrade card ──────────────────────────────────────────────────────────────

function UpgradeCard({
  def, currentLevel, canAfford, prereqMet, onBuy,
}: {
  def: UpgradeDef
  currentLevel: number
  canAfford: boolean
  prereqMet: boolean
  onBuy: () => void
}) {
  const maxed    = currentLevel >= def.maxLevel
  const locked   = !prereqMet && currentLevel === 0
  const isMilestone = def.category === 'milestone'
  const color    = CATEGORY_COLORS[def.category]

  const opacity = locked ? 0.35 : 1

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${maxed ? color + '60' : locked ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.07)'}`,
      borderRadius: 7, padding: '8px 10px', opacity,
      transition: 'border-color 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        {/* Icon + level dots */}
        <div style={{ flexShrink: 0, textAlign: 'center' }}>
          <div style={{ fontSize: 18, lineHeight: 1 }}>{def.icon}</div>
          {def.maxLevel > 1 && (
            <div style={{ display: 'flex', gap: 2, marginTop: 3, justifyContent: 'center' }}>
              {Array.from({ length: def.maxLevel }).map((_, i) => (
                <div key={i} style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: i < currentLevel ? color : 'rgba(255,255,255,0.12)',
                }} />
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: maxed ? color : '#d0d8e8' }}>{def.name}</span>
            {currentLevel > 0 && !maxed && (
              <span style={{ fontSize: 7, color: color, fontFamily: 'monospace', fontWeight: 700 }}>
                Lv{currentLevel}→{currentLevel + 1}
              </span>
            )}
            {maxed && (
              <span style={{ fontSize: 7, color: color, fontFamily: 'monospace', fontWeight: 700, background: color + '20', padding: '1px 4px', borderRadius: 3 }}>
                {isMilestone ? 'EARNED' : 'MAXED'}
              </span>
            )}
            {locked && <span style={{ fontSize: 7, color: '#4a5870', fontFamily: 'monospace' }}>🔒 LOCKED</span>}
          </div>
          <div style={{ fontSize: 8, color: '#5a6880', marginTop: 1 }}>{def.description}</div>
          <div style={{ fontSize: 8, color: color, marginTop: 3, fontFamily: 'monospace' }}>
            {effectLabel(def, currentLevel)}
          </div>
        </div>

        {/* Buy button */}
        {!maxed && !locked && !isMilestone && (
          <button
            onClick={onBuy}
            disabled={!canAfford}
            style={{
              flexShrink: 0, padding: '4px 8px', borderRadius: 5, border: 'none',
              background: canAfford ? color : 'rgba(255,255,255,0.06)',
              color: canAfford ? '#fff' : '#3a4860',
              fontSize: 9, fontWeight: 700, cursor: canAfford ? 'pointer' : 'not-allowed',
              fontFamily: 'monospace',
              transition: 'background 0.2s',
            }}
          >
            {def.cost === 0 ? 'FREE' : usd(def.cost)}
          </button>
        )}
        {isMilestone && !maxed && (
          <div style={{ flexShrink: 0, fontSize: 8, color: '#3a4860', fontFamily: 'monospace', paddingTop: 6 }}>
            AUTO
          </div>
        )}
      </div>
    </div>
  )
}

// ── Active effects summary ─────────────────────────────────────────────────────

function EffectsSummary({ ownedUpgrades }: { ownedUpgrades: Array<{ id: string; level: number }> }) {
  const fx = computeEffects(ownedUpgrades)
  const rows = [
    { label: 'Sale Rate',     value: `×${fx.saleRateMultiplier.toFixed(2)}`,   base: fx.saleRateMultiplier > 1 },
    { label: 'Design Speed',  value: `×${fx.designDivisor.toFixed(2)}`,        base: fx.designDivisor > 1 },
    { label: 'QC Speed',      value: `×${fx.qcDivisor.toFixed(2)}`,            base: fx.qcDivisor > 1 },
    { label: 'Listing Speed', value: `×${fx.listingDivisor.toFixed(2)}`,       base: fx.listingDivisor > 1 },
    { label: 'QC Pass Rate',  value: `${Math.round(fx.qcPassRate * 100)}%`,    base: fx.qcPassRate > 0.85 },
    { label: 'Views',         value: `×${fx.viewsMultiplier.toFixed(2)}`,      base: fx.viewsMultiplier > 1 },
    { label: 'Pipeline Cap',  value: `${fx.pipelineCap} slots`,                base: fx.pipelineCap > 4 },
    { label: 'Daily Ads Cost',value: fx.extraDailyCost > 0 ? `$${fx.extraDailyCost}/day` : 'None', base: false },
  ]

  return (
    <div style={{
      background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)',
      borderRadius: 7, padding: '8px 10px', marginBottom: 10,
    }}>
      <div style={{ fontSize: 8, color: '#10b981', fontWeight: 700, letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' }}>
        ✨ Active Bonuses
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 12px' }}>
        {rows.map(r => (
          <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 8, color: '#4a5870' }}>{r.label}</span>
            <span style={{ fontSize: 8, fontFamily: 'monospace', fontWeight: 700, color: r.base ? '#10b981' : '#3a4860' }}>
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function UpgradesPanel() {
  const [activeCategory, setActiveCategory] = useState<UpgradeCategory>('tools')

  const totalCash      = useSimStore(s => s.totalCash)
  const ownedUpgrades  = useSimStore(s => s.creative.ownedUpgrades ?? [])
  const purchaseUpgrade = useSimStore(s => s.purchaseUpgrade)

  const filteredDefs = UPGRADE_DEFS.filter(d => d.category === activeCategory)

  return (
    <div style={{
      width: '100%', background: 'rgba(10,12,20,0.98)',
      padding: '10px', overflowY: 'auto',
      fontSize: 11, color: '#c8ccd8',
      display: 'flex', flexDirection: 'column', gap: 0,
    }}>

      {/* Header */}
      <div style={{ textAlign: 'center', padding: '6px 0 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#f5c842' }}>🔧 Shop Upgrades</div>
        <div style={{ fontSize: 9, color: '#5a6880', marginTop: 2 }}>
          Available: <span style={{ color: '#10b981', fontFamily: 'monospace' }}>${totalCash.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      </div>

      {/* Active effects summary */}
      <EffectsSummary ownedUpgrades={ownedUpgrades} />

      {/* Category tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 8 }}>
        {CATEGORY_ORDER.map(cat => {
          const ownedInCat = ownedUpgrades.filter(u => UPGRADE_DEFS.find(d => d.id === u.id)?.category === cat).length
          const totalInCat = UPGRADE_DEFS.filter(d => d.category === cat).length
          const color = CATEGORY_COLORS[cat]
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              style={{
                flex: 1, border: 'none', padding: '5px 2px', borderRadius: 5,
                background: activeCategory === cat ? color + '25' : 'rgba(255,255,255,0.03)',
                color: activeCategory === cat ? color : '#3a4860',
                fontSize: 8, fontWeight: 700, cursor: 'pointer',
                borderBottom: `2px solid ${activeCategory === cat ? color : 'transparent'}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
              }}
            >
              <span style={{ fontSize: 11 }}>{CATEGORY_LABELS[cat].split(' ')[0]}</span>
              <span style={{ fontSize: 6 }}>{CATEGORY_LABELS[cat].split(' ').slice(1).join(' ')}</span>
              <span style={{ fontSize: 6, color: activeCategory === cat ? color : '#2a3040' }}>
                {ownedInCat}/{totalInCat}
              </span>
            </button>
          )
        })}
      </div>

      {/* Upgrade cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filteredDefs.map(def => {
          const owned   = ownedUpgrades.find(u => u.id === def.id)
          const level   = owned?.level ?? 0
          const prereqMet = !def.requires || !!ownedUpgrades.find(u => u.id === def.requires)
          const canAfford = totalCash >= def.cost
          return (
            <UpgradeCard
              key={def.id}
              def={def}
              currentLevel={level}
              canAfford={canAfford}
              prereqMet={prereqMet}
              onBuy={() => purchaseUpgrade(def.id)}
            />
          )
        })}
      </div>

      <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: 8, color: '#2a3040', textAlign: 'center' }}>
        {ownedUpgrades.length} upgrades owned · upgrades stack
      </div>
    </div>
  )
}
