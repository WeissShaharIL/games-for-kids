import { useState, useEffect, useRef, useCallback } from 'react'
import { playSound } from '../sounds'

const WS_PROTOCOL = location.protocol === 'https:' ? 'wss' : 'ws'
const WS_URL      = `${WS_PROTOCOL}://${location.host}/api/snake/ws`
const CELL        = 16

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
  Ariel: { color: '#16a34a', light: '#dcfce7', bg: '#f0fdf4', bgImage: `url("data:image/svg+xml,${CROWN_SVG}")`, head: '#15803d', emoji: '🦁' },
  Ella:  { color: '#db2777', light: '#fce7f3', bg: '#fdf2f8', bgImage: `url("data:image/svg+xml,${TIARA_SVG}")`, head: '#be185d', emoji: '🦋' },
}

function DPadBtn({ label, dir, color, onPress }) {
  const [pressed, setPressed] = useState(false)
  const handle  = (e) => { e.preventDefault(); setPressed(true); onPress(dir) }
  const release = () => setPressed(false)
  return (
    <button
      onPointerDown={handle}
      onPointerUp={release}
      onPointerLeave={release}
      style={{
        width: 72, height: 72, border: 'none',
        borderRadius: 18,
        outline: `2px solid ${color}44`,
        background: pressed ? color : `${color}22`,
        color:      pressed ? '#fff' : color,
        fontSize: 26, fontWeight: 900, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow:  pressed ? `0 2px 0 ${color}88` : `0 5px 0 ${color}44`,
        transform:  pressed ? 'translateY(3px)' : 'translateY(0)',
        transition: 'all 0.08s',
        userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none',
      }}
    >{label}</button>
  )
}

function DPad({ color, onDir }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginTop: 20 }}>
      <DPadBtn label="▲" dir="UP"    color={color} onPress={onDir} />
      <div style={{ display: 'flex', gap: 8 }}>
        <DPadBtn label="◄" dir="LEFT"  color={color} onPress={onDir} />
        <div style={{ width: 72, height: 72, borderRadius: 18, background: `${color}11`, outline: `2px solid ${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>🕹️</div>
        <DPadBtn label="►" dir="RIGHT" color={color} onPress={onDir} />
      </div>
      <DPadBtn label="▼" dir="DOWN"  color={color} onPress={onDir} />
    </div>
  )
}

// ── Countdown overlay ─────────────────────────────────────────────────────────
function CountdownOverlay({ count, color }) {
  const label = count === 0 ? 'GO!' : String(count)
  const isGo  = count === 0
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#00000066',
      borderRadius: 10,
      zIndex: 10,
    }}>
      <div style={{
        fontSize:   isGo ? 80 : 96,
        fontWeight: 900,
        color:      isGo ? color : '#fff',
        fontFamily: 'inherit',
        textShadow: `0 4px 24px ${isGo ? color : '#000'}`,
        animation:  'countPop 0.35s cubic-bezier(0.34,1.56,0.64,1)',
        lineHeight: 1,
      }}>
        {label}
      </div>
    </div>
  )
}

export default function Snake({ player, onBack }) {
  const [state, setState]   = useState(null)
  const [status, setStatus] = useState('Connecting...')
  const canvasRef           = useRef(null)
  const wsRef               = useRef(null)
  const prevWinner          = useRef(null)
  const lastDir             = useRef(null)

  const p     = PLAYERS[player]
  const other = player === 'Ariel' ? 'Ella' : 'Ariel'
  const op    = PLAYERS[other]

  const sendDir = useCallback((dir) => {
    if (lastDir.current === dir) return
    lastDir.current = dir
    wsRef.current?.send(JSON.stringify({ type: 'dir', dir }))
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      const map = {
        ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
        w: 'UP', s: 'DOWN', a: 'LEFT', d: 'RIGHT',
        W: 'UP', S: 'DOWN', A: 'LEFT', D: 'RIGHT',
      }
      if (map[e.key]) { e.preventDefault(); sendDir(map[e.key]) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sendDir])

  const connect = useCallback(() => {
    const ws = new WebSocket(`${WS_URL}/${player}`)
    wsRef.current = ws
    ws.onopen = () => setStatus(`Waiting for ${other}...`)
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data)
      setState(data)
      lastDir.current = null

      // Play a tick sound on each countdown number
      if (data.countdown !== null && data.countdown !== undefined) {
        if (data.countdown > 0) playSound('place')
        else                    playSound('rematch')
      }

      if (data.winner && data.winner !== prevWinner.current) {
        if (data.winner === 'draw')      playSound('draw')
        else if (data.winner === player) playSound('win')
        else                             playSound('lose')
        prevWinner.current = data.winner
      }
      if (!data.winner) prevWinner.current = null

      if (data.message)                        setStatus(data.message)
      else if (data.connected?.length < 2)     setStatus(`Waiting for ${other}...`)
      else if (data.countdown > 0)             setStatus('Get ready...')
      else if (data.countdown === 0)           setStatus('GO!')
      else if (data.winner === 'draw')         setStatus("🤝 It's a draw!")
      else if (data.winner === player)         setStatus('🎉 You won the round!')
      else if (data.winner)                    setStatus(`${data.winner} won the round!`)
      else if (!data.snakes?.[player]?.alive)  setStatus('💀 You crashed! Next round soon...')
      else                                     setStatus('🕹️ Use the buttons to move!')
    }
    ws.onclose = () => { setStatus('Disconnected. Reconnecting...'); setTimeout(connect, 2000) }
    ws.onerror = () => ws.close()
  }, [player])

  useEffect(() => { connect(); return () => wsRef.current?.close() }, [connect])

  useEffect(() => {
    if (!state || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')
    const rows   = state.rows || 20
    const cols   = state.cols || 20
    canvas.width  = cols * CELL
    canvas.height = rows * CELL

    ctx.fillStyle = '#1a2634'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#1e2e40'
    ctx.lineWidth   = 0.5
    for (let r = 0; r <= rows; r++) { ctx.beginPath(); ctx.moveTo(0, r*CELL); ctx.lineTo(cols*CELL, r*CELL); ctx.stroke() }
    for (let c = 0; c <= cols; c++) { ctx.beginPath(); ctx.moveTo(c*CELL, 0); ctx.lineTo(c*CELL, rows*CELL); ctx.stroke() }

    Object.entries(state.snakes || {}).forEach(([name, snake]) => {
      const sp = PLAYERS[name]
      if (!sp) return
      snake.body.forEach(([r, c], idx) => {
        const x = c*CELL+1, y = r*CELL+1, size = CELL-2
        ctx.fillStyle = idx === 0 ? sp.head : snake.alive ? sp.color : '#555'
        ctx.beginPath(); ctx.roundRect(x, y, size, size, idx === 0 ? 5 : 3); ctx.fill()
        if (idx === 0 && snake.alive) {
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x+size*0.7, y+size*0.3, 2, 0, Math.PI*2); ctx.fill()
          ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x+size*0.7+0.4, y+size*0.3+0.4, 1, 0, Math.PI*2); ctx.fill()
        }
      })
      if (!snake.alive && snake.body.length > 0) {
        const [hr, hc] = snake.body[0]
        ctx.font = `${CELL}px sans-serif`; ctx.textAlign = 'center'
        ctx.fillText('💀', hc*CELL+CELL/2, hr*CELL+CELL*0.9)
      }
    })

    if (state.apple) {
      const [ar, ac] = state.apple
      const ax = ac*CELL+CELL/2, ay = ar*CELL+CELL/2, r = CELL/2-1
      const grd = ctx.createRadialGradient(ax, ay, 1, ax, ay, r*2)
      grd.addColorStop(0, '#ff000055'); grd.addColorStop(1, 'transparent')
      ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(ax, ay, r*2, 0, Math.PI*2); ctx.fill()
      ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(ax, ay, r, 0, Math.PI*2); ctx.fill()
      ctx.fillStyle = '#ffffff44'; ctx.beginPath(); ctx.arc(ax-r*0.3, ay-r*0.3, r*0.3, 0, Math.PI*2); ctx.fill()
      ctx.strokeStyle = '#15803d'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(ax, ay-r); ctx.lineTo(ax+2, ay-r-3); ctx.stroke()
    }
  }, [state])

  const bothHere    = state?.connected?.length === 2
  const myScore     = state?.scores?.[player]  ?? 0
  const otherScore  = state?.scores?.[other]   ?? 0
  const countdown   = state?.countdown         ?? null
  const showCountdown = bothHere && countdown !== null

  const statusBg    = state?.winner === player ? '#dcfce7' : state?.winner === 'draw' ? '#fef9c3' : state?.winner ? '#fee2e2' : bothHere ? p.light : '#f1f5f9'
  const statusColor = state?.winner === player ? '#15803d' : state?.winner === 'draw' ? '#92400e' : state?.winner ? '#dc2626' : bothHere ? p.color : '#64748b'

  return (
    <div style={{ ...s.wrap, background: p.bg, backgroundImage: p.bgImage, backgroundSize: '120px 120px', backgroundRepeat: 'repeat' }}>
      <style>{`
        @keyframes countPop {
          from { transform: scale(0.4); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }
      `}</style>

      <div style={s.header}>
        <button onClick={onBack} style={{ ...s.backBtn, color: p.color }}>← Back</button>
        <div style={s.title}>Snake Race 🐍</div>
        <div style={{ width: 64 }} />
      </div>

      <div style={s.scoreBar}>
        <div style={{ ...s.scoreCard, borderColor: p.color, background: p.light }}>
          <span style={{ fontSize: 20 }}>{p.emoji}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, color: p.color, fontSize: 14 }}>{player}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color, display: 'inline-block' }} /> your snake
            </div>
          </div>
          <span style={{ ...s.scoreNum, color: p.color }}>{myScore}</span>
        </div>
        <div style={s.vs}>VS</div>
        <div style={{ ...s.scoreCard, borderColor: op.color, background: op.light }}>
          <span style={{ fontSize: 20 }}>{op.emoji}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, color: op.color, fontSize: 14 }}>{other}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: op.color, display: 'inline-block' }} /> their snake
            </div>
          </div>
          <span style={{ ...s.scoreNum, color: op.color }}>{otherScore}</span>
        </div>
      </div>

      <div style={{ ...s.status, background: statusBg, color: statusColor }}>{status}</div>

      {/* Canvas + countdown overlay */}
      <div style={{ ...s.canvasWrap, position: 'relative' }}>
        <canvas ref={canvasRef} style={{ borderRadius: 10, display: 'block', maxWidth: '100%' }} />
        {showCountdown && <CountdownOverlay count={countdown} color={p.color} />}
      </div>

      {bothHere && <DPad color={p.color} onDir={sendDir} />}

      {!bothHere && (
        <div style={s.waiting}>
          <div style={{ ...s.waitingDot, background: p.color }} />
          Waiting for {other} to join...
        </div>
      )}
    </div>
  )
}

const s = {
  wrap:       { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: 32 },
  header:     { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', background: '#ffffffcc', backdropFilter: 'blur(8px)', boxShadow: '0 1px 0 #e2e8f0', marginBottom: 14 },
  backBtn:    { background: 'none', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', padding: '6px 12px', borderRadius: 10, fontFamily: 'inherit' },
  title:      { fontSize: 18, fontWeight: 900, color: '#1e1b4b' },
  scoreBar:   { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, padding: '0 16px', width: '100%', maxWidth: 400 },
  scoreCard:  { display: 'flex', alignItems: 'center', gap: 8, border: '2px solid', borderRadius: 14, padding: '8px 12px', flex: 1 },
  scoreNum:   { fontSize: 24, fontWeight: 900 },
  vs:         { fontSize: 12, fontWeight: 900, color: '#cbd5e1', flexShrink: 0 },
  status:     { padding: '10px 24px', borderRadius: 12, fontSize: 14, fontWeight: 800, marginBottom: 10, textAlign: 'center', transition: 'all 0.3s', minWidth: 240, maxWidth: 360 },
  canvasWrap: { boxShadow: '0 8px 32px #0003', borderRadius: 12, overflow: 'hidden' },
  waiting:    { marginTop: 24, display: 'flex', alignItems: 'center', gap: 10, color: '#94a3b8', fontWeight: 700, fontSize: 15 },
  waitingDot: { width: 10, height: 10, borderRadius: '50%', animation: 'pulse 1.5s ease-in-out infinite' },
}