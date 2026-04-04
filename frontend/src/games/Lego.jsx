import { useState, useEffect, useRef, useCallback } from 'react'
import { playSound } from '../sounds'
import { vibrate, VIBRATIONS } from '../vibrate'

const WS_PROTOCOL = location.protocol === 'https:' ? 'wss' : 'ws'
const WS_URL      = `${WS_PROTOCOL}://${location.host}/api/lego/ws`

const GRID    = 20   // grid snap size in px
const STUD_R  = 4    // stud circle radius

const PLAYERS = {
  Ariel: { color: '#16a34a', light: '#dcfce7', bg: '#f0fdf4', emoji: '🦁' },
  Ella:  { color: '#db2777', light: '#fce7f3', bg: '#fdf2f8', emoji: '🦋' },
}

// Brick sizes in grid units [w, h]
const BRICK_SIZES = [
  [1, 1], [2, 1], [3, 1], [4, 1],
  [2, 2], [3, 2], [4, 2],
]

// Brick colors
const BRICK_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#ffffff', // white
  '#1e293b', // black
  '#94a3b8', // gray
]

function snap(val) {
  return Math.round(val / GRID) * GRID
}

// Draw a single LEGO brick on canvas
function drawBrick(ctx, b, selected = false, scale = 1) {
  const { x, y, w, h, color, rotation = 0 } = b
  const pw = w * GRID * scale
  const ph = h * GRID * scale

  ctx.save()
  ctx.translate(x * scale, y * scale)

  // Rotation around brick center
  if (rotation !== 0) {
    ctx.translate(pw / 2, ph / 2)
    ctx.rotate((rotation * Math.PI) / 180)
    ctx.translate(-pw / 2, -ph / 2)
  }

  // Shadow
  ctx.shadowColor = '#0003'
  ctx.shadowBlur  = selected ? 12 : 4
  ctx.shadowOffsetY = selected ? 4 : 2

  // Main body
  const grad = ctx.createLinearGradient(0, 0, pw, ph)
  grad.addColorStop(0, lighten(color, 30))
  grad.addColorStop(1, darken(color, 20))
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.roundRect(0, 0, pw, ph, 4 * scale)
  ctx.fill()

  // Border
  ctx.shadowColor = 'transparent'
  ctx.strokeStyle = selected ? '#fff' : darken(color, 30)
  ctx.lineWidth   = selected ? 2.5 * scale : 1.5 * scale
  ctx.beginPath()
  ctx.roundRect(0, 0, pw, ph, 4 * scale)
  ctx.stroke()

  // Studs
  const studColor = lighten(color, 20)
  const studW = rotation === 90 || rotation === 270 ? h : w
  const studH = rotation === 90 || rotation === 270 ? w : h
  for (let sy = 0; sy < h; sy++) {
    for (let sx = 0; sx < w; sx++) {
      const cx = (sx + 0.5) * GRID * scale
      const cy = (sy + 0.5) * GRID * scale
      const r  = STUD_R * scale

      // Stud body
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fillStyle = studColor
      ctx.fill()
      ctx.strokeStyle = darken(color, 25)
      ctx.lineWidth   = 0.8 * scale
      ctx.stroke()

      // Stud shine
      ctx.beginPath()
      ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.35, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff55'
      ctx.fill()
    }
  }

  ctx.restore()
}

function lighten(hex, amt) {
  return adjustColor(hex, amt)
}
function darken(hex, amt) {
  return adjustColor(hex, -amt)
}
function adjustColor(hex, amt) {
  const c = hex.replace('#', '')
  const num = parseInt(c.length === 3
    ? c.split('').map(x => x + x).join('') : c, 16)
  const r = Math.min(255, Math.max(0, (num >> 16) + amt))
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amt))
  const b = Math.min(255, Math.max(0, (num & 0xff) + amt))
  return `rgb(${r},${g},${b})`
}

// ── Brick Palette ─────────────────────────────────────────────────────────────
function Palette({ selectedColor, selectedSize, onColorChange, onSizeChange, onClear }) {
  return (
    <div style={ps.wrap}>
      {/* Colors */}
      <div style={ps.section}>
        <div style={ps.label}>COLOR</div>
        <div style={ps.colorGrid}>
          {BRICK_COLORS.map(c => (
            <div
              key={c}
              onClick={() => onColorChange(c)}
              style={{
                width: 28, height: 28, borderRadius: 6,
                background: c,
                border: selectedColor === c ? '3px solid #6366f1' : '2px solid #e2e8f0',
                cursor: 'pointer',
                boxShadow: selectedColor === c ? '0 0 0 2px #6366f155' : 'none',
                transition: 'all 0.1s',
              }}
            />
          ))}
        </div>
      </div>

      {/* Sizes */}
      <div style={ps.section}>
        <div style={ps.label}>SIZE</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {BRICK_SIZES.map(([w, h]) => {
            const sel = selectedSize[0] === w && selectedSize[1] === h
            return (
              <div
                key={`${w}x${h}`}
                onClick={() => onSizeChange([w, h])}
                style={{
                  padding: '4px 8px', borderRadius: 8, cursor: 'pointer',
                  background: sel ? '#6366f122' : 'transparent',
                  border: `1.5px solid ${sel ? '#6366f1' : '#e2e8f0'}`,
                  display: 'flex', alignItems: 'center', gap: 6,
                  transition: 'all 0.1s',
                }}
              >
                {/* Mini brick preview */}
                <div style={{ display: 'flex', gap: 1 }}>
                  {Array(w).fill(null).map((_, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {Array(h).fill(null).map((_, j) => (
                        <div key={j} style={{ width: 8, height: 8, borderRadius: 2, background: sel ? '#6366f1' : '#94a3b8' }} />
                      ))}
                    </div>
                  ))}
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: sel ? '#6366f1' : '#64748b' }}>{w}×{h}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Clear */}
      <button
        onClick={onClear}
        style={{ marginTop: 8, padding: '8px', borderRadius: 10, border: '1.5px solid #fca5a5', background: '#fff1f2', color: '#ef4444', fontWeight: 800, fontSize: 12, cursor: 'pointer', width: '100%' }}
      >
        🗑️ Clear All
      </button>
    </div>
  )
}

const ps = {
  wrap:      { display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 8px', background: '#fff', borderRight: '1px solid #e2e8f0', overflowY: 'auto', minWidth: 80, maxWidth: 90 },
  section:   { display: 'flex', flexDirection: 'column', gap: 6 },
  label:     { fontSize: 9, fontWeight: 900, color: '#94a3b8', letterSpacing: 1 },
  colorGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 },
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Lego({ player, onBack }) {
  const [bricks, setBricks]           = useState([])
  const [status, setStatus]           = useState('Connecting...')
  const [selectedColor, setColor]     = useState('#ef4444')
  const [selectedSize, setSize]       = useState([2, 1])
  const [selectedId, setSelectedId]   = useState(null)
  const [dragging, setDragging]       = useState(null)  // {type: 'new'|'existing', ...}
  const [ghostPos, setGhostPos]       = useState(null)  // {x, y} for ghost brick

  const canvasRef  = useRef(null)
  const wsRef      = useRef(null)
  const mountedRef = useRef(true)
  const bricksRef  = useRef([])

  useEffect(() => { bricksRef.current = bricks }, [bricks])

  const p     = PLAYERS[player]
  const other = player === 'Ariel' ? 'Ella' : 'Ariel'

  // ── WebSocket ───────────────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true
    const ws = new WebSocket(`${WS_URL}/${player}`)
    wsRef.current = ws

    ws.onopen = () => { if (!mountedRef.current) return; setStatus('Connected!') }
    ws.onmessage = (e) => {
      if (!mountedRef.current) return
      const data = JSON.parse(e.data)
      if (data.bricks !== undefined) setBricks(data.bricks)
      if (data.message) setStatus(data.message)
      else if (data.connected?.length < 2) setStatus(`Waiting for ${other}...`)
      else setStatus('Building together! 🧱')
    }
    ws.onclose = () => { if (!mountedRef.current) return; setStatus('Reconnecting...') }
    ws.onerror = () => ws.close()

    return () => { mountedRef.current = false; ws.close() }
  }, [player])

  // ── Canvas render ───────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W   = canvas.width
    const H   = canvas.height

    ctx.clearRect(0, 0, W, H)

    // Background — baseplate green
    ctx.fillStyle = '#4a7c59'
    ctx.fillRect(0, 0, W, H)

    // Grid dots
    ctx.fillStyle = '#3d6b4a'
    for (let gx = GRID / 2; gx < W; gx += GRID) {
      for (let gy = GRID / 2; gy < H; gy += GRID) {
        ctx.beginPath()
        ctx.arc(gx, gy, 2, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // Draw all placed bricks
    bricks.forEach(b => {
      drawBrick(ctx, b, b.id === selectedId)
    })

    // Ghost brick while dragging
    if (ghostPos && dragging) {
      const [gw, gh] = dragging.type === 'new' ? selectedSize : [dragging.w, dragging.h]
      ctx.globalAlpha = 0.5
      drawBrick(ctx, { x: ghostPos.x, y: ghostPos.y, w: gw, h: gh, color: dragging.type === 'new' ? selectedColor : dragging.color, rotation: dragging.rotation || 0 })
      ctx.globalAlpha = 1
    }
  }, [bricks, selectedId, ghostPos, dragging, selectedColor, selectedSize])

  // ── Canvas hit test ─────────────────────────────────────────────────────────
  const getBrickAt = (x, y) => {
    // Check in reverse order (top brick first)
    for (let i = bricksRef.current.length - 1; i >= 0; i--) {
      const b   = bricksRef.current[i]
      const bx  = b.x
      const by  = b.y
      const bw  = b.w * GRID
      const bh  = b.h * GRID
      if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) {
        return b
      }
    }
    return null
  }

  const getCanvasPos = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    }
  }

  // ── Canvas interactions ─────────────────────────────────────────────────────
  const onCanvasPointerDown = (e) => {
    e.preventDefault()
    const { x, y } = getCanvasPos(e)
    const hit = getBrickAt(x, y)
    if (hit) {
      setSelectedId(hit.id)
      setDragging({ type: 'existing', id: hit.id, w: hit.w, h: hit.h, color: hit.color, rotation: hit.rotation || 0, startX: x, startY: y, origX: hit.x, origY: hit.y })
    } else {
      setSelectedId(null)
      setDragging({ type: 'new', startX: x, startY: y })
      setGhostPos({ x: snap(x - (selectedSize[0] * GRID) / 2), y: snap(y - (selectedSize[1] * GRID) / 2) })
    }
  }

  const onCanvasPointerMove = (e) => {
    if (!dragging) return
    e.preventDefault()
    const { x, y } = getCanvasPos(e)

    if (dragging.type === 'new') {
      setGhostPos({ x: snap(x - (selectedSize[0] * GRID) / 2), y: snap(y - (selectedSize[1] * GRID) / 2) })
    } else {
      const dx   = x - dragging.startX
      const dy   = y - dragging.startY
      const newX = snap(dragging.origX + dx)
      const newY = snap(dragging.origY + dy)
      setGhostPos({ x: newX, y: newY })
    }
  }

  const onCanvasPointerUp = (e) => {
    if (!dragging) return
    const { x, y } = getCanvasPos(e)

    if (dragging.type === 'new' && ghostPos) {
      // Place new brick
      wsRef.current?.send(JSON.stringify({
        type: 'add',
        x: ghostPos.x, y: ghostPos.y,
        w: selectedSize[0], h: selectedSize[1],
        color: selectedColor, rotation: 0,
      }))
      playSound('place')
      vibrate(VIBRATIONS.tap)
    } else if (dragging.type === 'existing' && ghostPos) {
      // Move existing brick
      wsRef.current?.send(JSON.stringify({
        type: 'move', id: dragging.id,
        x: ghostPos.x, y: ghostPos.y,
      }))
    }

    setDragging(null)
    setGhostPos(null)
  }

  const rotateBrick = () => {
    if (selectedId === null) return
    playSound('place')
    wsRef.current?.send(JSON.stringify({ type: 'rotate', id: selectedId }))
  }

  const deleteBrick = () => {
    if (selectedId === null) return
    playSound('error')
    vibrate(30)
    wsRef.current?.send(JSON.stringify({ type: 'delete', id: selectedId }))
    setSelectedId(null)
  }

  const clearAll = () => {
    wsRef.current?.send(JSON.stringify({ type: 'clear' }))
    setSelectedId(null)
  }

  const canvasSize = Math.min(window.innerWidth - 90, 520)

  return (
    <div style={{ minHeight: '100vh', background: p.bg, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#ffffffcc', backdropFilter: 'blur(8px)', boxShadow: '0 1px 0 #e2e8f0' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', color: p.color, fontFamily: 'inherit' }}>← Back</button>
        <div style={{ fontWeight: 900, color: '#1e1b4b', fontSize: 16 }}>🧱 LEGO Builder</div>
        <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>{status}</div>
      </div>

      {/* Selected brick toolbar */}
      {selectedId !== null && (
        <div style={{ display: 'flex', gap: 8, padding: '8px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', justifyContent: 'center' }}>
          <button onClick={rotateBrick} style={{ padding: '6px 16px', borderRadius: 10, border: '1.5px solid #6366f1', background: '#6366f111', color: '#6366f1', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
            🔄 Rotate
          </button>
          <button onClick={deleteBrick} style={{ padding: '6px 16px', borderRadius: 10, border: '1.5px solid #ef4444', background: '#fff1f2', color: '#ef4444', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
            🗑️ Delete
          </button>
          <button onClick={() => setSelectedId(null)} style={{ padding: '6px 16px', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
            ✕ Deselect
          </button>
        </div>
      )}

      {/* Main area */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Palette */}
        <Palette
          selectedColor={selectedColor}
          selectedSize={selectedSize}
          onColorChange={setColor}
          onSizeChange={setSize}
          onClear={clearAll}
        />

        {/* Canvas */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 8, overflowY: 'auto' }}>
          <canvas
            ref={canvasRef}
            width={canvasSize}
            height={canvasSize}
            style={{ display: 'block', borderRadius: 12, boxShadow: '0 8px 32px #0003', touchAction: 'none', cursor: 'crosshair' }}
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={onCanvasPointerUp}
            onPointerLeave={onCanvasPointerUp}
          />
        </div>
      </div>

      {/* Footer hint */}
      <div style={{ padding: '8px', background: '#ffffffcc', borderTop: '1px solid #e2e8f0', textAlign: 'center', fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>
        Tap canvas to place • Tap brick to select • {bricks.length} bricks placed
      </div>
    </div>
  )
}