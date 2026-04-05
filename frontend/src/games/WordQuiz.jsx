import { useState, useEffect, useRef, useCallback } from 'react'
import { playSound } from '../sounds'
import { vibrate, VIBRATIONS } from '../vibrate'

const WS_PROTOCOL = location.protocol === 'https:' ? 'wss' : 'ws'
const WS_URL      = `${WS_PROTOCOL}://${location.host}/api/wordquiz/ws`

const FALLBACKS = [
  { color: '#16a34a', light: '#dcfce7', bg: '#f0fdf4', emoji: '🦁' },
  { color: '#db2777', light: '#fce7f3', bg: '#fdf2f8', emoji: '🦋' },
  { color: '#2563eb', light: '#dbeafe', bg: '#eff6ff', emoji: '🦊' },
  { color: '#d97706', light: '#fef3c7', bg: '#fffbeb', emoji: '🌸' },
]
function safe(players, name, idx = 0) {
  if (players?.[name]) return players[name]
  return FALLBACKS[idx % FALLBACKS.length]
}

function speak(word) {
  try {
    window.speechSynthesis.cancel()
    const utt  = new SpeechSynthesisUtterance(word)
    utt.lang   = 'en-US'
    utt.rate   = 0.85
    utt.pitch  = 1.1
    window.speechSynthesis.speak(utt)
  } catch (e) {}
}

export default function WordQuiz({ player, players, onBack }) {
  const [state, setState]  = useState(null)
  const [flash, setFlash]  = useState(null)
  const [floatMsg, setFloat] = useState(null)
  const wsRef              = useRef(null)
  const mountedRef         = useRef(true)
  const prevPhase          = useRef(null)
  const prevWord           = useRef(null)
  const prevResult         = useRef(null)

  const p = safe(players, player, 0)

  const connect = useCallback(() => {
    const ws = new WebSocket(`${WS_URL}/${player}`)
    wsRef.current = ws
    ws.onopen = () => {}
    ws.onmessage = (e) => {
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
    ws.onclose = () => { if (mountedRef.current) setTimeout(connect, 2000) }
    ws.onerror = () => ws.close()
  }, [player])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      wsRef.current?.close()
      window.speechSynthesis?.cancel()
    }
  }, [connect])

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
      setFlash('correct')
      showFloat('+1 ✅', '#22c55e')
      setTimeout(() => { if (mountedRef.current) setFlash(null) }, 500)
    } else {
      playSound('error')
      setFlash('wrong')
      showFloat('-1 ❌', '#ef4444')
      setTimeout(() => { if (mountedRef.current) setFlash(null) }, 400)
    }
    wsRef.current?.send(JSON.stringify({ type: 'answer', emoji }))
  }

  const sendStart = () => wsRef.current?.send(JSON.stringify({ type: 'start' }))
  const reset     = () => { playSound('rematch'); wsRef.current?.send(JSON.stringify({ type: 'reset' })) }
  const reSpeak   = () => { if (state?.current?.word) speak(state.current.word) }

  if (!state) return (
    <div style={{ minHeight:'100vh', background:'#1e1b4b', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ fontSize:64 }}>🔤</div>
    </div>
  )

  const { phase, countdown, round_num, total_rounds=20, current, time_left=8, scores={}, frozen=[], round_result, connected=[], host } = state
  const isHost      = player === host
  const isFrozen    = frozen.includes(player)
  const timeProgress = time_left / 8
  const showResult   = !!round_result
  const correctEmoji = round_result?.correct

  // ── LOBBY ──────────────────────────────────────────────────────────────────
  if (phase === 'lobby') return (
    <div style={{ minHeight:'100vh', background:'#1e1b4b', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24, fontFamily:'sans-serif' }}>
      <button onClick={onBack} style={{ position:'absolute', top:16, left:16, background:'none', border:'none', fontSize:28, cursor:'pointer', color:'#6366f1' }}>←</button>
      <div style={{ fontSize:80 }}>🔤</div>
      <h2 style={{ fontSize:28, fontWeight:900, color:'#fff', margin:'12px 0 4px' }}>Word Quiz!</h2>
      <p style={{ color:'#818cf8', fontSize:14, margin:'0 0 4px' }}>Hear the word — tap the right emoji!</p>
      <p style={{ color:'#4338ca', fontSize:13, margin:'0 0 28px' }}>{connected.length} / 4 players • {total_rounds} rounds</p>
      <div style={{ display:'flex', flexWrap:'wrap', gap:10, justifyContent:'center', marginBottom:32 }}>
        {connected.map((name, i) => {
          const pi = safe(players, name, i)
          return (
            <div key={name} style={{ display:'flex', alignItems:'center', gap:8, background:`${pi.color}22`, border:`2px solid ${pi.color}55`, borderRadius:20, padding:'8px 18px' }}>
              <span style={{ fontSize:20 }}>{pi.emoji}</span>
              <span style={{ fontWeight:700, color:pi.color }}>{name}</span>
              {name === host && <span style={{ fontSize:11, color:pi.color, opacity:0.7 }}>(host)</span>}
            </div>
          )
        })}
        {connected.length < 2 && (
          <div style={{ display:'flex', alignItems:'center', gap:8, background:'rgba(255,255,255,0.05)', border:'2px solid rgba(255,255,255,0.08)', borderRadius:20, padding:'8px 18px' }}>
            <span style={{ fontSize:20 }}>👤</span><span style={{ color:'#4338ca' }}>Waiting...</span>
          </div>
        )}
      </div>
      {isHost ? (
        <button onClick={sendStart} disabled={connected.length < 2} style={{
          background: connected.length >= 2 ? '#6366f1' : '#312e81',
          color:'#fff', border:'none', borderRadius:16, padding:'16px 40px',
          fontSize:20, fontWeight:'bold',
          cursor: connected.length >= 2 ? 'pointer' : 'not-allowed',
          boxShadow: connected.length >= 2 ? '0 4px 20px #6366f155' : 'none',
        }}>
          {connected.length < 2 ? 'Waiting for players...' : '🔤 Start Quiz!'}
        </button>
      ) : (
        <div style={{ color:'#6366f1', fontSize:16, textAlign:'center' }}>
          <div style={{ fontSize:32, marginBottom:8 }}>⏳</div>
          Waiting for <strong style={{ color:'#818cf8' }}>{host}</strong> to start...
        </div>
      )}
    </div>
  )

  // ── COUNTDOWN ──────────────────────────────────────────────────────────────
  if (phase === 'countdown') return (
    <div style={{ minHeight:'100vh', background:'#1e1b4b', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', fontFamily:'sans-serif' }}>
      <div style={{ fontSize:140, fontWeight:900, color:'#818cf8', lineHeight:1, textShadow:'0 0 60px #6366f188' }}>
        {countdown === 0 ? 'GO!' : countdown}
      </div>
      <div style={{ color:'#6366f1', fontSize:20, marginTop:16 }}>Get ready to listen!</div>
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
        <p style={{ color:'#4338ca', margin:'0 0 28px' }}>Final scores</p>
        <div style={{ width:'100%', maxWidth:340 }}>
          {sorted.map(([name, score], i) => {
            const pi = safe(players, name, i)
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
          <button onClick={onBack} style={{ background:'rgba(255,255,255,0.08)', border:'none', borderRadius:14, padding:'12px 24px', fontSize:16, cursor:'pointer', color:'#fff' }}>← Back</button>
          <button onClick={reset} style={{ background:'#6366f1', color:'#fff', border:'none', borderRadius:14, padding:'12px 28px', fontSize:16, fontWeight:'bold', cursor:'pointer' }}>🔄 Play Again</button>
        </div>
      </div>
    )
  }

  // ── PLAYING ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:'100vh', background: flash==='correct' ? '#052e16' : flash==='wrong' ? '#2d0000' : '#1e1b4b', display:'flex', flexDirection:'column', alignItems:'center', fontFamily:'sans-serif', userSelect:'none', transition:'background 0.15s' }}>

      {/* Header */}
      <div style={{ width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 16px', background:'rgba(0,0,0,0.3)', borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
        <button onClick={onBack} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'#6366f1' }}>←</button>
        <div style={{ display:'flex', gap:20 }}>
          {connected.map((name, i) => {
            const pi = safe(players, name, i)
            return (
              <div key={name} style={{ display:'flex', alignItems:'center', gap:5, background: name===player ? `${pi.color}22` : 'transparent', borderRadius:8, padding:'2px 8px' }}>
                <span style={{ fontSize:16 }}>{pi.emoji}</span>
                <span style={{ fontWeight:900, color:pi.color, fontSize:20 }}>{scores[name]??0}</span>
              </div>
            )
          })}
        </div>
        <div style={{ color:'#4338ca', fontSize:13, fontWeight:700 }}>{round_num}/{total_rounds}</div>
      </div>

      {/* Round progress */}
      <div style={{ width:'100%', height:4, background:'rgba(255,255,255,0.06)' }}>
        <div style={{ height:'100%', width:`${((round_num-1)/total_rounds)*100}%`, background:'#6366f1', transition:'width 0.5s' }} />
      </div>

      {/* Time bar */}
      <div style={{ width:'100%', height:6, background:'rgba(255,255,255,0.06)' }}>
        <div style={{ height:'100%', width:`${timeProgress*100}%`, background: timeProgress > 0.5 ? '#22c55e' : timeProgress > 0.25 ? '#f59e0b' : '#ef4444', transition:'width 0.1s linear', boxShadow:`0 0 8px ${timeProgress > 0.5 ? '#22c55e' : '#ef4444'}` }} />
      </div>

      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'16px 24px', width:'100%', maxWidth:440, gap:20, position:'relative' }}>

        {/* Float feedback */}
        {floatMsg && (
          <div key={floatMsg.key} style={{ position:'absolute', top:'8%', fontSize:28, fontWeight:900, color:floatMsg.color, animation:'floatUp 0.9s ease-out forwards', pointerEvents:'none', zIndex:20, textShadow:`0 2px 12px ${floatMsg.color}88` }}>
            {floatMsg.label}
          </div>
        )}

        {/* Word */}
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:13, color:'#6366f1', fontWeight:700, letterSpacing:2, textTransform:'uppercase', marginBottom:8 }}>
            {isFrozen && !showResult ? '❌ Wrong! -1 point' : 'Listen and tap!'}
          </div>
          <div style={{ fontSize:40, fontWeight:900, color: isFrozen && !showResult ? '#ef4444' : '#fff', letterSpacing:2, textTransform:'uppercase', textShadow:'0 0 30px #6366f188', transition:'color 0.2s' }}>
            {showResult ? round_result.word : (current?.word || '...')}
          </div>
          {!showResult && (
            <button onPointerDown={reSpeak} style={{ marginTop:10, background:'rgba(99,102,241,0.2)', border:'1px solid #6366f144', borderRadius:20, padding:'6px 16px', color:'#818cf8', fontSize:13, fontWeight:700, cursor:'pointer' }}>
              🔊 Hear again
            </button>
          )}
        </div>

        {/* Round result banner */}
        {showResult && (
          <div style={{ background: round_result.winner ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.15)', border:`2px solid ${round_result.winner ? '#22c55e' : '#ef4444'}`, borderRadius:16, padding:'12px 24px', textAlign:'center' }}>
            {round_result.winner ? (
              <div style={{ color:'#86efac', fontWeight:900, fontSize:18 }}>
                {round_result.winner === player ? '🎉 You got it!' : `${round_result.winner} got it!`}
              </div>
            ) : (
              <div style={{ color:'#fca5a5', fontWeight:900, fontSize:18 }}>⏱ Time's up!</div>
            )}
            <div style={{ color:'rgba(255,255,255,0.5)', fontSize:14, marginTop:4 }}>
              Answer: {round_result.correct}
            </div>
          </div>
        )}

        {/* 2×2 emoji grid */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, width:'100%' }}>
          {(current?.choices || []).map((emoji, i) => {
            const isCorrect = showResult && emoji === correctEmoji
            const isWrong   = showResult && emoji !== correctEmoji
            const myWrong   = !showResult && isFrozen
            return (
              <button key={i} onPointerDown={() => answer(emoji)} disabled={showResult} style={{
                height: 110, borderRadius: 20,
                border: isCorrect ? '3px solid #22c55e' : isWrong ? '3px solid rgba(255,255,255,0.04)' : isFrozen ? '3px solid #ef444444' : '3px solid rgba(255,255,255,0.12)',
                background: isCorrect ? 'rgba(34,197,94,0.25)' : isWrong ? 'rgba(255,255,255,0.02)' : isFrozen ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.07)',
                fontSize: 56, cursor: showResult ? 'default' : 'pointer',
                opacity: isWrong ? 0.25 : 1,
                transition: 'all 0.15s',
                boxShadow: isCorrect ? '0 0 24px #22c55e55' : 'none',
                transform: isCorrect ? 'scale(1.06)' : 'scale(1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
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
          to   { opacity:0; transform:translateY(-60px); }
        }
      `}</style>
    </div>
  )
}