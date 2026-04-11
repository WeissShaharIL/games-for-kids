import { useState, useEffect, useRef } from 'react'
import { playSound } from '../sounds'
import { vibrate, VIBRATIONS } from '../vibrate'
import { getPlayer } from '../playerUtils'

const WS_PROTOCOL = location.protocol === 'https:' ? 'wss' : 'ws'
const WS_URL      = `${WS_PROTOCOL}://${location.host}/api/wordquiz/ws`

const FALLBACKS = [
  { color: '#16a34a', light: '#dcfce7', bg: '#f0fdf4', emoji: '🦁' },
  { color: '#db2777', light: '#fce7f3', bg: '#fdf2f8', emoji: '🦋' },
  { color: '#2563eb', light: '#dbeafe', bg: '#eff6ff', emoji: '🦊' },
  { color: '#d97706', light: '#fef3c7', bg: '#fffbeb', emoji: '🌸' },
]
function getPlayer(players, name, idx = 0) {
  if (players?.[name]) return players[name]
  return FALLBACKS[idx % FALLBACKS.length]
}

function speak(word) {
  try {
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(word)
    utt.lang  = 'en-US'
    utt.rate  = 0.85
    utt.pitch = 1.1
    window.speechSynthesis.speak(utt)
  } catch (e) {}
}

const LEVEL_CONFIG = {
  easy:   { label: 'Easy',   emoji: '🟢', desc: 'Common words', color: '#22c55e' },
  medium: { label: 'Medium', emoji: '🟡', desc: 'Harder words', color: '#f59e0b' },
  hard:   { label: 'Hard',   emoji: '🔴', desc: 'Tricky words', color: '#ef4444' },
}

const ANSWER_TIME = 5.0

export default function WordQuiz({ player, players, onBack }) {
  const [state, setState]      = useState(null)
  const [flash, setFlash]      = useState(null)
  const [floatMsg, setFloat]   = useState(null)
  const [localLevel, setLocal] = useState('easy')

  const wsRef          = useRef(null)
  const wsGenRef       = useRef(0)
  const reconnTimerRef = useRef(null)
  const outboxRef      = useRef([])
  const mountedRef     = useRef(true)
  const prevPhase      = useRef(null)
  const prevWord       = useRef(null)
  const prevResult     = useRef(null)

  const p = getPlayer(players, player, 0)

  const flushOutbox = (ws) => {
    while (outboxRef.current.length > 0 && ws.readyState === WebSocket.OPEN) {
      ws.send(outboxRef.current.shift())
    }
  }

  const send = (msg) => {
    const data = JSON.stringify(msg)
    const ws   = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send(data); return } catch {}
    }
    if (msg.type === 'set_level') {
      outboxRef.current = outboxRef.current.filter(m => {
        try { return JSON.parse(m).type !== 'set_level' } catch { return true }
      })
    }
    outboxRef.current.push(data)
  }

  useEffect(() => {
    mountedRef.current = true
    wsGenRef.current  += 1
    const myGen = wsGenRef.current

    const clearTimer = () => {
      if (reconnTimerRef.current) { clearTimeout(reconnTimerRef.current); reconnTimerRef.current = null }
    }

    const detach = (ws) => { ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null }

    const makeWs = () => {
      if (!mountedRef.current) return
      if (wsGenRef.current !== myGen) return
      clearTimer()

      const ws = new WebSocket(`${WS_URL}/${player}`)
      wsRef.current = ws

      ws.onopen = () => {
        if (wsGenRef.current !== myGen || wsRef.current !== ws) return
        flushOutbox(ws)
      }

      ws.onmessage = (e) => {
        if (wsGenRef.current !== myGen || wsRef.current !== ws) return
        if (!mountedRef.current) return
        const data = JSON.parse(e.data)
        setState(data)

        if (data.current?.word && data.current.word !== prevWord.current) {
          prevWord.current = data.current.word
          setTimeout(() => speak(data.current.word), 400)
        }
        if (data.round_result && data.round_result.word !== prevResult.current) {
          prevResult.current = data.round_result.word
          if (data.round_result.winner === player) {
            playSound('win'); vibrate(VIBRATIONS.win)
            setFlash('correct')
            setTimeout(() => { if (mountedRef.current) setFlash(null) }, 500)
          }
        }
        if (data.phase !== prevPhase.current) {
          if (data.phase === 'countdown') playSound('rematch')
          if (data.phase === 'result') {
            const winner = Object.entries(data.scores || {}).sort((a,b) => b[1]-a[1])[0]?.[0]
            winner === player ? playSound('win') : playSound('lose')
          }
          prevPhase.current = data.phase
        }
      }

      ws.onerror = () => { try { ws.close() } catch {} }

      ws.onclose = () => {
        if (wsGenRef.current !== myGen || wsRef.current !== ws) return
        clearTimer()
        reconnTimerRef.current = setTimeout(() => {
          if (mountedRef.current && wsGenRef.current === myGen) makeWs()
        }, 2000)
      }
    }

    makeWs()

    return () => {
      mountedRef.current = false
      clearTimer()
      const ws = wsRef.current
      if (ws) { detach(ws); try { ws.close(1000, 'cleanup') } catch {} }
      window.speechSynthesis?.cancel()
    }
  }, [player])

  // Sync server level → local when non-host sees host change it
  useEffect(() => {
    if (state?.level && state.level !== localLevel) {
      setLocal(state.level)
    }
  }, [state?.level])

  const showFloat = (label, color) => {
    const key = Date.now()
    setFloat({ label, color, key })
    setTimeout(() => { if (mountedRef.current) setFloat(null) }, 900)
  }

  const answer = (emoji) => {
    if (!state || state.phase !== 'playing') return
    if (state.frozen?.includes(player)) return
    if (state.round_result) return
    vibrate(VIBRATIONS.tap)
    const isCorrect = emoji === state.current?.correct
    if (isCorrect) {
      setFlash('correct'); showFloat('+1 ✅', '#22c55e')
      setTimeout(() => { if (mountedRef.current) setFlash(null) }, 500)
    } else {
      playSound('error'); setFlash('wrong'); showFloat('-1 ❌', '#ef4444')
      setTimeout(() => { if (mountedRef.current) setFlash(null) }, 400)
    }
    send({ type: 'answer', emoji })
  }

  const reSpeak = () => { if (state?.current?.word) speak(state.current.word) }

  if (!state) return (
    <div style={{ minHeight:'100vh', background:'#1e1b4b', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ fontSize:64 }}>🔤</div>
    </div>
  )

  const { phase, countdown, round_num=0, total_rounds=20, current, time_left=5, scores={}, frozen=[], round_result, connected=[], host } = state
  const isHost      = player === host
  const effectiveLevel = localLevel   // local is truth — synced from server above
  const isFrozen    = frozen.includes(player)
  const timeProgress = time_left / ANSWER_TIME
  const showResult   = !!round_result
  const correctEmoji = round_result?.correct
  const lc           = LEVEL_CONFIG[effectiveLevel] || LEVEL_CONFIG.easy

  // ── LOBBY ──────────────────────────────────────────────────────────────────
  if (phase === 'lobby') return (
    <div style={{ minHeight:'100vh', background:'#1e1b4b', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24, fontFamily:'sans-serif' }}>
      <button type="button" onClick={onBack} style={{ position:'absolute', top:16, left:16, background:'none', border:'none', fontSize:28, cursor:'pointer', color:'#6366f1' }}>←</button>
      <div style={{ fontSize:72 }}>🔤</div>
      <h2 style={{ fontSize:28, fontWeight:900, color:'#fff', margin:'10px 0 4px' }}>Word Quiz!</h2>
      <p style={{ color:'#818cf8', fontSize:13, margin:'0 0 24px' }}>Hear it — tap the right emoji! • 5 sec per word</p>

      <div style={{ display:'flex', flexWrap:'wrap', gap:8, justifyContent:'center', marginBottom:24 }}>
        {connected.map((name, i) => {
          const pi = getPlayer(players, name, i)
          return (
            <div key={name} style={{ display:'flex', alignItems:'center', gap:8, background:`${pi.color}22`, border:`2px solid ${pi.color}55`, borderRadius:20, padding:'8px 16px' }}>
              <span style={{ fontSize:18 }}>{pi.emoji}</span>
              <span style={{ fontWeight:700, color:pi.color }}>{name}</span>
              {name === host && <span style={{ fontSize:10, color:pi.color, opacity:0.7 }}>(host)</span>}
            </div>
          )
        })}
        {connected.length < 2 && (
          <div style={{ display:'flex', alignItems:'center', gap:8, background:'rgba(255,255,255,0.05)', border:'2px solid rgba(255,255,255,0.08)', borderRadius:20, padding:'8px 16px' }}>
            <span style={{ fontSize:18 }}>👤</span><span style={{ color:'#4338ca' }}>Waiting...</span>
          </div>
        )}
      </div>

      <div style={{ marginBottom:28, width:'100%', maxWidth:360 }}>
        <div style={{ color:'#6366f1', fontSize:11, fontWeight:700, letterSpacing:2, textTransform:'uppercase', textAlign:'center', marginBottom:10 }}>
          {isHost ? 'Choose Difficulty' : `Difficulty: ${lc.label}`}
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {Object.entries(LEVEL_CONFIG).map(([key, cfg]) => (
            <button
              type="button"
              key={key}
              onClick={() => {
                if (!isHost) return
                setLocal(key)
                send({ type: 'set_level', level: key })
              }}
              style={{
                flex:1, padding:'12px 8px', borderRadius:14,
                border: effectiveLevel===key ? `2px solid ${cfg.color}` : '2px solid rgba(255,255,255,0.08)',
                background: effectiveLevel===key ? `${cfg.color}22` : 'rgba(255,255,255,0.04)',
                cursor: isHost ? 'pointer' : 'default',
                transition:'all 0.15s',
                opacity: !isHost && effectiveLevel!==key ? 0.35 : 1,
              }}
            >
              <div style={{ fontSize:22 }}>{cfg.emoji}</div>
              <div style={{ fontSize:13, fontWeight:800, color: effectiveLevel===key ? cfg.color : '#64748b', marginTop:4 }}>{cfg.label}</div>
              <div style={{ fontSize:10, color:'#475569', marginTop:2 }}>{cfg.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {isHost ? (
        <button type="button" onClick={() => send({ type: 'start' })} disabled={connected.length < 2} style={{
          background: connected.length >= 2 ? lc.color : '#312e81',
          color:'#fff', border:'none', borderRadius:16, padding:'14px 40px',
          fontSize:18, fontWeight:'bold',
          cursor: connected.length >= 2 ? 'pointer' : 'not-allowed',
          boxShadow: connected.length >= 2 ? `0 4px 20px ${lc.color}55` : 'none',
        }}>
          {connected.length < 2 ? 'Waiting for players...' : `${lc.emoji} Start ${lc.label}!`}
        </button>
      ) : (
        <div style={{ color:'#6366f1', fontSize:15, textAlign:'center' }}>
          <div style={{ fontSize:28, marginBottom:8 }}>⏳</div>
          Waiting for <strong style={{ color:'#818cf8' }}>{host}</strong> to start...
        </div>
      )}
    </div>
  )

  // ── COUNTDOWN ──────────────────────────────────────────────────────────────
  if (phase === 'countdown') return (
    <div style={{ minHeight:'100vh', background:'#1e1b4b', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', fontFamily:'sans-serif' }}>
      <div style={{ fontSize:18, color:lc.color, fontWeight:700, marginBottom:8, letterSpacing:2 }}>{lc.emoji} {lc.label.toUpperCase()} MODE</div>
      <div style={{ fontSize:140, fontWeight:900, color:'#818cf8', lineHeight:1, textShadow:'0 0 60px #6366f188' }}>
        {countdown === 0 ? 'GO!' : countdown}
      </div>
      <div style={{ color:'#6366f1', fontSize:18, marginTop:16 }}>5 seconds per word!</div>
    </div>
  )

  // ── RESULT ─────────────────────────────────────────────────────────────────
  if (phase === 'result') {
    const sorted = Object.entries(scores).sort((a,b) => b[1]-a[1])
    const winner = sorted[0]?.[0]
    const iWon   = winner === player
    return (
      <div style={{ minHeight:'100vh', background:'#1e1b4b', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24, fontFamily:'sans-serif' }}>
        <div style={{ fontSize:80 }}>{iWon ? '🏆' : '🔤'}</div>
        <h2 style={{ fontSize:32, margin:'12px 0 4px', color: iWon ? '#818cf8' : '#fff', fontWeight:900 }}>
          {iWon ? 'You Won!' : `${winner} Wins!`}
        </h2>
        <p style={{ color:'#4338ca', margin:'0 0 28px', fontSize:13 }}>{lc.emoji} {lc.label} mode • {total_rounds} rounds</p>
        <div style={{ width:'100%', maxWidth:340 }}>
          {sorted.map(([name, score], i) => {
            const pi = getPlayer(players, name, i)
            return (
              <div key={name} style={{ display:'flex', alignItems:'center', gap:12, background:name===player?`${pi.color}22`:'rgba(255,255,255,0.05)', border:`2px solid ${name===player?pi.color:'rgba(255,255,255,0.1)'}`, borderRadius:16, padding:'12px 20px', marginBottom:10 }}>
                <span style={{ fontSize:24 }}>{i===0?'🥇':i===1?'🥈':'🥉'}</span>
                <span style={{ fontSize:20 }}>{pi.emoji}</span>
                <span style={{ fontWeight:800, color:name===player?pi.color:'#fff', flex:1 }}>{name}</span>
                <span style={{ fontSize:28, fontWeight:900, color:name===player?pi.color:'#fff' }}>{score}</span>
              </div>
            )
          })}
        </div>
        <div style={{ display:'flex', gap:12, marginTop:24 }}>
          <button type="button" onClick={onBack} style={{ background:'rgba(255,255,255,0.08)', border:'none', borderRadius:14, padding:'12px 24px', fontSize:16, cursor:'pointer', color:'#fff' }}>← Back</button>
          <button type="button" onClick={() => { playSound('rematch'); send({ type:'reset' }) }} style={{ background:'#6366f1', color:'#fff', border:'none', borderRadius:14, padding:'12px 28px', fontSize:16, fontWeight:'bold', cursor:'pointer' }}>🔄 Play Again</button>
        </div>
      </div>
    )
  }

  // ── PLAYING ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:'100vh', background: flash==='correct' ? '#052e16' : flash==='wrong' ? '#2d0000' : '#1e1b4b', display:'flex', flexDirection:'column', alignItems:'center', fontFamily:'sans-serif', userSelect:'none', transition:'background 0.15s' }}>

      <div style={{ width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 16px', background:'rgba(0,0,0,0.3)', borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
        <button type="button" onClick={onBack} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'#6366f1' }}>←</button>
        <div style={{ display:'flex', gap:16 }}>
          {connected.map((name, i) => {
            const pi = getPlayer(players, name, i)
            return (
              <div key={name} style={{ display:'flex', alignItems:'center', gap:4, background:name===player?`${pi.color}22`:'transparent', borderRadius:8, padding:'2px 8px' }}>
                <span style={{ fontSize:15 }}>{pi.emoji}</span>
                <span style={{ fontWeight:900, color:pi.color, fontSize:18 }}>{scores[name]??0}</span>
              </div>
            )
          })}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <span style={{ fontSize:12 }}>{lc.emoji}</span>
          <span style={{ color:'#4338ca', fontSize:12, fontWeight:700 }}>{round_num}/{total_rounds}</span>
        </div>
      </div>

      <div style={{ width:'100%', height:3, background:'rgba(255,255,255,0.06)' }}>
        <div style={{ height:'100%', width:`${Math.max(0,(round_num-1)/total_rounds)*100}%`, background:'#6366f1', transition:'width 0.5s' }} />
      </div>

      <div style={{ width:'100%', height:8, background:'rgba(255,255,255,0.06)' }}>
        <div style={{ height:'100%', width:`${timeProgress*100}%`, background: timeProgress > 0.5 ? '#22c55e' : timeProgress > 0.25 ? '#f59e0b' : '#ef4444', transition:'width 0.1s linear', boxShadow:`0 0 10px ${timeProgress > 0.5 ? '#22c55e' : '#ef4444'}` }} />
      </div>

      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'12px 20px', width:'100%', maxWidth:440, gap:16, position:'relative' }}>

        {floatMsg && (
          <div key={floatMsg.key} style={{ position:'absolute', top:'6%', fontSize:26, fontWeight:900, color:floatMsg.color, animation:'floatUp 0.9s ease-out forwards', pointerEvents:'none', zIndex:20, textShadow:`0 2px 12px ${floatMsg.color}88` }}>
            {floatMsg.label}
          </div>
        )}

        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:11, color:'#6366f1', fontWeight:700, letterSpacing:2, textTransform:'uppercase', marginBottom:6 }}>
            {isFrozen && !showResult ? '❌ Wrong! -1 point' : `${lc.emoji} ${lc.label} • Listen!`}
          </div>
          <div style={{ fontSize:38, fontWeight:900, color: isFrozen && !showResult ? '#ef4444' : '#fff', letterSpacing:1, textTransform:'uppercase', textShadow:'0 0 30px #6366f188', transition:'color 0.2s' }}>
            {showResult ? round_result.word : (current?.word || '...')}
          </div>
          {!showResult && (
            <button type="button" onClick={reSpeak} style={{ marginTop:8, background:'rgba(99,102,241,0.15)', border:'1px solid #6366f133', borderRadius:20, padding:'5px 14px', color:'#818cf8', fontSize:12, fontWeight:700, cursor:'pointer' }}>
              🔊 Again
            </button>
          )}
        </div>

        {showResult && (
          <div style={{ background: round_result.winner ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.15)', border:`2px solid ${round_result.winner ? '#22c55e' : '#ef4444'}`, borderRadius:14, padding:'10px 20px', textAlign:'center', width:'100%', maxWidth:320 }}>
            {round_result.winner ? (
              <div style={{ color:'#86efac', fontWeight:900, fontSize:16 }}>
                {round_result.winner === player ? '🎉 You got it!' : `${round_result.winner} got it!`}
              </div>
            ) : (
              <div style={{ color:'#fca5a5', fontWeight:900, fontSize:16 }}>⏱ Time's up!</div>
            )}
            <div style={{ color:'rgba(255,255,255,0.4)', fontSize:13, marginTop:3 }}>
              Answer: {round_result.correct}
            </div>
          </div>
        )}

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, width:'100%' }}>
          {(current?.choices || []).map((emoji, i) => {
            const isCorrect = showResult && emoji === correctEmoji
            const isWrong   = showResult && emoji !== correctEmoji
            return (
              <button type="button" key={i} onClick={() => answer(emoji)} disabled={showResult} style={{
                height:100, borderRadius:18,
                border: isCorrect ? '3px solid #22c55e' : isWrong ? '3px solid rgba(255,255,255,0.03)' : isFrozen ? '3px solid #ef444433' : '3px solid rgba(255,255,255,0.1)',
                background: isCorrect ? 'rgba(34,197,94,0.25)' : isWrong ? 'rgba(255,255,255,0.02)' : isFrozen ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.06)',
                fontSize:52, cursor: showResult ? 'default' : 'pointer',
                opacity: isWrong ? 0.2 : 1,
                transition:'all 0.15s',
                boxShadow: isCorrect ? '0 0 24px #22c55e55' : 'none',
                transform: isCorrect ? 'scale(1.06)' : 'scale(1)',
                display:'flex', alignItems:'center', justifyContent:'center',
              }}>
                {emoji}
              </button>
            )
          })}
        </div>
      </div>

      <style>{`
        @keyframes floatUp {
          from { opacity:1; transform:translateY(0); }
          to   { opacity:0; transform:translateY(-55px); }
        }
      `}</style>
    </div>
  )
}