import type { Category, Die, PlayerScore } from '../scoring/types'

export type Phase = 'setup' | 'rolling' | 'selecting' | 'scoring' | 'gameover' | 'overall_scores'
export type RollMode = 'manual' | 'random'

export interface RoundResult {
  scores: PlayerScore[]
  yahtzeeBonuses: number[]
}

export interface GameState {
  phase: Phase
  players: string[]
  rounds: RoundResult[]
  scores: PlayerScore[]
  currentPlayer: number
  dice: Die[]
  selectedCategory: Category | null
  yahtzeeBonuses: number[]
  isBonusYahtzee: boolean
  rollMode: RollMode
}

export type Action =
  | { type: 'START_GAME'; players: string[] }
  | { type: 'ADD_DIE'; value: Die }
  | { type: 'REMOVE_DIE'; index: number }
  | { type: 'SET_DICE'; dice: Die[] }
  | { type: 'CLEAR_DICE' }
  | { type: 'SET_ROLL_MODE'; mode: RollMode }
  | { type: 'CONFIRM_DICE' }
  | { type: 'SCORE_CATEGORY'; category: Category }
  | { type: 'END_TURN' }
  | { type: 'NEXT_TURN' }
  | { type: 'START_ROUND' }
  | { type: 'CANCEL_ROUND' }
  | { type: 'RESET_GAME' }
