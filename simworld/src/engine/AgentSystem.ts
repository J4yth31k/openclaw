import type { Agent, SimState, GameTime, WorldMap, FurnitureKind, LifeNeeds, Mood } from '../types'
import { defaultLifeNeeds } from '../types'
import { simMinuteOfDay, timeLabel } from './TimeSystem'
import { buildPath } from './MovementSystem'
import { ALL_AGENT_DEFS } from '../data/worldData'
import { AGENT_SPEECHES } from '../data/businessData'
import { analystSpeechLine } from './MarketData'
import type { MarketState } from './MarketData'
import { bus } from './EventBus'
import type { Vec2 } from '../types'

// ── Life-needs tuning (units per sim-second) ─────────────────────────────────

const DRAIN = {
  hunger:  0.0038,   // empty in ~7 sim-hours awake
  fun:     0.0030,
  social:  0.0024,
  hygiene: 0.0013,
}
const EAT_RATE   = 0.09    // refill while eating (~20 sim-min to full)
const CHILL_RATE = 0.07
const HOME_RELAX = 0.02

function drainNeeds(n: LifeNeeds, dtSec: number, sleeping: boolean): LifeNeeds {
  if (sleeping) {
    return {
      hunger:  Math.max(0, n.hunger - DRAIN.hunger * 0.25 * dtSec),
      fun:     Math.min(100, n.fun + 0.004 * dtSec),
      social:  n.social,
      hygiene: Math.min(100, n.hygiene + 0.012 * dtSec),  // overnight shower & rest
    }
  }
  return {
    hunger:  Math.max(0, n.hunger - DRAIN.hunger * dtSec),
    fun:     Math.max(0, n.fun - DRAIN.fun * dtSec),
    social:  Math.max(0, n.social - DRAIN.social * dtSec),
    hygiene: Math.max(0, n.hygiene - DRAIN.hygiene * dtSec),
  }
}

function moodFromNeeds(n: LifeNeeds, energy: number, stress: number): Mood {
  if (energy < 22) return 'tired'
  if (stress > 72) return 'stressed'
  const avg = (n.hunger + n.fun + n.social + n.hygiene) / 4
  if (avg < 32) return 'stressed'
  if (avg > 86 && energy > 60) return 'excited'
  if (avg > 68) return 'happy'
  return 'neutral'
}

// Break-type markers (stored in taskName so on_break knows what it's restoring)
const TASK_EATING   = 'Grabbing a bite 🍕'
const TASK_CHILLING = 'Relaxing on the couch 📺'

// ── Schedule ──────────────────────────────────────────────────────────────────

const WAKE_MINUTE    = 7 * 60        //  7:00
const LEAVE_MINUTE   = 7 * 60 + 30  //  7:30
const ARRIVE_MINUTE  = 8 * 60        //  8:00
const LEAVE_WORK_MIN = 17 * 60       // 17:00
const HOME_MINUTE    = 17 * 60 + 45  // 17:45
const SLEEP_MINUTE   = 22 * 60       // 22:00

export function updateAgent(
  agent: Agent,
  state: SimState,
  dtSec: number,
): Partial<Agent> {
  const minuteOfDay = simMinuteOfDay(state.time)
  const patches: Partial<Agent> = {}

  // ── Speech timer ─────────────────────────────────────────────────────────
  if (agent.speechTimer > 0) {
    patches.speechTimer = Math.max(0, agent.speechTimer - dtSec)
    if ((patches.speechTimer ?? agent.speechTimer) === 0) patches.speech = null
  }

  // ── Passive energy / stress ───────────────────────────────────────────────
  if (agent.state === 'sleeping') {
    patches.energy = Math.min(100, agent.energy + dtSec * 4)
    patches.stress = Math.max(0, agent.stress - dtSec * 3)
  } else if (agent.state === 'working') {
    patches.energy = Math.max(0, agent.energy - dtSec * 0.6)
    patches.stress = Math.min(100, agent.stress + dtSec * 0.3)
  }

  // ── Life needs (drain / restore) ──────────────────────────────────────────
  const needs0 = agent.lifeNeeds ?? defaultLifeNeeds()
  let needs = drainNeeds(needs0, dtSec, agent.state === 'sleeping')
  if (agent.state === 'at_home') {
    // Dinner + downtime at home
    needs = {
      ...needs,
      hunger: Math.min(100, needs.hunger + HOME_RELAX * 2 * dtSec),
      fun:    Math.min(100, needs.fun + HOME_RELAX * dtSec),
    }
  }
  patches.lifeNeeds = needs

  // ── Mood follows needs ─────────────────────────────────────────────────────
  const newMood = moodFromNeeds(needs, patches.energy ?? agent.energy, patches.stress ?? agent.stress)
  if (newMood !== agent.mood) patches.mood = newMood

  // ── Player command (overrides the daily schedule) ──────────────────────────
  if (agent.command) {
    const cmd = agent.command

    // Chat: pursue the (possibly moving) target agent, greet when close
    if (cmd.kind === 'chat') {
      const other = state.agents.find(a => a.id === cmd.targetAgentId)
      if (!other) {
        patches.command = null
        return patches
      }
      const dx = other.pixelPos.x - agent.pixelPos.x
      const dy = other.pixelPos.y - agent.pixelPos.y
      if (dx * dx + dy * dy < 34 * 34) {
        // Close enough — greet; the ambient social pass takes it from here
        patches.command = null
        patches.path = []
        patches.speech = `👋 Hey, ${other.name}!`
        patches.speechTimer = 4
        patches.taskName = `Chatting with ${other.name}`
        const n = patches.lifeNeeds ?? needs
        patches.lifeNeeds = { ...n, social: Math.min(100, n.social + 10) }
        return patches
      }
      // Re-path if idle or the target wandered off
      const tgt = { ...other.gridPos }
      const moved = Math.abs(tgt.x - cmd.target.x) + Math.abs(tgt.y - cmd.target.y) > 2
      if (agent.path.length === 0 || moved) {
        patches.command = { ...cmd, target: tgt }
        patches.path = buildPath(agent.gridPos, tgt)
      }
      return patches
    }

    const arrived = agent.gridPos.x === cmd.target.x && agent.gridPos.y === cmd.target.y

    if (!arrived) {
      if (agent.path.length === 0) {
        patches.path = buildPath(agent.gridPos, cmd.target)
      }
      return patches
    }

    // Arrived — perform the action
    let done = false
    if (cmd.kind === 'goto') {
      done = true
    } else {
      switch (cmd.furnitureKind) {
        case 'fridge':
          patches.taskName = 'Eating 🍕'
          patches.lifeNeeds = { ...needs, hunger: Math.min(100, needs.hunger + EAT_RATE * dtSec) }
          done = patches.lifeNeeds.hunger >= 98
          break
        case 'couch':
        case 'tv':
          patches.taskName = 'Relaxing 📺'
          patches.lifeNeeds = { ...needs, fun: Math.min(100, needs.fun + CHILL_RATE * dtSec) }
          done = patches.lifeNeeds.fun >= 98
          break
        case 'shower':
          patches.taskName = 'Showering 🚿'
          patches.lifeNeeds = { ...needs, hygiene: Math.min(100, needs.hygiene + EAT_RATE * dtSec) }
          done = patches.lifeNeeds.hygiene >= 98
          break
        case 'bed':
          patches.taskName = 'Napping 💤'
          patches.energy = Math.min(100, (patches.energy ?? agent.energy) + dtSec * 3)
          patches.stress = Math.max(0, (patches.stress ?? agent.stress) - dtSec * 2)
          done = (patches.energy ?? agent.energy) >= 98
          break
        case 'desk':
          patches.taskName = roleTaskName(agent.role)
          patches.state = 'working'
          done = true   // hand straight back to the work loop at this desk
          break
        default:
          done = true
      }
    }

    if (done) {
      patches.command = null
      patches.speech = '✅ Done!'
      patches.speechTimer = 3
      // Recover into the schedule: machine will route them from here
      if (patches.state !== 'working') {
        if (minuteOfDay >= WAKE_MINUTE && minuteOfDay < LEAVE_WORK_MIN) {
          patches.state = 'waking'          // schedule sends them to work
        } else if (minuteOfDay >= LEAVE_WORK_MIN && minuteOfDay < SLEEP_MINUTE) {
          patches.state = 'commuting_home'
          patches.taskName = 'Heading home'
          patches.path = buildPath(agent.gridPos, getDoor(state.worldMap, agent.homeBuilding))
        } else {
          patches.state = 'at_home'
        }
      }
    }
    return patches
  }

  // ── State transitions ─────────────────────────────────────────────────────
  switch (agent.state) {
    case 'sleeping':
      if (minuteOfDay >= WAKE_MINUTE) {
        patches.state = 'waking'
        patches.speech = '☀️ Good morning!'
        patches.speechTimer = 4
        speak(agent, state.time)
      }
      break

    case 'waking':
      if (minuteOfDay >= LEAVE_MINUTE) {
        patches.state = 'commuting_to_work'
        patches.taskName = 'Commuting to work'
        const dest = getDoor(state.worldMap, agent.workBuilding)
        patches.path = buildPath(agent.gridPos, dest)
      }
      break

    case 'commuting_to_work':
      if (agent.path.length === 0 || minuteOfDay >= ARRIVE_MINUTE) {
        const room = getRoom(state.worldMap, agent.workBuilding, agent.workRoom)
        if (room) {
          patches.state = 'at_work'
          patches.path = buildPath(agent.gridPos, room.gridPos)
          patches.taskName = 'Entering building'
        }
      }
      break

    case 'at_work':
      if (agent.path.length === 0) {
        patches.state = 'working'
        patches.taskName = roleTaskName(agent.role)
        patches.taskProgress = 0
        patches.currentRoom = agent.workRoom
      }
      break

    case 'working': {
      // ── Needs-driven interruptions ─────────────────────────────────────
      if (needs.hunger < 22) {
        patches.state = 'on_break'
        patches.taskName = TASK_EATING
        patches.speech = '🍕 Getting hungry!'
        patches.speechTimer = 4
        const fridge = nearestFurniture(state.worldMap, agent.workBuilding, 'fridge', agent.gridPos)
        if (fridge) patches.path = buildPath(agent.gridPos, fridge)
        break
      }
      if (needs.fun < 18) {
        patches.state = 'on_break'
        patches.taskName = TASK_CHILLING
        patches.speech = '📺 Need a breather…'
        patches.speechTimer = 4
        const couch = nearestFurniture(state.worldMap, agent.workBuilding, 'couch', agent.gridPos)
          ?? nearestFurniture(state.worldMap, agent.workBuilding, 'tv', agent.gridPos)
        if (couch) patches.path = buildPath(agent.gridPos, couch)
        break
      }

      const progress = agent.taskProgress + dtSec / 180  // ~3 min per task
      if (progress >= 1) {
        bus.emit('task_complete', { agentId: agent.id, role: agent.role, time: state.time })
        const nextRoom = pickNextRoom(state.worldMap, agent)
        patches.taskProgress = 0
        patches.taskName = 'Moving to next task'
        patches.path = buildPath(agent.gridPos, nextRoom)
        patches.state = 'at_work'
      } else {
        patches.taskProgress = progress
      }

      // Random speech — analysts quote real levels from the live market data
      if (Math.random() < 0.002) {
        const market = (state as SimState & { market?: MarketState }).market
        const liveLine = analystSpeechLine(agent.role, market)
        const lines = AGENT_SPEECHES[agent.role] ?? []
        const line = liveLine && Math.random() < 0.75
          ? liveLine
          : lines[Math.floor(Math.random() * lines.length)]
        if (line) {
          patches.speech = line
          patches.speechTimer = 5
        }
      }

      // Break if stressed
      if (agent.stress > 70 && Math.random() < 0.003) {
        patches.state = 'on_break'
        patches.taskName = 'Taking a break ☕'
        patches.speech = '☕ Need a breather!'
        patches.speechTimer = 4
      }

      if (minuteOfDay >= LEAVE_WORK_MIN) {
        patches.state = 'commuting_home'
        patches.taskName = 'Commuting home'
        patches.currentRoom = null
        const homeDoor = getDoor(state.worldMap, agent.homeBuilding)
        patches.path = buildPath(agent.gridPos, homeDoor)
      }
      break
    }

    case 'on_break': {
      patches.stress = Math.max(0, agent.stress - dtSec * 2)

      let breakDone: boolean
      if (agent.taskName === TASK_EATING) {
        // Only refill once we've reached the fridge
        if (agent.path.length === 0) {
          patches.lifeNeeds = { ...needs, hunger: Math.min(100, needs.hunger + EAT_RATE * dtSec) }
        }
        breakDone = (patches.lifeNeeds ?? needs).hunger >= 85
      } else if (agent.taskName === TASK_CHILLING) {
        if (agent.path.length === 0) {
          patches.lifeNeeds = { ...needs, fun: Math.min(100, needs.fun + CHILL_RATE * dtSec) }
        }
        breakDone = (patches.lifeNeeds ?? needs).fun >= 80
      } else {
        breakDone = agent.stress <= 30
      }

      if (breakDone) {
        patches.state = 'working'
        patches.taskName = roleTaskName(agent.role)
        patches.speech = '✅ Refreshed!'
        patches.speechTimer = 3
      }
      if (minuteOfDay >= LEAVE_WORK_MIN) {
        patches.state = 'commuting_home'
        patches.taskName = 'Heading home'
        patches.currentRoom = null
        patches.path = buildPath(agent.gridPos, getDoor(state.worldMap, agent.homeBuilding))
      }
      break
    }

    case 'commuting_home':
      if (agent.path.length === 0 || minuteOfDay >= HOME_MINUTE) {
        // Prefer a bed in the home building; fall back to the original spawn spot
        const bed = nearestFurniture(state.worldMap, agent.homeBuilding, 'bed', agent.gridPos)
        const def = ALL_AGENT_DEFS.find(d => d.id === agent.id)
        const restSpot = bed
          ?? def?.spawnTile
          ?? getRoom(state.worldMap, agent.homeBuilding, `${agent.homeBuilding}_room0`)?.gridPos
          ?? getHomeSpot(state.worldMap, agent.homeBuilding)
        patches.state = 'arriving_home'
        patches.path = buildPath(agent.gridPos, restSpot)
        patches.taskName = 'Arriving home'
      }
      break

    case 'arriving_home':
      if (agent.path.length === 0) {
        patches.state = 'at_home'
        patches.taskName = 'Relaxing at home'
        patches.speech = '🏠 Home sweet home!'
        patches.speechTimer = 4
      }
      break

    case 'at_home':
      if (minuteOfDay >= SLEEP_MINUTE || minuteOfDay < WAKE_MINUTE) {
        patches.state = 'sleeping'
        patches.taskName = null
        patches.speech = '💤 ZZZ'
        patches.speechTimer = 3
      }
      break
  }

  return patches
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDoor(map: WorldMap, buildingId: string): Vec2 {
  const b = map.buildings.find(b => b.id === buildingId)
  return b ? { ...b.doorTile } : { x: 13, y: 10 }
}

function getRoom(map: WorldMap, buildingId: string, roomId: string) {
  const b = map.buildings.find(b => b.id === buildingId)
  return b?.rooms.find(r => r.id === roomId)
}

function getHomeSpot(map: WorldMap, buildingId: string): Vec2 {
  const b = map.buildings.find(b => b.id === buildingId)
  if (!b) return { x: 13, y: 10 }
  return b.rooms[0] ? { ...b.rooms[0].gridPos } : { ...b.doorTile }
}

function nearestFurniture(map: WorldMap, buildingId: string, kind: FurnitureKind, from: Vec2): Vec2 | null {
  const b = map.buildings.find(b2 => b2.id === buildingId)
  if (!b?.furniture) return null
  let best: Vec2 | null = null
  let bestD = Infinity
  for (const f of b.furniture) {
    if (f.kind !== kind) continue
    const d = Math.abs(f.gridPos.x - from.x) + Math.abs(f.gridPos.y - from.y)
    if (d < bestD) { bestD = d; best = { ...f.gridPos } }
  }
  return best
}

function pickNextRoom(map: WorldMap, agent: Agent): Vec2 {
  const b = map.buildings.find(b => b.id === agent.workBuilding)
  if (!b || b.rooms.length === 0) return getDoor(map, agent.workBuilding)
  const r = b.rooms[Math.floor(Math.random() * b.rooms.length)]
  return { ...r.gridPos }
}

function roleTaskName(role: string): string {
  const map: Record<string, string> = {
    research_agent:    'Researching trends',
    design_agent:      'Designing product',
    qc_agent:          'Quality checking',
    upload_agent:      'Uploading drafts',
    trader_agent:      'Analyzing market',
    risk_manager:      'Reviewing risk',
    // Analysis desk
    tech_analyst:      'Scanning EMAs & MACD',
    fundamentals_agent:'Tracking Fed & ECB',
    sentiment_agent:   'Reading Fear & Greed',
    orderflow_agent:   'Scanning order books',
    correlation_agent: 'Running cross-asset matrix',
    director_agent:    'Inspecting agents',
    tradeideas_agent:  'Scoring confluence',
    news_agent:        'Parsing headlines',
    webhook_agent:     'Monitoring webhooks',
    hq_risk_manager:   'Sizing positions',
    backtest_agent:    'Crunching history data',
    news_analyst:      'Reading macro headlines',
    volume_analyst:    'Building volume profile',
    liquidity_analyst: 'Mapping liquidity pools',
    session_analyst:   'Marking session levels',
    structure_analyst: 'Charting market structure',
    worker:            'Running the business',
  }
  return map[role] ?? 'Working'
}

function speak(agent: Agent, time: GameTime) {
  bus.emit('agent_speech', {
    agentId: agent.id,
    message: `${agent.name}: ${agent.speech}`,
    time,
  })
}
