// sounds.js - Synthesized sound effects using Web Audio API

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
  osc.type = type
  osc.frequency.setValueAtTime(freq, startTime)
  env.gain.setValueAtTime(0, startTime)
  env.gain.linearRampToValueAtTime(gainVal, startTime + 0.01)
  env.gain.exponentialRampToValueAtTime(0.001, startTime + duration)
  osc.start(startTime)
  osc.stop(startTime + duration + 0.05)
}

const SOUNDS = {
  place: () => {
    const ac = getCtx()
    const t  = ac.currentTime
    note(520, t,        0.06, 'sine', 0.2)
    note(700, t + 0.04, 0.05, 'sine', 0.1)
  },

  win: () => {
    const ac = getCtx()
    const t  = ac.currentTime
    const melody = [523, 659, 784, 1047]
    melody.forEach((freq, i) => note(freq, t + i * 0.13, 0.18, 'sine', 0.3))
    const sparkle = [1047, 1319, 1568]
    sparkle.forEach((freq, i) => note(freq, t + 0.55 + i * 0.1, 0.12, 'triangle', 0.15))
  },

  lose: () => {
    const ac = getCtx()
    const t  = ac.currentTime
    ;[392, 349, 311, 277].forEach((freq, i) => note(freq, t + i * 0.15, 0.2, 'sine', 0.25))
  },

  draw: () => {
    const ac = getCtx()
    const t  = ac.currentTime
    note(440, t,       0.15, 'sine', 0.2)
    note(440, t + 0.2, 0.15, 'sine', 0.15)
  },

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

  error: () => {
    const ac = getCtx()
    const t  = ac.currentTime
    note(180, t,       0.08, 'square', 0.15)
    note(160, t + 0.1, 0.08, 'square', 0.1)
  },

  // Gunshot: white noise burst + low thud
  shoot: () => {
    const ac = getCtx()
    const t  = ac.currentTime

    // White noise burst
    const bufSize = ac.sampleRate * 0.1
    const buffer  = ac.createBuffer(1, bufSize, ac.sampleRate)
    const data    = buffer.getChannelData(0)
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1

    const noise    = ac.createBufferSource()
    noise.buffer   = buffer
    const noiseEnv = ac.createGain()
    noiseEnv.gain.setValueAtTime(0.5, t)
    noiseEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.1)
    const filter   = ac.createBiquadFilter()
    filter.type    = 'bandpass'
    filter.frequency.value = 1400
    filter.Q.value = 0.8
    noise.connect(filter)
    filter.connect(noiseEnv)
    noiseEnv.connect(ac.destination)
    noise.start(t)
    noise.stop(t + 0.12)

    // Low thud
    note(90,  t,        0.15, 'sine', 0.5)
    note(55,  t + 0.02, 0.12, 'sine', 0.3)
  },
}

export function playSound(name) {
  try {
    const ac = getCtx()
    if (ac.state === 'suspended') ac.resume()
    SOUNDS[name]?.()
  } catch (e) {
    // Silently fail
  }
}