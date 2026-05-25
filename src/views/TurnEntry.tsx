import { useState, useEffect, useRef, useCallback } from 'react'
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

// ─── Animation constants ──────────────────────────────────────
// Physics model: 80% of path through air (constant velocity),
// 20% sliding on floor (decelerating). Time split: 2/3 in air, 1/3 on floor.
const AIR_TIME_FRAC = 2 / 3
const AIR_PATH_FRAC = 0.8
const ENTRY_BASE_DURATION_MS = 1200
const ENTRY_DURATION_JITTER_MS = 100      // ±0.1 s
const LAUNCH_ANGLE_MAX_RAD = 5 * (Math.PI / 180)  // ±5°
const ANGULAR_VEL_JITTER = 0.1           // ±10%
const BASE_TOTAL_ANGLE_DEG = 720         // ≈ 2 full rotations
const ORIGIN_OFFSET_MULT = 2             // 2× die height below screen
const EXIT_DURATION_MS = 500

type AnimPhase = 'idle' | 'exiting' | 'entering'

interface OverlayDie {
  index: number
  value: Die
  animName: string
  durationMs: number
  widthPx: number
  heightPx: number
}

function buildEntryKeyframe(
  index: number,
  rect: DOMRect,
): { css: string; animName: string; durationMs: number } {
  const dieW = rect.width
  const dieH = rect.height
  const cxFinal = rect.left + dieW / 2
  const cyFinal = rect.top + dieH / 2

  const cyOrigin = window.innerHeight + dieH * ORIGIN_OFFSET_MULT
  const launchAngle = (Math.random() * 2 - 1) * LAUNCH_ANGLE_MAX_RAD
  const cxOrigin = cxFinal - (cyOrigin - cyFinal) * Math.tan(launchAngle)

  const durationMs = ENTRY_BASE_DURATION_MS + (Math.random() * 2 - 1) * ENTRY_DURATION_JITTER_MS

  const angularSign = Math.random() > 0.5 ? 1 : -1
  const angularJitter = 1 + (Math.random() * 2 - 1) * ANGULAR_VEL_JITTER
  const totalAngle = angularSign * BASE_TOTAL_ANGLE_DEG * angularJitter
  const startAngle = (Math.random() * 2 - 1) * 180

  // Point at 80% of path (reached at 66.67% of time)
  const cxAirEnd = cxOrigin + AIR_PATH_FRAC * (cxFinal - cxOrigin)
  const cyAirEnd = cyOrigin + AIR_PATH_FRAC * (cyFinal - cyOrigin)
  const angleAirEnd = startAngle + AIR_PATH_FRAC * totalAngle

  // CSS translate tracks top-left corner; rotation is around transform-origin (center)
  const tx0 = cxOrigin - dieW / 2
  const ty0 = cyOrigin - dieH / 2
  const tx1 = cxAirEnd - dieW / 2
  const ty1 = cyAirEnd - dieH / 2
  const tx2 = rect.left
  const ty2 = rect.top

  const animName = `die-entry-${index}-${Date.now()}-${(Math.random() * 1e9 | 0)}`

  const css =
    `@keyframes ${animName} {` +
    `0%{transform:translate(${tx0.toFixed(1)}px,${ty0.toFixed(1)}px) rotate(${startAngle.toFixed(1)}deg);animation-timing-function:linear}` +
    `${(AIR_TIME_FRAC * 100).toFixed(3)}%{transform:translate(${tx1.toFixed(1)}px,${ty1.toFixed(1)}px) rotate(${angleAirEnd.toFixed(1)}deg);animation-timing-function:ease-out}` +
    `100%{transform:translate(${tx2.toFixed(1)}px,${ty2.toFixed(1)}px) rotate(0deg)}}`

  return { css, animName, durationMs }
}

function buildExitKeyframe(
  index: number,
  rect: DOMRect,
  vanishCx: number,
  vanishCy: number,
): { css: string; animName: string } {
  const dieW = rect.width
  const dieH = rect.height
  const cxStart = rect.left + dieW / 2
  const cyStart = rect.top + dieH / 2

  const exitAngle = (Math.random() > 0.5 ? 1 : -1) * (180 + Math.random() * 180)

  const tx0 = rect.left
  const ty0 = rect.top
  // Vanishing-point translate keeps element center at the vanish point
  const txEnd = vanishCx - dieW / 2
  const tyEnd = vanishCy - dieH / 2

  // Compute scale at vanish point: rough perspective (start dist / vanish dist)
  const startDist = Math.hypot(vanishCx - cxStart, vanishCy - cyStart)
  const vanishDist = Math.hypot(0, Math.abs(vanishCy))
  const endScale = Math.max(0.05, Math.min(0.5, startDist / vanishDist))

  const animName = `die-exit-${index}-${Date.now()}-${(Math.random() * 1e9 | 0)}`

  const css =
    `@keyframes ${animName} {` +
    `0%{transform:translate(${tx0.toFixed(1)}px,${ty0.toFixed(1)}px) rotate(0deg) scale(1);animation-timing-function:ease-in}` +
    `100%{transform:translate(${txEnd.toFixed(1)}px,${tyEnd.toFixed(1)}px) rotate(${exitAngle.toFixed(1)}deg) scale(${endScale.toFixed(3)})}}`

  return { css, animName }
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
  ref,
  value,
  onClick,
  disabled,
  reroll,
  hidden,
}: {
  ref?: React.Ref<HTMLButtonElement>
  value: Die | null
  onClick?: () => void
  disabled?: boolean
  reroll?: boolean
  hidden?: boolean
}) {
  return (
    <button
      ref={ref}
      className={`die-button${reroll ? ' die-button--reroll' : ''}${hidden ? ' die-button--hidden' : ''}`}
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
  const [rerollIndices, setRerollIndices] = useState<Set<number>>(new Set())

  // Animation state
  const [animPhase, setAnimPhase] = useState<AnimPhase>('idle')
  const [overlayDice, setOverlayDice] = useState<OverlayDie[]>([])
  const [hiddenIndices, setHiddenIndices] = useState<Set<number>>(new Set())

  // Refs
  const dieRefs = useRef<(HTMLButtonElement | null)[]>([null, null, null, null, null])
  const styleRef = useRef<HTMLStyleElement | null>(null)
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Inject (or replace) CSS keyframes in a dedicated <style> element
  const injectCSS = useCallback((css: string) => {
    if (!styleRef.current) {
      styleRef.current = document.createElement('style')
      document.head.appendChild(styleRef.current)
    }
    styleRef.current.textContent = css
  }, [])

  // Cleanup style element and any pending timer on unmount
  useEffect(() => {
    return () => {
      if (animTimerRef.current !== null) clearTimeout(animTimerRef.current)
      if (styleRef.current) {
        document.head.removeChild(styleRef.current)
        styleRef.current = null
      }
    }
  }, [])

  const isAnimating = animPhase !== 'idle'
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
    dispatch({ type: 'SET_ROLL_MODE', mode: newMode })
  }

  // Called after entry animation finishes — commits the new dice to state
  function finalizeRoll(finals: Die[], newRollCount: number) {
    setOverlayDice([])
    setHiddenIndices(new Set())
    setAnimPhase('idle')
    dispatch({ type: 'SET_DICE', dice: finals })
    setRollCount(newRollCount)
    setRerollIndices(new Set())
    if (newRollCount >= MAX_ROLLS) {
      dispatch({ type: 'CONFIRM_DICE' })
    }
  }

  function startEntryAnimation(indices: number[], finals: Die[], newRollCount: number) {
    const allCSS: string[] = []
    let maxDuration = 0

    const newOverlay: OverlayDie[] = indices.map(i => {
      const rect = dieRefs.current[i]?.getBoundingClientRect()
      if (!rect) return null as unknown as OverlayDie

      const { css, animName, durationMs } = buildEntryKeyframe(i, rect)
      allCSS.push(css)
      if (durationMs > maxDuration) maxDuration = durationMs

      return {
        index: i,
        value: finals[i],
        animName,
        durationMs,
        widthPx: rect.width,
        heightPx: rect.height,
      }
    }).filter(Boolean)

    injectCSS(allCSS.join('\n'))
    setOverlayDice(newOverlay)
    setHiddenIndices(new Set(indices))
    setAnimPhase('entering')

    animTimerRef.current = setTimeout(() => {
      finalizeRoll(finals, newRollCount)
    }, maxDuration + 80)
  }

  function startExitAnimation(indices: number[], finals: Die[], newRollCount: number) {
    const vanishCx = window.innerWidth / 2
    const vanishCy = -window.innerHeight

    const allCSS: string[] = []
    const newOverlay: OverlayDie[] = indices.map(i => {
      const rect = dieRefs.current[i]?.getBoundingClientRect()
      if (!rect) return null as unknown as OverlayDie

      const { css, animName } = buildExitKeyframe(i, rect, vanishCx, vanishCy)
      allCSS.push(css)

      return {
        index: i,
        value: (state.dice[i] ?? 1) as Die,
        animName,
        durationMs: EXIT_DURATION_MS,
        widthPx: rect.width,
        heightPx: rect.height,
      }
    }).filter(Boolean)

    injectCSS(allCSS.join('\n'))
    setOverlayDice(newOverlay)
    setHiddenIndices(new Set(indices))
    setAnimPhase('exiting')

    animTimerRef.current = setTimeout(() => {
      setOverlayDice([])
      startEntryAnimation(indices, finals, newRollCount)
    }, EXIT_DURATION_MS + 50)
  }

  function handleRandomRoll() {
    const rng = seededRandom(Date.now())
    const finals: Die[] = Array.from({ length: 5 }, (_, i) =>
      rerollIndices.has(i) || rollCount === 0
        ? randomDie(rng)
        : (state.dice[i] ?? randomDie(rng))
    )
    const newRollCount = rollCount + 1

    if (rollCount === 0) {
      // First roll: all 5 dice fly in from below
      startEntryAnimation([0, 1, 2, 3, 4], finals, newRollCount)
    } else {
      // Reroll: selected dice fly off the top, then new values fly in
      const exitIndices = Array.from(rerollIndices)
      startExitAnimation(exitIndices, finals, newRollCount)
    }
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

  // Display values for the grid — hidden dice are invisible; values don't matter for them
  const displayDice: (Die | null)[] = state.dice.length === 5
    ? state.dice
    : [null, null, null, null, null]

  return (
    <>
      {/* Fixed overlay renders animating dice above everything */}
      {overlayDice.length > 0 && (
        <div className="dice-animation-overlay" aria-hidden="true">
          {overlayDice.map(die => (
            <div
              key={`${die.index}-${die.animName}`}
              className="die-animated-overlay"
              style={{
                width: die.widthPx,
                height: die.heightPx,
                animation: `${die.animName} ${die.durationMs}ms both`,
              }}
            >
              <DiceFace value={die.value} />
            </div>
          ))}
        </div>
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
                  disabled={state.dice.length >= 5}
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
                    ref={el => { dieRefs.current[i] = el }}
                    value={value}
                    reroll={rerollIndices.has(i)}
                    hidden={hiddenIndices.has(i)}
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
