import type { SimState } from '../types'
import { saveSimState, loadSimState } from './EtsyBridge'

const SAVE_KEY = 'simworld_save'

export function saveGame(state: SimState) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state))
  } catch {
    console.warn('Save failed — localStorage quota exceeded')
  }
  // Mirror to Railway for cross-device persistence
  saveSimState(state)
}

export function loadGame(): SimState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as SimState
  } catch {
    return null
  }
}

export function clearSave() {
  localStorage.removeItem(SAVE_KEY)
}

/**
 * Try Railway first, fall back to localStorage.
 * Call this on app init to restore cross-device state.
 */
export async function loadGameWithCloud(): Promise<SimState | null> {
  try {
    const cloud = await loadSimState()
    if (cloud) {
      // Mirror to localStorage so next sync is fast
      localStorage.setItem(SAVE_KEY, JSON.stringify(cloud))
      return cloud as SimState
    }
  } catch {
    // Railway unavailable — fall through to local
  }
  return loadGame()
}
