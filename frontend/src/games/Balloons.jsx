import { useEffect, useRef, useState, useCallback } from 'react'
import { playSound } from '../sounds'
import { vibrate, VIBRATIONS } from '../vibrate'
import { getPlayer } from '../playerUtils'

const WS_PROTOCOL = location.protocol === 'https:' ? 'wss' : 'ws'
const WS_URL      = `${WS_PROTOCOL}://${location.host}/api/balloons/ws`

const BALLOON_COLORS = {
  gold:  { fill: '#f59e0b', stroke: '#d97706', shine: '#fef3c7', label: '🥇 +2' },
  white: { fill: '#f1f5f9', stroke: '#cbd5e1', shine: '#ffffff', label: '⚪ +1' },
  black: { fill: '#1e293b', stroke: '#0f172a', shine: '#334155', label: '🖤 -2' },
}

let popAnims = []
function addPopAnim(x, y, type) {
  const c = BALLOON_COLORS[type]
  popAnims.push({ x, y, label: c.label, color: c.fill, born: Date.now(), id: Math.random() })
  if (popAnims.length > 20) popAnims = popAnims.slice(-20)
}

export default function Balloons({ player, players, onBack }) {
  const [state, setState]   = useState(null)
  const [status, setStatus] = useState('Connecting...')
  const canvasRef           = useRef(null)
  const wsRef               = useRef(null)
  const animFrameRef        = useRef(null)
  const stateRef            = useRef(null)
  const prevPhase           = useRef(null)
  const mountedRef          = useRef(true)

  const me = getPlayer(players, player, 0)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => { stateRef.current = state }, [state])

  const connect = useCallback(() => {
    const ws = new WebSocket(`${WS_URL}/${player}`)
    wsRef.current = ws

    ws.onopen = () => {
      if (mountedRef.current) setStatus('In lobby...')
    }

    ws.onmessage = (e) => {
      if (!mountedRef.current) return
      const data = JSON.parse(e.data)
      setState(data)

      if (data.pops?.length) {
        data.pops.forEach(pop => {
          addPopAnim(pop.x, pop.y, pop.type)
          if (pop.player === player) {
            vibrate(VIBRATIONS.tap)
            if (pop.points > 0) playSound('place')
            else                playSound('error')
          }
        })
      }

      if (data.phase !== prevPhase.current) {
        if (data.phase === 'countdown') playSound('rematch')
        if (data.phase === 'result') {
          const scores  = data.scores || {}
          const sorted  = Object.entries(scores).sort((a, b) => b[1] - a[1])
          const winner  = sorted[0]?.[0]
          if (winner === player) playSound('win')
          else                   playSound('lose')
        }
        prevPhase.current = data.phase
      }

      if (data.disconnected) {
        setStatus(`${data.disconnected} disconnected`)
        setTimeout(() => { if (mountedRef.current) setStatus('') }, 3000)
      }
    }

    ws.onclose = () => {
      if (!mountedRef.current) return
      setStatus('Disconnected. Reconnecting...')
      setTimeout(() => { if (mountedRef.current) connect() }, 2000)
    }

    ws.onerror = () => ws.close()
  }, [player])

  useEffect(() => {
    connect()
    return () => {
      wsRef.current?.close()
      cancelAnimationFrame(animFrameRef.current)
    }
  }, [connect])

  // Canvas render loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    function drawBalloon(b) {
      const { fill, stroke, shine } = BALLOON_COLORS[b.type] || BALLOON_COLORS.white
      const r = 28

      // Shadow
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,0.2)'
      ctx.shadowBlur  = 8
      ctx.shadowOffsetY = 4

      // Body
      ctx.beginPath()
      ctx.ellipse(b.x, b.y, r, r * 1.25, 0, 0, Math.PI * 2)
      ctx.fillStyle = fill
      ctx.fill()
      ctx.strokeStyle = stroke
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.restore()

      // Shine
      ctx.beginPath()
      ctx.ellipse(b.x - r * 0.3, b.y - r * 0.4, r * 0.25, r * 0.35, -0.5, 0, Math.PI * 2)
      ctx.fillStyle = shine + 'cc'
      ctx.fill()

      // Knot
      ctx.beginPath()
      ctx.arc(b.x, b.y + r * 1.25, 4, 0, Math.PI * 2)
      ctx.fillStyle = stroke
      ctx.fill()

      // String
      ctx.beginPath()
      ctx.moveTo(b.x, b.y + r * 1.25 + 4)
      ctx.lineTo(b.x + 8, b.y + r * 1.25 + 28)
      ctx.strokeStyle = '#94a3b8'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    function drawPopAnims(now) {
      popAnims = popAnims.filter(a => now - a.born < 800)
      for (const a of popAnims) {
        const t   = (now - a.born) / 800
        const y   = a.y - t * 60
        const alpha = 1 - t
        ctx.font      = `bold ${18 + t * 10}px sans-serif`
        ctx.fillStyle = a.color + Math.floor(alpha * 255).toString(16).padStart(2, '0')
        ctx.textAlign = 'center'
        ctx.fillText(a.label, a.x, y)
      }
    }

    function render() {
      if (!mountedRef.current) return
      animFrameRef.current = requestAnimationFrame(render)
      const s = stateRef.current
      if (!s || s.phase !== 'playing') return

      const W = canvas.width
      const H = canvas.height

      // Background gradient
      const grad = ctx.createLinearGradient(0, 0, 0, H)
      grad.addColorStop(0, '#e0f2fe')
      grad.addColorStop(1, '#f0fdf4')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)

      // Clouds (simple)
      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      ;[[60, 80, 50], [200, 50, 40], [320, 100, 35]].forEach(([x, y, r]) => {
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.arc(x + r * 0.6, y + 5, r * 0.8, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.arc(x - r * 0.6, y + 5, r * 0.7, 0, Math.PI * 2)
        ctx.fill()
      })

      s.balloons.forEach(drawBalloon)
      drawPopAnims(Date.now())
    }

    animFrameRef.current = requestAnimationFrame(render)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [])

  const send = (msg) => wsRef.current?.readyState === 1 && wsRef.current.send(JSON.stringify(msg))

  const handleTap = (e) => {
    if (state?.phase !== 'playing') return
    e.preventDefault()
    const canvas = canvasRef.current
    const rect   = canvas.getBoundingClientRect()
    const scaleX = canvas.width  / rect.width
    const scaleY = canvas.height / rect.height
    const touch  = e.changedTouches?.[0] || e
    const x = (touch.clientX - rect.left) * scaleX
    const y = (touch.clientY - rect.top)  * scaleY
    send({ type: 'pop', x, y })
  }

  if (!state) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: me?.bg || '#f0fdf4' }}>
        <div style={{ fontSize: 48 }}>🎈</div>
        <div style={{ marginTop: 16, color: '#64748b' }}>{status}</div>
      </div>
    )
  }

  const { phase, scores = {}, countdown, time_left, players: connectedPlayers = [], host } = state
  const isHost = player === host

  // Sort players by score descending
  const scoreboard = [...connectedPlayers].sort((a, b) => (scores[b] || 0) - (scores[a] || 0))

  // ── LOBBY ──────────────────────────────────────────────────────────────────
  if (phase === 'lobby') {
    return (
      <div style={{
        minHeight: '100vh', background: me?.bg || '#f0fdf4',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: 24, fontFamily: 'sans-serif'
      }}>
        <button onClick={onBack} style={{
          position: 'absolute', top: 16, left: 16,
          background: 'none', border: 'none', fontSize: 28, cursor: 'pointer'
        }}>←</button>

        <div style={{ fontSize: 64, marginBottom: 8 }}>🎈</div>
        <h2 style={{ margin: '0 0 4px', fontSize: 26, color: '#1e293b' }}>Pop Balloons</h2>
        <p style={{ margin: '0 0 32px', color: '#64748b', fontSize: 14 }}>
          {connectedPlayers.length} / 4 players in lobby
        </p>

        {/* Player pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginBottom: 32 }}>
          {connectedPlayers.map(p => {
            const pi = getPlayer(players, p, 0)
            return (
              <div key={p} style={{
                background: pi?.color || '#64748b', color: '#fff',
                borderRadius: 20, padding: '8px 18px', fontWeight: 'bold', fontSize: 15,
                display: 'flex', alignItems: 'center', gap: 6
              }}>
                <span>{pi?.emoji || '🎮'}</span>
                <span>{p}</span>
                {p === host && <span style={{ fontSize: 12, opacity: 0.8 }}>(host)</span>}
              </div>
            )
          })}
          {Array.from({ length: Math.max(0, 2 - connectedPlayers.length) }).map((_, i) => (
            <div key={i} style={{
              background: '#e2e8f0', color: '#94a3b8',
              borderRadius: 20, padding: '8px 18px', fontSize: 15
            }}>Waiting...</div>
          ))}
        </div>

        {isHost ? (
          <button
            onClick={() => send({ type: 'start' })}
            disabled={connectedPlayers.length < 2}
            style={{
              background: connectedPlayers.length >= 2 ? (me?.color || '#16a34a') : '#cbd5e1',
              color: '#fff', border: 'none', borderRadius: 16,
              padding: '16px 40px', fontSize: 20, fontWeight: 'bold',
              cursor: connectedPlayers.length >= 2 ? 'pointer' : 'not-allowed',
              boxShadow: connectedPlayers.length >= 2 ? '0 4px 16px rgba(0,0,0,0.15)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            {connectedPlayers.length < 2 ? 'Waiting for players...' : '🎈 Start Game!'}
          </button>
        ) : (
          <div style={{ color: '#64748b', fontSize: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div>
            Waiting for <strong>{host}</strong> to start...
          </div>
        )}

        {status ? <div style={{ marginTop: 20, color: '#ef4444', fontSize: 14 }}>{status}</div> : null}
      </div>
    )
  }

  // ── COUNTDOWN ──────────────────────────────────────────────────────────────
  if (phase === 'countdown') {
    return (
      <div style={{
        minHeight: '100vh', background: me?.bg || '#f0fdf4',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', fontFamily: 'sans-serif'
      }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🎈</div>
        <div style={{ fontSize: 100, fontWeight: 'bold', color: me?.color || '#16a34a', lineHeight: 1 }}>
          {countdown}
        </div>
        <div style={{ marginTop: 16, color: '#64748b', fontSize: 18 }}>Get ready!</div>
      </div>
    )
  }

  // ── RESULT ─────────────────────────────────────────────────────────────────
  if (phase === 'result') {
    const winner = scoreboard[0]
    const iWon   = winner === player
    return (
      <div style={{
        minHeight: '100vh', background: me?.bg || '#f0fdf4',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: 24, fontFamily: 'sans-serif'
      }}>
        <div style={{ fontSize: 64 }}>{iWon ? '🏆' : '🎈'}</div>
        <h2 style={{ fontSize: 28, margin: '12px 0 4px', color: '#1e293b' }}>
          {iWon ? 'You Won!' : `${winner} Wins!`}
        </h2>

        <div style={{ width: '100%', maxWidth: 320, marginTop: 24 }}>
          {scoreboard.map((p, i) => {
            const pi = getPlayer(players, p, i)
            return (
              <div key={p} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: p === player ? (pi?.light || '#dcfce7') : '#fff',
                border: `2px solid ${pi?.color || '#64748b'}`,
                borderRadius: 12, padding: '10px 16px', marginBottom: 8,
                fontWeight: p === winner ? 'bold' : 'normal'
              }}>
                <span style={{ fontSize: 22 }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                <span style={{ color: pi?.color || '#1e293b', fontSize: 16 }}>
                  {pi?.emoji} {p}
                </span>
                <span style={{ fontSize: 20, fontWeight: 'bold', color: '#1e293b' }}>
                  {scores[p] ?? 0} pts
                </span>
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 28 }}>
          <button onClick={onBack} style={{
            background: '#e2e8f0', border: 'none', borderRadius: 12,
            padding: '12px 24px', fontSize: 16, cursor: 'pointer'
          }}>← Back</button>
          <button onClick={() => send({ type: 'reset' })} style={{
            background: me?.color || '#16a34a', color: '#fff', border: 'none',
            borderRadius: 12, padding: '12px 24px', fontSize: 16,
            fontWeight: 'bold', cursor: 'pointer'
          }}>🔄 Play Again</button>
        </div>
      </div>
    )
  }

  // ── PLAYING ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh', background: me?.bg || '#f0fdf4',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      fontFamily: 'sans-serif', userSelect: 'none'
    }}>
      {/* Header scoreboard */}
      <div style={{
        width: '100%', maxWidth: 400,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 16px', background: 'rgba(255,255,255,0.85)',
        borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap', gap: 4
      }}>
        {connectedPlayers.map(p => {
          const pi = getPlayer(players, p, 0)
          return (
            <div key={p} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: p === player ? (pi?.light || '#dcfce7') : 'transparent',
              borderRadius: 8, padding: '2px 8px'
            }}>
              <span style={{ fontSize: 18 }}>{pi?.emoji || '🎮'}</span>
              <span style={{ fontWeight: 'bold', color: pi?.color || '#1e293b', fontSize: 14 }}>{p}</span>
              <span style={{ fontWeight: 'bold', color: '#1e293b', fontSize: 16 }}>{scores[p] ?? 0}</span>
            </div>
          )
        })}
        <div style={{ fontWeight: 'bold', color: '#ef4444', fontSize: 18, marginLeft: 'auto' }}>
          ⏱ {time_left}s
        </div>
      </div>

      {status ? (
        <div style={{ background: '#fef2f2', color: '#ef4444', fontSize: 13, padding: '4px 16px', width: '100%', textAlign: 'center' }}>
          {status}
        </div>
      ) : null}

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={390}
        height={600}
        style={{ touchAction: 'none', maxWidth: '100%', display: 'block', cursor: 'pointer' }}
        onPointerDown={handleTap}
      />
    </div>
  )
}