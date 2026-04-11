import { useState, useRef } from 'react'
import { playSound } from '../sounds'
import { getPlayer } from '../playerUtils'
import { useGameWS } from '../hooks/useGameWS'

const WS_PROTOCOL = location.protocol === 'https:' ? 'wss' : 'ws'
const WS_URL      = `${WS_PROTOCOL}://${location.host}/api/connect4/ws`
const ROWS = 6
const COLS = 7
const EMPTY_BOARD = () => Array(ROWS).fill(null).map(() => Array(COLS).fill(''))

export default function Connect4({ player, players, onBack }) {
  const [state, setState]   = useState(null)
  const [status, setStatus] = useState('Connecting...')
  const prevWinner          = useRef(null)

  const { send } = useGameWS(WS_URL, player,
    (data) => {
      setState(data)
      if (data.winner && data.winner !== prevWinner.current) {
        if (data.winner === 'draw')      playSound('draw')
        else if (data.winner === player) playSound('win')
        else                             playSound('lose')
        prevWinner.current = data.winner
      }
      if (!data.winner) prevWinner.current = null
      if (data.message)                      setStatus(data.message)
      else if (data.connected?.length < 2)   setStatus('Waiting for opponent...')
      else if (data.winner === 'draw')        setStatus("🤝 It's a draw!")
      else if (data.winner === player)        setStatus('🎉 You won!')
      else if (data.winner)                  setStatus(`${data.winner} won!`)
      else if (data.current_turn === player) setStatus('🔴 Your turn!')
      else                                   setStatus(`${data.current_turn}'s turn...`)
    },
    () => setStatus('Waiting for opponent...')
  )

  const p          = getPlayer(players, player, 0)
  const connected  = state?.connected || []
  const other      = connected.find(n => n !== player) || null
  const op         = other ? getPlayer(players, other, 1) : null
  const myScore    = state?.scores?.[player] ?? 0
  const otherScore = other ? (state?.scores?.[other] ?? 0) : 0
  const bothHere   = connected.length >= 2
  const myTurn     = state?.current_turn === player && bothHere && !state?.winner

  const drop = (col) => {
    if (!state || state.winner || state.current_turn !== player) return
    if (state.connected?.length < 2) return
    playSound('place')
    send({ type: 'drop', col })
  }

  const rematch = () => { playSound('rematch'); send({ type: 'rematch' }) }

  const statusBg    = state?.winner === player ? '#dcfce7' : state?.winner === 'draw' ? '#fef9c3' : state?.winner ? '#fee2e2' : myTurn ? p.light : '#f1f5f9'
  const statusColor = state?.winner === player ? '#15803d' : state?.winner === 'draw' ? '#92400e' : state?.winner ? '#dc2626' : myTurn ? p.color : '#64748b'
  const cellSize    = Math.min(Math.floor((window.innerWidth - 32) / COLS), 52)

  const board = (() => {
    const b = state?.board
    if (!b || !Array.isArray(b)) return EMPTY_BOARD()
    return b.map(row => Array.isArray(row) ? row : Array(COLS).fill(''))
  })()

  return (
    <div style={{ ...s.wrap, background: p.bg }}>
      <div style={s.header}>
        <button onClick={onBack} style={{ ...s.backBtn, color: p.color }}>← Back</button>
        <div style={s.title}>4 in a Row</div>
        <div style={{ width: 64 }} />
      </div>

      <div style={s.scoreBar}>
        <div style={{ ...s.scoreCard, borderColor: p.color, background: p.light }}>
          <span style={{ fontSize: 20 }}>{p.emoji}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, color: p.color, fontSize: 14 }}>{player}</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>plays {state?.symbols?.[player] || '🔴'}</div>
          </div>
          <span style={{ fontSize: 24, fontWeight: 900, color: p.color }}>{myScore}</span>
        </div>

        {op && other ? (
          <>
            <div style={{ fontSize: 12, fontWeight: 900, color: '#cbd5e1' }}>VS</div>
            <div style={{ ...s.scoreCard, borderColor: op.color, background: op.light }}>
              <span style={{ fontSize: 20 }}>{op.emoji}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, color: op.color, fontSize: 14 }}>{other}</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>plays {state?.symbols?.[other] || '🟡'}</div>
              </div>
              <span style={{ fontSize: 24, fontWeight: 900, color: op.color }}>{otherScore}</span>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', fontSize: 13, fontWeight: 700, fontStyle: 'italic' }}>
            Waiting...
          </div>
        )}
      </div>

      <div style={{ ...s.status, background: statusBg, color: statusColor }}>{status}</div>

      {bothHere && !state?.winner && (
        <div style={{ display: 'flex', gap: 4, padding: '0 4px' }}>
          {Array(COLS).fill(null).map((_, col) => (
            <button key={col} onClick={() => drop(col)} style={{ width: cellSize, height: 28, border: 'none', borderRadius: 8, background: myTurn ? p.color + '22' : 'transparent', cursor: myTurn ? 'pointer' : 'default', fontSize: 16, color: p.color }}>
              {myTurn ? '▼' : ''}
            </button>
          ))}
        </div>
      )}

      <div style={{ background: '#1e3a5f', borderRadius: 16, padding: 8, boxShadow: '0 8px 32px #0003' }}>
        {board.map((row, ri) => (
          <div key={ri} style={{ display: 'flex', gap: 4, marginBottom: ri < ROWS - 1 ? 4 : 0 }}>
            {row.map((cell, ci) => {
              const sym      = state?.symbols
              const isMe     = sym && cell === sym[player]
              const isOther  = sym && cell && !isMe
              const cellColor = isMe ? p.color : (isOther && op) ? op.color : null
              return (
                <div key={ci} onClick={() => myTurn && drop(ci)} style={{ width: cellSize, height: cellSize, borderRadius: '50%', background: cellColor || '#0f2744', boxShadow: cellColor ? `0 3px 10px ${cellColor}66, inset 0 -3px 6px #0003` : 'inset 0 3px 6px #0005', cursor: myTurn && !cell ? 'pointer' : 'default', transition: 'background 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {cellColor && <div style={{ width: '55%', height: '55%', borderRadius: '50%', background: cellColor + 'cc' }} />}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {state?.winner && bothHere && <button onClick={rematch} style={{ ...s.rematchBtn, background: p.color }}>🔄 Play Again</button>}

      {!bothHere && (
        <div style={s.waiting}>
          <div style={{ ...s.waitingDot, background: p.color }} />
          Waiting for opponent...
        </div>
      )}
    </div>
  )
}

const s = {
  wrap:       { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, paddingBottom: 32 },
  header:     { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', background: '#ffffffcc', backdropFilter: 'blur(8px)', boxShadow: '0 1px 0 #e2e8f0' },
  backBtn:    { background: 'none', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', padding: '6px 12px', borderRadius: 10, fontFamily: 'inherit' },
  title:      { fontSize: 20, fontWeight: 900, color: '#1e1b4b' },
  scoreBar:   { display: 'flex', alignItems: 'center', gap: 12, width: '100%', maxWidth: 420, padding: '0 16px' },
  scoreCard:  { display: 'flex', alignItems: 'center', gap: 8, border: '2px solid', borderRadius: 14, padding: '8px 12px', flex: 1 },
  status:     { padding: '10px 24px', borderRadius: 12, fontSize: 14, fontWeight: 800, textAlign: 'center', transition: 'all 0.3s', minWidth: 240, maxWidth: 360 },
  rematchBtn: { padding: '14px 40px', borderRadius: 16, border: 'none', color: '#fff', fontSize: 18, fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 16px #0002' },
  waiting:    { display: 'flex', alignItems: 'center', gap: 10, color: '#94a3b8', fontWeight: 700, fontSize: 15 },
  waitingDot: { width: 10, height: 10, borderRadius: '50%', animation: 'pulse 1.5s ease-in-out infinite' },
}
