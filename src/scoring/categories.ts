import type { Category, Die } from './types'

function countFace(dice: Die[], face: Die): number {
  return dice.filter(d => d === face).length
}

function faceCounts(dice: Die[]): number[] {
  return ([1, 2, 3, 4, 5, 6] as Die[]).map(f => countFace(dice, f))
}

function sumAll(dice: Die[]): number {
  return dice.reduce((acc, d) => acc + d, 0)
}

export function scoreUpper(dice: Die[], face: Die): number {
  return countFace(dice, face) * face
}

export function scoreThreeOfAKind(dice: Die[]): number {
  return faceCounts(dice).some(c => c >= 3) ? sumAll(dice) : 0
}

export function scoreFourOfAKind(dice: Die[]): number {
  return faceCounts(dice).some(c => c >= 4) ? sumAll(dice) : 0
}

export function scoreFullHouse(dice: Die[]): number {
  const nonZero = faceCounts(dice).filter(c => c > 0)
  return nonZero.includes(3) && nonZero.includes(2) ? 25 : 0
}

export function scoreSmallStraight(dice: Die[]): number {
  const unique = [...new Set(dice)].sort().join('')
  const straights = ['1234', '2345', '3456']
  return straights.some(s => unique.includes(s)) ? 30 : 0
}

export function scoreLargeStraight(dice: Die[]): number {
  const unique = [...new Set(dice)].sort().join('')
  return unique === '12345' || unique === '23456' ? 40 : 0
}

export function scoreYahtzee(dice: Die[]): number {
  return faceCounts(dice).some(c => c === 5) ? 50 : 0
}

export function scoreChance(dice: Die[]): number {
  return sumAll(dice)
}

export function scoreCategory(category: Category, dice: Die[]): number {
  switch (category) {
    case 'ones':          return scoreUpper(dice, 1)
    case 'twos':          return scoreUpper(dice, 2)
    case 'threes':        return scoreUpper(dice, 3)
    case 'fours':         return scoreUpper(dice, 4)
    case 'fives':         return scoreUpper(dice, 5)
    case 'sixes':         return scoreUpper(dice, 6)
    case 'threeOfAKind':  return scoreThreeOfAKind(dice)
    case 'fourOfAKind':   return scoreFourOfAKind(dice)
    case 'fullHouse':     return scoreFullHouse(dice)
    case 'smallStraight': return scoreSmallStraight(dice)
    case 'largeStraight': return scoreLargeStraight(dice)
    case 'yahtzee':       return scoreYahtzee(dice)
    case 'chance':        return scoreChance(dice)
  }
}
