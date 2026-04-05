import { useState, useEffect, useRef } from 'react'
import { playSound } from '../sounds'
import { vibrate, VIBRATIONS } from '../vibrate'

const WS_PROTOCOL = location.protocol === 'https:' ? 'wss' : 'ws'
const WS_URL      = `${WS_PROTOCOL}://${location.host}/api/lego/ws`

// ── Isometric constants ───────────────────────────────────────────────────────
const GRID     = 1           // 1 logical unit per stud
const TILE_W   = 36          // width of one iso tile (pixels)
const TILE_H   = 18          // height of one iso tile (pixels)
const BRICK_H  = 22          // height of brick body in pixels
const STUD_H   = 5           // height of stud cylinder
const STUD_R   = 6           // radius of stud

const BOARD_COLS = 16
const BOARD_ROWS = 16

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

const BRICK_SIZES = [
  [1,1], [2,1], [3,1], [4,1],
  [2,2], [3,2], [4,2],
]

const BRICK_COLORS = [
  { hex: '#e53e3e', name: 'Red'    },
  { hex: '#dd6b20', name: 'Orange' },
  { hex: '#d69e2e', name: 'Yellow' },
  { hex: '#38a169', name: 'Green'  },
  { hex: '#3182ce', name: 'Blue'   },
  { hex: '#805ad5', name: 'Purple' },
  { hex: '#d53f8c', name: 'Pink'   },
  { hex: '#f7fafc', name: 'White'  },
  { hex: '#1a202c', name: 'Black'  },
  { hex: '#718096', name: 'Gray'   },
]

// ── Color utils ───────────────────────────────────────────────────────────────
function hexToRgb(hex) {
  const c = hex.replace('#','')
  const n = parseInt(c.length===3 ? c.split('').map(x=>x+x).join('') : c, 16)
  return [(n>>16)&255, (n>>8)&255, n&255]
}
function rgbToHex(r,g,b) {
  return '#'+[r,g,b].map(v=>Math.min(255,Math.max(0,Math.round(v))).toString(16).padStart(2,'0')).join('')
}
function shade(hex, amt) {
  const [r,g,b] = hexToRgb(hex)
  return rgbToHex(r+amt, g+amt, b+amt)
}

// ── Isometric projection ──────────────────────────────────────────────────────
// Convert grid coords (col, row) to screen (px, py)
function isoProject(col, row, originX, originY) {
  const px = originX + (col - row) * (TILE_W / 2)
  const py = originY + (col + row) * (TILE_H / 2)
  return { px, py }
}

// Convert screen (sx, sy) back to nearest grid cell
function isoUnproject(sx, sy, originX, originY) {
  const dx = sx - originX
  const dy = sy - originY
  const col = (dx / (TILE_W/2) + dy / (TILE_H/2)) / 2
  const row = (dy / (TILE_H/2) - dx / (TILE_W/2)) / 2
  return { col: Math.round(col), row: Math.round(row) }
}

// ── Draw a single iso brick ───────────────────────────────────────────────────
function drawIsoBrick(ctx, col, row, w, h, color, originX, originY, highlight = false) {
  // Draw from back to front for each cell of the brick
  // Top face corners (in grid space):
  // TL=(col,row), TR=(col+w,row), BR=(col+w,row+h), BL=(col,row+h)

  const topColor   = shade(color,  30)
  const leftColor  = shade(color, -40)
  const rightColor = shade(color, -20)
  const studColor  = shade(color,  15)

  // ── Left face ─────────────────────────────────────────────────────────────
  // Bottom-left side of brick (row direction)
  {
    const TL = isoProject(col,   row+h, originX, originY)
    const TR = isoProject(col+w, row+h, originX, originY)
    ctx.beginPath()
    ctx.moveTo(TL.px, TL.py)
    ctx.lineTo(TR.px, TR.py)
    ctx.lineTo(TR.px, TR.py + BRICK_H)
    ctx.lineTo(TL.px, TL.py + BRICK_H)
    ctx.closePath()
    ctx.fillStyle = leftColor
    ctx.fill()
    ctx.strokeStyle = shade(color, -60)
    ctx.lineWidth   = 0.8
    ctx.stroke()
  }

  // ── Right face ────────────────────────────────────────────────────────────
  // Right side of brick (col direction)
  {
    const TL = isoProject(col+w, row,   originX, originY)
    const TR = isoProject(col+w, row+h, originX, originY)
    ctx.beginPath()
    ctx.moveTo(TL.px, TL.py)
    ctx.lineTo(TR.px, TR.py)
    ctx.lineTo(TR.px, TR.py + BRICK_H)
    ctx.lineTo(TL.px, TL.py + BRICK_H)
    ctx.closePath()
    ctx.fillStyle = rightColor
    ctx.fill()
    ctx.strokeStyle = shade(color, -60)
    ctx.lineWidth   = 0.8
    ctx.stroke()
  }

  // ── Top face ──────────────────────────────────────────────────────────────
  {
    const TL = isoProject(col,   row,   originX, originY)
    const TR = isoProject(col+w, row,   originX, originY)
    const BR = isoProject(col+w, row+h, originX, originY)
    const BL = isoProject(col,   row+h, originX, originY)

    ctx.beginPath()
    ctx.moveTo(TL.px, TL.py)
    ctx.lineTo(TR.px, TR.py)
    ctx.lineTo(BR.px, BR.py)
    ctx.lineTo(BL.px, BL.py)
    ctx.closePath()
    ctx.fillStyle = topColor
    ctx.fill()

    if (highlight) {
      ctx.strokeStyle = '#fff'
      ctx.lineWidth   = 2
    } else {
      ctx.strokeStyle = shade(color, -60)
      ctx.lineWidth   = 0.8
    }
    ctx.stroke()
  }

  // ── Studs ─────────────────────────────────────────────────────────────────
  for (let sc = 0; sc < w; sc++) {
    for (let sr2 = 0; sr2 < h; sr2++) {
      const center = isoProject(col + sc + 0.5, row + sr2 + 0.5, originX, originY)
      const cx     = center.px
      const cy     = center.py

      // Stud side (left face of cylinder)
      ctx.beginPath()
      ctx.ellipse(cx, cy + STUD_H, STUD_R * 0.5, STUD_H * 0.4, 0, 0, Math.PI)
      ctx.fillStyle = shade(color, -30)
      ctx.fill()

      // Stud top ellipse
      ctx.beginPath()
      ctx.ellipse(cx, cy, STUD_R * 0.8, STUD_R * 0.4, 0, 0, Math.PI * 2)
      ctx.fillStyle = studColor
      ctx.fill()
      ctx.strokeStyle = shade(color, -40)
      ctx.lineWidth   = 0.6
      ctx.stroke()

      // Shine
      ctx.beginPath()
      ctx.ellipse(cx - STUD_R*0.25, cy - STUD_R*0.1, STUD_R*0.25, STUD_R*0.1, -0.4, 0, Math.PI*2)
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.fill()
    }
  }
}

// ── Draw isometric baseplate grid ─────────────────────────────────────────────
function drawBaseplate(ctx, originX, originY) {
  for (let c = 0; c < BOARD_COLS; c++) {
    for (let r = 0; r < BOARD_ROWS; r++) {
      const TL = isoProject(c,   r,   originX, originY)
      const TR = isoProject(c+1, r,   originX, originY)
      const BR = isoProject(c+1, r+1, originX, originY)
      const BL = isoProject(c,   r+1, originX, originY)

      // Alternating tile colors
      const even = (c + r) % 2 === 0
      ctx.beginPath()
      ctx.moveTo(TL.px, TL.py)
      ctx.lineTo(TR.px, TR.py)
      ctx.lineTo(BR.px, BR.py)
      ctx.lineTo(BL.px, BL.py)
      ctx.closePath()
      ctx.fillStyle   = even ? '#4a7c59' : '#3d6b4a'
      ctx.fill()
      ctx.strokeStyle = '#35603f'
      ctx.lineWidth   = 0.5
      ctx.stroke()
    }
  }
}

// ── Ghost brick (semi-transparent placement preview) ──────────────────────────
function drawGhostBrick(ctx, col, row, w, h, color, originX, originY) {
  ctx.globalAlpha = 0.45
  drawIsoBrick(ctx, col, row, w, h, color, originX, originY, false)
  ctx.globalAlpha = 1
}

// ── Sort bricks back-to-front for painter's algorithm ─────────────────────────
function sortBricks(bricks) {
  return [...bricks].sort((a, b) => (a.col + a.row) - (b.col + b.row))
}

// ── Palette component ─────────────────────────────────────────────────────────
function Palette({ selectedColor, selectedSize, onColorChange, onSizeChange, onClear }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10, padding:'10px 6px', background:'#fff', borderRight:'1px solid #e2e8f0', overflowY:'auto', minWidth:72, alignItems:'center' }}>
      <div style={{ fontSize:9, fontWeight:900, color:'#94a3b8', letterSpacing:1 }}>COLOR</div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:3 }}>
        {BRICK_COLORS.map(c => (
          <div key={c.hex} onClick={() => onColorChange(c.hex)} style={{ width:26, height:26, borderRadius:5, background:c.hex, border: selectedColor===c.hex ? '3px solid #6366f1':'2px solid #e2e8f0', cursor:'pointer', boxShadow: selectedColor===c.hex ? '0 0 0 2px #6366f155':'none' }} />
        ))}
      </div>

      <div style={{ fontSize:9, fontWeight:900, color:'#94a3b8', letterSpacing:1, marginTop:4 }}>SIZE</div>
      <div style={{ display:'flex', flexDirection:'column', gap:3, width:'100%' }}>
        {BRICK_SIZES.map(([w,h]) => {
          const sel = selectedSize[0]===w && selectedSize[1]===h
          return (
            <div key={`${w}x${h}`} onClick={() => onSizeChange([w,h])} style={{ padding:'3px 4px', borderRadius:6, cursor:'pointer', background: sel?'#6366f122':'transparent', border:`1.5px solid ${sel?'#6366f1':'#e2e8f0'}`, display:'flex', alignItems:'center', gap:4, justifyContent:'center' }}>
              <div style={{ display:'flex', gap:1 }}>
                {Array(w).fill(null).map((_,i) => (
                  <div key={i} style={{ display:'flex', flexDirection:'column', gap:1 }}>
                    {Array(h).fill(null).map((_,j) => (
                      <div key={j} style={{ width:6, height:6, borderRadius:1, background: sel?'#6366f1':'#94a3b8' }} />
                    ))}
                  </div>
                ))}
              </div>
              <span style={{ fontSize:9, fontWeight:700, color: sel?'#6366f1':'#64748b' }}>{w}×{h}</span>
            </div>
          )
        })}
      </div>

      <button onClick={onClear} style={{ marginTop:6, padding:'6px 4px', borderRadius:8, border:'1.5px solid #fca5a5', background:'#fff1f2', color:'#ef4444', fontWeight:800, fontSize:11, cursor:'pointer', width:'100%' }}>
        🗑️ Clear
      </button>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Lego({ player, players, onBack }) {
  const [bricks, setBricks]         = useState([])
  const [status, setStatus]         = useState('Connecting...')
  const [selectedColor, setColor]   = useState('#e53e3e')
  const [selectedSize, setSize]     = useState([2,1])
  const [selectedId, setSelectedId] = useState(null)
  const [ghostCell, setGhostCell]   = useState(null)  // {col, row}

  const canvasRef    = useRef(null)
  const wsRef        = useRef(null)
  const mountedRef   = useRef(true)
  const bricksRef    = useRef([])
  const originRef    = useRef({ x: 0, y: 0 })

  useEffect(() => { bricksRef.current = bricks }, [bricks])

  const p     = safe(players, player, 0)
  const other = state?.connected?.find(n => n !== player) || null

  // ── Compute canvas origin (center-top of board) ───────────────────────────
  const computeOrigin = (canvas) => {
    const boardPixelW = (BOARD_COLS + BOARD_ROWS) * (TILE_W / 2)
    const ox = canvas.width / 2
    const oy = 40
    return { x: ox, y: oy }
  }

  // ── WebSocket ─────────────────────────────────────────────────────────────
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
      else if (data.connected?.length < 2) setStatus('Waiting for opponent...')
      else setStatus('🧱 Building together!')
    }
    ws.onclose = () => { if (!mountedRef.current) return; setStatus('Reconnecting...') }
    ws.onerror = () => ws.close()
    return () => { mountedRef.current = false; ws.close() }
  }, [player])

  // ── Canvas render ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const origin = computeOrigin(canvas)
    originRef.current = origin
    const { x: ox, y: oy } = origin

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Sky/background
    const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height)
    bgGrad.addColorStop(0, '#e0f2fe')
    bgGrad.addColorStop(1, '#bae6fd')
    ctx.fillStyle = bgGrad
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Baseplate
    drawBaseplate(ctx, ox, oy)

    // Bricks sorted back-to-front
    const sorted = sortBricks(bricks)
    sorted.forEach(b => {
      drawIsoBrick(ctx, b.col, b.row, b.w, b.h, b.color, ox, oy, b.id === selectedId)
    })

    // Ghost brick
    if (ghostCell) {
      const [sw, sh] = selectedSize
      // Clamp to board
      const gc = Math.max(0, Math.min(BOARD_COLS - sw, ghostCell.col))
      const gr = Math.max(0, Math.min(BOARD_ROWS - sh, ghostCell.row))
      drawGhostBrick(ctx, gc, gr, sw, sh, selectedColor, ox, oy)
    }

  }, [bricks, selectedId, ghostCell, selectedColor, selectedSize])

  // ── Pointer → grid cell ───────────────────────────────────────────────────
  const getCell = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect    = canvas.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    const sx = (clientX - rect.left) * (canvas.width / rect.width)
    const sy = (clientY - rect.top)  * (canvas.height / rect.height)
    const { x: ox, y: oy } = originRef.current
    const { col, row } = isoUnproject(sx, sy, ox, oy)
    return { col, row }
  }

  // Find brick at grid cell
  const getBrickAtCell = (col, row) => {
    for (let i = bricksRef.current.length - 1; i >= 0; i--) {
      const b = bricksRef.current[i]
      if (col >= b.col && col < b.col + b.w && row >= b.row && row < b.row + b.h) {
        return b
      }
    }
    return null
  }

  // ── Interaction handlers ──────────────────────────────────────────────────
  const onPointerDown = (e) => {
    e.preventDefault()
    const cell = getCell(e)
    if (!cell) return

    const hit = getBrickAtCell(cell.col, cell.row)
    if (hit) {
      setSelectedId(hit.id)
      setGhostCell(null)
    } else {
      setSelectedId(null)
      const [sw, sh] = selectedSize
      const gc = Math.max(0, Math.min(BOARD_COLS - sw, cell.col - Math.floor(sw/2)))
      const gr = Math.max(0, Math.min(BOARD_ROWS - sh, cell.row - Math.floor(sh/2)))
      setGhostCell({ col: gc, row: gr })
    }
  }

  const onPointerMove = (e) => {
    e.preventDefault()
    if (selectedId !== null) return  // don't show ghost when brick selected
    const cell = getCell(e)
    if (!cell) return
    const [sw, sh] = selectedSize
    const gc = Math.max(0, Math.min(BOARD_COLS - sw, cell.col - Math.floor(sw/2)))
    const gr = Math.max(0, Math.min(BOARD_ROWS - sh, cell.row - Math.floor(sh/2)))
    setGhostCell({ col: gc, row: gr })
  }

  const onPointerUp = (e) => {
    e.preventDefault()
    if (!ghostCell || selectedId !== null) return
    const [sw, sh] = selectedSize
    const gc = Math.max(0, Math.min(BOARD_COLS - sw, ghostCell.col))
    const gr = Math.max(0, Math.min(BOARD_ROWS - sh, ghostCell.row))
    wsRef.current?.send(JSON.stringify({
      type: 'add', col: gc, row: gr, w: sw, h: sh, color: selectedColor,
    }))
    playSound('place')
    vibrate(VIBRATIONS.tap)
    setGhostCell(null)
  }

  const deleteBrick = () => {
    if (selectedId === null) return
    wsRef.current?.send(JSON.stringify({ type: 'delete', id: selectedId }))
    playSound('error'); vibrate(30)
    setSelectedId(null)
  }

  const clearAll = () => {
    wsRef.current?.send(JSON.stringify({ type: 'clear' }))
    setSelectedId(null)
    setGhostCell(null)
  }

  const canvasW = Math.min(window.innerWidth - 72, 560)
  const canvasH = Math.round(canvasW * 0.85)

  return (
    <div style={{ minHeight:'100vh', background: p.bg, display:'flex', flexDirection:'column' }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', background:'#ffffffcc', backdropFilter:'blur(8px)', boxShadow:'0 1px 0 #e2e8f0' }}>
        <button onClick={onBack} style={{ background:'none', border:'none', fontSize:15, fontWeight:700, cursor:'pointer', color:p.color, fontFamily:'inherit' }}>← Back</button>
        <div style={{ fontWeight:900, color:'#1e1b4b', fontSize:16 }}>🧱 LEGO Builder</div>
        <div style={{ fontSize:11, color:'#94a3b8', fontWeight:700 }}>{bricks.length} bricks</div>
      </div>

      {/* Status */}
      <div style={{ padding:'6px 16px', background:'#f8fafc', borderBottom:'1px solid #e2e8f0', textAlign:'center', fontSize:12, color:'#64748b', fontWeight:700 }}>
        {status}
      </div>

      {/* Selected toolbar */}
      {selectedId !== null && (
        <div style={{ display:'flex', gap:8, padding:'8px 16px', background:'#f0f9ff', borderBottom:'1px solid #bae6fd', justifyContent:'center' }}>
          <button onClick={deleteBrick} style={{ padding:'6px 16px', borderRadius:10, border:'1.5px solid #ef4444', background:'#fff1f2', color:'#ef4444', fontWeight:800, fontSize:13, cursor:'pointer' }}>🗑️ Delete</button>
          <button onClick={() => setSelectedId(null)} style={{ padding:'6px 16px', borderRadius:10, border:'1.5px solid #e2e8f0', background:'#fff', color:'#64748b', fontWeight:800, fontSize:13, cursor:'pointer' }}>✕ Deselect</button>
        </div>
      )}

      {/* Main */}
      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
        <Palette selectedColor={selectedColor} selectedSize={selectedSize} onColorChange={setColor} onSizeChange={setSize} onClear={clearAll} />
        <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', alignItems:'center', padding:8, gap:8 }}>
          <canvas
            ref={canvasRef}
            width={canvasW}
            height={canvasH}
            style={{ display:'block', borderRadius:12, boxShadow:'0 8px 32px #0003', touchAction:'none', cursor:'crosshair' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={() => setGhostCell(null)}
          />
          <div style={{ fontSize:11, color:'#94a3b8', fontWeight:700, textAlign:'center', paddingBottom:8 }}>
            Tap to place • Tap a brick to select it • {bricks.length} bricks
          </div>
        </div>
      </div>
    </div>
  )
}