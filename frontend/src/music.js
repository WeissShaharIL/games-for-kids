// music.js - Dynamic ambient music via Web Audio API
// Features: melody lines, arpeggios, chord progressions, varying rhythm

let ac         = null
let masterGain = null
let running    = false
let muted      = false
let timeouts   = []

// ── Scales & chords ───────────────────────────────────────────────────────────
const C_MAJOR_PENTATONIC = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99, 880.00]

// Chord progressions (freq ratios relative to C4=261.63)
const PROGRESSIONS = [
  // I - vi - IV - V  (C - Am - F - G)
  [
    [261.63, 329.63, 392.00],        // C maj
    [220.00, 261.63, 329.63],        // A min
    [174.61, 220.00, 261.63],        // F maj
    [196.00, 246.94, 293.66],        // G maj
  ],
  // I - IV - vi - V  (C - F - Am - G)
  [
    [261.63, 329.63, 392.00],
    [174.61, 220.00, 261.63],
    [220.00, 261.63, 329.63],
    [196.00, 246.94, 293.66],
  ],
  // I - V - vi - IV  (C - G - Am - F)
  [
    [261.63, 329.63, 392.00],
    [196.00, 246.94, 293.66],
    [220.00, 261.63, 329.63],
    [174.61, 220.00, 261.63],
  ],
]

let currentProgIdx  = 0
let currentChordIdx = 0

function getAc() {
  if (!ac) {
    ac = new (window.AudioContext || window.webkitAudioContext)()
    masterGain = ac.createGain()
    masterGain.gain.value = muted ? 0 : 0.15
    masterGain.connect(ac.destination)
  }
  return ac
}

// ── Reverb ────────────────────────────────────────────────────────────────────
let reverbNode = null
function getReverb() {
  const ctx = getAc()
  if (reverbNode) return reverbNode
  const conv   = ctx.createConvolver()
  const len    = ctx.sampleRate * 3
  const buf    = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const ch = buf.getChannelData(c)
    for (let i = 0; i < len; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2)
    }
  }
  conv.buffer = buf
  const wet   = ctx.createGain()
  wet.gain.value = 0.35
  conv.connect(wet)
  wet.connect(masterGain)
  reverbNode = conv
  return conv
}

// ── Note player ───────────────────────────────────────────────────────────────
function playNote(freq, when, duration, type = 'sine', vol = 0.4, reverb = true) {
  const ctx = getAc()
  const osc = ctx.createOscillator()
  const env = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, when)
  // Slight pitch wobble for warmth
  osc.frequency.linearRampToValueAtTime(freq * (1 + 0.002 * Math.random()), when + duration * 0.5)

  env.gain.setValueAtTime(0, when)
  env.gain.linearRampToValueAtTime(vol, when + 0.02)
  env.gain.setValueAtTime(vol, when + duration * 0.6)
  env.gain.exponentialRampToValueAtTime(0.001, when + duration)

  osc.connect(env)
  if (reverb) {
    env.connect(getReverb())
  } else {
    env.connect(masterGain)
  }
  osc.start(when)
  osc.stop(when + duration + 0.05)
}

// ── Melody patterns ───────────────────────────────────────────────────────────
function playMelody() {
  if (!running) return
  const ctx  = getAc()
  const now  = ctx.currentTime
  const bpm  = 72 + Math.random() * 20
  const beat = 60 / bpm

  // Pick a melody pattern randomly
  const pattern = Math.floor(Math.random() * 4)

  if (pattern === 0) {
    // Rising arpeggio
    const chord = PROGRESSIONS[currentProgIdx][currentChordIdx]
    const notes = [...chord, chord[0] * 2, chord[1] * 2]
    notes.forEach((freq, i) => {
      if (Math.random() < 0.8) {
        playNote(freq * 1, now + i * beat * 0.5, beat * 1.2, 'sine', 0.25)
      }
    })

  } else if (pattern === 1) {
    // Stepwise melody on pentatonic
    const start = Math.floor(Math.random() * 4)
    const dir   = Math.random() < 0.5 ? 1 : -1
    const len   = 4 + Math.floor(Math.random() * 4)
    for (let i = 0; i < len; i++) {
      const idx  = Math.max(0, Math.min(9, start + dir * i + Math.floor(Math.random() * 2 - 0.5)))
      const freq = C_MAJOR_PENTATONIC[idx]
      const when = now + i * beat * (0.4 + Math.random() * 0.3)
      if (Math.random() < 0.75) {
        playNote(freq, when, beat * 1.5, 'sine', 0.2 + Math.random() * 0.15)
      }
    }

  } else if (pattern === 2) {
    // Bouncy skipping pattern
    const hi  = C_MAJOR_PENTATONIC.slice(5)
    const lo  = C_MAJOR_PENTATONIC.slice(0, 5)
    const len = 6
    for (let i = 0; i < len; i++) {
      const freq = i % 2 === 0
        ? hi[Math.floor(Math.random() * hi.length)]
        : lo[Math.floor(Math.random() * lo.length)]
      const when = now + i * beat * 0.45
      if (Math.random() < 0.7) {
        playNote(freq, when, beat * 1.0, 'sine', 0.18)
      }
    }

  } else {
    // Trill / ornament — two rapid notes
    const base = C_MAJOR_PENTATONIC[2 + Math.floor(Math.random() * 5)]
    const next = C_MAJOR_PENTATONIC[3 + Math.floor(Math.random() * 4)]
    for (let i = 0; i < 8; i++) {
      const freq = i % 2 === 0 ? base : next
      playNote(freq, now + i * beat * 0.18, beat * 0.3, 'sine', 0.15)
    }
  }

  // Advance chord
  currentChordIdx = (currentChordIdx + 1) % 4
  if (currentChordIdx === 0) {
    currentProgIdx = (currentProgIdx + 1) % PROGRESSIONS.length
  }

  // Schedule next melody phrase — variable gap
  const gap = (beat * 6 + Math.random() * beat * 8) * 1000
  const t   = setTimeout(playMelody, gap)
  timeouts.push(t)
}

// ── Pad chords ────────────────────────────────────────────────────────────────
function playPad() {
  if (!running) return
  const ctx      = getAc()
  const now      = ctx.currentTime
  const chord    = PROGRESSIONS[currentProgIdx][currentChordIdx]
  const duration = 5 + Math.random() * 4

  chord.forEach(freq => {
    // Play at half pitch for warmth
    playNote(freq / 2, now, duration, 'sine', 0.06, false)
    // Add a subtle triangle wave for texture
    playNote(freq / 2, now + 0.1, duration - 0.1, 'triangle', 0.03, false)
  })

  // Occasional bass note
  if (Math.random() < 0.6) {
    playNote(chord[0] / 4, now, duration * 0.8, 'sine', 0.08, false)
  }

  const nextIn = (duration - 0.5 + Math.random() * 2) * 1000
  const t      = setTimeout(playPad, nextIn)
  timeouts.push(t)
}

// ── Bell accent ───────────────────────────────────────────────────────────────
function playBellAccent() {
  if (!running) return
  const ctx  = getAc()
  const now  = ctx.currentTime

  if (Math.random() < 0.6) {
    const freq = C_MAJOR_PENTATONIC[5 + Math.floor(Math.random() * 5)]
    playNote(freq * 2, now, 3.0, 'sine', 0.12)
  }

  const nextIn = (4 + Math.random() * 8) * 1000
  const t      = setTimeout(playBellAccent, nextIn)
  timeouts.push(t)
}

// ── Public API ────────────────────────────────────────────────────────────────
export function startMusic() {
  if (running) return
  running = true
  reverbNode = null   // fresh reverb each session
  const ctx = getAc()
  if (ctx.state === 'suspended') ctx.resume()

  // Stagger start times so they don't all hit at once
  playMelody()
  const t1 = setTimeout(playPad,        1200)
  const t2 = setTimeout(playBellAccent, 3000)
  timeouts.push(t1, t2)
}

export function stopMusic() {
  running = false
  timeouts.forEach(clearTimeout)
  timeouts = []
}

export function setMuted(val) {
  muted = val
  if (masterGain) {
    const ctx = getAc()
    masterGain.gain.cancelScheduledValues(ctx.currentTime)
    masterGain.gain.linearRampToValueAtTime(val ? 0 : 0.15, ctx.currentTime + 0.4)
  }
  if (!muted && !running) startMusic()
}

export function isMuted() {
  return muted
}

// ── Page Visibility — pause when app is backgrounded ─────────────────────────
document.addEventListener('visibilitychange', () => {
  if (!ac) return
  if (document.hidden) {
    if (ac.state === 'running') ac.suspend()
  } else {
    if (ac.state === 'suspended' && !muted) ac.resume()
  }
})
