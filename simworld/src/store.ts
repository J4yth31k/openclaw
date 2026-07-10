import { create } from 'zustand'
import type { SimState, Agent, AgentId, BuildingId, AgentConversation, PlacingLot, Vec2, Building } from './types'
import { UPGRADE_DEFS } from './data/upgradeData'
import { makeInitialTime, advanceTime } from './engine/TimeSystem'
import {
  makeInitialAgents, makeInitialWorld, gridToPixel,
  generateTiles, canPlaceBuilding, makeRoomsForLot, expandWorld, freeGrassRatio,
  autoFurnish, furnishStyleFor, RETIRED_AGENT_IDS, ANALYST_DEFS,
} from './data/worldData'
import { defaultLifeNeeds } from './types'
import {
  makeInitialMarket, analyzeInstrument, saveApiKey, INSTRUMENTS,
} from './engine/MarketData'
import type { MarketState } from './engine/MarketData'
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
    worldMap: makeInitialWorld(),
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
    relationships: {},
  }
}

// ── Social chatter ────────────────────────────────────────────────────────────

const CHAT_LINES: Array<[string, string]> = [
  ['How\'s your day going?', 'Pretty good, staying busy!'],
  ['Did you catch the sunrise?', 'Gorgeous one today.'],
  ['Coffee later?', 'Absolutely, count me in ☕'],
  ['This city keeps growing!', 'Right? New lots every week.'],
  ['How\'s the new job?', 'Loving it so far!'],
  ['Weekend plans?', 'Just relaxing at home.'],
  ['Nice weather today.', 'Perfect for a walk.'],
  ['Have you met the new hire?', 'Yeah, seems friendly!'],
  ['Lunch was great today.', 'The fridge is always stocked 😄'],
  ['Work\'s been intense lately.', 'Take a break, you\'ve earned it.'],
]

function relKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

const SOCIABLE_STATES = new Set(['working', 'at_work', 'on_break', 'at_home', 'waking'])

// ── Wishes: small personal goals that pay out ─────────────────────────────────

const WISH_POOL: import('./types').Wish[] = [
  { icon: '🍕', label: 'Enjoy a proper meal',   need: 'hunger',  threshold: 92, reward: 150 },
  { icon: '😴', label: 'Wake up fully rested',  need: 'energy',  threshold: 96, reward: 180 },
  { icon: '💬', label: 'Have a good chat',      need: 'social',  threshold: 88, reward: 160 },
  { icon: '🎉', label: 'Have some real fun',    need: 'fun',     threshold: 90, reward: 140 },
  { icon: '🚿', label: 'Feel squeaky clean',    need: 'hygiene', threshold: 95, reward: 120 },
]

function wishValue(agent: Agent, need: import('./types').Wish['need']): number {
  if (need === 'energy') return agent.energy
  return agent.lifeNeeds?.[need] ?? 100
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
  setDeskTask: (task: string | null) => void
  chatAgentId: AgentId | null
  openAgentChat: (id: AgentId | null) => void
  commandAgent: (agentId: AgentId, cmd: import('./types').AgentCommand) => void
  // ── Market analysis ─────────────────────────────────────────────────────────
  market: MarketState
  setMarketApiKey: (key: string) => void
  refreshMarket: () => Promise<void>
  // ── Build mode ──────────────────────────────────────────────────────────────
  placing: PlacingLot | null
  hoverTile: Vec2 | null
  startPlacing: (lot: PlacingLot) => void
  cancelPlacing: () => void
  setHoverTile: (t: Vec2 | null) => void
  confirmPlaceAt: (tile: Vec2) => boolean
  assignBusiness: (id: BuildingId, name: string, businessType: string) => void
  setBuildingStyle: (id: BuildingId, style: { color?: string; accentColor?: string; roofColor?: string }) => void
  hireAgent: (buildingId: BuildingId, name: string) => boolean
  demolishBuilding: (id: BuildingId) => void
  expandTerritory: () => void
}

// ── Build helpers ─────────────────────────────────────────────────────────────

export const HIRE_COST = 1000

const AGENT_PALETTES: Array<[string, string]> = [
  ['#e67e22', '#fad7a0'], ['#16a085', '#a3e4d7'], ['#8e44ad', '#d7bde2'],
  ['#2980b9', '#aed6f1'], ['#c0392b', '#f1948a'], ['#27ae60', '#a9dfbf'],
  ['#d35400', '#f5cba7'], ['#7f8c8d', '#d5dbdb'], ['#f39c12', '#fdebd0'],
  ['#1abc9c', '#a2dfd4'], ['#9b59b6', '#e8daef'], ['#34495e', '#aeb6bf'],
]

function spendCash(state: SimState, cost: number): { creative: SimState['creative']; trading: SimState['trading'] } | null {
  const total = state.creative.cash + state.trading.accountBalance
  if (total < cost) return null
  let newCreativeCash = state.creative.cash - cost
  let newTradingBalance = state.trading.accountBalance
  if (newCreativeCash < 0) {
    newTradingBalance += newCreativeCash
    newCreativeCash = 0
  }
  return {
    creative: { ...state.creative, cash: newCreativeCash },
    trading: { ...state.trading, accountBalance: newTradingBalance },
  }
}

function logEntry(state: SimState, message: string, type: import('./types').LogType = 'info') {
  const minuteOfDay = state.time.hour * 60 + Math.floor(state.time.minute)
  return {
    id: `evt_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
    simMinute: state.time.day * 1440 + minuteOfDay,
    timeLabel: `Day ${state.time.day} ${String(state.time.hour).padStart(2, '0')}:${String(Math.floor(state.time.minute)).padStart(2, '0')}`,
    message,
    type,
  }
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

    // ── Wishes: assign new goals, pay out fulfilled ones ───────────────────
    let wishCash = 0
    const wishLogs: SimState['eventLog'] = []
    for (let i = 0; i < newAgents.length; i++) {
      const a = newAgents[i]
      if (a.wish) {
        if (wishValue(a, a.wish.need) >= a.wish.threshold) {
          wishCash += a.wish.reward
          wishLogs.push(logEntry({ ...state, time: newTime },
            `✨ ${a.name} fulfilled a wish — "${a.wish.label}" (+$${a.wish.reward})`, 'success'))
          newAgents[i] = {
            ...a,
            wish: null,
            speech: `✨ Wish granted! +$${a.wish.reward}`,
            speechTimer: 5,
            mood: 'excited',
          }
        }
      } else if (a.state !== 'sleeping' && Math.random() < 0.0008) {
        // Occasionally dream up a new wish they'll have to work toward
        const eligible = WISH_POOL.filter(w => wishValue(a, w.need) < w.threshold - 25)
        if (eligible.length > 0) {
          newAgents[i] = { ...a, wish: eligible[Math.floor(Math.random() * eligible.length)] }
        }
      }
    }
    if (wishCash > 0) newCreative.cash += wishCash

    const newCash = newCreative.cash + newTrading.accountBalance

    // ── Social pass: nearby agents strike up conversations ────────────────
    let newRelationships = state.relationships
    if (Math.random() < 0.015) {
      const candidates = newAgents.filter(
        a => SOCIABLE_STATES.has(a.state) && a.path.length === 0 && !a.speech
      )
      outer:
      for (let i = 0; i < candidates.length; i++) {
        for (let j = i + 1; j < candidates.length; j++) {
          const a = candidates[i], b = candidates[j]
          const dx = a.pixelPos.x - b.pixelPos.x
          const dy = a.pixelPos.y - b.pixelPos.y
          if (dx * dx + dy * dy > 3600) continue   // within ~60px
          const [lineA, lineB] = CHAT_LINES[Math.floor(Math.random() * CHAT_LINES.length)]
          const patch = (ag: Agent, line: string): Agent => ({
            ...ag,
            speech: line,
            speechTimer: 5,
            lifeNeeds: ag.lifeNeeds
              ? { ...ag.lifeNeeds, social: Math.min(100, ag.lifeNeeds.social + 12) }
              : ag.lifeNeeds,
          })
          const ai = newAgents.indexOf(a), bi = newAgents.indexOf(b)
          newAgents[ai] = patch(a, lineA)
          newAgents[bi] = patch(b, lineB)
          const key = relKey(a.id, b.id)
          newRelationships = {
            ...newRelationships,
            [key]: Math.min(100, (newRelationships[key] ?? 0) + 3),
          }
          break outer
        }
      }
    }

    // ── Self-expanding world: grow at the start of each new day when land is scarce
    let newWorldMap = state.worldMap
    let expansionLog: typeof newLog = wishLogs.length > 0
      ? [...wishLogs, ...newLog].slice(0, 80)
      : newLog
    if (newTime.day > state.time.day && freeGrassRatio(state.worldMap) < 0.45) {
      const grown = expandWorld(state.worldMap)
      if (grown !== state.worldMap) {
        newWorldMap = grown
        expansionLog = [
          logEntry({ ...state, time: newTime }, '🌱 The city is growing — new territory opened up!', 'success'),
          ...expansionLog,
        ].slice(0, 80)
      }
    }

    set({
      time: newTime,
      agents: newAgents,
      worldMap: newWorldMap,
      creative: newCreative,
      trading: newTrading,
      eventLog: expansionLog,
      conversations: newConversations,
      totalCash: newCash,
      completedTaskCount: state.completedTaskCount + bizUpdate.completedDelta,
      relationships: newRelationships,
    })
  },

  // ── Build mode ──────────────────────────────────────────────────────────────

  placing: null,
  hoverTile: null,

  startPlacing: (lot) => set({ placing: lot, selectedAgentId: null, selectedBuildingId: null }),
  cancelPlacing: () => set({ placing: null, hoverTile: null }),
  setHoverTile: (t) => set({ hoverTile: t }),

  confirmPlaceAt: (tile) => {
    const state = get()
    const lot = state.placing
    if (!lot) return false

    // Anchor placement so the cursor is the footprint centre
    const pos = { x: tile.x - Math.floor(lot.tileW / 2), y: tile.y - Math.floor(lot.tileH / 2) }
    if (!canPlaceBuilding(state.worldMap, pos, lot.tileW, lot.tileH)) return false

    const funds = spendCash(state, lot.cost)
    if (!funds) return false

    const id = `lot_${state.worldMap.nextLotId}`
    const building: Building = {
      id,
      name: `${lot.typeName} #${state.worldMap.nextLotId}`,
      gridPos: pos,
      tileW: lot.tileW, tileH: lot.tileH,
      color: lot.color, roofColor: lot.roofColor, accentColor: lot.accentColor,
      doorTile: { x: pos.x + Math.floor(lot.tileW / 2), y: pos.y + lot.tileH - 1 },
      rooms: makeRoomsForLot(id, pos, lot.tileW, lot.tileH),
      custom: true,
      vacant: true,
      floors: lot.floors,
    }
    building.furniture = autoFurnish(building, 'mixed')

    let map = { ...state.worldMap, buildings: [...state.worldMap.buildings, building], nextLotId: state.worldMap.nextLotId + 1 }
    map.tiles = generateTiles(map.cols, map.rows, map.hRoads, map.vRoads, map.buildings)

    // Auto-expand when land runs low after a build
    const logs = [logEntry(state, `🏗️ ${building.name} constructed for $${lot.cost.toLocaleString()}. Assign a business to it!`, 'success')]
    if (freeGrassRatio(map) < 0.35) {
      const grown = expandWorld(map)
      if (grown !== map) {
        map = grown
        logs.unshift(logEntry(state, '🌱 The city is growing — new territory opened up!', 'success'))
      }
    }

    set({
      worldMap: map,
      creative: funds.creative,
      trading: funds.trading,
      totalCash: funds.creative.cash + funds.trading.accountBalance,
      eventLog: [...logs, ...state.eventLog].slice(0, 80),
      placing: null,
      hoverTile: null,
      selectedBuildingId: id,
    })
    return true
  },

  setBuildingStyle: (id, style) => {
    const state = get()
    const updated = state.worldMap.buildings.map(b2 =>
      b2.id === id ? { ...b2, ...style } : b2
    )
    set({ worldMap: { ...state.worldMap, buildings: updated } })
  },

  assignBusiness: (id, name, businessType) => {
    const state = get()
    const b = state.worldMap.buildings.find(b2 => b2.id === id)
    if (!b) return
    const updated = state.worldMap.buildings.map(b2 =>
      b2.id === id ? { ...b2, name, businessType, vacant: false } : b2
    )
    set({
      worldMap: { ...state.worldMap, buildings: updated },
      eventLog: [logEntry(state, `🏪 "${name}" is now open for business (${businessType})!`, 'success'), ...state.eventLog].slice(0, 80),
    })
  },

  hireAgent: (buildingId, name) => {
    const state = get()
    const b = state.worldMap.buildings.find(b2 => b2.id === buildingId)
    if (!b || b.vacant || b.rooms.length === 0) return false

    const funds = spendCash(state, HIRE_COST)
    if (!funds) return false

    const idx = state.agents.length
    const [color, accentColor] = AGENT_PALETTES[idx % AGENT_PALETTES.length]
    const room = b.rooms[idx % b.rooms.length]
    const spawn = { ...b.doorTile }

    const agent: Agent = {
      id: `hired_${Date.now()}`,
      name,
      role: 'worker',
      color, accentColor,
      homeBuilding: buildingId,
      workBuilding: buildingId,
      workRoom: room.id,
      gridPos: spawn,
      pixelPos: gridToPixel(spawn),
      path: [],
      state: 'at_work',
      mood: 'happy',
      energy: 100, stress: 0,
      taskProgress: 0, taskName: 'Getting settled in',
      speech: '👋 First day on the job!', speechTimer: 5,
      currentRoom: null,
      lifeNeeds: defaultLifeNeeds(),
      isAvenger: false,
      signalsGiven: 0, signalsHit: 0, streak: 0, bestStreak: 0,
    }

    set({
      agents: [...state.agents, agent],
      creative: funds.creative,
      trading: funds.trading,
      totalCash: funds.creative.cash + funds.trading.accountBalance,
      eventLog: [logEntry(state, `👋 ${name} joined ${b.name}!`, 'success'), ...state.eventLog].slice(0, 80),
    })
    return true
  },

  demolishBuilding: (id) => {
    const state = get()
    const b = state.worldMap.buildings.find(b2 => b2.id === id)
    if (!b || !b.custom) return
    const buildings = state.worldMap.buildings.filter(b2 => b2.id !== id)
    const map = {
      ...state.worldMap,
      buildings,
      tiles: generateTiles(state.worldMap.cols, state.worldMap.rows, state.worldMap.hRoads, state.worldMap.vRoads, buildings),
    }
    set({
      worldMap: map,
      agents: state.agents.filter(a => a.workBuilding !== id && a.homeBuilding !== id),
      selectedBuildingId: state.selectedBuildingId === id ? null : state.selectedBuildingId,
      eventLog: [logEntry(state, `💥 ${b.name} was demolished.`, 'warning'), ...state.eventLog].slice(0, 80),
    })
  },

  expandTerritory: () => {
    const state = get()
    const grown = expandWorld(state.worldMap)
    if (grown === state.worldMap) return
    set({
      worldMap: grown,
      eventLog: [logEntry(state, '🌱 Territory expanded — more land to build on!', 'success'), ...state.eventLog].slice(0, 80),
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
      id: `evt_desk_${Date.now()}`,
      simMinute,
      timeLabel: `Day ${s.time.day} ${h}:${m}`,
      message,
      type,
      agentId: 'cole_structure',
    }
    set(s2 => ({ eventLog: [entry, ...s2.eventLog].slice(0, 80) }))
  },

  setDeskTask: (task) => set(s => ({
    agents: s.agents.map(a =>
      a.id === 'cole_structure'
        ? { ...a, taskName: task, state: task ? 'working' : a.state }
        : a
    ),
  })),

  chatAgentId: null,
  openAgentChat: (id) => set({ chatAgentId: id }),

  // ── Market analysis ─────────────────────────────────────────────────────────

  market: makeInitialMarket(),

  setMarketApiKey: (key) => {
    saveApiKey(key.trim())
    set(s => ({ market: { ...s.market, apiKey: key.trim() } }))
    void get().refreshMarket()
  },

  refreshMarket: async () => {
    const { market } = get()
    if (market.fetching) return
    set(s => ({ market: { ...s.market, fetching: true } }))
    try {
      const results = await Promise.all(
        INSTRUMENTS.map(def => analyzeInstrument(def, get().market.apiKey))
      )
      const instruments = { ...get().market.instruments }
      for (const r of results) instruments[r.symbol] = r
      set(s => ({ market: { ...s.market, instruments, lastError: null, fetching: false } }))
    } catch (e) {
      set(s => ({
        market: { ...s.market, fetching: false, lastError: e instanceof Error ? e.message : 'fetch failed' },
      }))
    }
  },

  commandAgent: (agentId, cmd) => {
    const state = get()
    set({
      agents: state.agents.map(a => {
        if (a.id !== agentId) return a
        return {
          ...a,
          command: cmd,
          path: [],
          speech: cmd.kind === 'use' ? '🕹️ On it!' : '🕹️ Heading over!',
          speechTimer: 3,
          taskName: cmd.kind === 'use' ? `Ordered: use ${cmd.furnitureKind}` : 'Ordered: go here',
        }
      }),
    })
  },

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
      // Migrate old saves that predate the dynamic world
      const wm = saved.worldMap as Partial<SimState['worldMap']> | undefined
      const hRoads = wm?.hRoads ?? [7]
      const vRoads = wm?.vRoads ?? [9, 20]
      const buildings = (wm?.buildings ?? makeInitialWorld().buildings).map(b =>
        b.furniture ? b : { ...b, furniture: autoFurnish(b, furnishStyleFor(b)) }
      )
      const cols = wm?.cols ?? 34
      const rows = wm?.rows ?? 18
      // Purge retired signal-era roster; inject the analysis team if missing
      const keptAgents = saved.agents.filter(a => !RETIRED_AGENT_IDS.has(a.id))
      const haveIds = new Set(keptAgents.map(a => a.id))
      const freshAnalysts = makeInitialAgents().filter(
        a => ANALYST_DEFS.some(d => d.id === a.id) && !haveIds.has(a.id)
      )
      set({
        ...saved,
        agents: [...keptAgents, ...freshAnalysts].map(a => a.lifeNeeds ? a : { ...a, lifeNeeds: defaultLifeNeeds() }),
        relationships: saved.relationships ?? {},
        market: get().market,
        worldMap: {
          cols, rows, buildings, hRoads, vRoads,
          nextLotId: wm?.nextLotId ?? 1,
          expansions: wm?.expansions ?? 0,
          tiles: generateTiles(cols, rows, hRoads, vRoads, buildings),
        },
        placing: null,
        hoverTile: null,
      })
    }
  },

  reset: () => {
    clearSave()
    set({ ...makeInitialState(), market: get().market })
  },
}))

// ── Market auto-refresh (real clock, independent of sim speed) ────────────────
if (typeof window !== 'undefined') {
  setTimeout(() => { void useSimStore.getState().refreshMarket() }, 1500)
  setInterval(() => { void useSimStore.getState().refreshMarket() }, 120_000)
}
