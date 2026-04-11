import { useState, useEffect, useRef, useCallback } from 'react'
import { playSound } from '../sounds'
import { vibrate, VIBRATIONS } from '../vibrate'
import { getPlayer } from '../playerUtils'

const WS_PROTOCOL  = location.protocol === 'https:' ? 'wss' : 'ws'
const WS_URL       = `${WS_PROTOCOL}://${location.host}/api/spinner/ws`
const TOTAL_PIECES = 8
const TAP_DURATION = 10

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

const COLORS = {
  // colors resolved dynamically
  Ella:     '#db2777',
  unclaimed: '#cbd5e1',
}

// ── Wheel ─────────────────────────────────────────────────────────────────────
function Wheel({ pieces, weights, player, phase, spinAngle, onClaim, onSpinEnd }) {
  const canvasRef  = useRef(null)
  const animRef    = useRef(null)
  const currentRot = useRef(0)
  const startRef   = useRef(null)
  const DURATION   = 5000

  const getSize = () => Math.min(window.innerWidth - 32, 340)

  // Build cumulative angle array from weights
  const getSliceAngles = (w) => {
    const angles = []
    let cumulative = 0
    for (let i = 0; i < w.length; i++) {
      angles.push(cumulative * 2 * Math.PI)
      cumulative += w[i]
    }
    angles.push(2 * Math.PI) // end
    return angles
  }

  const draw = useCallback((angle) => {
    const canvas = canvasRef.current
    if (!canvas || !weights) return
    const ctx  = canvas.getContext('2d')
    const size = canvas.width
    const cx = size / 2, cy = size / 2
    const r  = size / 2 - 10

    ctx.clearRect(0, 0, size, size)

    const sliceAngles = getSliceAngles(weights)

    for (let i = 0; i < TOTAL_PIECES; i++) {
      const start = angle + sliceAngles[i]     - Math.PI / 2
      const end   = angle + sliceAngles[i + 1] - Math.PI / 2
      const owner = pieces ? pieces[i] : null
      const mid   = (start + end) / 2
      const sliceDeg = (weights[i] * 360).toFixed(0)

      ctx.fillStyle = getPlayer(playersRef?.current || {}, owner, 0).color || '#94a3b8'
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, r, start, end)
      ctx.closePath()
      ctx.fill()

      ctx.strokeStyle = '#fff'
      ctx.lineWidth   = 3
      ctx.stroke()

      // Label at midpoint of slice
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(mid)
      ctx.textAlign = 'center'

      if (owner) {
        // Owner emoji + weight %
        ctx.font = `${size < 300 ? 14 : 18}px sans-serif`
        ctx.fillText(getPlayer(playersRef?.current || {}, owner, 0).emoji || '🎮', r * 0.6, -4)
        ctx.fillStyle = '#fff'
        ctx.font = `bold ${size < 300 ? 9 : 11}px Nunito, sans-serif`
        ctx.fillText(`${sliceDeg}°`, r * 0.6, 10)
      } else {
        // Slice number + size hint
        ctx.fillStyle = '#fff'
        ctx.font = `bold ${size < 300 ? 11 : 13}px Nunito, sans-serif`
        ctx.fillText(`${i + 1}`, r * 0.6, -4)
        ctx.font = `${size < 300 ? 9 : 10}px Nunito, sans-serif`
        ctx.fillText(`${sliceDeg}°`, r * 0.6, 10)
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
  }, [pieces, weights])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const size    = getSize()
    canvas.width  = size
    canvas.height = size
    if (!animRef.current) draw(currentRot.current)
  }, [pieces, weights, draw])

  const easeOut = (t) => 1 - Math.pow(1 - t, 4)

  useEffect(() => {
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

  const handleTap = (e) => {
    if (phase !== 'picking') return
    const canvas = canvasRef.current
    if (!canvas || !weights) return
    e.preventDefault()

    const rect    = canvas.getBoundingClientRect()
    const scaleX  = canvas.width  / rect.width
    const scaleY  = canvas.height / rect.height
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    const x = (clientX - rect.left) * scaleX - canvas.width  / 2
    const y = (clientY - rect.top)  * scaleY - canvas.height / 2

    // Find which slice was tapped based on angle + cumulative weights
    let angle = Math.atan2(y, x) - currentRot.current + Math.PI / 2
    angle = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
    const fraction = angle / (2 * Math.PI)

    let cumulative = 0
    for (let i = 0; i < TOTAL_PIECES; i++) {
      cumulative += weights[i]
      if (fraction <= cumulative) {
        onClaim?.(i)
        return
      }
    }
    onClaim?.(TOTAL_PIECES - 1)
  }

  return (
    <canvas
      ref={canvasRef}
      width={getSize()}
      height={getSize()}
      style={{ display: 'block', margin: '0 auto', cursor: phase === 'picking' ? 'pointer' : 'default', touchAction: 'none' }}
      onClick={handleTap}
      onTouchStart={handleTap}
    />
  )
}

// ── Tap Battle ────────────────────────────────────────────────────────────────
function TapBattle({ state, player, onTap, tapRemaining }) {
  const p       = getPlayer(players, player, 0)
  const other   = state?.connected?.find(n => n !== player) || null
  const op      = other ? getPlayer(players, other, 1) : null
  const myTaps  = state?.taps?.[player] ?? 0
  const oppTaps = state?.taps?.[other]  ?? 0
  const total   = myTaps + oppTaps
  const myPct   = total > 0 ? (myTaps / total) * 100 : 50
  // Use the stable tapRemaining prop — never falls back to TAP_DURATION mid-game
  const remaining = tapRemaining

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, width: '100%', maxWidth: 400, padding: '0 20px' }}>
      <div style={{ fontSize: 52, fontWeight: 900, color: remaining <= 3 ? '#ef4444' : '#1e1b4b', fontFamily: 'monospace', transition: 'color 0.3s' }}>
        {remaining}s
      </div>

      <div style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13, fontWeight: 800 }}>
          <span style={{ color: p.color }}>{p.emoji} {myTaps}</span>
          <span style={{ color: op?.color || "#94a3b8" }}>{oppTaps} {op?.emoji || "👤"}</span>
        </div>
        <div style={{ height: 16, background: op?.color || "#94a3b8", borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${myPct}%`, background: p.color, borderRadius: 99, transition: 'width 0.1s' }} />
        </div>
      </div>

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
export default function Spinner({ player, players, onBack }) {
  const [state, setState]         = useState(null)
  const [status, setStatus]       = useState('Connecting...')
  const [spinDone, setSpinDone]   = useState(false)
  const [tapRemaining, setTapRemaining] = useState(TAP_DURATION)
  const wsRef                     = useRef(null)
  const prevPhase                 = useRef(null)

  const p     = getPlayer(players, player, 0)
  const other = state?.connected?.find(n => n !== player) || null
  const op    = other ? getPlayer(players, other, 1) : null

  const connect = useCallback(() => {
    const ws = new WebSocket(`${WS_URL}/${player}`)
    wsRef.current = ws

    ws.onopen = () => setStatus('Connected!')

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data)
      setState(data)

      // Fix 1: only update timer when explicitly sent by server
      if (data.tap_remaining !== undefined && data.tap_remaining !== null) {
        setTapRemaining(data.tap_remaining)
      }

      // Phase transitions
      if (data.phase !== prevPhase.current) {
        if (data.phase === 'tapping') { playSound('rematch'); setTapRemaining(TAP_DURATION) }
        if (data.phase === 'picking') { playSound('win'); vibrate(VIBRATIONS.win) }
        // Fix 2: do NOT set spinDone here — only set it when animation ends
        prevPhase.current = data.phase
      }

      // Status text
      if (data.message)                    setStatus(data.message)
      else if (data.connected?.length < 2) setStatus('Waiting for opponent...')
      else if (data.phase === 'tapping')   setStatus('Tap as fast as you can!')
      else if (data.phase === 'picking') {
        if (data.whose_turn === player)    setStatus(`${p.emoji} Your turn — tap a slice!`)
        else                               setStatus(`${op?.emoji || ""} ${other || "opponent"} is picking...`)
      }
      else if (data.phase === 'spinning')  setStatus('Ready to spin? 🎡')
      else if (data.phase === 'result')    setStatus('🎡 Spinning...')
    }

    ws.onclose = () => { setStatus('Disconnected. Reconnecting...'); setTimeout(connect, 2000) }
    ws.onerror = () => ws.close()
  }, [player])

  useEffect(() => { connect(); return () => wsRef.current?.close() }, [connect])

  const sendTap = () => wsRef.current?.send(JSON.stringify({ type: 'tap' }))

  const sendClaim = (index) => {
    if (state?.whose_turn !== player) return
    if (state?.pieces?.[index] !== null && state?.pieces?.[index] !== undefined) return
    vibrate(VIBRATIONS.pick)
    playSound('place')
    wsRef.current?.send(JSON.stringify({ type: 'claim', index }))
  }

  const sendSpin = () => {
    vibrate(VIBRATIONS.spin)
    playSound('rematch')
    setSpinDone(false)
    wsRef.current?.send(JSON.stringify({ type: 'spin' }))
  }

  const sendReset = () => {
    setSpinDone(false)
    setTapRemaining(TAP_DURATION)
    prevPhase.current = null
    wsRef.current?.send(JSON.stringify({ type: 'reset' }))
  }

  // Fix 2: winner revealed only after spin animation completes
  const handleSpinEnd = () => {
    setSpinDone(true)
    playSound('win')
    vibrate(VIBRATIONS.win)
    const winnerOwner = state?.pieces?.[state?.spin_result]
    if (winnerOwner) {
      setStatus(`${getPlayer(players, winnerOwner, 0).emoji} ${winnerOwner} wins!`)
    }
  }

  const bothHere    = state?.connected?.length === 2
  const phase       = state?.phase
  const pieces      = state?.pieces   || Array(TOTAL_PIECES).fill(null)
  const weights     = state?.weights  || Array(TOTAL_PIECES).fill(1 / TOTAL_PIECES)
  const winnerOwner = spinDone && phase === 'result' && state?.spin_result !== null
    ? pieces[state.spin_result]
    : null
  const winnerPlayer = winnerOwner ? getPlayer(players, winnerOwner, 0) : null

  return (
    <div style={{ ...s.wrap, background: p.bg }}>
      <div style={s.header}>
        <button onClick={onBack} style={{ ...s.backBtn, color: p.color }}>← Back</button>
        <div style={s.title}>🎡 Spinner</div>
        <div style={{ width: 64 }} />
      </div>

      <div style={{
        ...s.status,
        background: winnerPlayer ? winnerPlayer.light : phase === 'picking' && state?.whose_turn === player ? p.light : '#f1f5f9',
        color:      winnerPlayer ? winnerPlayer.color : phase === 'picking' && state?.whose_turn === player ? p.color : '#64748b',
      }}>
        {status}
      </div>

      {!bothHere && (
        <div style={s.waiting}>
          <div style={{ ...s.waitingDot, background: p.color }} />
          Waiting for {other} to join...
        </div>
      )}

      {bothHere && phase === 'tapping' && (
        <TapBattle state={state} player={player} onTap={sendTap} tapRemaining={tapRemaining} />
      )}

      {bothHere && phase === 'picking' && state?.tap_winner && (
        <div style={{ padding: '8px 20px', borderRadius: 12, fontWeight: 800, fontSize: 13, background: getPlayer(players, state.tap_winner, 0).light, color: getPlayer(players, state.tap_winner, 0).color, textAlign: 'center' }}>
          {getPlayer(players, state.tap_winner, 0).emoji} {state.tap_winner} won! ({state.taps?.[state.tap_winner]} vs {state.taps?.[state?.connected?.find(n => n !== state.tap_winner)]} taps) — picks first
        </div>
      )}

      {bothHere && phase === 'picking' && (
        <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>
          <span style={{ color: getPlayer(players, (state?.connected||[])[0], 0).color }}>{getPlayer(players, (state?.connected||[])[0], 0).emoji} {pieces.filter(p => p === (state?.connected||[])[0]).length}</span>
          {' / '}
          <span style={{ color: getPlayer(players, (state?.connected||[])[1], 1).color }}>{pieces.filter(p => p === (state?.connected||[])[1]).length} {getPlayer(players, (state?.connected||[])[1], 1).emoji}</span>
          {' — '}{TOTAL_PIECES - (state?.current_pick || 0)} left
        </div>
      )}

      {/* Wheel — visible from picking phase onwards */}
      {bothHere && phase !== 'tapping' && (
        <div style={{ width: '100%', padding: '0 16px' }}>
          <Wheel
            pieces={pieces}
            weights={weights}
            player={player}
            phase={phase}
            spinAngle={state?.spin_angle ?? null}
            onClaim={sendClaim}
            onSpinEnd={handleSpinEnd}
          />
        </div>
      )}

      {bothHere && phase === 'spinning' && (
        <button onClick={sendSpin} style={{ ...s.bigBtn, background: p.color }}>
          🎡 SPIN THE WHEEL!
        </button>
      )}

      {/* Fix 2: result only shown after spinDone */}
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