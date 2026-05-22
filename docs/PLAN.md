# Yahtzee Scoring App — Implementation Plan

## Project Structure

```
src/
  scoring/
    types.ts          # Die, Category, PlayerScore — shared pure types
    categories.ts     # scoring functions (pure, no React)
    scorecard.ts      # upper bonus, totals, scorecard helpers
    scoring.test.ts   # vitest unit tests
  state/
    types.ts          # GameState, Action discriminated unions
    reducer.ts        # useReducer game state machine
  views/
    PlayerSetup.tsx   # phase: 'setup'
    Scorecard.tsx     # phase: 'scoring'
    TurnEntry.tsx     # phase: 'turn'
  components/
    DiceInput.tsx     # controlled input row (1–6 only)
    RecordedDice.tsx  # output row + click-to-remove (undo)
  App.tsx             # view switcher based on game phase
  main.tsx
  index.css           # single global stylesheet, no CSS modules
```

---

## Scoring Layer (`src/scoring/`)

### `types.ts`

```ts
type Die = 1 | 2 | 3 | 4 | 5 | 6
type Category = 'ones' | 'twos' | 'threes' | 'fours' | 'fives' | 'sixes'
              | 'threeOfAKind' | 'fourOfAKind' | 'fullHouse'
              | 'smallStraight' | 'largeStraight' | 'yahtzee' | 'chance'
type PlayerScore = Partial<Record<Category, number>>
```

### `categories.ts`

One pure function per category, all taking `Die[]`:

- **Upper section:** count matching faces × face value
- **Three/Four of a Kind:** sum all dice if condition met, else 0
- **Full House:** 25 or 0
- **Small Straight:** 30 or 0 (4 sequential)
- **Large Straight:** 40 or 0 (5 sequential)
- **Yahtzee:** 50 or 0
- **Chance:** sum all dice

### `scorecard.ts`

Pure helpers:

- `upperTotal(scores)` → sum of upper section
- `upperBonus(scores)` → 35 if `upperTotal >= 63`, else 0
- `grandTotal(scores)` → upper + bonus + lower

All functions are independently testable with `vitest`.

---

## State Machine (`src/state/`)

```
setup → scoring ↔ turn → scoring → ... → gameover
```

### Game phases

```ts
type GamePhase =
  | { phase: 'setup' }
  | { phase: 'scoring'; playerIndex: number }
  | { phase: 'turn'; playerIndex: number; subPhase: 'rolling' | 'selecting'; dice: Die[] }
  | { phase: 'gameover' }
```

### Turn sub-phases

- `rolling` — dice being entered and recorded; click recorded value to remove
- `selecting` — all dice locked, player picks a category; `Done` advances phase

### Actions (reducer)

```ts
| { type: 'START_GAME'; players: string[] }
| { type: 'ADD_DIE'; value: Die }
| { type: 'REMOVE_DIE'; index: number }
| { type: 'NEXT' }                                   // rolling → selecting
| { type: 'SCORE_CATEGORY'; category: Category }     // selecting → scoring
| { type: 'NEXT_TURN' }                              // scoring → turn (next player)
```

State lives in `App.tsx` via `useReducer`. No external state library needed.

---

## Views

### `PlayerSetup` (`phase: 'setup'`)

- Add/remove player name fields (2–6 players)
- `Start Game` → dispatches `START_GAME`

### `TurnEntry` (`phase: 'turn'`)

- Player name header
- `DiceInput` row: number inputs 1–6, `Record` button appends to dice array
- `RecordedDice` row: chips showing recorded values, click to remove (undo)
- `Next` button (enabled when ≥1 die recorded): advances to `selecting` sub-phase
- In `selecting`: category list with computed preview scores; click to confirm → `SCORE_CATEGORY`

### `Scorecard` (`phase: 'scoring'`)

- Table: rows = categories, columns = players
- Filled scores shown as numbers; empty as dashes
- Upper bonus row; grand total row
- `Start Turn` button → `NEXT_TURN`

---

## PWA Setup

- Add `vite-plugin-pwa` to `vite.config.ts`
- `manifest`: name, icons, `display: standalone`, `theme_color`
- `workbox` strategy: `CacheFirst` for assets, `NetworkFirst` for navigation
- App works fully offline after first load

---

## Styling

- Single `index.css` — CSS custom properties for colors/spacing
- No component-scoped CSS, no CSS-in-JS
- Mobile-first; table view scrollable horizontally on small screens
- Remove `App.css` and boilerplate assets

---

## Build Order

1. Add deps + configure PWA plugin
2. Define all types in `src/scoring/types.ts`
3. Implement + test scoring functions
4. Build reducer + game state types
5. Build `PlayerSetup` view (simplest)
6. Build `TurnEntry` — `DiceInput` + `RecordedDice` components
7. Build `Scorecard` view
8. Wire views in `App.tsx`
9. Global styles
10. PWA manifest + icons
