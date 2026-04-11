import { useState, useRef } from 'react'
import { useGameWS } from '../hooks/useGameWS'
import { playSound } from '../sounds'
import { vibrate, VIBRATIONS } from '../vibrate'
import { getPlayer } from '../playerUtils'

const WS_PROTOCOL = location.protocol === 'https:' ? 'wss' : 'ws'
const WS_URL      = `${WS_PROTOCOL}://${location.host}/api/shooter/ws`


function playGunshot() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const bufferSize = ctx.sampleRate * 0.08
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++)
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(800, ctx.currentTime)
    filter.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.08)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(1.2, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12)
    source.connect(filter); filter.connect(gain); gain.connect(ctx.destination)
    source.start()
    setTimeout(() => ctx.close(), 300)
  } catch (e) {}
}

function BulletBar({ count, max, color }) {
  return (
    <div style={{ display: 'flex', gap: 5, justifyContent: 'center', padding: '8px 0' }}>
      {Array(max).fill(null).map((_, i) => (
        <div key={i} style={{
          width: 14, height: 32, borderRadius: 3,
          background: i < count ? `linear-gradient(to bottom, ${color}, ${color}cc)` : '#1e293b',
          boxShadow: i < count ? `0 2px 8px ${color}66` : 'none',
          transition: 'all 0.2s', position: 'relative', overflow: 'hidden',
        }}>
          {i < count && <div style={{ position: 'absolute', top: 3, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: '50%', background: 'rgba(255,255,255,0.5)' }} />}
        </div>
      ))}
    </div>
  )
}

export default function Shooter({ player, players, onBack }) {
  const [state, setState]    = useState(null)
  const [floatMsg, setFloat] = useState(null)
  const [figKey, setFigKey]  = useState(0)
  const [flash, setFlash]    = useState(null)
  const [muzzle, setMuzzle]  = useState(false)
  const cooldown             = useRef(false)
  const prevPhase            = useRef(null)
  const prevFigId            = useRef(null)

  const p = getPlayer(players, player, 0)

  const { send, mountedRef } = useGameWS(WS_URL, player, (data) => {
    setState(data)
    if (data.figure && data.figure.id !== prevFigId.current) {
      prevFigId.current = data.figure.id
      setFigKey(k => k + 1)
    }
    if (!data.figure) prevFigId.current = null
    if (data.phase !== prevPhase.current) {
      if (data.phase === 'countdown') playSound('rematch')
      if (data.phase === 'result') {
        const winner = Object.entries(data.scores || {}).sort((a,b) => b[1]-a[1])[0]?.[0]
        if (winner === player) { playSound('win'); vibrate(VIBRATIONS.win) }
        else { playSound('lose'); vibrate(VIBRATIONS.lose) }
      }
      prevPhase.current = data.phase
    }
  })

  const triggerFlash = (type) => {
    setFlash(type); setMuzzle(true)
    setTimeout(() => { if (mountedRef.current) { setFlash(null); setMuzzle(false) } }, 180)
  }

  const shoot = () => {
    if (!state || state.phase !== 'playing' || cooldown.current) return
    if ((state.bullets?.[player] ?? 0) <= 0) return
    cooldown.current = true
    setTimeout(() => { cooldown.current = false }, 250)
    playGunshot()
    vibrate(VIBRATIONS.tap)
    const fig = state.figure
    if (!fig)                    { triggerFlash('miss');  showFloat('💨 Miss!', '#94a3b8') }
    else if (fig.type==='villain') { triggerFlash('hit');   showFloat('+1 🎯', p.color) }
    else                          { triggerFlash('wrong'); showFloat('-1 💔', '#ef4444') }
    send({ type: 'shoot' })
  }

  const showFloat = (label, color) => {
    const key = Date.now()
    setFloat({ label, color, key })
    setTimeout(() => { if (mountedRef.current) setFloat(null) }, 900)
  }

  const sendStart = () => send({ type: 'start' })
  const reset = () => { playSound('rematch'); send({ type: 'reset' }) }

  if (!state) return (
    <div style={{ minHeight:'100vh', background:'#0f172a', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', fontFamily:'sans-serif' }}>
      <div style={{ fontSize:64 }}>🔫</div>
      <div style={{ marginTop:16, color:'#475569', fontSize:16 }}>Connecting...</div>
    </div>
  )

  const { phase, figure, countdown, scores={}, bullets={}, connected=[], figures_done=0, total=20, host } = state
  const myBullets  = bullets[player] ?? 0
  const maxBullets = state.max_bullets ?? 8
  const isHost     = player === host
  const isVillain  = figure?.type === 'villain'
  const flashColors = { hit:'rgba(34,197,94,0.25)', miss:'rgba(148,163,184,0.18)', wrong:'rgba(239,68,68,0.28)' }

  // ── LOBBY ──────────────────────────────────────────────────────────────────
  if (phase === 'lobby') return (
    <div style={{ minHeight:'100vh', background:'#0f172a', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24, fontFamily:'sans-serif' }}>
      <button onClick={onBack} style={{ position:'absolute', top:16, left:16, background:'none', border:'none', fontSize:28, cursor:'pointer', color:'#475569' }}>←</button>
      <div style={{ fontSize:80 }}>🔫</div>
      <h2 style={{ fontSize:28, fontWeight:900, color:'#fff', margin:'12px 0 4px' }}>Quick Shot!</h2>
      <p style={{ color:'#64748b', fontSize:14, margin:'0 0 28px' }}>{connected.length} / 4 players in lobby</p>

      <div style={{ display:'flex', flexWrap:'wrap', gap:10, justifyContent:'center', marginBottom:32 }}>
        {connected.map((name, i) => {
          const pi = getPlayer(players, name, i)
          return (
            <div key={name} style={{ display:'flex', alignItems:'center', gap:8, background:`${pi.color}22`, border:`2px solid ${pi.color}55`, borderRadius:20, padding:'8px 18px' }}>
              <span style={{ fontSize:20 }}>{pi.emoji}</span>
              <span style={{ fontWeight:700, color:pi.color }}>{name}</span>
              {name === host && <span style={{ fontSize:11, color:pi.color, opacity:0.7 }}>(host)</span>}
            </div>
          )
        })}
        {connected.length < 2 && (
          <div style={{ display:'flex', alignItems:'center', gap:8, background:'rgba(255,255,255,0.05)', border:'2px solid rgba(255,255,255,0.08)', borderRadius:20, padding:'8px 18px' }}>
            <span style={{ fontSize:20 }}>👤</span>
            <span style={{ color:'#475569' }}>Waiting...</span>
          </div>
        )}
      </div>

      {isHost ? (
        <button onClick={sendStart} disabled={connected.length < 2} style={{
          background: connected.length >= 2 ? p.color : '#1e293b',
          color:'#fff', border:'none', borderRadius:16, padding:'16px 40px',
          fontSize:20, fontWeight:'bold',
          cursor: connected.length >= 2 ? 'pointer' : 'not-allowed',
          boxShadow: connected.length >= 2 ? `0 4px 20px ${p.color}55` : 'none',
          transition:'all 0.2s',
        }}>
          {connected.length < 2 ? 'Waiting for players...' : '🔫 Start Game!'}
        </button>
      ) : (
        <div style={{ color:'#64748b', fontSize:16, textAlign:'center' }}>
          <div style={{ fontSize:32, marginBottom:8 }}>⏳</div>
          Waiting for <strong style={{ color:'#94a3b8' }}>{host}</strong> to start...
        </div>
      )}
    </div>
  )

  // ── COUNTDOWN ──────────────────────────────────────────────────────────────
  if (phase === 'countdown') return (
    <div style={{ minHeight:'100vh', background:'#0f172a', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', fontFamily:'sans-serif' }}>
      <div style={{ fontSize:140, fontWeight:900, color:p.color, lineHeight:1, textShadow:`0 0 60px ${p.color}88` }}>
        {countdown === 0 ? 'GO!' : countdown}
      </div>
      <div style={{ color:'#475569', fontSize:20, marginTop:16 }}>Get ready!</div>
    </div>
  )

  // ── RESULT ─────────────────────────────────────────────────────────────────
  if (phase === 'result') {
    const sorted = Object.entries(scores).sort((a,b) => b[1]-a[1])
    const winner = sorted[0]?.[0]
    const iWon   = winner === player
    return (
      <div style={{ minHeight:'100vh', background:'#0f172a', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24, fontFamily:'sans-serif' }}>
        <div style={{ fontSize:80 }}>{iWon ? '🏆' : '💀'}</div>
        <h2 style={{ fontSize:32, margin:'12px 0 4px', color:iWon ? p.color : '#fff', fontWeight:900 }}>
          {iWon ? 'You Won!' : `${winner} Wins!`}
        </h2>
        <p style={{ color:'#475569', margin:'0 0 28px' }}>Final scores</p>
        <div style={{ width:'100%', maxWidth:340 }}>
          {sorted.map(([name, score], i) => {
            const pi = getPlayer(players, name, i)
            return (
              <div key={name} style={{ display:'flex', alignItems:'center', gap:12, background:name===player?`${pi.color}22`:'rgba(255,255,255,0.05)', border:`2px solid ${name===player?pi.color:'rgba(255,255,255,0.1)'}`, borderRadius:16, padding:'12px 20px', marginBottom:10 }}>
                <span style={{ fontSize:24 }}>{i===0?'🥇':i===1?'🥈':'🥉'}</span>
                <span style={{ fontSize:20 }}>{pi.emoji}</span>
                <span style={{ fontWeight:800, color:name===player?pi.color:'#fff', flex:1, fontSize:16 }}>{name}</span>
                <span style={{ fontSize:28, fontWeight:900, color:name===player?pi.color:'#fff' }}>{score}</span>
              </div>
            )
          })}
        </div>
        <div style={{ display:'flex', gap:12, marginTop:24 }}>
          <button onClick={onBack} style={{ background:'rgba(255,255,255,0.08)', border:'none', borderRadius:14, padding:'12px 24px', fontSize:16, cursor:'pointer', color:'#fff' }}>← Back</button>
          <button onClick={reset} style={{ background:p.color, color:'#fff', border:'none', borderRadius:14, padding:'12px 28px', fontSize:16, fontWeight:'bold', cursor:'pointer', boxShadow:`0 4px 16px ${p.color}55` }}>🔄 Play Again</button>
        </div>
      </div>
    )
  }

  // ── PLAYING ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:'100vh', background:'#0f172a', display:'flex', flexDirection:'column', alignItems:'center', fontFamily:'sans-serif', userSelect:'none', position:'relative', overflow:'hidden' }}>
      {flash && <div style={{ position:'fixed', inset:0, zIndex:50, background:flashColors[flash], pointerEvents:'none', animation:'screenFlash 0.18s ease-out forwards' }} />}

      <div style={{ width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 16px', background:'rgba(255,255,255,0.04)', borderBottom:'1px solid rgba(255,255,255,0.07)', zIndex:10 }}>
        <button onClick={onBack} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'#475569' }}>←</button>
        <div style={{ display:'flex', gap:20 }}>
          {connected.map((name, i) => {
            const pi = getPlayer(players, name, i)
            return (
              <div key={name} style={{ display:'flex', alignItems:'center', gap:5 }}>
                <span style={{ fontSize:16 }}>{pi.emoji}</span>
                <span style={{ fontWeight:900, color:pi.color, fontSize:20 }}>{scores[name]??0}</span>
              </div>
            )
          })}
        </div>
        <div style={{ color:'#334155', fontSize:13, fontWeight:700 }}>{figures_done}/{total}</div>
      </div>

      <div style={{ width:'100%', height:4, background:'rgba(255,255,255,0.06)' }}>
        <div style={{ height:'100%', width:`${(figures_done/total)*100}%`, background:p.color, transition:'width 0.5s', boxShadow:`0 0 10px ${p.color}` }} />
      </div>

      <BulletBar count={myBullets} max={maxBullets} color={p.color} />

      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', position:'relative', width:'100%', maxWidth:420, padding:'0 24px' }}>
        {floatMsg && (
          <div key={floatMsg.key} style={{ position:'absolute', top:'15%', left:'50%', fontSize:30, fontWeight:900, color:floatMsg.color, animation:'floatUp 0.9s ease-out forwards', pointerEvents:'none', whiteSpace:'nowrap', zIndex:20, textShadow:`0 2px 12px ${floatMsg.color}88` }}>
            {floatMsg.label}
          </div>
        )}

        <div key={figKey} onPointerDown={shoot} style={{
          width:230, height:230, borderRadius:36,
          display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
          cursor:'pointer',
          background: figure ? isVillain ? 'radial-gradient(circle at 40% 35%, #3d0000, #1a0000)' : 'radial-gradient(circle at 40% 35%, #003d00, #001a00)' : 'rgba(255,255,255,0.03)',
          border:`3px solid ${figure ? isVillain ? '#ef4444' : '#22c55e' : 'rgba(255,255,255,0.07)'}`,
          boxShadow: figure ? isVillain ? '0 0 50px #ef444455,0 0 100px #ef444422,inset 0 0 40px #ef444411' : '0 0 50px #22c55e55,0 0 100px #22c55e22,inset 0 0 40px #22c55e11' : 'none',
          transition:'border-color 0.15s,box-shadow 0.15s',
          animation: figure ? 'popIn 0.3s cubic-bezier(0.34,1.56,0.64,1)' : 'none',
        }}>
          {figure ? (
            <>
              <div style={{ fontSize:100, lineHeight:1 }}>{figure.emoji}</div>
              <div style={{ marginTop:12, fontSize:13, fontWeight:900, letterSpacing:3, color:isVillain?'#fca5a5':'#86efac', textTransform:'uppercase' }}>
                {isVillain ? '⚡ SHOOT!' : '🚫 SPARE!'}
              </div>
            </>
          ) : (
            <div style={{ color:'rgba(255,255,255,0.12)', fontSize:16, fontWeight:700, letterSpacing:2 }}>STAND BY...</div>
          )}
        </div>

        <div style={{ position:'relative', marginTop:28 }}>
          {muzzle && <div style={{ position:'absolute', inset:-8, borderRadius:'50%', background:`radial-gradient(circle, ${p.color}88 0%, transparent 70%)`, animation:'muzzleFlash 0.18s ease-out forwards', pointerEvents:'none', zIndex:5 }} />}
          <button onPointerDown={shoot} disabled={myBullets===0} style={{
            width:90, height:90, borderRadius:'50%',
            border:`3px solid ${myBullets>0?p.color:'#1e293b'}`,
            background: myBullets>0 ? `radial-gradient(circle at 40% 35%, ${p.color}cc, ${p.color})` : '#0f172a',
            fontSize:36, cursor:myBullets>0?'pointer':'not-allowed',
            boxShadow:myBullets>0?`0 0 24px ${p.color}55,0 4px 12px #0006`:'none',
            transform:muzzle?'scale(0.92)':'scale(1)', transition:'all 0.15s',
            position:'relative', zIndex:10,
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>🔫</button>
        </div>

        {myBullets===0 && <div style={{ marginTop:16, color:'#ef4444', fontSize:15, fontWeight:800, letterSpacing:1 }}>🚫 OUT OF BULLETS</div>}
        <div style={{ marginTop:10, color:'#334155', fontSize:12, fontWeight:700, letterSpacing:1, textTransform:'uppercase' }}>
          {figure ? 'Tap target or button' : 'Wait for target...'}
        </div>
      </div>

      <style>{`
        @keyframes floatUp { from{opacity:1;transform:translateX(-50%) translateY(0)} to{opacity:0;transform:translateX(-50%) translateY(-70px)} }
        @keyframes popIn   { 0%{transform:scale(0.3);opacity:0} 70%{transform:scale(1.08)} 100%{transform:scale(1);opacity:1} }
        @keyframes screenFlash { 0%{opacity:1} 100%{opacity:0} }
        @keyframes muzzleFlash { 0%{opacity:1;transform:scale(0.8)} 100%{opacity:0;transform:scale(1.4)} }
      `}</style>
    </div>
  )
}