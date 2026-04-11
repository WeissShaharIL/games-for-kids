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
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
  return `${r},${g},${b}`
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

// ── Lobby ─────────────────────────────────────────────────────────────────
function Lobby({ player, players, connected, host, onStart, onBack, scores }) {
  const p = safe(players, player, 0)
  const isHost = player === host
  const canStart = connected.length >= 2

  return (
    <div style={{ minHeight:'100vh', background:'#0a1628', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', fontFamily:'sans-serif', padding:24 }}>
      <button onClick={onBack} style={{ position:'absolute', top:16, left:16, background:'none', border:'none', fontSize:14, fontWeight:700, color:p.color, cursor:'pointer', padding:'6px 12px', borderRadius:10, fontFamily:'inherit' }}>← Back</button>

      <div style={{ fontSize:56, marginBottom:8 }}>🐍</div>
      <h2 style={{ color:'#fff', fontWeight:900, fontSize:24, margin:'0 0 4px' }}>Snake Race</h2>
      <p style={{ color:'#475569', fontSize:13, marginBottom:28 }}>2–4 players • Last snake standing wins</p>

      <div style={{ display:'flex', flexDirection:'column', gap:8, width:'100%', maxWidth:340, marginBottom:28 }}>
        {connected.map((name, i) => {
          const pp = safe(players, name, i)
          return (
            <div key={name} style={{
              display:'flex', alignItems:'center', gap:10,
              background:`rgba(${hexToRgb(pp.color)},0.1)`,
              border:`1.5px solid ${pp.color}44`,
              borderRadius:12, padding:'10px 14px',
            }}>
              <span style={{ fontSize:20 }}>{pp.emoji}</span>
              <span style={{ fontWeight:800, color:pp.color, flex:1 }}>{name}</span>
              {name === host && <span style={{ fontSize:11, color:pp.color, opacity:0.7, fontWeight:700 }}>HOST</span>}
              <span style={{ fontWeight:900, color:pp.color, fontSize:16 }}>{scores?.[name] ?? 0} pts</span>
            </div>
          )
        })}
        {connected.length < 4 && (
          <div style={{ display:'flex', alignItems:'center', gap:10, background:'rgba(255,255,255,0.03)', border:'1.5px solid #1e293b', borderRadius:12, padding:'10px 14px' }}>
            <span style={{ fontSize:20 }}>👤</span>
            <span style={{ color:'#334155', fontSize:14 }}>Waiting for players... ({connected.length}/4)</span>
          </div>
        )}
      </div>

      {isHost ? (
        <button onClick={onStart} disabled={!canStart} style={{
          padding:'14px 40px', borderRadius:14, border:'none',
          background: canStart ? p.color : '#1e293b',
          color: canStart ? '#fff' : '#475569',
          fontSize:16, fontWeight:900, cursor: canStart ? 'pointer' : 'not-allowed',
          fontFamily:'inherit', transition:'all 0.2s',
        }}>
          {canStart ? '🐍 Start Race!' : `Need 1 more player (${connected.length}/2)`}
        </button>
      ) : (
        <div style={{ color:'#475569', fontWeight:700, fontSize:14, textAlign:'center' }}>
          ⏳ Waiting for <span style={{ color:safe(players, host, 0).color }}>{host}</span> to start...
        </div>
      )}
    </div>
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
  const showArrowRef  = useRef(false)
  const arrowTimerRef = useRef(null)

  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => { playersRef.current = players }, [players])

  const p = safe(players, player, 0)

  const connect = useCallback(() => {
    const ws = new WebSocket(`${WS_URL}/${player}`)
    wsRef.current = ws
    ws.onopen = () => { if (mountedRef.current) setStatus('Waiting...') }
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
      if (data.message)                  setStatus(data.message)
      else if (data.phase === 'lobby')   setStatus(connected.length < 2 ? 'Waiting for players...' : 'Ready!')
      else if (data.countdown > 0) {
        setStatus(`Starting in ${data.countdown}...`)
        showArrowRef.current = true
        clearTimeout(arrowTimerRef.current)
      }
      else if (data.countdown === 0) {
        setStatus('Go! 🐍')
        showArrowRef.current = false
      }
      else if (data.phase === 'playing') setStatus('🐍 Game on!')
      else if (data.winner === 'draw')   setStatus('🤝 Draw!')
      else if (data.winner === player)   setStatus('🎉 You won!')
      else if (data.winner)              setStatus(`${data.winner} wins!`)
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
      cancelAnimationFrame(animIdRef.current)
    }
  }, [connect])

  // Canvas render loop — uses callback ref so it starts the moment canvas mounts
  const startLoop = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (animIdRef.current) cancelAnimationFrame(animIdRef.current)
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
      const apples = s.apples || []
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

          // Arrow pointing DOWN at my snake head during countdown
          if (name === player && snake.alive && showArrowRef.current && snake.body.length > 0) {
            const [hr, hc] = snake.body[0]
            const cx = hc * CELL + CELL / 2
            const headTop = hr * CELL
            const blink = (Date.now() % 500) < 350
            if (blink) {
              const bob = Math.sin(Date.now() / 180) * 4
              const aw = CELL * 2.8
              const ah = CELL * 2.2
              const ax = cx
              const ay = headTop - CELL * 1.4 + bob
              const glow = ctx.createRadialGradient(ax, ay - ah * 0.2, 1, ax, ay - ah * 0.2, CELL * 2.2)
              glow.addColorStop(0, pi.color + 'aa')
              glow.addColorStop(1, pi.color + '00')
              ctx.fillStyle = glow
              ctx.beginPath()
              ctx.arc(ax, ay - ah * 0.2, CELL * 2.2, 0, Math.PI * 2)
              ctx.fill()
              ctx.save()
              ctx.shadowColor = '#000'
              ctx.shadowBlur = 14
              ctx.beginPath()
              ctx.moveTo(ax,          ay)
              ctx.lineTo(ax - aw/2,   ay - ah * 0.42)
              ctx.lineTo(ax - aw/5,   ay - ah * 0.42)
              ctx.lineTo(ax - aw/5,   ay - ah)
              ctx.lineTo(ax + aw/5,   ay - ah)
              ctx.lineTo(ax + aw/5,   ay - ah * 0.42)
              ctx.lineTo(ax + aw/2,   ay - ah * 0.42)
              ctx.closePath()
              const grad = ctx.createLinearGradient(ax, ay - ah, ax, ay)
              grad.addColorStop(0, '#ffffff')
              grad.addColorStop(0.5, pi.color + 'ee')
              grad.addColorStop(1, pi.color)
              ctx.fillStyle = grad
              ctx.fill()
              ctx.shadowBlur = 0
              ctx.strokeStyle = 'rgba(255,255,255,0.85)'
              ctx.lineWidth = 2.5
              ctx.stroke()
              ctx.restore()
            }
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

  const canvasCallbackRef = useCallback((node) => {
    canvasRef.current = node
    if (node) startLoop()
  }, [startLoop])

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

  const sendDir  = (dir) => wsRef.current?.send(JSON.stringify({ type:'dir', dir }))
  const sendStart = () => wsRef.current?.send(JSON.stringify({ type:'start' }))
  const sendReset = () => { playSound('rematch'); wsRef.current?.send(JSON.stringify({ type:'reset' })) }

  const phase     = state?.phase || 'lobby'
  const connected = state?.connected || []
  const host      = state?.host || null
  const isHost    = player === host

  // ── Lobby ──────────────────────────────────────────────────────────────
  if (phase === 'lobby') {
    return <Lobby player={player} players={players} connected={connected} host={host} onStart={sendStart} onBack={onBack} scores={state?.scores} />
  }

  // ── Countdown + Playing + Result ───────────────────────────────────────
  return (
    <div style={{ minHeight:'100vh', background:'#0a1628', display:'flex', flexDirection:'column', alignItems:'center', fontFamily:'sans-serif', userSelect:'none' }}>
      {/* Header */}
      <div style={{ width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 20px', background:'rgba(255,255,255,0.04)', borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
        <button onClick={onBack} style={{ background:'none', border:'none', fontSize:14, fontWeight:700, color:p.color, cursor:'pointer', padding:'6px 12px', borderRadius:10, fontFamily:'inherit' }}>← Back</button>
        <div style={{ fontSize:16, fontWeight:900, color:'#fff' }}>Snake 🐍</div>
        <div style={{ width:56 }} />
      </div>

      {/* Scores — all players */}
      <div style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 12px', width:'100%', maxWidth:440, flexWrap:'wrap', justifyContent:'center' }}>
        {connected.map((name, i) => {
          const pp = safe(players, name, i)
          const isMe = name === player
          const alive = state?.snakes?.[name]?.alive !== false
          return (
            <div key={name} style={{
              display:'flex', alignItems:'center', gap:6,
              border:`2px solid ${pp.color}${isMe ? 'cc' : '44'}`,
              borderRadius:10, padding:'5px 10px',
              background:`rgba(${hexToRgb(pp.color)},${isMe ? 0.15 : 0.05})`,
              opacity: phase === 'playing' && !alive ? 0.4 : 1,
            }}>
              <span style={{ fontSize:16 }}>{pp.emoji}</span>
              <span style={{ fontWeight:800, color:pp.color, fontSize:13 }}>{name}</span>
              <span style={{ fontWeight:900, color:pp.color, fontSize:15 }}>{state?.scores?.[name] ?? 0}</span>
            </div>
          )
        })}
      </div>

      <div style={{ padding:'2px 16px', fontSize:13, fontWeight:700, color:'#64748b', marginBottom:4 }}>{status}</div>

      <canvas
        ref={canvasCallbackRef}
        style={{ borderRadius:10, boxShadow:`0 0 40px rgba(${hexToRgb(p.color)},0.2), 0 8px 32px #000a`, touchAction:'none', maxWidth:'95vw', display:'block' }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      />

      {/* Play Again — host only, shown in result */}
      {phase === 'result' && isHost && (
        <button onClick={sendReset} style={{ marginTop:14, padding:'10px 28px', borderRadius:12, border:'none', background:p.color, color:'#fff', fontSize:15, fontWeight:900, cursor:'pointer' }}>
          🔄 Play Again
        </button>
      )}
      {phase === 'result' && !isHost && (
        <div style={{ marginTop:14, color:'#475569', fontWeight:700, fontSize:14 }}>
          Waiting for {safe(players, host, 0).emoji} {host} to start next round...
        </div>
      )}

      {/* D-Pad */}
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