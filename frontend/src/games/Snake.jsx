import { useState, useEffect, useRef, useCallback } from 'react'
import { playSound } from '../sounds'
import { vibrate, VIBRATIONS } from '../vibrate'

const WS_PROTOCOL = location.protocol === 'https:' ? 'wss' : 'ws'
const WS_URL      = `${WS_PROTOCOL}://${location.host}/api/snake/ws`
const CELL        = 20

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
function darken(hex, amt = 40) {
  const r = Math.max(0, parseInt(hex.slice(1,3),16) - amt)
  const g = Math.max(0, parseInt(hex.slice(3,5),16) - amt)
  const b = Math.max(0, parseInt(hex.slice(5,7),16) - amt)
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`
}

function DPadBtn({ label, dir, color, onPress }) {
  const [pressed, setPressed] = useState(false)
  return (
    <button
      onPointerDown={(e) => { e.preventDefault(); setPressed(true); vibrate([15]); onPress(dir) }}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      style={{
        width: 72, height: 72, border: 'none', borderRadius: 18,
        background: pressed ? color : `${color}22`,
        color: pressed ? '#fff' : color,
        fontSize: 26, fontWeight: 900, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: pressed ? `0 2px 0 ${darken(color)}88` : `0 5px 0 ${color}44`,
        transform: pressed ? 'translateY(3px)' : 'translateY(0)',
        transition: 'all 0.08s', outline: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >{label}</button>
  )
}

export default function Snake({ player, players, onBack }) {
  const [state, setState]   = useState(null)
  const [status, setStatus] = useState('Connecting...')
  const canvasRef     = useRef(null)
  const wsRef         = useRef(null)
  const mountedRef    = useRef(true)
  const stateRef      = useRef(null)
  const playersRef    = useRef(players)
  const animIdRef     = useRef(null)
  const prevWinner    = useRef(null)
  const touchStart    = useRef(null)
  const showArrowRef  = useRef(false)   // ← inside component
  const arrowTimerRef = useRef(null)    // ← inside component

  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => { playersRef.current = players }, [players])

  const p = safe(players, player, 0)

  const connect = useCallback(() => {
    const ws = new WebSocket(`${WS_URL}/${player}`)
    wsRef.current = ws
    ws.onopen = () => { if (mountedRef.current) setStatus('Waiting for opponent...') }
    ws.onmessage = (e) => {
      if (!mountedRef.current) return
      const data = JSON.parse(e.data)
      setState(data)
      if (data.winner && data.winner !== prevWinner.current) {
        if (data.winner === player)      { playSound('win');  vibrate(VIBRATIONS.win)  }
        else if (data.winner !== 'draw') { playSound('lose'); vibrate(VIBRATIONS.lose) }
        else                             { playSound('draw'); vibrate(VIBRATIONS.draw) }
        prevWinner.current = data.winner
      }
      if (!data.winner) prevWinner.current = null
      const connected = data.connected || []
      if (data.message)                setStatus(data.message)
      else if (connected.length < 2)   setStatus('Waiting for opponent...')
      else if (data.countdown > 0)     setStatus(`Starting in ${data.countdown}...`)
      else if (data.countdown === 0) {
        setStatus('Go! 🐍')
        showArrowRef.current = true
        clearTimeout(arrowTimerRef.current)
        arrowTimerRef.current = setTimeout(() => {
          showArrowRef.current = false
        }, 2000)
      }
      else if (data.winner === 'draw') setStatus('🤝 Draw!')
      else if (data.winner === player) setStatus('🎉 You won!')
      else if (data.winner)            setStatus(`${data.winner} wins!`)
      else                             setStatus('🐍 Game on!')
    }
    ws.onclose = () => { if (mountedRef.current) { setStatus('Reconnecting...'); setTimeout(connect, 2000) } }
    ws.onerror = () => ws.close()
  }, [player])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      wsRef.current?.close()
      clearTimeout(arrowTimerRef.current)
    }
  }, [connect])

  // Canvas render loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    function drawSegment(col, row, color, isHead, dir) {
      const x = col * CELL, y = row * CELL
      const pad = isHead ? 1 : 2
      const r   = isHead ? 6 : 4
      const grad = ctx.createRadialGradient(x+CELL/2, y+CELL/2-2, 1, x+CELL/2, y+CELL/2, CELL*0.7)
      grad.addColorStop(0, color + 'ff')
      grad.addColorStop(1, darken(color, 30) + 'ff')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.roundRect(x+pad, y+pad, CELL-pad*2, CELL-pad*2, r)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.2)'
      ctx.beginPath()
      ctx.ellipse(x+CELL*0.35, y+CELL*0.3, CELL*0.18, CELL*0.12, -0.3, 0, Math.PI*2)
      ctx.fill()
      if (isHead) {
        const eyeMap = { UP:[[-4,3],[4,3]], DOWN:[[-4,-3],[4,-3]], LEFT:[[3,-4],[3,4]], RIGHT:[[-3,-4],[-3,4]] }
        const eyes = eyeMap[dir] || [[-3,-3],[3,-3]]
        ctx.fillStyle = '#fff'
        eyes.forEach(([ox,oy]) => { ctx.beginPath(); ctx.arc(x+CELL/2+ox, y+CELL/2+oy, 2.8, 0, Math.PI*2); ctx.fill() })
        ctx.fillStyle = '#111'
        eyes.forEach(([ox,oy]) => { ctx.beginPath(); ctx.arc(x+CELL/2+ox+0.5, y+CELL/2+oy+0.5, 1.4, 0, Math.PI*2); ctx.fill() })
      }
    }

    function draw() {
      animIdRef.current = requestAnimationFrame(draw)
      const s  = stateRef.current
      const pl = playersRef.current
      const rows = s?.rows || 20
      const cols = s?.cols || 20
      const W = cols * CELL, H = rows * CELL
      if (canvas.width !== W)  canvas.width  = W
      if (canvas.height !== H) canvas.height = H

      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          ctx.fillStyle = (r + c) % 2 === 0 ? '#0f2744' : '#0d2340'
          ctx.fillRect(c*CELL, r*CELL, CELL, CELL)
        }

      const myP = safe(pl, player, 0)
      ctx.strokeStyle = myP.color + '44'
      ctx.lineWidth = 2
      ctx.strokeRect(1, 1, W-2, H-2)

      if (!s) return

      const connected = s.connected || []

      // Apples
      const apples = s.apples || (s.apple ? [s.apple] : [])
      apples.forEach(apple => {
        const [ar, ac] = apple
        const ax = ac*CELL + CELL/2, ay = ar*CELL + CELL/2
        const glow = ctx.createRadialGradient(ax, ay, 0, ax, ay, CELL)
        glow.addColorStop(0, 'rgba(239,68,68,0.5)')
        glow.addColorStop(1, 'rgba(239,68,68,0)')
        ctx.fillStyle = glow
        ctx.beginPath(); ctx.arc(ax, ay, CELL, 0, Math.PI*2); ctx.fill()
        ctx.fillStyle = '#ef4444'
        ctx.beginPath(); ctx.arc(ax, ay, CELL/2-2, 0, Math.PI*2); ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.35)'
        ctx.beginPath(); ctx.arc(ax-3, ay-3, 3, 0, Math.PI*2); ctx.fill()
        ctx.strokeStyle = '#15803d'; ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(ax, ay-CELL/2+2); ctx.lineTo(ax+3, ay-CELL/2-3); ctx.stroke()
      })

      // Snakes
      if (s.snakes) {
        Object.entries(s.snakes).forEach(([name, snake]) => {
          if (!snake.body?.length) return
          const pi = safe(pl, name, connected.indexOf(name))
          if (!snake.alive) ctx.globalAlpha = 0.25
          snake.body.forEach((seg, i) => drawSegment(seg[1], seg[0], pi.color, i === 0, snake.dir))
          ctx.globalAlpha = 1

          // Direction arrow on MY snake head for 2 seconds after GO
          if (name === player && snake.alive && showArrowRef.current && snake.body.length > 0) {
            const [hr, hc] = snake.body[0]
            const arrowMap = { UP: '↑', DOWN: '↓', LEFT: '←', RIGHT: '→' }
            const arrow = arrowMap[snake.dir] || '→'
            ctx.font = `bold ${CELL * 1.5}px sans-serif`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.shadowColor = '#000'; ctx.shadowBlur = 6
            ctx.fillStyle = '#fff'
            ctx.fillText(arrow, hc*CELL + CELL/2, hr*CELL - CELL * 0.9)
            ctx.shadowBlur = 0
            ctx.textBaseline = 'alphabetic'
          }
        })
      }

      // Countdown overlay
      if (s.countdown > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)'
        ctx.fillRect(0, 0, W, H)
        ctx.fillStyle = '#fff'
        ctx.font = `bold ${CELL*4}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(s.countdown, W/2, H/2)
        ctx.textBaseline = 'alphabetic'
      }

      // Winner overlay
      if (s.winner) {
        ctx.fillStyle = 'rgba(0,0,0,0.65)'
        ctx.fillRect(0, 0, W, H)
        const msg = s.winner === player ? '🎉 You won!' : s.winner === 'draw' ? '🤝 Draw!' : `${s.winner} wins!`
        ctx.fillStyle = '#fff'
        ctx.font = `bold ${CELL*1.5}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(msg, W/2, H/2)
        ctx.textBaseline = 'alphabetic'
      }
    }

    draw()
    return () => cancelAnimationFrame(animIdRef.current)
  }, [player, players])

  // Keyboard
  useEffect(() => {
    const MAP = { ArrowUp:'UP', ArrowDown:'DOWN', ArrowLeft:'LEFT', ArrowRight:'RIGHT', w:'UP', s:'DOWN', a:'LEFT', d:'RIGHT' }
    const onKey = (e) => {
      const dir = MAP[e.key]
      if (dir) { e.preventDefault(); wsRef.current?.send(JSON.stringify({ type:'dir', dir })) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onTouchStart = (e) => { touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }
  const onTouchEnd = (e) => {
    if (!touchStart.current) return
    const dx = e.changedTouches[0].clientX - touchStart.current.x
    const dy = e.changedTouches[0].clientY - touchStart.current.y
    if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'RIGHT' : 'LEFT') : (dy > 0 ? 'DOWN' : 'UP')
    vibrate([15])
    wsRef.current?.send(JSON.stringify({ type:'dir', dir }))
    touchStart.current = null
  }

  const sendDir = (dir) => { wsRef.current?.send(JSON.stringify({ type:'dir', dir })) }
  const rematch = () => { playSound('rematch'); wsRef.current?.send(JSON.stringify({ type:'reset' })) }

  const connected = state?.connected || []
  const bothHere  = connected.length >= 2
  const other     = connected.find(n => n !== player) || null
  const op        = other ? safe(players, other, 1) : null
  const myScore   = state?.scores?.[player] ?? 0
  const opScore   = other ? (state?.scores?.[other] ?? 0) : 0

  const hexToRgb = (hex) => {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
    return `${r},${g},${b}`
  }

  return (
    <div style={{ minHeight:'100vh', background:'#0a1628', display:'flex', flexDirection:'column', alignItems:'center', fontFamily:'sans-serif', userSelect:'none' }}>
      <div style={{ width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 20px', background:'rgba(255,255,255,0.04)', borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
        <button onClick={onBack} style={{ background:'none', border:'none', fontSize:14, fontWeight:700, color:p.color, cursor:'pointer', padding:'6px 12px', borderRadius:10, fontFamily:'inherit' }}>← Back</button>
        <div style={{ fontSize:16, fontWeight:900, color:'#fff' }}>Snake 🐍</div>
        <div style={{ width:56 }} />
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 16px', width:'100%', maxWidth:440 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, border:`2px solid ${p.color}44`, borderRadius:12, padding:'6px 12px', flex:1, background:`rgba(${hexToRgb(p.color)},0.1)` }}>
          <span style={{ fontSize:18 }}>{p.emoji}</span>
          <span style={{ fontWeight:800, color:p.color, fontSize:14, flex:1 }}>{player}</span>
          <span style={{ fontSize:20, fontWeight:900, color:p.color }}>{myScore}</span>
        </div>
        <span style={{ fontSize:11, fontWeight:900, color:'#334155' }}>VS</span>
        {bothHere && op ? (
          <div style={{ display:'flex', alignItems:'center', gap:8, border:`2px solid ${op.color}44`, borderRadius:12, padding:'6px 12px', flex:1, background:`rgba(${hexToRgb(op.color)},0.1)` }}>
            <span style={{ fontSize:18 }}>{op.emoji}</span>
            <span style={{ fontWeight:800, color:op.color, fontSize:14, flex:1 }}>{other}</span>
            <span style={{ fontSize:20, fontWeight:900, color:op.color }}>{opScore}</span>
          </div>
        ) : (
          <div style={{ display:'flex', alignItems:'center', gap:8, border:'2px solid #1e293b', borderRadius:12, padding:'6px 12px', flex:1, background:'rgba(255,255,255,0.03)' }}>
            <span style={{ fontSize:18 }}>👤</span>
            <span style={{ fontWeight:800, color:'#475569', fontSize:14, flex:1 }}>Waiting...</span>
            <span style={{ fontSize:20, fontWeight:900, color:'#475569' }}>0</span>
          </div>
        )}
      </div>

      <div style={{ padding:'4px 16px', fontSize:13, fontWeight:700, color:'#64748b', marginBottom:4 }}>{status}</div>

      <canvas
        ref={canvasRef}
        style={{ borderRadius:10, boxShadow:`0 0 40px rgba(${hexToRgb(p.color)},0.2), 0 8px 32px #000a`, touchAction:'none', maxWidth:'95vw', display:'block' }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      />

      {state?.winner && (
        <button onClick={rematch} style={{ marginTop:14, padding:'10px 28px', borderRadius:12, border:'none', background:p.color, color:'#fff', fontSize:15, fontWeight:900, cursor:'pointer' }}>🔄 Play Again</button>
      )}

      <div style={{ marginTop:14, display:'grid', gridTemplateColumns:'repeat(3, 72px)', gridTemplateRows:'repeat(3, 72px)', gap:8 }}>
        <div /><DPadBtn label="▲" dir="UP"    color={p.color} onPress={sendDir} /><div />
        <DPadBtn label="◀" dir="LEFT"  color={p.color} onPress={sendDir} />
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', color:`${p.color}44`, fontSize:20 }}>🕹️</div>
        <DPadBtn label="▶" dir="RIGHT" color={p.color} onPress={sendDir} />
        <div /><DPadBtn label="▼" dir="DOWN"  color={p.color} onPress={sendDir} /><div />
      </div>
    </div>
  )
}