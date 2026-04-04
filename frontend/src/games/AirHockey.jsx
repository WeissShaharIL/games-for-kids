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

  const p     = PLAYERS[player]
  const other = player === 'Ariel' ? 'Ella' : 'Ariel'
  const op    = PLAYERS[other]

  useEffect(() => { stateRef.current = state }, [state])

  // ── WebSocket ─────────────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true
    const ws = new WebSocket(`${WS_URL}/${player}`)
    wsRef.current = ws

    ws.onopen = () => { if (!mountedRef.current) return; setStatus(`Waiting for ${other}...`) }

    ws.onmessage = (e) => {
      if (!mountedRef.current) return
      const data = JSON.parse(e.data)
      setState(data)

      // Goal sound + vibration
      if (data.last_goal && data.last_goal !== prevGoal.current) {
        prevGoal.current = data.last_goal
        if (data.last_goal === player) {
          playSound('win'); vibrate([30, 20, 80])
        } else {
          playSound('error'); vibrate([100])
        }
      }
      if (!data.last_goal) prevGoal.current = null

      // Phase transitions
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
        setStatus(myS > oppS ? '🎉 You win!' : oppS > myS ? `${op.emoji} ${other} wins!` : "🤝 Draw!")
      }
    }

    ws.onclose = () => { if (!mountedRef.current) return; setStatus('Reconnecting...') }
    ws.onerror = () => ws.close()

    return () => { mountedRef.current = false; ws.close(); cancelAnimationFrame(animRef.current) }
  }, [player])

  // ── Canvas render loop ────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const render = () => {
      if (!mountedRef.current) return
      const s = stateRef.current
      const W = canvas.width
      const H = canvas.height

      if (!s?.board) {
        ctx.fillStyle = '#1e3a5f'
        ctx.fillRect(0, 0, W, H)
        animRef.current = requestAnimationFrame(render)
        return
      }

      const bw   = s.board.w
      const bh   = s.board.h
      const sc   = Math.min(W / bw, H / bh)
      scaleRef.current = sc
      const ox   = (W - bw * sc) / 2
      const oy   = (H - bh * sc) / 2

      const sx = (lx) => ox + lx * sc
      const sy = (ly) => oy + ly * sc
      const sr = (r)  => r * sc

      // Background
      ctx.fillStyle = '#0f3460'
      ctx.fillRect(0, 0, W, H)

      // Table surface
      const tableGrad = ctx.createLinearGradient(sx(0), sy(0), sx(bw), sy(bh))
      tableGrad.addColorStop(0,   '#1a4a7a')
      tableGrad.addColorStop(0.5, '#1e5490')
      tableGrad.addColorStop(1,   '#1a4a7a')
      ctx.fillStyle = tableGrad
      ctx.beginPath()
      ctx.roundRect(sx(0), sy(0), bw*sc, bh*sc, sr(12))
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
      const gw = s.board.goal_w
      const gy = s.board.goal_y
      const gx = bw/2 - gw/2

      // Ella's goal (top) — Ariel scores here
      ctx.fillStyle = PLAYERS.Ariel.color + '55'
      ctx.fillRect(sx(gx), sy(0), gw*sc, gy*sc)
      ctx.strokeStyle = PLAYERS.Ariel.color
      ctx.lineWidth   = 3
      ctx.strokeRect(sx(gx), sy(0), gw*sc, gy*sc)

      // Ariel's goal (bottom) — Ella scores here
      ctx.fillStyle = PLAYERS.Ella.color + '55'
      ctx.fillRect(sx(gx), sy(bh - gy), gw*sc, gy*sc)
      ctx.strokeStyle = PLAYERS.Ella.color
      ctx.lineWidth   = 3
      ctx.strokeRect(sx(gx), sy(bh - gy), gw*sc, gy*sc)

      // Goal labels
      ctx.font      = `bold ${sr(14)}px Nunito, sans-serif`
      ctx.textAlign = 'center'
      ctx.fillStyle = PLAYERS.Ariel.color
      ctx.fillText('⬇ ARIEL', sx(bw/2), sy(gy * 0.65))
      ctx.fillStyle = PLAYERS.Ella.color
      ctx.fillText('⬆ ELLA', sx(bw/2), sy(bh - gy * 0.2))

      // Player zone hint lines
      ctx.strokeStyle = player === 'Ariel' ? p.color + '33' : op.color + '33'
      ctx.lineWidth   = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(sx(0), sy(bh/2))
      ctx.lineTo(sx(bw), sy(bh/2))
      ctx.stroke()
      ctx.setLineDash([])

      // Mallets
      Object.entries(s.mallets || {}).forEach(([name, m]) => {
        const mp = PLAYERS[name]
        if (!mp) return
        const mx = sx(m.x)
        const my = sy(m.y)
        const mr = sr(s.board.mallet_r)

        // Shadow
        ctx.save()
        ctx.shadowColor  = '#000a'
        ctx.shadowBlur   = 10
        ctx.shadowOffsetY = 4

        // Outer ring
        ctx.beginPath()
        ctx.arc(mx, my, mr, 0, Math.PI*2)
        ctx.fillStyle = mp.color
        ctx.fill()

        // Inner circle
        ctx.beginPath()
        ctx.arc(mx, my, mr * 0.55, 0, Math.PI*2)
        ctx.fillStyle = '#fff'
        ctx.fill()

        // Center dot
        ctx.beginPath()
        ctx.arc(mx, my, mr * 0.18, 0, Math.PI*2)
        ctx.fillStyle = mp.color
        ctx.fill()

        ctx.restore()

        // Player emoji label
        ctx.font      = `${sr(16)}px sans-serif`
        ctx.textAlign = 'center'
        ctx.fillText(mp.emoji, mx, my + mr + sr(18))
      })

      // Puck
      if (s.puck) {
        const px = sx(s.puck.x)
        const py = sy(s.puck.y)
        const pr = sr(s.board.puck_r)

        ctx.save()
        ctx.shadowColor  = '#000c'
        ctx.shadowBlur   = 12
        ctx.shadowOffsetY = 3

        // Puck body
        ctx.beginPath()
        ctx.arc(px, py, pr, 0, Math.PI*2)
        ctx.fillStyle = '#111'
        ctx.fill()

        ctx.restore()

        // Shine
        ctx.beginPath()
        ctx.arc(px - pr*0.25, py - pr*0.25, pr*0.3, 0, Math.PI*2)
        ctx.fillStyle = '#ffffff33'
        ctx.fill()
      }

      // Countdown overlay
      if (s.countdown !== null && s.countdown !== undefined && s.phase === 'countdown') {
        ctx.fillStyle = 'rgba(0,0,0,0.5)'
        ctx.fillRect(0, 0, W, H)
        ctx.font      = `900 ${W * 0.22}px Nunito, sans-serif`
        ctx.textAlign = 'center'
        ctx.fillStyle = s.countdown === 0 ? '#fbbf24' : '#fff'
        ctx.shadowColor = '#000'; ctx.shadowBlur = 20
        ctx.fillText(s.countdown === 0 ? 'GO!' : String(s.countdown), W/2, H/2 + W*0.08)
        ctx.shadowBlur = 0
      }

      // Waiting overlay
      if (!s || s.connected?.length < 2) {
        ctx.fillStyle = 'rgba(0,0,0,0.4)'
        ctx.fillRect(0, 0, W, H)
        ctx.font      = `bold ${W*0.05}px Nunito, sans-serif`
        ctx.textAlign = 'center'
        ctx.fillStyle = '#fff'
        ctx.fillText(`Waiting for ${other}...`, W/2, H/2)
      }

      // Goal flash
      if (s.last_goal && s.phase === 'playing') {
        const scorer = PLAYERS[s.last_goal]
        ctx.fillStyle = scorer ? scorer.color + '33' : '#ffffff22'
        ctx.fillRect(0, 0, W, H)
      }

      animRef.current = requestAnimationFrame(render)
    }

    animRef.current = requestAnimationFrame(render)
    return () => cancelAnimationFrame(animRef.current)
  }, [player])

  // ── Touch/mouse mallet control ────────────────────────────────────────────
  const sendMallet = useCallback((clientX, clientY) => {
    const canvas = canvasRef.current
    const s      = stateRef.current
    if (!canvas || !s?.board) return

    const rect = canvas.getBoundingClientRect()
    const sc   = scaleRef.current
    const bw   = s.board.w
    const bh   = s.board.h
    const ox   = (canvas.width  - bw * sc) / 2
    const oy   = (canvas.height - bh * sc) / 2

    // CSS px → logical coords
    const cssScale = canvas.width / rect.width
    const lx = ((clientX - rect.left) * cssScale - ox) / sc
    const ly = ((clientY - rect.top)  * cssScale - oy) / sc

    if (stateRef.current?.phase !== 'playing') return
    wsRef.current?.send(JSON.stringify({ type: 'mallet', x: lx, y: ly }))
  }, [])

  const onTouchMove = (e) => {
    e.preventDefault()
    const t = e.touches[0]
    sendMallet(t.clientX, t.clientY)
  }

  const onMouseMove = (e) => {
    if (e.buttons !== 1) return
    sendMallet(e.clientX, e.clientY)
  }

  const sendReset = () => {
    prevGoal.current  = null
    prevPhase.current = null
    wsRef.current?.send(JSON.stringify({ type: 'reset' }))
  }

  const phase      = state?.phase
  const myScore    = state?.scores?.[player]  ?? 0
  const otherScore = state?.scores?.[other]   ?? 0
  const bothHere   = state?.connected?.length === 2
  const myWon      = phase === 'result' && myScore > otherScore
  const oppWon     = phase === 'result' && otherScore > myScore

  // Canvas size — fill screen width, aspect ratio of board (400x700)
  const canvasW = Math.min(window.innerWidth - 0, 420)
  const canvasH = Math.round(canvasW * (700 / 400))

  return (
    <div style={{ ...s.wrap, background: p.bg }}>
      <div style={s.header}>
        <button onClick={onBack} style={{ ...s.backBtn, color: p.color }}>← Back</button>
        <div style={s.title}>🏒 Air Hockey</div>
        <div style={{ width: 64 }} />
      </div>

      {/* Score bar */}
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

      {/* Status */}
      {status !== '' && (
        <div style={{
          ...s.status,
          background: myWon ? p.light : oppWon ? op.light : '#f1f5f9',
          color:      myWon ? p.color : oppWon ? op.color : '#64748b',
        }}>
          {status}
        </div>
      )}

      {/* Canvas */}
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

      {/* Hint */}
      {bothHere && phase === 'playing' && (
        <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, textAlign: 'center' }}>
          Drag your finger on your half to move your mallet
        </div>
      )}

      {/* Result */}
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
  wrap:       { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: 20, gap: 10 },
  header:     { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', background: '#ffffffcc', backdropFilter: 'blur(8px)', boxShadow: '0 1px 0 #e2e8f0' },
  backBtn:    { background: 'none', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', padding: '6px 12px', borderRadius: 10, fontFamily: 'inherit' },
  title:      { fontSize: 18, fontWeight: 900, color: '#1e1b4b' },
  scoreBar:   { display: 'flex', alignItems: 'center', gap: 12, width: '100%', maxWidth: 420, padding: '0 16px' },
  scoreCard:  { display: 'flex', alignItems: 'center', gap: 10, border: '2px solid', borderRadius: 14, padding: '8px 16px', flex: 1, justifyContent: 'center' },
  status:     { padding: '8px 20px', borderRadius: 12, fontSize: 14, fontWeight: 800, textAlign: 'center', minWidth: 200, maxWidth: 380, transition: 'all 0.3s' },
  bigBtn:     { padding: '14px 36px', borderRadius: 16, border: 'none', color: '#fff', fontSize: 18, fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 16px #0002' },
}