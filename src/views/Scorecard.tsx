import type { Dispatch } from 'react'
import type { GameState, Action } from '../state/types'
import type { Category, PlayerScore } from '../scoring/types'
import { UPPER_CATEGORIES, LOWER_CATEGORIES } from '../scoring/types'
import { upperTotal, upperBonus, grandTotal } from '../scoring/scorecard'

interface Props {
  state: GameState
  dispatch: Dispatch<Action>
}

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
  smallStraight: 'Sm. Straight',
  largeStraight: 'Lg. Straight',
  yahtzee: 'YAHTZEE',
  chance: 'Chance',
}

function displayScore(score: number | undefined): string {
  if (score === undefined) return ''
  if (score === 0) return '–'
  return String(score)
}

function allUpperScored(score: PlayerScore): boolean {
  return UPPER_CATEGORIES.every(cat => score[cat] !== undefined)
}

export default function Scorecard({ state, dispatch }: Props) {
  const { players, scores, phase, yahtzeeBonuses } = state
  const isGameOver = phase === 'gameover'

  function handleExit() {
    dispatch({ type: 'RESET_GAME' })
  }

  function handleNextTurn() {
    if (isGameOver) {
      dispatch({ type: 'RESET_GAME' })
    } else {
      dispatch({ type: 'NEXT_TURN' })
    }
  }

  return (
    <div className="view-scorecard">
      <nav className="scorecard-nav">
        <h2>Scorecard</h2>
        <button className="btn-ghost scorecard-exit" onClick={handleExit} aria-label="Exit game">
          Exit
        </button>
      </nav>

      <div className="scorecard-table-wrapper">
        <table className="scorecard-table">
          <thead>
            <tr>
              <th className="col-label"></th>
              {players.map(name => (
                <th key={name} className="col-player">{name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="section-header">
              <td colSpan={players.length + 1}>Upper Section</td>
            </tr>
            {UPPER_CATEGORIES.map(cat => (
              <tr key={cat}>
                <td className="row-label">{CATEGORY_LABELS[cat]}</td>
                {scores.map((s, i) => (
                  <td key={i} className="score-cell">{displayScore(s[cat])}</td>
                ))}
              </tr>
            ))}
            <tr className="subtotal-row">
              <td className="row-label">Bonus (≥63 → +35)</td>
              {scores.map((s, i) => (
                <td key={i} className="score-cell">
                  {allUpperScored(s) ? displayScore(upperBonus(s)) : ''}
                </td>
              ))}
            </tr>
            <tr className="total-row">
              <td className="row-label">Upper Total</td>
              {scores.map((s, i) => (
                <td key={i} className="score-cell">{upperTotal(s) + upperBonus(s)}</td>
              ))}
            </tr>

            <tr className="section-header">
              <td colSpan={players.length + 1}>Lower Section</td>
            </tr>
            {LOWER_CATEGORIES.map(cat => (
              <tr key={cat}>
                <td className="row-label">{CATEGORY_LABELS[cat]}</td>
                {scores.map((s, i) => (
                  <td key={i} className="score-cell">{displayScore(s[cat])}</td>
                ))}
              </tr>
            ))}
            <tr className="subtotal-row">
              <td className="row-label">YAHTZEE Bonus</td>
              {scores.map((_s, i) => (
                <td key={i} className="score-cell yahtzee-bonus-cell">
                  {Array.from({ length: yahtzeeBonuses[i] ?? 0 }, (_, j) => (
                    <span key={j} className="yahtzee-bonus-mark" aria-label="bonus yahtzee">✕</span>
                  ))}
                </td>
              ))}
            </tr>
            <tr className="total-row grand-total-row">
              <td className="row-label">Grand Total</td>
              {scores.map((s, i) => (
                <td key={i} className="score-cell">{grandTotal(s, yahtzeeBonuses[i] ?? 0)}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="scorecard-footer">
        <button className="btn-primary" onClick={handleNextTurn}>
          {isGameOver ? 'New Game' : 'Next Turn'}
        </button>
      </div>
    </div>
  )
}
