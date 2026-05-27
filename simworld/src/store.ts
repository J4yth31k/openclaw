import { create } from 'zustand'
import type { SimState, Agent, AgentId } from './types'
import { makeInitialTime, advanceTime } from './engine/TimeSystem'
import { makeInitialAgents, worldMap, gridToPixel } from './data/worldData'
import { makeInitialCreative, makeInitialTrading } from './data/businessData'
import { moveAgent } from './engine/MovementSystem'
import { updateAgent } from './engine/AgentSystem'
import { updateBusinesses } from './engine/BusinessSystem'
import { saveGame, loadGame, clearSave } from './engine/SaveLoadSystem'

// ── Initial state factory ─────────────────────────────────────────────────────

function makeInitialState(): SimState {
  return {
    time: makeInitialTime(),
    agents: makeInitialAgents(),
    worldMap,
    creative: makeInitialCreative(),
    trading: makeInitialTrading(),
    eventLog: [
      {
        id: 'init',
        simMinute: 0,
        timeLabel: 'Day 1 06:55',
        message: '🌍 SimWorld initialized. Agents are waking up…',
        type: 'info',
      },
    ],
    selectedAgentId: null,
    totalCash: 14900,
    completedTaskCount: 0,
    warnings: [],
  }
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface SimStore extends SimState {
  tick: (realMs: number) => void
  selectAgent: (id: AgentId | null) => void
  setSpeed: (speed: number) => void
  togglePause: () => void
  save: () => void
  load: () => void
  reset: () => void
}

export const useSimStore = create<SimStore>((set, get) => ({
  ...makeInitialState(),

  tick(realMs: number) {
    const state = get()
    if (state.time.paused) return

    const dtSec = (realMs / state.time.speed) * 60  // sim-seconds elapsed

    // ── Advance time ──────────────────────────────────────────────────────
    const newTime = advanceTime(state.time, realMs)

    // ── Update agents ─────────────────────────────────────────────────────
    const newAgents: Agent[] = state.agents.map(agent => {
      const movePatch = moveAgent(agent, dtSec)
      const midAgent = { ...agent, ...movePatch }
      const statePatch = updateAgent(midAgent, { ...state, time: newTime }, dtSec)
      const updated = { ...midAgent, ...statePatch }
      // Snap pixel pos to grid when path done
      if (updated.path.length === 0 && movePatch.gridPos) {
        updated.pixelPos = gridToPixel(updated.gridPos)
      }
      return updated
    })

    // ── Update businesses ─────────────────────────────────────────────────
    const bizUpdate = updateBusinesses({ ...state, time: newTime, agents: newAgents }, dtSec)

    const newCreative = { ...state.creative, ...bizUpdate.creative }
    const newTrading  = { ...state.trading, ...bizUpdate.trading }

    const newLog = bizUpdate.logEntries.length > 0
      ? [...bizUpdate.logEntries, ...state.eventLog].slice(0, 80)
      : state.eventLog

    const newCash = newCreative.cash + newTrading.accountBalance

    set({
      time: newTime,
      agents: newAgents,
      creative: newCreative,
      trading: newTrading,
      eventLog: newLog,
      totalCash: newCash,
      completedTaskCount: state.completedTaskCount + bizUpdate.completedDelta,
    })
  },

  selectAgent: (id) => set({ selectedAgentId: id }),

  setSpeed: (speed) => set(s => ({ time: { ...s.time, speed } })),

  togglePause: () => set(s => ({ time: { ...s.time, paused: !s.time.paused } })),

  save: () => saveGame(get()),

  load: () => {
    const saved = loadGame()
    if (saved) {
      set(saved)
    }
  },

  reset: () => {
    clearSave()
    set(makeInitialState())
  },
}))
