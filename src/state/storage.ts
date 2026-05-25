import type { GameState } from './types'
import { initialState } from './reducer'

const STORAGE_KEY = 'yahtzee-state'

export function loadState(): GameState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return initialState
    const parsed = JSON.parse(raw) as GameState
    // Backward compat: older saved states may not have rollMode or rounds
    const rounds = parsed.rounds ?? []
    const phase = parsed.phase ?? 'setup'
    // Old 'gameover' states had no rounds; migrate to overall_scores with the round saved
    if (phase === 'gameover') {
      return {
        ...parsed,
        rollMode: parsed.rollMode ?? 'manual',
        rounds: [{ scores: parsed.scores, yahtzeeBonuses: parsed.yahtzeeBonuses }],
        scores: parsed.players.map(() => ({})),
        yahtzeeBonuses: parsed.players.map(() => 0),
        currentPlayer: -1,
        phase: 'overall_scores',
      }
    }
    return { ...parsed, rollMode: parsed.rollMode ?? 'manual', rounds }
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
