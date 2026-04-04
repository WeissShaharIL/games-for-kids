// music.js - Soft ambient background music via Web Audio API
// Gentle music-box style: random pentatonic chimes + soft pad chords

let ac       = null
let masterGain = null
let running  = false
let muted    = false
let timeouts = []

const PENTATONIC = [261.63, 293.66, 329.63, 392.00, 440.00,  // C4 D4 E4 G4 A4
                    523.25, 587.33, 659.25, 783.99, 880.00]   // C5 D5 E5 G5 A5

const PAD_CHORDS = [
  [261.63, 329.63, 392.00],  // C maj
  [293.66, 369.99, 440.00],  // D min
  [329.63, 392.00, 493.88],  // E min
  [261.63, 329.63, 440.00],  // C maj add9
]

function getAc() {
  if (!ac) {
    ac = new (window.AudioContext || window.webkitAudioContext)()
    masterGain = ac.createGain()
    masterGain.gain.value = muted ? 0 : 0.18
    masterGain.connect(ac.destination)
  }
  return ac
}

// Play a single chime note
function chime(freq, when, duration = 1.8) {
  const ctx = getAc()
  const osc = ctx.createOscillator()
  const env = ctx.createGain()
  const rev = createReverb(ctx)

  osc.type = 'sine'
  osc.frequency.value = freq

  env.gain.setValueAtTime(0, when)
  env.gain.linearRampToValueAtTime(0.5, when + 0.02)
  env.gain.exponentialRampToValueAtTime(0.001, when + duration)

  osc.connect(env)
  env.connect(rev)
  rev.connect(masterGain)

  osc.start(when)
  osc.stop(when + duration + 0.1)
}

// Soft pad chord
function padChord(freqs, when, duration = 4.0) {
  const ctx = getAc()
  freqs.forEach(freq => {
    const osc = ctx.createOscillator()
    const env = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.value = freq / 2  // one octave down for softness

    env.gain.setValueAtTime(0, when)
    env.gain.linearRampToValueAtTime(0.08, when + 0.6)
    env.gain.setValueAtTime(0.08, when + duration - 0.8)
    env.gain.exponentialRampToValueAtTime(0.001, when + duration)

    osc.connect(env)
    env.connect(masterGain)

    osc.start(when)
    osc.stop(when + duration + 0.1)
  })
}

// Simple convolver-based reverb
function createReverb(ctx) {
  const convolver = ctx.createConvolver()
  const length    = ctx.sampleRate * 2.5
  const impulse   = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const channel = impulse.getChannelData(c)
    for (let i = 0; i < length; i++) {
      channel[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5)
    }
  }
  convolver.buffer = impulse

  const wet = ctx.createGain()
  wet.gain.value = 0.4
  convolver.connect(wet)
  return wet
}

// Schedule a phrase of chimes
function schedulePhrase() {
  if (!running) return
  const ctx  = getAc()
  const now  = ctx.currentTime
  const beat = 0.55  // seconds per note slot

  // Pick 5-7 random notes from pentatonic scale
  const count = 5 + Math.floor(Math.random() * 3)
  for (let i = 0; i < count; i++) {
    if (Math.random() < 0.65) {  // some rests
      const freq = PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)]
      const vel  = 0.3 + Math.random() * 0.4
      chime(freq * vel < 200 ? freq * 2 : freq, now + i * beat * (0.8 + Math.random() * 0.4))
    }
  }

  // Schedule next phrase
  const nextIn = (beat * count + 1.5 + Math.random() * 2) * 1000
  const t = setTimeout(schedulePhrase, nextIn)
  timeouts.push(t)
}

// Schedule pad chords
function schedulePad() {
  if (!running) return
  const ctx    = getAc()
  const chord  = PAD_CHORDS[Math.floor(Math.random() * PAD_CHORDS.length)]
  const duration = 5 + Math.random() * 3
  padChord(chord, ctx.currentTime, duration)

  const nextIn = (duration - 1 + Math.random() * 2) * 1000
  const t = setTimeout(schedulePad, nextIn)
  timeouts.push(t)
}

export function startMusic() {
  if (running) return
  running = true
  const ctx = getAc()
  if (ctx.state === 'suspended') ctx.resume()
  schedulePhrase()
  setTimeout(schedulePad, 800)
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
    masterGain.gain.linearRampToValueAtTime(val ? 0 : 0.18, ctx.currentTime + 0.3)
  }
  if (!muted && !running) startMusic()
}

export function isMuted() {
  return muted
}