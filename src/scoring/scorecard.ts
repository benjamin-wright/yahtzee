import type { PlayerScore } from './types'
import { UPPER_CATEGORIES, LOWER_CATEGORIES } from './types'

const UPPER_BONUS_THRESHOLD = 63
const UPPER_BONUS_VALUE = 35

export function upperTotal(scores: PlayerScore): number {
  return UPPER_CATEGORIES.reduce((sum, cat) => sum + (scores[cat] ?? 0), 0)
}

export function upperBonus(scores: PlayerScore): number {
  return upperTotal(scores) >= UPPER_BONUS_THRESHOLD ? UPPER_BONUS_VALUE : 0
}

export function lowerTotal(scores: PlayerScore): number {
  return LOWER_CATEGORIES.reduce((sum, cat) => sum + (scores[cat] ?? 0), 0)
}

export function grandTotal(scores: PlayerScore, bonusYahtzees: number = 0): number {
  return upperTotal(scores) + upperBonus(scores) + lowerTotal(scores) + bonusYahtzees * 100
}
