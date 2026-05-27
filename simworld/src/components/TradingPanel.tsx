import { useSimStore } from '../store'

function Kv({ label, value, color = '#c8ccd8' }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
      <span style={{ color: '#6a7888', fontSize: 10 }}>{label}</span>
      <span style={{ color, fontSize: 10, fontFamily: 'monospace', fontWeight: 600 }}>{value}</span>
    </div>
  )
}

function TradeRow({ trade }: { trade: import('../types').TradeRecord }) {
  const won = trade.status === 'won'
  const isOpen = trade.status === 'open'
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '3px 0',
      borderBottom: '1px solid #1e2130',
      fontSize: 10,
    }}>
      <span style={{
        color: trade.direction === 'long' ? '#2ecc71' : '#e74c3c',
        fontSize: 9, fontWeight: 700, width: 12,
      }}>
        {trade.direction === 'long' ? '▲' : '▼'}
      </span>
      <span style={{ color: '#9aa8b8', width: 52 }}>{trade.pair}</span>
      <span style={{
        color: isOpen ? '#f5c842' : won ? '#2ecc71' : '#e74c3c',
        fontFamily: 'monospace',
        fontWeight: 600,
        marginLeft: 'auto',
      }}>
        {isOpen ? 'OPEN' : trade.pnl !== null ? `${trade.pnl >= 0 ? '+' : ''}$${trade.pnl}` : ''}
      </span>
    </div>
  )
}

export default function TradingPanel() {
  const trading = useSimStore(s => s.trading)

  const moodColor: Record<string, string> = {
    bullish: '#2ecc71',
    bearish: '#e74c3c',
    neutral: '#9aa8b8',
    volatile: '#f39c12',
  }

  return (
    <div style={{
      width: '100%',
      background: 'rgba(14,16,26,0.97)',
      borderLeft: '1px solid #1e2130',
      padding: '10px 10px',
      overflowY: 'auto',
      fontSize: 11,
      color: '#c8ccd8',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <div style={{ fontWeight: 700, fontSize: 12, color: '#e0e6f0', textAlign: 'center' }}>
        📈 Trading Desk
      </div>

      <div>
        <Kv label="Balance" value={`$${trading.accountBalance.toFixed(0)}`} color="#f5c842" />
        <Kv
          label="Daily P/L"
          value={`${trading.dailyPL >= 0 ? '+' : ''}$${trading.dailyPL.toFixed(2)}`}
          color={trading.dailyPL >= 0 ? '#2ecc71' : '#e74c3c'}
        />
        <Kv label="Open trades" value={trading.openTrades} />
        <Kv label="Closed today" value={trading.closedTrades} />
        <Kv label="Win rate" value={`${trading.winRate}%`} color={trading.winRate >= 55 ? '#2ecc71' : '#e67e22'} />
        <Kv label="Drawdown" value={`${trading.drawdown.toFixed(1)}%`} color={trading.drawdown > 10 ? '#e74c3c' : '#c8ccd8'} />
      </div>

      <div>
        <div style={{ fontSize: 9, color: '#3a4050', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Market</div>
        <div style={{ fontSize: 11, color: moodColor[trading.marketMood], fontWeight: 600 }}>
          {trading.marketMood.toUpperCase()} {trading.marketMood === 'bullish' ? '🐂' : trading.marketMood === 'bearish' ? '🐻' : trading.marketMood === 'volatile' ? '⚡' : '😐'}
        </div>
        <div style={{ fontSize: 10, color: '#7a8898', marginTop: 4 }}>{trading.traderAction}</div>
      </div>

      {trading.recentTrades.length > 0 && (
        <div>
          <div style={{ fontSize: 9, color: '#3a4050', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Recent Trades</div>
          {trading.recentTrades.slice(-5).map(t => (
            <TradeRow key={t.id} trade={t} />
          ))}
        </div>
      )}
    </div>
  )
}
