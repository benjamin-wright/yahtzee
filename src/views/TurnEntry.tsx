import { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react'
import type { Dispatch } from 'react'
import type { GameState, Action, RollMode } from '../state/types'
import { scoreCategory } from '../scoring/categories'
import type { Category, Die, PlayerScore } from '../scoring/types'
import { UPPER_CATEGORIES, LOWER_CATEGORIES } from '../scoring/types'
import type { DiceRendererHandle } from './dice/DiceRenderer'

const DiceRenderer = lazy(() => import('./dice/DiceRenderer'))

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
                  <strong>{isLocked ? lockedScore : (onSelect ? scoreCategory(category, dice) : '')}</strong>
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
  // rerollIndices: set of die-mesh indices (0-4) selected for reroll.
  // Die mesh 0-4 correspond to state.dice[0-4] (may be in any order).
  const [rerollIndices, setRerollIndices] = useState<Set<number>>(new Set())
  const [isAnimating, setIsAnimating] = useState(false)

  // Babylon.js 3D dice renderer
  const diceRendererRef = useRef<DiceRendererHandle | null>(null)

  // slotElsRef[s] is set to the invisible wrapper div for sorted slot s.
  // DiceRenderer reads these to know where to animate settled dice.
  const slotElsRef = useRef<(HTMLDivElement | null)[]>([null, null, null, null, null])

  // Stable array of RefObject-like objects backed by slotElsRef
  const slotRefs = useMemo(
    () =>
      Array.from(
        { length: 5 },
        (_, i) => ({
          get current() {
            return slotElsRef.current[i]
          },
        }) as React.RefObject<HTMLDivElement | null>,
      ),
    [],
  )

  // dieOriginalOrder[s] = mesh index (0-4) of the die at sorted slot s.
  // Recomputed whenever state.dice changes (after each settled throw).
  const dieOriginalOrder = useMemo(() => {
    if (rollCount === 0 || state.dice.length < 5) return [0, 1, 2, 3, 4]
    return [0, 1, 2, 3, 4].sort((a, b) => (state.dice[a] ?? 0) - (state.dice[b] ?? 0))
  }, [state.dice, rollCount])

  // Sync "?" face highlights on already-positioned dice whenever selection changes
  useEffect(() => {
    diceRendererRef.current?.updateReroll(rerollIndices)
  }, [rerollIndices])

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
    setIsAnimating(false)
    diceRendererRef.current?.reset()
    dispatch({ type: 'SET_ROLL_MODE', mode: newMode })
  }

  function handleRandomRoll() {
    const rng = seededRandom(Date.now())

    // Compute final values in mesh order (0-4).
    // On roll 0: all new. On subsequent rolls: keep non-reroll dice.
    const finals: Die[] = Array.from({ length: 5 }, (_, meshIdx) =>
      rerollIndices.has(meshIdx) || rollCount === 0
        ? randomDie(rng)
        : (state.dice[meshIdx] ?? randomDie(rng)),
    )

    setIsAnimating(true)
    setRerollIndices(new Set())

    // On the first roll all dice fly in; on rerolls only the rerolled ones exit+re-enter.
    diceRendererRef.current?.startThrow(finals, rollCount === 0 ? new Set() : rerollIndices)
  }

  // Called by DiceRenderer once all dice have slid into their row positions.
  // originalOrderValues[i] = final value for die mesh i (NOT sorted).
  function handleSettled(originalOrderValues: Die[]) {
    const newRollCount = rollCount + 1
    setRollCount(newRollCount)
    setIsAnimating(false)
    dispatch({ type: 'SET_DICE', dice: originalOrderValues })
    if (newRollCount >= MAX_ROLLS) {
      dispatch({ type: 'CONFIRM_DICE' })
    }
  }

  function toggleReroll(meshIndex: number) {
    setRerollIndices(prev => {
      const next = new Set(prev)
      if (next.has(meshIndex)) next.delete(meshIndex)
      else next.add(meshIndex)
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

  return (
    <>
      {/* Full-screen 3D dice canvas — only mounted in random mode */}
      {mode === 'random' && (
        <Suspense fallback={null}>
          <DiceRenderer
            ref={diceRendererRef}
            visible={true}
            slotRefs={slotRefs}
            onSettled={handleSettled}
          />
        </Suspense>
      )}

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

            {/*
              Invisible die slots: transparent HTML buttons whose only job is to
              (a) provide screen-space positions for the 3D dice to snap to, and
              (b) forward click events (through the pointer-events:none canvas)
              to toggle reroll selection.  They are rendered in sorted-value order
              so each slot position corresponds to the correct visual 3D die.
            */}
            <section className="dice-hand" aria-label="Current hand">
              <div
                className="dice-hand-row"
                style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}
              >
                {Array.from({ length: 5 }, (_, s) => {
                  const origIdx = dieOriginalOrder[s]
                  const canClick = !isAnimating && rollCount > 0 && rollCount < MAX_ROLLS
                  return (
                    <div
                      key={s}
                      ref={el => { slotElsRef.current[s] = el }}
                      style={{ opacity: 0, width: '100%', aspectRatio: '1 / 1', minHeight: '44px' }}
                      aria-hidden="true"
                    >
                      <DieButton
                        value={state.dice[origIdx] ?? null}
                        reroll={rerollIndices.has(origIdx)}
                        disabled={!canClick}
                        onClick={canClick ? () => toggleReroll(origIdx) : undefined}
                      />
                    </div>
                  )
                })}
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
