import { useState, useEffect, useRef, useCallback } from 'react'
import { playSound } from '../sounds'
import { vibrate, VIBRATIONS } from '../vibrate'
import { getPlayer } from '../playerUtils'

const WS_PROTOCOL = location.protocol === 'https:' ? 'wss' : 'ws'
const WS_URL = `${WS_PROTOCOL}://${location.host}/api/chefshowdown/ws`

const FALLBACKS = [
  { color: '#16a34a', light: '#dcfce7', bg: '#f0fdf4', emoji: '🦁' },
  { color: '#db2777', light: '#fce7f3', bg: '#fdf2f8', emoji: '🦋' },
  { color: '#2563eb', light: '#dbeafe', bg: '#eff6ff', emoji: '🦊' },
  { color: '#d97706', light: '#fef3c7', bg: '#fffbeb', emoji: '🌸' },
  { color: '#7c3aed', light: '#ede9fe', bg: '#faf5ff', emoji: '🧔' },
  { color: '#0891b2', light: '#cffafe', bg: '#ecfeff', emoji: '👩' },
]
function getPlayer(players, name, idx = 0) {
  if (players?.[name]) return players[name]
  return FALLBACKS[idx % FALLBACKS.length]
}

const JUDGES = [
  { name: 'Chef Marco', emoji: '👨‍🍳' },
  { name: 'Judge Yuki', emoji: '👩‍🍳' },
  { name: 'Gordon',     emoji: '🧑‍🍳' },
]

// ── Lobby ──────────────────────────────────────────────────────────────────
function Lobby({ player, players, connected, host, onStart }) {
  const p = getPlayer(players, player, 0)
  const isHost = player === host
  const canStart = connected.length >= 2

  return (
    <div style={styles.screen}>
      <div style={styles.lobbyCard}>
        <div style={{ fontSize: 64, marginBottom: 8 }}>🍳</div>
        <h1 style={styles.title}>Chef Showdown</h1>
        <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 24 }}>
          3 judges. 60 seconds. One dish. May the best chef win.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24, width: '100%' }}>
          {connected.map((name, i) => {
            const pp = getPlayer(players, name, i)
            return (
              <div key={name} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: `${pp.color}15`, border: `1.5px solid ${pp.color}44`,
                borderRadius: 12, padding: '10px 14px',
              }}>
                <span style={{ fontSize: 22 }}>{pp.emoji}</span>
                <span style={{ fontWeight: 800, color: pp.color, flex: 1 }}>{name}</span>
                {name === host && <span style={{ fontSize: 11, color: pp.color, fontWeight: 700, opacity: 0.7 }}>HOST</span>}
              </div>
            )
          })}
        </div>

        {isHost ? (
          <button
            onClick={onStart}
            disabled={!canStart}
            style={{
              ...styles.btn,
              background: canStart ? p.color : '#334155',
              color: '#fff',
              opacity: canStart ? 1 : 0.5,
              fontSize: 16,
              padding: '14px 32px',
            }}
          >
            {canStart ? '🍽️ Start Showdown!' : `Waiting for players... (${connected.length}/2+)`}
          </button>
        ) : (
          <div style={{ color: '#64748b', fontWeight: 700, fontSize: 14 }}>
            ⏳ Waiting for {host} to start...
          </div>
        )}
      </div>
    </div>
  )
}

// ── Announcing ────────────────────────────────────────────────────────────
function Announcing({ dish, announceStep, judges }) {
  const judgeList = judges || JUDGES

  return (
    <div style={{ ...styles.screen, background: '#0a0a1a' }}>
      <div style={{ textAlign: 'center', padding: '0 24px' }}>
        <p style={{ color: '#64748b', fontSize: 13, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 32 }}>
          Tonight's Challenge
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 48 }}>
          {judgeList.map((j, i) => (
            <div key={j.name} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              opacity: announceStep > i ? 1 : 0.15,
              transform: announceStep > i ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.8)',
              transition: 'all 0.5s cubic-bezier(0.34,1.56,0.64,1)',
            }}>
              <div style={{
                fontSize: 52, background: announceStep > i ? '#1e293b' : 'transparent',
                borderRadius: 20, padding: 12,
                boxShadow: announceStep > i ? '0 8px 32px #0006' : 'none',
                border: `2px solid ${announceStep > i ? '#334155' : 'transparent'}`,
              }}>
                {j.emoji}
              </div>
              <span style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700 }}>{j.name}</span>
            </div>
          ))}
        </div>

        {announceStep >= judgeList.length && dish && (
          <div style={{
            animation: 'popIn 0.6s cubic-bezier(0.34,1.56,0.64,1)',
          }}>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 8 }}>You must prepare...</p>
            <div style={{ fontSize: 96, marginBottom: 8, filter: 'drop-shadow(0 0 32px #fff4)' }}>
              {dish.emoji}
            </div>
            <h2 style={{ color: '#fff', fontSize: 36, fontWeight: 900, margin: 0 }}>{dish.name}</h2>
            <p style={{ color: '#94a3b8', fontSize: 15, marginTop: 8 }}>{dish.description}</p>
          </div>
        )}

        {announceStep >= judgeList.length + 1 && (
          <div style={{ marginTop: 32, color: '#f59e0b', fontWeight: 800, fontSize: 18, animation: 'pulse 1s infinite' }}>
            Get ready... 🔪
          </div>
        )}
      </div>
      <style>{`
        @keyframes popIn { from { opacity:0; transform:scale(0.5) rotate(-5deg) } to { opacity:1; transform:scale(1) rotate(0deg) } }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }
      `}</style>
    </div>
  )
}

// ── Ready ─────────────────────────────────────────────────────────────────
function Ready({ player, players, dish, connected, readyPlayers, onReady }) {
  const p = getPlayer(players, player, 0)
  const iAmReady = readyPlayers.includes(player)

  return (
    <div style={{ ...styles.screen, background: '#0a0a1a' }}>
      <div style={{ textAlign: 'center', padding: '0 24px', maxWidth: 360 }}>
        <div style={{ fontSize: 72, marginBottom: 12, filter: 'drop-shadow(0 0 24px #fff3)' }}>
          {dish?.emoji}
        </div>
        <h2 style={{ color: '#fff', fontWeight: 900, fontSize: 26, margin: '0 0 4px' }}>{dish?.name}</h2>
        <p style={{ color: '#64748b', fontSize: 14, marginBottom: 32 }}>{dish?.description}</p>

        {/* Who's ready */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 32 }}>
          {connected.map((name, i) => {
            const pp = getPlayer(players, name, i)
            const isReady = readyPlayers.includes(name)
            return (
              <div key={name} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: isReady ? `${pp.color}22` : '#1e293b',
                border: `1.5px solid ${isReady ? pp.color : '#334155'}`,
                borderRadius: 12, padding: '10px 14px',
                transition: 'all 0.3s',
              }}>
                <span style={{ fontSize: 20 }}>{pp.emoji}</span>
                <span style={{ fontWeight: 800, color: pp.color, flex: 1 }}>{name}</span>
                <span style={{ fontSize: 18 }}>{isReady ? '✅' : '⏳'}</span>
              </div>
            )
          })}
        </div>

        <button
          onClick={onReady}
          disabled={iAmReady}
          style={{
            width: '100%', padding: '16px', border: 'none', borderRadius: 14,
            background: iAmReady ? '#1e293b' : p.color,
            color: iAmReady ? '#475569' : '#fff',
            fontSize: 18, fontWeight: 900, cursor: iAmReady ? 'default' : 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {iAmReady ? '✅ Ready!' : '👨‍🍳 I\'m Ready!'}
        </button>
      </div>
    </div>
  )
}

// ── Cooking ───────────────────────────────────────────────────────────────
function Cooking({ player, players, dish, timeLeft, onSubmit, submitted }) {
  const p = getPlayer(players, player, 0)
  const [selected, setSelected] = useState([])

  const toggle = (ing) => {
    if (submitted) return
    vibrate(VIBRATIONS.tap)
    setSelected(prev =>
      prev.includes(ing) ? prev.filter(x => x !== ing) : [...prev, ing]
    )
    playSound('pick')
  }

  const remove = (idx) => {
    if (submitted) return
    vibrate([10])
    setSelected(prev => prev.filter((_, i) => i !== idx))
  }

  const urgentColor = timeLeft <= 10 ? '#ef4444' : timeLeft <= 20 ? '#f59e0b' : p.color
  const timerPct = timeLeft / 60

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', background: '#1e293b', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #334155' }}>
        <span style={{ fontSize: 28 }}>{dish.emoji}</span>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#fff', fontWeight: 900, fontSize: 16 }}>{dish.name}</div>
          <div style={{ color: '#64748b', fontSize: 12 }}>Add ingredients to your plate</div>
        </div>
        {/* Timer */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: urgentColor, fontVariantNumeric: 'tabular-nums', transition: 'color 0.3s' }}>
            {timeLeft}s
          </div>
          <div style={{ width: 60, height: 4, background: '#334155', borderRadius: 2, overflow: 'hidden', marginTop: 2 }}>
            <div style={{ width: `${timerPct * 100}%`, height: '100%', background: urgentColor, transition: 'width 1s linear, background 0.3s' }} />
          </div>
        </div>
      </div>

      {/* Plate */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e293b', minHeight: 80 }}>
        <div style={{ fontSize: 11, color: '#475569', fontWeight: 700, marginBottom: 8, letterSpacing: 1, textTransform: 'uppercase' }}>
          Your Plate
        </div>
        {selected.length === 0 ? (
          <div style={{ color: '#334155', fontSize: 13, fontStyle: 'italic' }}>Tap ingredients below to add them...</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {selected.map((ing, i) => (
              <button key={i} onClick={() => remove(i)} style={{
                background: `${p.color}22`, border: `1.5px solid ${p.color}66`,
                borderRadius: 20, padding: '4px 10px', color: p.color,
                fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
              }}>
                {ing} <span style={{ opacity: 0.6, fontSize: 11 }}>✕</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Ingredient grid */}
      <div style={{ flex: 1, padding: '12px 16px', overflowY: 'auto' }}>
        <div style={{ fontSize: 11, color: '#475569', fontWeight: 700, marginBottom: 10, letterSpacing: 1, textTransform: 'uppercase' }}>
          Kitchen
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {dish.all_ingredients.map((ing) => {
            const isIn = selected.includes(ing)
            return (
              <button key={ing} onClick={() => toggle(ing)} style={{
                background: isIn ? `${p.color}33` : '#1e293b',
                border: `2px solid ${isIn ? p.color : '#334155'}`,
                borderRadius: 14, padding: '14px 12px',
                color: isIn ? p.color : '#94a3b8',
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
                textAlign: 'left', transition: 'all 0.15s',
                transform: isIn ? 'scale(0.97)' : 'scale(1)',
                WebkitTapHighlightColor: 'transparent',
              }}>
                {ing}
              </button>
            )
          })}
        </div>
      </div>

      {/* Submit */}
      <div style={{ padding: '12px 16px', background: '#1e293b', borderTop: '1px solid #334155' }}>
        {submitted ? (
          <div style={{ textAlign: 'center', color: '#22c55e', fontWeight: 800, fontSize: 16 }}>
            ✅ Submitted! Waiting for others...
          </div>
        ) : (
          <button onClick={() => onSubmit(selected)} style={{
            width: '100%', padding: '14px', background: p.color, border: 'none',
            borderRadius: 14, color: '#fff', fontSize: 16, fontWeight: 900, cursor: 'pointer',
          }}>
            🍽️ Done — Submit to Judges!
          </button>
        )}
      </div>
    </div>
  )
}

// ── Tasting ───────────────────────────────────────────────────────────────
function Tasting({ dish, scores, judges, onDone }) {
  const judgeList = judges || JUDGES

  // Animation steps: 0=dish flying, 1=tasting, 2=reacting
  const [step, setStep] = useState(0)
  const [reactions, setReactions] = useState([])
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    const t1 = setTimeout(() => { if (mountedRef.current) setStep(1) }, 1200)  // dish lands
    const t2 = setTimeout(() => {                                                // show reactions
      if (!mountedRef.current) return
      const reacts = judgeList.map((j, i) => {
        // Average this judge's score across all players
        const playerScores = Object.values(scores || {})
        const judgeScores = playerScores.map(s => s?.judge_scores?.[i]?.score ?? 5)
        const avg = judgeScores.length ? judgeScores.reduce((a, b) => a + b, 0) / judgeScores.length : 5
        return avg >= 7 ? '\uD83D\uDE0D' : avg >= 4 ? '\uD83D\uDE10' : '\uD83E\uDD22'
      })
      setReactions(reacts)
      setStep(2)
    }, 2800)
    const t3 = setTimeout(() => { if (mountedRef.current) onDone() }, 4800)    // go to judging
    return () => {
      mountedRef.current = false
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3)
    }
  }, [])

  return (
    <div style={{ ...styles.screen, background: '#0a0a1a', overflow: 'hidden' }}>
      {/* Judges row */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginBottom: 48, position: 'relative', zIndex: 2 }}>
        {judgeList.map((j, i) => {
          const reaction = reactions[i]
          return (
            <div key={j.name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              {/* Reaction bubble */}
              <div style={{
                fontSize: 28,
                opacity: step >= 2 ? 1 : 0,
                transform: step >= 2 ? 'translateY(0) scale(1)' : 'translateY(10px) scale(0.5)',
                transition: `all 0.4s cubic-bezier(0.34,1.56,0.64,1) ${i * 0.15}s`,
                minHeight: 40,
              }}>
                {reaction || ''}
              </div>
              {/* Judge face — chewing when tasting */}
              <div style={{
                fontSize: 52,
                background: '#1e293b',
                borderRadius: 20, padding: 12,
                border: '2px solid #334155',
                animation: step === 1 ? `chew 0.4s ${i * 0.1}s infinite alternate` : 'none',
                transition: 'transform 0.3s',
              }}>
                {j.emoji}
              </div>
              <span style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>{j.name}</span>
            </div>
          )
        })}
      </div>

      {/* Dish flying up */}
      {dish && (
        <div style={{
          fontSize: 72,
          position: 'relative',
          zIndex: 1,
          transform: step === 0 ? 'translateY(0) scale(1)' : 'translateY(-180px) scale(0.3)',
          opacity: step === 0 ? 1 : step === 1 ? 0.3 : 0,
          transition: 'all 0.9s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          filter: 'drop-shadow(0 0 24px #fff3)',
        }}>
          {dish.emoji}
        </div>
      )}

      <div style={{ marginTop: 32, color: '#475569', fontSize: 14, fontWeight: 700 }}>
        {step === 0 && 'Serving the judges...'}
        {step === 1 && 'Judges are tasting...'}
        {step === 2 && 'The verdict is in!'}
      </div>

      <style>{`
        @keyframes chew {
          from { transform: scaleY(1) }
          to   { transform: scaleY(0.88) }
        }
      `}</style>
    </div>
  )
}

// ── Judging ───────────────────────────────────────────────────────────────
function Judging({ scores, connected, players }) {
  const scored = Object.keys(scores)
  const pending = connected.filter(p => !scores[p])

  return (
    <div style={{ ...styles.screen, background: '#0a0a1a', padding: '24px 16px' }}>
      <div style={{ fontSize: 40, marginBottom: 8 }}>⚖️</div>
      <h2 style={{ color: '#fff', fontWeight: 900, fontSize: 24, marginBottom: 4 }}>Judging...</h2>
      <p style={{ color: '#64748b', fontSize: 13, marginBottom: 32 }}>The judges are deliberating</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 400 }}>
        {connected.map((name, i) => {
          const p = getPlayer(players, name, i)
          const s = scores[name]
          return (
            <div key={name} style={{
              background: '#1e293b', borderRadius: 14, padding: '12px 16px',
              display: 'flex', alignItems: 'center', gap: 10,
              border: `1.5px solid ${s ? p.color + '66' : '#334155'}`,
            }}>
              <span style={{ fontSize: 22 }}>{p.emoji}</span>
              <span style={{ fontWeight: 800, color: p.color, flex: 1 }}>{name}</span>
              {s ? (
                <span style={{ fontWeight: 900, color: '#f59e0b', fontSize: 18 }}>
                  {s.grand_total ?? s.total} pts
                </span>
              ) : (
                <span style={{ fontSize: 18, animation: 'spin 1s linear infinite' }}>⏳</span>
              )}
            </div>
          )
        })}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

// ── Podium ────────────────────────────────────────────────────────────────
function Podium({ scores, connected, players, player, onRestart, onBack, isHost }) {
  const sorted = [...connected].sort((a, b) => {
    const sa = scores[a]?.grand_total ?? scores[a]?.total ?? 0
    const sb = scores[b]?.grand_total ?? scores[b]?.total ?? 0
    return sb - sa
  })

  const medals = ['🥇', '🥈', '🥉']

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 16px', overflowY: 'auto' }}>
      <div style={{ fontSize: 48, marginBottom: 4 }}>🏆</div>
      <h2 style={{ color: '#fff', fontWeight: 900, fontSize: 28, marginBottom: 4 }}>Results</h2>
      <p style={{ color: '#64748b', fontSize: 13, marginBottom: 32 }}>The judges have spoken</p>

      {/* Podium rankings */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 420, marginBottom: 32 }}>
        {sorted.map((name, rank) => {
          const p = getPlayer(players, name, connected.indexOf(name))
          const s = scores[name]
          const isMe = name === player
          return (
            <div key={name} style={{
              background: isMe ? `${p.color}22` : '#1e293b',
              border: `2px solid ${isMe ? p.color : '#334155'}`,
              borderRadius: 18, padding: '16px 18px',
              animation: `fadeUp 0.5s ${rank * 0.15}s both`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: s?.judge_scores ? 10 : 0 }}>
                <span style={{ fontSize: 28 }}>{medals[rank] || `#${rank + 1}`}</span>
                <span style={{ fontSize: 22 }}>{p.emoji}</span>
                <span style={{ fontWeight: 900, color: p.color, flex: 1, fontSize: 16 }}>{name}</span>
                <span style={{ fontWeight: 900, color: '#f59e0b', fontSize: 22 }}>
                  {s?.grand_total ?? s?.total ?? '?'}
                </span>
              </div>
              {s?.judge_scores && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {s.judge_scores.map((j) => (
                    <div key={j.judge} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 13, color: '#f59e0b', fontWeight: 800, minWidth: 24 }}>{j.score}</span>
                      <span style={{ fontSize: 12, color: '#64748b', flex: 1, fontStyle: 'italic' }}>"{j.comment}"</span>
                    </div>
                  ))}
                  {s.speed_bonus > 0 && (
                    <div style={{ fontSize: 12, color: '#22c55e', fontWeight: 700 }}>
                      ⚡ Speed bonus: +{s.speed_bonus}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        {isHost && (
          <button onClick={onRestart} style={{ ...styles.btn, background: '#16a34a', color: '#fff' }}>
            🔄 Play Again
          </button>
        )}
        <button onClick={onBack} style={{ ...styles.btn, background: '#1e293b', color: '#94a3b8' }}>
          ← Hub
        </button>
      </div>
      <style>{`@keyframes fadeUp { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:translateY(0) } }`}</style>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────
export default function ChefShowdown({ player, players, onBack }) {
  const [state, setState] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [showTasting, setShowTasting] = useState(false)
  const wsRef = useRef(null)
  const mountedRef = useRef(true)
  const tastingShownRef = useRef(false)

  const connect = useCallback(() => {
    const ws = new WebSocket(`${WS_URL}/${player}`)
    wsRef.current = ws
    ws.onmessage = (e) => {
      if (!mountedRef.current) return
      const data = JSON.parse(e.data)
      setState(data)
      if (data.phase === 'lobby' || data.phase === 'announcing' || data.phase === 'ready') {
        setSubmitted(false)
        tastingShownRef.current = false
        setShowTasting(false)
      }
      // Trigger tasting animation once when podium arrives (scores are fully ready)
      if (data.phase === 'podium' && !tastingShownRef.current) {
        tastingShownRef.current = true
        setShowTasting(true)
      }
    }
    ws.onclose = () => { if (mountedRef.current) setTimeout(connect, 2000) }
    ws.onerror = () => ws.close()
  }, [player])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      wsRef.current?.close()
    }
  }, [connect])

  const send = (msg) => wsRef.current?.send(JSON.stringify(msg))

  const handleStart = () => send({ type: 'start' })
  const handleReady = () => send({ type: 'ready' })

  const handleSubmit = (ingredients) => {
    if (submitted) return
    setSubmitted(true)
    playSound('win')
    vibrate(VIBRATIONS.win)
    send({ type: 'submit', ingredients })
  }

  const handleRestart = () => {
    setSubmitted(false)
    send({ type: 'restart' })
  }

  if (!state) return (
    <div style={{ ...styles.screen, background: '#0a0a1a' }}>
      <div style={{ color: '#fff', fontSize: 18, fontWeight: 700 }}>🍳 Connecting...</div>
    </div>
  )

  const { phase, connected, host, dish, announce_step, judges, scores, time_left, submissions, ready_players } = state
  const isHost = player === host

  // Back button wrapper
  const withBack = (child) => (
    <div style={{ position: 'relative' }}>
      <button onClick={onBack} style={{
        position: 'fixed', top: 12, left: 12, zIndex: 100,
        background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: 10,
        color: '#94a3b8', fontSize: 13, fontWeight: 700, padding: '6px 12px', cursor: 'pointer',
      }}>← Back</button>
      {child}
    </div>
  )

  if (phase === 'lobby')      return withBack(<Lobby player={player} players={players} connected={connected} host={host} onStart={handleStart} />)
  if (phase === 'announcing') return withBack(<Announcing dish={dish} announceStep={announce_step} judges={judges || JUDGES} />)
  if (phase === 'ready')      return withBack(<Ready player={player} players={players} dish={dish} connected={connected} readyPlayers={ready_players || []} onReady={handleReady} />)
  if (phase === 'cooking')    return withBack(<Cooking player={player} players={players} dish={dish} timeLeft={time_left ?? 60} onSubmit={handleSubmit} submitted={submitted || !!submissions?.[player]} />)
  if (phase === 'judging')    return withBack(<Judging scores={scores} connected={connected} players={players} />)
  if (phase === 'podium' && showTasting) return withBack(<Tasting dish={dish} scores={scores} judges={judges || JUDGES} onDone={() => setShowTasting(false)} />)
  if (phase === 'podium')     return withBack(<Podium scores={scores} connected={connected} players={players} player={player} onRestart={handleRestart} onBack={onBack} isHost={isHost} />)

  return withBack(<div style={{ ...styles.screen }}><div style={{ color: '#fff' }}>...</div></div>)
}

const styles = {
  screen: {
    minHeight: '100vh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    background: '#0f172a', fontFamily: 'sans-serif',
  },
  lobbyCard: {
    background: '#1e293b', borderRadius: 24, padding: '36px 28px',
    textAlign: 'center', maxWidth: 380, width: '90%',
    boxShadow: '0 24px 64px #0006',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
  },
  title: { color: '#fff', fontSize: 28, fontWeight: 900, margin: '0 0 8px' },
  btn: {
    padding: '12px 24px', borderRadius: 12, border: 'none',
    fontSize: 15, fontWeight: 800, cursor: 'pointer',
    fontFamily: 'sans-serif',
  },
}