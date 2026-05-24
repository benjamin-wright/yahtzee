// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loadState, saveState } from './storage'
import { initialState } from './reducer'
import type { GameState } from './types'

const sampleState: GameState = {
  phase: 'rolling',
  players: ['Alice', 'Bob'],
  rounds: [],
  scores: [{}, {}],
  currentPlayer: 0,
  dice: [1, 3, 5],
  selectedCategory: null,
  yahtzeeBonuses: [0, 0],
  isBonusYahtzee: false,
  rollMode: 'random',
}

describe('loadState', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('returns initialState when nothing is stored', () => {
    expect(loadState()).toEqual(initialState)
  })

  it('returns parsed state when valid JSON is stored', () => {
    localStorage.setItem('yahtzee-state', JSON.stringify(sampleState))
    expect(loadState()).toEqual(sampleState)
  })

  it('defaults rollMode to manual when stored state is missing it', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { rollMode: _rollMode, ...stateWithoutMode } = sampleState
    localStorage.setItem('yahtzee-state', JSON.stringify(stateWithoutMode))
    expect(loadState().rollMode).toBe('manual')
  })

  it('returns initialState when stored value is invalid JSON', () => {
    localStorage.setItem('yahtzee-state', 'not-json')
    expect(loadState()).toEqual(initialState)
  })
})

describe('saveState', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('serialises state to localStorage', () => {
    saveState(sampleState)
    expect(localStorage.getItem('yahtzee-state')).toBe(JSON.stringify(sampleState))
  })

  it('does not throw when localStorage.setItem throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => saveState(sampleState)).not.toThrow()
  })
})
