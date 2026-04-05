import { useEffect, useRef, useState, useCallback } from 'react'
import { playSound } from '../sounds'
import { vibrate, VIBRATIONS } from '../vibrate'

const WS_PROTOCOL = location.protocol === 'https:' ? 'wss' : 'ws'
const WS_URL      = `${WS_PROTOCOL}://${location.host}/api/balloons/ws`

const FALLBACKS = [
  { color: '#16a34a', light: '#dcfce7', bg: '#f0fdf4', emoji: '🦁' },
  { color: '#db2777', light: '#fce7f3', bg: '#fdf2f8', emoji: '🦋' },
  { color: '#2563eb', light: '#dbeafe', bg: '#eff6ff', emoji: '🦊' },
  { color: '#d97706', light: '#fef3c7', bg: '#fffbeb', emoji: '🌸' },
]
function safe(players, name, idx = 0) {
  if (players?.[name]) return players[name]
  return FALLBACKS[idx % FALLBACKS.length]
}

const BALLOON_COLORS = {
  gold:  { fill: '#f59e0b', stroke: '#d97706', shine: '#fef3c7', label: '🥇 +2' },
  white: { fill: '#f1f5f9', stroke: '#cbd5e1', shine: '#ffffff', label: '⚪ +1' },
  black: { fill: '#1e293b', stroke: '#0f172a', shine: '#334155', label: '🖤 -2' },
}

let popAnims = []
function addPopAnim(x, y, type) {
  const c = BALLOON_COLORS[type] || BALLOON_COLORS.white
  popAnims.push({ x, y, label: c.label, color: c.fill, born: Date.now(), id: Math.random() })
  if (popAnims.length > 20) popAnims = popAnims.slice(-20)
}

const CANVAS_W = 390
const CANVAS_H = 600

export default function Balloons({ player, players, onBack }) {
  const [state, setState]   = useState(null)
  const [status, setStatus] = useState('Connecting...')
  const canvasRef           = useRef(null)
  const wsRef               = useRef(null)
  const animFrameRef        = useRef(null)
  const stateRef            = useRef(null)
  const prevPhase           = useRef(null)
  const mountedRef          = useRef(true)

  const me = safe(players, player, 0)

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])
  useEffect(() => { stateRef.current = state }, [state])

  const connect = useCallback(() => {
    const ws = new WebSocket(`${WS_URL}/${player}`)
    wsRef.current = ws
    ws.onopen = () => { if (mountedRef.current) setStatus('In lobby...') }
    ws.onmessage = (e) => {
      if (!mountedRef.current) return
      const data = JSON.parse(e.data)
      setState(data)
      if (data.pops?.length) {
        data.pops.forEach(pop => {
          addPopAnim(pop.x, pop.y, pop.type)
          if (pop.player === player) { vibrate(VIBRATIONS.tap); pop.points > 0 ? playSound('place') : playSound('error') }
        })
      }
      if (data.phase !== prevPhase.current) {
        if (data.phase === 'countdown') playSound('rematch')
        if (data.phase === 'result') {
          const scores = data.scores || {}
          const winner = Object.entries(scores).sort((a,b)=>b[1]-a[1])[0]?.[0]
          winner === player ? playSound('win') : playSound('lose')
        }
        prevPhase.current = data.phase
      }
      if (data.disconnected) { setStatus(`${data.disconnected} disconnected`); setTimeout(() => { if (mountedRef.current) setStatus('') }, 3000) }
    }
    ws.onclose = () => { if (!mountedRef.current) return; setStatus('Reconnecting...'); setTimeout(connect, 2000) }
    ws.onerror = () => ws.close()
  }, [player])

  useEffect(() => { connect(); return () => { wsRef.current?.close(); cancelAnimationFrame(animFrameRef.current) } }, [connect])

  // Canvas render loop — always running, draws when playing
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    // Fix canvas dimensions once
    canvas.width  = CANVAS_W
    canvas.height = CANVAS_H
    const ctx = canvas.getContext('2d')

    function drawBalloon(b) {
      const { fill, stroke, shine } = BALLOON_COLORS[b.type] || BALLOON_COLORS.white
      const r = 28
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4
      ctx.beginPath(); ctx.ellipse(b.x, b.y, r, r*1.25, 0, 0, Math.PI*2)
      ctx.fillStyle = fill; ctx.fill()
      ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke()
      ctx.restore()
      ctx.beginPath(); ctx.ellipse(b.x - r*0.3, b.y - r*0.4, r*0.25, r*0.35, -0.5, 0, Math.PI*2)
      ctx.fillStyle = shine + 'cc'; ctx.fill()
      ctx.beginPath(); ctx.arc(b.x, b.y + r*1.25, 4, 0, Math.PI*2)
      ctx.fillStyle = stroke; ctx.fill()
      ctx.beginPath(); ctx.moveTo(b.x, b.y + r*1.25 + 4); ctx.lineTo(b.x + 8, b.y + r*1.25 + 28)
      ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1.5; ctx.stroke()
    }

    function render() {
      if (!mountedRef.current) return
      animFrameRef.current = requestAnimationFrame(render)
      const s = stateRef.current
      if (!s || s.phase !== 'playing') {
        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
        return
      }
      const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H)
      grad.addColorStop(0, '#e0f2fe'); grad.addColorStop(1, '#f0fdf4')
      ctx.fillStyle = grad; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      ;[[60,80,50],[200,50,40],[320,100,35]].forEach(([x,y,r]) => {
        ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill()
        ctx.beginPath(); ctx.arc(x+r*0.6,y+5,r*0.8,0,Math.PI*2); ctx.fill()
        ctx.beginPath(); ctx.arc(x-r*0.6,y+5,r*0.7,0,Math.PI*2); ctx.fill()
      })
      s.balloons?.forEach(drawBalloon)
      const now = Date.now()
      popAnims = popAnims.filter(a => now - a.born < 800)
      for (const a of popAnims) {
        const t = (now - a.born) / 800
        ctx.font = `bold ${18+t*10}px sans-serif`
        ctx.fillStyle = a.color + Math.floor((1-t)*255).toString(16).padStart(2,'0')
        ctx.textAlign = 'center'
        ctx.fillText(a.label, a.x, a.y - t*60)
      }
    }
    animFrameRef.current = requestAnimationFrame(render)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [])

  const send = (msg) => wsRef.current?.readyState === 1 && wsRef.current.send(JSON.stringify(msg))

  const handleTap = (e) => {
    if (stateRef.current?.phase !== 'playing') return
    e.preventDefault()
    const canvas = canvasRef.current
    const rect   = canvas.getBoundingClientRect()
    const scaleX = CANVAS_W / rect.width
    const scaleY = CANVAS_H / rect.height
    const touch  = e.changedTouches?.[0] || e
    send({ type:'pop', x:(touch.clientX-rect.left)*scaleX, y:(touch.clientY-rect.top)*scaleY })
  }

  if (!state) return (
    <div style={{ minHeight:'100vh', background: me.bg, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
      <div style={{ fontSize:48 }}>🎈</div>
      <div style={{ marginTop:16, color:'#64748b' }}>{status}</div>
    </div>
  )

  const { phase, scores={}, countdown, time_left, players: connected=[], host } = state
  const isHost = player === host
  const scoreboard = [...connected].sort((a,b) => (scores[b]||0)-(scores[a]||0))

  if (phase === 'lobby') return (
    <div style={{ minHeight:'100vh', background: me.bg, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24, fontFamily:'sans-serif' }}>
      <button onClick={onBack} style={{ position:'absolute', top:16, left:16, background:'none', border:'none', fontSize:28, cursor:'pointer' }}>←</button>
      <div style={{ fontSize:64, marginBottom:8 }}>🎈</div>
      <h2 style={{ margin:'0 0 4px', fontSize:26, color:'#1e293b' }}>Pop Balloons</h2>
      <p style={{ margin:'0 0 32px', color:'#64748b', fontSize:14 }}>{connected.length} / 4 players in lobby</p>
      <div style={{ display:'flex', flexWrap:'wrap', gap:10, justifyContent:'center', marginBottom:32 }}>
        {connected.map((name, i) => {
          const pi = safe(players, name, i)
          return <div key={name} style={{ background:pi.color, color:'#fff', borderRadius:20, padding:'8px 18px', fontWeight:'bold', fontSize:15, display:'flex', alignItems:'center', gap:6 }}>
            <span>{pi.emoji}</span><span>{name}</span>{name===host&&<span style={{fontSize:12,opacity:0.8}}>(host)</span>}
          </div>
        })}
        {connected.length < 2 && <div style={{ background:'#e2e8f0', color:'#94a3b8', borderRadius:20, padding:'8px 18px', fontSize:15 }}>Waiting...</div>}
      </div>
      {isHost
        ? <button onClick={() => send({ type:'start' })} disabled={connected.length < 2} style={{ background: connected.length>=2 ? me.color : '#cbd5e1', color:'#fff', border:'none', borderRadius:16, padding:'16px 40px', fontSize:20, fontWeight:'bold', cursor: connected.length>=2?'pointer':'not-allowed' }}>
            {connected.length < 2 ? 'Waiting for players...' : '🎈 Start Game!'}
          </button>
        : <div style={{ color:'#64748b', fontSize:16, textAlign:'center' }}><div style={{ fontSize:28, marginBottom:8 }}>⏳</div>Waiting for <strong>{host}</strong> to start...</div>
      }
    </div>
  )

  if (phase === 'countdown') return (
    <div style={{ minHeight:'100vh', background: me.bg, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
      <div style={{ fontSize:64, marginBottom:16 }}>🎈</div>
      <div style={{ fontSize:100, fontWeight:'bold', color: me.color, lineHeight:1 }}>{countdown}</div>
      <div style={{ marginTop:16, color:'#64748b', fontSize:18 }}>Get ready!</div>
    </div>
  )

  if (phase === 'result') {
    const winner = scoreboard[0]
    return (
      <div style={{ minHeight:'100vh', background: me.bg, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24, fontFamily:'sans-serif' }}>
        <div style={{ fontSize:64 }}>{winner===player?'🏆':'🎈'}</div>
        <h2 style={{ fontSize:28, margin:'12px 0 4px', color:'#1e293b' }}>{winner===player?'You Won!':`${winner} Wins!`}</h2>
        <div style={{ width:'100%', maxWidth:320, marginTop:24 }}>
          {scoreboard.map((name, i) => {
            const pi = safe(players, name, i)
            return <div key={name} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background: name===player?pi.light:'#fff', border:`2px solid ${pi.color}`, borderRadius:12, padding:'10px 16px', marginBottom:8, fontWeight:name===winner?'bold':'normal' }}>
              <span style={{ fontSize:22 }}>{i===0?'🥇':i===1?'🥈':'🥉'}</span>
              <span style={{ color:pi.color, fontSize:16 }}>{pi.emoji} {name}</span>
              <span style={{ fontSize:20, fontWeight:'bold' }}>{scores[name]??0} pts</span>
            </div>
          })}
        </div>
        <div style={{ display:'flex', gap:12, marginTop:28 }}>
          <button onClick={onBack} style={{ background:'#e2e8f0', border:'none', borderRadius:12, padding:'12px 24px', fontSize:16, cursor:'pointer' }}>← Back</button>
          <button onClick={() => send({ type:'reset' })} style={{ background:me.color, color:'#fff', border:'none', borderRadius:12, padding:'12px 24px', fontSize:16, fontWeight:'bold', cursor:'pointer' }}>🔄 Play Again</button>
        </div>
      </div>
    )
  }

  // playing
  return (
    <div style={{ minHeight:'100vh', background: me.bg, display:'flex', flexDirection:'column', alignItems:'center', fontFamily:'sans-serif', userSelect:'none' }}>
      <div style={{ width:'100%', maxWidth:400, display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 16px', background:'rgba(255,255,255,0.85)', borderBottom:'1px solid #e2e8f0', flexWrap:'wrap', gap:4 }}>
        {connected.map((name, i) => {
          const pi = safe(players, name, i)
          return <div key={name} style={{ display:'flex', alignItems:'center', gap:4, background:name===player?pi.light:'transparent', borderRadius:8, padding:'2px 8px' }}>
            <span style={{ fontSize:18 }}>{pi.emoji}</span>
            <span style={{ fontWeight:'bold', color:pi.color, fontSize:14 }}>{name}</span>
            <span style={{ fontWeight:'bold', color:'#1e293b', fontSize:16 }}>{scores[name]??0}</span>
          </div>
        })}
        <div style={{ fontWeight:'bold', color:'#ef4444', fontSize:18, marginLeft:'auto' }}>⏱ {time_left}s</div>
      </div>
      {status ? <div style={{ background:'#fef2f2', color:'#ef4444', fontSize:13, padding:'4px 16px', width:'100%', textAlign:'center' }}>{status}</div> : null}
      <canvas ref={canvasRef} style={{ touchAction:'none', maxWidth:'100%', display:'block', cursor:'pointer' }} onPointerDown={handleTap} />
    </div>
  )
}