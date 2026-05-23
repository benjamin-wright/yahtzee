import type { Category, Die, PlayerScore } from '../scoring/types'

export type Phase = 'setup' | 'rolling' | 'selecting' | 'scoring' | 'gameover'

export interface GameState {
  phase: Phase
  players: string[]
  scores: PlayerScore[]
  currentPlayer: number
  dice: Die[]
  selectedCategory: Category | null
  yahtzeeBonuses: number[]
  isBonusYahtzee: boolean
}

export type Action =
  | { type: 'START_GAME'; players: string[] }
  | { type: 'ADD_DIE'; value: Die }
  | { type: 'REMOVE_DIE'; index: number }
  | { type: 'CONFIRM_DICE' }
  | { type: 'SCORE_CATEGORY'; category: Category }
  | { type: 'END_TURN' }
  | { type: 'NEXT_TURN' }
  | { type: 'RESET_GAME' }
