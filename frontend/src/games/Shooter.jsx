import { useState, useEffect, useRef, useCallback } from 'react'
import { playSound } from '../sounds'
import { vibrate, VIBRATIONS } from '../vibrate'

const WS_PROTOCOL = location.protocol === 'https:' ? 'wss' : 'ws'
const WS_URL      = `${WS_PROTOCOL}://${location.host}/api/shooter/ws`

const PLAYERS = {
  Ariel: { color: '#16a34a', light: '#dcfce7', bg: '#f0fdf4', emoji: '🦁' },
  Ella:  { color: '#db2777', light: '#fce7f3', bg: '#fdf2f8', emoji: '🦋' },
}

function BulletBar({ count, max, color }) {
  return (
    <div style={{ display: 'flex', gap: 3, justifyContent: 'center', flexWrap: 'wrap' }}>
      {Array(max).fill(null).map((_, i) => (
        <div key={i} style={{
          width: 14, height: 22, borderRadius: 3,
          background: i < count ? color : '#e2e8f0',
          transition: 'background 0.2s',
          fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {i < count ? '🔫' : ''}
        </div>
      ))}
    </div>
  )
}

export default function Shooter({ player, onBack }) {
  const [state, setState]       = useState(null)
  const [status, setStatus]     = useState('Connecting...')
  const [feedback, setFeedback] = useState(null)
  const [figureAnim, setFigureAnim] = useState(false)
  const wsRef                   = useRef(null)
  const prevFigure              = useRef(null)
  const prevPhase               = useRef(null)
  const feedbackTimer           = useRef(null)
  const figureRef               = useRef(null)

  const p     = PLAYERS[player]
  const other = player === 'Ariel' ? 'Ella' : 'Ariel'
  const op    = PLAYERS[other]

  const showFeedback = (text, color) => {
    clearTimeout(feedbackTimer.current)
    setFeedback({ text, color, key: Date.now() })
    feedbackTimer.current = setTimeout(() => setFeedback(null), 900)
  }

  const connect = useCallback(() => {
    const ws = new WebSocket(`${WS_URL}/${player}`)
    wsRef.current = ws

    ws.onopen = () => setStatus(`Waiting for ${other}...`)

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data)
      setState(data)

      if (data.figure && data.figure !== prevFigure.current) {
        setFigureAnim(false)
        setTimeout(() => setFigureAnim(true), 20)
        prevFigure.current = data.figure
      }
      if (!data.figure) prevFigure.current = null

      if (data.last_shot) {
        const shot = data.last_shot
        if (shot.player === player) {
          if (shot.result === 'hit') {
            showFeedback(`🎯 +${shot.points}`, '#16a34a')
            playSound('win')
            vibrate([30, 20, 60])
          } else if (shot.result === 'wrong') {
            showFeedback(`❌ ${shot.points} ${shot.emoji}`, '#ef4444')
            playSound('lose')
            vibrate([100, 50, 100])
          } else {
            showFeedback('💨 Miss!', '#94a3b8')
            vibrate(20)
          }
        }
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
      else if (data.phase === 'playing') {
        const remaining = data.bullets?.[player] ?? 0
        if (remaining === 0)          setStatus('Out of bullets! 🚫')
        else if (data.figure?.shoot)  setStatus('🦹 VILLAIN! Tap it!')
        else if (data.figure)         setStatus("🐾 DON'T tap!")
        else                          setStatus('👀 Wait for it...')
      }
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

  const shoot = () => {
    if (state?.phase !== 'playing') return
    if ((state?.bullets?.[player] ?? 0) <= 0) return
    vibrate(VIBRATIONS.tap)
    wsRef.current?.send(JSON.stringify({ type: 'shoot' }))
  }

  const sendReset = () => {
    prevPhase.current  = null
    prevFigure.current = null
    setFeedback(null)
    wsRef.current?.send(JSON.stringify({ type: 'reset' }))
  }

  const phase      = state?.phase
  const myBullets  = state?.bullets?.[player]  ?? 8
  const oppBullets = state?.bullets?.[other]   ?? 8
  const myScore    = state?.scores?.[player]   ?? 0
  const otherScore = state?.scores?.[other]    ?? 0
  const myHits     = state?.hits?.[player]     ?? 0
  const oppHits    = state?.hits?.[other]      ?? 0
  const figure     = state?.figure
  const bothHere   = state?.connected?.length === 2
  const myWon      = phase === 'result' && myScore > otherScore
  const oppWon     = phase === 'result' && otherScore > myScore
  const canShoot   = phase === 'playing' && myBullets > 0
  const figNum     = Math.min((state?.figures_done ?? 0) + (figure ? 1 : 0), state?.total ?? 20)

  return (
    <div style={{ ...s.wrap, background: p.bg }}>
      <style>{`
        @keyframes feedbackPop {
          0%   { opacity: 1; transform: translateY(0) scale(1.2); }
          100% { opacity: 0; transform: translateY(-70px) scale(0.8); }
        }
        @keyframes figPop {
          from { transform: scale(0.2); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }
        @keyframes figShake {
          0%,100% { transform: translateX(0); }
          25%     { transform: translateX(-6px); }
          75%     { transform: translateX(6px); }
        }
      `}</style>

      <div style={s.header}>
        <button onClick={onBack} style={{ ...s.backBtn, color: p.color }}>← Back</button>
        <div style={s.title}>🔫 Quick Shot!</div>
        <div style={{ width: 64 }} />
      </div>

      {/* Scores */}
      <div style={s.scoreBar}>
        <div style={{ ...s.scoreCard, borderColor: p.color, background: p.light }}>
          <span>{p.emoji}</span>
          <span style={{ fontWeight: 900, color: p.color, fontSize: 22 }}>{myScore}</span>
        </div>
        <div style={{ textAlign: 'center', minWidth: 56 }}>
          <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>ROUND</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#1e1b4b', fontFamily: 'monospace' }}>
            {figNum}/{state?.total ?? 20}
          </div>
        </div>
        <div style={{ ...s.scoreCard, borderColor: op.color, background: op.light }}>
          <span style={{ fontWeight: 900, color: op.color, fontSize: 22 }}>{otherScore}</span>
          <span>{op.emoji}</span>
        </div>
      </div>

      {/* Status */}
      <div style={{
        ...s.status,
        background: figure?.shoot ? '#fef9c3' : figure ? '#fee2e2' : myWon ? p.light : oppWon ? op.light : '#f1f5f9',
        color:      figure?.shoot ? '#92400e' : figure ? '#dc2626' : myWon ? p.color : oppWon ? op.color : '#64748b',
        fontSize:   figure ? 17 : 14,
      }}>
        {status}
      </div>

      {!bothHere && (
        <div style={s.waiting}>
          <div style={{ ...s.waitingDot, background: p.color }} />
          Waiting for {other} to join...
        </div>
      )}

      {/* Game area */}
      {bothHere && phase !== 'result' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, width: '100%', maxWidth: 400, padding: '0 20px' }}>

          {/* Countdown */}
          {phase === 'countdown' && state?.countdown !== null && (
            <div style={{ fontSize: 88, fontWeight: 900, color: p.color, lineHeight: 1, animation: 'figPop 0.3s ease' }}>
              {state.countdown === 0 ? 'GO!' : state.countdown}
            </div>
          )}

          {/* Figure arena */}
          {(phase === 'playing' || phase === 'countdown') && (
            <div style={{
              width: '100%', height: 280,
              background: '#fff',
              borderRadius: 24,
              border: `3px solid ${figure?.shoot ? '#eab308' : figure ? '#ef4444' : '#e2e8f0'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: figure ? `0 6px 24px ${figure.shoot ? '#eab30844' : '#ef444422'}` : '0 2px 12px #0001',
              transition: 'border-color 0.2s, box-shadow 0.2s',
              position: 'relative', overflow: 'hidden',
            }}>
              {/* The tappable figure */}
              {figure && (
                <div
                  ref={figureRef}
                  onClick={canShoot ? shoot : undefined}
                  onTouchStart={canShoot ? (e) => { e.preventDefault(); shoot() } : undefined}
                  style={{
                    fontSize: 72,
                    lineHeight: 1,
                    cursor: canShoot ? 'pointer' : 'default',
                    animation: figureAnim ? 'figPop 0.25s cubic-bezier(0.34,1.56,0.64,1)' : 'none',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    touchAction: 'manipulation',
                    padding: 16,          // larger tap target around emoji
                    borderRadius: 20,
                    background: canShoot ? (figure.shoot ? '#fef9c333' : '#fee2e222') : 'transparent',
                    border: canShoot ? `2px dashed ${figure.shoot ? '#eab308' : '#fca5a5'}` : '2px dashed transparent',
                    transition: 'background 0.15s',
                  }}
                >
                  {figure.emoji}
                </div>
              )}

              {/* Empty arena hint */}
              {!figure && phase === 'playing' && (
                <div style={{ fontSize: 40, color: '#e2e8f0' }}>👁️</div>
              )}

              {/* Feedback float */}
              {feedback && (
                <div key={feedback.key} style={{
                  position: 'absolute', top: '30%',
                  fontSize: 32, fontWeight: 900,
                  color: feedback.color,
                  animation: 'feedbackPop 0.9s ease forwards',
                  pointerEvents: 'none',
                  textShadow: '0 2px 6px #0002',
                }}>
                  {feedback.text}
                </div>
              )}
            </div>
          )}

          {/* Bullet bars */}
          {phase === 'playing' && (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: p.color, minWidth: 52 }}>{p.emoji} You</span>
                <BulletBar count={myBullets} max={state?.max_bullets ?? 8} color={p.color} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: op.color, minWidth: 52 }}>{op.emoji} {other}</span>
                <BulletBar count={oppBullets} max={state?.max_bullets ?? 8} color={op.color} />
              </div>
            </div>
          )}

          {/* Legend */}
          {phase === 'playing' && (
            <div style={{ display: 'flex', gap: 16, fontSize: 12, fontWeight: 700 }}>
              <span style={{ color: '#92400e' }}>🦹🧟👺 Tap! +1</span>
              <span style={{ color: '#dc2626' }}>🐶🐱 Skip! -1</span>
            </div>
          )}
        </div>
      )}

      {/* Result */}
      {phase === 'result' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, width: '100%', maxWidth: 400, padding: '0 20px' }}>
          <div style={{ fontSize: 56 }}>{myWon ? p.emoji : oppWon ? op.emoji : '🤝'}</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: myWon ? p.color : oppWon ? op.color : '#64748b' }}>
            {myWon ? 'You win!' : oppWon ? `${other} wins!` : "It's a draw!"}
          </div>

          <div style={{ width: '100%', background: '#fff', borderRadius: 20, padding: 18, display: 'flex', flexDirection: 'column', gap: 10, boxShadow: '0 4px 16px #0001' }}>
            {[
              { label: 'Score',        me: myScore,                        opp: otherScore },
              { label: 'Villains hit', me: myHits,                         opp: oppHits    },
              { label: 'Wrong shots',  me: state?.wastes?.[player] ?? 0,   opp: state?.wastes?.[other] ?? 0 },
              { label: 'Bullets left', me: myBullets,                      opp: oppBullets },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 900, color: p.color, minWidth: 28, textAlign: 'right', fontSize: 16 }}>{row.me}</span>
                <span style={{ flex: 1, textAlign: 'center', fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>{row.label}</span>
                <span style={{ fontWeight: 900, color: op.color, minWidth: 28, fontSize: 16 }}>{row.opp}</span>
              </div>
            ))}
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
  wrap:       { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: 32, gap: 12 },
  header:     { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', background: '#ffffffcc', backdropFilter: 'blur(8px)', boxShadow: '0 1px 0 #e2e8f0' },
  backBtn:    { background: 'none', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', padding: '6px 12px', borderRadius: 10, fontFamily: 'inherit' },
  title:      { fontSize: 18, fontWeight: 900, color: '#1e1b4b' },
  scoreBar:   { display: 'flex', alignItems: 'center', gap: 12, width: '100%', maxWidth: 400, padding: '0 16px' },
  scoreCard:  { display: 'flex', alignItems: 'center', gap: 8, border: '2px solid', borderRadius: 14, padding: '8px 14px', flex: 1, justifyContent: 'center' },
  status:     { padding: '10px 24px', borderRadius: 12, fontWeight: 800, textAlign: 'center', minWidth: 240, maxWidth: 380, transition: 'all 0.2s' },
  bigBtn:     { padding: '14px 36px', borderRadius: 16, border: 'none', color: '#fff', fontSize: 18, fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 16px #0002' },
  waiting:    { display: 'flex', alignItems: 'center', gap: 10, color: '#94a3b8', fontWeight: 700, fontSize: 15 },
  waitingDot: { width: 10, height: 10, borderRadius: '50%', animation: 'pulse 1.5s ease-in-out infinite' },
}