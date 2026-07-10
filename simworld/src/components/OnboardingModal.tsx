import { useState } from 'react'

const KEY = 'simworld_onboarded_v1'

const STEPS = [
  { icon: '🌍', title: 'Welcome to SimWorld', text: 'A living city of AI agents that work, trade, build, and grow — even while you watch. The world expands on its own as it fills up.' },
  { icon: '🖱️', title: 'Explore', text: 'Drag to pan. Scroll (or pinch) to zoom. Click any agent or building to see what it\'s up to. Day turns to night as sim time passes.' },
  { icon: '🏗️', title: 'Build your empire', text: 'Open the Build tab to place buildings. Every building starts vacant — click it, give it a name and a business type, and it opens for business.' },
  { icon: '👋', title: 'Hire your team', text: 'Once a building has a business, hire agents into it. They\'ll live there, work there, and start earning for you. Have fun!' },
]

export default function OnboardingModal() {
  const [visible, setVisible] = useState(() => {
    try { return !localStorage.getItem(KEY) } catch { return true }
  })
  const [step, setStep] = useState(0)

  if (!visible) return null

  const dismiss = () => {
    try { localStorage.setItem(KEY, '1') } catch { /* ignore */ }
    setVisible(false)
  }

  const s = STEPS[step]
  const last = step === STEPS.length - 1

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: 'linear-gradient(160deg, #0d1117 0%, #0a0e1a 100%)',
        border: '1px solid rgba(0,212,255,0.25)',
        borderRadius: 18, padding: '28px 26px', maxWidth: 380, width: '100%',
        display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'center',
        boxShadow: '0 0 80px rgba(0,212,255,0.12), 0 24px 64px rgba(0,0,0,0.7)',
      }}>
        <div style={{ fontSize: 44 }}>{s.icon}</div>
        <div style={{
          fontSize: 18, fontWeight: 800,
          background: 'linear-gradient(90deg,#00d4ff,#7c3aed)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          {s.title}
        </div>
        <div style={{ fontSize: 12, color: '#8892a4', lineHeight: 1.65 }}>{s.text}</div>

        {/* Dots */}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              width: i === step ? 18 : 6, height: 6, borderRadius: 3,
              background: i === step ? '#00d4ff' : 'rgba(255,255,255,0.15)',
              transition: 'all 0.25s ease',
            }} />
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 4 }}>
          {!last && (
            <button
              onClick={dismiss}
              style={{
                background: 'transparent', border: 'none', color: '#4a5568',
                fontSize: 11, cursor: 'pointer', padding: '9px 12px',
              }}
            >
              Skip
            </button>
          )}
          <button
            onClick={() => last ? dismiss() : setStep(step + 1)}
            style={{
              background: 'linear-gradient(90deg,#00d4ff,#7c3aed)',
              border: 'none', borderRadius: 9, color: '#fff',
              fontSize: 12, fontWeight: 700, padding: '9px 26px', cursor: 'pointer',
            }}
          >
            {last ? '🚀 Start Building' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
