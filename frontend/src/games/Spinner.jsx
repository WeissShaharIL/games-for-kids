import { useState, useEffect, useRef, useCallback } from 'react'
import { playSound } from '../sounds'
import { vibrate, VIBRATIONS } from '../vibrate'

const WS_PROTOCOL = location.protocol === 'https:' ? 'wss' : 'ws'
const WS_URL      = `${WS_PROTOCOL}://${location.host}/api/spinner/ws`


const TOTAL_PIECES = 8
const TAP_DURATION = 10

const PLAYERS = {
  Ariel: { color: '#16a34a', light: '#dcfce7', bg: '#f0fdf4', emoji: '🦁' },
  Ella:  { color: '#db2777', light: '#fce7f3', bg: '#fdf2f8', emoji: '🦋' },
}

const COLORS = {
  Ariel:    '#16a34a',
  ArielHi:  '#22c55e',
  Ella:     '#db2777',
  EllaHi:   '#ec4899',
  unclaimed: '#cbd5e1',
  unclaimedHi: '#94a3b8',
}

// ── Interactive Wheel ─────────────────────────────────────────────────────────
function Wheel({ pieces, player, phase, spinAngle, onClaim, onSpinEnd }) {
  const canvasRef  = useRef(null)
  const animRef    = useRef(null)
  const currentRot = useRef(0)
  const startRef   = useRef(null)
  const DURATION   = 5000
  const p          = PLAYERS[player]
  const isMyTurn   = phase === 'picking'

  const getSize = () => Math.min(window.innerWidth - 32, 340)

  const draw = useCallback((angle) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx  = canvas.getContext('2d')
    const size = canvas.width
    const cx = size / 2, cy = size / 2
    const r  = size / 2 - 10
    const n  = TOTAL_PIECES
    const slice = (2 * Math.PI) / n

    ctx.clearRect(0, 0, size, size)

    // Draw slices
    for (let i = 0; i < n; i++) {
      const start  = angle + i * slice - Math.PI / 2
      const end    = start + slice
      const owner  = pieces[i]

      // Fill color
      if (owner === 'Ariel')     ctx.fillStyle = COLORS.Ariel
      else if (owner === 'Ella') ctx.fillStyle = COLORS.Ella
      else                       ctx.fillStyle = COLORS.unclaimed

      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, r, start, end)
      ctx.closePath()
      ctx.fill()

      // Border
      ctx.strokeStyle = '#fff'
      ctx.lineWidth   = 3
      ctx.stroke()

      // Label
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(start + slice / 2)
      ctx.textAlign = 'center'

      if (owner) {
        // Owner emoji
        ctx.font = `${size < 300 ? 16 : 20}px sans-serif`
        ctx.fillText(PLAYERS[owner].emoji, r * 0.62, 7)
      } else {
        // Slice number
        ctx.fillStyle = '#fff'
        ctx.font      = `bold ${size < 300 ? 12 : 14}px Nunito, sans-serif`
        ctx.fillText(`${i + 1}`, r * 0.62, 6)
      }
      ctx.restore()
    }

    // Center circle
    ctx.beginPath()
    ctx.arc(cx, cy, 24, 0, 2 * Math.PI)
    ctx.fillStyle = '#fff'
    ctx.fill()
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth   = 3
    ctx.stroke()
    ctx.font      = '20px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('🎯', cx, cy + 7)

    // Pointer
    ctx.beginPath()
    ctx.moveTo(cx - 14, 2)
    ctx.lineTo(cx + 14, 2)
    ctx.lineTo(cx, 30)
    ctx.closePath()
    ctx.fillStyle   = '#1e1b4b'
    ctx.shadowColor = '#0005'
    ctx.shadowBlur  = 8
    ctx.fill()
    ctx.shadowBlur  = 0
  }, [pieces])

  // Static redraw when pieces change
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const size    = getSize()
    canvas.width  = size
    canvas.height = size
    if (!animRef.current) draw(currentRot.current)
  }, [pieces, draw])

  // Spin animation
  const easeOut = (t) => 1 - Math.pow(1 - t, 4)

  useEffect(() => {
    if (phase !== 'spinning' && phase !== 'result') return
    if (spinAngle === null || spinAngle === undefined) return

    const targetRad = (spinAngle * Math.PI) / 180
    const startRot  = currentRot.current
    startRef.current = null

    const animate = (ts) => {
      if (!startRef.current) startRef.current = ts
      const elapsed  = ts - startRef.current
      const progress = Math.min(elapsed / DURATION, 1)
      const angle    = startRot + (targetRad - startRot) * easeOut(progress)
      currentRot.current = angle
      draw(angle)

      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate)
      } else {
        animRef.current = null
        onSpinEnd?.()
      }
    }
    cancelAnimationFrame(animRef.current)
    animRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animRef.current)
  }, [spinAngle])

  // Handle tap on canvas to claim slice
  const handleCanvasTap = (e) => {
    if (phase !== 'picking') return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect   = canvas.getBoundingClientRect()
    const scaleX = canvas.width  / rect.width
    const scaleY = canvas.height / rect.height

    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY

    const x  = (clientX - rect.left) * scaleX - canvas.width  / 2
    const y  = (clientY - rect.top)  * scaleY - canvas.height / 2

    // Convert to angle relative to wheel rotation
    let angle = Math.atan2(y, x) - currentRot.current + Math.PI / 2
    angle = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)

    const sliceIndex = Math.floor(angle / (2 * Math.PI / TOTAL_PIECES))
    onClaim?.(sliceIndex)
  }

  const size = getSize()

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ display: 'block', margin: '0 auto', cursor: phase === 'picking' ? 'pointer' : 'default', touchAction: 'none' }}
      onClick={handleCanvasTap}
      onTouchStart={handleCanvasTap}
    />
  )
}

// ── Tap Battle ────────────────────────────────────────────────────────────────
function TapBattle({ state, player, onTap }) {
  const p       = PLAYERS[player]
  const other   = player === 'Ariel' ? 'Ella' : 'Ariel'
  const op      = PLAYERS[other]
  const myTaps  = state.taps?.[player] ?? 0
  const oppTaps = state.taps?.[other]  ?? 0
  const remaining = state.tap_remaining ?? TAP_DURATION
  const total   = myTaps + oppTaps
  const myPct   = total > 0 ? (myTaps / total) * 100 : 50

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, width: '100%', maxWidth: 400, padding: '0 20px' }}>
      {/* Timer */}
      <div style={{ fontSize: 52, fontWeight: 900, color: remaining <= 3 ? '#ef4444' : '#1e1b4b', fontFamily: 'monospace', transition: 'color 0.3s' }}>
        {remaining}s
      </div>

      {/* Bar */}
      <div style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13, fontWeight: 800 }}>
          <span style={{ color: p.color }}>{p.emoji} {myTaps}</span>
          <span style={{ color: op.color }}>{oppTaps} {op.emoji}</span>
        </div>
        <div style={{ height: 16, background: op.color, borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${myPct}%`, background: p.color, borderRadius: 99, transition: 'width 0.1s' }} />
        </div>
      </div>

      {/* Tap area */}
      <div
        onPointerDown={(e) => { e.preventDefault(); vibrate(VIBRATIONS.tap); onTap() }}
        style={{
          width: '100%', height: 180,
          background: `linear-gradient(135deg, ${p.color}, ${p.color}cc)`,
          borderRadius: 28,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', userSelect: 'none', WebkitUserSelect: 'none',
          touchAction: 'none',
          boxShadow: `0 8px 32px ${p.color}44`,
          color: '#fff', gap: 8,
        }}
      >
        <div style={{ fontSize: 52 }}>👆</div>
        <div style={{ fontSize: 20, fontWeight: 900 }}>TAP AS FAST AS YOU CAN!</div>
        <div style={{ fontSize: 13, opacity: 0.85 }}>Most taps picks first!</div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Spinner({ player, onBack }) {
  const [state, setState]       = useState(null)
  const [status, setStatus]     = useState('Connecting...')
  const [spinDone, setSpinDone] = useState(false)
  const wsRef                   = useRef(null)
  const prevPhase               = useRef(null)

  const p     = PLAYERS[player]
  const other = player === 'Ariel' ? 'Ella' : 'Ariel'
  const op    = PLAYERS[other]

  const connect = useCallback(() => {
    const ws = new WebSocket(`${WS_URL}/${player}`)
    wsRef.current = ws
    ws.onopen    = () => setStatus('Connected!')
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data)
      setState(data)

      if (data.phase !== prevPhase.current) {
        if (data.phase === 'tapping') playSound('rematch')
        if (data.phase === 'picking') { playSound('win'); vibrate(VIBRATIONS.win) }
        if (data.phase === 'result')  { playSound('win'); vibrate(VIBRATIONS.win); setSpinDone(true) }
        prevPhase.current = data.phase
      }

      if (data.message)                      setStatus(data.message)
      else if (data.connected?.length < 2)   setStatus(`Waiting for ${other}...`)
      else if (data.phase === 'tapping')     setStatus('Tap as fast as you can!')
      else if (data.phase === 'picking') {
        const whose = data.whose_turn
        if (whose === player) setStatus(`${p.emoji} Your turn — tap a slice!`)
        else                  setStatus(`${op.emoji} ${other} is picking...`)
      }
      else if (data.phase === 'spinning')    setStatus('Ready to spin? 🎡')
      else if (data.phase === 'result') {
        const idx    = data.spin_result
        const winner = data.pieces?.[idx]
        if (winner) setStatus(`${PLAYERS[winner].emoji} ${winner} wins!`)
      }
    }
    ws.onclose = () => { setStatus('Disconnected. Reconnecting...'); setTimeout(connect, 2000) }
    ws.onerror = () => ws.close()
  }, [player])

  useEffect(() => { connect(); return () => wsRef.current?.close() }, [connect])

  const sendTap   = () => wsRef.current?.send(JSON.stringify({ type: 'tap' }))

  const sendClaim = (index) => {
    if (state?.whose_turn !== player) return
    if (state?.pieces?.[index] !== null) return
    vibrate(VIBRATIONS.pick)
    playSound('place')
    wsRef.current?.send(JSON.stringify({ type: 'claim', index }))
  }

  const sendSpin = () => {
    vibrate(VIBRATIONS.spin)
    playSound('rematch')
    wsRef.current?.send(JSON.stringify({ type: 'spin' }))
  }

  const sendReset = () => {
    setSpinDone(false)
    prevPhase.current = null
    wsRef.current?.send(JSON.stringify({ type: 'reset' }))
  }

  const bothHere = state?.connected?.length === 2
  const phase    = state?.phase
  const pieces   = state?.pieces || Array(TOTAL_PIECES).fill(null)

  // Winner info for result phase
  const winnerOwner = phase === 'result' && state?.spin_result !== null
    ? pieces[state.spin_result]
    : null
  const winnerPlayer = winnerOwner ? PLAYERS[winnerOwner] : null

  return (
    <div style={{ ...s.wrap, background: p.bg }}>
      <div style={s.header}>
        <button onClick={onBack} style={{ ...s.backBtn, color: p.color }}>← Back</button>
        <div style={s.title}>🎡 Spinner</div>
        <div style={{ width: 64 }} />
      </div>

      {/* Status */}
      <div style={{
        ...s.status,
        background: phase === 'result' ? winnerPlayer?.light || p.light : phase === 'picking' && state?.whose_turn === player ? p.light : '#f1f5f9',
        color:      phase === 'result' ? winnerPlayer?.color || p.color : phase === 'picking' && state?.whose_turn === player ? p.color : '#64748b',
      }}>
        {status}
      </div>

      {/* Waiting */}
      {!bothHere && (
        <div style={s.waiting}>
          <div style={{ ...s.waitingDot, background: p.color }} />
          Waiting for {other} to join...
        </div>
      )}

      {/* Tap battle */}
      {bothHere && phase === 'tapping' && (
        <TapBattle state={state} player={player} onTap={sendTap} />
      )}

      {/* Tap result banner */}
      {bothHere && phase === 'picking' && state?.tap_winner && (
        <div style={{
          padding: '8px 20px', borderRadius: 12, fontWeight: 800, fontSize: 13,
          background: PLAYERS[state.tap_winner].light,
          color:      PLAYERS[state.tap_winner].color,
          textAlign: 'center',
        }}>
          {PLAYERS[state.tap_winner].emoji} {state.tap_winner} won! ({state.taps?.[state.tap_winner]} vs {state.taps?.[state.tap_winner === 'Ariel' ? 'Ella' : 'Ariel']} taps) — picks first
        </div>
      )}

      {/* Piece counter during picking */}
      {bothHere && phase === 'picking' && (
        <div style={{ display: 'flex', gap: 8, fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>
          <span style={{ color: PLAYERS.Ariel.color }}>{PLAYERS.Ariel.emoji} {pieces.filter(p => p === 'Ariel').length}</span>
          <span>/</span>
          <span style={{ color: PLAYERS.Ella.color }}>{pieces.filter(p => p === 'Ella').length} {PLAYERS.Ella.emoji}</span>
          <span style={{ marginLeft: 4 }}>— {TOTAL_PIECES - (state?.current_pick || 0)} left</span>
        </div>
      )}

      {/* Wheel — show from picking phase onwards */}
      {bothHere && phase !== 'tapping' && (
        <div style={{ width: '100%', padding: '0 16px' }}>
          <Wheel
            pieces={pieces}
            player={player}
            phase={phase}
            spinAngle={state?.spin_angle ?? null}
            onClaim={sendClaim}
            onSpinEnd={() => setSpinDone(true)}
          />
        </div>
      )}

      {/* Spin button */}
      {bothHere && phase === 'spinning' && (
        <button onClick={sendSpin} style={{ ...s.bigBtn, background: p.color }}>
          🎡 SPIN THE WHEEL!
        </button>
      )}

      {/* Result */}
      {bothHere && phase === 'result' && spinDone && winnerOwner && (
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 64 }}>{winnerPlayer.emoji}</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: winnerPlayer.color }}>
            {winnerOwner} wins!
          </div>
          <button onClick={sendReset} style={{ ...s.bigBtn, background: p.color }}>
            🔄 Play Again
          </button>
        </div>
      )}
    </div>
  )
}

const s = {
  wrap:       { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: 40, gap: 12 },
  header:     { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', background: '#ffffffcc', backdropFilter: 'blur(8px)', boxShadow: '0 1px 0 #e2e8f0' },
  backBtn:    { background: 'none', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', padding: '6px 12px', borderRadius: 10, fontFamily: 'inherit' },
  title:      { fontSize: 20, fontWeight: 900, color: '#1e1b4b' },
  status:     { padding: '10px 24px', borderRadius: 12, fontSize: 15, fontWeight: 800, textAlign: 'center', transition: 'all 0.3s', minWidth: 240, maxWidth: 380 },
  bigBtn:     { padding: '16px 40px', borderRadius: 18, border: 'none', color: '#fff', fontSize: 20, fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 16px #0002' },
  waiting:    { display: 'flex', alignItems: 'center', gap: 10, color: '#94a3b8', fontWeight: 700, fontSize: 15 },
  waitingDot: { width: 10, height: 10, borderRadius: '50%', animation: 'pulse 1.5s ease-in-out infinite' },
}