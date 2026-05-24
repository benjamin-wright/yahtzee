import { useState, useEffect, useRef } from 'react'
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
  reroll,
}: {
  value: Die | null
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
      aria-label={
        value !== null
          ? `Die ${value}${reroll ? ', selected for reroll' : ''}`
          : 'Die not yet rolled'
      }
      aria-pressed={reroll}
    >
      {value !== null ? <DiceFace value={value} /> : <DiceFaceQuestion />}
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
const ANIMATION_BASE_MS = 1500
const ANIMATION_JITTER_MS = 500
const ANIMATION_TICK_MS = 150

function RollingView({ state, dispatch }: Props) {
  const [rollCount, setRollCount] = useState(0)
  const [rerollIndices, setRerollIndices] = useState<Set<number>>(new Set())

  // Random-mode animation state
  const [animDisplay, setAnimDisplay] = useState<(Die | null)[]>([null, null, null, null, null])
  const [isAnimating, setIsAnimating] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current)
    }
  }, [])

  const mode = state.rollMode
  const playerName = state.players[state.currentPlayer]
  const currentScore = state.scores[state.currentPlayer] ?? {}

  function handleExit() {
    const shouldExit = window.confirm('Cancel this round and lose its progress?')
    if (!shouldExit) return
    dispatch({ type: 'CANCEL_ROUND' })
  }

  function handleModeChange(newMode: RollMode) {
    if (newMode === mode) return
    setRollCount(0)
    setRerollIndices(new Set())
    setAnimDisplay([null, null, null, null, null])
    dispatch({ type: 'SET_ROLL_MODE', mode: newMode })
  }

  function handleRandomRoll() {
    const rng = seededRandom(Date.now())
    const finals: Die[] = Array.from({ length: 5 }, (_, i) =>
      rerollIndices.has(i) || rollCount === 0
        ? randomDie(rng)
        : (state.dice[i] ?? randomDie(rng))
    )

    // Per-die settle time: base ± jitter
    const rngJitter = seededRandom(Date.now() ^ 0xdeadbeef)
    const settleTimes: number[] = finals.map((_, i) =>
      rerollIndices.has(i) || rollCount === 0
        ? ANIMATION_BASE_MS + (rngJitter() * 2 - 1) * ANIMATION_JITTER_MS
        : 0
    )
    const maxSettle = Math.max(...settleTimes)

    const settled = finals.map((_, i) => !(rerollIndices.has(i) || rollCount === 0))
    const startTime = Date.now()

    // Keep held dice visible as their current values during animation
    setAnimDisplay(prev => prev.map((v, i) => settled[i] ? (state.dice[i] ?? v) : null))
    setIsAnimating(true)
    setRerollIndices(new Set())

    const animRng = seededRandom(Date.now() ^ 0xc0ffee)

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime

      setAnimDisplay(prev => prev.map((v, i) => {
        if (settled[i]) return v
        if (elapsed >= settleTimes[i]) {
          settled[i] = true
          return finals[i]
        }
        return randomDie(animRng)
      }))

      if (elapsed >= maxSettle + ANIMATION_TICK_MS) {
        clearInterval(intervalRef.current!)
        intervalRef.current = null
        setAnimDisplay(finals)
        setIsAnimating(false)
        const newRollCount = rollCount + 1
        setRollCount(newRollCount)
        dispatch({ type: 'SET_DICE', dice: finals })
        if (newRollCount >= MAX_ROLLS) {
          dispatch({ type: 'CONFIRM_DICE' })
        }
      }
    }, ANIMATION_TICK_MS)
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
    if (isAnimating) return 'Rolling…'
    if (rollCount === 0) return 'Press Roll to begin'
    return `Roll ${rollCount} of ${MAX_ROLLS} · Tap dice to reroll, or Accept to keep all`
  }

  const isManualInputDisabled = state.dice.length >= 5

  // For random mode: displayed dice (animating or settled)
  const displayDice: (Die | null)[] = isAnimating || rollCount === 0
    ? animDisplay
    : state.dice.map((v, i) => rerollIndices.has(i) ? null : v)

  return (
    <>
      <div className="turn-scroll-body">
        <div className="turn-header">
          <h2>{playerName}'s Roll</h2>

          <div className="turn-header-actions">
            <div className="mode-toggle" role="group" aria-label="Roll mode">
              <button
                type="button"
                className={`mode-toggle-btn${mode === 'manual' ? ' is-active' : ''}`}
                onClick={() => handleModeChange('manual')}
                disabled={isAnimating}
              >
                Manual
              </button>
              <button
                type="button"
                className={`mode-toggle-btn${mode === 'random' ? ' is-active' : ''}`}
                onClick={() => handleModeChange('random')}
                disabled={isAnimating}
              >
                🎲 Random
              </button>
            </div>
            <button
              type="button"
              className="btn-ghost turn-exit"
              onClick={handleExit}
              disabled={isAnimating}
              aria-label="Exit round"
            >
              Exit
            </button>
          </div>
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
              <div className="dice-hand-row" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
                {displayDice.map((value, i) => (
                  <DieButton
                    key={i}
                    value={value}
                    reroll={rerollIndices.has(i)}
                    disabled={isAnimating || rollCount === 0 || rollCount >= MAX_ROLLS}
                    onClick={
                      !isAnimating && rollCount > 0 && rollCount < MAX_ROLLS
                        ? () => toggleReroll(i)
                        : undefined
                    }
                  />
                ))}
              </div>
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
              disabled={isAnimating || !canAccept}
              onClick={() => dispatch({ type: 'CONFIRM_DICE' })}
              type="button"
            >
              Accept
            </button>
            <button
              className="btn-primary"
              disabled={isAnimating || !canRoll}
              onClick={handleRandomRoll}
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

  function handleExit() {
    const shouldExit = window.confirm('Cancel this round and lose its progress?')
    if (!shouldExit) return
    dispatch({ type: 'CANCEL_ROUND' })
  }

  return (
    <>
      <div className="turn-scroll-body">
        <div className="turn-header">
          <h2>{playerName}'s Category</h2>
          <button
            type="button"
            className="btn-ghost turn-exit"
            onClick={handleExit}
            aria-label="Exit round"
          >
            Exit
          </button>
        </div>
        <p className="turn-subtitle">
          {state.isBonusYahtzee
            ? 'Bonus YAHTZEE! Pick any other category — +100 pts added automatically'
            : 'Choose where to score this hand'}
        </p>

        {state.isBonusYahtzee && (
          <div className="bonus-yahtzee-banner" role="status">
            🎲 BONUS YAHTZEE! <strong>+100 pts</strong>
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
