import { useSimStore } from '../store'

function Stat({ label, value, color = '#e0e0e0', small = false }: {
  label: string; value: string | number; color?: string; small?: boolean
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
      <span style={{ color: '#9aa0b0', fontSize: small ? 10 : 11 }}>{label}</span>
      <span style={{ color, fontWeight: 600, fontSize: small ? 10 : 12, fontFamily: 'monospace' }}>{value}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: '#5c6070', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5, borderBottom: '1px solid #2a2d3a', paddingBottom: 3 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function pct(n: number) { return `${n.toFixed(1)}%` }
function usd(n: number, always = false) {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : (always && n > 0 ? '+' : '')
  return `${sign}$${abs.toFixed(2)}`
}
function plColor(n: number) { return n >= 0 ? '#2ecc71' : '#e74c3c' }

export default function ProfitPanel() {
  const creative  = useSimStore(s => s.creative)
  const trading   = useSimStore(s => s.trading)
  const total     = useSimStore(s => s.totalCash)
  const completed = useSimStore(s => s.completedTaskCount)
  const warnings  = useSimStore(s => s.warnings)
  const agents    = useSimStore(s => s.agents)

  const activeTasks = agents.filter(a => a.state === 'working' || a.state === 'on_break').length

  return (
    <div style={{
      width: '100%',
      background: 'rgba(16,18,28,0.95)',
      borderLeft: '1px solid #2a2d3a',
      padding: '12px 10px',
      overflowY: 'auto',
      fontSize: 12,
      color: '#c8ccd8',
      display: 'flex',
      flexDirection: 'column',
      gap: 0,
    }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: '#e0e6f0', marginBottom: 10, textAlign: 'center' }}>
        📊 Business Dashboard
      </div>

      <Section title="Total">
        <Stat label="Cash on hand" value={usd(total)} color="#f5c842" />
        <Stat label="Completed tasks" value={completed} />
        <Stat label="Active agents" value={activeTasks} />
      </Section>

      <Section title="Creative Studio 🎨">
        <Stat label="Cash" value={usd(creative.cash)} color="#f5c842" />
        <Stat label="Daily revenue" value={usd(creative.dailyRevenue)} color="#2ecc71" />
        <Stat label="Daily expenses" value={usd(creative.dailyExpenses)} color="#e74c3c" />
        <Stat label="Daily profit" value={usd(creative.dailyProfit)} color={plColor(creative.dailyProfit)} />
        <Stat label="Lifetime profit" value={usd(creative.lifetimeProfit)} color={plColor(creative.lifetimeProfit)} />
        <Stat label="Drafts in progress" value={creative.draftsInProgress} small />
        <Stat label="Completed products" value={creative.completedProducts} small />
        <Stat label="Pending QC" value={creative.pendingQC} small />
        <Stat label="Mock sales today" value={creative.mockSales} small />
      </Section>

      <Section title="Trading Office 📈">
        <Stat label="Account balance" value={usd(trading.accountBalance)} color="#f5c842" />
        <Stat label="Daily P/L" value={usd(trading.dailyPL, true)} color={plColor(trading.dailyPL)} />
        <Stat label="Open trades" value={trading.openTrades} small />
        <Stat label="Closed trades" value={trading.closedTrades} small />
        <Stat label="Win rate" value={`${trading.winRate}%`} color={trading.winRate >= 55 ? '#2ecc71' : '#e67e22'} small />
        <Stat label="Risk level" value={trading.riskLevel.toUpperCase()} color={
          trading.riskLevel === 'low' ? '#2ecc71' : trading.riskLevel === 'medium' ? '#f39c12' : '#e74c3c'
        } small />
        <Stat label="Drawdown" value={pct(trading.drawdown)} color={trading.drawdown > 10 ? '#e74c3c' : '#c8ccd8'} small />
        <Stat label="Market mood" value={trading.marketMood} small />
      </Section>

      {warnings.length > 0 && (
        <Section title="⚠️ Warnings">
          {warnings.map((w, i) => (
            <div key={i} style={{ color: '#e74c3c', fontSize: 10, marginBottom: 2 }}>{w}</div>
          ))}
        </Section>
      )}
    </div>
  )
}
