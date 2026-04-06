import { useState, useEffect, useRef } from 'react'
import { playSound } from '../sounds'
import { vibrate, VIBRATIONS } from '../vibrate'

const WS_PROTOCOL = location.protocol === 'https:' ? 'wss' : 'ws'
const WS_URL      = `${WS_PROTOCOL}://${location.host}/api/tugofwar/ws`

const FALLBACKS = [
  { color: '#16a34a', light: '#dcfce7', bg: '#f0fdf4', emoji: '🦁' },
  { color: '#db2777', light: '#fce7f3', bg: '#fdf2f8', emoji: '🦋' },
  { color: '#2563eb', light: '#dbeafe', bg: '#eff6ff', emoji: '🦊' },
  { color: '#d97706', light: '#fef3c7', bg: '#fffbeb', emoji: '🌸' },
  { color: '#7c3aed', light: '#ede9fe', bg: '#faf5ff', emoji: '🧔' },
  { color: '#0891b2', light: '#cffafe', bg: '#ecfeff', emoji: '👩' },
]

function safe(players, name, idx = 0) {
  if (players && name && players[name]) return players[name]
  return FALLBACKS[idx % FALLBACKS.length]
}

// ── Rope canvas ───────────────────────────────────────────────────────────────
function RopeCanvas({ ropePos, sides, players, connected, phase, winner }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W   = canvas.width
    const H   = canvas.height

    ctx.clearRect(0, 0, W, H)

    // Sky/background
    const bg = ctx.createLinearGradient(0, 0, 0, H * 0.72)
    bg.addColorStop(0, '#e0f2fe')
    bg.addColorStop(1, '#f0fdf4')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H * 0.72)

    // Ground
    const ground = ctx.createLinearGradient(0, H * 0.72, 0, H)
    ground.addColorStop(0, '#92400e')
    ground.addColorStop(1, '#78350f')
    ctx.fillStyle = ground
    ctx.fillRect(0, H * 0.72, W, H)

    // Grass
    ctx.fillStyle = '#4ade80'
    ctx.fillRect(0, H * 0.70, W, H * 0.04)

    const leftPlayers  = connected.filter(n => sides[n] === 'left')
    const rightPlayers = connected.filter(n => sides[n] === 'right')
    const leftColor    = leftPlayers[0]  ? safe(players, leftPlayers[0],  0).color : '#94a3b8'
    const rightColor   = rightPlayers[0] ? safe(players, rightPlayers[0], 1).color : '#94a3b8'

    // Background halves
    ctx.fillStyle = leftColor + '18'
    ctx.fillRect(0, 0, W / 2, H * 0.72)
    ctx.fillStyle = rightColor + '18'
    ctx.fillRect(W / 2, 0, W / 2, H * 0.72)

    // Center dashed line
    ctx.strokeStyle = '#94a3b855'
    ctx.lineWidth   = 2
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    ctx.moveTo(W / 2, 0)
    ctx.lineTo(W / 2, H * 0.70)
    ctx.stroke()
    ctx.setLineDash([])

    // Win zones
    const winW = W * 0.12
    ctx.fillStyle = leftColor + '33'
    ctx.fillRect(0, 0, winW, H * 0.72)
    ctx.fillStyle = rightColor + '33'
    ctx.fillRect(W - winW, 0, winW, H * 0.72)

    // Win zone borders
    ctx.strokeStyle = leftColor + '88'
    ctx.lineWidth = 2
    ctx.setLineDash([4, 3])
    ctx.beginPath(); ctx.moveTo(winW, 0); ctx.lineTo(winW, H * 0.72); ctx.stroke()
    ctx.strokeStyle = rightColor + '88'
    ctx.beginPath(); ctx.moveTo(W - winW, 0); ctx.lineTo(W - winW, H * 0.72); ctx.stroke()
    ctx.setLineDash([])

    // ── Rope ──────────────────────────────────────────────────────────────────
    const ropeY = H * 0.50
    const ropeX = ropePos * W

    ctx.save()
    ctx.shadowColor = '#00000044'
    ctx.shadowBlur  = 8
    ctx.shadowOffsetY = 4

    // Left rope (leftColor)
    ctx.beginPath()
    ctx.moveTo(0, ropeY)
    for (let x = 0; x <= ropeX; x += 3) {
      const sag = Math.sin((x / Math.max(ropeX, 1)) * Math.PI) * 10
      ctx.lineTo(x, ropeY + sag)
    }
    ctx.strokeStyle = leftColor
    ctx.lineWidth   = 12
    ctx.lineCap     = 'round'
    ctx.stroke()

    // Right rope (rightColor)
    ctx.beginPath()
    ctx.moveTo(ropeX, ropeY)
    for (let x = ropeX; x <= W; x += 3) {
      const t   = (x - ropeX) / Math.max(W - ropeX, 1)
      const sag = Math.sin(t * Math.PI) * 10
      ctx.lineTo(x, ropeY + sag)
    }
    ctx.strokeStyle = rightColor
    ctx.lineWidth   = 12
    ctx.stroke()

    // Rope texture dots
    ctx.restore()
    for (let x = 8; x < W; x += 16) {
      const t   = x / W
      const sag = x < ropeX
        ? Math.sin((x / Math.max(ropeX, 1)) * Math.PI) * 10
        : Math.sin(((x - ropeX) / Math.max(W - ropeX, 1)) * Math.PI) * 10
      ctx.beginPath()
      ctx.arc(x, ropeY + sag, 2.5, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(0,0,0,0.18)'
      ctx.fill()
    }

    // ── Center knot ──────────────────────────────────────────────────────────
    ctx.save()
    ctx.shadowColor = '#00000066'; ctx.shadowBlur = 12
    ctx.beginPath()
    ctx.arc(ropeX, ropeY, 18, 0, Math.PI * 2)
    const kGrad = ctx.createRadialGradient(ropeX - 5, ropeY - 5, 2, ropeX, ropeY, 18)
    kGrad.addColorStop(0, '#fef3c7')
    kGrad.addColorStop(1, '#d97706')
    ctx.fillStyle = kGrad; ctx.fill()
    ctx.strokeStyle = '#92400e'; ctx.lineWidth = 2.5; ctx.stroke()
    ctx.restore()

    // Red flag on knot
    ctx.fillStyle = '#ef4444'
    ctx.fillRect(ropeX - 1.5, ropeY - 28, 3, 20)
    ctx.beginPath()
    ctx.moveTo(ropeX + 1.5, ropeY - 28)
    ctx.lineTo(ropeX + 15,  ropeY - 22)
    ctx.lineTo(ropeX + 1.5, ropeY - 16)
    ctx.closePath()
    ctx.fill()

    // ── Player emojis ─────────────────────────────────────────────────────────
    leftPlayers.forEach((name, i) => {
      const info = safe(players, name, i)
      ctx.font = '26px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const ex = Math.max(22, ropeX - 55 - i * 32)
      ctx.fillText(info.emoji, ex, ropeY - 32)
    })
    rightPlayers.forEach((name, i) => {
      const info = safe(players, name, i + 1)
      ctx.font = '26px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const ex = Math.min(W - 22, ropeX + 55 + i * 32)
      ctx.fillText(info.emoji, ex, ropeY - 32)
    })
    ctx.textBaseline = 'alphabetic'

    // Result overlay
    if (phase === 'result' && winner) {
      ctx.fillStyle = 'rgba(0,0,0,0.52)'
      ctx.fillRect(0, 0, W, H)
      const winColor = winner === 'left' ? leftColor : winner === 'right' ? rightColor : '#fff'
      ctx.font      = `900 ${Math.floor(W * 0.085)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = winColor
      ctx.shadowColor = '#000'; ctx.shadowBlur = 20
      ctx.fillText(
        winner === 'draw' ? 'Draw!' : winner === 'left' ? 'Left Wins!' : 'Right Wins!',
        W / 2, H / 2
      )
      ctx.shadowBlur = 0
      ctx.textBaseline = 'alphabetic'
    }

  }, [ropePos, sides, players, connected, phase, winner])

  const W = Math.min(window.innerWidth - 16, 460)
  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={Math.round(W * 0.52)}
      style={{ display: 'block', borderRadius: 16, boxShadow: '0 8px 32px #0003' }}
    />
  )
}

// ── Tap area ──────────────────────────────────────────────────────────────────
function TapArea({ color, onTap, taps, side }) {
  const [ripples, setRipples] = useState([])

  const handleTap = (e) => {
    e.preventDefault()
    const rect    = e.currentTarget.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    const id = Date.now() + Math.random()
    setRipples(r => [...r.slice(-8), { x: clientX - rect.left, y: clientY - rect.top, id }])
    setTimeout(() => setRipples(r => r.filter(rip => rip.id !== id)), 600)
    onTap()
  }

  return (
    <div
      onPointerDown={handleTap}
      style={{
        width: '100%', height: 140,
        background: `linear-gradient(135deg, ${color}22, ${color}44)`,
        border: `3px solid ${color}66`,
        borderRadius: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', position: 'relative', overflow: 'hidden',
        userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none',
        boxShadow: `0 4px 20px ${color}33`,
      }}
    >
      {ripples.map(rip => (
        <span key={rip.id} style={{
          position: 'absolute',
          left: rip.x - 30, top: rip.y - 30,
          width: 60, height: 60, borderRadius: '50%',
          background: color + '55',
          animation: 'rippleOut 0.6s ease-out forwards',
          pointerEvents: 'none',
        }} />
      ))}
      <div style={{ textAlign: 'center', pointerEvents: 'none' }}>
        <div style={{ fontSize: 32, marginBottom: 4 }}>{side === 'left' ? '⬅️' : '➡️'}</div>
        <div style={{ fontSize: 13, fontWeight: 900, color, letterSpacing: 1 }}>TAP FAST!</div>
        <div style={{ fontSize: 24, fontWeight: 900, color, marginTop: 4 }}>{taps}</div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function TugOfWar({ player, players, onBack }) {
  const [state, setState] = useState(null)
  const [toast, setToast] = useState(null)
  const wsRef             = useRef(null)
  const mountedRef        = useRef(true)
  const prevPhase         = useRef(null)
  const prevJoin          = useRef(null)
  const tapCooldown       = useRef(false)

  const myInfo = safe(players, player, 0)

  useEffect(() => {
    mountedRef.current = true
    const ws = new WebSocket(`${WS_URL}/${player}`)
    wsRef.current = ws

    ws.onopen  = () => {}
    ws.onmessage = (e) => {
      if (!mountedRef.current) return
      const data = JSON.parse(e.data)
      setState(data)

      // Join toast
      if (data.join_msg?.player && data.join_msg.player !== prevJoin.current) {
        prevJoin.current = data.join_msg.player
        if (data.join_msg.player !== player) {
          setToast(`${data.join_msg.player} joined!`)
          setTimeout(() => { if (mountedRef.current) setToast(null) }, 1200)
        }
      }

      // Phase sounds
      if (data.phase !== prevPhase.current) {
        if (data.phase === 'countdown') playSound('rematch')
        if (data.phase === 'result') {
          const mySide = data.sides?.[player]
          if (data.winner === mySide)    { playSound('win');  vibrate(VIBRATIONS.win)  }
          else if (data.winner === 'draw') { playSound('draw'); vibrate(VIBRATIONS.draw) }
          else                           { playSound('lose'); vibrate(VIBRATIONS.lose) }
        }
        prevPhase.current = data.phase
      }
    }
    ws.onclose = () => {}
    ws.onerror = () => ws.close()
    return () => { mountedRef.current = false; ws.close() }
  }, [player])

  const send = (msg) => wsRef.current?.send(JSON.stringify(msg))

  const sendTap = () => {
    if (state?.phase !== 'playing') return
    if (tapCooldown.current) return
    tapCooldown.current = true
    setTimeout(() => { tapCooldown.current = false }, 50)
    vibrate(10)
    send({ type: 'tap' })
  }

  const phase     = state?.phase || 'lobby'
  const sides     = state?.sides || {}
  const ropePos   = state?.rope_pos ?? 0.5
  const taps      = state?.taps || { left: 0, right: 0 }
  const timeLeft  = state?.time_left ?? 30
  const winner    = state?.winner
  const connected = state?.connected || []
  const mySide    = sides[player]

  const leftPlayers  = connected.filter(n => sides[n] === 'left')
  const rightPlayers = connected.filter(n => sides[n] === 'right')
  const canStart     = leftPlayers.length > 0 && rightPlayers.length > 0
  const myTaps       = mySide === 'left' ? taps.left : taps.right
  const iWon         = winner && winner !== 'draw' && winner === mySide
  const isDraw       = winner === 'draw'

  const leftColor  = leftPlayers[0]  ? safe(players, leftPlayers[0],  0).color : '#94a3b8'
  const rightColor = rightPlayers[0] ? safe(players, rightPlayers[0], 1).color : '#94a3b8'

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#fef3c7', paddingBottom: 32, gap: 10 }}>
      <style>{`
        @keyframes rippleOut { from{transform:scale(0.3);opacity:0.8} to{transform:scale(2.5);opacity:0} }
        @keyframes toastIn   { from{transform:translateY(-16px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes pulse     { 0%,100%{opacity:1} 50%{opacity:0.5} }
      `}</style>

      {/* Header */}
      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', background: '#ffffffcc', backdropFilter: 'blur(8px)', boxShadow: '0 1px 0 #e2e8f0' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', color: myInfo.color, fontFamily: 'inherit' }}>← Back</button>
        <div style={{ fontWeight: 900, color: '#1e1b4b', fontSize: 17 }}>🪢 Tug of War</div>
        {phase === 'playing'
          ? <div style={{ fontSize: 18, fontWeight: 900, fontFamily: 'monospace', color: timeLeft <= 10 ? '#ef4444' : '#1e1b4b' }}>{timeLeft}s</div>
          : <div style={{ width: 48 }} />}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 70, left: '50%', transform: 'translateX(-50%)', background: '#1e1b4b', color: '#fff', padding: '10px 20px', borderRadius: 20, fontWeight: 800, fontSize: 14, zIndex: 9999, animation: 'toastIn 0.3s ease', boxShadow: '0 4px 20px #0003', whiteSpace: 'nowrap' }}>
          👋 {toast}
        </div>
      )}

      {/* Countdown */}
      {phase === 'countdown' && state?.countdown != null && (
        <div style={{ fontSize: 72, fontWeight: 900, color: '#1e1b4b', lineHeight: 1 }}>
          {state.countdown === 0 ? 'PULL!' : state.countdown}
        </div>
      )}

      {/* Rope */}
      <RopeCanvas ropePos={ropePos} sides={sides} players={players} connected={connected} phase={phase} winner={winner} />

      {/* Progress bar */}
      {(phase === 'playing' || phase === 'result') && (
        <div style={{ width: '100%', maxWidth: 460, padding: '0 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 800, marginBottom: 4 }}>
            <span style={{ color: leftColor }}>⬅️ {taps.left}</span>
            <span style={{ color: rightColor }}>{taps.right} ➡️</span>
          </div>
          <div style={{ height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${ropePos * 100}%`, background: `linear-gradient(90deg, ${leftColor}, ${rightColor})`, borderRadius: 4, transition: 'width 0.1s' }} />
          </div>
        </div>
      )}

      {/* Lobby */}
      {phase === 'lobby' && (
        <div style={{ width: '100%', maxWidth: 460, padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#64748b' }}>Pick your side!</div>
          <div style={{ display: 'flex', gap: 10 }}>
            {['left', 'right'].map((side, si) => {
              const sidePlayers = connected.filter(n => sides[n] === side)
              const isMyS       = mySide === side
              return (
                <div key={side} onClick={() => send({ type: 'pick_side', side })} style={{
                  flex: 1, padding: 14, borderRadius: 16, cursor: 'pointer', textAlign: 'center',
                  border: `3px solid ${isMyS ? myInfo.color : '#e2e8f0'}`,
                  background: isMyS ? myInfo.light : '#fff',
                  transition: 'all 0.15s',
                }}>
                  <div style={{ fontSize: 26 }}>{side === 'left' ? '⬅️' : '➡️'}</div>
                  <div style={{ fontWeight: 900, fontSize: 14, color: '#1e1b4b', marginTop: 4 }}>{side === 'left' ? 'Left' : 'Right'} Team</div>
                  <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center', minHeight: 28 }}>
                    {sidePlayers.map((n, i) => (
                      <span key={n} style={{ fontSize: 20 }}>{safe(players, n, si + i).emoji}</span>
                    ))}
                    {sidePlayers.length === 0 && <span style={{ fontSize: 11, color: '#94a3b8' }}>empty</span>}
                  </div>
                </div>
              )
            })}
          </div>

          {canStart ? (
            <button onClick={() => send({ type: 'start' })} style={{ padding: 14, borderRadius: 16, border: 'none', background: myInfo.color, color: '#fff', fontSize: 18, fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit', boxShadow: `0 4px 20px ${myInfo.color}55` }}>
              💪 Start Pulling!
            </button>
          ) : (
            <div style={{ textAlign: 'center', fontSize: 13, color: '#94a3b8', fontWeight: 700 }}>
              Need at least 1 player on each side
            </div>
          )}
        </div>
      )}

      {/* Tap area */}
      {phase === 'playing' && (
        <div style={{ width: '100%', maxWidth: 460, padding: '0 16px' }}>
          <TapArea color={myInfo.color} side={mySide} taps={myTaps} onTap={sendTap} />
        </div>
      )}

      {/* Result */}
      {phase === 'result' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 56 }}>{iWon ? '🏆' : isDraw ? '🤝' : '😅'}</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: iWon ? myInfo.color : isDraw ? '#64748b' : '#ef4444' }}>
            {iWon ? 'Your team wins!' : isDraw ? "It's a draw!" : 'Your team lost!'}
          </div>
          <div style={{ fontSize: 13, color: '#64748b', fontWeight: 700 }}>
            Left: {taps.left} taps &nbsp;·&nbsp; Right: {taps.right} taps
          </div>
          <button onClick={() => { prevPhase.current = null; send({ type: 'reset' }) }} style={{ padding: '14px 36px', borderRadius: 16, border: 'none', color: '#fff', background: myInfo.color, fontSize: 18, fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit' }}>
            🔄 Play Again
          </button>
        </div>
      )}
    </div>
  )
}