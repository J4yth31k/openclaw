import type { Agent, SimState, GameTime } from '../types'
import { simMinuteOfDay, timeLabel } from './TimeSystem'
import { buildPath } from './MovementSystem'
import { worldMap, AGENT_DEFS } from '../data/worldData'
import { AGENT_SPEECHES } from '../data/businessData'
import { bus } from './EventBus'
import type { Vec2 } from '../types'

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
        const dest = getDoor(agent.workBuilding)
        patches.path = buildPath(agent.gridPos, dest)
      }
      break

    case 'commuting_to_work':
      if (agent.path.length === 0 || minuteOfDay >= ARRIVE_MINUTE) {
        const room = getRoom(agent.workBuilding, agent.workRoom)
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
      const progress = agent.taskProgress + dtSec / 180  // ~3 min per task
      if (progress >= 1) {
        bus.emit('task_complete', { agentId: agent.id, role: agent.role, time: state.time })
        const nextRoom = pickNextRoom(agent)
        patches.taskProgress = 0
        patches.taskName = 'Moving to next task'
        patches.path = buildPath(agent.gridPos, nextRoom)
        patches.state = 'at_work'
      } else {
        patches.taskProgress = progress
      }

      // Random speech
      if (Math.random() < 0.002) {
        const lines = AGENT_SPEECHES[agent.role] ?? []
        const line = lines[Math.floor(Math.random() * lines.length)]
        patches.speech = line
        patches.speechTimer = 5
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
        const homeDoor = getDoor(agent.homeBuilding)
        patches.path = buildPath(agent.gridPos, homeDoor)
      }
      break
    }

    case 'on_break': {
      patches.stress = Math.max(0, agent.stress - dtSec * 2)
      const breakDone = agent.stress <= 30
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
        patches.path = buildPath(agent.gridPos, getDoor(agent.homeBuilding))
      }
      break
    }

    case 'commuting_home':
      if (agent.path.length === 0 || minuteOfDay >= HOME_MINUTE) {
        const def = AGENT_DEFS.find(d => d.id === agent.id)
        if (def) {
          patches.state = 'arriving_home'
          patches.path = buildPath(agent.gridPos, def.spawnTile)
          patches.taskName = 'Arriving home'
        }
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

function getDoor(buildingId: string): Vec2 {
  const b = worldMap.buildings.find(b => b.id === buildingId)
  return b ? { ...b.doorTile } : { x: 13, y: 10 }
}

function getRoom(buildingId: string, roomId: string) {
  const b = worldMap.buildings.find(b => b.id === buildingId)
  return b?.rooms.find(r => r.id === roomId)
}

function pickNextRoom(agent: Agent): Vec2 {
  const b = worldMap.buildings.find(b => b.id === agent.workBuilding)
  if (!b || b.rooms.length === 0) return getDoor(agent.workBuilding)
  const r = b.rooms[Math.floor(Math.random() * b.rooms.length)]
  return { ...r.gridPos }
}

function roleTaskName(role: string): string {
  const map: Record<string, string> = {
    research_agent: 'Researching trends',
    design_agent: 'Designing product',
    qc_agent: 'Quality checking',
    upload_agent: 'Uploading drafts',
    trader_agent: 'Analyzing market',
    risk_manager: 'Reviewing risk',
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
