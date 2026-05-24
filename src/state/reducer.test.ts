import { describe, it, expect } from 'vitest'
import { reducer, initialState } from './reducer'
import type { GameState } from './types'

const twoPlayerScoring: GameState = {
  phase: 'rolling',
  players: ['Alice', 'Bob'],
  rounds: [],
  scores: [{ yahtzee: 50 }, {}],
  currentPlayer: 0,
  dice: [4, 4, 4, 4, 4],
  selectedCategory: null,
  yahtzeeBonuses: [0, 0],
  isBonusYahtzee: false,
  rollMode: 'manual',
}

describe('CONFIRM_DICE', () => {
  it('sets isBonusYahtzee when yahtzee scored 50 and dice are a yahtzee', () => {
    const state = reducer(twoPlayerScoring, { type: 'CONFIRM_DICE' })
    expect(state.isBonusYahtzee).toBe(true)
  })

  it('does not set isBonusYahtzee when yahtzee was scored as 0', () => {
    const state: GameState = {
      ...twoPlayerScoring,
      scores: [{ yahtzee: 0 }, {}],
    }
    const result = reducer(state, { type: 'CONFIRM_DICE' })
    expect(result.isBonusYahtzee).toBe(false)
  })

  it('does not set isBonusYahtzee when yahtzee category is not yet scored', () => {
    const state: GameState = {
      ...twoPlayerScoring,
      scores: [{}, {}],
    }
    const result = reducer(state, { type: 'CONFIRM_DICE' })
    expect(result.isBonusYahtzee).toBe(false)
  })

  it('does not set isBonusYahtzee when dice are not a yahtzee', () => {
    const state: GameState = {
      ...twoPlayerScoring,
      dice: [1, 2, 3, 4, 5],
    }
    const result = reducer(state, { type: 'CONFIRM_DICE' })
    expect(result.isBonusYahtzee).toBe(false)
  })
})

describe('END_TURN', () => {
  it('does not increment bonus yahtzees when isBonusYahtzee is false', () => {
    const state: GameState = {
      ...twoPlayerScoring,
      phase: 'selecting',
      selectedCategory: 'chance',
      isBonusYahtzee: false,
    }
    const result = reducer(state, { type: 'END_TURN' })
    expect(result.yahtzeeBonuses[0]).toBe(0)
  })

  it('increments bonus yahtzees when isBonusYahtzee is true', () => {
    const state: GameState = {
      ...twoPlayerScoring,
      phase: 'selecting',
      selectedCategory: 'chance',
      isBonusYahtzee: true,
    }
    const result = reducer(state, { type: 'END_TURN' })
    expect(result.yahtzeeBonuses[0]).toBe(1)
  })
})

describe('reducer default', () => {
  it('returns initial state for unknown action', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(reducer(initialState, { type: 'UNKNOWN' } as any)).toBe(initialState)
  })
})
