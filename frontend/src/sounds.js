// sounds.js - Synthesized sound effects using Web Audio API
// No external files needed. Import and call playSound('win') etc.

let ctx = null

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
  return ctx
}

function note(freq, startTime, duration, type = 'sine', gainVal = 0.3) {
  const ac  = getCtx()
  const osc = ac.createOscillator()
  const env = ac.createGain()

  osc.connect(env)
  env.connect(ac.destination)

  osc.type      = type
  osc.frequency.setValueAtTime(freq, startTime)

  env.gain.setValueAtTime(0, startTime)
  env.gain.linearRampToValueAtTime(gainVal, startTime + 0.01)
  env.gain.exponentialRampToValueAtTime(0.001, startTime + duration)

  osc.start(startTime)
  osc.stop(startTime + duration + 0.05)
}

const SOUNDS = {
  // Soft pop when placing a piece
  place: () => {
    const ac = getCtx()
    const t  = ac.currentTime
    note(520, t,        0.06, 'sine',   0.2)
    note(700, t + 0.04, 0.05, 'sine',   0.1)
  },

  // Happy fanfare for winning
  win: () => {
    const ac = getCtx()
    const t  = ac.currentTime
    const melody = [523, 659, 784, 1047]
    melody.forEach((freq, i) => {
      note(freq, t + i * 0.13, 0.18, 'sine', 0.3)
    })
    // Add sparkle layer
    const sparkle = [1047, 1319, 1568]
    sparkle.forEach((freq, i) => {
      note(freq, t + 0.55 + i * 0.1, 0.12, 'triangle', 0.15)
    })
  },

  // Sad descending for losing
  lose: () => {
    const ac = getCtx()
    const t  = ac.currentTime
    const melody = [392, 349, 311, 277]
    melody.forEach((freq, i) => {
      note(freq, t + i * 0.15, 0.2, 'sine', 0.25)
    })
  },

  // Neutral double ding for draw
  draw: () => {
    const ac = getCtx()
    const t  = ac.currentTime
    note(440, t,        0.15, 'sine', 0.2)
    note(440, t + 0.2,  0.15, 'sine', 0.15)
  },

  // Whoosh for rematch / game reset
  rematch: () => {
    const ac  = getCtx()
    const t   = ac.currentTime
    const osc = ac.createOscillator()
    const env = ac.createGain()
    osc.connect(env)
    env.connect(ac.destination)
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(200, t)
    osc.frequency.exponentialRampToValueAtTime(600, t + 0.2)
    env.gain.setValueAtTime(0.2, t)
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.25)
    osc.start(t)
    osc.stop(t + 0.3)
  },

  // Soft error buzz for invalid move
  error: () => {
    const ac = getCtx()
    const t  = ac.currentTime
    note(180, t,       0.08, 'square', 0.15)
    note(160, t + 0.1, 0.08, 'square', 0.1)
  },
}

export function playSound(name) {
  try {
    // Resume context if suspended (browser autoplay policy)
    const ac = getCtx()
    if (ac.state === 'suspended') ac.resume()
    SOUNDS[name]?.()
  } catch (e) {
    // Silently fail — sound is never critical
  }
}