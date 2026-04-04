import { useState, useEffect, useRef } from 'react'
import TicTacToe from './games/TicTacToe'
import Connect4  from './games/Connect4'
import Snake     from './games/Snake'
import Spinner   from './games/Spinner'
import Balloons  from './games/Balloons'
import Shooter   from './games/Shooter'
import AirHockey from './games/AirHockey'
import Lego from './games/Lego'




const API = '/api'

const CROWN_SVG = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
  <g opacity="0.10" fill="#16a34a">
    <polygon points="60,20 20,60 35,60 35,85 85,85 85,60 100,60" />
    <circle cx="20" cy="55" r="7"/><circle cx="60" cy="15" r="7"/><circle cx="100" cy="55" r="7"/>
    <rect x="30" y="85" width="60" height="10" rx="3"/>
  </g>
</svg>`)

const TIARA_SVG = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
  <g opacity="0.10" fill="#db2777">
    <path d="M20,70 Q40,30 60,25 Q80,30 100,70 Z"/>
    <circle cx="60" cy="22" r="6"/><circle cx="38" cy="42" r="4"/><circle cx="82" cy="42" r="4"/>
    <ellipse cx="20" cy="70" rx="5" ry="4"/><ellipse cx="100" cy="70" rx="5" ry="4"/>
    <rect x="18" y="72" width="84" height="8" rx="4"/>
  </g>
</svg>`)

const PLAYERS = {
  Ariel: { color: '#16a34a', light: '#dcfce7', bg: '#f0fdf4', bgImage: `url("data:image/svg+xml,${CROWN_SVG}")`, emoji: '🦁' },
  Ella:  { color: '#db2777', light: '#fce7f3', bg: '#fdf2f8', bgImage: `url("data:image/svg+xml,${TIARA_SVG}")`, emoji: '🦋' },
}

const GAMES = [
  { id: 'tictactoe', name: 'Tic Tac Toe',  emoji: '⭕', desc: 'Classic 3×3 board game',     component: TicTacToe, ready: true  },
  { id: 'connect4',  name: '4 in a Row',    emoji: '🔴', desc: 'Drop discs, connect four!',   component: Connect4,  ready: true  },
  { id: 'snake',     name: 'Snake Race',    emoji: '🐍', desc: 'Two snakes, one apple!',      component: Snake,     ready: true  },
  { id: 'balloons',  name: 'Pop Balloons!', emoji: '🎈', desc: 'Pop as many as you can!',     component: Balloons,  ready: true  },
  { id: 'shooter',   name: 'Quick Shot!',   emoji: '🔫', desc: 'Shoot villains, spare pets!', component: Shooter,   ready: true  },
  { id: 'spinner',   name: 'Spinner',       emoji: '🎡', desc: 'Tap battle + spin to decide!', component: Spinner,  ready: true  },
  { id: 'airhockey', name: 'Air Hockey', emoji: '🏒', desc: 'Drag your mallet, score goals!', component: AirHockey, ready: true },
  { id: 'lego', name: 'LEGO Builder', emoji: '🧱', desc: 'Build together!', component: Lego, ready: true },
  { id: 'memory',    name: 'Memory',        emoji: '🃏', desc: 'Flip & match the cards',      component: null,      ready: false },

]

// ── Online users pill ────────────────────────────────────────────────────────
function OnlinePill({ name }) {
  const p = PLAYERS[name]
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      background: p ? p.light : '#f1f5f9',
      border: `1px solid ${p ? p.color + '44' : '#e2e8f0'}`,
      borderRadius: 999, padding: '3px 10px 3px 6px',
      fontSize: 12, fontWeight: 800,
      color: p ? p.color : '#64748b',
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: p ? p.color : '#94a3b8', display: 'inline-block', flexShrink: 0 }} />
      {p?.emoji} {name}
    </div>
  )
}

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
  const [onlineUsers, setOnlineUsers] = useState([])
  const p = PLAYERS[player]

  // Poll online users every 5s
  useEffect(() => {
    const fetchOnline = () =>
      fetch(`${API}/online`)
        .then(r => r.json())
        .then(d => setOnlineUsers(d.online || []))
        .catch(() => {})

    fetchOnline()
    const t = setInterval(fetchOnline, 5000)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={{ ...s.hubWrap, background: p.bg, backgroundImage: p.bgImage, backgroundSize: '120px 120px', backgroundRepeat: 'repeat' }}>
      <header style={s.hubHeader}>
        {/* Left: title */}
        <div style={s.hubLogo}>🎮 Game Room</div>

        {/* Center: online users */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
          {onlineUsers.map(name => (
            <OnlinePill key={name} name={name} />
          ))}
          {onlineUsers.length === 0 && (
            <span style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 700 }}>No one online</span>
          )}
        </div>

        {/* Right: current player badge */}
        <div style={{ ...s.hubBadge, background: p.color, flexShrink: 0 }}>{p.emoji} {player}</div>
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
  pinWrap:  { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  pinCard:  { background: '#fff', borderRadius: 28, padding: '48px 40px', textAlign: 'center', boxShadow: '0 24px 64px #0003', minWidth: 320 },
  pinLogo:  { fontSize: 56, marginBottom: 8 },
  pinTitle: { fontSize: 32, fontWeight: 900, color: '#1e1b4b', margin: '0 0 8px' },
  pinSub:   { fontSize: 16, color: '#94a3b8', marginBottom: 32 },
  pinRow:   { display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 20 },
  pinInput: { width: 56, height: 64, fontSize: 28, fontWeight: 900, textAlign: 'center', border: '2px solid', borderRadius: 14, outline: 'none', color: '#1e1b4b', transition: 'all 0.2s', background: '#f8fafc', fontFamily: 'inherit' },
  pinError:   { color: '#ef4444', fontWeight: 700, fontSize: 14, marginTop: 4 },
  pinLoading: { color: '#94a3b8', fontSize: 14, marginTop: 4 },

  hubWrap:   { minHeight: '100vh', paddingBottom: 40 },
  hubHeader: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 16px',
    background: '#ffffffcc', backdropFilter: 'blur(8px)',
    boxShadow: '0 1px 0 #e2e8f0',
  },
  hubLogo:  { fontSize: 14, fontWeight: 900, color: '#1e1b4b', flexShrink: 0 },
  hubBadge: { color: '#fff', padding: '5px 12px', borderRadius: 999, fontWeight: 800, fontSize: 13 },
  hubTitle: { fontSize: 26, fontWeight: 900, color: '#1e1b4b', textAlign: 'center', padding: '24px 0 14px' },
  gameGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 20, maxWidth: 700, margin: '0 auto', padding: '0 24px' },
  gameCard: { background: '#ffffffee', borderRadius: 20, padding: '28px 20px', textAlign: 'center', border: '2px solid', boxShadow: '0 4px 16px #0001', transition: 'transform 0.15s' },
  gameEmoji: { fontSize: 48, marginBottom: 10 },
  gameName:  { fontSize: 18, fontWeight: 900, color: '#1e1b4b', marginBottom: 6 },
  gameDesc:  { fontSize: 13, color: '#94a3b8' },
  gameSoon:  { marginTop: 10, fontSize: 11, fontWeight: 800, letterSpacing: 1, color: '#cbd5e1', textTransform: 'uppercase' },
}