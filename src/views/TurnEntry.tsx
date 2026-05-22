import type { Dispatch } from 'react'
import type { GameState, Action } from '../state/types'
import { scoreCategory } from '../scoring/categories'
import type { Category, Die } from '../scoring/types'
import { UPPER_CATEGORIES, LOWER_CATEGORIES } from '../scoring/types'

interface Props {
  state: GameState
  dispatch: Dispatch<Action>
}

const DICE_VALUES: Die[] = [1, 2, 3, 4, 5, 6]

const CATEGORY_LABELS: Record<Category, string> = {
  ones: 'Ones',
  twos: 'Twos',
  threes: 'Threes',
  fours: 'Fours',
  fives: 'Fives',
  sixes: 'Sixes',
  threeOfAKind: '3 of a Kind',
  fourOfAKind: '4 of a Kind',
  fullHouse: 'Full House',
  smallStraight: 'Small Straight',
  largeStraight: 'Large Straight',
  yahtzee: 'YAHTZEE',
  chance: 'Chance',
}

function DieButton({
  value,
  onClick,
  disabled,
}: {
  value: Die
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button className="die-button" onClick={onClick} disabled={disabled} type="button" aria-label={`Die ${value}`}>
      {value}
    </button>
  )
}

function RollingView({ state, dispatch }: Props) {
  const isInputDisabled = state.dice.length >= 5
  const playerName = state.players[state.currentPlayer]

  return (
    <>
      <h2>{playerName}'s Roll</h2>
      <p className="turn-subtitle">Tap dice below to build your hand ({state.dice.length}/5)</p>

      <section className="dice-input-row" aria-label="Dice input values">
        {DICE_VALUES.map(value => (
          <DieButton
            key={value}
            value={value}
            disabled={isInputDisabled}
            onClick={() => dispatch({ type: 'ADD_DIE', value })}
          />
        ))}
      </section>

      <section className="dice-hand" aria-label="Current hand">
        {state.dice.length === 0 ? (
          <p className="turn-muted">No dice selected yet</p>
        ) : (
          <div className="dice-hand-row">
            {state.dice.map((die, i) => (
              <DieButton key={`${die}-${i}`} value={die} onClick={() => dispatch({ type: 'REMOVE_DIE', index: i })} />
            ))}
          </div>
        )}
      </section>

      <button className="btn-primary turn-primary-action" disabled={state.dice.length !== 5} onClick={() => dispatch({ type: 'CONFIRM_DICE' })}>
        Continue
      </button>
    </>
  )
}

function SelectingView({ state, dispatch }: Props) {
  const playerName = state.players[state.currentPlayer]
  const currentScore = state.scores[state.currentPlayer] ?? {}

  return (
    <>
      <h2>{playerName}'s Category</h2>
      <p className="turn-subtitle">Choose where to score this hand</p>

      <section className="dice-hand">
        <div className="dice-hand-row">
          {state.dice.map((die, i) => (
            <DieButton key={`${die}-${i}`} value={die} disabled />
          ))}
        </div>
      </section>

      <section className="category-section">
        <h3>Upper Section</h3>
        <div className="category-grid">
          {UPPER_CATEGORIES.map(category => {
            const lockedScore = currentScore[category]
            const isLocked = lockedScore !== undefined
            const isSelected = state.selectedCategory === category
            return (
              <button
                key={category}
                className={`category-card${isSelected ? ' is-selected' : ''}`}
                type="button"
                disabled={isLocked}
                onClick={() => dispatch({ type: 'SCORE_CATEGORY', category })}
              >
                <span>{CATEGORY_LABELS[category]}</span>
                <strong>{isLocked ? lockedScore : scoreCategory(category, state.dice)}</strong>
              </button>
            )
          })}
        </div>
      </section>

      <section className="category-section">
        <h3>Lower Section</h3>
        <div className="category-grid">
          {LOWER_CATEGORIES.map(category => {
            const lockedScore = currentScore[category]
            const isLocked = lockedScore !== undefined
            const isSelected = state.selectedCategory === category
            return (
              <button
                key={category}
                className={`category-card${isSelected ? ' is-selected' : ''}`}
                type="button"
                disabled={isLocked}
                onClick={() => dispatch({ type: 'SCORE_CATEGORY', category })}
              >
                <span>{CATEGORY_LABELS[category]}</span>
                <strong>{isLocked ? lockedScore : scoreCategory(category, state.dice)}</strong>
              </button>
            )
          })}
        </div>
      </section>

      <button className="btn-primary turn-primary-action" disabled={state.selectedCategory === null} onClick={() => dispatch({ type: 'END_TURN' })}>
        End turn
      </button>
    </>
  )
}

export default function TurnEntry({ state, dispatch }: Props) {
  return (
    <main className="view-turn-entry">
      {state.phase === 'rolling' ? <RollingView state={state} dispatch={dispatch} /> : null}
      {state.phase === 'selecting' ? <SelectingView state={state} dispatch={dispatch} /> : null}
    </main>
  )
}
