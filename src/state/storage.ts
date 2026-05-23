import type { GameState } from './types'
import { initialState } from './reducer'

const STORAGE_KEY = 'yahtzee-state'

export function loadState(): GameState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return initialState
    return JSON.parse(raw) as GameState
  } catch {
    return initialState
  }
}

export function saveState(state: GameState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore write errors (e.g. private-browsing quota exceeded)
  }
}
