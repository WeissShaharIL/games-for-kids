// sounds.js - Synthesized sound effects using Web Audio API
// No external files needed.

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
  // Soft pop when placing a piece
  place: () => {
    const ac = getCtx(), t = ac.currentTime
    note(520, t,        0.06, 'sine', 0.2)
    note(700, t + 0.04, 0.05, 'sine', 0.1)
  },

  // Happy fanfare for winning
  win: () => {
    const ac = getCtx(), t = ac.currentTime
    ;[523, 659, 784, 1047].forEach((freq, i) => note(freq, t + i * 0.13, 0.18, 'sine', 0.3))
    ;[1047, 1319, 1568].forEach((freq, i) => note(freq, t + 0.55 + i * 0.1, 0.12, 'triangle', 0.15))
  },

  // Sad descending for losing
  lose: () => {
    const ac = getCtx(), t = ac.currentTime
    ;[392, 349, 311, 277].forEach((freq, i) => note(freq, t + i * 0.15, 0.2, 'sine', 0.25))
  },

  // Neutral double ding for draw
  draw: () => {
    const ac = getCtx(), t = ac.currentTime
    note(440, t,       0.15, 'sine', 0.2)
    note(440, t + 0.2, 0.15, 'sine', 0.15)
  },

  // Whoosh for rematch / game reset
  rematch: () => {
    const ac = getCtx(), t = ac.currentTime
    const osc = ac.createOscillator(), env = ac.createGain()
    osc.connect(env); env.connect(ac.destination)
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(200, t)
    osc.frequency.exponentialRampToValueAtTime(600, t + 0.2)
    env.gain.setValueAtTime(0.2, t)
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.25)
    osc.start(t); osc.stop(t + 0.3)
  },

  // Soft error buzz
  error: () => {
    const ac = getCtx(), t = ac.currentTime
    note(180, t,       0.08, 'square', 0.15)
    note(160, t + 0.1, 0.08, 'square', 0.1)
  },

  // Gunshot: white noise burst + low thud
  shoot: () => {
    const ac = getCtx(), t = ac.currentTime
    const bufSize = ac.sampleRate * 0.1
    const buffer = ac.createBuffer(1, bufSize, ac.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1
    const noise = ac.createBufferSource()
    noise.buffer = buffer
    const noiseEnv = ac.createGain()
    noiseEnv.gain.setValueAtTime(0.5, t)
    noiseEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.1)
    const filter = ac.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 1400
    filter.Q.value = 0.8
    noise.connect(filter); filter.connect(noiseEnv); noiseEnv.connect(ac.destination)
    noise.start(t); noise.stop(t + 0.12)
    note(90, t,        0.15, 'sine', 0.5)
    note(55, t + 0.02, 0.12, 'sine', 0.3)
  },
  // ── Splendor ──────────────────────────────────────────────────────────────

  // Buy card — bright triumphant ascending chime
  collect: () => {
    const ac  = getCtx()
    const t   = ac.currentTime
    const rev = createReverb(ac, 1.8)
    rev.connect(ac.destination)
    ;[523, 659, 784, 1047, 1319].forEach((freq, i) => {
      osc(ac, 'sine',     freq,     t + i * 0.07, 0.35, 0.22, rev)
      osc(ac, 'triangle', freq * 2, t + i * 0.07, 0.2,  0.08, rev)
    })
    osc(ac, 'sine', 1568, t + 0.42, 0.55, 0.25, rev)
    osc(ac, 'sine', 2093, t + 0.46, 0.4,  0.15, rev)
  },

  // Reserve card — soft mysterious shimmer
  select: () => {
    const ac  = getCtx()
    const t   = ac.currentTime
    const rev = createReverb(ac, 2.0)
    rev.connect(ac.destination)
    osc(ac, 'sine', 277,  t,        0.5,  0.18, rev)
    osc(ac, 'sine', 330,  t + 0.1,  0.45, 0.15, rev)
    osc(ac, 'sine', 415,  t + 0.22, 0.55, 0.14, rev)
    osc(ac, 'sine', 1109, t + 0.15, 0.4,  0.07, rev)
    osc(ac, 'sine', 1480, t + 0.25, 0.3,  0.05, rev)
  },

  // Take gems — satisfying coin/chip clinks
  pop: () => {
    const ac = getCtx()
    const t  = ac.currentTime
    ;[1320, 1540, 1180].forEach((freq, i) => {
      const when = t + i * 0.07
      const o = ac.createOscillator()
      const g = ac.createGain()
      const f = ac.createBiquadFilter()
      f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 12
      o.type = 'sine'
      o.frequency.setValueAtTime(freq, when)
      o.frequency.exponentialRampToValueAtTime(freq * 0.65, when + 0.1)
      g.gain.setValueAtTime(0, when)
      g.gain.linearRampToValueAtTime(0.28, when + 0.004)
      g.gain.exponentialRampToValueAtTime(0.001, when + 0.13)
      o.connect(f); f.connect(g); g.connect(ac.destination)
      o.start(when); o.stop(when + 0.15)
      const bsz = Math.floor(ac.sampleRate * 0.018)
      const nb  = ac.createBuffer(1, bsz, ac.sampleRate)
      const nd  = nb.getChannelData(0)
      for (let j = 0; j < bsz; j++) nd[j] = (Math.random()*2-1) * (1 - j/bsz)
      const ns = ac.createBufferSource()
      ns.buffer = nb
      const ng = ac.createGain()
      ng.gain.setValueAtTime(0.06, when)
      ng.gain.exponentialRampToValueAtTime(0.001, when + 0.018)
      ns.connect(ng); ng.connect(ac.destination)
      ns.start(when); ns.stop(when + 0.02)
    })
  },

}

export function playSound(name) {
  try {
    const ac = getCtx()
    if (ac.state === 'suspended') ac.resume()
    SOUNDS[name]?.()
  } catch (e) {
    // Silently fail — audio not critical
  }
}