import type { Dispatch } from 'react'
import type { GameState, Action } from '../state/types'

interface Props {
  state: GameState
  dispatch: Dispatch<Action>
}

export default function TurnEntry(_props: Props) {
  return <main>Turn entry — coming soon</main>
}
