import { useState, useEffect, useRef } from 'react'
import { playSound } from '../sounds'
import { vibrate, VIBRATIONS } from '../vibrate'

const WS_PROTOCOL = location.protocol === 'https:' ? 'wss' : 'ws'
const WS_URL      = `${WS_PROTOCOL}://${location.host}/api/mountain/ws`

const FALLBACK = [
  { color: '#16a34a', light: '#dcfce7', emoji: '🦁' },
  { color: '#db2777', light: '#fce7f3', emoji: '🦋' },
  { color: '#2563eb', light: '#dbeafe', emoji: '🦊' },
  { color: '#d97706', light: '#fef3c7', emoji: '🌸' },
]

// ── 3D Mountain renderer ──────────────────────────────────────────────────────
function drawMountain3D(ctx, W, H, positions, eliminated, player, allPlayers, turnOrder) {
  // ── Sky with gradient + aurora effect ──
  const sky = ctx.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0,    '#06111f')
  sky.addColorStop(0.35, '#0d2137')
  sky.addColorStop(0.65, '#1a3a5c')
  sky.addColorStop(1,    '#2d6a8a')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, H)

  // Aurora bands
  const aurora = ctx.createLinearGradient(0, H * 0.05, W, H * 0.3)
  aurora.addColorStop(0,    '#00ff8844')
  aurora.addColorStop(0.3,  '#00bbff22')
  aurora.addColorStop(0.6,  '#8800ff33')
  aurora.addColorStop(1,    '#00ff8811')
  ctx.fillStyle = aurora
  ctx.beginPath()
  ctx.moveTo(0, H * 0.08)
  for (let x = 0; x <= W; x += W / 20) {
    const y = H * 0.08 + Math.sin(x / W * Math.PI * 3) * H * 0.05
    ctx.lineTo(x, y)
  }
  ctx.lineTo(W, H * 0.25)
  ctx.lineTo(0, H * 0.25)
  ctx.closePath()
  ctx.fill()

  // Stars
  for (let i = 0; i < 80; i++) {
    const sx  = (i * 173.1 + 50) % W
    const sy  = (i * 91.7  + 20) % (H * 0.55)
    const sr  = 0.4 + (i % 4) * 0.3
    const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(i * 0.7))
    ctx.beginPath()
    ctx.arc(sx, sy, sr, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(255,255,255,${twinkle})`
    ctx.fill()
  }

  // Moon
  ctx.save()
  ctx.shadowColor = '#fffde7'; ctx.shadowBlur = 20
  ctx.beginPath()
  ctx.arc(W * 0.82, H * 0.09, W * 0.055, 0, Math.PI * 2)
  ctx.fillStyle = '#fef9c3'
  ctx.fill()
  ctx.restore()
  // Moon crescent
  ctx.beginPath()
  ctx.arc(W * 0.845, H * 0.082, W * 0.047, 0, Math.PI * 2)
  ctx.fillStyle = '#0d2137'
  ctx.fill()

  // ── Background mountains (distant, hazy) ──
  ctx.save()
  ctx.globalAlpha = 0.4
  const bgMtns = [
    [0, H*0.55, W*0.25, H*0.32, W*0.5, H*0.55],
    [W*0.4, H*0.58, W*0.65, H*0.35, W*0.9, H*0.58],
    [W*0.7, H*0.60, W*0.88, H*0.40, W, H*0.60],
  ]
  bgMtns.forEach(pts => {
    ctx.beginPath()
    ctx.moveTo(pts[0], H)
    ctx.lineTo(pts[0], pts[1])
    ctx.lineTo(pts[2], pts[3])
    ctx.lineTo(pts[4], pts[5])
    ctx.lineTo(pts[4], H)
    ctx.closePath()
    const g = ctx.createLinearGradient(0, pts[3], 0, H)
    g.addColorStop(0, '#4a6fa5')
    g.addColorStop(1, '#2a4a6a')
    ctx.fillStyle = g
    ctx.fill()
  })
  ctx.restore()

  // ── Main 3D mountain ──
  // Left face (darker — shadow side)
  ctx.beginPath()
  ctx.moveTo(W * 0.5,  H * 0.12)   // peak
  ctx.lineTo(W * 0.08, H * 0.78)   // bottom left
  ctx.lineTo(W * 0.5,  H * 0.78)   // bottom center
  ctx.closePath()
  const leftFace = ctx.createLinearGradient(W*0.08, H*0.12, W*0.5, H*0.78)
  leftFace.addColorStop(0,   '#b8c8d8')
  leftFace.addColorStop(0.3, '#7a8a9a')
  leftFace.addColorStop(1,   '#3a4a5a')
  ctx.fillStyle = leftFace
  ctx.fill()

  // Right face (lighter — lit side)
  ctx.beginPath()
  ctx.moveTo(W * 0.5,  H * 0.12)   // peak
  ctx.lineTo(W * 0.92, H * 0.78)   // bottom right
  ctx.lineTo(W * 0.5,  H * 0.78)   // bottom center
  ctx.closePath()
  const rightFace = ctx.createLinearGradient(W*0.5, H*0.12, W*0.92, H*0.78)
  rightFace.addColorStop(0,   '#d8e8f0')
  rightFace.addColorStop(0.3, '#9aabb8')
  rightFace.addColorStop(1,   '#5a6a7a')
  ctx.fillStyle = rightFace
  ctx.fill()

  // Ridge line (bright edge between faces)
  const ridgeGrad = ctx.createLinearGradient(W*0.5, H*0.12, W*0.5, H*0.78)
  ridgeGrad.addColorStop(0, '#ffffff')
  ridgeGrad.addColorStop(0.4, '#ccd8e0')
  ridgeGrad.addColorStop(1, '#7a8a9a')
  ctx.beginPath()
  ctx.moveTo(W * 0.5, H * 0.12)
  ctx.lineTo(W * 0.5, H * 0.78)
  ctx.strokeStyle = ridgeGrad
  ctx.lineWidth   = 2
  ctx.stroke()

  // Rock striations on left face
  ctx.save()
  ctx.globalAlpha = 0.15
  ctx.strokeStyle = '#000'
  ctx.lineWidth   = 1
  for (let i = 0; i < 6; i++) {
    const t  = 0.2 + i * 0.13
    const y  = H * (0.12 + t * 0.66)
    const lx = W * (0.5 - t * 0.42)
    ctx.beginPath()
    ctx.moveTo(lx + W*0.02, y)
    ctx.lineTo(W * 0.5 - W*0.01, y + H*0.012)
    ctx.stroke()
  }
  ctx.restore()

  // Rock striations on right face
  ctx.save()
  ctx.globalAlpha = 0.10
  ctx.strokeStyle = '#fff'
  ctx.lineWidth   = 1
  for (let i = 0; i < 6; i++) {
    const t  = 0.2 + i * 0.13
    const y  = H * (0.12 + t * 0.66)
    const rx = W * (0.5 + t * 0.42)
    ctx.beginPath()
    ctx.moveTo(W * 0.5 + W*0.01, y + H*0.008)
    ctx.lineTo(rx - W*0.02, y)
    ctx.stroke()
  }
  ctx.restore()

  // Snow cap — left side
  ctx.beginPath()
  ctx.moveTo(W * 0.5, H * 0.12)
  ctx.lineTo(W * 0.38, H * 0.28)
  ctx.lineTo(W * 0.5, H * 0.28)
  ctx.closePath()
  const snowL = ctx.createLinearGradient(W*0.38, H*0.12, W*0.5, H*0.28)
  snowL.addColorStop(0, '#ffffff')
  snowL.addColorStop(1, '#c8d8e8')
  ctx.fillStyle = snowL
  ctx.fill()

  // Snow cap — right side
  ctx.beginPath()
  ctx.moveTo(W * 0.5, H * 0.12)
  ctx.lineTo(W * 0.62, H * 0.28)
  ctx.lineTo(W * 0.5, H * 0.28)
  ctx.closePath()
  const snowR = ctx.createLinearGradient(W*0.5, H*0.12, W*0.62, H*0.28)
  snowR.addColorStop(0, '#ffffff')
  snowR.addColorStop(1, '#e8f0f8')
  ctx.fillStyle = snowR
  ctx.fill()

  // Snow drips / irregularities
  ctx.beginPath()
  ctx.moveTo(W*0.38, H*0.28)
  ctx.lineTo(W*0.40, H*0.31)
  ctx.lineTo(W*0.43, H*0.285)
  ctx.lineTo(W*0.46, H*0.30)
  ctx.lineTo(W*0.5,  H*0.28)
  ctx.lineTo(W*0.54, H*0.30)
  ctx.lineTo(W*0.57, H*0.285)
  ctx.lineTo(W*0.60, H*0.31)
  ctx.lineTo(W*0.62, H*0.28)
  ctx.fillStyle = '#ffffff'
  ctx.fill()

  // Atmospheric fog at base
  const fog = ctx.createLinearGradient(0, H*0.65, 0, H*0.82)
  fog.addColorStop(0, 'rgba(180,200,220,0)')
  fog.addColorStop(1, 'rgba(180,200,220,0.35)')
  ctx.fillStyle = fog
  ctx.fillRect(0, H*0.65, W, H*0.17)

  // Ground / base
  ctx.beginPath()
  ctx.moveTo(0, H*0.78)
  ctx.lineTo(W, H*0.78)
  ctx.lineTo(W, H)
  ctx.lineTo(0, H)
  ctx.closePath()
  const ground = ctx.createLinearGradient(0, H*0.78, 0, H)
  ground.addColorStop(0, '#2d4a2a')
  ground.addColorStop(0.4, '#1a3a18')
  ground.addColorStop(1, '#0f2010')
  ctx.fillStyle = ground
  ctx.fill()

  // Pine trees at base
  const drawTree = (tx, ty, size) => {
    ctx.save()
    ctx.fillStyle = '#1a3a18'
    for (let tier = 0; tier < 3; tier++) {
      ctx.beginPath()
      const tw = size * (1 - tier * 0.2)
      const th = size * 0.45
      const ty2 = ty - tier * size * 0.3
      ctx.moveTo(tx, ty2 - th)
      ctx.lineTo(tx - tw/2, ty2)
      ctx.lineTo(tx + tw/2, ty2)
      ctx.closePath()
      ctx.fill()
    }
    ctx.fillStyle = '#2d3a1a'
    ctx.fillRect(tx - size*0.06, ty, size*0.12, size*0.2)
    ctx.restore()
  }
  const treePositions = [0.05, 0.12, 0.19, 0.81, 0.88, 0.95]
  treePositions.forEach((tx, i) => {
    const size = 18 + (i % 3) * 6
    drawTree(W * tx, H * 0.80, size)
  })

  // ── Player figures on mountain ──
  const allNames  = turnOrder.length > 0 ? turnOrder : Object.keys(positions)

  // Place players along both faces of mountain
  // Even indices → right face, odd → left face
  const getFacePoint = (pct, faceIdx) => {
    // pct 0=bottom, 100=top
    const t = Math.max(0, Math.min(100, pct)) / 100
    if (faceIdx % 2 === 0) {
      // Right face: from (0.85, 0.76) up to (0.52, 0.14)
      return { x: W * (0.85 - t * 0.33), y: H * (0.76 - t * 0.62) }
    } else {
      // Left face: from (0.15, 0.76) up to (0.48, 0.14)
      return { x: W * (0.15 + t * 0.33), y: H * (0.76 - t * 0.62) }
    }
  }

  // Draw opponents first, then me on top
  const drawOrder = [...allNames.filter(n => n !== player), player]

  drawOrder.forEach(name => {
    const idx    = allNames.indexOf(name)
    const pos    = positions[name] ?? 80
    const isMe   = name === player
    const isElim = eliminated?.includes(name)
    const pt     = getFacePoint(pos, idx)
    const info   = allPlayers[name] || FALLBACK[idx % 4]
    const sz     = Math.floor(W * (isMe ? 0.095 : 0.075))

    ctx.save()
    ctx.globalAlpha = isElim ? 0.35 : 1

    // Glow for active player
    if (isMe) {
      ctx.shadowColor = info.color || '#fff'
      ctx.shadowBlur  = 18
    }

    // Platform under figure
    ctx.beginPath()
    ctx.ellipse(pt.x, pt.y + sz * 0.1, sz * 0.55, sz * 0.15, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#00000033'
    ctx.fill()

    // Emoji
    ctx.font      = `${sz}px sans-serif`
    ctx.textAlign = 'center'
    ctx.shadowColor = '#000'; ctx.shadowBlur = 6
    ctx.fillText(info.emoji || '🎮', pt.x, pt.y)
    ctx.shadowBlur = 0

    // Name tag with background
    const label = isMe ? 'YOU' : name.toUpperCase()
    ctx.font     = `900 ${Math.floor(W * 0.032)}px Nunito, sans-serif`
    const tw     = ctx.measureText(label).width
    ctx.fillStyle = (info.color || '#fff') + 'cc'
    ctx.beginPath()
    ctx.roundRect(pt.x - tw/2 - 4, pt.y - sz * 0.75, tw + 8, Math.floor(W * 0.038), 4)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.fillText(label, pt.x, pt.y - sz * 0.45)

    // Eliminated skull
    if (isElim) {
      ctx.font = `${Math.floor(sz * 0.6)}px sans-serif`
      ctx.fillText('💀', pt.x + sz * 0.45, pt.y - sz * 0.55)
    }

    ctx.restore()
  })
}

export default function Mountain({ player, players: playerConfig, onBack }) {
  const [state, setState]       = useState(null)
  const [status, setStatus]     = useState('Connecting...')
  const [answered, setAnswered] = useState(false)
  const canvasRef               = useRef(null)
  const wsRef                   = useRef(null)
  const mountedRef              = useRef(true)
  const prevPhase               = useRef(null)
  const prevQuestion            = useRef(null)

  const allPlayers = playerConfig || {}
  const myInfo     = allPlayers[player] || FALLBACK[0]
  const p          = { color: myInfo.color, light: myInfo.light, emoji: myInfo.emoji }

  useEffect(() => {
    mountedRef.current = true
    const ws = new WebSocket(`${WS_URL}/${player}`)
    wsRef.current = ws

    ws.onopen = () => { if (!mountedRef.current) return; setStatus('Waiting for players...') }

    ws.onmessage = (e) => {
      if (!mountedRef.current) return
      const data = JSON.parse(e.data)
      setState(data)

      if (data.question?.q !== prevQuestion.current) {
        setAnswered(false)
        prevQuestion.current = data.question?.q
      }

      if (data.last_result) {
        const r = data.last_result
        if (r.player === player) {
          if (r.result === 'correct') { playSound('win');  vibrate(VIBRATIONS.win)  }
          else                        { playSound('lose'); vibrate(VIBRATIONS.lose) }
        } else if (r.slide_who?.includes(player)) {
          playSound('error'); vibrate([80])
        }
      }

      if (data.phase !== prevPhase.current) {
        if (data.phase === 'countdown') playSound('rematch')
        if (data.phase === 'result') {
          if (data.winner === player) { playSound('win');  vibrate(VIBRATIONS.win)  }
          else                        { playSound('lose'); vibrate(VIBRATIONS.lose) }
        }
        prevPhase.current = data.phase
      }

      const connected = data.connected || []
      const minP      = data.min_players || 2
      if (data.message)                    setStatus(data.message)
      else if (connected.length < minP)    setStatus(`Waiting... (${connected.length}/${minP}+)`)
      else if (data.phase === 'countdown') setStatus(data.countdown > 0 ? `${data.countdown}...` : 'GO!')
      else if (data.phase === 'playing') {
        if (data.whose_turn === player)    setStatus('❓ Your turn!')
        else if (data.whose_turn)          setStatus(`${allPlayers[data.whose_turn]?.emoji || ''} ${data.whose_turn}'s turn...`)
      }
      else if (data.phase === 'result') {
        setStatus(data.winner === player ? '🎉 You win!' : `${allPlayers[data.winner]?.emoji || ''} ${data.winner} wins!`)
      }
    }

    ws.onclose = () => { if (!mountedRef.current) return; setStatus('Reconnecting...') }
    ws.onerror = () => ws.close()
    return () => { mountedRef.current = false; ws.close() }
  }, [player])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !state) return
    const ctx = canvas.getContext('2d')
    drawMountain3D(ctx, canvas.width, canvas.height,
      state.positions || {}, state.eliminated || [],
      player, allPlayers, state.turn_order || [])
  }, [state, player, allPlayers])

  const sendAnswer = (choice) => {
    if (answered) return
    setAnswered(true)
    playSound('place')
    vibrate(VIBRATIONS.tap)
    wsRef.current?.send(JSON.stringify({ type: 'answer', choice }))
  }

  const sendPass = () => {
    if (state?.passed) return  // already passed once
    playSound('error')
    wsRef.current?.send(JSON.stringify({ type: 'pass' }))
  }

  const sendReset = () => {
    prevPhase.current    = null
    prevQuestion.current = null
    setAnswered(false)
    wsRef.current?.send(JSON.stringify({ type: 'reset' }))
  }

  const phase       = state?.phase
  const myTurn      = state?.whose_turn === player && phase === 'playing'
  const question    = state?.question
  const timer       = state?.timer ?? 15
  const passed      = state?.passed      // question already passed once?
  const passer      = state?.passer
  const positions   = state?.positions   || {}
  const eliminated  = state?.eliminated  || []
  const connected   = state?.connected   || []
  const minPlayers  = state?.min_players || 2
  const lastResult  = state?.last_result
  const myWon       = phase === 'result' && state?.winner === player
  const isElim      = eliminated.includes(player)
  const turnOrder   = state?.turn_order  || connected

  const canvasW = Math.min(window.innerWidth, 420)
  const canvasH = Math.round(canvasW * 1.05)

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: 24, gap: 10, background: '#06111f' }}>
      {/* Header */}
      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', background: '#ffffff15', backdropFilter: 'blur(8px)', boxShadow: '0 1px 0 #ffffff11' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', color: p.color, fontFamily: 'inherit' }}>← Back</button>
        <div style={{ fontWeight: 900, color: '#fff', fontSize: 17 }}>🏔️ Mountain Quiz</div>
        <div style={{ width: 64 }} />
      </div>

      {/* Player position bars */}
      <div style={{ display: 'flex', gap: 6, width: '100%', maxWidth: 420, padding: '0 12px', flexWrap: 'wrap' }}>
        {turnOrder.map((name, idx) => {
          const info   = allPlayers[name] || FALLBACK[idx % 4]
          const pos    = positions[name]  ?? 80
          const isElim2 = eliminated.includes(name)
          const isActive = state?.whose_turn === name
          return (
            <div key={name} style={{ flex: 1, minWidth: 80, display: 'flex', alignItems: 'center', gap: 5,
              border: `2px solid ${isActive ? info.color : info.color + '55'}`,
              borderRadius: 10, padding: '4px 8px',
              background: isElim2 ? '#ffffff08' : info.color + '22',
              opacity: isElim2 ? 0.5 : 1 }}>
              <span style={{ fontSize: 13 }}>{info.emoji}</span>
              <div style={{ flex: 1, height: 5, background: '#ffffff22', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pos}%`, background: isElim2 ? '#94a3b8' : info.color, borderRadius: 3, transition: 'width 0.5s' }} />
              </div>
              <span style={{ fontSize: 10, fontWeight: 800, color: isElim2 ? '#94a3b8' : info.color, minWidth: 20 }}>
                {isElim2 ? '💀' : `${pos}%`}
              </span>
            </div>
          )
        })}
      </div>

      {/* Status */}
      <div style={{ padding: '8px 24px', borderRadius: 12, fontSize: 14, fontWeight: 800, textAlign: 'center',
        background: myTurn ? p.color + '33' : myWon ? p.color + '33' : '#ffffff15',
        color: myTurn ? p.color : myWon ? p.color : '#94a3b8',
        border: `1px solid ${myTurn ? p.color + '44' : '#ffffff11'}` }}>
        {status}
      </div>

      {/* Canvas */}
      <div style={{ borderRadius: 16, overflow: 'hidden', boxShadow: '0 8px 40px #000008' }}>
        <canvas ref={canvasRef} width={canvasW} height={canvasH} style={{ display: 'block' }} />
      </div>

      {/* Last result */}
      {lastResult && phase === 'playing' && (
        <div style={{ padding: '8px 20px', borderRadius: 12, fontWeight: 800, fontSize: 13, textAlign: 'center',
          background: lastResult.result === 'correct' ? '#dcfce7' : '#fee2e2',
          color:      lastResult.result === 'correct' ? '#15803d' : '#dc2626' }}>
          {lastResult.result === 'correct'
            ? `✅ ${lastResult.player} correct! Others slide! ⬇️`
            : `❌ ${lastResult.player} wrong! Sliding down... ⬇️`}
        </div>
      )}

      {/* Question area */}
      {phase === 'playing' && question && !isElim && (
        <div style={{ width: '100%', maxWidth: 420, padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {passed && passer && (
            <div style={{ textAlign: 'center', fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>
              {allPlayers[passer]?.emoji} {passer} passed — no more passes allowed!
            </div>
          )}

          {/* Timer */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 5, background: '#ffffff22', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(timer / 15) * 100}%`, background: timer <= 5 ? '#ef4444' : p.color, borderRadius: 3, transition: 'width 1s linear' }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 800, color: timer <= 5 ? '#ef4444' : '#94a3b8', minWidth: 24 }}>{timer}s</span>
          </div>

          {/* Question */}
          <div style={{ background: '#ffffff15', borderRadius: 20, padding: '16px 20px', border: '1px solid #ffffff22', textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#fff', fontFamily: 'monospace' }}>
              {question.q}
            </div>
          </div>

          {myTurn && !answered ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {question.options.map((opt, i) => (
                  <button key={i} onClick={() => sendAnswer(opt)} style={{
                    padding: '16px', borderRadius: 16,
                    border: `2px solid ${p.color}55`,
                    background: p.color + '22', color: '#fff',
                    fontSize: 22, fontWeight: 900, cursor: 'pointer',
                    fontFamily: 'monospace', touchAction: 'manipulation',
                    boxShadow: `0 4px 12px ${p.color}33`,
                  }}>
                    {opt}
                  </button>
                ))}
              </div>
              {!passed && (
                <button onClick={sendPass} style={{ padding: '11px', borderRadius: 14, border: '1px solid #ffffff22', background: '#ffffff11', color: '#94a3b8', fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                  🤷 Pass (once only)
                </button>
              )}
            </>
          ) : myTurn && answered ? (
            <div style={{ textAlign: 'center', padding: 16, color: '#94a3b8', fontWeight: 700 }}>⏳ Waiting for result...</div>
          ) : (
            <div style={{ textAlign: 'center', padding: 12, fontWeight: 800, fontSize: 14,
              color: state?.whose_turn ? (allPlayers[state.whose_turn]?.color || '#94a3b8') : '#94a3b8',
              background: '#ffffff11', borderRadius: 14 }}>
              {state?.whose_turn ? `${allPlayers[state.whose_turn]?.emoji || ''} ${state.whose_turn} is thinking...` : ''}
            </div>
          )}
        </div>
      )}

      {phase === 'playing' && isElim && (
        <div style={{ textAlign: 'center', padding: '16px 24px', background: '#ff000022', borderRadius: 16, color: '#fca5a5', fontWeight: 800, fontSize: 15, border: '1px solid #ff000044' }}>
          💀 You fell off! Watch the others!
        </div>
      )}

      {connected.length < minPlayers && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#94a3b8', fontWeight: 700, fontSize: 14 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, animation: 'pulse 1.5s ease-in-out infinite' }} />
          Waiting for players... ({connected.length}/{minPlayers}+)
        </div>
      )}

      {phase === 'result' && (
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 56 }}>{allPlayers[state?.winner]?.emoji || '🏆'}</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: myWon ? p.color : '#fff' }}>
            {myWon ? 'You win! 🎉' : `${state?.winner} wins!`}
          </div>
          <button onClick={sendReset} style={{ padding: '14px 36px', borderRadius: 16, border: 'none', color: '#fff', background: p.color, fontSize: 18, fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit' }}>
            🔄 Play Again
          </button>
        </div>
      )}
    </div>
  )
}