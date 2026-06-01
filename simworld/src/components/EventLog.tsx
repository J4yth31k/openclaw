import { useSimStore } from '../store'
import type { LogType } from '../types'
import { generateConversationForLogEntry } from '../engine/ConversationEngine'

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

// Types that are rich enough to generate a conversation
const CONVERSATION_TYPES: LogType[] = ['trade', 'success', 'creative']

export default function EventLog() {
  const log                = useSimStore(s => s.eventLog)
  const conversations      = useSimStore(s => s.conversations)
  const selectConversation = useSimStore(s => s.selectConversation)
  const addConversation    = useSimStore(s => s.addConversation)
  const time               = useSimStore(s => s.time)

  function openConversation(entryId: string, message: string, type: LogType) {
    // Try to find existing conversation linked to this log entry
    const existing = conversations.find(c => c.sourceEventId === entryId)
    if (existing) {
      selectConversation(existing.id)
      return
    }
    // Generate ad-hoc conversation for entries without one
    if (CONVERSATION_TYPES.includes(type)) {
      const conv = generateConversationForLogEntry(time, message, type)
      if (conv) {
        addConversation(conv)
        selectConversation(conv.id)
      }
    }
  }

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
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: 9, fontWeight: 700, color: '#4a5060',
          textTransform: 'uppercase', letterSpacing: 1,
        }}>
          Event Log
        </span>
        <span style={{ fontSize: 8, color: '#3a4060' }}>
          click event for full conversation
        </span>
      </div>

      <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
        {log.map(entry => {
          const isClickable = CONVERSATION_TYPES.includes(entry.type)
          return (
            <div
              key={entry.id}
              onClick={isClickable ? () => openConversation(entry.id, entry.message, entry.type) : undefined}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                padding: '2px 12px',
                fontSize: 11,
                cursor: isClickable ? 'pointer' : 'default',
                borderRadius: 3,
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => {
                if (isClickable) (e.currentTarget as HTMLDivElement).style.background = 'rgba(99,102,241,0.06)'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.background = 'transparent'
              }}
            >
              <span style={{ color: TYPE_COLORS[entry.type], fontSize: 7, marginTop: 3, flexShrink: 0 }}>
                {TYPE_DOT[entry.type]}
              </span>
              <span style={{ color: '#4a5868', fontSize: 10, flexShrink: 0, fontFamily: 'monospace', marginTop: 1 }}>
                {entry.timeLabel}
              </span>
              <span style={{ color: '#b8c0d0', lineHeight: 1.4, flex: 1, minWidth: 0 }}>
                {entry.message}
              </span>
              {isClickable && (
                <span style={{
                  fontSize: 7, color: '#3a4060', flexShrink: 0, marginTop: 2,
                  opacity: 0.7,
                }}>
                  💬
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
