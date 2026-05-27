import type { GameTime } from '../types'

export const DEFAULT_SPEED = 800  // real-ms per sim-minute at 1×

export function makeInitialTime(): GameTime {
  return { day: 1, hour: 6, minute: 55, speed: DEFAULT_SPEED, paused: false }
}

export function advanceTime(time: GameTime, realMs: number): GameTime {
  if (time.paused || time.speed <= 0) return time
  const simMinutesElapsed = realMs / time.speed
  const totalMinutes = time.hour * 60 + time.minute + simMinutesElapsed

  const capped = totalMinutes % (24 * 60)  // wrap at midnight — keep fractional!
  const newHour = Math.floor(capped / 60)
  const newMinute = capped % 60            // float: fractional part accumulates between frames
  const newDay = time.day + Math.floor(totalMinutes / (24 * 60))

  return { ...time, day: newDay, hour: newHour, minute: newMinute }
}

export function simMinuteOfDay(t: GameTime) {
  return t.hour * 60 + t.minute
}

export function timeLabel(t: GameTime): string {
  const h = String(t.hour).padStart(2, '0')
  const m = String(Math.floor(t.minute)).padStart(2, '0')
  return `Day ${t.day} ${h}:${m}`
}
