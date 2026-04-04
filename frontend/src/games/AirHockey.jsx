import { useState, useEffect, useRef, useCallback } from 'react'
import { playSound } from '../sounds'
import { vibrate, VIBRATIONS } from '../vibrate'

const WS_PROTOCOL = location.protocol === 'https:' ? 'wss' : 'ws'
const WS_URL      = `${WS_PROTOCOL}://${location.host}/api/airhockey/ws`

const PLAYERS = {
  Ariel: { color: '#16a34a', light: '#dcfce7', bg: '#f0fdf4', emoji: '🦁' },
  Ella:  { color: '#db2777', light: '#fce7f3', bg: '#fdf2f8', emoji: '🦋' },
}

export default function AirHockey({ player, onBack }) {
  const [state, setState]   = useState(null)
  const [status, setStatus] = useState('Connecting...')
  const canvasRef           = useRef(null)
  const wsRef               = useRef(null)
  const mountedRef          = useRef(true)
  const stateRef            = useRef(null)
  const animRef             = useRef(null)
  const prevGoal            = useRef(null)
  const prevPhase           = useRef(null)
  const scaleRef            = useRef(1)
  const offsetRef           = useRef({ ox: 0, oy: 0 })

  const p     = PLAYERS[player]
  const other = player === 'Ariel' ? 'Ella' : 'Ariel'
  const op    = PLAYERS[other]

  // Ella sees the board flipped — she's always at the bottom
  const flipped = player === 'Ella'

  useEffect(() => { stateRef.current = state }, [state])

  useEffect(() => {
    mountedRef.current = true
    const ws = new WebSocket(`${WS_URL}/${player}`)
    wsRef.current = ws

    ws.onopen = () => { if (!mountedRef.current) return; setStatus(`Waiting for ${other}...`) }

    ws.onmessage = (e) => {
      if (!mountedRef.current) return
      const data = JSON.parse(e.data)
      setState(data)

      if (data.last_goal && data.last_goal !== prevGoal.current) {
        prevGoal.current = data.last_goal
        if (data.last_goal === player) { playSound('win');   vibrate([30, 20, 80]) }
        else                           { playSound('error'); vibrate([100])         }
      }
      if (!data.last_goal) prevGoal.current = null

      if (data.phase !== prevPhase.current) {
        if (data.phase === 'countdown') playSound('rematch')
        if (data.phase === 'result') {
          const myS  = data.scores?.[player] ?? 0
          const oppS = data.scores?.[other]  ?? 0
          if (myS > oppS)      { playSound('win');  vibrate(VIBRATIONS.win)  }
          else if (myS < oppS) { playSound('lose'); vibrate(VIBRATIONS.lose) }
          else                 { playSound('draw'); vibrate(VIBRATIONS.draw) }
        }
        prevPhase.current = data.phase
      }

      if (data.message)                    setStatus(data.message)
      else if (data.connected?.length < 2) setStatus(`Waiting for ${other}...`)
      else if (data.phase === 'countdown') setStatus(data.countdown > 0 ? `${data.countdown}...` : 'GO!')
      else if (data.phase === 'playing')   setStatus('')
      else if (data.phase === 'result') {
        const myS  = data.scores?.[player] ?? 0
        const oppS = data.scores?.[other]  ?? 0
        setStatus(myS > oppS ? '🎉 You win!' : oppS > myS ? `${op.emoji} ${other} wins!` : '🤝 Draw!')
      }
    }

    ws.onclose = () => { if (!mountedRef.current) return; setStatus('Reconnecting...') }
    ws.onerror = () => ws.close()

    return () => {
      mountedRef.current = false
      ws.close()
      cancelAnimationFrame(animRef.current)
    }
  }, [player])

  // ── Render ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const render = () => {
      if (!mountedRef.current) return
      const s  = stateRef.current
      const CW = canvas.width
      const CH = canvas.height

      if (!s?.board) {
        ctx.fillStyle = '#0f3460'
        ctx.fillRect(0, 0, CW, CH)
        animRef.current = requestAnimationFrame(render)
        return
      }

      const bw = s.board.w
      const bh = s.board.h
      const sc = Math.min(CW / bw, CH / bh)
      scaleRef.current = sc

      const ox = (CW - bw * sc) / 2
      const oy = (CH - bh * sc) / 2
      offsetRef.current = { ox, oy }

      // Convert logical → canvas coords with optional flip
      const sx = (lx) => ox + lx * sc
      const sy = (ly) => flipped
        ? oy + (bh - ly) * sc   // flip Y for Ella
        : oy + ly * sc

      const sr = (r) => r * sc

      ctx.clearRect(0, 0, CW, CH)

      // Background
      ctx.fillStyle = '#0f3460'
      ctx.fillRect(0, 0, CW, CH)

      // Table surface
      const tableGrad = ctx.createLinearGradient(sx(0), sy(0), sx(bw), sy(bh))
      tableGrad.addColorStop(0,   '#1a4a7a')
      tableGrad.addColorStop(0.5, '#1e5490')
      tableGrad.addColorStop(1,   '#1a4a7a')
      ctx.fillStyle = tableGrad
      ctx.beginPath()
      ctx.roundRect(Math.min(sx(0), sx(bw)), Math.min(sy(0), sy(bh)), bw*sc, bh*sc, sr(12))
      ctx.fill()

      // Center line
      ctx.strokeStyle = '#ffffff33'
      ctx.lineWidth   = 2
      ctx.setLineDash([8, 6])
      ctx.beginPath()
      ctx.moveTo(sx(0), sy(bh/2))
      ctx.lineTo(sx(bw), sy(bh/2))
      ctx.stroke()
      ctx.setLineDash([])

      // Center circle
      ctx.strokeStyle = '#ffffff22'
      ctx.lineWidth   = 2
      ctx.beginPath()
      ctx.arc(sx(bw/2), sy(bh/2), sr(55), 0, Math.PI*2)
      ctx.stroke()

      // Goals
      const gw  = s.board.goal_w
      const gy  = s.board.goal_y
      const gx  = bw/2 - gw/2

      // From THIS player's perspective:
      // - MY goal is at the BOTTOM of the screen (opponent scores here)
      // - OPPONENT'S goal is at the TOP of the screen (I score here)
      // Ariel: my goal = bottom (y=H), opponent goal = top (y=0)
      // Ella:  my goal = bottom visually = top logically (y=0), opponent goal = top visually = bottom logically (y=H)

      const myGoalLogicalY    = flipped ? 0    : bh   // Ella's logical top, Ariel's logical bottom
      const oppGoalLogicalY   = flipped ? bh   : 0

      // My goal (bottom of screen for me)
      const myGoalScreenY     = sy(myGoalLogicalY)
      const oppGoalScreenY    = sy(oppGoalLogicalY)

      // Draw my goal zone (bottom) — opponent scores here
      ctx.fillStyle   = op.color + '55'
      ctx.strokeStyle = op.color
      ctx.lineWidth   = 3
      const myGoalTop    = Math.min(myGoalScreenY, myGoalScreenY - sr(gy))
      const oppGoalTop   = Math.min(oppGoalScreenY, oppGoalScreenY + sr(gy))

      // Simpler: just draw rect from edge
      // My goal at bottom of canvas
      ctx.fillStyle = op.color + '44'
      ctx.fillRect(sx(gx), CH - sr(gy), gw*sc, sr(gy))
      ctx.strokeStyle = op.color
      ctx.strokeRect(sx(gx), CH - sr(gy), gw*sc, sr(gy))

      // Opponent goal at top of canvas
      ctx.fillStyle = p.color + '44'
      ctx.fillRect(sx(gx), oy, gw*sc, sr(gy))
      ctx.strokeStyle = p.color
      ctx.strokeRect(sx(gx), oy, gw*sc, sr(gy))

      // Goal labels
      ctx.font      = `bold ${sr(13)}px Nunito, sans-serif`
      ctx.textAlign = 'center'
      // Top = opponent's goal (I score here)
      ctx.fillStyle = p.color
      ctx.fillText(`↑ ${other}'s goal`, sx(bw/2), oy + sr(gy) * 0.7)
      // Bottom = my goal (opponent scores here)
      ctx.fillStyle = op.color
      ctx.fillText(`↓ Your goal`, sx(bw/2), CH - oy - sr(gy) * 0.15)

      // Mallets — draw with flipped coordinates
      Object.entries(s.mallets || {}).forEach(([name, m]) => {
        const mp = PLAYERS[name]
        if (!mp) return
        const mx = sx(m.x)
        const my = sy(m.y)
        const mr = sr(s.board.mallet_r)

        ctx.save()
        ctx.shadowColor = '#000a'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4

        ctx.beginPath()
        ctx.arc(mx, my, mr, 0, Math.PI*2)
        ctx.fillStyle = mp.color
        ctx.fill()

        ctx.beginPath()
        ctx.arc(mx, my, mr * 0.55, 0, Math.PI*2)
        ctx.fillStyle = '#fff'
        ctx.fill()

        ctx.beginPath()
        ctx.arc(mx, my, mr * 0.18, 0, Math.PI*2)
        ctx.fillStyle = mp.color
        ctx.fill()

        ctx.restore()

        // Label
        ctx.font      = `${sr(14)}px sans-serif`
        ctx.textAlign = 'center'
        ctx.fillText(mp.emoji + (name === player ? ' (you)' : ''), mx, my + mr + sr(16))
      })

      // Puck
      if (s.puck) {
        const px = sx(s.puck.x)
        const py = sy(s.puck.y)
        const pr = sr(s.board.puck_r)

        ctx.save()
        ctx.shadowColor = '#000c'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 3
        ctx.beginPath()
        ctx.arc(px, py, pr, 0, Math.PI*2)
        ctx.fillStyle = '#111'
        ctx.fill()
        ctx.restore()

        ctx.beginPath()
        ctx.arc(px - pr*0.25, py - pr*0.25, pr*0.3, 0, Math.PI*2)
        ctx.fillStyle = '#ffffff33'
        ctx.fill()
      }

      // Countdown overlay
      if (s.countdown !== null && s.countdown !== undefined && s.phase === 'countdown') {
        ctx.fillStyle = 'rgba(0,0,0,0.5)'
        ctx.fillRect(0, 0, CW, CH)
        ctx.font      = `900 ${CW * 0.22}px Nunito, sans-serif`
        ctx.textAlign = 'center'
        ctx.fillStyle = s.countdown === 0 ? '#fbbf24' : '#fff'
        ctx.shadowColor = '#000'; ctx.shadowBlur = 20
        ctx.fillText(s.countdown === 0 ? 'GO!' : String(s.countdown), CW/2, CH/2 + CW*0.08)
        ctx.shadowBlur = 0
      }

      // Waiting overlay
      if (!s || s.connected?.length < 2) {
        ctx.fillStyle = 'rgba(0,0,0,0.4)'
        ctx.fillRect(0, 0, CW, CH)
        ctx.font      = `bold ${CW*0.05}px Nunito, sans-serif`
        ctx.textAlign = 'center'
        ctx.fillStyle = '#fff'
        ctx.fillText(`Waiting for ${other}...`, CW/2, CH/2)
      }

      animRef.current = requestAnimationFrame(render)
    }

    animRef.current = requestAnimationFrame(render)
    return () => cancelAnimationFrame(animRef.current)
  }, [player, flipped])

  // ── Touch/mouse control ───────────────────────────────────────────────────
  const sendMallet = useCallback((clientX, clientY) => {
    const canvas = canvasRef.current
    const s      = stateRef.current
    if (!canvas || !s?.board) return

    const rect = canvas.getBoundingClientRect()
    const sc   = scaleRef.current
    const { ox, oy } = offsetRef.current
    const bw   = s.board.w
    const bh   = s.board.h

    const cssX = clientX - rect.left
    const cssY = clientY - rect.top

    // CSS → logical, accounting for flip
    const lx = (cssX - ox) / sc
    const ly = flipped
      ? bh - (cssY - oy) / sc
      : (cssY - oy) / sc

    if (stateRef.current?.phase !== 'playing') return
    wsRef.current?.send(JSON.stringify({ type: 'mallet', x: lx, y: ly }))
  }, [flipped])

  const onTouchMove = (e) => { e.preventDefault(); sendMallet(e.touches[0].clientX, e.touches[0].clientY) }
  const onMouseMove = (e) => { if (e.buttons !== 1) return; sendMallet(e.clientX, e.clientY) }

  const sendReset = () => {
    prevGoal.current  = null
    prevPhase.current = null
    wsRef.current?.send(JSON.stringify({ type: 'reset' }))
  }

  const phase      = state?.phase
  const myScore    = state?.scores?.[player]  ?? 0
  const otherScore = state?.scores?.[other]   ?? 0
  const myWon      = phase === 'result' && myScore > otherScore
  const oppWon     = phase === 'result' && otherScore > myScore

  const canvasW = Math.min(window.innerWidth, 420)
  const canvasH = Math.round(canvasW * (700 / 400))

  return (
    <div style={{ ...s.wrap, background: p.bg }}>
      <div style={s.header}>
        <button onClick={onBack} style={{ ...s.backBtn, color: p.color }}>← Back</button>
        <div style={s.title}>🏒 Air Hockey</div>
        <div style={{ width: 64 }} />
      </div>

      <div style={s.scoreBar}>
        <div style={{ ...s.scoreCard, borderColor: p.color, background: p.light }}>
          <span style={{ fontSize: 20 }}>{p.emoji}</span>
          <span style={{ fontWeight: 900, color: p.color, fontSize: 28 }}>{myScore}</span>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>FIRST TO</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#1e1b4b' }}>{state?.win_score ?? 5}</div>
        </div>
        <div style={{ ...s.scoreCard, borderColor: op.color, background: op.light }}>
          <span style={{ fontWeight: 900, color: op.color, fontSize: 28 }}>{otherScore}</span>
          <span style={{ fontSize: 20 }}>{op.emoji}</span>
        </div>
      </div>

      {status !== '' && (
        <div style={{ ...s.status, background: myWon ? p.light : oppWon ? op.light : '#f1f5f9', color: myWon ? p.color : oppWon ? op.color : '#64748b' }}>
          {status}
        </div>
      )}

      <div style={{ borderRadius: 12, overflow: 'hidden', boxShadow: '0 8px 32px #0004', touchAction: 'none' }}>
        <canvas
          ref={canvasRef}
          width={canvasW}
          height={canvasH}
          style={{ display: 'block', touchAction: 'none' }}
          onTouchMove={onTouchMove}
          onMouseMove={onMouseMove}
        />
      </div>

      {phase === 'playing' && (
        <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, textAlign: 'center' }}>
          Drag your finger on your half to move your mallet
        </div>
      )}

      {phase === 'result' && (
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 48 }}>{myWon ? p.emoji : oppWon ? op.emoji : '🤝'}</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: myWon ? p.color : oppWon ? op.color : '#64748b' }}>
            {myWon ? 'You win!' : oppWon ? `${other} wins!` : "It's a draw!"}
          </div>
          <div style={{ fontSize: 14, color: '#94a3b8', fontWeight: 700 }}>{myScore} – {otherScore}</div>
          <button onClick={sendReset} style={{ ...s.bigBtn, background: p.color }}>🔄 Play Again</button>
        </div>
      )}
    </div>
  )
}

const s = {
  wrap:      { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: 20, gap: 10 },
  header:    { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', background: '#ffffffcc', backdropFilter: 'blur(8px)', boxShadow: '0 1px 0 #e2e8f0' },
  backBtn:   { background: 'none', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', padding: '6px 12px', borderRadius: 10, fontFamily: 'inherit' },
  title:     { fontSize: 18, fontWeight: 900, color: '#1e1b4b' },
  scoreBar:  { display: 'flex', alignItems: 'center', gap: 12, width: '100%', maxWidth: 420, padding: '0 16px' },
  scoreCard: { display: 'flex', alignItems: 'center', gap: 10, border: '2px solid', borderRadius: 14, padding: '8px 16px', flex: 1, justifyContent: 'center' },
  status:    { padding: '8px 20px', borderRadius: 12, fontSize: 14, fontWeight: 800, textAlign: 'center', minWidth: 200, maxWidth: 380, transition: 'all 0.3s' },
  bigBtn:    { padding: '14px 36px', borderRadius: 16, border: 'none', color: '#fff', fontSize: 18, fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 16px #0002' },
}