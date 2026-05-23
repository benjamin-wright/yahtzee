import { useState } from 'react'
import type { Dispatch } from 'react'
import type { GameState, Action, RollMode } from '../state/types'
import { scoreCategory } from '../scoring/categories'
import type { Category, Die, PlayerScore } from '../scoring/types'
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

// [cx, cy] positions for each die face in a 60×60 viewBox
const DIE_DOTS: Record<Die, [number, number][]> = {
  1: [[30, 30]],
  2: [[18, 42], [42, 18]],
  3: [[18, 42], [30, 30], [42, 18]],
  4: [[18, 18], [42, 18], [18, 42], [42, 42]],
  5: [[18, 18], [42, 18], [30, 30], [18, 42], [42, 42]],
  6: [[18, 18], [42, 18], [18, 30], [42, 30], [18, 42], [42, 42]],
}

// Mulberry32 seeded PRNG — seed with Date.now() for non-deterministic rolls
function seededRandom(seed: number): () => number {
  let s = seed >>> 0
  return (): number => {
    s += 0x6d2b79f5
    let z = s
    z = Math.imul(z ^ (z >>> 15), z | 1)
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61)
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296
  }
}

function randomDie(rng: () => number): Die {
  return (Math.floor(rng() * 6) + 1) as Die
}

function DiceFace({ value }: { value: Die }) {
  return (
    <svg viewBox="0 0 60 60" className="die-face" aria-hidden="true">
      {DIE_DOTS[value].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={7} fill="currentColor" />
      ))}
    </svg>
  )
}

function DieButton({
  value,
  onClick,
  disabled,
  reroll,
}: {
  value: Die
  onClick?: () => void
  disabled?: boolean
  reroll?: boolean
}) {
  return (
    <button
      className={`die-button${reroll ? ' die-button--reroll' : ''}`}
      onClick={onClick}
      disabled={disabled}
      type="button"
      aria-label={`Die ${value}${reroll ? ', selected for reroll' : ''}`}
      aria-pressed={reroll}
    >
      <DiceFace value={value} />
    </button>
  )
}

// Shared category grid — pass onSelect to make it interactive, omit for read-only reference
function CategorySections({
  dice,
  scores,
  selectedCategory,
  onSelect,
}: {
  dice: Die[]
  scores: PlayerScore
  selectedCategory?: Category | null
  onSelect?: (category: Category) => void
}) {
  const sections: [string, Category[]][] = [
    ['Upper Section', UPPER_CATEGORIES],
    ['Lower Section', LOWER_CATEGORIES],
  ]
  return (
    <>
      {sections.map(([label, categories]) => (
        <section key={label} className="category-section">
          <h3>{label}</h3>
          <div className="category-grid">
            {categories.map(category => {
              const lockedScore = scores[category]
              const isLocked = lockedScore !== undefined
              const isSelected = selectedCategory === category
              return (
                <button
                  key={category}
                  className={`category-card${isSelected ? ' is-selected' : ''}`}
                  type="button"
                  disabled={isLocked || !onSelect}
                  onClick={onSelect && !isLocked ? () => onSelect(category) : undefined}
                >
                  <span>{CATEGORY_LABELS[category]}</span>
                  <strong>{isLocked ? lockedScore : scoreCategory(category, dice)}</strong>
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </>
  )
}

const MAX_ROLLS = 3

function RollingView({ state, dispatch }: Props) {
  const [rollCount, setRollCount] = useState(0)
  const [rerollIndices, setRerollIndices] = useState<Set<number>>(new Set())

  const mode = state.rollMode
  const playerName = state.players[state.currentPlayer]
  const currentScore = state.scores[state.currentPlayer] ?? {}

  function handleModeChange(newMode: RollMode) {
    if (newMode === mode) return
    setRollCount(0)
    setRerollIndices(new Set())
    dispatch({ type: 'SET_ROLL_MODE', mode: newMode })
  }

  function handleRoll() {
    const rng = seededRandom(Date.now())
    if (rollCount === 0) {
      const newDice: Die[] = Array.from({ length: 5 }, () => randomDie(rng))
      dispatch({ type: 'SET_DICE', dice: newDice })
    } else {
      const next = [...state.dice] as Die[]
      rerollIndices.forEach(idx => {
        next[idx] = randomDie(rng)
      })
      dispatch({ type: 'SET_DICE', dice: next })
    }
    setRollCount(prev => prev + 1)
    setRerollIndices(new Set())
  }

  function toggleReroll(index: number) {
    setRerollIndices(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const canRoll = rollCount === 0 || (rollCount < MAX_ROLLS && rerollIndices.size > 0)
  const canAccept = rollCount > 0

  function randomSubtitle(): string {
    if (rollCount === 0) return 'Press Roll to begin'
    if (rollCount >= MAX_ROLLS) return `Roll ${MAX_ROLLS} of ${MAX_ROLLS} · Press Accept to score your hand`
    return `Roll ${rollCount} of ${MAX_ROLLS} · Tap dice to reroll, or Accept to keep all`
  }

  const isManualInputDisabled = state.dice.length >= 5

  return (
    <>
      <div className="turn-scroll-body">
        <h2>{playerName}'s Roll</h2>

        <div className="mode-toggle" role="group" aria-label="Roll mode">
          <button
            type="button"
            className={`mode-toggle-btn${mode === 'manual' ? ' is-active' : ''}`}
            onClick={() => handleModeChange('manual')}
          >
            Manual
          </button>
          <button
            type="button"
            className={`mode-toggle-btn${mode === 'random' ? ' is-active' : ''}`}
            onClick={() => handleModeChange('random')}
          >
            🎲 Random
          </button>
        </div>

        {mode === 'manual' ? (
          <>
            <p className="turn-subtitle">Tap dice below to build your hand ({state.dice.length}/5)</p>

            <section className="dice-input-row" aria-label="Dice input values">
              {DICE_VALUES.map(value => (
                <DieButton
                  key={value}
                  value={value}
                  disabled={isManualInputDisabled}
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
          </>
        ) : (
          <>
            <p className="turn-subtitle">{randomSubtitle()}</p>

            <section className="dice-hand" aria-label="Current hand">
              {rollCount === 0 ? (
                <p className="turn-muted">No dice rolled yet</p>
              ) : (
                <div className="dice-hand-row">
                  {state.dice.map((die, i) => (
                    <DieButton
                      key={`${die}-${i}`}
                      value={die}
                      reroll={rerollIndices.has(i)}
                      disabled={rollCount >= MAX_ROLLS}
                      onClick={rollCount < MAX_ROLLS ? () => toggleReroll(i) : undefined}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        <CategorySections dice={state.dice} scores={currentScore} />
      </div>

      <div className="turn-footer">
        {mode === 'manual' ? (
          <button
            className="btn-primary turn-primary-action"
            disabled={state.dice.length !== 5}
            onClick={() => dispatch({ type: 'CONFIRM_DICE' })}
          >
            Continue
          </button>
        ) : (
          <div className="rolling-footer-actions">
            <button
              className="btn-secondary"
              disabled={!canAccept}
              onClick={() => dispatch({ type: 'CONFIRM_DICE' })}
              type="button"
            >
              Accept
            </button>
            <button
              className="btn-primary"
              disabled={!canRoll}
              onClick={handleRoll}
              type="button"
            >
              {rollCount === 0 ? 'Roll' : `Reroll${rerollIndices.size > 0 ? ` (${rerollIndices.size})` : ''}`}
            </button>
          </div>
        )}
      </div>
    </>
  )
}

function SelectingView({ state, dispatch }: Props) {
  const playerName = state.players[state.currentPlayer]
  const currentScore = state.scores[state.currentPlayer] ?? {}

  return (
    <>
      <div className="turn-scroll-body">
        <h2>{playerName}'s Category</h2>
        <p className="turn-subtitle">
          {state.isBonusYahtzee
            ? 'Bonus YAHTZEE! Pick any other category — +50 pts added automatically'
            : 'Choose where to score this hand'}
        </p>

        {state.isBonusYahtzee && (
          <div className="bonus-yahtzee-banner" role="status">
            🎲 BONUS YAHTZEE! <strong>+50 pts</strong>
          </div>
        )}

        <section className="dice-hand">
          <div className="dice-hand-row">
            {[...state.dice].sort((a, b) => a - b).map((die, i) => (
              <DieButton key={`${die}-${i}`} value={die} disabled />
            ))}
          </div>
        </section>

        <CategorySections
          dice={state.dice}
          scores={currentScore}
          selectedCategory={state.selectedCategory}
          onSelect={category => dispatch({ type: 'SCORE_CATEGORY', category })}
        />
      </div>

      <div className="turn-footer">
        <button className="btn-primary turn-primary-action" disabled={state.selectedCategory === null} onClick={() => dispatch({ type: 'END_TURN' })}>
          End turn
        </button>
      </div>
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
