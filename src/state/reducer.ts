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
  selectedCategory: null,
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
        selectedCategory: null,
      }

    case 'ADD_DIE':
      if (state.phase !== 'rolling' || state.dice.length >= 5) return state
      return { ...state, dice: [...state.dice, action.value] }

    case 'REMOVE_DIE':
      if (state.phase !== 'rolling') return state
      return {
        ...state,
        dice: state.dice.filter((_, i) => i !== action.index),
      }

    case 'CONFIRM_DICE':
      if (state.phase !== 'rolling' || state.dice.length !== 5) return state
      return { ...state, phase: 'selecting', selectedCategory: null }

    case 'SCORE_CATEGORY':
      if (state.phase !== 'selecting') return state
      if (state.scores[state.currentPlayer]?.[action.category] !== undefined) return state
      return { ...state, selectedCategory: action.category }

    case 'END_TURN': {
      if (state.phase !== 'selecting' || !state.selectedCategory) return state
      const selectedCategory = state.selectedCategory
      const newScores = state.scores.map((s, i) => {
        if (i !== state.currentPlayer) return s
        return {
          ...s,
          [selectedCategory]: scoreCategory(selectedCategory, state.dice),
        }
      })
      if (isGameOver(newScores)) {
        return { ...state, phase: 'gameover', scores: newScores, dice: [], selectedCategory: null }
      }
      return { ...state, phase: 'scoring', scores: newScores, dice: [], selectedCategory: null }
    }

    case 'NEXT_TURN': {
      if (state.phase !== 'scoring') return state
      const next = (state.currentPlayer + 1) % state.players.length
      return { ...state, phase: 'rolling', currentPlayer: next, dice: [], selectedCategory: null }
    }

    case 'RESET_GAME':
      return initialState

    default:
      return state
  }
}
