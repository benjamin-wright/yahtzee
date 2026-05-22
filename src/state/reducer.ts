import type { PlayerScore } from '../scoring/types'
import { CATEGORIES } from '../scoring/types'
import { scoreCategory } from '../scoring/categories'
import type { GameState, Action } from './types'

export const initialState: GameState = {
  phase: 'setup',
  players: [],
  scores: [],
  currentPlayer: 0,
  dice: [],
}

function allCategoriesScored(score: PlayerScore): boolean {
  return CATEGORIES.every(cat => score[cat] !== undefined)
}

function isGameOver(scores: PlayerScore[]): boolean {
  return scores.every(allCategoriesScored)
}

export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'START_GAME':
      return {
        phase: 'scoring',
        players: action.players,
        scores: action.players.map(() => ({})),
        currentPlayer: -1,
        dice: [],
      }

    case 'ADD_DIE':
      if (state.phase !== 'rolling') return state
      return { ...state, dice: [...state.dice, action.value] }

    case 'REMOVE_DIE':
      if (state.phase !== 'rolling') return state
      return {
        ...state,
        dice: state.dice.filter((_, i) => i !== action.index),
      }

    case 'CONFIRM_DICE':
      if (state.phase !== 'rolling' || state.dice.length === 0) return state
      return { ...state, phase: 'selecting' }

    case 'SCORE_CATEGORY': {
      if (state.phase !== 'selecting') return state
      const newScores = state.scores.map((s, i) =>
        i === state.currentPlayer
          ? { ...s, [action.category]: scoreCategory(action.category, state.dice) }
          : s
      )
      if (isGameOver(newScores)) {
        return { ...state, phase: 'gameover', scores: newScores, dice: [] }
      }
      return { ...state, phase: 'scoring', scores: newScores, dice: [] }
    }

    case 'NEXT_TURN': {
      if (state.phase !== 'scoring') return state
      const next = (state.currentPlayer + 1) % state.players.length
      return { ...state, phase: 'rolling', currentPlayer: next, dice: [] }
    }

    case 'RESET_GAME':
      return initialState

    default:
      return state
  }
}
