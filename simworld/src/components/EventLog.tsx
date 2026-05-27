import { useSimStore } from '../store'
import type { LogType } from '../types'

const TYPE_COLORS: Record<LogType, string> = {
  info:     '#7f8cad',
  success:  '#2ecc71',
  warning:  '#e74c3c',
  trade:    '#3498db',
  creative: '#e67e22',
}

const TYPE_DOT: Record<LogType, string> = {
  info:     '⬤',
  success:  '⬤',
  warning:  '⬤',
  trade:    '⬤',
  creative: '⬤',
}

export default function EventLog() {
  const log = useSimStore(s => s.eventLog)

  return (
    <div style={{
      height: 150,
      background: 'rgba(12,14,22,0.97)',
      borderTop: '1px solid #2a2d3a',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '5px 12px',
        borderBottom: '1px solid #1e2130',
        fontSize: 9,
        fontWeight: 700,
        color: '#4a5060',
        textTransform: 'uppercase',
        letterSpacing: 1,
        flexShrink: 0,
      }}>
        Event Log
      </div>
      <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
        {log.map(entry => (
          <div
            key={entry.id}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              padding: '2px 12px',
              fontSize: 11,
            }}
          >
            <span style={{ color: TYPE_COLORS[entry.type], fontSize: 7, marginTop: 3, flexShrink: 0 }}>
              {TYPE_DOT[entry.type]}
            </span>
            <span style={{ color: '#4a5868', fontSize: 10, flexShrink: 0, fontFamily: 'monospace', marginTop: 1 }}>
              {entry.timeLabel}
            </span>
            <span style={{ color: '#b8c0d0', lineHeight: 1.4 }}>
              {entry.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
