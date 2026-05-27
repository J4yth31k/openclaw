import type { SimState, CreativeStudioStats, TradingStats, EventLogEntry } from '../types'
import { CREATIVE_EVENTS, TRADE_EVENTS } from '../data/businessData'
import { timeLabel } from './TimeSystem'
import { simMinuteOfDay } from './TimeSystem'

let creativeEventIdx = 0
let tradeEventIdx = 0
let creativeTimer = 0      // sim-seconds until next creative event
let tradeTimer = 0
let uniqueId = 0

function uid() { return `evt_${++uniqueId}` }

export interface BusinessUpdate {
  creative?: Partial<CreativeStudioStats>
  trading?: Partial<TradingStats>
  logEntries: EventLogEntry[]
  completedDelta: number
}

export function updateBusinesses(state: SimState, dtSec: number): BusinessUpdate {
  const result: BusinessUpdate = { logEntries: [], completedDelta: 0 }
  const minuteOfDay = simMinuteOfDay(state.time)

  // Only fire events during work hours
  const workHours = minuteOfDay >= 8 * 60 && minuteOfDay < 17 * 60

  // ── Creative Studio ───────────────────────────────────────────────────────
  creativeTimer -= dtSec
  if (workHours && creativeTimer <= 0) {
    creativeTimer = 45 + Math.random() * 75  // 45–120 sec between events

    const ev = CREATIVE_EVENTS[creativeEventIdx % CREATIVE_EVENTS.length]
    creativeEventIdx++

    const cs = state.creative
    const newRevenue = cs.dailyRevenue + ev.revenueDelta
    const newProfit  = newRevenue - cs.dailyExpenses
    const patch: Partial<CreativeStudioStats> = {
      dailyRevenue: newRevenue,
      dailyProfit: newProfit,
      lifetimeProfit: cs.lifetimeProfit + ev.revenueDelta,
      cash: cs.cash + ev.revenueDelta,
      draftsInProgress: Math.max(0, cs.draftsInProgress + ev.draftDelta),
      mockSales: cs.mockSales + ev.salesDelta,
      completedProducts: ev.draftDelta < 0 ? cs.completedProducts + 1 : cs.completedProducts,
    }
    result.creative = patch
    result.completedDelta += ev.salesDelta
    result.logEntries.push({
      id: uid(),
      simMinute: state.time.day * 1440 + minuteOfDay,
      timeLabel: timeLabel(state.time),
      message: ev.message,
      type: ev.revenueDelta > 0 ? 'success' : 'creative',
    })
  }

  // ── Trading Office ────────────────────────────────────────────────────────
  tradeTimer -= dtSec
  if (workHours && tradeTimer <= 0) {
    tradeTimer = 60 + Math.random() * 90  // 60–150 sec

    const ev = TRADE_EVENTS[tradeEventIdx % TRADE_EVENTS.length]
    tradeEventIdx++

    const tr = state.trading
    const newPL = tr.dailyPL + ev.plDelta
    const newBalance = tr.accountBalance + ev.plDelta
    const newOpen = Math.max(0, tr.openTrades + ev.openDelta)
    const newClosed = tr.closedTrades + ev.closeDelta
    const newWins = ev.won === true ? tr.wins + 1 : tr.wins
    const newLosses = ev.won === false ? tr.losses + 1 : tr.losses
    const totalTrades = newWins + newLosses
    const winRate = totalTrades > 0 ? Math.round((newWins / totalTrades) * 100) : tr.winRate
    const newDrawdown = ev.plDelta < 0 ? Math.min(25, tr.drawdown + Math.abs(ev.plDelta) / 100) : Math.max(0, tr.drawdown - 0.5)

    const patch: Partial<TradingStats> = {
      dailyPL: newPL,
      accountBalance: newBalance,
      openTrades: newOpen,
      closedTrades: newClosed,
      wins: newWins,
      losses: newLosses,
      winRate,
      drawdown: newDrawdown,
      ...(ev.mood ? { marketMood: ev.mood } : {}),
      ...(ev.action ? { traderAction: ev.action } : {}),
    }
    result.trading = patch
    result.completedDelta += ev.closeDelta
    result.logEntries.push({
      id: uid(),
      simMinute: state.time.day * 1440 + minuteOfDay,
      timeLabel: timeLabel(state.time),
      message: ev.message,
      type: ev.plDelta > 0 ? 'success' : ev.plDelta < 0 ? 'warning' : 'trade',
    })
  }

  // ── Daily reset at midnight ───────────────────────────────────────────────
  if (minuteOfDay === 0) {
    result.creative = { ...result.creative, dailyRevenue: 0, dailyExpenses: 85, dailyProfit: 0, mockSales: 0 }
    result.trading = { ...result.trading, dailyPL: 0, openTrades: 0, closedTrades: 0, wins: 0, losses: 0 }
    result.logEntries.push({
      id: uid(),
      simMinute: state.time.day * 1440,
      timeLabel: timeLabel(state.time),
      message: `🌅 Day ${state.time.day + 1} begins! Resetting daily stats.`,
      type: 'info',
    })
  }

  return result
}
