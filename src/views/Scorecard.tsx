import type { Dispatch } from 'react'
import type { GameState, Action } from '../state/types'

interface Props {
  state: GameState
  dispatch: Dispatch<Action>
}

export default function Scorecard(_props: Props) {
  return <main>Scorecard — coming soon</main>
}
