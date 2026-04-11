import { useState, useEffect, useRef } from 'react'
import TicTacToe from './games/TicTacToe'
import Connect4  from './games/Connect4'
import Snake     from './games/Snake'
//import Spinner   from './games/Spinner'
import Balloons  from './games/Balloons'
import Shooter   from './games/Shooter'
import AirHockey from './games/AirHockey'
//import Lego      from './games/Lego'
import Mountain  from './games/Mountain'
import WordQuiz from './games/WordQuiz'
import TugOfWar from './games/TugOfWar'
import ChefShowdown from './games/ChefShowdown'
import Splendor from './games/Splendor'




const API = '/api'

const GAMES = [
  { id: 'tictactoe', name: 'Tic Tac Toe',  emoji: '⭕', desc: 'Classic 3×3 board game',        component: TicTacToe, ready: true  },
  { id: 'connect4',  name: '4 in a Row',    emoji: '🔴', desc: 'Drop discs, connect four!',      component: Connect4,  ready: true  },
  { id: 'airhockey', name: 'Air Hockey',    emoji: '🏒', desc: 'Drag your mallet, score goals!', component: AirHockey, ready: true  },
  { id: 'snake',     name: 'Snake Race',    emoji: '🐍', desc: 'Two snakes, one apple!',         component: Snake,     ready: true  },
  { id: 'balloons',  name: 'Pop Balloons!', emoji: '🎈', desc: 'Pop as many as you can!',        component: Balloons,  ready: true  },
  { id: 'shooter',   name: 'Quick Shot!',   emoji: '🔫', desc: 'Shoot villains, spare pets!',    component: Shooter,   ready: true  },
  //{ id: 'spinner',   name: 'Spinner',       emoji: '🎡', desc: 'Tap battle + spin to decide!',   component: Spinner,   ready: true  },
  //{ id: 'lego',      name: 'LEGO Builder',  emoji: '🧱', desc: 'Build together!',                component: Lego,      ready: true  },
  { id: 'mountain',  name: 'Mountain Quiz', emoji: '🏔️', desc: 'Math quiz up the mountain!',    component: Mountain,  ready: true  },
  { id: 'tugofwar',  name: 'Tug of War', emoji: '💪', desc: 'Pull the rope!', component: TugOfWar, ready: true },
  { id: 'chefshowdown', name: 'Chef Showdown', emoji: '🍳', desc: '60s to impress the judges!', component: ChefShowdown, ready: true },
  { id: 'wordquiz',  name: 'Word Quiz', emoji: '🔤', desc: 'Hear it, tap it!', component: WordQuiz, ready: true },
  { id: 'splendor', name: 'Splendor', emoji: '💎', desc: 'Collect gems, buy cards, impress nobles!', component: Splendor, ready: true },




  //{ id: 'memory',    name: 'Memory',        emoji: '🃏', desc: 'Flip and match the cards!',      component: null,      ready: false },
]

function makeWatermarkBg(color, shape = 'crown') {
  const shapes = {
    crown:  `<text x='60' y='80' font-size='90' text-anchor='middle' fill='${color}' opacity='0.07'>👑</text>`,
    tiara:  `<text x='60' y='80' font-size='90' text-anchor='middle' fill='${color}' opacity='0.07'>🌸</text>`,
    star:   `<text x='60' y='80' font-size='90' text-anchor='middle' fill='${color}' opacity='0.07'>⭐</text>`,
    rocket: `<text x='60' y='80' font-size='90' text-anchor='middle' fill='${color}' opacity='0.07'>🚀</text>`,
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'>${shapes[shape] || shapes.crown}</svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

function OnlinePill({ name, players }) {
  const p = players[name]
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
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

function PinScreen({ onLogin }) {
  const [digits, setDigits]   = useState(['', '', '', ''])
  const [error, setError]     = useState('')
  const [shake, setShake]     = useState(false)
  const [loading, setLoading] = useState(false)
  const refs = [useRef(), useRef(), useRef(), useRef()]

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
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs[i - 1].current?.focus()
  }

  const doShake = (msg) => {
    setError(msg)
    setShake(true)
    setDigits(['', '', '', ''])
    setTimeout(() => { setShake(false); refs[0].current?.focus() }, 600)
  }

  const submit = async (pin) => {
    setLoading(true)
    try {
      const res = await fetch(`${API}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })
      if (res.status === 409) { doShake('Already logged in on another device!'); return }
      if (!res.ok)            { doShake('Wrong PIN, try again!'); return }
      const { player, token } = await res.json()
      sessionStorage.setItem('gfk_player', player)
      sessionStorage.setItem('gfk_token', token)
      onLogin(player, token)
    } catch {
      doShake('Connection error, try again!')
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
              style={{ ...s.pinInput, borderColor: error ? '#ef4444' : d ? '#6366f1' : '#e2e8f0', boxShadow: d ? '0 0 0 3px #6366f133' : 'none' }}
            />
          ))}
        </div>
        {error   && <p style={s.pinError}>{error}</p>}
        {loading && <p style={s.pinLoading}>Checking...</p>}
      </div>
      <style>{`
        @keyframes shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-10px)} 40%{transform:translateX(10px)} 60%{transform:translateX(-8px)} 80%{transform:translateX(8px)} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  )
}

function GameHub({ player, players, onSelectGame, onlinePlayers, waitingStatus }) {
  const p = players[player]
  return (
    <div style={{ ...s.hubWrap, background: p?.bg || '#f0fdf4', backgroundImage: p?.bgImage, backgroundSize: '120px' }}>
      <header style={s.hubHeader}>
        <div style={s.hubLogo}>🎮 <span style={{ fontSize: 16 }}>Game Room</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {onlinePlayers.map(name => <OnlinePill key={name} name={name} players={players} />)}
        </div>
        <div style={{ ...s.hubBadge, background: p?.color || '#6366f1' }}>{p?.emoji} {player}</div>
      </header>

      <h2 style={s.hubTitle}>Pick a game!</h2>

      <div style={s.gameGrid}>
        {GAMES.map(g => {
          const waitingEntry = waitingStatus?.find(w => w.game === g.name && w.name !== player)
          const waitingHere  = waitingEntry ? { name: waitingEntry.name, p: players[waitingEntry.name] } : null
          return (
            <div key={g.id} onClick={() => g.ready && onSelectGame(g.id)} style={{
              ...s.gameCard,
              opacity:     g.ready ? 1 : 0.5,
              cursor:      g.ready ? 'pointer' : 'not-allowed',
              borderColor: g.ready ? (p?.color || '#6366f1') : '#e2e8f0',
              boxShadow:   waitingHere ? `0 4px 20px ${waitingHere.p?.color}44` : '0 4px 16px #0001',
              transform:   waitingHere ? 'scale(1.03)' : 'scale(1)',
            }}>
              <div style={s.gameEmoji}>{g.emoji}</div>
              <div style={s.gameName}>{g.name}</div>
              <div style={s.gameDesc}>{g.desc}</div>
              {waitingHere && (
                <div style={{ marginTop: 8, padding: '4px 10px', borderRadius: 999, background: waitingHere.p?.color, color: '#fff', fontSize: 11, fontWeight: 800 }}>
                  {waitingHere.p?.emoji} {waitingHere.name} is waiting!
                </div>
              )}
              {!g.ready && <div style={s.gameSoon}>Coming soon</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function App() {
  const [player, setPlayer]         = useState(null)
  const [token, setToken]           = useState(null)
  const [gameId, setGameId]         = useState(null)
  const [players, setPlayers]       = useState({})
  const [loading, setLoading]       = useState(true)
  const [onlinePlayers, setOnline]  = useState([])
  const [waitingStatus, setWaiting] = useState([])
  const pollRef                     = useRef(null)

  useEffect(() => {
    fetch(`${API}/players`)
      .then(r => r.json())
      .then(data => {
        const map = {}
        data.players.forEach((p, idx) => {
          map[p.name] = { ...p, bgImage: makeWatermarkBg(p.color, ['crown','tiara','star','rocket'][idx % 4]) }
        })
        setPlayers(map)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (loading) return
    const savedPlayer = sessionStorage.getItem('gfk_player')
    const savedToken  = sessionStorage.getItem('gfk_token')
    if (!savedPlayer || !savedToken) return
    setPlayer(savedPlayer)
    setToken(savedToken)
    // fetch(`${API}/resume`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ player: savedPlayer, token: savedToken }),
    // }).catch(() => {})
  }, [loading])

 useEffect(() => {
  if (!player || !token) return
  const handleUnload = () => {
    navigator.sendBeacon(`${API}/logout`, new Blob([JSON.stringify({ player, token })], { type: 'application/json' }))
  }
  window.addEventListener('beforeunload', handleUnload)
  return () => window.removeEventListener('beforeunload', handleUnload)
}, [player, token])

  useEffect(() => {
    if (!player) return
    const poll = () => {
      fetch(`${API}/online`)
        .then(r => r.json())
        .then(d => {
          setOnline(d.online || [])
          const waitingDict = d.waiting || {}
          setWaiting(Object.entries(waitingDict).map(([name, game]) => ({ name, game })))
        })
        .catch(() => {})
    }
    poll()
    pollRef.current = setInterval(poll, 3000)
    return () => clearInterval(pollRef.current)
  }, [player])
  useEffect(() => {
      window.history.pushState({ pwa: true }, '')
      const onPopState = () => {
        window.history.pushState({ pwa: true }, '')
        setGameId(null)
      }
      window.addEventListener('popstate', onPopState)
      return () => window.removeEventListener('popstate', onPopState)
    }, [])

  const handleLogin = (p, t) => { setPlayer(p); setToken(t) }
  

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
      <div style={{ color: '#fff', fontSize: 24, fontWeight: 900 }}>🎮 Loading...</div>
    </div>
  )

  const game = GAMES.find(g => g.id === gameId)

  return (
    <>
      {!player && <PinScreen onLogin={handleLogin} />}
      {player && !gameId && (
        <GameHub player={player} players={players} onSelectGame={setGameId} onlinePlayers={onlinePlayers} waitingStatus={waitingStatus} />
      )}
      {player && gameId && game?.component && (() => {
        const GameComponent = game.component
        return <GameComponent player={player} players={players} onBack={() => setGameId(null)} />
      })()}
 
    </>
  )
}

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
  hubHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', background: '#ffffffcc', backdropFilter: 'blur(8px)', boxShadow: '0 1px 0 #e2e8f0', gap: 8, flexWrap: 'wrap' },
  hubLogo:   { fontSize: 22, fontWeight: 900, color: '#1e1b4b' },
  hubBadge:  { color: '#fff', padding: '6px 14px', borderRadius: 999, fontWeight: 800, fontSize: 14 },
  hubTitle:  { fontSize: 26, fontWeight: 900, color: '#1e1b4b', textAlign: 'center', padding: '28px 0 16px' },
  gameGrid:  { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16, maxWidth: 680, margin: '0 auto', padding: '0 20px' },
  gameCard:  { background: '#ffffffee', borderRadius: 20, padding: '24px 16px', textAlign: 'center', border: '2px solid', boxShadow: '0 4px 16px #0001', transition: 'transform 0.15s, box-shadow 0.15s', cursor: 'pointer' },
  gameEmoji: { fontSize: 44, marginBottom: 8 },
  gameName:  { fontSize: 16, fontWeight: 900, color: '#1e1b4b', marginBottom: 4 },
  gameDesc:  { fontSize: 12, color: '#94a3b8' },
  gameSoon:  { marginTop: 8, fontSize: 10, fontWeight: 800, letterSpacing: 1, color: '#cbd5e1', textTransform: 'uppercase' },
}