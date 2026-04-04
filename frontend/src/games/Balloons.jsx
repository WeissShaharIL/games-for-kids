import { useState, useEffect, useRef, useCallback } from 'react'
import { playSound } from '../sounds'
import { vibrate, VIBRATIONS } from '../vibrate'

const WS_PROTOCOL = location.protocol === 'https:' ? 'wss' : 'ws'
const WS_URL      = `${WS_PROTOCOL}://${location.host}/api/balloons/ws`

const BOARD_W = 390
const BOARD_H = 600

const PLAYERS = {
  Ariel: { color: '#16a34a', light: '#dcfce7', bg: '#f0fdf4', emoji: '🦁' },
  Ella:  { color: '#db2777', light: '#fce7f3', bg: '#fdf2f8', emoji: '🦋' },
}

const BALLOON_COLORS = {
  gold:  { fill: '#f59e0b', stroke: '#d97706', shine: '#fef3c7', label: '+2' },
  white: { fill: '#e2e8f0', stroke: '#94a3b8', shine: '#ffffff', label: '+1' },
  black: { fill: '#334155', stroke: '#1e293b', shine: '#64748b', label: '-2' },
}

let popAnims = []

export default function Balloons({ player, onBack }) {
  const [state, setState]   = useState(null)
  const [status, setStatus] = useState('Connecting...')
  const canvasRef           = useRef(null)
  const wsRef               = useRef(null)
  const stateRef            = useRef(null)
  const prevPhase           = useRef(null)
  const animRef             = useRef(null)

  const p     = PLAYERS[player]
  const other = player === 'Ariel' ? 'Ella' : 'Ariel'
  const op    = PLAYERS[other]

  useEffect(() => { stateRef.current = state }, [state])

  // ── WebSocket ─────────────────────────────────────────────────────────────
  const connect = useCallback(() => {
    const ws = new WebSocket(`${WS_URL}/${player}`)
    wsRef.current = ws

    ws.onopen = () => setStatus(`Waiting for ${other}...`)

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data)
      setState(data)

      if (data.pops?.length) {
        data.pops.forEach(pop => {
          popAnims.push({ x: pop.x, y: pop.y, label: BALLOON_COLORS[pop.type]?.label || '', color: BALLOON_COLORS[pop.type]?.fill || '#fff', born: Date.now() })
          if (pop.player === player) {
            vibrate(VIBRATIONS.tap)
            playSound(pop.points > 0 ? 'place' : 'error')
          }
        })
        if (popAnims.length > 30) popAnims = popAnims.slice(-30)
      }

      if (data.phase !== prevPhase.current) {
        if (data.phase === 'countdown') playSound('rematch')
        if (data.phase === 'result') {
          const my  = data.scores?.[player] ?? 0
          const opp = data.scores?.[other]  ?? 0
          if (my > opp)      { playSound('win');  vibrate(VIBRATIONS.win)  }
          else if (my < opp) { playSound('lose'); vibrate(VIBRATIONS.lose) }
          else               { playSound('draw'); vibrate(VIBRATIONS.draw) }
        }
        prevPhase.current = data.phase
      }

      if (data.message)                    setStatus(data.message)
      else if (data.connected?.length < 2) setStatus(`Waiting for ${other}...`)
      else if (data.phase === 'countdown') setStatus('Get ready...')
      else if (data.phase === 'playing')   setStatus('🎈 Pop the balloons!')
      else if (data.phase === 'result') {
        const my  = data.scores?.[player] ?? 0
        const opp = data.scores?.[other]  ?? 0
        if (my > opp)      setStatus('🎉 You win!')
        else if (my < opp) setStatus(`${op.emoji} ${other} wins!`)
        else               setStatus("🤝 It's a draw!")
      }
    }

    ws.onclose = () => { setStatus('Disconnected. Reconnecting...'); setTimeout(connect, 2000) }
    ws.onerror = () => ws.close()
  }, [player])

  useEffect(() => { connect(); return () => wsRef.current?.close() }, [connect])

  // ── Render loop — runs always, canvas always mounted ──────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const render = () => {
      const s = stateRef.current
      const W = canvas.width
      const H = canvas.height

      // Scale: logical BOARD_W x BOARD_H → canvas pixels
      const sx = W / BOARD_W
      const sy = H / BOARD_H
      const sr = Math.min(sx, sy)

      ctx.clearRect(0, 0, W, H)

      // Background
      const bg = ctx.createLinearGradient(0, 0, 0, H)
      bg.addColorStop(0, '#bfdbfe')
      bg.addColorStop(1, '#ddd6fe')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, W, H)

      const balloons = s?.balloons || []
      const radius   = 28 * sr

      balloons.forEach(b => {
        const bx = b.x * sx
        const by = b.y * sy
        const c  = BALLOON_COLORS[b.type]
        if (!c) return

        // Body
        ctx.save()
        ctx.shadowColor   = 'rgba(0,0,0,0.2)'
        ctx.shadowBlur    = 10
        ctx.shadowOffsetY = 4
        ctx.beginPath()
        ctx.ellipse(bx, by, radius * 0.82, radius, 0, 0, 2 * Math.PI)
        ctx.fillStyle   = c.fill
        ctx.fill()
        ctx.strokeStyle = c.stroke
        ctx.lineWidth   = 2
        ctx.stroke()
        ctx.restore()

        // Shine
        ctx.beginPath()
        ctx.ellipse(bx - radius * 0.22, by - radius * 0.28, radius * 0.18, radius * 0.25, -0.4, 0, 2 * Math.PI)
        ctx.fillStyle = c.shine + 'bb'
        ctx.fill()

        // Knot
        ctx.beginPath()
        ctx.arc(bx, by + radius + 3, 4 * sr, 0, 2 * Math.PI)
        ctx.fillStyle = c.stroke
        ctx.fill()

        // String
        ctx.beginPath()
        ctx.moveTo(bx, by + radius + 7 * sr)
        ctx.lineTo(bx + Math.sin(b.tick * 0.1) * 5 * sr, by + radius + 22 * sr)
        ctx.strokeStyle = c.stroke + '99'
        ctx.lineWidth   = 1.5
        ctx.stroke()

        // Symbol
        ctx.font      = `bold ${Math.floor(radius * 0.55)}px sans-serif`
        ctx.textAlign = 'center'
        ctx.fillStyle = b.type === 'gold' ? '#78350f' : b.type === 'black' ? '#e2e8f0' : '#94a3b8'
        ctx.fillText(b.type === 'gold' ? '★' : b.type === 'black' ? '✕' : '·', bx, by + radius * 0.2)
      })

      // Countdown overlay
      if (s?.countdown !== null && s?.countdown !== undefined && s?.phase === 'countdown') {
        ctx.fillStyle = 'rgba(0,0,0,0.45)'
        ctx.fillRect(0, 0, W, H)
        ctx.font        = `900 ${Math.floor(W * 0.25)}px Nunito, sans-serif`
        ctx.textAlign   = 'center'
        ctx.fillStyle   = s.countdown === 0 ? '#fbbf24' : '#fff'
        ctx.shadowColor = '#000'
        ctx.shadowBlur  = 20
        ctx.fillText(s.countdown === 0 ? 'GO!' : String(s.countdown), W / 2, H / 2 + 40)
        ctx.shadowBlur  = 0
      }

      // Waiting overlay
      if (!s || s.connected?.length < 2) {
        ctx.fillStyle = 'rgba(255,255,255,0.6)'
        ctx.fillRect(0, 0, W, H)
        ctx.font      = `bold ${Math.floor(W * 0.06)}px Nunito, sans-serif`
        ctx.textAlign = 'center'
        ctx.fillStyle = '#94a3b8'
        ctx.fillText('Waiting for other player...', W / 2, H / 2)
      }

      // Pop animations
      const now = Date.now()
      popAnims = popAnims.filter(a => now - a.born < 700)
      popAnims.forEach(a => {
        const age = (now - a.born) / 700
        const rise = age * 55
        ctx.globalAlpha = 1 - age
        ctx.font        = `900 ${Math.floor(20 * sr)}px Nunito, sans-serif`
        ctx.textAlign   = 'center'
        ctx.fillStyle   = a.color
        ctx.shadowColor = '#000'
        ctx.shadowBlur  = 6
        ctx.fillText(a.label, a.x * sx, a.y * sy - rise)
        ctx.shadowBlur  = 0
        ctx.globalAlpha = 1
      })

      animRef.current = requestAnimationFrame(render)
    }

    animRef.current = requestAnimationFrame(render)
    return () => cancelAnimationFrame(animRef.current)
  }, [])

  // ── Tap ───────────────────────────────────────────────────────────────────
  const handleTap = (e) => {
    if (stateRef.current?.phase !== 'playing') return
    e.preventDefault()
    const canvas  = canvasRef.current
    if (!canvas) return
    const rect    = canvas.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    // Convert CSS pixels → logical coords
    const cssW = rect.width
    const cssH = rect.height
    const logX = ((clientX - rect.left) / cssW) * BOARD_W
    const logY = ((clientY - rect.top)  / cssH) * BOARD_H
    wsRef.current?.send(JSON.stringify({ type: 'pop', x: logX, y: logY }))
  }

  const sendReset = () => {
    prevPhase.current = null
    popAnims = []
    wsRef.current?.send(JSON.stringify({ type: 'reset' }))
  }

  const phase      = state?.phase
  const myScore    = state?.scores?.[player]  ?? 0
  const otherScore = state?.scores?.[other]   ?? 0
  const timeLeft   = state?.time_left         ?? 30
  const myWon      = phase === 'result' && myScore > otherScore
  const oppWon     = phase === 'result' && otherScore > myScore

  // Canvas dimensions — fixed logical ratio, fit screen width
  const canvasW = Math.min(window.innerWidth - 16, BOARD_W)
  const canvasH = Math.round(canvasW * (BOARD_H / BOARD_W))

  return (
    <div style={{ ...s.wrap, background: p.bg }}>
      <div style={s.header}>
        <button onClick={onBack} style={{ ...s.backBtn, color: p.color }}>← Back</button>
        <div style={s.title}>🎈 Pop Balloons!</div>
        <div style={{ width: 64 }} />
      </div>

      {/* Scores + timer */}
      <div style={s.scoreBar}>
        <div style={{ ...s.scoreCard, borderColor: p.color, background: p.light }}>
          <span style={{ fontSize: 20 }}>{p.emoji}</span>
          <span style={{ fontWeight: 900, color: p.color, fontSize: 24 }}>{myScore}</span>
        </div>
        <div style={{ ...s.timer, color: timeLeft <= 10 ? '#ef4444' : '#1e1b4b' }}>
          {phase === 'playing' || phase === 'countdown' ? `${timeLeft}s` : '🎈'}
        </div>
        <div style={{ ...s.scoreCard, borderColor: op.color, background: op.light }}>
          <span style={{ fontWeight: 900, color: op.color, fontSize: 24 }}>{otherScore}</span>
          <span style={{ fontSize: 20 }}>{op.emoji}</span>
        </div>
      </div>

      {/* Legend */}
      {(phase === 'playing' || phase === 'countdown') && (
        <div style={s.legend}>
          <span style={{ color: '#f59e0b', fontWeight: 800 }}>🟡 +2</span>
          <span style={{ color: '#64748b', fontWeight: 800 }}>⚪ +1</span>
          <span style={{ color: '#334155', fontWeight: 800 }}>⚫ -2</span>
        </div>
      )}

      {/* Status */}
      {phase !== 'playing' && (
        <div style={{ ...s.status, background: myWon ? p.light : oppWon ? op.light : '#f1f5f9', color: myWon ? p.color : oppWon ? op.color : '#64748b' }}>
          {status}
        </div>
      )}

      {/* Canvas — always rendered */}
      <div style={{ borderRadius: 16, overflow: 'hidden', boxShadow: '0 8px 32px #0003' }}>
        <canvas
          ref={canvasRef}
          width={canvasW}
          height={canvasH}
          style={{ display: 'block', touchAction: 'none' }}
          onClick={handleTap}
          onTouchStart={handleTap}
        />
      </div>

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
  wrap:       { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: 24, gap: 10 },
  header:     { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', background: '#ffffffcc', backdropFilter: 'blur(8px)', boxShadow: '0 1px 0 #e2e8f0' },
  backBtn:    { background: 'none', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', padding: '6px 12px', borderRadius: 10, fontFamily: 'inherit' },
  title:      { fontSize: 18, fontWeight: 900, color: '#1e1b4b' },
  scoreBar:   { display: 'flex', alignItems: 'center', gap: 12, width: '100%', maxWidth: 390, padding: '0 16px' },
  scoreCard:  { display: 'flex', alignItems: 'center', gap: 8, border: '2px solid', borderRadius: 14, padding: '8px 16px', flex: 1, justifyContent: 'center' },
  timer:      { fontSize: 28, fontWeight: 900, fontFamily: 'monospace', minWidth: 56, textAlign: 'center', transition: 'color 0.3s' },
  legend:     { display: 'flex', gap: 16, fontSize: 13, fontWeight: 700 },
  status:     { padding: '10px 24px', borderRadius: 12, fontSize: 15, fontWeight: 800, textAlign: 'center', minWidth: 240, maxWidth: 380, transition: 'all 0.3s' },
  bigBtn:     { padding: '14px 36px', borderRadius: 16, border: 'none', color: '#fff', fontSize: 18, fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 16px #0002' },
}