import { useReducer, useEffect } from 'react'
import { reducer } from './state/reducer'
import { loadState, saveState } from './state/storage'
import PlayerSetup from './views/PlayerSetup'
import Scorecard from './views/Scorecard'
import TurnEntry from './views/TurnEntry'
import OverallScores from './views/OverallScores'

function App() {
  const [state, dispatch] = useReducer(reducer, undefined, loadState)

  useEffect(() => {
    saveState(state)
  }, [state])

  return (
    <div id="app">
      {state.phase === 'setup' && (
        <PlayerSetup onStart={players => dispatch({ type: 'START_GAME', players })} />
      )}
      {(state.phase === 'rolling' || state.phase === 'selecting') && (
        <TurnEntry state={state} dispatch={dispatch} />
      )}
      {state.phase === 'scoring' && (
        <Scorecard state={state} dispatch={dispatch} />
      )}
      {state.phase === 'overall_scores' && (
        <OverallScores state={state} dispatch={dispatch} />
      )}
    </div>
  )
}

export default App
