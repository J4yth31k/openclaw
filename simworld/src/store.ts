import { create } from 'zustand'
import type { SimState, Agent, AgentId, BuildingId, AgentConversation } from './types'
import { UPGRADE_DEFS } from './data/upgradeData'
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
    conversations: [],
    selectedAgentId: null,
    selectedBuildingId: null,
    selectedConversationId: null,
    totalCash: 14900,
    completedTaskCount: 0,
    warnings: [],
  }
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface SimStore extends SimState {
  tick: (realMs: number) => void
  selectAgent: (id: AgentId | null) => void
  selectBuilding: (id: BuildingId | null) => void
  selectConversation: (id: string | null) => void
  addConversation: (conv: AgentConversation) => void
  setSpeed: (speed: number) => void
  togglePause: () => void
  save: () => void
  load: () => void
  reset: () => void
  purchaseUpgrade: (id: string) => boolean
  addEventLogEntry: (message: string, type?: import('./types').LogType) => void
  setHulkTask: (task: string | null) => void
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

    const newConversations = bizUpdate.conversations.length > 0
      ? [...bizUpdate.conversations, ...state.conversations].slice(0, 120)
      : state.conversations

    const newCash = newCreative.cash + newTrading.accountBalance

    set({
      time: newTime,
      agents: newAgents,
      creative: newCreative,
      trading: newTrading,
      eventLog: newLog,
      conversations: newConversations,
      totalCash: newCash,
      completedTaskCount: state.completedTaskCount + bizUpdate.completedDelta,
    })
  },

  purchaseUpgrade: (id: string) => {
    const state = get()
    const def = UPGRADE_DEFS.find(u => u.id === id)
    if (!def) return false

    const ownedUpgrades = state.creative.ownedUpgrades ?? []
    const existing = ownedUpgrades.find(u => u.id === id)
    const currentLevel = existing?.level ?? 0

    // Can't exceed max level
    if (currentLevel >= def.maxLevel) return false

    // Check prerequisite
    if (def.requires && !ownedUpgrades.find(u => u.id === def.requires)) return false

    // Check funds (deduct from creative cash first, then trading if needed)
    const totalCash = state.creative.cash + state.trading.accountBalance
    if (totalCash < def.cost) return false

    const simMin = state.time.day * 1440 + state.time.hour * 60 + Math.floor(state.time.minute)
    const updatedOwned = existing
      ? ownedUpgrades.map(u => u.id === id ? { ...u, level: u.level + 1 } : u)
      : [...ownedUpgrades, { id, level: 1, purchasedAt: simMin }]

    // Deduct cost from creative.cash, overflow to trading.accountBalance
    let newCreativeCash = state.creative.cash - def.cost
    let newTradingBalance = state.trading.accountBalance
    if (newCreativeCash < 0) {
      newTradingBalance += newCreativeCash
      newCreativeCash = 0
    }

    set({
      creative: { ...state.creative, cash: newCreativeCash, ownedUpgrades: updatedOwned },
      trading:  { ...state.trading, accountBalance: newTradingBalance },
      totalCash: newCreativeCash + newTradingBalance,
    })
    return true
  },

  addEventLogEntry: (message, type = 'info') => {
    const s = get()
    const minuteOfDay = s.time.hour * 60 + Math.floor(s.time.minute)
    const simMinute   = s.time.day * 1440 + minuteOfDay
    const h = String(s.time.hour).padStart(2, '0')
    const m = String(Math.floor(s.time.minute)).padStart(2, '0')
    const entry = {
      id: `evt_hulk_${Date.now()}`,
      simMinute,
      timeLabel: `Day ${s.time.day} ${h}:${m}`,
      message,
      type,
      agentId: 'hulk',
    }
    set(s2 => ({ eventLog: [entry, ...s2.eventLog].slice(0, 80) }))
  },

  setHulkTask: (task) => set(s => ({
    agents: s.agents.map(a =>
      a.id === 'hulk'
        ? { ...a, taskName: task, state: task ? 'working' : a.state }
        : a
    ),
  })),

  selectAgent: (id) => set({ selectedAgentId: id }),
  selectBuilding: (id) => set({ selectedBuildingId: id }),
  selectConversation: (id) => set({ selectedConversationId: id }),
  addConversation: (conv) => set(s => ({ conversations: [conv, ...s.conversations].slice(0, 120) })),

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
