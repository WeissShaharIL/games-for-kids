import { useEffect, useRef, useState, useCallback } from 'react'
import { playSound } from '../sounds'
import { vibrate, VIBRATIONS } from '../vibrate'
import { getPlayer } from '../playerUtils'

const WS_PROTOCOL = location.protocol === 'https:' ? 'wss' : 'ws'
const WS_URL      = `${WS_PROTOCOL}://${location.host}/api/balloons/ws`


const BALLOON_COLORS = {
  gold:  { fill: '#f59e0b', stroke: '#d97706', shine: '#fef3c7', label: '+2 🥇' },
  white: { fill: '#f8fafc', stroke: '#cbd5e1', shine: '#ffffff', label: '+1 ⚪' },
  black: { fill: '#1e293b', stroke: '#0f172a', shine: '#334155', label: '-2 🖤' },
}

const CW = 390
const CH = 600
const FREEZE_DURATION = 5000 // ms

export default function Balloons({ player, players, onBack }) {
  const [state, setState]       = useState(null)
  const [notice, setNotice]     = useState('')
  const [freezeUntil, setFreezeUntil] = useState(0)   // timestamp ms
  const [freezeLeft, setFreezeLeft]   = useState(0)   // seconds display
  const canvasRef     = useRef(null)
  const wsRef         = useRef(null)
  const animRef       = useRef(null)
  const stateRef      = useRef(null)
  const popAnimsRef   = useRef([])
  const prevPhase     = useRef(null)
  const mountedRef    = useRef(true)
  const freezeUntilRef = useRef(0)
  const freezeTimerRef = useRef(null)

  const me = getPlayer(players, player, 0)

  useEffect(() => { stateRef.current = state }, [state])

  // Freeze countdown ticker
  useEffect(() => {
    clearInterval(freezeTimerRef.current)
    if (freezeUntil > Date.now()) {
      freezeTimerRef.current = setInterval(() => {
        const left = Math.ceil((freezeUntil - Date.now()) / 1000)
        if (left <= 0) {
          setFreezeLeft(0)
          clearInterval(freezeTimerRef.current)
        } else {
          setFreezeLeft(left)
        }
      }, 200)
    } else {
      setFreezeLeft(0)
    }
    return () => clearInterval(freezeTimerRef.current)
  }, [freezeUntil])

  const connect = useCallback(() => {
    const ws = new WebSocket(`${WS_URL}/${player}`)
    wsRef.current = ws
    ws.onmessage = (e) => {
      if (!mountedRef.current) return
      const data = JSON.parse(e.data)
      setState(data)

      // Handle freeze events
      if (data.freeze_events?.length) {
        data.freeze_events.forEach(ev => {
          if (ev.target === player) {
            const until = Date.now() + FREEZE_DURATION
            freezeUntilRef.current = until
            setFreezeUntil(until)
            playSound('lose')
            vibrate(VIBRATIONS.lose)
          } else if (ev.by === player) {
            playSound('win')
            vibrate(VIBRATIONS.win)
          }
        })
      }

      if (data.pops?.length) {
        data.pops.forEach(pop => {
          const c = BALLOON_COLORS[pop.type] || BALLOON_COLORS.white
          popAnimsRef.current.push({
            x: pop.x, y: pop.y, label: c.label, color: c.fill,
            born: Date.now(), id: Math.random(),
          })
          if (pop.player === player) {
            vibrate(VIBRATIONS.tap)
            pop.points > 0 ? playSound('place') : playSound('error')
          }
        })
      }

      if (data.phase !== prevPhase.current) {
        if (data.phase === 'countdown') playSound('rematch')
        if (data.phase === 'result') {
          const winner = Object.entries(data.scores || {}).sort((a,b) => b[1]-a[1])[0]?.[0]
          winner === player ? playSound('win') : playSound('lose')
        }
        if (data.phase === 'lobby') {
          freezeUntilRef.current = 0
          setFreezeUntil(0)
        }
        prevPhase.current = data.phase
      }

      if (data.disconnected) {
        setNotice(`${data.disconnected} disconnected`)
        setTimeout(() => { if (mountedRef.current) setNotice('') }, 3000)
      }
    }
    ws.onclose = () => { if (!mountedRef.current) return; setTimeout(connect, 2000) }
    ws.onerror = () => ws.close()
  }, [player])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      wsRef.current?.close()
      cancelAnimationFrame(animRef.current)
      clearInterval(freezeTimerRef.current)
    }
  }, [connect])

  const startLoop = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (animRef.current) cancelAnimationFrame(animRef.current)
    canvas.width  = CW
    canvas.height = CH
    const ctx = canvas.getContext('2d')

    // Cache sky gradient — never changes
    const skyGrad = ctx.createLinearGradient(0, 0, 0, CH)
    skyGrad.addColorStop(0, '#bfdbfe')
    skyGrad.addColorStop(0.6, '#d1fae5')
    skyGrad.addColorStop(1, '#ecfdf5')

    // Pre-build cloud path — static
    const cloudDefs = [[55,60,42],[180,40,35],[310,85,28],[90,150,22],[265,130,26]]

    // Ice crack lines — static geometry, drawn once
    const cracks = [[20,0,80,120],[60,0,10,200],[150,0,200,180],[300,0,340,150],
                    [380,50,250,300],[0,100,120,250],[0,300,80,500],[380,200,200,400]]

    function drawBalloon(b) {
      const { fill, stroke, shine } = BALLOON_COLORS[b.type] || BALLOON_COLORS.white
      const r = 28
      // No shadowBlur — too expensive. Use a simple dark ellipse underneath instead.
      ctx.beginPath()
      ctx.ellipse(b.x + 2, b.y + 5, r * 0.8, r * 0.5, 0, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(0,0,0,0.12)'
      ctx.fill()
      // Body
      ctx.beginPath()
      ctx.ellipse(b.x, b.y, r, r * 1.25, 0, 0, Math.PI * 2)
      ctx.fillStyle = fill
      ctx.fill()
      ctx.strokeStyle = stroke
      ctx.lineWidth = 2
      ctx.stroke()
      // Shine
      ctx.beginPath()
      ctx.ellipse(b.x - r*0.3, b.y - r*0.4, r*0.22, r*0.32, -0.5, 0, Math.PI*2)
      ctx.fillStyle = shine + 'cc'
      ctx.fill()
      // Knot
      ctx.beginPath()
      ctx.arc(b.x, b.y + r*1.25, 4, 0, Math.PI*2)
      ctx.fillStyle = stroke
      ctx.fill()
      // String
      ctx.beginPath()
      ctx.moveTo(b.x, b.y + r*1.25 + 4)
      ctx.quadraticCurveTo(b.x + 10, b.y + r*1.25 + 18, b.x + 6, b.y + r*1.25 + 30)
      ctx.strokeStyle = '#94a3b855'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    function drawBird(b, now) {
      const flap   = Math.sin(now / 120)   // -1 to 1
      const facing = b.dir > 0 ? 1 : -1
      ctx.save()
      ctx.translate(b.x, b.y)
      ctx.scale(facing, 1)
      // Wing bottom (behind body)
      ctx.beginPath()
      ctx.ellipse(-4, 5 + flap * 6, 12, 5, 0.3, 0, Math.PI * 2)
      ctx.fillStyle = '#fbbf24'
      ctx.fill()
      // Body
      ctx.beginPath()
      ctx.ellipse(0, 0, 18, 11, 0, 0, Math.PI * 2)
      ctx.fillStyle = '#f59e0b'
      ctx.fill()
      ctx.strokeStyle = '#d97706'
      ctx.lineWidth = 1.5
      ctx.stroke()
      // Wing top (above body)
      ctx.beginPath()
      ctx.ellipse(-4, -5 - flap * 10, 14, 7, -0.3, 0, Math.PI * 2)
      ctx.fillStyle = '#fbbf24'
      ctx.fill()
      ctx.strokeStyle = '#d97706'
      ctx.lineWidth = 1
      ctx.stroke()
      // Beak
      ctx.beginPath()
      ctx.moveTo(16, -2); ctx.lineTo(26, 0); ctx.lineTo(16, 4)
      ctx.closePath()
      ctx.fillStyle = '#ef4444'
      ctx.fill()
      // Eye
      ctx.beginPath()
      ctx.arc(10, -3, 3, 0, Math.PI * 2)
      ctx.fillStyle = '#fff'; ctx.fill()
      ctx.beginPath()
      ctx.arc(11, -3, 1.5, 0, Math.PI * 2)
      ctx.fillStyle = '#1e293b'; ctx.fill()
      // Simple ❄ text (faster than emoji)
      ctx.font = 'bold 16px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#93c5fd'
      ctx.fillText('❄', 0, -26)
      ctx.restore()
    }

    function render() {
      animRef.current = requestAnimationFrame(render)
      const s   = stateRef.current
      const now = Date.now()

      // Sky (cached gradient)
      ctx.fillStyle = skyGrad
      ctx.fillRect(0, 0, CW, CH)

      // Freeze overlay — only draw if actually frozen
      const frozenLeft = freezeUntilRef.current - now
      if (frozenLeft > 0) {
        const alpha = Math.min(0.5, frozenLeft / FREEZE_DURATION * 0.5)
        ctx.fillStyle = `rgba(59,130,246,${alpha.toFixed(2)})`
        ctx.fillRect(0, 0, CW, CH)
        // Cracks — only draw if alpha meaningful
        if (alpha > 0.05) {
          ctx.strokeStyle = `rgba(147,197,253,${Math.min(0.8, alpha * 2).toFixed(2)})`
          ctx.lineWidth = 1.5
          cracks.forEach(([x1,y1,x2,y2]) => {
            ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke()
          })
        }
      }

      if (!s || s.phase !== 'playing') {
        ctx.fillStyle = 'rgba(255,255,255,0.6)'
        ctx.beginPath()
        ctx.roundRect(CW/2 - 100, CH/2 - 30, 200, 60, 16)
        ctx.fill()
        ctx.fillStyle = '#64748b'
        ctx.font = 'bold 18px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(s?.phase === 'countdown' ? `🎈 ${s.countdown}` : '🎈 Get ready!', CW/2, CH/2)
        ctx.textBaseline = 'alphabetic'
        return
      }

      // Clouds (static positions, cheap)
      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      cloudDefs.forEach(([x,y,r]) => {
        ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill()
        ctx.beginPath(); ctx.arc(x+r*0.65,y+5,r*0.75,0,Math.PI*2); ctx.fill()
        ctx.beginPath(); ctx.arc(x-r*0.6,y+6,r*0.65,0,Math.PI*2); ctx.fill()
      })

      // Balloons
      ;(s.balloons || []).forEach(drawBalloon)

      // Bird
      if (s.bird) drawBird(s.bird, now)

      // Pop animations
      popAnimsRef.current = popAnimsRef.current.filter(a => now - a.born < 800)
      for (const a of popAnimsRef.current) {
        const t = (now - a.born) / 800
        const alpha = Math.floor((1 - t) * 255).toString(16).padStart(2, '0')
        ctx.font = `bold ${16 + t*10}px sans-serif`
        ctx.fillStyle = a.color + alpha
        ctx.textAlign = 'center'
        ctx.textBaseline = 'alphabetic'
        ctx.fillText(a.label, a.x, a.y - t * 55)
      }
    }

    render()
  }, [])

  const canvasCallbackRef = useCallback((node) => {
    canvasRef.current = node
    if (node) startLoop()
  }, [startLoop])

  const send = (msg) => wsRef.current?.readyState === 1 && wsRef.current.send(JSON.stringify(msg))

  const handleTap = (e) => {
    e.preventDefault()
    const s = stateRef.current
    if (s?.phase !== 'playing') return
    // Block if frozen
    if (freezeUntilRef.current > Date.now()) return
    const canvas = canvasRef.current
    const rect   = canvas.getBoundingClientRect()
    const scaleX = CW / rect.width
    const scaleY = CH / rect.height
    const touch  = e.changedTouches?.[0] || e
    send({ type: 'pop', x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY })
  }

  if (!state) return (
    <div style={{ minHeight:'100vh', background:me.bg, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
      <div style={{ fontSize:48 }}>🎈</div>
      <div style={{ marginTop:16, color:'#64748b' }}>Connecting...</div>
    </div>
  )

  const { phase, scores={}, countdown, time_left, players: connected=[], host } = state
  const isHost    = player === host
  const isFrozen  = freezeUntil > Date.now()
  const scoreboard = [...connected].sort((a,b) => (scores[b]||0)-(scores[a]||0))

  // ── LOBBY ──────────────────────────────────────────────────────────────────
  if (phase === 'lobby') return (
    <div style={{ minHeight:'100vh', background:me.bg, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24, fontFamily:'sans-serif' }}>
      <button onClick={onBack} style={{ position:'absolute', top:16, left:16, background:'none', border:'none', fontSize:28, cursor:'pointer' }}>←</button>
      <div style={{ fontSize:64, marginBottom:8 }}>🎈</div>
      <h2 style={{ margin:'0 0 4px', fontSize:26, color:'#1e293b' }}>Pop Balloons</h2>
      <p style={{ margin:'0 0 4px', color:'#64748b', fontSize:14 }}>{connected.length} / 4 players in lobby</p>
      <p style={{ margin:'0 0 24px', color:'#94a3b8', fontSize:12 }}>🐦 Catch the bird to freeze your opponent!</p>
      <div style={{ display:'flex', flexWrap:'wrap', gap:10, justifyContent:'center', marginBottom:28 }}>
        {connected.map((name, i) => {
          const pi = getPlayer(players, name, i)
          return (
            <div key={name} style={{ background:pi.color, color:'#fff', borderRadius:20, padding:'8px 18px', fontWeight:'bold', fontSize:15, display:'flex', alignItems:'center', gap:6 }}>
              <span>{pi.emoji}</span><span>{name}</span>
              {name===host && <span style={{ fontSize:11, opacity:0.8 }}>(host)</span>}
            </div>
          )
        })}
        {connected.length < 2 && <div style={{ background:'#e2e8f0', color:'#94a3b8', borderRadius:20, padding:'8px 18px', fontSize:15 }}>Waiting...</div>}
      </div>
      {isHost ? (
        <button onClick={() => send({ type:'start' })} disabled={connected.length < 2}
          style={{ background: connected.length>=2 ? me.color : '#cbd5e1', color:'#fff', border:'none', borderRadius:16, padding:'16px 40px', fontSize:20, fontWeight:'bold', cursor: connected.length>=2 ? 'pointer' : 'not-allowed' }}>
          {connected.length < 2 ? 'Waiting for players...' : '🎈 Start Game!'}
        </button>
      ) : (
        <div style={{ color:'#64748b', fontSize:16, textAlign:'center' }}>
          <div style={{ fontSize:28, marginBottom:8 }}>⏳</div>
          Waiting for <strong>{host}</strong> to start...
        </div>
      )}
    </div>
  )

  // ── RESULT ─────────────────────────────────────────────────────────────────
  if (phase === 'result') {
    const winner = scoreboard[0]
    return (
      <div style={{ minHeight:'100vh', background:me.bg, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24, fontFamily:'sans-serif' }}>
        <div style={{ fontSize:64 }}>{winner===player?'🏆':'🎈'}</div>
        <h2 style={{ fontSize:28, margin:'12px 0 4px', color:'#1e293b' }}>{winner===player?'You Won!':`${winner} Wins!`}</h2>
        <div style={{ width:'100%', maxWidth:320, marginTop:20 }}>
          {scoreboard.map((name, i) => {
            const pi = getPlayer(players, name, i)
            return (
              <div key={name} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:name===player?pi.light:'#fff', border:`2px solid ${pi.color}`, borderRadius:12, padding:'10px 16px', marginBottom:8 }}>
                <span style={{ fontSize:22 }}>{i===0?'🥇':i===1?'🥈':'🥉'}</span>
                <span style={{ color:pi.color, fontSize:16 }}>{pi.emoji} {name}</span>
                <span style={{ fontSize:20, fontWeight:'bold' }}>{scores[name]??0} pts</span>
              </div>
            )
          })}
        </div>
        <div style={{ display:'flex', gap:12, marginTop:24 }}>
          <button onClick={onBack} style={{ background:'#e2e8f0', border:'none', borderRadius:12, padding:'12px 24px', fontSize:16, cursor:'pointer' }}>← Back</button>
          <button onClick={() => send({ type:'reset' })} style={{ background:me.color, color:'#fff', border:'none', borderRadius:12, padding:'12px 24px', fontSize:16, fontWeight:'bold', cursor:'pointer' }}>🔄 Play Again</button>
        </div>
      </div>
    )
  }

  // ── COUNTDOWN + PLAYING ────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:'100vh', background:'#bfdbfe', display:'flex', flexDirection:'column', alignItems:'center', fontFamily:'sans-serif', userSelect:'none', position:'relative' }}>

      {/* Freeze overlay banner */}
      {isFrozen && (
        <div style={{
          position:'fixed', top:0, left:0, right:0, zIndex:50,
          background:'rgba(59,130,246,0.92)', color:'#fff',
          textAlign:'center', padding:'10px 0', fontSize:16, fontWeight:900,
          animation:'freezePulse 0.5s infinite alternate',
        }}>
          🧊 FROZEN! {freezeLeft}s
        </div>
      )}

      {/* Header */}
      <div style={{ width:'100%', maxWidth:400, display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 16px', background:'rgba(255,255,255,0.85)', borderBottom:'1px solid #e2e8f0', flexWrap:'wrap', gap:4, marginTop: isFrozen ? 44 : 0, transition:'margin-top 0.2s' }}>
        {connected.map((name, i) => {
          const pi = getPlayer(players, name, i)
          const isMe = name === player
          return (
            <div key={name} style={{ display:'flex', alignItems:'center', gap:4, background: isMe ? pi.light : 'transparent', borderRadius:8, padding:'2px 8px', border: isMe && isFrozen ? '2px solid #3b82f6' : '2px solid transparent' }}>
              <span style={{ fontSize:18 }}>{pi.emoji}</span>
              {isMe && isFrozen && <span style={{ fontSize:14 }}>🧊</span>}
              <span style={{ fontWeight:'bold', color:pi.color, fontSize:14 }}>{name}</span>
              <span style={{ fontWeight:'bold', color:'#1e293b', fontSize:16 }}>{scores[name]??0}</span>
            </div>
          )
        })}
        <div style={{ fontWeight:'bold', color:'#ef4444', fontSize:18, marginLeft:'auto' }}>⏱ {time_left}s</div>
      </div>

      {notice && <div style={{ background:'#fef2f2', color:'#ef4444', fontSize:13, padding:'4px 16px', width:'100%', textAlign:'center' }}>{notice}</div>}

      <canvas
        ref={canvasCallbackRef}
        width={CW}
        height={CH}
        style={{ touchAction:'none', maxWidth:'100%', display:'block', cursor: isFrozen ? 'not-allowed' : 'pointer' }}
        onPointerDown={handleTap}
      />

      <style>{`
        @keyframes freezePulse {
          from { background: rgba(59,130,246,0.85) }
          to   { background: rgba(96,165,250,0.95) }
        }
      `}</style>
    </div>
  )
}