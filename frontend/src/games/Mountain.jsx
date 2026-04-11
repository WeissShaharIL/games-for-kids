import { useState, useEffect, useRef } from 'react'
import { useGameWS } from '../hooks/useGameWS'
import { playSound } from '../sounds'
import { vibrate, VIBRATIONS } from '../vibrate'
import { getPlayer } from '../playerUtils'

const WS_PROTOCOL = location.protocol === 'https:' ? 'wss' : 'ws'
const WS_URL      = `${WS_PROTOCOL}://${location.host}/api/mountain/ws`

const FALLBACK = [
  { color: '#16a34a', light: '#dcfce7', emoji: '🦁' },
  { color: '#db2777', light: '#fce7f3', emoji: '🦋' },
  { color: '#2563eb', light: '#dbeafe', emoji: '🦊' },
  { color: '#d97706', light: '#fef3c7', emoji: '🌸' },
]

function drawMountain3D(ctx, W, H, positions, eliminated, player, allPlayers, turnOrder) {
  const sky = ctx.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0, '#06111f'); sky.addColorStop(0.35, '#0d2137')
  sky.addColorStop(0.65, '#1a3a5c'); sky.addColorStop(1, '#2d6a8a')
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H)

  // Aurora
  const aurora = ctx.createLinearGradient(0, H*0.05, W, H*0.3)
  aurora.addColorStop(0, '#00ff8844'); aurora.addColorStop(0.3, '#00bbff22')
  aurora.addColorStop(0.6, '#8800ff33'); aurora.addColorStop(1, '#00ff8811')
  ctx.fillStyle = aurora
  ctx.beginPath(); ctx.moveTo(0, H*0.08)
  for (let x = 0; x <= W; x += W/20) ctx.lineTo(x, H*0.08 + Math.sin(x/W*Math.PI*3)*H*0.05)
  ctx.lineTo(W, H*0.25); ctx.lineTo(0, H*0.25); ctx.closePath(); ctx.fill()

  // Stars
  for (let i = 0; i < 80; i++) {
    const sx = (i*173.1+50)%W; const sy = (i*91.7+20)%(H*0.55)
    const twinkle = 0.4 + 0.6*Math.abs(Math.sin(i*0.7))
    ctx.beginPath(); ctx.arc(sx, sy, 0.4+(i%4)*0.3, 0, Math.PI*2)
    ctx.fillStyle = `rgba(255,255,255,${twinkle})`; ctx.fill()
  }

  // Moon
  ctx.save(); ctx.shadowColor = '#fffde7'; ctx.shadowBlur = 20
  ctx.beginPath(); ctx.arc(W*0.82, H*0.09, W*0.055, 0, Math.PI*2)
  ctx.fillStyle = '#fef9c3'; ctx.fill(); ctx.restore()
  ctx.beginPath(); ctx.arc(W*0.845, H*0.082, W*0.047, 0, Math.PI*2)
  ctx.fillStyle = '#0d2137'; ctx.fill()

  // Background mountains
  ctx.save(); ctx.globalAlpha = 0.4
  ;[[0,H*0.55,W*0.25,H*0.32,W*0.5,H*0.55],[W*0.4,H*0.58,W*0.65,H*0.35,W*0.9,H*0.58]].forEach(pts => {
    ctx.beginPath(); ctx.moveTo(pts[0],H); ctx.lineTo(pts[0],pts[1]); ctx.lineTo(pts[2],pts[3])
    ctx.lineTo(pts[4],pts[5]); ctx.lineTo(pts[4],H); ctx.closePath()
    const g = ctx.createLinearGradient(0,pts[3],0,H); g.addColorStop(0,'#4a6fa5'); g.addColorStop(1,'#2a4a6a')
    ctx.fillStyle = g; ctx.fill()
  }); ctx.restore()

  // Left face
  ctx.beginPath(); ctx.moveTo(W*0.5,H*0.12); ctx.lineTo(W*0.08,H*0.78); ctx.lineTo(W*0.5,H*0.78); ctx.closePath()
  const lf = ctx.createLinearGradient(W*0.08,H*0.12,W*0.5,H*0.78)
  lf.addColorStop(0,'#b8c8d8'); lf.addColorStop(0.3,'#7a8a9a'); lf.addColorStop(1,'#3a4a5a')
  ctx.fillStyle = lf; ctx.fill()

  // Right face
  ctx.beginPath(); ctx.moveTo(W*0.5,H*0.12); ctx.lineTo(W*0.92,H*0.78); ctx.lineTo(W*0.5,H*0.78); ctx.closePath()
  const rf = ctx.createLinearGradient(W*0.5,H*0.12,W*0.92,H*0.78)
  rf.addColorStop(0,'#d8e8f0'); rf.addColorStop(0.3,'#9aabb8'); rf.addColorStop(1,'#5a6a7a')
  ctx.fillStyle = rf; ctx.fill()

  // Ridge
  const ridge = ctx.createLinearGradient(W*0.5,H*0.12,W*0.5,H*0.78)
  ridge.addColorStop(0,'#ffffff'); ridge.addColorStop(0.4,'#ccd8e0'); ridge.addColorStop(1,'#7a8a9a')
  ctx.beginPath(); ctx.moveTo(W*0.5,H*0.12); ctx.lineTo(W*0.5,H*0.78)
  ctx.strokeStyle = ridge; ctx.lineWidth = 2; ctx.stroke()

  // Snow cap
  ctx.beginPath(); ctx.moveTo(W*0.5,H*0.12); ctx.lineTo(W*0.38,H*0.28); ctx.lineTo(W*0.5,H*0.28); ctx.closePath()
  const snL = ctx.createLinearGradient(W*0.38,H*0.12,W*0.5,H*0.28)
  snL.addColorStop(0,'#ffffff'); snL.addColorStop(1,'#c8d8e8'); ctx.fillStyle = snL; ctx.fill()
  ctx.beginPath(); ctx.moveTo(W*0.5,H*0.12); ctx.lineTo(W*0.62,H*0.28); ctx.lineTo(W*0.5,H*0.28); ctx.closePath()
  const snR = ctx.createLinearGradient(W*0.5,H*0.12,W*0.62,H*0.28)
  snR.addColorStop(0,'#ffffff'); snR.addColorStop(1,'#e8f0f8'); ctx.fillStyle = snR; ctx.fill()
  ctx.beginPath(); ctx.moveTo(W*0.38,H*0.28); ctx.lineTo(W*0.40,H*0.31); ctx.lineTo(W*0.43,H*0.285)
  ctx.lineTo(W*0.46,H*0.30); ctx.lineTo(W*0.5,H*0.28); ctx.lineTo(W*0.54,H*0.30)
  ctx.lineTo(W*0.57,H*0.285); ctx.lineTo(W*0.60,H*0.31); ctx.lineTo(W*0.62,H*0.28)
  ctx.fillStyle = '#ffffff'; ctx.fill()

  // Fog + ground + trees
  const fog = ctx.createLinearGradient(0,H*0.65,0,H*0.82)
  fog.addColorStop(0,'rgba(180,200,220,0)'); fog.addColorStop(1,'rgba(180,200,220,0.35)')
  ctx.fillStyle = fog; ctx.fillRect(0,H*0.65,W,H*0.17)
  ctx.beginPath(); ctx.moveTo(0,H*0.78); ctx.lineTo(W,H*0.78); ctx.lineTo(W,H); ctx.lineTo(0,H); ctx.closePath()
  const grd = ctx.createLinearGradient(0,H*0.78,0,H)
  grd.addColorStop(0,'#2d4a2a'); grd.addColorStop(1,'#0f2010'); ctx.fillStyle = grd; ctx.fill()

  const drawTree = (tx,ty,sz) => {
    ctx.fillStyle = '#1a3a18'
    for (let tier=0;tier<3;tier++) {
      ctx.beginPath(); const tw=sz*(1-tier*0.2); const th=sz*0.45; const ty2=ty-tier*sz*0.3
      ctx.moveTo(tx,ty2-th); ctx.lineTo(tx-tw/2,ty2); ctx.lineTo(tx+tw/2,ty2); ctx.closePath(); ctx.fill()
    }
    ctx.fillStyle='#2d3a1a'; ctx.fillRect(tx-sz*0.06,ty,sz*0.12,sz*0.2)
  }
  ;[0.05,0.12,0.19,0.81,0.88,0.95].forEach((tx,i)=>drawTree(W*tx,H*0.80,18+(i%3)*6))

  // Players
  const allNames = turnOrder.length > 0 ? turnOrder : Object.keys(positions)
  const drawOrder = [...allNames.filter(n=>n!==player), player]

  const getFacePoint = (pct,faceIdx) => {
    const t = Math.max(0,Math.min(100,pct))/100
    if (faceIdx%2===0) return {x:W*(0.85-t*0.33), y:H*(0.76-t*0.62)}
    else               return {x:W*(0.15+t*0.33), y:H*(0.76-t*0.62)}
  }

  drawOrder.forEach(name => {
    const idx    = allNames.indexOf(name)
    const pos    = positions[name] ?? 80
    const isMe   = name === player
    const isElim = eliminated?.includes(name)
    const pt     = getFacePoint(pos, idx)
    const info   = allPlayers[name] || FALLBACK[idx%4]
    const sz     = Math.floor(W*(isMe?0.095:0.075))

    ctx.save(); ctx.globalAlpha = isElim ? 0.35 : 1
    if (isMe) { ctx.shadowColor = info.color||'#fff'; ctx.shadowBlur = 18 }

    // Platform shadow
    ctx.beginPath(); ctx.ellipse(pt.x,pt.y+sz*0.1,sz*0.55,sz*0.15,0,0,Math.PI*2)
    ctx.fillStyle = '#00000033'; ctx.fill()

    // Emoji
    ctx.font = `${sz}px sans-serif`; ctx.textAlign = 'center'
    ctx.shadowColor = '#000'; ctx.shadowBlur = 6
    ctx.fillText(info.emoji||'🎮', pt.x, pt.y)
    ctx.shadowBlur = 0

    // Name tag
    const label = isMe ? 'YOU' : name.toUpperCase()
    ctx.font = `900 ${Math.floor(W*0.032)}px Nunito, sans-serif`
    const tw = ctx.measureText(label).width
    ctx.fillStyle = (info.color||'#fff')+'cc'
    ctx.beginPath(); ctx.roundRect(pt.x-tw/2-4,pt.y-sz*0.75,tw+8,Math.floor(W*0.038),4); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.fillText(label, pt.x, pt.y-sz*0.45)

    if (isElim) { ctx.font=`${Math.floor(sz*0.6)}px sans-serif`; ctx.fillText('💀',pt.x+sz*0.45,pt.y-sz*0.55) }
    ctx.restore()
  })
}

export default function Mountain({ player, players: playerConfig, onBack }) {
  const [state, setState]       = useState(null)
  const [status, setStatus]     = useState('Connecting...')
  const [answered, setAnswered] = useState(false)
  const canvasRef               = useRef(null)
  const prevPhase               = useRef(null)
  const prevQuestion            = useRef(null)

  const allPlayers = playerConfig || {}
  const myInfo     = allPlayers[player] || FALLBACK[0]
  const p          = { color: myInfo.color, light: myInfo.light, emoji: myInfo.emoji }

  const { send } = useGameWS(WS_URL, player,
    (data) => {
      setState(data)

      if (data.question?.q !== prevQuestion.current) {
        setAnswered(false); prevQuestion.current = data.question?.q
      }

      if (data.last_result) {
        const r = data.last_result
        if (r.player === player) {
          if (r.result==='correct') { playSound('win');  vibrate(VIBRATIONS.win)  }
          else                      { playSound('lose'); vibrate(VIBRATIONS.lose) }
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
      else if (data.phase === 'lobby') {
        if (connected.length < minP)       setStatus(`Waiting for players... (${connected.length}/${minP}+)`)
        else if (data.host === player)     setStatus(`${connected.length} players ready — you're the host!`)
        else                               setStatus(`Waiting for ${data.host} to start...`)
      }
      else if (data.phase === 'countdown') setStatus(data.countdown > 0 ? `${data.countdown}...` : 'GO!')
      else if (data.phase === 'playing') {
        if (data.whose_turn === player)    setStatus('❓ Your turn!')
        else if (data.whose_turn)          setStatus(`${allPlayers[data.whose_turn]?.emoji||''} ${data.whose_turn}'s turn...`)
      }
      else if (data.phase === 'result') {
        setStatus(data.winner === player ? '🎉 You win!' : `${allPlayers[data.winner]?.emoji||''} ${data.winner} wins!`)
      }
    },
    () => setStatus('Waiting for players...')
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !state) return
    const ctx = canvas.getContext('2d')
    drawMountain3D(ctx, canvas.width, canvas.height,
      state.positions||{}, state.eliminated||[], player, allPlayers, state.turn_order||[])
  }, [state, player, allPlayers])

  const sendAnswer = (choice) => {
    if (answered) return
    setAnswered(true); playSound('place'); vibrate(VIBRATIONS.tap)
    send({ type: 'answer', choice })
  }
  const sendPass   = () => { if (state?.passed) return; playSound('error'); send({ type: 'pass' }) }
  const sendStart  = () => send({ type: 'start' })
  const sendReset  = () => { prevPhase.current=null; prevQuestion.current=null; setAnswered(false); send({ type: 'reset' }) }

  const phase      = state?.phase
  const myTurn     = state?.whose_turn === player && phase === 'playing'
  const question   = state?.question
  const timer      = state?.timer ?? 15
  const passed     = state?.passed
  const passer     = state?.passer
  const positions  = state?.positions  || {}
  const eliminated = state?.eliminated || []
  const connected  = state?.connected  || []
  const minPlayers = state?.min_players || 2
  const lastResult = state?.last_result
  const myWon      = phase === 'result' && state?.winner === player
  const isElim     = eliminated.includes(player)
  const turnOrder  = state?.turn_order || connected
  const isHost     = state?.host === player
  const canStart   = isHost && connected.length >= minPlayers && phase === 'lobby'

  const canvasW = Math.min(window.innerWidth, 420)
  const canvasH = Math.round(canvasW * 1.05)

  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', paddingBottom:24, gap:10, background:'#06111f' }}>
      <div style={{ width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 20px', background:'#ffffff15', backdropFilter:'blur(8px)', boxShadow:'0 1px 0 #ffffff11' }}>
        <button onClick={onBack} style={{ background:'none', border:'none', fontSize:15, fontWeight:700, cursor:'pointer', color:p.color, fontFamily:'inherit' }}>← Back</button>
        <div style={{ fontWeight:900, color:'#fff', fontSize:17 }}>🏔️ Mountain Quiz</div>
        <div style={{ width:64 }} />
      </div>

      {/* Player bars */}
      <div style={{ display:'flex', gap:6, width:'100%', maxWidth:420, padding:'0 12px', flexWrap:'wrap' }}>
        {(turnOrder.length > 0 ? turnOrder : connected).map((name,idx) => {
          const info   = allPlayers[name] || FALLBACK[idx%4]
          const pos    = positions[name] ?? 80
          const isElim2 = eliminated.includes(name)
          const isActive = state?.whose_turn === name
          return (
            <div key={name} style={{ flex:1, minWidth:80, display:'flex', alignItems:'center', gap:5,
              border:`2px solid ${isActive?info.color:info.color+'55'}`,
              borderRadius:10, padding:'4px 8px',
              background: isElim2?'#ffffff08':info.color+'22',
              opacity: isElim2?0.5:1 }}>
              <span style={{fontSize:13}}>{info.emoji}</span>
              <div style={{flex:1,height:5,background:'#ffffff22',borderRadius:3,overflow:'hidden'}}>
                <div style={{height:'100%',width:`${pos}%`,background:isElim2?'#94a3b8':info.color,borderRadius:3,transition:'width 0.5s'}}/>
              </div>
              <span style={{fontSize:10,fontWeight:800,color:isElim2?'#94a3b8':info.color,minWidth:20}}>
                {isElim2?'💀':`${pos}%`}
              </span>
            </div>
          )
        })}
      </div>

      {/* Status */}
      <div style={{ padding:'8px 24px', borderRadius:12, fontSize:14, fontWeight:800, textAlign:'center',
        background: myTurn?p.color+'33':myWon?p.color+'33':'#ffffff15',
        color: myTurn?p.color:myWon?p.color:'#94a3b8',
        border:`1px solid ${myTurn?p.color+'44':'#ffffff11'}` }}>
        {status}
      </div>

      {/* Lobby: player list + start button */}
      {phase === 'lobby' && (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12, width:'100%', maxWidth:420, padding:'0 16px' }}>
          <div style={{ width:'100%', background:'#ffffff10', borderRadius:16, padding:16, display:'flex', flexDirection:'column', gap:8 }}>
            <div style={{ color:'#94a3b8', fontSize:12, fontWeight:700, textAlign:'center' }}>PLAYERS IN LOBBY</div>
            {connected.map((name,idx) => {
              const info = allPlayers[name] || FALLBACK[idx%4]
              return (
                <div key={name} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderRadius:10, background:info.color+'22', border:`1px solid ${info.color}44` }}>
                  <span style={{fontSize:24}}>{info.emoji}</span>
                  <span style={{fontWeight:800,color:info.color,flex:1}}>{name}{name===player?' (you)':''}</span>
                  {name===state?.host && <span style={{fontSize:11,background:info.color,color:'#fff',padding:'2px 8px',borderRadius:999,fontWeight:800}}>HOST</span>}
                </div>
              )
            })}
          </div>

          {canStart && (
            <button onClick={sendStart} style={{ width:'100%', padding:'18px', borderRadius:18, border:'none', background:p.color, color:'#fff', fontSize:20, fontWeight:900, cursor:'pointer', fontFamily:'inherit', boxShadow:`0 6px 24px ${p.color}66` }}>
              🏔️ Start Game! ({connected.length} players)
            </button>
          )}
          {!isHost && connected.length >= minPlayers && (
            <div style={{ color:'#64748b', fontSize:13, fontWeight:700, textAlign:'center' }}>
              Waiting for {state?.host} to start...
            </div>
          )}
          {connected.length < minPlayers && (
            <div style={{ display:'flex', alignItems:'center', gap:8, color:'#94a3b8', fontWeight:700, fontSize:13 }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:p.color, animation:'pulse 1.5s ease-in-out infinite' }} />
              Need at least {minPlayers} players to start
            </div>
          )}
        </div>
      )}

      {/* Canvas */}
      <div style={{ borderRadius:16, overflow:'hidden', boxShadow:'0 8px 40px #000008' }}>
        <canvas ref={canvasRef} width={canvasW} height={canvasH} style={{ display:'block' }} />
      </div>

      {/* Last result */}
      {lastResult && phase==='playing' && (
        <div style={{ padding:'8px 20px', borderRadius:12, fontWeight:800, fontSize:13, textAlign:'center',
          background:lastResult.result==='correct'?'#dcfce7':'#fee2e2',
          color:lastResult.result==='correct'?'#15803d':'#dc2626' }}>
          {lastResult.result==='correct'?`✅ ${lastResult.player} correct! Others slide ⬇️`:`❌ ${lastResult.player} wrong! Sliding down ⬇️`}
        </div>
      )}

      {/* Question */}
      {phase==='playing' && question && !isElim && (
        <div style={{ width:'100%', maxWidth:420, padding:'0 16px', display:'flex', flexDirection:'column', gap:10 }}>
          {passed && passer && (
            <div style={{ textAlign:'center', fontSize:12, color:'#94a3b8', fontWeight:700 }}>
              {allPlayers[passer]?.emoji} {passer} passed — no more passes!
            </div>
          )}
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ flex:1, height:5, background:'#ffffff22', borderRadius:3, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${(timer/15)*100}%`, background:timer<=5?'#ef4444':p.color, borderRadius:3, transition:'width 1s linear' }} />
            </div>
            <span style={{ fontSize:12, fontWeight:800, color:timer<=5?'#ef4444':'#94a3b8', minWidth:24 }}>{timer}s</span>
          </div>
          <div style={{ background:'#ffffff15', borderRadius:20, padding:'16px 20px', border:'1px solid #ffffff22', textAlign:'center' }}>
            <div style={{ fontSize:28, fontWeight:900, color:'#fff', fontFamily:'monospace' }}>{question.q}</div>
          </div>
          {myTurn && !answered ? (
            <>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                {question.options.map((opt,i) => (
                  <button key={i} onClick={()=>sendAnswer(opt)} style={{ padding:'16px', borderRadius:16, border:`2px solid ${p.color}55`, background:p.color+'22', color:'#fff', fontSize:22, fontWeight:900, cursor:'pointer', fontFamily:'monospace', touchAction:'manipulation', boxShadow:`0 4px 12px ${p.color}33` }}>
                    {opt}
                  </button>
                ))}
              </div>
              {!passed && (
                <button onClick={sendPass} style={{ padding:'11px', borderRadius:14, border:'1px solid #ffffff22', background:'#ffffff11', color:'#94a3b8', fontWeight:800, fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>
                  🤷 Pass (once only)
                </button>
              )}
            </>
          ) : myTurn && answered ? (
            <div style={{ textAlign:'center', padding:16, color:'#94a3b8', fontWeight:700 }}>⏳ Waiting for result...</div>
          ) : (
            <div style={{ textAlign:'center', padding:12, fontWeight:800, fontSize:14, color:state?.whose_turn?(allPlayers[state.whose_turn]?.color||'#94a3b8'):'#94a3b8', background:'#ffffff11', borderRadius:14 }}>
              {state?.whose_turn?`${allPlayers[state.whose_turn]?.emoji||''} ${state.whose_turn} is thinking...`:''}
            </div>
          )}
        </div>
      )}

      {phase==='playing' && isElim && (
        <div style={{ textAlign:'center', padding:'16px 24px', background:'#ff000022', borderRadius:16, color:'#fca5a5', fontWeight:800, fontSize:15, border:'1px solid #ff000044' }}>
          💀 You fell off! Watch the others!
        </div>
      )}

      {phase==='result' && (
        <div style={{ textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
          <div style={{fontSize:56}}>{allPlayers[state?.winner]?.emoji||'🏆'}</div>
          <div style={{fontSize:22,fontWeight:900,color:myWon?p.color:'#fff'}}>
            {myWon?'You win! 🎉':`${state?.winner} wins!`}
          </div>
          <button onClick={sendReset} style={{ padding:'14px 36px', borderRadius:16, border:'none', color:'#fff', background:p.color, fontSize:18, fontWeight:900, cursor:'pointer', fontFamily:'inherit' }}>
            🔄 Play Again
          </button>
        </div>
      )}
    </div>
  )
}