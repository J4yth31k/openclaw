import type { GameTime } from '../types'

// Real-time: 1 real minute = 1 sim minute
export const REALTIME_SPEED = 60_000   // ms per sim-minute
export const DEFAULT_SPEED  = REALTIME_SPEED

// Detect the browser's IANA timezone and short abbreviation
export const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone

export function getTzAbbr(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZoneName: 'short',
    timeZone: LOCAL_TZ,
  }).formatToParts(new Date())
  return parts.find(p => p.type === 'timeZoneName')?.value ?? LOCAL_TZ
}

// ── Init from wall clock ───────────────────────────────────────────────────────

export function makeInitialTime(): GameTime {
  const now = new Date()
  return {
    day:    1,
    hour:   now.getHours(),
    minute: now.getMinutes() + now.getSeconds() / 60,
    speed:  REALTIME_SPEED,
    paused: false,
  }
}

// ── Advance time ───────────────────────────────────────────────────────────────

export function advanceTime(time: GameTime, realMs: number): GameTime {
  if (time.paused || time.speed <= 0) return time

  if (time.speed >= REALTIME_SPEED) {
    // Drift-free: read directly from the wall clock
    const now        = new Date()
    const prevMin    = time.hour * 60 + time.minute
    const nowMin     = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60
    const crossedMid = nowMin < prevMin   // wrapped past midnight
    return {
      ...time,
      hour:   now.getHours(),
      minute: now.getMinutes() + now.getSeconds() / 60,
      day:    time.day + (crossedMid ? 1 : 0),
    }
  }

  // Accelerated mode (if user manually picks a faster speed)
  const simMinutesElapsed = realMs / time.speed
  const totalMinutes      = time.hour * 60 + time.minute + simMinutesElapsed
  const capped            = totalMinutes % (24 * 60)
  return {
    ...time,
    day:    time.day + Math.floor(totalMinutes / (24 * 60)),
    hour:   Math.floor(capped / 60),
    minute: capped % 60,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function simMinuteOfDay(t: GameTime) {
  return t.hour * 60 + t.minute
}

export function timeLabel(t: GameTime): string {
  const h   = t.hour % 12 || 12
  const m   = String(Math.floor(t.minute)).padStart(2, '0')
  const ampm = t.hour < 12 ? 'AM' : 'PM'
  return `Day ${t.day}  ${h}:${m} ${ampm}`
}

/** Format a GameTime as a short real-time clock string (e.g. "2:34 PM") */
export function clockString(t: GameTime): string {
  const h    = t.hour % 12 || 12
  const m    = String(Math.floor(t.minute)).padStart(2, '0')
  const s    = String(new Date().getSeconds()).padStart(2, '0')
  const ampm = t.hour < 12 ? 'AM' : 'PM'
  return `${h}:${m}:${s} ${ampm}`
}
