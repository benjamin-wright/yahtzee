import { useState, useEffect, useRef, type Dispatch } from 'react'
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

// [cx, cy] positions for each die face in a 60×60 viewBox
const DIE_DOTS: Record<Die, [number, number][]> = {
  1: [[30, 30]],
  2: [[18, 42], [42, 18]],
  3: [[18, 42], [30, 30], [42, 18]],
  4: [[18, 18], [42, 18], [18, 42], [42, 42]],
  5: [[18, 18], [42, 18], [30, 30], [18, 42], [42, 42]],
  6: [[18, 18], [42, 18], [18, 30], [42, 30], [18, 42], [42, 42]],
}

function DiceFaceQuestion() {
  return (
    <svg viewBox="0 0 60 60" className="die-face" aria-hidden="true">
      <text x="30" y="30" textAnchor="middle" dominantBaseline="central" fontSize="32" fontWeight="bold" fill="currentColor">?</text>
    </svg>
  )
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
}: {
  value: Die
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button className="die-button" onClick={onClick} disabled={disabled} type="button" aria-label={`Die ${value}`}>
      <DiceFace value={value} />
    </button>
  )
}

function RollingView({ state, dispatch }: Props) {
  const isInputDisabled = state.dice.length >= 5
  const playerName = state.players[state.currentPlayer]

  return (
    <>
      <div className="turn-scroll-body">
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
      </div>

      <div className="turn-footer">
        <button className="btn-primary turn-primary-action" disabled={state.dice.length !== 5} onClick={() => dispatch({ type: 'CONFIRM_DICE' })}>
          Continue
        </button>
      </div>
    </>
  )
}

const MAX_ROLLS = 3
const ANIMATION_BASE_MS = 3000
const ANIMATION_JITTER_MS = 500
const ANIMATION_TICK_MS = 80

function rollDie(): Die {
  return (Math.floor(Math.random() * 6) + 1) as Die
}

function RandomRollingView({ state, dispatch }: Props) {
  const playerName = state.players[state.currentPlayer]

  const [diceDisplay, setDiceDisplay] = useState<(Die | null)[]>([null, null, null, null, null])
  const [settledValues, setSettledValues] = useState<(Die | null)[]>([null, null, null, null, null])
  const [rerollSelected, setRerollSelected] = useState<boolean[]>([true, true, true, true, true])
  const [isAnimating, setIsAnimating] = useState(false)
  const [rollCount, setRollCount] = useState(0)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current)
    }
  }, [])

  function handleRoll() {
    const finals: Die[] = Array.from({ length: 5 }, (_, i) =>
      rerollSelected[i] ? rollDie() : (settledValues[i] ?? rollDie())
    )

    const settleTimes: number[] = rerollSelected.map(r =>
      r ? ANIMATION_BASE_MS + (Math.random() * 2 - 1) * ANIMATION_JITTER_MS : 0
    )
    const maxSettle = Math.max(...settleTimes)

    const settled = rerollSelected.map(r => !r)
    const startTime = Date.now()

    setDiceDisplay(prev => prev.map((v, i) => rerollSelected[i] ? null : v))
    setIsAnimating(true)

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime

      setDiceDisplay(prev => prev.map((v, i) => {
        if (!rerollSelected[i]) return v
        if (settled[i]) return finals[i]
        if (elapsed >= settleTimes[i]) {
          settled[i] = true
          return finals[i]
        }
        return rollDie()
      }))

      if (elapsed >= maxSettle + ANIMATION_TICK_MS) {
        clearInterval(intervalRef.current!)
        intervalRef.current = null
        setDiceDisplay(finals)
        setSettledValues(finals)
        setRerollSelected([false, false, false, false, false])
        setIsAnimating(false)
        setRollCount(c => c + 1)
      }
    }, ANIMATION_TICK_MS)
  }

  function toggleReroll(i: number) {
    const willReroll = !rerollSelected[i]
    setRerollSelected(prev => { const n = [...prev]; n[i] = willReroll; return n })
    setDiceDisplay(prev => {
      const n = [...prev]
      n[i] = willReroll ? null : settledValues[i]
      return n
    })
  }

  function handleConfirm() {
    const values = settledValues.filter((v): v is Die => v !== null)
    if (values.length !== 5) return
    values.forEach(v => dispatch({ type: 'ADD_DIE', value: v }))
    dispatch({ type: 'CONFIRM_DICE' })
  }

  const hasRolled = rollCount > 0
  const canReroll = hasRolled && rerollSelected.some(Boolean) && rollCount < MAX_ROLLS
  const rollsRemaining = MAX_ROLLS - rollCount

  return (
    <>
      <div className="turn-scroll-body">
        <h2>{playerName}'s Roll</h2>
        <p className="turn-subtitle">
          {isAnimating
            ? 'Rolling…'
            : hasRolled
              ? rollsRemaining > 0
                ? 'Tap a die to mark it for rerolling'
                : 'No rolls remaining'
              : 'Ready to roll your dice?'}
        </p>

        <section className="random-dice-hand" aria-label="Dice">
          <div className="random-dice-row">
            {diceDisplay.map((value, i) => (
              <button
                key={i}
                className={`die-button${rerollSelected[i] ? ' is-reroll' : ''}`}
                onClick={() => !isAnimating && hasRolled && rollsRemaining > 0 && toggleReroll(i)}
                disabled={isAnimating || !hasRolled || rollsRemaining === 0}
                type="button"
                aria-label={
                  value !== null
                    ? `Die ${value}${rerollSelected[i] ? ', selected to reroll' : ''}`
                    : 'Die not yet rolled'
                }
              >
                {value !== null ? <DiceFace value={value} /> : <DiceFaceQuestion />}
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="turn-footer">
        {!hasRolled ? (
          <button
            className="btn-primary turn-primary-action"
            disabled={isAnimating}
            onClick={handleRoll}
          >
            Roll
          </button>
        ) : (
          <div className="random-rolling-actions">
            <button
              className="btn-primary turn-primary-action"
              disabled={isAnimating}
              onClick={handleConfirm}
            >
              Continue
            </button>
            {rollCount < MAX_ROLLS && (
              <button
                className="btn-secondary turn-primary-action"
                disabled={isAnimating || !canReroll}
                onClick={handleRoll}
              >
                Reroll selected
              </button>
            )}
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
      {state.phase === 'rolling' && state.rollingMode === 'manual' ? <RollingView state={state} dispatch={dispatch} /> : null}
      {state.phase === 'rolling' && state.rollingMode === 'random' ? <RandomRollingView state={state} dispatch={dispatch} /> : null}
      {state.phase === 'selecting' ? <SelectingView state={state} dispatch={dispatch} /> : null}
    </main>
  )
}
