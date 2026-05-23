import { describe, it, expect } from 'vitest'
import {
  scoreCategory,
  scoreThreeOfAKind,
  scoreFourOfAKind,
  scoreFullHouse,
  scoreSmallStraight,
  scoreLargeStraight,
  scoreYahtzee,
  scoreChance,
} from './categories'
import { upperTotal, upperBonus, lowerTotal, grandTotal } from './scorecard'
import type { Die } from './types'

const d = (...values: number[]): Die[] => values as Die[]

describe('upper section', () => {
  it('scores ones', () => expect(scoreCategory('ones', d(1, 1, 3, 4, 5))).toBe(2))
  it('scores twos', () => expect(scoreCategory('twos', d(2, 2, 2, 4, 5))).toBe(6))
  it('scores threes', () => expect(scoreCategory('threes', d(3, 3, 3, 3, 5))).toBe(12))
  it('scores fours', () => expect(scoreCategory('fours', d(1, 2, 3, 4, 5))).toBe(4))
  it('scores fives', () => expect(scoreCategory('fives', d(5, 5, 5, 5, 5))).toBe(25))
  it('scores sixes', () => expect(scoreCategory('sixes', d(1, 2, 3, 4, 5))).toBe(0))
})

describe('threeOfAKind', () => {
  it('scores when three match', () => expect(scoreThreeOfAKind(d(3, 3, 3, 4, 5))).toBe(18))
  it('scores when four match', () => expect(scoreThreeOfAKind(d(3, 3, 3, 3, 5))).toBe(17))
  it('scores when five match', () => expect(scoreThreeOfAKind(d(3, 3, 3, 3, 3))).toBe(15))
  it('scores 0 when no three match', () => expect(scoreThreeOfAKind(d(1, 2, 3, 4, 5))).toBe(0))
})

describe('fourOfAKind', () => {
  it('scores when four match', () => expect(scoreFourOfAKind(d(3, 3, 3, 3, 5))).toBe(17))
  it('scores when five match', () => expect(scoreFourOfAKind(d(6, 6, 6, 6, 6))).toBe(30))
  it('scores 0 when only three match', () => expect(scoreFourOfAKind(d(3, 3, 3, 4, 5))).toBe(0))
})

describe('fullHouse', () => {
  it('scores 25 for a full house', () => expect(scoreFullHouse(d(2, 2, 3, 3, 3))).toBe(25))
  it('scores 25 for a full house (reversed)', () => expect(scoreFullHouse(d(6, 6, 6, 1, 1))).toBe(25))
  it('scores 0 for non-full-house', () => expect(scoreFullHouse(d(1, 2, 3, 4, 5))).toBe(0))
  it('scores 0 for four of a kind', () => expect(scoreFullHouse(d(3, 3, 3, 3, 5))).toBe(0))
})

describe('smallStraight', () => {
  it('scores 30 for 1-2-3-4', () => expect(scoreSmallStraight(d(1, 2, 3, 4, 6))).toBe(30))
  it('scores 30 for 2-3-4-5', () => expect(scoreSmallStraight(d(2, 3, 4, 5, 1))).toBe(30))
  it('scores 30 for 3-4-5-6', () => expect(scoreSmallStraight(d(3, 4, 5, 6, 1))).toBe(30))
  it('scores 30 for large straight (contains small)', () => expect(scoreSmallStraight(d(1, 2, 3, 4, 5))).toBe(30))
  it('scores 0 for no straight', () => expect(scoreSmallStraight(d(1, 1, 2, 3, 5))).toBe(0))
})

describe('largeStraight', () => {
  it('scores 40 for 1-2-3-4-5', () => expect(scoreLargeStraight(d(1, 2, 3, 4, 5))).toBe(40))
  it('scores 40 for 2-3-4-5-6', () => expect(scoreLargeStraight(d(2, 3, 4, 5, 6))).toBe(40))
  it('scores 0 for small straight', () => expect(scoreLargeStraight(d(1, 2, 3, 4, 6))).toBe(0))
})

describe('yahtzee', () => {
  it('scores 50 for five of a kind', () => expect(scoreYahtzee(d(4, 4, 4, 4, 4))).toBe(50))
  it('scores 0 for four of a kind', () => expect(scoreYahtzee(d(4, 4, 4, 4, 5))).toBe(0))
})

describe('chance', () => {
  it('sums all dice', () => expect(scoreChance(d(1, 2, 3, 4, 5))).toBe(15))
  it('sums all dice (all sixes)', () => expect(scoreChance(d(6, 6, 6, 6, 6))).toBe(30))
})

describe('scorecard totals', () => {
  it('sums upper section', () => {
    expect(upperTotal({ ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 })).toBe(63)
  })

  it('awards upper bonus at threshold', () => {
    expect(upperBonus({ ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 })).toBe(35)
  })

  it('no upper bonus below threshold', () => {
    expect(upperBonus({ ones: 1 })).toBe(0)
  })

  it('sums lower section', () => {
    expect(lowerTotal({ threeOfAKind: 18, fullHouse: 25 })).toBe(43)
  })

  it('computes grand total', () => {
    const scores = {
      ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18,
      threeOfAKind: 18, fourOfAKind: 20, fullHouse: 25,
      smallStraight: 30, largeStraight: 40, yahtzee: 50, chance: 22,
    }
    expect(grandTotal(scores)).toBe(63 + 35 + 205)
  })

  it('adds 50 per bonus yahtzee to grand total', () => {
    const scores = {
      ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18,
      threeOfAKind: 18, fourOfAKind: 20, fullHouse: 25,
      smallStraight: 30, largeStraight: 40, yahtzee: 50, chance: 22,
    }
    expect(grandTotal(scores, 1)).toBe(63 + 35 + 205 + 50)
    expect(grandTotal(scores, 3)).toBe(63 + 35 + 205 + 150)
  })
})
