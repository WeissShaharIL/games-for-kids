import { useState, useEffect, useRef, useCallback } from 'react'

const WS_URL = `ws://${location.host}/api/tictactoe/ws`

const PLAYERS = {
  Ariel: { color: '#f97316', light: '#fff7ed', emoji: '🦁' },
  Ella:  { color: '#a855f7', light: '#faf5ff', emoji: '🦋' },
}

export default function TicTacToe({ player, onBack }) {
  const [state, setState]   = useState(null)
  const [status, setStatus] = useState('Connecting...')
  const wsRef               = useRef(null)

  const p     = PLAYERS[player]
  const other = player === 'Ariel' ? 'Ella' : 'Ariel'
  const op    = PLAYERS[other]

  const connect = useCallback(() => {
    const ws = new WebSocket(`${WS_URL}/${player}`)
    wsRef.current = ws

    ws.onopen = () => setStatus(`Waiting for ${other}...`)

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

    ws.onclose = () => {
      setStatus('Disconnected. Reconnecting...')
      setTimeout(connect, 2000)
    }
    ws.onerror = () => ws.close()
  }, [player])

  useEffect(() => {
    connect()
    return () => wsRef.current?.close()
  }, [connect])

  const move = (i) => {
    if (!state)                              return
    if (state.winner)                        return
    if (state.current_turn !== player)       return
    if (state.board[i])                      return
    if (state.connected?.length < 2)         return
    wsRef.current?.send(JSON.stringify({ type: 'move', index: i }))
  }

  const rematch = () => {
    wsRef.current?.send(JSON.stringify({ type: 'rematch' }))
  }

  const mySymbol    = state?.symbols?.[player] || '?'
  const otherSymbol = state?.symbols?.[other]  || '?'
  const myScore     = state?.scores?.[player]  ?? 0
  const otherScore  = state?.scores?.[other]   ?? 0
  const bothHere    = state?.connected?.length === 2
  const myTurn      = state?.current_turn === player && bothHere && !state?.winner

  // Find winning cells for highlight
  const winLine = (() => {
    if (!state?.winner || state.winner === 'draw') return []
    const b = state.board
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]
    for (const line of lines) {
      const [a, b2, c] = line
      if (b[a] && b[a] === b[b2] && b[a] === b[c]) return line
    }
    return []
  })()

  const statusBg =
    state?.winner === player  ? '#dcfce7' :
    state?.winner === 'draw'  ? '#fef9c3' :
    state?.winner             ? '#fee2e2' :
    myTurn                    ? '#ede9fe' : '#f1f5f9'

  const statusColor =
    state?.winner === player  ? '#15803d' :
    state?.winner === 'draw'  ? '#92400e' :
    state?.winner             ? '#dc2626' :
    myTurn                    ? '#6d28d9' : '#64748b'

  return (
    <div style={s.wrap}>
      {/* Header */}
      <div style={s.header}>
        <button onClick={onBack} style={s.backBtn}>← Back</button>
        <div style={s.title}>Tic Tac Toe</div>
        <div style={{ width: 64 }} />
      </div>

      {/* Scores */}
      <div style={s.scoreBar}>
        <div style={{ ...s.scoreCard, borderColor: p.color, background: p.light }}>
          <span style={{ fontSize: 22 }}>{p.emoji}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, color: p.color, fontSize: 15 }}>{player}</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>plays {mySymbol}</div>
          </div>
          <span style={{ ...s.scoreNum, color: p.color }}>{myScore}</span>
        </div>

        <div style={s.vs}>VS</div>

        <div style={{ ...s.scoreCard, borderColor: op.color, background: op.light }}>
          <span style={{ fontSize: 22 }}>{op.emoji}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, color: op.color, fontSize: 15 }}>{other}</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>plays {otherSymbol}</div>
          </div>
          <span style={{ ...s.scoreNum, color: op.color }}>{otherScore}</span>
        </div>
      </div>

      {/* Status */}
      <div style={{ ...s.status, background: statusBg, color: statusColor }}>
        {status}
      </div>

      {/* Board */}
      <div style={s.board}>
        {(state?.board || Array(9).fill('')).map((cell, i) => {
          const isWin     = winLine.includes(i)
          const cellColor = cell === mySymbol ? p.color : op.color
          return (
            <div
              key={i}
              onClick={() => move(i)}
              style={{
                ...s.cell,
                cursor:      myTurn && !cell ? 'pointer' : 'default',
                background:  isWin ? '#fef08a' : '#fff',
                borderColor: isWin ? '#eab308' : '#e2e8f0',
                transform:   isWin ? 'scale(1.06)' : 'scale(1)',
              }}
            >
              {cell && (
                <span style={{ fontSize: 52, fontWeight: 900, color: cellColor, animation: 'popIn 0.2s cubic-bezier(0.34,1.56,0.64,1)', display: 'block', lineHeight: 1 }}>
                  {cell}
                </span>
              )}
              {!cell && myTurn && (
                <span style={{ fontSize: 36, color: '#e2e8f0', userSelect: 'none' }}>·</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Rematch */}
      {state?.winner && bothHere && (
        <button onClick={rematch} style={{ ...s.rematchBtn, background: p.color }}>
          🔄 Play Again
        </button>
      )}

      {/* Waiting */}
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
  wrap: {
    minHeight: '100vh', background: '#f8fafc',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
  },
  header: {
    width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 20px', background: '#fff', boxShadow: '0 1px 0 #e2e8f0', marginBottom: 20,
  },
  backBtn: {
    background: 'none', border: 'none', fontSize: 15, fontWeight: 700,
    color: '#6366f1', cursor: 'pointer', padding: '6px 12px', borderRadius: 10, fontFamily: 'inherit',
  },
  title: { fontSize: 20, fontWeight: 900, color: '#1e1b4b' },
  scoreBar: {
    display: 'flex', alignItems: 'center', gap: 14,
    marginBottom: 16, padding: '0 20px', width: '100%', maxWidth: 380,
  },
  scoreCard: {
    display: 'flex', alignItems: 'center', gap: 10,
    border: '2px solid', borderRadius: 16, padding: '10px 16px', flex: 1,
  },
  scoreNum: { fontSize: 26, fontWeight: 900 },
  vs: { fontSize: 13, fontWeight: 900, color: '#cbd5e1', flexShrink: 0 },
  status: {
    padding: '12px 28px', borderRadius: 14, fontSize: 16, fontWeight: 800,
    marginBottom: 20, textAlign: 'center', transition: 'all 0.3s',
    minWidth: 260, maxWidth: 340,
  },
  board: {
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 10, padding: 10,
    background: '#e2e8f0', borderRadius: 20, boxShadow: '0 8px 32px #0002',
  },
  cell: {
    width: 100, height: 100,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, border: '2px solid', transition: 'all 0.15s', userSelect: 'none',
  },
  rematchBtn: {
    marginTop: 28, padding: '14px 40px', borderRadius: 16,
    border: 'none', color: '#fff', fontSize: 18, fontWeight: 900,
    cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 16px #0002',
  },
  waiting: {
    marginTop: 24, display: 'flex', alignItems: 'center', gap: 10,
    color: '#94a3b8', fontWeight: 700, fontSize: 15,
  },
  waitingDot: {
    width: 10, height: 10, borderRadius: '50%',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
}