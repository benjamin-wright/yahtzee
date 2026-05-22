import { useState } from 'react'

const MIN_PLAYERS = 2
const MAX_PLAYERS = 6

interface Props {
  onStart: (players: string[]) => void
}

export default function PlayerSetup({ onStart }: Props) {
  const [players, setPlayers] = useState<string[]>(['', ''])

  function updateName(index: number, name: string) {
    setPlayers(prev => prev.map((p, i) => (i === index ? name : p)))
  }

  function addPlayer() {
    setPlayers(prev => [...prev, ''])
  }

  function removePlayer(index: number) {
    setPlayers(prev => prev.filter((_, i) => i !== index))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const names = players.map(p => p.trim()).filter(Boolean)
    if (names.length >= MIN_PLAYERS) {
      onStart(names)
    }
  }

  const filledNames = players.filter(p => p.trim()).length
  const canStart = filledNames >= MIN_PLAYERS
  const canAdd = players.length < MAX_PLAYERS
  const canRemove = players.length > MIN_PLAYERS

  return (
    <main className="view-setup">
      <h1>Yahtzee</h1>
      <p className="tagline">Score tracker for 2–{MAX_PLAYERS} players</p>

      <form className="setup-form" onSubmit={handleSubmit}>
        <fieldset>
          <legend>Players</legend>
          {players.map((name, i) => (
            <div className="player-row" key={i}>
              <input
                type="text"
                placeholder={`Player ${i + 1}`}
                value={name}
                onChange={e => updateName(i, e.target.value)}
                autoFocus={i === 0}
                maxLength={20}
              />
              {canRemove && (
                <button
                  type="button"
                  className="btn-ghost"
                  aria-label={`Remove player ${i + 1}`}
                  onClick={() => removePlayer(i)}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {canAdd && (
            <button type="button" className="btn-secondary" onClick={addPlayer}>
              + Add player
            </button>
          )}
        </fieldset>

        <button type="submit" className="btn-primary" disabled={!canStart}>
          Start game
        </button>
      </form>
    </main>
  )
}
