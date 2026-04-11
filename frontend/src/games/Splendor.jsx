import { useState, useEffect, useRef, useCallback } from 'react'
import { playSound } from '../sounds'
import { vibrate, VIBRATIONS } from '../vibrate'

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

// ── Gem colors ────────────────────────────────────────────────────────────────
const GEM_STYLE = {
  white: { bg: '#f1f5f9', border: '#cbd5e1', text: '#1e293b', label: '◈' },
  blue:  { bg: '#1d4ed8', border: '#1e40af', text: '#fff',    label: '◈' },
  green: { bg: '#15803d', border: '#166534', text: '#fff',    label: '◈' },
  red:   { bg: '#dc2626', border: '#b91c1c', text: '#fff',    label: '◈' },
  black: { bg: '#1e293b', border: '#0f172a', text: '#fff',    label: '◈' },
  gold:  { bg: '#f59e0b', border: '#d97706', text: '#1e293b', label: '★' },
}

const BONUS_COLOR = {
  white: '#e2e8f0', blue: '#3b82f6', green: '#22c55e',
  red: '#ef4444',   black: '#475569',
}

const TIER_COLOR = {
  1: { bg: '#16a34a', label: 'I' },
  2: { bg: '#1d4ed8', label: 'II' },
  3: { bg: '#7c3aed', label: 'III' },
}

// ── Gem chip component ────────────────────────────────────────────────────────
function GemChip({ gem, count = 0, size = 44, onClick, selected, disabled }) {
  const s = GEM_STYLE[gem] || GEM_STYLE.white
  const isSelectable = onClick && !disabled && count > 0
  return (
    <div onClick={isSelectable ? onClick : undefined} style={{
      position: 'relative',
      width: size, height: size,
      borderRadius: '50%',
      background: s.bg,
      border: `2px solid ${selected ? '#fbbf24' : s.border}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: isSelectable ? 'pointer' : 'default',
      boxShadow: selected
        ? '0 0 0 3px #fbbf2466, 0 4px 12px #0006'
        : '0 4px 12px #0004, inset 0 1px 0 rgba(255,255,255,0.2)',
      transform: selected ? 'scale(1.1)' : 'scale(1)',
      transition: 'all 0.15s',
      opacity: disabled && !selected ? 0.4 : 1,
      flexShrink: 0,
    }}>
      <span style={{ color: s.text, fontSize: size * 0.28, fontWeight: 900 }}>{s.label}</span>
      {count > 0 && (
        <div style={{
          position: 'absolute', bottom: -4, right: -4,
          background: '#1e293b', color: '#fff',
          borderRadius: '50%', width: 18, height: 18,
          fontSize: 11, fontWeight: 900,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1.5px solid #334155',
        }}>{count}</div>
      )}
    </div>
  )
}

// ── Card component ────────────────────────────────────────────────────────────
function SplendorCard({ card, onClick, selected, small = false, hidden = false }) {
  if (!card) return (
    <div style={{
      width: small ? 52 : 72, height: small ? 72 : 100,
      borderRadius: 8, background: '#1e293b',
      border: '1px dashed #334155',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{ color: '#334155', fontSize: 18 }}>✦</span>
    </div>
  )
  if (hidden) return (
    <div style={{
      width: small ? 52 : 72, height: small ? 72 : 100,
      borderRadius: 8,
      background: 'linear-gradient(135deg, #1e3a5f, #0f2744)',
      border: '1px solid #334155',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{ color: '#334155', fontSize: 20 }}>?</span>
    </div>
  )

  const tc = TIER_COLOR[card.tier] || TIER_COLOR[1]
  const bonusColor = BONUS_COLOR[card.bonus] || '#94a3b8'
  const gems = ['white','blue','green','red','black']
  const costs = gems.filter(g => card.cost[g] > 0)

  return (
    <div onClick={onClick} style={{
      width: small ? 52 : 72,
      height: small ? 72 : 100,
      borderRadius: 8,
      background: 'linear-gradient(160deg, #1e293b 0%, #0f172a 100%)',
      border: `2px solid ${selected ? '#fbbf24' : '#334155'}`,
      cursor: onClick ? 'pointer' : 'default',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden', flexShrink: 0,
      boxShadow: selected
        ? '0 0 0 2px #fbbf2488, 0 8px 24px #0008'
        : '0 4px 16px #0006',
      transform: selected ? 'scale(1.05)' : 'scale(1)',
      transition: 'all 0.15s',
      position: 'relative',
    }}>
      {/* Header bar */}
      <div style={{
        background: tc.bg, height: small ? 18 : 24,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 4px', flexShrink: 0,
      }}>
        <span style={{ color: '#fff', fontSize: small ? 8 : 10, fontWeight: 900, opacity: 0.8 }}>{tc.label}</span>
        {card.vp > 0 && (
          <span style={{ color: '#fbbf24', fontSize: small ? 10 : 14, fontWeight: 900 }}>{card.vp}</span>
        )}
      </div>
      {/* Bonus gem indicator */}
      <div style={{
        position: 'absolute', top: small ? 20 : 28, right: 4,
        width: small ? 10 : 14, height: small ? 10 : 14,
        borderRadius: '50%', background: bonusColor,
        border: '1.5px solid rgba(255,255,255,0.2)',
      }} />
      {/* Cost gems */}
      <div style={{
        marginTop: 'auto', padding: '3px 3px',
        display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'flex-end',
      }}>
        {costs.map(g => (
          <div key={g} style={{
            background: GEM_STYLE[g].bg,
            border: `1px solid ${GEM_STYLE[g].border}`,
            borderRadius: 4, padding: '1px 4px',
            fontSize: small ? 8 : 9, fontWeight: 900,
            color: GEM_STYLE[g].text, display: 'flex', alignItems: 'center', gap: 2,
          }}>
            {card.cost[g]}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Noble tile ────────────────────────────────────────────────────────────────
function NobleTile({ noble, small = false }) {
  if (!noble) return null
  const gems = ['white','blue','green','red','black']
  const reqs = gems.filter(g => noble.req[g] > 0)
  return (
    <div style={{
      width: small ? 48 : 64, height: small ? 48 : 64,
      borderRadius: 8,
      background: 'linear-gradient(135deg, #78350f, #451a03)',
      border: '2px solid #f59e0b',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 2, padding: 4, flexShrink: 0,
      boxShadow: '0 4px 16px #f59e0b33',
    }}>
      <span style={{ color: '#fbbf24', fontSize: small ? 10 : 13, fontWeight: 900 }}>★ {noble.vp}</span>
      <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
        {reqs.map(g => (
          <div key={g} style={{
            background: GEM_STYLE[g].bg, borderRadius: 3,
            padding: '1px 3px', fontSize: 8, fontWeight: 900,
            color: GEM_STYLE[g].text,
          }}>{noble.req[g]}</div>
        ))}
      </div>
    </div>
  )
}

// ── Lobby ─────────────────────────────────────────────────────────────────────
function Lobby({ player, players, connected, host, onStart, onBack }) {
  const p = safe(players, player, 0)
  const isHost = player === host
  const canStart = connected.length >= 2

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at 50% 0%, #1a3a2a 0%, #0a1a10 60%, #060d08 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: 24, fontFamily: 'Georgia, serif',
    }}>
      <button onClick={onBack} style={{
        position: 'absolute', top: 16, left: 16,
        background: 'none', border: 'none', color: '#6ee7b7',
        fontSize: 14, fontWeight: 700, cursor: 'pointer',
      }}>← Back</button>

      {/* Title */}
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>💎</div>
        <h1 style={{
          fontSize: 36, fontWeight: 900, margin: 0,
          background: 'linear-gradient(135deg, #f59e0b, #fbbf24, #f59e0b)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          letterSpacing: 3, textTransform: 'uppercase',
        }}>Splendor</h1>
        <p style={{ color: '#6ee7b7', fontSize: 13, marginTop: 8, letterSpacing: 1 }}>
          The Renaissance Gem Trading Game
        </p>
      </div>

      {/* Players */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 340, marginBottom: 32 }}>
        {connected.map((name, i) => {
          const pp = safe(players, name, i)
          return (
            <div key={name} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: 'rgba(255,255,255,0.05)',
              border: `1px solid ${pp.color}44`,
              borderRadius: 12, padding: '12px 16px',
              backdropFilter: 'blur(8px)',
            }}>
              <span style={{ fontSize: 24 }}>{pp.emoji}</span>
              <span style={{ fontWeight: 700, color: pp.color, flex: 1, fontSize: 16 }}>{name}</span>
              {name === host && (
                <span style={{
                  fontSize: 10, color: '#f59e0b', fontWeight: 700,
                  border: '1px solid #f59e0b44', borderRadius: 4, padding: '2px 6px',
                }}>HOST</span>
              )}
            </div>
          )
        })}
        {connected.length < 4 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: 'rgba(255,255,255,0.02)',
            border: '1px dashed #334155',
            borderRadius: 12, padding: '12px 16px',
          }}>
            <span style={{ fontSize: 24, opacity: 0.3 }}>👤</span>
            <span style={{ color: '#334155', fontSize: 14 }}>Waiting... ({connected.length}/4)</span>
          </div>
        )}
      </div>

      {/* Gem preview */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 32 }}>
        {['white','blue','green','red','black','gold'].map(g => (
          <GemChip key={g} gem={g} size={36} />
        ))}
      </div>

      {isHost ? (
        <button onClick={onStart} disabled={!canStart} style={{
          padding: '14px 48px', borderRadius: 12, border: 'none',
          background: canStart
            ? 'linear-gradient(135deg, #f59e0b, #d97706)'
            : '#1e293b',
          color: canStart ? '#1e293b' : '#475569',
          fontSize: 16, fontWeight: 900, cursor: canStart ? 'pointer' : 'not-allowed',
          fontFamily: 'Georgia, serif', letterSpacing: 1,
          boxShadow: canStart ? '0 8px 32px #f59e0b44' : 'none',
          transition: 'all 0.2s',
        }}>
          {canStart ? '✦ Begin Game ✦' : `Need ${2 - connected.length} more player${connected.length < 1 ? 's' : ''}`}
        </button>
      ) : (
        <div style={{ color: '#6ee7b7', fontWeight: 700, fontSize: 14, textAlign: 'center', letterSpacing: 1 }}>
          ⏳ Waiting for {host} to start...
        </div>
      )}
    </div>
  )
}

// ── Result screen ─────────────────────────────────────────────────────────────
function Result({ state, player, players, onRestart, onBack, isHost }) {
  const sorted = [...state.players].sort((a, b) =>
    (state.hands[b]?.vp || 0) - (state.hands[a]?.vp || 0)
  )
  const medals = ['🥇','🥈','🥉','4️⃣']

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at 50% 0%, #1a3a2a 0%, #0a1a10 60%, #060d08 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '40px 24px', fontFamily: 'Georgia, serif',
    }}>
      <div style={{ fontSize: 56, marginBottom: 8 }}>🏆</div>
      <h2 style={{
        fontSize: 28, fontWeight: 900, margin: '0 0 4px',
        background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
      }}>Game Over</h2>
      <p style={{ color: '#6ee7b7', fontSize: 13, marginBottom: 32 }}>
        {state.winner} wins the Renaissance!
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 380, marginBottom: 32 }}>
        {sorted.map((name, rank) => {
          const pp = safe(players, name, state.players.indexOf(name))
          const h = state.hands[name]
          const isMe = name === player
          return (
            <div key={name} style={{
              background: isMe ? 'rgba(245,158,11,0.1)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${isMe ? '#f59e0b66' : '#334155'}`,
              borderRadius: 14, padding: '14px 18px',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <span style={{ fontSize: 24 }}>{medals[rank]}</span>
              <span style={{ fontSize: 22 }}>{pp.emoji}</span>
              <div style={{ flex: 1 }}>
                <div style={{ color: pp.color, fontWeight: 700, fontSize: 15 }}>{name}</div>
                <div style={{ color: '#64748b', fontSize: 12 }}>
                  {h?.cards?.length || 0} cards · {h?.nobles?.length || 0} nobles
                </div>
              </div>
              <div style={{ color: '#fbbf24', fontSize: 24, fontWeight: 900 }}>
                {h?.vp || 0} <span style={{ fontSize: 12, color: '#94a3b8' }}>VP</span>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        {isHost && (
          <button onClick={onRestart} style={{
            padding: '12px 28px', borderRadius: 12, border: 'none',
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            color: '#1e293b', fontSize: 15, fontWeight: 900, cursor: 'pointer',
            fontFamily: 'Georgia, serif',
          }}>🔄 Play Again</button>
        )}
        <button onClick={onBack} style={{
          padding: '12px 28px', borderRadius: 12, border: '1px solid #334155',
          background: 'transparent', color: '#94a3b8', fontSize: 15,
          fontWeight: 700, cursor: 'pointer', fontFamily: 'Georgia, serif',
        }}>← Hub</button>
      </div>
    </div>
  )
}

// ── Main game board ───────────────────────────────────────────────────────────
function GameBoard({ state, player, players, onAction, onBack }) {
  const [selectedGems, setSelectedGems] = useState({})
  const [selectedCard, setSelectedCard] = useState(null)
  const [actionMode, setActionMode] = useState(null) // 'gems' | 'buy' | 'reserve'
  const [error, setError] = useState('')

  const myHand = state.hands?.[player] || {}
  const myBonus = myHand.bonus || {}
  const isMyTurn = state.current === player
  const gems = ['white','blue','green','red','black']

  const showError = (msg) => {
    setError(msg)
    setTimeout(() => setError(''), 2500)
  }

  const clearSelection = () => {
    setSelectedGems({})
    setSelectedCard(null)
    setActionMode(null)
  }

  const toggleGem = (gem) => {
    if (!isMyTurn) return
    const bank = state.bank || {}
    const cur = selectedGems[gem] || 0
    const total = Object.values(selectedGems).reduce((a, b) => a + b, 0)

    // Check if trying 2-same
    if (cur === 1 && total === 1) {
      // Going to 2 same — check bank has 4
      if (bank[gem] < 4) { showError(`Need 4 ${gem} gems in bank`); return }
      setSelectedGems({ [gem]: 2 })
      return
    }
    if (cur > 0) {
      const next = { ...selectedGems }
      delete next[gem]
      setSelectedGems(next)
      return
    }
    if (total >= 3) { showError('Max 3 different gems'); return }
    if (bank[gem] <= 0) { showError(`No ${gem} gems`); return }
    setSelectedGems({ ...selectedGems, [gem]: 1 })
  }

  const confirmTakeGems = () => {
    if (Object.keys(selectedGems).length === 0) return
    onAction({ type: 'take_gems', gems: selectedGems })
    clearSelection()
  }

  const handleCardClick = (card, fromReserve = false) => {
    if (!isMyTurn || !card || card.hidden) return
    if (selectedCard?.id === card.id) {
      clearSelection()
      return
    }
    setSelectedCard({ ...card, fromReserve })
    setActionMode('card')
    setSelectedGems({})
  }

  const buyCard = () => {
    if (!selectedCard) return
    onAction({ type: 'buy_card', card_id: selectedCard.id, from_reserve: selectedCard.fromReserve })
    clearSelection()
  }

  const reserveCard = () => {
    if (!selectedCard) return
    onAction({ type: 'reserve_card', card_id: selectedCard.id })
    clearSelection()
  }

  const selectedGemTotal = Object.values(selectedGems).reduce((a, b) => a + b, 0)
  const myGemTotal = Object.values(myHand.gems || {}).reduce((a, b) => a + b, 0)

  // Can afford selected card?
  const canAfford = (card) => {
    if (!card || card.hidden) return false
    const bonus = myBonus
    const hand  = myHand.gems || {}
    let goldNeeded = 0
    for (const g of gems) {
      const needed = Math.max(0, (card.cost[g] || 0) - (bonus[g] || 0))
      const have   = hand[g] || 0
      const deficit = Math.max(0, needed - have)
      goldNeeded += deficit
    }
    return goldNeeded <= (hand.gold || 0)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at 50% 0%, #1a3a2a 0%, #0a1a10 60%, #060d08 100%)',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'Georgia, serif', userSelect: 'none',
      paddingBottom: 120,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px',
        background: 'rgba(0,0,0,0.4)', borderBottom: '1px solid #1a3a2a',
        backdropFilter: 'blur(8px)',
      }}>
        <button onClick={onBack} style={{
          background: 'none', border: 'none', color: '#6ee7b7',
          fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}>← Back</button>
        <div style={{
          fontSize: 14, fontWeight: 900, letterSpacing: 2,
          background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>SPLENDOR</div>
        <div style={{ color: isMyTurn ? '#6ee7b7' : '#475569', fontSize: 12, fontWeight: 700 }}>
          {isMyTurn ? '✦ YOUR TURN' : `${state.current}'s turn`}
        </div>
      </div>

      {/* Error toast */}
      {error && (
        <div style={{
          position: 'fixed', top: 60, left: '50%', transform: 'translateX(-50%)',
          background: '#dc2626', color: '#fff', borderRadius: 8, padding: '8px 16px',
          fontSize: 13, fontWeight: 700, zIndex: 100,
          boxShadow: '0 4px 16px #dc262644',
        }}>{error}</div>
      )}

      {/* Final round notice */}
      {state.final_round && (
        <div style={{
          background: 'rgba(245,158,11,0.15)', borderBottom: '1px solid #f59e0b44',
          padding: '6px 16px', textAlign: 'center',
          color: '#fbbf24', fontSize: 12, fontWeight: 700,
        }}>
          ⚡ Final Round — {state.final_trigger} triggered 15 VP!
        </div>
      )}

      {/* Opponents summary */}
      <div style={{ padding: '8px 12px', display: 'flex', gap: 8, overflowX: 'auto' }}>
        {state.players?.filter(n => n !== player).map((name, i) => {
          const pp = safe(players, name, state.players.indexOf(name))
          const h  = state.hands?.[name] || {}
          const isCurrent = state.current === name
          return (
            <div key={name} style={{
              background: isCurrent ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${isCurrent ? '#f59e0b88' : '#1e3a2a'}`,
              borderRadius: 10, padding: '8px 12px', flexShrink: 0,
              minWidth: 120,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 18 }}>{pp.emoji}</span>
                <span style={{ color: pp.color, fontWeight: 700, fontSize: 13 }}>{name}</span>
                <span style={{ color: '#fbbf24', fontWeight: 900, fontSize: 14, marginLeft: 'auto' }}>
                  {h.vp || 0}VP
                </span>
              </div>
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                {['white','blue','green','red','black'].map(g => {
                  const bonus = (h.bonus || {})[g] || 0
                  const gemCount = (h.gems || {})[g] || 0
                  return (bonus > 0 || gemCount > 0) ? (
                    <div key={g} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                      {bonus > 0 && (
                        <div style={{
                          background: BONUS_COLOR[g], borderRadius: 2,
                          width: 14, height: 8, fontSize: 7,
                          color: g === 'white' ? '#1e293b' : '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 900,
                        }}>{bonus}</div>
                      )}
                      {gemCount > 0 && (
                        <div style={{
                          width: 14, height: 14, borderRadius: '50%',
                          background: GEM_STYLE[g].bg, border: `1px solid ${GEM_STYLE[g].border}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 8, fontWeight: 900, color: GEM_STYLE[g].text,
                        }}>{gemCount}</div>
                      )}
                    </div>
                  ) : null
                })}
                {(h.gems?.gold || 0) > 0 && (
                  <div style={{
                    width: 14, height: 14, borderRadius: '50%',
                    background: GEM_STYLE.gold.bg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 8, fontWeight: 900, color: '#1e293b',
                  }}>{h.gems.gold}</div>
                )}
              </div>
              <div style={{ color: '#475569', fontSize: 10, marginTop: 4 }}>
                {h.cards?.length || 0} cards · {h.reserved?.length || 0} reserved
              </div>
            </div>
          )
        })}
      </div>

      {/* Nobles row */}
      <div style={{ padding: '4px 12px', display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ color: '#f59e0b', fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>NOBLES</span>
        {state.nobles?.map(noble => <NobleTile key={noble.id} noble={noble} />)}
      </div>

      {/* Board */}
      {[3, 2, 1].map(tier => (
        <div key={tier} style={{ padding: '4px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Deck */}
            <div style={{
              width: 44, height: 60, borderRadius: 6,
              background: `linear-gradient(135deg, ${TIER_COLOR[tier].bg}44, #0f172a)`,
              border: `1px solid ${TIER_COLOR[tier].bg}66`,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, gap: 2,
            }}>
              <span style={{ color: TIER_COLOR[tier].bg, fontSize: 9, fontWeight: 900 }}>{TIER_COLOR[tier].label}</span>
              <span style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700 }}>
                {state.deck_counts?.[tier] || 0}
              </span>
            </div>
            {/* 4 face-up cards */}
            {(state.board?.[tier] || []).map(card => (
              <SplendorCard
                key={card.id}
                card={card}
                selected={selectedCard?.id === card.id}
                onClick={() => handleCardClick(card)}
              />
            ))}
            {/* Fill empty slots */}
            {Array.from({ length: Math.max(0, 4 - (state.board?.[tier]?.length || 0)) }).map((_, i) => (
              <SplendorCard key={`empty-${i}`} card={null} />
            ))}
          </div>
        </div>
      ))}

      {/* Bank gems */}
      <div style={{ padding: '8px 12px' }}>
        <div style={{ color: '#6ee7b7', fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>
          BANK {isMyTurn && !actionMode ? '— tap to take' : ''}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[...gems, 'gold'].map(g => (
            <GemChip
              key={g}
              gem={g}
              count={state.bank?.[g] || 0}
              selected={!!(selectedGems[g])}
              onClick={g !== 'gold' && isMyTurn ? () => toggleGem(g) : undefined}
              disabled={!isMyTurn || (state.bank?.[g] || 0) === 0}
            />
          ))}
        </div>
        {selectedGemTotal > 0 && (
          <button onClick={confirmTakeGems} style={{
            marginTop: 8, padding: '8px 20px', borderRadius: 8, border: 'none',
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            color: '#1e293b', fontSize: 13, fontWeight: 900, cursor: 'pointer',
          }}>
            Take {selectedGemTotal} gem{selectedGemTotal > 1 ? 's' : ''} ✓
          </button>
        )}
      </div>

      {/* My hand */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'rgba(6,13,8,0.97)',
        borderTop: '1px solid #1a3a2a',
        backdropFilter: 'blur(12px)',
        padding: '10px 12px',
      }}>
        {/* My gems + bonus */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, overflowX: 'auto' }}>
          <span style={{ color: '#6ee7b7', fontSize: 10, fontWeight: 700, letterSpacing: 1, flexShrink: 0 }}>
            YOU {myGemTotal}/10
          </span>
          {[...gems, 'gold'].map(g => {
            const count = (myHand.gems || {})[g] || 0
            const bonus = g !== 'gold' ? (myBonus[g] || 0) : 0
            return (count > 0 || bonus > 0) ? (
              <div key={g} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                {bonus > 0 && (
                  <div style={{
                    background: BONUS_COLOR[g], borderRadius: 3,
                    padding: '1px 5px', fontSize: 9, fontWeight: 900,
                    color: g === 'white' ? '#1e293b' : '#fff',
                  }}>{bonus}</div>
                )}
                <GemChip gem={g} count={count} size={32} />
              </div>
            ) : null
          })}
          <span style={{ color: '#fbbf24', fontWeight: 900, fontSize: 16, marginLeft: 'auto', flexShrink: 0 }}>
            {myHand.vp || 0} VP
          </span>
        </div>

        {/* Reserved cards */}
        {(myHand.reserved?.length > 0) && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <span style={{ color: '#94a3b8', fontSize: 10, fontWeight: 700, alignSelf: 'center', flexShrink: 0 }}>
              RESERVED
            </span>
            {myHand.reserved.map(c => (
              <SplendorCard
                key={c.id}
                card={c}
                small
                selected={selectedCard?.id === c.id}
                onClick={() => handleCardClick(c, true)}
              />
            ))}
          </div>
        )}

        {/* Card action buttons */}
        {selectedCard && isMyTurn && !selectedCard.hidden && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={buyCard} disabled={!canAfford(selectedCard)} style={{
              flex: 1, padding: '8px', borderRadius: 8, border: 'none',
              background: canAfford(selectedCard)
                ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                : '#1e293b',
              color: canAfford(selectedCard) ? '#1e293b' : '#475569',
              fontSize: 13, fontWeight: 900, cursor: canAfford(selectedCard) ? 'pointer' : 'not-allowed',
            }}>💎 Buy</button>
            {!selectedCard.fromReserve && (myHand.reserved?.length || 0) < 3 && (
              <button onClick={reserveCard} style={{
                flex: 1, padding: '8px', borderRadius: 8,
                border: '1px solid #334155', background: 'transparent',
                color: '#94a3b8', fontSize: 13, fontWeight: 900, cursor: 'pointer',
              }}>📋 Reserve</button>
            )}
            <button onClick={clearSelection} style={{
              padding: '8px 12px', borderRadius: 8,
              border: '1px solid #334155', background: 'transparent',
              color: '#475569', fontSize: 13, cursor: 'pointer',
            }}>✕</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function Splendor({ player, players, onBack }) {
  const [state, setState] = useState(null)
  const wsRef      = useRef(null)
  const mountedRef = useRef(true)

  const connect = useCallback(() => {
    const ws = new WebSocket(`${WS_URL}/${player}`)
    wsRef.current = ws
    ws.onmessage = (e) => {
      if (!mountedRef.current) return
      const data = JSON.parse(e.data)
      if (data.error) return  // handled in GameBoard
      setState(data)
    }
    ws.onclose = () => { if (mountedRef.current) setTimeout(connect, 2000) }
    ws.onerror = () => ws.close()
  }, [player])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      wsRef.current?.close()
    }
  }, [connect])

  const send = (msg) => wsRef.current?.send(JSON.stringify(msg))

  if (!state) return (
    <div style={{
      minHeight: '100vh', background: '#060d08',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ color: '#6ee7b7', fontSize: 18, fontFamily: 'Georgia, serif' }}>
        💎 Connecting...
      </div>
    </div>
  )

  const isHost = player === state.host

  if (state.phase === 'lobby') return (
    <Lobby
      player={player} players={players}
      connected={state.connected} host={state.host}
      onStart={() => send({ type: 'start' })}
      onBack={onBack}
    />
  )

  if (state.phase === 'result') return (
    <Result
      state={state} player={player} players={players}
      onRestart={() => send({ type: 'restart' })}
      onBack={onBack} isHost={isHost}
    />
  )

  return (
    <GameBoard
      state={state} player={player} players={players}
      onAction={send} onBack={onBack}
    />
  )
}