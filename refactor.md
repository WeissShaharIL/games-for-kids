# Refactor Plan — games-for-kids

## Phase 1 — Consolidate `safe()` → `getPlayer()` ✅ PRIORITY
**Goal:** Remove the locally-defined `safe()` + `FALLBACKS` copy in every game file and replace with the shared `getPlayer()` from `playerUtils.js`.

**Why:** `safe()` is defined identically in 10 out of 13 game files. `playerUtils.js` already exports `getPlayer()` which does the same thing. Connect4 and Mountain already use it correctly.

**Files to touch:**
- [ ] `frontend/src/games/AirHockey.jsx`
- [ ] `frontend/src/games/Balloons.jsx`
- [ ] `frontend/src/games/ChefShowdown.jsx`
- [ ] `frontend/src/games/Lego.jsx`
- [ ] `frontend/src/games/Shooter.jsx`
- [ ] `frontend/src/games/Snake.jsx`
- [ ] `frontend/src/games/Spinner.jsx`
- [ ] `frontend/src/games/Splendor.jsx`
- [ ] `frontend/src/games/TugOfWar.jsx`
- [ ] `frontend/src/games/WordQuiz.jsx`

**Per file steps:**
1. Delete the local `FALLBACKS` array
2. Delete the local `safe()` function
3. Add `import { getPlayer } from '../playerUtils'`
4. Replace all `safe(players, name, idx)` calls with `getPlayer(players, name, idx)`
5. Test game still loads and player colors/emojis render correctly

**Notes:**
- `getPlayer` and `safe` are functionally identical — both return `players[name]` or a fallback by index
- TugOfWar's `safe()` has a slightly different null check (`players && name && players[name]`) but same behavior
- Do one file at a time, commit after each, don't batch

---

## Phase 2 — Extract `useGameWS` hook
**Goal:** Extract the WebSocket connect/reconnect/cleanup boilerplate into `frontend/src/hooks/useGameWS.js`.

**Why:** The same ~15 lines appear in all 13 games. If reconnect logic needs a fix, it currently means 13 edits. After this, it's 1.

**Boilerplate being extracted (current pattern in every game):**
```js
const wsRef = useRef(null)
const mountedRef = useRef(true)

function connect() {
  const ws = new WebSocket(`${WS_URL}/${player}`)
  wsRef.current = ws
  ws.onopen = () => { if (!mountedRef.current) return; ... }
  ws.onmessage = e => { if (!mountedRef.current) return; ... }
  ws.onclose = () => { if (mountedRef.current) setTimeout(connect, 2000) }
}

useEffect(() => {
  mountedRef.current = true
  connect()
  return () => { mountedRef.current = false; wsRef.current?.close() }
}, [])
```

**Proposed hook signature:**
```js
// frontend/src/hooks/useGameWS.js
useGameWS(url, onMessage, onOpen?)
// returns: { send }
```

**Files to touch (all games):**
- [ ] `frontend/src/hooks/useGameWS.js` — create
- [ ] All 13 game JSX files — replace boilerplate with hook call

**Notes:**
- Some games (WordQuiz) have a more complex reconnect with generation counters — handle as a special case or add options to the hook
- Canvas games use `stateRef` in addition to state — hook should call `onMessage` with parsed data and let the game decide what to do with it
- Do Phase 1 fully before starting Phase 2

---

## Phase 3 — Shared Lobby component (DEFERRED)
**Status:** Not worth doing now.

**Why deferred:** Each game's Lobby has heavy per-game theming (colors, backgrounds, icons, copy). A shared component would need so many theme props it becomes more complex than separate files. The duplication here is visual, not logic — low bug risk.

**Revisit if:** More games are added and the lobby structure drifts further from each other.

---

## Phase 4 — Split Splendor.jsx (DEFERRED)
**Status:** Low priority.

**Why deferred:** The file is large (1152 lines) but already has well-defined internal components (`Lobby`, `Result`, `GameBoard`, `PaymentPanel`, `ActionOverlay`). Splitting into separate files is purely organizational and adds import overhead without fixing any real problem.

**Revisit if:** The file becomes actively painful to edit or causes merge conflicts.

---

## Ground rules
- One phase at a time, fully complete before moving to next
- One file per commit during Phase 1
- Test each game in browser after touching it before committing
- Never batch-refactor multiple games in one commit
- Don't touch backend — it's clean and consistent as-is
