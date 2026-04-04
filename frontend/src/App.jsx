import { useState, useEffect, useRef } from 'react'
import TicTacToe from './games/TicTacToe'
import Connect4  from './games/Connect4'

const API = '/api'

const PLAYERS = {
  Ariel: { color: '#16a34a', light: '#dcfce7', bg: '#f0fdf4', emoji: '🦁' },
  Ella:  { color: '#db2777', light: '#fce7f3', bg: '#fdf2f8', emoji: '🦋' },
}

// ── Add new games here only ───────────────────────────────────────────────────
const GAMES = [
  { id: 'tictactoe', name: 'Tic Tac Toe', emoji: '⭕', desc: 'Classic 3×3 board game',  component: TicTacToe, ready: true  },
  { id: 'connect4',  name: '4 in a Row',  emoji: '🔴', desc: 'Drop discs, connect four!', component: Connect4,  ready: true  },
  { id: 'memory',    name: 'Memory',       emoji: '🃏', desc: 'Flip & match the cards',   component: null,      ready: false },
]

// ── PIN Screen ────────────────────────────────────────────────────────────────
function PinScreen({ onLogin }) {
  const [digits, setDigits]   = useState(['', '', '', ''])
  const [error, setError]     = useState('')
  const [shake, setShake]     = useState(false)
  const [loading, setLoading] = useState(false)
  const refs                  = [useRef(), useRef(), useRef(), useRef()]

  useEffect(() => { refs[0].current?.focus() }, [])

  const handleDigit = (i, val) => {
    if (!/^\d?$/.test(val)) return
    const next = [...digits]
    next[i] = val
    setDigits(next)
    setError('')
    if (val && i < 3) refs[i + 1].current?.focus()
    if (next.every(d => d !== '')) submit(next.join(''))
  }

  const handleKey = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0)
      refs[i - 1].current?.focus()
  }

  const submit = async (pin) => {
    setLoading(true)
    try {
      const res = await fetch(`${API}/auth`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ pin }),
      })
      if (!res.ok) throw new Error()
      const { player } = await res.json()
      onLogin(player)
    } catch {
      setError('Wrong PIN, try again!')
      setShake(true)
      setDigits(['', '', '', ''])
      setTimeout(() => { setShake(false); refs[0].current?.focus() }, 600)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={s.pinWrap}>
      <div style={{ ...s.pinCard, animation: shake ? 'shake 0.5s ease' : 'fadeIn 0.4s ease' }}>
        <div style={s.pinLogo}>🎮</div>
        <h1 style={s.pinTitle}>Game Room</h1>
        <p style={s.pinSub}>Enter your secret PIN</p>
        <div style={s.pinRow}>
          {digits.map((d, i) => (
            <input
              key={i} ref={refs[i]} type="tel" maxLength={1} value={d}
              onChange={e => handleDigit(i, e.target.value)}
              onKeyDown={e => handleKey(i, e)}
              style={{
                ...s.pinInput,
                borderColor: error ? '#ef4444' : d ? '#6366f1' : '#e2e8f0',
                boxShadow:   d ? '0 0 0 3px #6366f133' : 'none',
              }}
            />
          ))}
        </div>
        {error   && <p style={s.pinError}>{error}</p>}
        {loading && <p style={s.pinLoading}>Checking...</p>}
      </div>
    </div>
  )
}

// ── Game Hub ──────────────────────────────────────────────────────────────────
function GameHub({ player, onSelectGame }) {
  const p = PLAYERS[player]
  return (
    <div style={{ ...s.hubWrap, background: p.bg }}>
      <header style={s.hubHeader}>
        <div style={s.hubLogo}>🎮 Game Room</div>
        <div style={{ ...s.hubBadge, background: p.color }}>{p.emoji} {player}</div>
      </header>

      <h2 style={s.hubTitle}>Pick a game!</h2>

      <div style={s.gameGrid}>
        {GAMES.map(g => (
          <div
            key={g.id}
            onClick={() => g.ready && onSelectGame(g.id)}
            style={{
              ...s.gameCard,
              opacity:     g.ready ? 1 : 0.5,
              cursor:      g.ready ? 'pointer' : 'not-allowed',
              borderColor: g.ready ? p.color : '#e2e8f0',
            }}
          >
            <div style={s.gameEmoji}>{g.emoji}</div>
            <div style={s.gameName}>{g.name}</div>
            <div style={s.gameDesc}>{g.desc}</div>
            {!g.ready && <div style={s.gameSoon}>Coming soon</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── App root ──────────────────────────────────────────────────────────────────
export default function App() {
  const [player, setPlayer] = useState(null)
  const [gameId, setGameId] = useState(null)

  if (!player) return <PinScreen onLogin={setPlayer} />

  if (!gameId) return <GameHub player={player} onSelectGame={setGameId} />

  const game = GAMES.find(g => g.id === gameId)
  if (game?.component) {
    const GameComponent = game.component
    return <GameComponent player={player} onBack={() => setGameId(null)} />
  }

  return null
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = {
  pinWrap: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  },
  pinCard: {
    background: '#fff', borderRadius: 28, padding: '48px 40px',
    textAlign: 'center', boxShadow: '0 24px 64px #0003', minWidth: 320,
  },
  pinLogo:  { fontSize: 56, marginBottom: 8 },
  pinTitle: { fontSize: 32, fontWeight: 900, color: '#1e1b4b', margin: '0 0 8px' },
  pinSub:   { fontSize: 16, color: '#94a3b8', marginBottom: 32 },
  pinRow:   { display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 20 },
  pinInput: {
    width: 56, height: 64, fontSize: 28, fontWeight: 900, textAlign: 'center',
    border: '2px solid', borderRadius: 14, outline: 'none',
    color: '#1e1b4b', transition: 'all 0.2s', background: '#f8fafc',
    fontFamily: 'inherit',
  },
  pinError:   { color: '#ef4444', fontWeight: 700, fontSize: 14, marginTop: 4 },
  pinLoading: { color: '#94a3b8', fontSize: 14, marginTop: 4 },

  hubWrap:   { minHeight: '100vh', paddingBottom: 40 },
  hubHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '16px 24px', background: '#fff', boxShadow: '0 1px 0 #e2e8f0',
  },
  hubLogo:  { fontSize: 20, fontWeight: 900, color: '#1e1b4b' },
  hubBadge: { color: '#fff', padding: '6px 16px', borderRadius: 999, fontWeight: 800, fontSize: 15 },
  hubTitle: { fontSize: 28, fontWeight: 900, color: '#1e1b4b', textAlign: 'center', padding: '32px 0 16px' },
  gameGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: 20, maxWidth: 680, margin: '0 auto', padding: '0 24px',
  },
  gameCard: {
    background: '#fff', borderRadius: 20, padding: '28px 20px',
    textAlign: 'center', border: '2px solid',
    boxShadow: '0 4px 16px #0001', transition: 'transform 0.15s',
  },
  gameEmoji: { fontSize: 48, marginBottom: 10 },
  gameName:  { fontSize: 18, fontWeight: 900, color: '#1e1b4b', marginBottom: 6 },
  gameDesc:  { fontSize: 13, color: '#94a3b8' },
  gameSoon:  { marginTop: 10, fontSize: 11, fontWeight: 800, letterSpacing: 1, color: '#cbd5e1', textTransform: 'uppercase' },
}