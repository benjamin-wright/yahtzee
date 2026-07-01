import type { PlayerScore } from '../scoring/types'
import { CATEGORIES } from '../scoring/types'
import { scoreCategory, scoreYahtzee } from '../scoring/categories'
import type { GameState, Action } from './types'

export const initialState: GameState = {
  phase: 'setup',
  players: [],
  rounds: [],
  scores: [],
  currentPlayer: 0,
  dice: [],
  selectedCategory: null,
  yahtzeeBonuses: [],
  isBonusYahtzee: false,
  rollMode: 'manual',
}

function allCategoriesScored(score: PlayerScore): boolean {
  return CATEGORIES.every(cat => score[cat] !== undefined)
}

function isGameOver(scores: PlayerScore[]): boolean {
  return scores.every(allCategoriesScored)
}

function isBonusYahtzeeTurn(state: GameState): boolean {
  const yahtzeeAlreadyScored = state.scores[state.currentPlayer]?.yahtzee === 50
  return scoreYahtzee(state.dice) === 50 && yahtzeeAlreadyScored
}

export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'START_GAME':
      return {
        phase: 'overall_scores',
        players: action.players,
        rounds: [],
        scores: action.players.map(() => ({})),
        currentPlayer: -1,
        dice: [],
        selectedCategory: null,
        yahtzeeBonuses: action.players.map(() => 0),
        isBonusYahtzee: false,
        rollMode: 'manual',
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

    case 'SET_DICE':
      if (state.phase !== 'rolling' || action.dice.length !== 5) return state
      return { ...state, dice: action.dice }

    case 'CLEAR_DICE':
      if (state.phase !== 'rolling') return state
      return { ...state, dice: [] }

    case 'SET_ROLL_MODE':
      return { ...state, rollMode: action.mode, dice: [], selectedCategory: null, isBonusYahtzee: false }

    case 'CONFIRM_DICE': {
      if (state.phase !== 'rolling' || state.dice.length !== 5) return state
      return { ...state, phase: 'selecting', selectedCategory: null, isBonusYahtzee: isBonusYahtzeeTurn(state) }
    }

    case 'SCORE_CATEGORY':
      if ((state.phase !== 'rolling' && state.phase !== 'selecting') || state.dice.length !== 5) return state
      if (state.scores[state.currentPlayer]?.[action.category] !== undefined) return state
      return {
        ...state,
        selectedCategory: state.selectedCategory === action.category ? null : action.category,
      }

    case 'END_TURN': {
      const isTurnActive = state.phase === 'rolling' || state.phase === 'selecting'
      const hasFullHand = state.dice.length === 5
      if (!isTurnActive || !hasFullHand) return state
      const selectedCategory = state.selectedCategory
      if (selectedCategory === null) return state
      const currentPlayerIdx = state.currentPlayer
      const newScores = state.scores.map((s, i) => {
        if (i !== currentPlayerIdx) return s
        return {
          ...s,
          [selectedCategory]: scoreCategory(selectedCategory, state.dice),
        }
      })
      const newYahtzeeBonuses = isBonusYahtzeeTurn(state)
        ? state.yahtzeeBonuses.map((b, i) => (i === currentPlayerIdx ? b + 1 : b))
        : state.yahtzeeBonuses
      if (isGameOver(newScores)) {
        return {
          ...state,
          phase: 'overall_scores',
          rounds: [...state.rounds, { scores: newScores, yahtzeeBonuses: newYahtzeeBonuses }],
          scores: state.players.map(() => ({})),
          yahtzeeBonuses: state.players.map(() => 0),
          currentPlayer: -1,
          dice: [],
          selectedCategory: null,
          isBonusYahtzee: false,
        }
      }
      return { ...state, phase: 'scoring', scores: newScores, yahtzeeBonuses: newYahtzeeBonuses, dice: [], selectedCategory: null, isBonusYahtzee: false }
    }

    case 'NEXT_TURN': {
      if (state.phase !== 'scoring') return state
      const next = (state.currentPlayer + 1) % state.players.length
      return { ...state, phase: 'rolling', currentPlayer: next, dice: [], selectedCategory: null, isBonusYahtzee: false }
    }

    case 'START_ROUND': {
      if (state.phase !== 'overall_scores') return state
      return {
        ...state,
        phase: 'scoring',
        scores: state.players.map(() => ({})),
        yahtzeeBonuses: state.players.map(() => 0),
        currentPlayer: -1,
        dice: [],
        selectedCategory: null,
        isBonusYahtzee: false,
      }
    }

    case 'CANCEL_ROUND': {
      if (state.phase === 'setup' || state.phase === 'overall_scores') return state
      return {
        ...state,
        phase: 'overall_scores',
        scores: state.players.map(() => ({})),
        yahtzeeBonuses: state.players.map(() => 0),
        currentPlayer: -1,
        dice: [],
        selectedCategory: null,
        isBonusYahtzee: false,
      }
    }

    case 'RESET_GAME':
      return initialState

    default:
      return state
  }
}
