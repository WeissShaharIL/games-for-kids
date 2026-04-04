import { useState, useEffect, useRef, useCallback } from 'react'

const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/connect4/ws`

const ROWS   = 6
const COLS   = 7

const PLAYERS = {
  Ariel: { color: '#16a34a', light: '#dcfce7', bg: '#f0fdf4', emoji: '🦁' },
  Ella:  { color: '#db2777', light: '#fce7f3', bg: '#fdf2f8', emoji: '🦋' },
}

export default function Connect4({ player, onBack }) {
  const [state, setState]     = useState(null)
  const [status, setStatus]   = useState('Connecting...')
  const [hoverCol, setHover]  = useState(null)
  const wsRef                 = useRef(null)

  const p     = PLAYERS[player]
  const other = player === 'Ariel' ? 'Ella' : 'Ariel'
  const op    = PLAYERS[other]

  const connect = useCallback(() => {
    const ws = new WebSocket(`${WS_URL}/${player}`)
    wsRef.current = ws
    ws.onopen    = () => setStatus(`Waiting for ${other}...`)
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data)
      setState(data)
      if (data.message)                      setStatus(data.message)
      else if (data.connected?.length < 2)   setStatus(`Waiting for ${other}...`)
      else if (data.winner === 'draw')        setStatus("🤝 It's a draw!")
      else if (data.winner === player)        setStatus('🎉 You won!')
      else if (data.winner)                  setStatus(`${data.winner} won!`)
      else if (data.current_turn === player) setStatus('⭐ Your turn!')
      else                                   setStatus(`${data.current_turn}'s turn...`)
    }
    ws.onclose = () => { setStatus('Disconnected. Reconnecting...'); setTimeout(connect, 2000) }
    ws.onerror = () => ws.close()
  }, [player])

  useEffect(() => { connect(); return () => wsRef.current?.close() }, [connect])

  const drop = (col) => {
    if (!state || state.winner || state.current_turn !== player) return
    if (state.connected?.length < 2) return
    wsRef.current?.send(JSON.stringify({ type: 'drop', col }))
    setHover(null)
  }

  const rematch = () => wsRef.current?.send(JSON.stringify({ type: 'rematch' }))

  const mySymbol    = state?.symbols?.[player] || 'X'
  const otherSymbol = state?.symbols?.[other]  || 'O'
  const myScore     = state?.scores?.[player]  ?? 0
  const otherScore  = state?.scores?.[other]   ?? 0
  const bothHere    = state?.connected?.length === 2
  const myTurn      = state?.current_turn === player && bothHere && !state?.winner

  const board = state?.board || Array(ROWS).fill(null).map(() => Array(COLS).fill(''))

  const statusBg    = state?.winner === player ? '#dcfce7' : state?.winner === 'draw' ? '#fef9c3' : state?.winner ? '#fee2e2' : myTurn ? p.light : '#f1f5f9'
  const statusColor = state?.winner === player ? '#15803d' : state?.winner === 'draw' ? '#92400e' : state?.winner ? '#dc2626' : myTurn ? p.color : '#64748b'

  const cellColor = (cell) => {
    if (!cell) return '#dde3ea'
    return cell === mySymbol ? p.color : op.color
  }

  return (
    <div style={{ ...s.wrap, background: p.bg }}>
      {/* Header */}
      <div style={s.header}>
        <button onClick={onBack} style={{ ...s.backBtn, color: p.color }}>← Back</button>
        <div style={s.title}>4 in a Row</div>
        <div style={{ width: 64 }} />
      </div>

      {/* Scores */}
      <div style={s.scoreBar}>
        <div style={{ ...s.scoreCard, borderColor: p.color, background: p.light }}>
          <span style={{ fontSize: 22 }}>{p.emoji}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, color: p.color, fontSize: 15 }}>{player}</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: p.color, marginRight: 4, verticalAlign: 'middle' }} />
              {mySymbol}
            </div>
          </div>
          <span style={{ ...s.scoreNum, color: p.color }}>{myScore}</span>
        </div>
        <div style={s.vs}>VS</div>
        <div style={{ ...s.scoreCard, borderColor: op.color, background: op.light }}>
          <span style={{ fontSize: 22 }}>{op.emoji}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, color: op.color, fontSize: 15 }}>{other}</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: op.color, marginRight: 4, verticalAlign: 'middle' }} />
              {otherSymbol}
            </div>
          </div>
          <span style={{ ...s.scoreNum, color: op.color }}>{otherScore}</span>
        </div>
      </div>

      {/* Status */}
      <div style={{ ...s.status, background: statusBg, color: statusColor }}>{status}</div>

      {/* Column hover indicators */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 4, paddingLeft: 10 }}>
        {Array(COLS).fill(null).map((_, c) => (
          <div key={c} style={{
            width: 48, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {myTurn && hoverCol === c && (
              <div style={{ width: 16, height: 16, borderRadius: '50%', background: p.color, opacity: 0.8 }} />
            )}
          </div>
        ))}
      </div>

      {/* Board */}
      <div style={s.board}>
        {board.map((row, r) => (
          <div key={r} style={{ display: 'flex', gap: 6 }}>
            {row.map((cell, c) => (
              <div
                key={c}
                onClick={() => drop(c)}
                onMouseEnter={() => myTurn && setHover(c)}
                onMouseLeave={() => setHover(null)}
                style={{
                  width: 48, height: 48,
                  borderRadius: '50%',
                  background: cellColor(cell),
                  cursor: myTurn && !state?.winner ? 'pointer' : 'default',
                  transition: 'background 0.15s',
                  boxShadow: cell ? `0 2px 8px ${cellColor(cell)}66` : 'inset 0 2px 4px #0002',
                  border: myTurn && hoverCol === c && !cell ? `3px solid ${p.color}` : '3px solid transparent',
                }}
              />
            ))}
          </div>
        ))}
      </div>

      {state?.winner && bothHere && (
        <button onClick={rematch} style={{ ...s.rematchBtn, background: p.color }}>🔄 Play Again</button>
      )}

      {!bothHere && (
        <div style={s.waiting}>
          <div style={{ ...s.waitingDot, background: p.color }} />
          Waiting for {other} to join...
        </div>
      )}
    </div>
  )
}

const s = {
  wrap:      { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  header:    { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', background: '#fff', boxShadow: '0 1px 0 #e2e8f0', marginBottom: 20 },
  backBtn:   { background: 'none', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', padding: '6px 12px', borderRadius: 10, fontFamily: 'inherit' },
  title:     { fontSize: 20, fontWeight: 900, color: '#1e1b4b' },
  scoreBar:  { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16, padding: '0 20px', width: '100%', maxWidth: 420 },
  scoreCard: { display: 'flex', alignItems: 'center', gap: 10, border: '2px solid', borderRadius: 16, padding: '10px 16px', flex: 1 },
  scoreNum:  { fontSize: 26, fontWeight: 900 },
  vs:        { fontSize: 13, fontWeight: 900, color: '#cbd5e1', flexShrink: 0 },
  status:    { padding: '12px 28px', borderRadius: 14, fontSize: 16, fontWeight: 800, marginBottom: 12, textAlign: 'center', transition: 'all 0.3s', minWidth: 260, maxWidth: 400 },
  board:     { display: 'flex', flexDirection: 'column', gap: 6, padding: 16, background: '#1e3a5f', borderRadius: 20, boxShadow: '0 8px 32px #0004' },
  rematchBtn: { marginTop: 28, padding: '14px 40px', borderRadius: 16, border: 'none', color: '#fff', fontSize: 18, fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 16px #0002' },
  waiting:    { marginTop: 24, display: 'flex', alignItems: 'center', gap: 10, color: '#94a3b8', fontWeight: 700, fontSize: 15 },
  waitingDot: { width: 10, height: 10, borderRadius: '50%', animation: 'pulse 1.5s ease-in-out infinite' },
}