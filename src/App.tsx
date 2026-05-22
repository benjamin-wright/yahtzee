import { useReducer } from 'react'
import { reducer, initialState } from './state/reducer'
import PlayerSetup from './views/PlayerSetup'
import Scorecard from './views/Scorecard'
import TurnEntry from './views/TurnEntry'

function App() {
  const [state, dispatch] = useReducer(reducer, initialState)

  return (
    <div id="app">
      {state.phase === 'setup' && (
        <PlayerSetup onStart={players => dispatch({ type: 'START_GAME', players })} />
      )}
      {(state.phase === 'rolling' || state.phase === 'selecting') && (
        <TurnEntry state={state} dispatch={dispatch} />
      )}
      {(state.phase === 'scoring' || state.phase === 'gameover') && (
        <Scorecard state={state} dispatch={dispatch} />
      )}
    </div>
  )
}

export default App
