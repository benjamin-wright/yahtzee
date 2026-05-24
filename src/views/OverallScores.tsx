import type { Dispatch } from 'react'
import type { GameState, Action } from '../state/types'
import { grandTotal } from '../scoring/scorecard'

interface Props {
  state: GameState
  dispatch: Dispatch<Action>
}

function roundWinners(scores: number[]): Set<number> {
  const max = Math.max(...scores)
  const winners = new Set<number>()
  scores.forEach((s, i) => { if (s === max) winners.add(i) })
  return winners
}

export default function OverallScores({ state, dispatch }: Props) {
  const { players, rounds } = state

  function handleExit() {
    const shouldExit = window.confirm('Exit to player select? All round data will be lost.')
    if (!shouldExit) return
    dispatch({ type: 'RESET_GAME' })
  }

  function handleNewRound() {
    dispatch({ type: 'START_ROUND' })
  }

  const roundTotals = rounds.map(round =>
    round.scores.map((s, pi) => grandTotal(s, round.yahtzeeBonuses[pi] ?? 0))
  )

  const wonRounds = players.map((_, pi) =>
    roundTotals.filter(totals => {
      const winners = roundWinners(totals)
      return winners.has(pi)
    }).length
  )

  const scoreSum = players.map((_, pi) =>
    roundTotals.reduce((sum, totals) => sum + (totals[pi] ?? 0), 0)
  )

  return (
    <div className="view-overall-scores">
      <nav className="overall-scores-nav">
        <h2>Overall Scores</h2>
        <button className="btn-ghost scorecard-exit" onClick={handleExit} aria-label="Exit to player select">
          Exit
        </button>
      </nav>

      <div className="overall-scores-table-wrapper">
        {rounds.length === 0 ? (
          <p className="overall-scores-empty">No rounds played yet. Start a new round!</p>
        ) : (
          <table className="overall-scores-table">
            <thead>
              <tr>
                <th className="col-label"></th>
                {players.map(name => (
                  <th key={name} className="col-player">{name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rounds.map((_, ri) => {
                const totals = roundTotals[ri]
                const winners = roundWinners(totals)
                return (
                  <tr key={ri}>
                    <td className="row-label">Round {ri + 1}</td>
                    {totals.map((total, pi) => (
                      <td
                        key={pi}
                        className={`score-cell${winners.has(pi) ? ' winner-cell' : ''}`}
                      >
                        {total}
                      </td>
                    ))}
                  </tr>
                )
              })}
              <tr className="totals-row">
                <td className="row-label">Rounds Won</td>
                {wonRounds.map((won, pi) => (
                  <td key={pi} className="score-cell">{won}</td>
                ))}
              </tr>
              <tr className="totals-row grand-totals-row">
                <td className="row-label">Total Score</td>
                {scoreSum.map((total, pi) => (
                  <td key={pi} className="score-cell">{total}</td>
                ))}
              </tr>
            </tbody>
          </table>
        )}
      </div>

      <div className="overall-scores-footer">
        <button className="btn-primary" onClick={handleNewRound}>
          New Round
        </button>
      </div>
    </div>
  )
}
