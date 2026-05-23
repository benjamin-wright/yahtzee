import type { GameState } from './types'
import { initialState } from './reducer'

const STORAGE_KEY = 'yahtzee-state'

export function loadState(): GameState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return initialState
    const parsed = JSON.parse(raw) as GameState
    // Backward compat: older saved states may not have rollMode
    return { ...parsed, rollMode: parsed.rollMode ?? 'manual' }
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
