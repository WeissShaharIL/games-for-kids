import { useState, useEffect, useRef } from 'react'
import { playSound } from '../sounds'
import { vibrate, VIBRATIONS } from '../vibrate'
import { getPlayer, getOther } from '../playerUtils'

const WS_PROTOCOL = location.protocol === 'https:' ? 'wss' : 'ws'
const WS_URL      = `${WS_PROTOCOL}://${location.host}/api/shooter/ws`

function BulletBar({ count, max, color }) {
  return (
    <div style={{ display: 'flex', gap: 3, justifyContent: 'center', flexWrap: 'wrap' }}>
      {Array(max).fill(null).map((_, i) => (
        <div key={i} style={{ width: 14, height: 22, borderRadius: 3, background: i < count ? color : '#e2e8f0', transition: 'background 0.2s', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {i < count ? '🔫' : ''}
        </div>
      ))}
    </div>
  )
}

export default function Shooter({ player, players, onBack }) {
  const [state, setState]           = useState(null)
  const [status, setStatus]         = useState('Connecting...')
  const [feedback, setFeedback]     = useState(null)
  const [figureAnim, setFigureAnim] = useState(false)
  const wsRef                       = useRef(null)
  const mountedRef                  = useRef(true)
  const prevFigure                  = useRef(null)
  const prevPhase                   = useRef(null)
  const feedbackTimer               = useRef(null)
  const shootCooldown               = useRef(false)

  const p     = getPlayer(players, player, 0)

  // Get opponent from connected players (dynamic, not hardcoded)
  const connected = state?.connected || []
  const other     = connected.find(n => n !== player) || null
  const op        = other ? getPlayer(players, other, 1) : null


  const showFeedback = (text, color) => {
    clearTimeout(feedbackTimer.current)
    setFeedback({ text, color, key: Date.now() })
    feedbackTimer.current = setTimeout(() => { if (mountedRef.current) setFeedback(null) }, 900)
  }

  useEffect(() => {
    mountedRef.current = true
    const ws = new WebSocket(`${WS_URL}/${player}`)
    wsRef.current = ws

    ws.onopen = () => { if (!mountedRef.current) return; setStatus(`Waiting for opponent...`) }
    ws.onmessage = (e) => {
      if (!mountedRef.current) return
      const data = JSON.parse(e.data)
      setState(data)

      if (data.figure && data.figure !== prevFigure.current) {
        setFigureAnim(false)
        setTimeout(() => { if (mountedRef.current) setFigureAnim(true) }, 20)
        prevFigure.current = data.figure
      }
      if (!data.figure) prevFigure.current = null

      if (data.last_shot?.player === player) {
        const shot = data.last_shot
        if (shot.result === 'hit')   { showFeedback(`🎯 +${shot.points}`, '#16a34a'); playSound('win');  vibrate([30,20,60]) }
        else if (shot.result === 'wrong') { showFeedback(`❌ ${shot.points} ${shot.emoji}`, '#ef4444'); playSound('lose'); vibrate([100,50,100]) }
        else                         { showFeedback('💨 Miss!', '#94a3b8'); vibrate(20) }
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
      else if (data.connected?.length < 2) setStatus(`Waiting for opponent...`)
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
    ws.onclose = () => { if (!mountedRef.current) return; setStatus('Reconnecting...') }
    ws.onerror = () => ws.close()
    return () => { mountedRef.current = false; clearTimeout(feedbackTimer.current); ws.close() }
  }, [player])

  const shoot = () => {
    if (state?.phase !== 'playing') return
    if ((state?.bullets?.[player] ?? 0) <= 0) return
    if (shootCooldown.current) return
    shootCooldown.current = true
    setTimeout(() => { shootCooldown.current = false }, 200)
    vibrate(VIBRATIONS.tap); playSound('shoot')
    wsRef.current?.send(JSON.stringify({ type: 'shoot' }))
  }

  const sendReset = () => { prevPhase.current = null; prevFigure.current = null; setFeedback(null); wsRef.current?.send(JSON.stringify({ type: 'reset' })) }

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
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: 32, gap: 12, background: p.bg }}>
      <style>{`@keyframes feedbackPop{0%{opacity:1;transform:translateY(0) scale(1.2)}100%{opacity:0;transform:translateY(-70px) scale(0.8)}}@keyframes figPop{from{transform:scale(0.2);opacity:0}to{transform:scale(1);opacity:1}}`}</style>
      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', background: '#ffffffcc', backdropFilter: 'blur(8px)', boxShadow: '0 1px 0 #e2e8f0' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', color: p.color, fontFamily: 'inherit' }}>← Back</button>
        <div style={{ fontSize: 18, fontWeight: 900, color: '#1e1b4b' }}>🔫 Quick Shot!</div>
        <div style={{ width: 64 }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', maxWidth: 400, padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: `2px solid ${p.color}`, borderRadius: 14, padding: '8px 14px', flex: 1, justifyContent: 'center', background: p.light }}>
          <span>{p.emoji}</span><span style={{ fontWeight: 900, color: p.color, fontSize: 22 }}>{myScore}</span>
        </div>
        <div style={{ textAlign: 'center', minWidth: 56 }}>
          <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>ROUND</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#1e1b4b', fontFamily: 'monospace' }}>{figNum}/{state?.total ?? 20}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: `2px solid ${op.color}`, borderRadius: 14, padding: '8px 14px', flex: 1, justifyContent: 'center', background: op.light }}>
          <span style={{ fontWeight: 900, color: op.color, fontSize: 22 }}>{otherScore}</span><span>{op.emoji}</span>
        </div>
      </div>

      <div style={{ padding: '10px 24px', borderRadius: 12, fontWeight: 800, textAlign: 'center', minWidth: 240, maxWidth: 380,
        background: figure?.shoot ? '#fef9c3' : figure ? '#fee2e2' : myWon ? p.light : oppWon ? op.light : '#f1f5f9',
        color:      figure?.shoot ? '#92400e'  : figure ? '#dc2626' : myWon ? p.color : oppWon ? op.color : '#64748b',
        fontSize: figure ? 17 : 14 }}>
        {status}
      </div>

      {!bothHere && <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#94a3b8', fontWeight: 700 }}><div style={{ width: 10, height: 10, borderRadius: '50%', background: p.color, animation: 'pulse 1.5s ease-in-out infinite' }} />Waiting for opponent...</div>}

      {bothHere && phase !== 'result' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, width: '100%', maxWidth: 400, padding: '0 20px' }}>
          {phase === 'countdown' && state?.countdown !== null && (
            <div style={{ fontSize: 88, fontWeight: 900, color: p.color, lineHeight: 1, animation: 'figPop 0.3s ease' }}>
              {state.countdown === 0 ? 'GO!' : state.countdown}
            </div>
          )}
          {(phase === 'playing' || phase === 'countdown') && (
            <div style={{ width: '100%', height: 280, background: '#fff', borderRadius: 24, border: `3px solid ${figure?.shoot ? '#eab308' : figure ? '#ef4444' : '#e2e8f0'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: figure ? `0 6px 24px ${figure.shoot ? '#eab30844' : '#ef444422'}` : '0 2px 12px #0001', position: 'relative', overflow: 'hidden' }}>
              {figure && (
                <div onPointerDown={canShoot ? (e) => { e.preventDefault(); shoot() } : undefined}
                  style={{ fontSize: 72, lineHeight: 1, cursor: canShoot ? 'pointer' : 'default', animation: figureAnim ? 'figPop 0.25s cubic-bezier(0.34,1.56,0.64,1)' : 'none', userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none', padding: 16, borderRadius: 20,
                    background: canShoot ? (figure.shoot ? '#fef9c333' : '#fee2e222') : 'transparent',
                    border: canShoot ? `2px dashed ${figure.shoot ? '#eab308' : '#fca5a5'}` : '2px dashed transparent' }}>
                  {figure.emoji}
                </div>
              )}
              {!figure && phase === 'playing' && <div style={{ fontSize: 40, color: '#e2e8f0' }}>👁️</div>}
              {feedback && <div key={feedback.key} style={{ position: 'absolute', top: '30%', fontSize: 32, fontWeight: 900, color: feedback.color, animation: 'feedbackPop 0.9s ease forwards', pointerEvents: 'none' }}>{feedback.text}</div>}
            </div>
          )}
          {phase === 'playing' && (
            <>
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 11, fontWeight: 800, color: p.color, minWidth: 52 }}>{p.emoji} You</span><BulletBar count={myBullets} max={state?.max_bullets ?? 8} color={p.color} /></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 11, fontWeight: 800, color: op.color, minWidth: 52 }}>{op.emoji} {other}</span><BulletBar count={oppBullets} max={state?.max_bullets ?? 8} color={op.color} /></div>
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 12, fontWeight: 700 }}>
                <span style={{ color: '#92400e' }}>🦹🧟👺 Tap! +1</span>
                <span style={{ color: '#dc2626' }}>🐶🐱 Skip! -1</span>
              </div>
            </>
          )}
        </div>
      )}

      {phase === 'result' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, width: '100%', maxWidth: 400, padding: '0 20px' }}>
          <div style={{ fontSize: 56 }}>{myWon ? p.emoji : oppWon ? op.emoji : '🤝'}</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: myWon ? p.color : oppWon ? op.color : '#64748b' }}>{myWon ? 'You win!' : oppWon ? `${other} wins!` : "It's a draw!"}</div>
          <div style={{ width: '100%', background: '#fff', borderRadius: 20, padding: 18, display: 'flex', flexDirection: 'column', gap: 10, boxShadow: '0 4px 16px #0001' }}>
            {[{label:'Score',me:myScore,opp:otherScore},{label:'Villains hit',me:myHits,opp:oppHits},{label:'Wrong shots',me:state?.wastes?.[player]??0,opp:state?.wastes?.[other]??0},{label:'Bullets left',me:myBullets,opp:oppBullets}].map(row => (
              <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 900, color: p.color, minWidth: 28, textAlign: 'right', fontSize: 16 }}>{row.me}</span>
                <span style={{ flex: 1, textAlign: 'center', fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>{row.label}</span>
                <span style={{ fontWeight: 900, color: op.color, minWidth: 28, fontSize: 16 }}>{row.opp}</span>
              </div>
            ))}
          </div>
          <button onClick={sendReset} style={{ padding: '14px 36px', borderRadius: 16, border: 'none', color: '#fff', background: p.color, fontSize: 18, fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit' }}>🔄 Play Again</button>
        </div>
      )}
    </div>
  )
}