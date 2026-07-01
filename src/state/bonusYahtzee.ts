import { scoreYahtzee } from '../scoring/categories'
import type { Die, PlayerScore } from '../scoring/types'

export function isBonusYahtzeeTurn(dice: Die[], score: PlayerScore | undefined): boolean {
  return scoreYahtzee(dice) === 50 && score?.yahtzee === 50
}
