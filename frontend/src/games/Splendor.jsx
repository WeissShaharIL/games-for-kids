import { useState, useEffect, useRef, useCallback } from 'react'
import { vibrate, VIBRATIONS } from '../vibrate'
import { getPlayer } from '../playerUtils'
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
function getPlayer(players, name, idx = 0) {
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

// ── Card Art — Real Met Museum paintings (CC0 public domain) ─────────────────
// Images served locally from /cards/{bonus}_{tier}.jpg
const GEM_OVERLAY = {
  white: 'rgba(248,250,252,0.12)',
  blue:  'rgba(29,78,216,0.18)',
  green: 'rgba(21,128,61,0.18)',
  red:   'rgba(220,38,38,0.18)',
  black: 'rgba(15,23,42,0.35)',
}

function CardArt({ bonus, tier, width = 90, height = 120 }) {
  const src = `/cards/${bonus}_${tier}.jpg`
  return (
    <div style={{
      width, height, borderRadius: 6, overflow: 'hidden',
      position: 'relative', display: 'block', flexShrink: 0,
    }}>
      {/* Painting */}
      <img
        src={src}
        alt=""
        style={{
          width: '100%', height: '100%',
          objectFit: 'cover', objectPosition: 'center top',
          display: 'block',
        }}
        onError={e => { e.target.style.display = 'none' }}
      />
      {/* Gem color tint overlay — ties painting to gem type */}
      <div style={{
        position: 'absolute', inset: 0,
        background: GEM_OVERLAY[bonus] || 'transparent',
        mixBlendMode: 'multiply',
      }}/>
      {/* Bottom gradient so cost strip is readable */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '45%',
        background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)',
      }}/>
      {/* Top gradient so VP badge is readable */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '30%',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 100%)',
      }}/>
    </div>
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
  const p = getPlayer(players, player, 0)
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
          const pp=getPlayer(players,name,i)
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
          const pp=getPlayer(players,name,(state.players||[]).indexOf(name))
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

// ── Payment Panel — lets player choose exactly which gems to pay ──────────────
function PaymentPanel({ card, myHand, myBonus, onConfirm, onCancel }) {
  const gems = ['white','blue','green','red','black']

  // Calculate minimum required after bonuses
  const minRequired = {}
  for (const g of gems) {
    minRequired[g] = Math.max(0, (card.cost[g]||0) - (myBonus[g]||0))
  }

  // Initialize payment: auto-fill from gems, use gold for shortfall
  const initPayment = () => {
    const pay = {}
    let goldNeeded = 0
    for (const g of gems) {
      const need = minRequired[g]
      const have = (myHand.gems||{})[g] || 0
      pay[g] = Math.min(need, have)
      goldNeeded += Math.max(0, need - have)
    }
    return { ...pay, gold: Math.min(goldNeeded, (myHand.gems||{}).gold||0) }
  }

  const [payment, setPayment] = useState(initPayment)

  const totalPaid = (g) => (payment[g]||0) + (myBonus[g]||0)
  const shortage = (g) => Math.max(0, (card.cost[g]||0) - totalPaid(g))
  const totalShortage = gems.reduce((s,g) => s + shortage(g), 0)
  const goldUsed = payment.gold || 0
  const isValid = totalShortage === 0 && goldUsed <= totalShortage + goldUsed

  const adjust = (g, delta) => {
    const have = g === 'gold' ? ((myHand.gems||{}).gold||0) : ((myHand.gems||{})[g]||0)
    const cur = payment[g] || 0
    const next = Math.max(0, Math.min(have, cur + delta))
    if (g !== 'gold') {
      // Don't let gem go below what's needed (unless covered by gold)
      const newGoldNeeded = gems.reduce((s, gg) => {
        const paid = gg === g ? next + (myBonus[gg]||0) : (payment[gg]||0) + (myBonus[gg]||0)
        return s + Math.max(0, (card.cost[gg]||0) - paid)
      }, 0)
      if (newGoldNeeded > ((myHand.gems||{}).gold||0)) return
    }
    setPayment(p => ({ ...p, [g]: next }))
  }

  // Recompute gold needed when gems change
  const goldNeeded = gems.reduce((s,g) => {
    return s + Math.max(0, (card.cost[g]||0) - (payment[g]||0) - (myBonus[g]||0))
  }, 0)
  const goldOk = goldNeeded <= ((myHand.gems||{}).gold||0)
  const canConfirm = goldNeeded === 0 || (goldOk && goldNeeded > 0)

  const confirmPayment = () => {
    const finalPay = { ...payment, gold: goldNeeded }
    onConfirm(finalPay)
  }

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:150,
      background:'rgba(0,0,0,0.7)', backdropFilter:'blur(4px)',
      display:'flex', alignItems:'flex-end', justifyContent:'center',
    }} onClick={onCancel}>
      <div onClick={e=>e.stopPropagation()} style={{
        width:'100%', maxWidth:480,
        background:'linear-gradient(to top, #0a1a0a, #060e06)',
        border:'1px solid #1e3a2a', borderRadius:'16px 16px 0 0',
        padding:'16px 14px 24px', fontFamily:'Georgia,serif',
        animation:'slideUp 0.25s ease',
      }}>
        {/* Card preview + title */}
        <div style={{ display:'flex', gap:12, alignItems:'center', marginBottom:14 }}>
          <div style={{ width:56, height:80, borderRadius:6, overflow:'hidden', flexShrink:0,
            border:'2px solid #f59e0b', boxShadow:'0 0 16px rgba(245,158,11,0.3)' }}>
            <img src={`/cards/${card.bonus}_${card.tier}.jpg`} alt=""
              style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ color:'#f59e0b', fontWeight:900, fontSize:14, marginBottom:4 }}>
              💎 Buy Card
            </div>
            <div style={{ color:'#6b7280', fontSize:11 }}>
              Tier {card.tier} · {card.bonus} bonus
              {card.vp > 0 && <span style={{ color:'#fbbf24', marginLeft:6 }}>+{card.vp} VP</span>}
            </div>
            {goldNeeded > 0 && (
              <div style={{ color:'#f59e0b', fontSize:11, marginTop:3 }}>
                Needs {goldNeeded} 🌟 gold
              </div>
            )}
          </div>
          <button onClick={onCancel} style={{
            background:'rgba(255,255,255,0.06)', border:'1px solid #1e3a2a',
            borderRadius:8, color:'#475569', width:32, height:32,
            fontSize:16, cursor:'pointer', flexShrink:0,
          }}>✕</button>
        </div>

        {/* Gem payment rows */}
        <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:14 }}>
          {gems.map(g => {
            const cost = card.cost[g] || 0
            const bonus = myBonus[g] || 0
            const have = (myHand.gems||{})[g] || 0
            const paying = payment[g] || 0
            const covered = paying + bonus
            const needed = Math.max(0, cost - bonus)
            if (cost === 0) return null
            return (
              <div key={g} style={{
                display:'flex', alignItems:'center', gap:8,
                background: covered >= cost ? 'rgba(110,231,183,0.06)' : 'rgba(255,255,255,0.03)',
                border:`1px solid ${covered >= cost ? '#1e3a2a' : '#3f1515'}`,
                borderRadius:8, padding:'6px 10px',
              }}>
                {/* Gem color dot + name */}
                <div style={{
                  width:22, height:22, borderRadius:'50%', flexShrink:0,
                  background:GEM[g].c2, border:`1px solid ${GEM[g].c1}44`,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:9, fontWeight:900, color:GEM[g].text,
                }}>{GEM[g].name[0]}</div>

                {/* Cost info */}
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                    <span style={{ color:'#94a3b8', fontSize:11 }}>Cost: {cost}</span>
                    {bonus > 0 && (
                      <span style={{
                        background:BONUS_COLOR[g], borderRadius:3, padding:'0 4px',
                        fontSize:9, fontWeight:900, color:g==='white'?'#1e293b':'#fff',
                      }}>-{bonus} card</span>
                    )}
                    <span style={{ color:'#475569', fontSize:11 }}>= need {needed}</span>
                  </div>
                  <div style={{ color:'#334155', fontSize:10, marginTop:1 }}>
                    You have: {have} in hand
                  </div>
                </div>

                {/* +/- controls */}
                {needed > 0 && (
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <button onClick={()=>adjust(g,-1)} disabled={paying===0} style={{
                      width:26, height:26, borderRadius:6, border:'1px solid #1e3a2a',
                      background:'rgba(255,255,255,0.05)', color:'#94a3b8',
                      fontSize:16, cursor:paying>0?'pointer':'not-allowed',
                      display:'flex', alignItems:'center', justifyContent:'center',
                      opacity:paying===0?0.3:1,
                    }}>−</button>
                    <span style={{
                      color: covered >= cost ? '#6ee7b7' : '#ef4444',
                      fontWeight:900, fontSize:15, minWidth:16, textAlign:'center',
                    }}>{paying}</span>
                    <button onClick={()=>adjust(g,1)} disabled={paying>=Math.min(have,needed)} style={{
                      width:26, height:26, borderRadius:6, border:'1px solid #1e3a2a',
                      background:'rgba(255,255,255,0.05)', color:'#94a3b8',
                      fontSize:16, cursor:paying<Math.min(have,needed)?'pointer':'not-allowed',
                      display:'flex', alignItems:'center', justifyContent:'center',
                      opacity:paying>=Math.min(have,needed)?0.3:1,
                    }}>+</button>
                  </div>
                )}
                {needed === 0 && (
                  <span style={{ color:'#6ee7b7', fontSize:11 }}>✓ covered</span>
                )}
              </div>
            )
          })}

          {/* Gold row */}
          {goldNeeded > 0 && (
            <div style={{
              display:'flex', alignItems:'center', gap:8,
              background:'rgba(245,158,11,0.08)', border:'1px solid #f59e0b44',
              borderRadius:8, padding:'6px 10px',
            }}>
              <div style={{
                width:22, height:22, borderRadius:'50%', flexShrink:0,
                background:GEM.gold.c2, display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:12, fontWeight:900, color:'#1a0f00',
              }}>★</div>
              <div style={{ flex:1 }}>
                <div style={{ color:'#fbbf24', fontSize:11, fontWeight:700 }}>Gold (wild)</div>
                <div style={{ color:'#78350f', fontSize:10 }}>
                  Using {goldNeeded} of {(myHand.gems||{}).gold||0} available
                </div>
              </div>
              <span style={{
                color: goldOk ? '#fbbf24' : '#ef4444',
                fontWeight:900, fontSize:15,
              }}>{goldNeeded}</span>
            </div>
          )}
        </div>

        {/* Confirm button */}
        <button onClick={confirmPayment} disabled={!canConfirm || !goldOk} style={{
          width:'100%', padding:'12px', borderRadius:10, border:'none',
          background: canConfirm && goldOk
            ? 'linear-gradient(135deg,#f59e0b,#d97706)'
            : 'rgba(255,255,255,0.04)',
          color: canConfirm && goldOk ? '#1a0f00' : '#2d4a3a',
          fontSize:15, fontWeight:900, cursor: canConfirm && goldOk ? 'pointer' : 'not-allowed',
          fontFamily:'Georgia,serif', letterSpacing:1,
          boxShadow: canConfirm && goldOk ? '0 4px 16px rgba(245,158,11,0.4)' : 'none',
        }}>
          {!goldOk ? `Not enough gold (need ${goldNeeded})` : '💎 Confirm Purchase'}
        </button>
      </div>
      <style>{`@keyframes slideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }`}</style>
    </div>
  )
}


function ActionOverlay({ action, players }) {
  const [phase, setPhase] = useState('enter') // enter → hold → exit
  useEffect(() => {
    const t1 = setTimeout(() => setPhase('hold'), 400)
    const t2 = setTimeout(() => setPhase('exit'), 2800)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  if (!action) return null
  const pp = getPlayer(players, action.player, 0)

  const cardBg = action.card ? BONUS_COLOR[action.card.bonus] : null

  const style = {
    position: 'fixed', inset: 0, zIndex: 300,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    pointerEvents: 'none',
    transition: 'opacity 0.4s ease',
    opacity: phase === 'exit' ? 0 : 1,
  }

  if (action.type === 'buy_card' || action.type === 'reserve_card') {
    const isBuy = action.type === 'buy_card'
    return (
      <div style={style}>
        {/* Dark backdrop */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(2px)',
        }}/>
        {/* Card flying animation */}
        <div style={{
          position: 'relative', zIndex: 1,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
          animation: phase === 'enter'
            ? 'cardFlyIn 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards'
            : phase === 'exit'
            ? 'cardFlyOut 0.4s ease-in forwards'
            : 'cardFloat 1s ease-in-out infinite alternate',
        }}>
          {/* The card */}
          {action.card && (
            <div style={{
              width: 100, height: 140,
              borderRadius: 10, overflow: 'hidden',
              border: `3px solid ${isBuy ? '#fbbf24' : '#6ee7b7'}`,
              boxShadow: `0 0 40px ${isBuy ? 'rgba(251,191,36,0.6)' : 'rgba(110,231,183,0.5)'}`,
            }}>
              <img
                src={`/cards/${action.card.bonus}_${action.card.tier}.jpg`}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 50%)',
              }}/>
            </div>
          )}
          {/* Player + action label */}
          <div style={{
            background: 'rgba(0,0,0,0.85)', borderRadius: 12,
            padding: '10px 20px', textAlign: 'center',
            border: `1px solid ${pp.color}44`,
          }}>
            <div style={{ fontSize: 24, marginBottom: 4 }}>{pp.emoji}</div>
            <div style={{ color: pp.color, fontWeight: 900, fontSize: 16 }}>{action.player}</div>
            <div style={{
              color: isBuy ? '#fbbf24' : '#6ee7b7',
              fontSize: 13, fontWeight: 700, marginTop: 2, letterSpacing: 1,
            }}>
              {isBuy ? '💎 Bought a card!' : '📋 Reserved a card!'}
            </div>
            {action.card && (
              <div style={{
                marginTop: 6, display: 'inline-block',
                background: BONUS_COLOR[action.card.bonus],
                borderRadius: 6, padding: '2px 10px',
                fontSize: 11, fontWeight: 700,
                color: action.card.bonus === 'white' ? '#1e293b' : '#fff',
              }}>
                Tier {action.card.tier} {action.card.bonus}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (action.type === 'take_gems') {
    const gemList = Object.entries(action.gems || {}).flatMap(([g,n]) => Array(n).fill(g))
    return (
      <div style={style}>
        <div style={{
          position: 'relative', zIndex: 1,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          animation: phase === 'enter' ? 'cardFlyIn 0.3s ease forwards' : phase === 'exit' ? 'cardFlyOut 0.3s ease-in forwards' : 'none',
        }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {gemList.map((g, i) => (
              <div key={i} style={{
                animation: `gemBounce 0.4s ${i * 0.1}s cubic-bezier(0.34,1.56,0.64,1) both`,
              }}>
                <GemChip3D gem={g} count={0} size={52} showZero/>
              </div>
            ))}
          </div>
          <div style={{
            background: 'rgba(0,0,0,0.85)', borderRadius: 10,
            padding: '8px 18px', textAlign: 'center',
            border: `1px solid ${pp.color}44`,
          }}>
            <span style={{ fontSize: 18 }}>{pp.emoji}</span>
            {' '}
            <span style={{ color: pp.color, fontWeight: 700 }}>{action.player}</span>
            {' '}
            <span style={{ color: '#94a3b8', fontSize: 13 }}>took {gemList.length} gem{gemList.length > 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>
    )
  }
  return null
}

// ── Game Board ────────────────────────────────────────────────────────────────
function GameBoard({ state, player, players, onAction, onBack }) {
  const [selectedGems, setSelectedGems] = useState({})
  const [selectedCard, setSelectedCard] = useState(null)
  const [error, setError] = useState('')
  const [showPayment, setShowPayment] = useState(false)
  const [animKey, setAnimKey] = useState(null)
  const [animAction, setAnimAction] = useState(null)
  const prevActionRef = useRef(null)

  const myHand=state.hands?.[player]||{}, myBonus=myHand.bonus||{}
  const isMyTurn=state.current===player
  const gems=['white','blue','green','red','black']

  // Trigger animation whenever last_action changes
  useEffect(() => {
    const a = state.last_action
    if (!a) return
    const key = JSON.stringify(a)
    if (key === prevActionRef.current) return
    prevActionRef.current = key

    // Play sound
    if (a.type === 'buy_card') playSound('collect')
    else if (a.type === 'reserve_card') playSound('select')
    else if (a.type === 'take_gems') playSound('pop')

    setAnimAction(a)
    setAnimKey(key)
    setTimeout(() => setAnimKey(null), 3200)
  }, [state.last_action])

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

  // Use CSS viewport units so everything fits without scrolling
  // Layout: top bar (36px) + opponents (40px) + nobles+board+bank (flex fill) + bottom hand (fixed ~110px)

  const CARD_W = 62
  const CARD_H = 88
  const DECK_W = 38

  return (
    <div style={{
      height:'100dvh', background:'#060a06', fontFamily:'Georgia,serif',
      userSelect:'none', display:'flex', flexDirection:'column', overflow:'hidden',
    }}>
      {/* ── Top bar ── */}
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'6px 12px', background:'rgba(6,10,6,0.95)',
        borderBottom:'1px solid #0e1f0e', flexShrink:0,
      }}>
        <button onClick={onBack} style={{
          background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)',
          borderRadius:6, color:'#6ee7b7', fontSize:11, fontWeight:700,
          cursor:'pointer', padding:'4px 10px',
        }}>← Back</button>
        <div style={{
          fontSize:11, fontWeight:900, letterSpacing:3, textTransform:'uppercase',
          background:'linear-gradient(135deg,#f59e0b,#fbbf24)',
          WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
        }}>SPLENDOR</div>
        <div style={{
          fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:6,
          color:isMyTurn?'#6ee7b7':'#475569',
          background:isMyTurn?'rgba(110,231,183,0.1)':'transparent',
          border:isMyTurn?'1px solid rgba(110,231,183,0.2)':'1px solid transparent',
        }}>{isMyTurn?'YOUR TURN':`${state.current}`}</div>
      </div>

      {/* ── Final round banner ── */}
      {state.final_round && (
        <div style={{
          background:'rgba(245,158,11,0.15)', borderBottom:'1px solid rgba(245,158,11,0.3)',
          padding:'4px 12px', textAlign:'center', color:'#fbbf24',
          fontSize:10, fontWeight:700, letterSpacing:1, flexShrink:0,
        }}>⚡ FINAL ROUND — {state.final_trigger} reached 15 VP!</div>
      )}

      {/* ── Opponents full info strip ── */}
      <div style={{
        display:'flex', gap:6, padding:'5px 8px', flexShrink:0,
        overflowX:'auto', background:'rgba(0,0,0,0.3)',
        borderBottom:'1px solid #0e1f0e',
      }}>
        {(state.players||[]).filter(n=>n!==player).map(name=>{
          const pp=getPlayer(players,name,(state.players||[]).indexOf(name))
          const h=state.hands?.[name]||{}, cur=state.current===name
          const bonus=h.bonus||{}, handGems=h.gems||{}
          const reservedCount=h.reserved?.length||0
          return (
            <div key={name} style={{
              flexShrink:0, minWidth:160,
              background:cur?'rgba(245,158,11,0.08)':'rgba(255,255,255,0.03)',
              border:`1px solid ${cur?'#f59e0b55':'#1a2a1a'}`,
              borderRadius:10, padding:'6px 8px',
            }}>
              {/* Name + VP */}
              <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:4 }}>
                <span style={{ fontSize:13 }}>{pp.emoji}</span>
                <span style={{ color:pp.color, fontWeight:700, fontSize:12, flex:1 }}>{name}</span>
                <div style={{
                  background:'rgba(251,191,36,0.15)', border:'1px solid #f59e0b44',
                  borderRadius:5, padding:'1px 6px',
                  color:'#fbbf24', fontSize:13, fontWeight:900,
                }}>{h.vp||0}<span style={{ fontSize:8, color:'#78350f', marginLeft:1 }}>VP</span></div>
              </div>

              {/* Cards bought — bonus per color */}
              <div style={{ marginBottom:3 }}>
                <div style={{ color:'#334155', fontSize:7, letterSpacing:1, marginBottom:2 }}>CARDS</div>
                <div style={{ display:'flex', gap:2 }}>
                  {gems.map(g=>{
                    const b=bonus[g]||0
                    return (
                      <div key={g} style={{
                        width:20, height:20, borderRadius:3, flexShrink:0,
                        background:b>0?BONUS_COLOR[g]:'rgba(255,255,255,0.04)',
                        border:`1px solid ${b>0?BONUS_COLOR[g]+'66':'#1a2a1a'}`,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:9, fontWeight:900,
                        color:b>0?(g==='white'?'#1e293b':'#fff'):'#2d3f2d',
                      }}>{b>0?b:'·'}</div>
                    )
                  })}
                  {/* Reserved count */}
                  {reservedCount>0&&(
                    <div style={{
                      width:20, height:20, borderRadius:3, flexShrink:0,
                      background:'rgba(107,114,128,0.2)', border:'1px solid #374151',
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:8, fontWeight:900, color:'#6b7280', gap:1,
                    }}>
                      <span style={{ fontSize:7 }}>📋</span>{reservedCount}
                    </div>
                  )}
                </div>
              </div>

              {/* Gems in hand */}
              <div>
                <div style={{ color:'#334155', fontSize:7, letterSpacing:1, marginBottom:2 }}>GEMS</div>
                <div style={{ display:'flex', gap:2, flexWrap:'wrap' }}>
                  {[...gems,'gold'].map(g=>{
                    const count=handGems[g]||0
                    return count>0?(
                      <div key={g} style={{
                        width:18, height:18, borderRadius:'50%', flexShrink:0,
                        background:GEM[g].c2, border:`1px solid ${GEM[g].c1}33`,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:9, fontWeight:900, color:GEM[g].text,
                      }}>{count}</div>
                    ):null
                  })}
                  {Object.values(handGems).every(v=>v===0)&&(
                    <span style={{ color:'#2d3f2d', fontSize:9 }}>—</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Main scrollable area (nobles + board + bank) ── */}
      <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column', padding:'5px 8px', gap:4 }}>

        {/* Nobles row */}
        <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
          <span style={{ color:'#f59e0b', fontSize:8, fontWeight:700, letterSpacing:1, flexShrink:0 }}>NOBLES</span>
          {(state.nobles||[]).map(n=><Noble key={n.id} noble={n} size={48}/>)}
        </div>

        {/* Card tiers — each row flex */}
        {[3,2,1].map(tier=>(
          <div key={tier} style={{ display:'flex', gap:5, alignItems:'center', flexShrink:0 }}>
            {/* Deck button */}
            <div style={{
              width:DECK_W, height:CARD_H, borderRadius:6, flexShrink:0,
              background:`linear-gradient(135deg,${['','#7c3aed','#1d4ed8','#15803d'][tier]}22,#060a06)`,
              border:`1px solid ${['','#7c3aed44','#1d4ed844','#15803d44'][tier]}`,
              display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:2,
              cursor:isMyTurn&&(myHand.reserved?.length||0)<3?'pointer':'default',
            }} onClick={()=>{
              if(isMyTurn&&(myHand.reserved?.length||0)<3){onAction({type:'reserve_card',card_id:-tier});clearSel()}
            }}>
              <span style={{ color:['','#8b5cf6','#60a5fa','#4ade80'][tier], fontSize:8, fontWeight:700 }}>{['','III','II','I'][tier]}</span>
              <span style={{ color:'#94a3b8', fontSize:12, fontWeight:700 }}>{state.deck_counts?.[tier]||0}</span>
            </div>
            {/* 4 cards */}
            {(state.board?.[tier]||[]).map(card=>(
              <Card key={card.id} card={card} selected={selectedCard?.id===card.id}
                onClick={()=>{
                  if(!isMyTurn||!card) return
                  if(selectedCard?.id===card.id){clearSel();return}
                  setSelectedCard({...card,fromReserve:false});setSelectedGems({})
                }} width={CARD_W} height={CARD_H}/>
            ))}
            {Array.from({length:Math.max(0,4-(state.board?.[tier]?.length||0))}).map((_,i)=>(
              <Card key={`e${i}`} card={null} width={CARD_W} height={CARD_H}/>
            ))}
          </div>
        ))}

        {/* Bank gems row */}
        <div style={{ display:'flex', alignItems:'center', gap:5, flexShrink:0, marginTop:2 }}>
          <span style={{ color:'#6ee7b7', fontSize:8, fontWeight:700, letterSpacing:1, flexShrink:0 }}>
            {isMyTurn&&selectedGemTotal===0&&!selectedCard?'TAP TO TAKE':'BANK'}
          </span>
          <div style={{ display:'flex', gap:4 }}>
            {[...gems,'gold'].map(g=>(
              <GemChip3D key={g} gem={g} count={state.bank?.[g]||0} size={42}
                selected={!!(selectedGems[g])}
                onClick={g!=='gold'&&isMyTurn?()=>toggleGem(g):undefined}
                disabled={!isMyTurn||(state.bank?.[g]||0)===0}/>
            ))}
          </div>
          {selectedGemTotal>0&&(
            <button onClick={()=>{onAction({type:'take_gems',gems:selectedGems});clearSel()}} style={{
              padding:'6px 12px', borderRadius:8, border:'none',
              background:'linear-gradient(135deg,#f59e0b,#d97706)', color:'#1a0f00',
              fontSize:12, fontWeight:900, cursor:'pointer', whiteSpace:'nowrap',
              boxShadow:'0 2px 8px rgba(245,158,11,0.4)',
            }}>Take {selectedGemTotal} ✓</button>
          )}
        </div>
      </div>

      {/* ── Bottom hand panel ── */}
      <div style={{
        background:'rgba(4,8,4,0.98)', borderTop:'1px solid #1e3a2a',
        padding:'7px 10px 8px', flexShrink:0,
      }}>

        {/* ── Row 1: VP + Cards bought (bonuses) + Gems in hand ── */}
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>

          {/* VP score */}
          <div style={{
            flexShrink:0, textAlign:'center',
            background:'rgba(251,191,36,0.1)', border:'1px solid #f59e0b44',
            borderRadius:8, padding:'3px 8px',
          }}>
            <div style={{ color:'#fbbf24', fontSize:20, fontWeight:900, lineHeight:1 }}>{myHand.vp||0}</div>
            <div style={{ color:'#78350f', fontSize:8, fontWeight:700 }}>VP</div>
          </div>

          {/* Divider */}
          <div style={{ width:1, height:32, background:'#1e3a2a', flexShrink:0 }}/>

          {/* Cards bought — show bonus per gem color */}
          <div style={{ flexShrink:0 }}>
            <div style={{ color:'#475569', fontSize:8, letterSpacing:1, marginBottom:3 }}>CARDS</div>
            <div style={{ display:'flex', gap:3 }}>
              {gems.map(g=>{
                const b=(myBonus[g]||0)
                return (
                  <div key={g} style={{
                    width:22, height:22, borderRadius:4, flexShrink:0,
                    background:b>0?BONUS_COLOR[g]:'rgba(255,255,255,0.04)',
                    border:`1px solid ${b>0?BONUS_COLOR[g]+'88':'#1e3a2a'}`,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:10, fontWeight:900,
                    color:b>0?(g==='white'?'#1e293b':'#fff'):'#334155',
                  }}>{b>0?b:'·'}</div>
                )
              })}
            </div>
          </div>

          {/* Divider */}
          <div style={{ width:1, height:32, background:'#1e3a2a', flexShrink:0 }}/>

          {/* Gems in hand */}
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ color:'#475569', fontSize:8, letterSpacing:1, marginBottom:3 }}>GEMS {myGemTotal}/10</div>
            <div style={{ display:'flex', gap:3, overflowX:'auto' }}>
              {[...gems,'gold'].map(g=>{
                const count=(myHand.gems||{})[g]||0
                return count>0?(
                  <div key={g} style={{
                    flexShrink:0, position:'relative',
                    width:22, height:22, borderRadius:'50%',
                    background:GEM[g].c2, border:`1px solid ${GEM[g].c1}44`,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:10, fontWeight:900, color:GEM[g].text,
                  }}>{count}</div>
                ):null
              })}
              {myGemTotal===0&&<span style={{ color:'#334155', fontSize:10 }}>—</span>}
            </div>
          </div>
        </div>

        {/* ── Row 2: Reserved cards (if any) ── */}
        {(myHand.reserved?.length||0)>0&&(
          <div style={{ display:'flex', gap:5, alignItems:'center', marginBottom:5 }}>
            <span style={{ color:'#334155', fontSize:8, letterSpacing:1, flexShrink:0 }}>RESERVED</span>
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

        {/* ── Row 3: Action buttons (when card selected) ── */}
        {selectedCard&&isMyTurn&&!selectedCard.hidden&&(
          <div style={{ display:'flex', gap:6 }}>
            <button onClick={()=>{ if(canAfford(selectedCard)) setShowPayment(true) }}
              disabled={!canAfford(selectedCard)} style={{
              flex:1, padding:'8px', borderRadius:8, border:'none',
              background:canAfford(selectedCard)?'linear-gradient(135deg,#f59e0b,#d97706)':'rgba(255,255,255,0.04)',
              color:canAfford(selectedCard)?'#1a0f00':'#2d4a3a', fontSize:13, fontWeight:900,
              cursor:canAfford(selectedCard)?'pointer':'not-allowed', fontFamily:'Georgia,serif',
            }}>💎 Buy</button>
            {!selectedCard.fromReserve&&(myHand.reserved?.length||0)<3&&(
              <button onClick={()=>{onAction({type:'reserve_card',card_id:selectedCard.id});clearSel()}} style={{
                flex:1, padding:'8px', borderRadius:8, border:'1px solid #1e3a2a',
                background:'rgba(255,255,255,0.03)', color:'#6ee7b7',
                fontSize:13, fontWeight:900, cursor:'pointer', fontFamily:'Georgia,serif',
              }}>📋 Reserve</button>
            )}
            <button onClick={clearSel} style={{
              padding:'8px 12px', borderRadius:8, border:'1px solid #1e3a2a',
              background:'transparent', color:'#475569', fontSize:13, cursor:'pointer',
            }}>✕</button>
          </div>
        )}
      </div>

      {/* Payment panel */}
      {showPayment && selectedCard && (
        <PaymentPanel
          card={selectedCard}
          myHand={myHand}
          myBonus={myBonus}
          onConfirm={(payment) => {
            onAction({ type:'buy_card', card_id:selectedCard.id, from_reserve:selectedCard.fromReserve, payment })
            setShowPayment(false)
            clearSel()
          }}
          onCancel={() => setShowPayment(false)}
        />
      )}

      {/* Error toast */}
      {error&&<div style={{
        position:'fixed', top:'15%', left:'50%', transform:'translateX(-50%)',
        background:'#7f1d1d', color:'#fca5a5', borderRadius:10, padding:'8px 20px',
        fontSize:13, fontWeight:700, zIndex:200, border:'1px solid #dc262688',
        boxShadow:'0 8px 32px rgba(220,38,38,0.4)', whiteSpace:'nowrap',
      }}>{error}</div>}

      {/* Action overlay — shown to all players */}
      {animKey && <ActionOverlay key={animKey} action={animAction} players={players}/>}

      <style>{`
        @keyframes cardFlyIn {
          from { transform: scale(0.4) translateY(60px); opacity: 0; }
          to   { transform: scale(1) translateY(0);      opacity: 1; }
        }
        @keyframes cardFlyOut {
          from { transform: scale(1) translateY(0);       opacity: 1; }
          to   { transform: scale(0.6) translateY(-40px); opacity: 0; }
        }
        @keyframes cardFloat {
          from { transform: translateY(0px); }
          to   { transform: translateY(-6px); }
        }
        @keyframes gemBounce {
          from { transform: scale(0) translateY(20px); opacity: 0; }
          to   { transform: scale(1) translateY(0);    opacity: 1; }
        }
      `}</style>
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