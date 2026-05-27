import type { SimState } from '../types'

const SAVE_KEY = 'simworld_save'

export function saveGame(state: SimState) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state))
  } catch {
    console.warn('Save failed — likely localStorage quota exceeded')
  }
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
