import { useState, useEffect, useRef, useCallback } from 'react'
import { playSound } from '../sounds'
import { vibrate, VIBRATIONS } from '../vibrate'

const WS_PROTOCOL = location.protocol === 'https:' ? 'wss' : 'ws'
const WS_URL      = `${WS_PROTOCOL}://${location.host}/api/snake/ws`

const ROWS = 20
const COLS = 20

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

function DPadBtn({ label, dir, color, onPress, size }) {
  const [pressed, setPressed] = useState(false)
  const handle  = (e) => { e.preventDefault(); setPressed(true); vibrate(VIBRATIONS.dpad); onPress(dir) }
  const release = () => setPressed(false)
  return (
    <button
      onPointerDown={handle}
      onPointerUp={release}
      onPointerLeave={release}
      style={{
        width: size, height: size, border: 'none',
        borderRadius: Math.floor(size * 0.25),
        outline: `2px solid ${color}44`,
        background: pressed ? color : `${color}22`,
        color: pressed ? '#fff' : color,
        fontSize: Math.floor(size * 0.36), fontWeight: 900, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow:  pressed ? `0 2px 0 ${color}88` : `0 5px 0 ${color}44`,
        transform:  pressed ? 'translateY(3px)' : 'translateY(0)',
        transition: 'all 0.08s',
        userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none',
      }}
    >{label}</button>
  )
}

function DPad({ color, onDir, size }) {
  const gap = Math.floor(size * 0.1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap }}>
      <DPadBtn label="▲" dir="UP"    color={color} onPress={onDir} size={size} />
      <div style={{ display: 'flex', gap }}>
        <DPadBtn label="◄" dir="LEFT"  color={color} onPress={onDir} size={size} />
        <div style={{ width: size, height: size, borderRadius: Math.floor(size*0.25), background: `${color}11`, outline: `2px solid ${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.floor(size*0.38) }}>🕹️</div>
        <DPadBtn label="►" dir="RIGHT" color={color} onPress={onDir} size={size} />
      </div>
      <DPadBtn label="▼" dir="DOWN"  color={color} onPress={onDir} size={size} />
    </div>
  )
}

export default function Snake({ player, onBack }) {
  const [state, setState]       = useState(null)
  const [status, setStatus]     = useState('Connecting...')
  const [compact, setCompact]   = useState(false)  // compact = fit-everything mode
  const [cellSize, setCellSize] = useState(16)
  const canvasRef               = useRef(null)
  const wsRef                   = useRef(null)
  const mountedRef              = useRef(true)
  const prevWinner              = useRef(null)
  const lastDir                 = useRef(null)

  const p     = PLAYERS[player]
  const other = player === 'Ariel' ? 'Ella' : 'Ariel'
  const op    = PLAYERS[other]

  // ── Compute layout ──────────────────────────────────────────────────────────
  const computeLayout = useCallback(() => {
    const vw = window.innerWidth
    const vh = window.innerHeight   // actual visual viewport on mobile

    // Compact mode: try to fit board + dpad + minimal UI in one screen
    // Header ~50px, scores ~52px, status ~40px, dpad ~240px, gaps ~20px = ~400px overhead
    const OVERHEAD_COMPACT = 400
    const OVERHEAD_NORMAL  = 180  // just header + scores

    // Try compact first
    const availH_compact = vh - OVERHEAD_COMPACT
    const availW         = vw - 16
    const byH_compact    = Math.floor(availH_compact / ROWS)
    const byW            = Math.floor(availW / COLS)
    const cell_compact   = Math.max(6, Math.min(byH_compact, byW))

    // Normal (scrollable)
    const cell_normal    = Math.floor(Math.min(availW, 390) / COLS)

    // Use compact if board fits nicely
    const boardH_compact = cell_compact * ROWS
    if (boardH_compact >= 200 && availH_compact > 200) {
      setCompact(true)
      setCellSize(cell_compact)
    } else {
      setCompact(false)
      setCellSize(cell_normal)
    }
  }, [])

  useEffect(() => {
    computeLayout()
    window.addEventListener('resize', computeLayout)
    return () => window.removeEventListener('resize', computeLayout)
  }, [computeLayout])

  // ── Keyboard ───────────────────────────────────────────────────────────────
  const sendDir = useCallback((dir) => {
    if (lastDir.current === dir) return
    lastDir.current = dir
    wsRef.current?.send(JSON.stringify({ type: 'dir', dir }))
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      const map = { ArrowUp:'UP', ArrowDown:'DOWN', ArrowLeft:'LEFT', ArrowRight:'RIGHT', w:'UP', s:'DOWN', a:'LEFT', d:'RIGHT', W:'UP', S:'DOWN', A:'LEFT', D:'RIGHT' }
      if (map[e.key]) { e.preventDefault(); sendDir(map[e.key]) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sendDir])

  // ── WebSocket ──────────────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true
    const ws = new WebSocket(`${WS_URL}/${player}`)
    wsRef.current = ws

    ws.onopen = () => { if (!mountedRef.current) return; setStatus(`Waiting for ${other}...`) }

    ws.onmessage = (e) => {
      if (!mountedRef.current) return
      const data = JSON.parse(e.data)
      setState(data)
      lastDir.current = null

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

      if (data.message)                       setStatus(data.message)
      else if (data.connected?.length < 2)    setStatus(`Waiting for ${other}...`)
      else if (data.countdown > 0)            setStatus('Get ready...')
      else if (data.countdown === 0)          setStatus('GO!')
      else if (data.winner === 'draw')        setStatus("🤝 It's a draw!")
      else if (data.winner === player)        setStatus('🎉 You won the round!')
      else if (data.winner)                   setStatus(`${data.winner} won!`)
      else if (!data.snakes?.[player]?.alive) setStatus('💀 Crashed!')
      else                                    setStatus('🕹️ Move!')
    }

    ws.onclose = () => { if (!mountedRef.current) return; setStatus('Reconnecting...') }
    ws.onerror = () => ws.close()

    return () => { mountedRef.current = false; ws.close() }
  }, [player])

  // ── Canvas draw ────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !state) return
    const ctx = canvas.getContext('2d')
    const C   = cellSize

    canvas.width  = COLS * C
    canvas.height = ROWS * C

    ctx.fillStyle = '#1a2634'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#1e2e40'; ctx.lineWidth = 0.5
    for (let r = 0; r <= ROWS; r++) { ctx.beginPath(); ctx.moveTo(0, r*C); ctx.lineTo(COLS*C, r*C); ctx.stroke() }
    for (let c = 0; c <= COLS; c++) { ctx.beginPath(); ctx.moveTo(c*C, 0); ctx.lineTo(c*C, ROWS*C); ctx.stroke() }

    Object.entries(state.snakes || {}).forEach(([name, snake]) => {
      const sp = PLAYERS[name]
      if (!sp) return
      snake.body.forEach(([r, c], idx) => {
        const x = c*C+1, y = r*C+1, sz = C-2
        ctx.fillStyle = idx === 0 ? sp.head : snake.alive ? sp.color : '#555'
        ctx.beginPath(); ctx.roundRect(x, y, sz, sz, idx === 0 ? Math.max(2, C*0.3) : Math.max(1, C*0.2)); ctx.fill()
        if (idx === 0 && snake.alive && C >= 10) {
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x+sz*0.7, y+sz*0.3, Math.max(1, C*0.12), 0, Math.PI*2); ctx.fill()
          ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x+sz*0.7+0.4, y+sz*0.3+0.4, Math.max(0.5, C*0.06), 0, Math.PI*2); ctx.fill()
        }
      })
      if (!snake.alive && snake.body.length > 0) {
        const [hr, hc] = snake.body[0]
        ctx.font = `${C}px sans-serif`; ctx.textAlign = 'center'
        ctx.fillText('💀', hc*C+C/2, hr*C+C*0.9)
      }
    })

    if (state.apple) {
      const [ar, ac] = state.apple
      const ax = ac*C+C/2, ay = ar*C+C/2, r = C/2-1
      const grd = ctx.createRadialGradient(ax, ay, 1, ax, ay, r*2)
      grd.addColorStop(0, '#ff000055'); grd.addColorStop(1, 'transparent')
      ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(ax, ay, r*2, 0, Math.PI*2); ctx.fill()
      ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(ax, ay, r, 0, Math.PI*2); ctx.fill()
      ctx.fillStyle = '#ffffff44'; ctx.beginPath(); ctx.arc(ax-r*0.3, ay-r*0.3, r*0.3, 0, Math.PI*2); ctx.fill()
      ctx.strokeStyle = '#15803d'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(ax, ay-r); ctx.lineTo(ax+2, ay-r-3); ctx.stroke()
    }

    if (state.countdown !== null && state.countdown !== undefined) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.font = `900 ${C*7}px Nunito, sans-serif`
      ctx.textAlign = 'center'
      ctx.fillStyle = state.countdown === 0 ? '#fbbf24' : '#fff'
      ctx.shadowColor = '#000'; ctx.shadowBlur = 20
      ctx.fillText(state.countdown === 0 ? 'GO!' : String(state.countdown), canvas.width/2, canvas.height/2 + C*2.5)
      ctx.shadowBlur = 0
    }
  }, [state, cellSize])

  const bothHere   = state?.connected?.length === 2
  const myScore    = state?.scores?.[player]  ?? 0
  const otherScore = state?.scores?.[other]   ?? 0
  const dpadSize   = compact ? Math.min(Math.floor((window.innerWidth - 32) / 4), 68) : 72

  const statusBg    = state?.winner === player ? '#dcfce7' : state?.winner === 'draw' ? '#fef9c3' : state?.winner ? '#fee2e2' : bothHere ? p.light : '#f1f5f9'
  const statusColor = state?.winner === player ? '#15803d' : state?.winner === 'draw' ? '#92400e' : state?.winner ? '#dc2626' : bothHere ? p.color : '#64748b'

  return (
    <div style={{
      height: compact ? '100dvh' : 'auto',
      minHeight: compact ? 'unset' : '100vh',
      background: p.bg,
      backgroundImage: p.bgImage,
      backgroundSize: '120px 120px',
      backgroundRepeat: 'repeat',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      overflow: compact ? 'hidden' : 'auto',
      gap: compact ? 4 : 10,
      paddingBottom: compact ? 4 : 32,
    }}>
      {/* Header */}
      <div style={{ ...s.header, padding: compact ? '6px 14px' : '14px 20px' }}>
        <button onClick={onBack} style={{ ...s.backBtn, color: p.color }}>← Back</button>
        <div style={{ fontWeight: 900, color: '#1e1b4b', fontSize: compact ? 14 : 18 }}>Snake Race 🐍</div>
        <div style={{ width: 48 }} />
      </div>

      {/* Scores */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', maxWidth: 400, padding: compact ? '0 10px' : '0 16px' }}>
        <div style={{ ...s.scoreCard, borderColor: p.color, background: p.light, padding: compact ? '5px 10px' : '8px 12px' }}>
          <span style={{ fontSize: compact ? 16 : 20 }}>{p.emoji}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, color: p.color, fontSize: compact ? 11 : 14 }}>{player}</div>
            {!compact && <div style={{ fontSize: 11, color: '#94a3b8' }}>your snake</div>}
          </div>
          <span style={{ fontWeight: 900, color: p.color, fontSize: compact ? 18 : 24 }}>{myScore}</span>
        </div>
        <div style={{ fontSize: 11, fontWeight: 900, color: '#cbd5e1' }}>VS</div>
        <div style={{ ...s.scoreCard, borderColor: op.color, background: op.light, padding: compact ? '5px 10px' : '8px 12px' }}>
          <span style={{ fontSize: compact ? 16 : 20 }}>{op.emoji}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, color: op.color, fontSize: compact ? 11 : 14 }}>{other}</div>
            {!compact && <div style={{ fontSize: 11, color: '#94a3b8' }}>their snake</div>}
          </div>
          <span style={{ fontWeight: 900, color: op.color, fontSize: compact ? 18 : 24 }}>{otherScore}</span>
        </div>
      </div>

      {/* Status */}
      <div style={{ ...s.status, background: statusBg, color: statusColor, padding: compact ? '5px 16px' : '10px 24px', fontSize: compact ? 12 : 14 }}>
        {status}
      </div>

      {/* Canvas */}
      <div style={{ boxShadow: '0 8px 32px #0003', borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}>
        <canvas ref={canvasRef} style={{ display: 'block' }} />
      </div>

      {bothHere && <DPad color={p.color} onDir={sendDir} size={dpadSize} />}

      {!bothHere && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8', fontWeight: 700, fontSize: 14, marginTop: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, animation: 'pulse 1.5s ease-in-out infinite' }} />
          Waiting for {other}...
        </div>
      )}
    </div>
  )
}

const s = {
  header:   { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffffcc', backdropFilter: 'blur(8px)', boxShadow: '0 1px 0 #e2e8f0' },
  backBtn:  { background: 'none', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', padding: '6px 12px', borderRadius: 10, fontFamily: 'inherit' },
  scoreCard:{ display: 'flex', alignItems: 'center', gap: 8, border: '2px solid', borderRadius: 14, flex: 1 },
  status:   { borderRadius: 12, fontWeight: 800, textAlign: 'center', transition: 'all 0.3s', minWidth: 180, maxWidth: 360 },
}