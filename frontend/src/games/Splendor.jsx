import { useState, useEffect, useRef, useCallback } from 'react'
import { vibrate, VIBRATIONS } from '../vibrate'
import { playSound } from '../sounds'

const WS_PROTOCOL = location.protocol === 'https:' ? 'wss' : 'ws'
const WS_URL = `${WS_PROTOCOL}://${location.host}/api/splendor/ws`

const FALLBACKS = [
  { color: '#16a34a', light: '#dcfce7', emoji: '🦁' },
  { color: '#db2777', light: '#fce7f3', emoji: '🦋' },
  { color: '#2563eb', light: '#dbeafe', emoji: '🦊' },
  { color: '#d97706', light: '#fef3c7', emoji: '🌸' },
  { color: '#7c3aed', light: '#ede9fe', emoji: '🧔' },
  { color: '#0891b2', light: '#cffafe', emoji: '👩' },
]
function safe(players, name, idx = 0) {
  if (players?.[name]) return players[name]
  return FALLBACKS[idx % FALLBACKS.length]
}

const GEM = {
  white: { c1: '#f8fafc', c2: '#cbd5e1', c3: '#94a3b8', text: '#1e293b', name: 'Diamond'  },
  blue:  { c1: '#60a5fa', c2: '#1d4ed8', c3: '#1e3a8a', text: '#fff',    name: 'Sapphire' },
  green: { c1: '#4ade80', c2: '#15803d', c3: '#14532d', text: '#fff',    name: 'Emerald'  },
  red:   { c1: '#f87171', c2: '#dc2626', c3: '#991b1b', text: '#fff',    name: 'Ruby'     },
  black: { c1: '#64748b', c2: '#1e293b', c3: '#0f172a', text: '#fff',    name: 'Onyx'     },
  gold:  { c1: '#fde68a', c2: '#f59e0b', c3: '#b45309', text: '#1e293b', name: 'Gold'     },
}
const BONUS_COLOR = {
  white: '#e2e8f0', blue: '#3b82f6', green: '#22c55e', red: '#ef4444', black: '#64748b',
}

// ── Card Art ──────────────────────────────────────────────────────────────────
function CardArt({ bonus, tier, width = 90, height = 120 }) {
  const scenes = {
    white: ['#0f1b2d','#1e3a5f','#60a5fa'],
    blue:  ['#020c1a','#0c2040','#1d4ed8'],
    green: ['#071a0e','#14532d','#15803d'],
    red:   ['#1a0505','#3d0a0a','#dc2626'],
    black: ['#050a0f','#0f172a','#1e293b'],
  }
  const [bg, mid, acc] = scenes[bonus] || scenes.white
  const seed = (bonus.charCodeAt(0) + tier * 7)

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
      style={{ borderRadius: 6, display: 'block' }}>
      <defs>
        <clipPath id={`cp${width}${height}${bonus}${tier}`}>
          <rect width={width} height={height} rx="6"/>
        </clipPath>
        <radialGradient id={`rg${bonus}${tier}`} cx="50%" cy="30%">
          <stop offset="0%" stopColor={acc} stopOpacity="0.6"/>
          <stop offset="100%" stopColor={bg} stopOpacity="0"/>
        </radialGradient>
      </defs>
      <g clipPath={`url(#cp${width}${height}${bonus}${tier})`}>
        <rect width={width} height={height} fill={bg}/>
        <rect width={width} height={height} fill={`url(#rg${bonus}${tier})`}/>
        {/* Tier decorative elements */}
        {tier === 1 && <>
          {/* Simple gem scene */}
          <polygon points={`${width/2},${height*0.18} ${width/2+16},${height*0.38} ${width/2},${height*0.55} ${width/2-16},${height*0.38}`}
            fill={acc} opacity="0.8"/>
          <polygon points={`${width/2},${height*0.18} ${width/2+16},${height*0.38} ${width/2},${height*0.3}`}
            fill="white" opacity="0.3"/>
          <rect x={width*0.3} y={height*0.65} width={width*0.4} height={height*0.2} rx="2" fill={mid} opacity="0.7"/>
          {[0,1,2].map(i=><line key={i} x1={width*0.35+i*width*0.1} y1={height*0.65} x2={width*0.35+i*width*0.1} y2={height*0.85} stroke={acc} strokeWidth="0.5" opacity="0.4"/>)}
        </>}
        {tier === 2 && <>
          {/* Ship or building scene */}
          <path d={`M${width*0.1},${height*0.6} L${width*0.2},${height*0.35} L${width*0.8},${height*0.35} L${width*0.9},${height*0.6} Z`}
            fill={mid} stroke={acc} strokeWidth="0.8"/>
          <line x1={width*0.5} y1={height*0.6} x2={width*0.5} y2={height*0.1} stroke={acc} strokeWidth="1"/>
          <path d={`M${width*0.5},${height*0.1} L${width*0.75},${height*0.25} L${width*0.5},${height*0.3} Z`}
            fill="white" opacity="0.5"/>
          <path d={`M${width*0.5},${height*0.12} L${width*0.28},${height*0.25} L${width*0.5},${height*0.3} Z`}
            fill="white" opacity="0.35"/>
          {[0.6,0.68,0.76,0.84].map((y,i)=>
            <line key={i} x1="0" y1={height*y} x2={width} y2={height*y} stroke={acc} strokeWidth="0.4" opacity={0.2+i*0.05}/>)}
        </>}
        {tier === 3 && <>
          {/* Grand palace / castle */}
          <rect x={width*0.1} y={height*0.3} width={width*0.8} height={height*0.6} fill={mid} opacity="0.8"/>
          {[0.15,0.3,0.5,0.7,0.85].map((x,i)=><g key={i}>
            <rect x={width*x-3} y={height*0.3} width="6" height={height*0.55} fill={acc} opacity="0.5"/>
            <rect x={width*x-5} y={height*0.28} width="10" height="4" fill={acc} opacity="0.7"/>
          </g>)}
          <polygon points={`${width*0.1},${height*0.3} ${width*0.5},${height*0.06} ${width*0.9},${height*0.3}`}
            fill={mid} stroke={acc} strokeWidth="0.5" opacity="0.9"/>
          {[0.2,0.4,0.6,0.8].map((x,i)=><circle key={i} cx={width*x} cy={height*(0.05+i*0.02)} r="0.8" fill="white" opacity="0.4"/>)}
          <line x1={width*0.1} y1={height*0.3} x2={width*0.9} y2={height*0.3} stroke={acc} strokeWidth="1" opacity="0.6"/>
        </>}
        {/* Subtle vignette */}
        <rect width={width} height={height} fill="rgba(0,0,0,0.15)"
          style={{background:'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.5) 100%)'}}/>
      </g>
    </svg>
  )
}

// ── 3D Gem ────────────────────────────────────────────────────────────────────
function GemChip3D({ gem, count=0, size=52, onClick, selected, disabled, showZero=false }) {
  const g = GEM[gem]
  if (!showZero && count===0 && !selected) return null
  const clickable = onClick && !disabled && (count>0||selected)
  return (
    <div onClick={clickable ? ()=>{vibrate([10]);onClick()} : undefined} style={{
      position:'relative', width:size, height:size, flexShrink:0,
      cursor:clickable?'pointer':'default',
      transform:selected?'scale(1.15) translateY(-4px)':'scale(1)',
      transition:'all 0.2s cubic-bezier(0.34,1.56,0.64,1)',
      filter:disabled&&!selected?'brightness(0.4)':'none',
    }}>
      <svg width={size} height={size} viewBox="0 0 52 52">
        <defs>
          <linearGradient id={`gg${gem}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={g.c1} stopOpacity="0.7"/>
            <stop offset="100%" stopColor={g.c2} stopOpacity="0"/>
          </linearGradient>
        </defs>
        <ellipse cx="26" cy="48" rx="20" ry="4" fill="rgba(0,0,0,0.4)"/>
        <ellipse cx="26" cy="32" rx="20" ry="8" fill={g.c3}/>
        <rect x="6" y="14" width="40" height="18" fill={g.c2}/>
        <rect x="6" y="14" width="40" height="12" fill={`url(#gg${gem})`}/>
        <ellipse cx="26" cy="14" rx="20" ry="8" fill={g.c1}/>
        <ellipse cx="20" cy="11" rx="7" ry="3" fill="rgba(255,255,255,0.4)" transform="rotate(-20,20,11)"/>
        <text x="26" y="18" textAnchor="middle" dominantBaseline="middle"
          fontSize="11" fontWeight="900" fill={g.text}>{gem==='gold'?'★':'◈'}</text>
        {selected && <>
          <ellipse cx="26" cy="14" rx="20" ry="8" fill="rgba(251,191,36,0.35)" stroke="#fbbf24" strokeWidth="2"/>
        </>}
      </svg>
      {count>0 && <div style={{
        position:'absolute', bottom:2, right:0,
        background:'#0f172a', color:'#fff', borderRadius:'50%',
        width:18, height:18, fontSize:10, fontWeight:900,
        display:'flex', alignItems:'center', justifyContent:'center',
        border:`1.5px solid ${g.c2}`, boxShadow:'0 2px 4px #000',
      }}>{count}</div>}
    </div>
  )
}

// ── Card ──────────────────────────────────────────────────────────────────────
function Card({ card, onClick, selected, width=90, height=128, small=false, hidden=false }) {
  const w = small?64:width, h = small?90:height
  if (!card) return (
    <div style={{ width:w, height:h, borderRadius:8, flexShrink:0,
      background:'linear-gradient(135deg,#0f1e35,#060d14)', border:'1px dashed #1e3a5f',
      display:'flex', alignItems:'center', justifyContent:'center' }}>
      <span style={{ color:'#1e3a5f', fontSize:18 }}>✦</span>
    </div>
  )
  if (hidden) return (
    <div style={{ width:w, height:h, borderRadius:8, flexShrink:0,
      background:'repeating-linear-gradient(45deg,#0a1628,#0a1628 4px,#0f1e35 4px,#0f1e35 8px)',
      border:'1px solid #1e3a5f', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <span style={{ color:'#1e3a5f', fontSize:16 }}>?</span>
    </div>
  )
  const bColor = BONUS_COLOR[card.bonus]||'#94a3b8'
  const costs = ['white','blue','green','red','black'].filter(g=>card.cost[g]>0)
  return (
    <div onClick={onClick} style={{
      width:w, height:h, borderRadius:8, flexShrink:0,
      position:'relative', overflow:'hidden',
      border:`2px solid ${selected?'#fbbf24':'rgba(255,255,255,0.08)'}`,
      cursor:onClick?'pointer':'default',
      transform:selected?'scale(1.06) translateY(-3px)':'scale(1)',
      transition:'all 0.2s cubic-bezier(0.34,1.56,0.64,1)',
      boxShadow:selected?'0 12px 32px rgba(251,191,36,0.4)':'0 6px 20px rgba(0,0,0,0.6)',
    }}>
      <CardArt bonus={card.bonus} tier={card.tier} width={w} height={h}/>
      {card.vp>0 && <div style={{
        position:'absolute', top:4, right:4,
        background:'rgba(0,0,0,0.8)', backdropFilter:'blur(4px)',
        borderRadius:6, padding:'2px 6px',
        color:'#fbbf24', fontSize:small?11:14, fontWeight:900,
        border:'1px solid rgba(251,191,36,0.4)',
      }}>{card.vp}</div>}
      <div style={{
        position:'absolute', top:4, left:4,
        width:small?10:13, height:small?10:13, borderRadius:'50%',
        background:bColor, border:'1.5px solid rgba(255,255,255,0.3)',
        boxShadow:`0 0 6px ${bColor}88`,
      }}/>
      <div style={{
        position:'absolute', bottom:0, left:0, right:0,
        background:'linear-gradient(to top,rgba(0,0,0,0.92) 0%,transparent 100%)',
        padding:small?'4px 3px 3px':'6px 4px 4px',
        display:'flex', gap:2, justifyContent:'flex-end', flexWrap:'wrap',
      }}>
        {costs.map(g=>(
          <div key={g} style={{
            display:'flex', alignItems:'center', gap:1,
            background:GEM[g].c2, borderRadius:3, padding:small?'1px 3px':'2px 4px',
            border:`1px solid ${GEM[g].c1}44`,
          }}>
            <div style={{ width:small?5:7, height:small?5:7, borderRadius:'50%', background:GEM[g].c1 }}/>
            <span style={{ color:GEM[g].text, fontSize:small?8:10, fontWeight:900 }}>{card.cost[g]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Noble ─────────────────────────────────────────────────────────────────────
function Noble({ noble, size=72 }) {
  const reqs = ['white','blue','green','red','black'].filter(g=>noble.req[g]>0)
  return (
    <div style={{
      width:size, height:size, borderRadius:8, flexShrink:0,
      background:'linear-gradient(135deg,#1c0f00,#3d1f00)',
      border:'2px solid #f59e0b',
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      gap:4, padding:6, boxShadow:'0 4px 20px rgba(245,158,11,0.3)', position:'relative',
    }}>
      <div style={{ position:'absolute', inset:3, border:'1px solid rgba(245,158,11,0.25)', borderRadius:6 }}/>
      <span style={{ color:'#fbbf24', fontSize:size*0.2, fontWeight:900, zIndex:1 }}>👑 {noble.vp}</span>
      <div style={{ display:'flex', gap:2, zIndex:1 }}>
        {reqs.map(g=>(
          <div key={g} style={{
            background:GEM[g].c2, borderRadius:3, padding:'1px 4px',
            fontSize:size*0.13, fontWeight:900, color:GEM[g].text,
            display:'flex', alignItems:'center', gap:2,
          }}>
            <div style={{ width:5,height:5,borderRadius:'50%',background:GEM[g].c1 }}/>
            {noble.req[g]}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Lobby ─────────────────────────────────────────────────────────────────────
function Lobby({ player, players, connected, host, onStart, onBack }) {
  const p = safe(players, player, 0)
  const isHost = player===host, canStart = connected.length>=2
  const [tick, setTick] = useState(0)
  useEffect(()=>{ const t=setInterval(()=>setTick(n=>n+1),800); return()=>clearInterval(t) },[])
  return (
    <div style={{
      minHeight:'100vh',
      background:'radial-gradient(ellipse at 50% -20%,#1a3a0a 0%,#0a1a10 40%,#060a06 100%)',
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      padding:24, fontFamily:"'Georgia',serif", position:'relative', overflow:'hidden',
    }}>
      {['white','blue','green','red','black'].map((gem,i)=>(
        <div key={gem} style={{
          position:'absolute', left:`${12+i*18}%`,
          top:`${(tick*1.5+i*22)%115-10}%`,
          opacity:0.05, transition:'top 0.8s linear', pointerEvents:'none',
        }}><GemChip3D gem={gem} count={0} size={38} showZero/></div>
      ))}
      <button onClick={onBack} style={{
        position:'absolute', top:20, left:20,
        background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)',
        borderRadius:8, color:'#6ee7b7', fontSize:13, fontWeight:700, cursor:'pointer', padding:'6px 14px',
      }}>← Back</button>
      <div style={{ textAlign:'center', marginBottom:36, zIndex:1 }}>
        <div style={{ fontSize:52, marginBottom:10, filter:'drop-shadow(0 0 20px rgba(245,158,11,0.6))' }}>💎</div>
        <h1 style={{
          margin:0, fontSize:44, letterSpacing:8, textTransform:'uppercase', fontWeight:900,
          background:'linear-gradient(135deg,#f59e0b 0%,#fde68a 40%,#f59e0b 60%,#d97706 100%)',
          WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
        }}>SPLENDOR</h1>
        <div style={{ color:'#6ee7b7', fontSize:11, letterSpacing:4, marginTop:8, opacity:0.7 }}>
          THE RENAISSANCE GEM TRADING GAME
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:14, justifyContent:'center' }}>
          <div style={{ height:1, width:50, background:'linear-gradient(to right,transparent,#f59e0b)' }}/>
          <span style={{ color:'#f59e0b' }}>✦</span>
          <div style={{ height:1, width:50, background:'linear-gradient(to left,transparent,#f59e0b)' }}/>
        </div>
      </div>
      <div style={{ display:'flex', gap:8, marginBottom:32, zIndex:1 }}>
        {['white','blue','green','red','black','gold'].map((gem,i)=>(
          <div key={gem} style={{ transform:`translateY(${Math.sin((tick+i)*0.7)*3}px)`, transition:'transform 0.5s ease' }}>
            <GemChip3D gem={gem} count={0} size={38} showZero/>
          </div>
        ))}
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:10, width:'100%', maxWidth:340, marginBottom:28, zIndex:1 }}>
        {connected.map((name,i)=>{
          const pp=safe(players,name,i)
          return (
            <div key={name} style={{
              display:'flex', alignItems:'center', gap:12,
              background:'rgba(255,255,255,0.04)', border:`1px solid ${pp.color}33`,
              borderRadius:12, padding:'11px 16px', backdropFilter:'blur(8px)',
            }}>
              <span style={{ fontSize:24 }}>{pp.emoji}</span>
              <span style={{ fontWeight:700, color:pp.color, flex:1, fontSize:15 }}>{name}</span>
              {name===host && <span style={{
                fontSize:9, color:'#f59e0b', fontWeight:700, letterSpacing:1,
                border:'1px solid #f59e0b44', borderRadius:3, padding:'2px 7px', textTransform:'uppercase',
              }}>Host</span>}
              <div style={{ width:7,height:7,borderRadius:'50%',background:'#22c55e',boxShadow:'0 0 5px #22c55e' }}/>
            </div>
          )
        })}
        {connected.length<4 && (
          <div style={{
            display:'flex', alignItems:'center', gap:12, background:'rgba(255,255,255,0.02)',
            border:'1px dashed #1e3a2a', borderRadius:12, padding:'11px 16px',
          }}>
            <span style={{ fontSize:24, opacity:0.2 }}>👤</span>
            <span style={{ color:'#2d5a40', fontSize:13 }}>Waiting... ({connected.length}/4 max)</span>
          </div>
        )}
      </div>
      {isHost ? (
        <button onClick={onStart} disabled={!canStart} style={{
          padding:'15px 52px', borderRadius:12, border:'none', zIndex:1,
          background:canStart?'linear-gradient(135deg,#f59e0b 0%,#fbbf24 50%,#d97706 100%)':'rgba(255,255,255,0.04)',
          color:canStart?'#1a0f00':'#2d4a3a', fontSize:15, fontWeight:900,
          cursor:canStart?'pointer':'not-allowed', fontFamily:'Georgia,serif',
          letterSpacing:2, textTransform:'uppercase',
          boxShadow:canStart?'0 8px 32px rgba(245,158,11,0.5)':'none',
          transition:'all 0.3s',
        }}>
          {canStart?'✦ Begin the Game ✦':`Need ${2-connected.length} more player${connected.length<1?'s':''}`}
        </button>
      ) : (
        <div style={{ color:'#6ee7b7', fontWeight:700, fontSize:13, textAlign:'center', letterSpacing:1, zIndex:1, opacity:0.8 }}>
          ⏳ Waiting for {host} to start...
        </div>
      )}
    </div>
  )
}

// ── Result ────────────────────────────────────────────────────────────────────
function Result({ state, player, players, onRestart, onBack, isHost }) {
  const sorted=[...(state.players||[])].sort((a,b)=>(state.hands[b]?.vp||0)-(state.hands[a]?.vp||0))
  const medals=['🥇','🥈','🥉','4️⃣']
  return (
    <div style={{
      minHeight:'100vh',
      background:'radial-gradient(ellipse at 50% 0%,#1a3a0a 0%,#0a1a10 50%,#060a06 100%)',
      display:'flex', flexDirection:'column', alignItems:'center', padding:'48px 24px', fontFamily:'Georgia,serif',
    }}>
      <div style={{ fontSize:60, marginBottom:8, filter:'drop-shadow(0 0 24px rgba(245,158,11,0.6))' }}>🏆</div>
      <h2 style={{
        fontSize:30, fontWeight:900, margin:'0 0 6px', letterSpacing:4, textTransform:'uppercase',
        background:'linear-gradient(135deg,#f59e0b,#fbbf24)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
      }}>Victory</h2>
      <p style={{ color:'#6ee7b7', fontSize:13, marginBottom:36, letterSpacing:2 }}>{state.winner} claims the Renaissance!</p>
      <div style={{ display:'flex', flexDirection:'column', gap:10, width:'100%', maxWidth:400, marginBottom:36 }}>
        {sorted.map((name,rank)=>{
          const pp=safe(players,name,(state.players||[]).indexOf(name))
          const h=state.hands[name], isMe=name===player
          return (
            <div key={name} style={{
              background:isMe?'rgba(245,158,11,0.07)':'rgba(255,255,255,0.03)',
              border:`1px solid ${isMe?'#f59e0b44':'#1e3a2a'}`,
              borderRadius:14, padding:'14px 18px', display:'flex', alignItems:'center', gap:12,
            }}>
              <span style={{ fontSize:26 }}>{medals[rank]}</span>
              <span style={{ fontSize:22 }}>{pp.emoji}</span>
              <div style={{ flex:1 }}>
                <div style={{ color:pp.color, fontWeight:700, fontSize:15 }}>{name}</div>
                <div style={{ color:'#475569', fontSize:11, marginTop:2 }}>{h?.cards?.length||0} cards · {h?.nobles?.length||0} nobles</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ color:'#fbbf24', fontSize:26, fontWeight:900 }}>{h?.vp||0}</div>
                <div style={{ color:'#475569', fontSize:10 }}>VP</div>
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ display:'flex', gap:12 }}>
        {isHost && <button onClick={onRestart} style={{
          padding:'13px 30px', borderRadius:12, border:'none',
          background:'linear-gradient(135deg,#f59e0b,#d97706)', color:'#1a0f00',
          fontSize:14, fontWeight:900, cursor:'pointer', fontFamily:'Georgia,serif',
          boxShadow:'0 6px 24px rgba(245,158,11,0.4)',
        }}>🔄 Play Again</button>}
        <button onClick={onBack} style={{
          padding:'13px 30px', borderRadius:12, border:'1px solid #1e3a2a',
          background:'transparent', color:'#6ee7b7', fontSize:14, fontWeight:700,
          cursor:'pointer', fontFamily:'Georgia,serif',
        }}>← Hub</button>
      </div>
    </div>
  )
}

// ── Game Board ────────────────────────────────────────────────────────────────
function GameBoard({ state, player, players, onAction, onBack }) {
  const [selectedGems, setSelectedGems] = useState({})
  const [selectedCard, setSelectedCard] = useState(null)
  const [error, setError] = useState('')
  const myHand=state.hands?.[player]||{}, myBonus=myHand.bonus||{}
  const isMyTurn=state.current===player
  const gems=['white','blue','green','red','black']

  const showError=msg=>{setError(msg);setTimeout(()=>setError(''),2500)}
  const clearSel=()=>{setSelectedGems({});setSelectedCard(null)}

  const toggleGem=gem=>{
    if(!isMyTurn) return
    const bank=state.bank||{}, cur=selectedGems[gem]||0
    const total=Object.values(selectedGems).reduce((a,b)=>a+b,0)
    if(cur===1&&total===1){
      if((bank[gem]||0)<4){showError(`Need 4 ${GEM[gem].name}s in bank`);return}
      setSelectedGems({[gem]:2});return
    }
    if(cur>0){const n={...selectedGems};delete n[gem];setSelectedGems(n);return}
    if(total>=3){showError('Max 3 different gems');return}
    if((bank[gem]||0)<=0){showError(`No ${GEM[gem].name}s`);return}
    setSelectedGems({...selectedGems,[gem]:1})
  }

  const canAfford=card=>{
    if(!card||card.hidden) return false
    const hand=myHand.gems||{}; let gold=0
    for(const g of gems){ const need=Math.max(0,(card.cost[g]||0)-(myBonus[g]||0)); gold+=Math.max(0,need-(hand[g]||0)) }
    return gold<=(hand.gold||0)
  }

  const selectedGemTotal=Object.values(selectedGems).reduce((a,b)=>a+b,0)
  const myGemTotal=Object.values(myHand.gems||{}).reduce((a,b)=>a+b,0)

  return (
    <div style={{ minHeight:'100vh', background:'#060a06', fontFamily:'Georgia,serif', userSelect:'none', paddingBottom:160 }}>
      {/* Top bar */}
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px',
        background:'rgba(6,10,6,0.9)', borderBottom:'1px solid #0e1f0e', position:'sticky', top:0, zIndex:50,
      }}>
        <button onClick={onBack} style={{
          background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)',
          borderRadius:8, color:'#6ee7b7', fontSize:12, fontWeight:700, cursor:'pointer', padding:'5px 12px',
        }}>← Back</button>
        <div style={{
          fontSize:12, fontWeight:900, letterSpacing:3, textTransform:'uppercase',
          background:'linear-gradient(135deg,#f59e0b,#fbbf24)',
          WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
        }}>SPLENDOR</div>
        <div style={{
          fontSize:11, fontWeight:700, letterSpacing:1, padding:'4px 10px', borderRadius:8,
          color:isMyTurn?'#6ee7b7':'#475569',
          background:isMyTurn?'rgba(110,231,183,0.1)':'transparent',
          border:isMyTurn?'1px solid rgba(110,231,183,0.25)':'1px solid transparent',
        }}>{isMyTurn?'✦ YOUR TURN':`${state.current}'s turn`}</div>
      </div>

      {error && <div style={{
        position:'fixed', top:52, left:'50%', transform:'translateX(-50%)',
        background:'#7f1d1d', color:'#fca5a5', borderRadius:10, padding:'8px 20px',
        fontSize:13, fontWeight:700, zIndex:200, border:'1px solid #dc262688',
        boxShadow:'0 8px 32px rgba(220,38,38,0.4)',
      }}>{error}</div>}

      {state.final_round && <div style={{
        background:'rgba(245,158,11,0.12)', borderBottom:'1px solid rgba(245,158,11,0.3)',
        padding:'7px 16px', textAlign:'center', color:'#fbbf24', fontSize:12, fontWeight:700, letterSpacing:1,
      }}>⚡ FINAL ROUND — {state.final_trigger} reached 15 VP!</div>}

      {/* Opponents */}
      <div style={{ padding:'8px 12px', display:'flex', gap:8, overflowX:'auto' }}>
        {(state.players||[]).filter(n=>n!==player).map(name=>{
          const pp=safe(players,name,(state.players||[]).indexOf(name))
          const h=state.hands?.[name]||{}, cur=state.current===name
          return (
            <div key={name} style={{
              flexShrink:0, minWidth:130,
              background:cur?'rgba(245,158,11,0.07)':'rgba(255,255,255,0.03)',
              border:`1px solid ${cur?'#f59e0b44':'#1e3a2a'}`, borderRadius:12, padding:'9px 12px',
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
                <span style={{ fontSize:16 }}>{pp.emoji}</span>
                <span style={{ color:pp.color, fontWeight:700, fontSize:12, flex:1 }}>{name}</span>
                <span style={{ color:'#fbbf24', fontWeight:900, fontSize:15 }}>{h.vp||0}</span>
                <span style={{ color:'#475569', fontSize:9 }}>VP</span>
              </div>
              <div style={{ display:'flex', gap:3, flexWrap:'wrap', marginBottom:3 }}>
                {gems.map(g=>{
                  const b=(h.bonus||{})[g]||0, gc=(h.gems||{})[g]||0
                  return (b>0||gc>0)?(<div key={g} style={{ display:'flex', flexDirection:'column', gap:1, alignItems:'center' }}>
                    {b>0&&<div style={{ background:BONUS_COLOR[g],borderRadius:2,padding:'0px 3px',fontSize:7,fontWeight:900,color:g==='white'?'#1e293b':'#fff' }}>{b}</div>}
                    {gc>0&&<div style={{ width:13,height:13,borderRadius:'50%',background:GEM[g].c2,border:`1px solid ${GEM[g].c1}33`,fontSize:7,fontWeight:900,color:GEM[g].text,display:'flex',alignItems:'center',justifyContent:'center' }}>{gc}</div>}
                  </div>):null
                })}
                {(h.gems?.gold||0)>0&&<div style={{ width:13,height:13,borderRadius:'50%',background:GEM.gold.c2,fontSize:7,fontWeight:900,color:'#1e293b',display:'flex',alignItems:'center',justifyContent:'center' }}>{h.gems.gold}</div>}
              </div>
              <div style={{ color:'#334155', fontSize:9 }}>{h.cards?.length||0} cards · {h.reserved?.length||0} reserved</div>
            </div>
          )
        })}
      </div>

      {/* Nobles */}
      <div style={{ padding:'4px 12px 10px' }}>
        <div style={{ color:'#f59e0b', fontSize:9, fontWeight:700, letterSpacing:2, marginBottom:8, textTransform:'uppercase' }}>✦ Nobles</div>
        <div style={{ display:'flex', gap:8 }}>{(state.nobles||[]).map(n=><Noble key={n.id} noble={n} size={66}/>)}</div>
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'0 12px 8px' }}>
        <div style={{ flex:1, height:1, background:'linear-gradient(to right,transparent,#1e3a2a)' }}/>
        <span style={{ color:'#1e3a2a', fontSize:10 }}>✦</span>
        <div style={{ flex:1, height:1, background:'linear-gradient(to left,transparent,#1e3a2a)' }}/>
      </div>

      {/* Board */}
      {[3,2,1].map(tier=>(
        <div key={tier} style={{ padding:'4px 12px 8px' }}>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <div style={{
              width:48, height:68, borderRadius:8, flexShrink:0,
              background:`linear-gradient(135deg,${['','#7c3aed','#1d4ed8','#15803d'][tier]}22,#060a06)`,
              border:`1px solid ${['','#7c3aed44','#1d4ed844','#15803d44'][tier]}`,
              display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:3,
              cursor:isMyTurn&&(myHand.reserved?.length||0)<3?'pointer':'default',
            }} onClick={()=>{
              if(isMyTurn&&(myHand.reserved?.length||0)<3){onAction({type:'reserve_card',card_id:-tier});clearSel()}
            }}>
              <span style={{ color:['','#8b5cf6','#60a5fa','#4ade80'][tier], fontSize:9, fontWeight:700, letterSpacing:1 }}>{['','III','II','I'][tier]}</span>
              <span style={{ color:'#94a3b8', fontSize:14, fontWeight:700 }}>{state.deck_counts?.[tier]||0}</span>
            </div>
            {(state.board?.[tier]||[]).map(card=>(
              <Card key={card.id} card={card} selected={selectedCard?.id===card.id}
                onClick={()=>{
                  if(!isMyTurn||!card) return
                  if(selectedCard?.id===card.id){clearSel();return}
                  setSelectedCard({...card,fromReserve:false});setSelectedGems({})
                }} width={78} height={110}/>
            ))}
            {Array.from({length:Math.max(0,4-(state.board?.[tier]?.length||0))}).map((_,i)=>(
              <Card key={`e${i}`} card={null} width={78} height={110}/>
            ))}
          </div>
        </div>
      ))}

      {/* Bank */}
      <div style={{ padding:'8px 12px 4px' }}>
        <div style={{ color:'#6ee7b7', fontSize:9, fontWeight:700, letterSpacing:2, marginBottom:8, textTransform:'uppercase' }}>
          {isMyTurn&&selectedGemTotal===0&&!selectedCard?'✦ Tap gems to take':'✦ Bank'}
        </div>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {[...gems,'gold'].map(g=>(
            <GemChip3D key={g} gem={g} count={state.bank?.[g]||0} size={50}
              selected={!!(selectedGems[g])}
              onClick={g!=='gold'&&isMyTurn?()=>toggleGem(g):undefined}
              disabled={!isMyTurn||(state.bank?.[g]||0)===0}/>
          ))}
        </div>
        {selectedGemTotal>0&&<button onClick={()=>{onAction({type:'take_gems',gems:selectedGems});clearSel()}} style={{
          marginTop:10, padding:'10px 24px', borderRadius:10, border:'none',
          background:'linear-gradient(135deg,#f59e0b,#d97706)', color:'#1a0f00',
          fontSize:14, fontWeight:900, cursor:'pointer', fontFamily:'Georgia,serif',
          boxShadow:'0 4px 16px rgba(245,158,11,0.4)',
        }}>Take {selectedGemTotal} Gem{selectedGemTotal>1?'s':''} ✓</button>}
      </div>

      {/* Fixed bottom hand */}
      <div style={{
        position:'fixed', bottom:0, left:0, right:0, zIndex:100,
        background:'rgba(4,8,4,0.98)', borderTop:'1px solid #1e3a2a',
        backdropFilter:'blur(16px)', padding:'10px 12px 12px',
      }}>
        <div style={{ display:'flex', alignItems:'flex-end', gap:6, marginBottom:8, overflowX:'auto' }}>
          <div style={{ flexShrink:0 }}>
            <div style={{ color:'#334155', fontSize:9, letterSpacing:1, marginBottom:3 }}>GEMS {myGemTotal}/10</div>
            <div style={{ display:'flex', gap:3 }}>
              {[...gems,'gold'].map(g=>{
                const count=(myHand.gems||{})[g]||0, bonus=g!=='gold'?(myBonus[g]||0):0
                return (count>0||bonus>0)?(
                  <div key={g} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
                    {bonus>0&&<div style={{ background:BONUS_COLOR[g],borderRadius:2,padding:'1px 4px',fontSize:8,fontWeight:900,color:g==='white'?'#1e293b':'#fff' }}>{bonus}</div>}
                    <GemChip3D gem={g} count={count} size={34}/>
                  </div>
                ):null
              })}
            </div>
          </div>
          <div style={{ marginLeft:'auto', flexShrink:0, textAlign:'right' }}>
            <div style={{ color:'#334155', fontSize:9, letterSpacing:1 }}>SCORE</div>
            <div style={{ color:'#fbbf24', fontSize:24, fontWeight:900, lineHeight:1 }}>{myHand.vp||0}</div>
            <div style={{ color:'#334155', fontSize:9 }}>VP</div>
          </div>
        </div>
        {(myHand.reserved?.length||0)>0&&(
          <div style={{ display:'flex', gap:6, marginBottom:8, alignItems:'center' }}>
            <span style={{ color:'#334155', fontSize:9, letterSpacing:1, flexShrink:0 }}>RESERVED</span>
            {myHand.reserved.map(c=>(
              <Card key={c.id} card={c} small selected={selectedCard?.id===c.id}
                onClick={()=>{
                  if(!isMyTurn) return
                  if(selectedCard?.id===c.id){clearSel();return}
                  setSelectedCard({...c,fromReserve:true});setSelectedGems({})
                }}/>
            ))}
          </div>
        )}
        {selectedCard&&isMyTurn&&!selectedCard.hidden&&(
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={()=>{onAction({type:'buy_card',card_id:selectedCard.id,from_reserve:selectedCard.fromReserve});clearSel()}}
              disabled={!canAfford(selectedCard)} style={{
              flex:1, padding:'10px', borderRadius:10, border:'none',
              background:canAfford(selectedCard)?'linear-gradient(135deg,#f59e0b,#d97706)':'rgba(255,255,255,0.04)',
              color:canAfford(selectedCard)?'#1a0f00':'#2d4a3a', fontSize:14, fontWeight:900,
              cursor:canAfford(selectedCard)?'pointer':'not-allowed', fontFamily:'Georgia,serif',
              boxShadow:canAfford(selectedCard)?'0 4px 16px rgba(245,158,11,0.4)':'none',
            }}>💎 Buy Card</button>
            {!selectedCard.fromReserve&&(myHand.reserved?.length||0)<3&&(
              <button onClick={()=>{onAction({type:'reserve_card',card_id:selectedCard.id});clearSel()}} style={{
                flex:1, padding:'10px', borderRadius:10, border:'1px solid #1e3a2a',
                background:'rgba(255,255,255,0.03)', color:'#6ee7b7', fontSize:14,
                fontWeight:900, cursor:'pointer', fontFamily:'Georgia,serif',
              }}>📋 Reserve</button>
            )}
            <button onClick={clearSel} style={{
              padding:'10px 14px', borderRadius:10, border:'1px solid #1e3a2a',
              background:'transparent', color:'#475569', fontSize:14, cursor:'pointer',
            }}>✕</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function Splendor({ player, players, onBack }) {
  const [state, setState] = useState(null)
  const wsRef=useRef(null), mountedRef=useRef(true)
  const connect=useCallback(()=>{
    const ws=new WebSocket(`${WS_URL}/${player}`)
    wsRef.current=ws
    ws.onmessage=e=>{ if(!mountedRef.current) return; const d=JSON.parse(e.data); if(!d.error) setState(d) }
    ws.onclose=()=>{ if(mountedRef.current) setTimeout(connect,2000) }
    ws.onerror=()=>ws.close()
  },[player])
  useEffect(()=>{
    mountedRef.current=true; connect()
    return()=>{ mountedRef.current=false; wsRef.current?.close() }
  },[connect])
  const send=msg=>wsRef.current?.send(JSON.stringify(msg))
  if(!state) return (
    <div style={{ minHeight:'100vh', background:'#060a06', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:44, marginBottom:14, animation:'spin 3s linear infinite' }}>💎</div>
        <div style={{ color:'#6ee7b7', fontSize:14, fontFamily:'Georgia,serif', letterSpacing:2 }}>Connecting...</div>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
  const isHost=player===state.host
  if(state.phase==='lobby') return <Lobby player={player} players={players} connected={state.connected||[]} host={state.host} onStart={()=>send({type:'start'})} onBack={onBack}/>
  if(state.phase==='result') return <Result state={state} player={player} players={players} onRestart={()=>send({type:'restart'})} onBack={onBack} isHost={isHost}/>
  return <GameBoard state={state} player={player} players={players} onAction={send} onBack={onBack}/>
}