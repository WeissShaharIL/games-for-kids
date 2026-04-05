// sounds.js - High quality synthesized sound effects
// Uses layered oscillators, filters, envelopes and reverb for rich sounds

let ctx = null

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
  return ctx
}

// ── Core utilities ────────────────────────────────────────────────────────────

function createReverb(ac, seconds = 1.5) {
  const conv = ac.createConvolver()
  const len  = ac.sampleRate * seconds
  const buf  = ac.createBuffer(2, len, ac.sampleRate)
  for (let c = 0; c < 2; c++) {
    const ch = buf.getChannelData(c)
    for (let i = 0; i < len; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.5)
    }
  }
  conv.buffer = buf
  return conv
}

function osc(ac, type, freq, when, duration, vol, dest, detune = 0) {
  const o = ac.createOscillator()
  const g = ac.createGain()
  o.type            = type
  o.frequency.value = freq
  if (detune) o.detune.value = detune
  g.gain.setValueAtTime(0, when)
  g.gain.linearRampToValueAtTime(vol, when + 0.015)
  g.gain.exponentialRampToValueAtTime(0.001, when + duration)
  o.connect(g); g.connect(dest)
  o.start(when); o.stop(when + duration + 0.05)
  return { o, g }
}

function envelope(gainNode, ac, when, attack, sustain, vol, release) {
  gainNode.gain.setValueAtTime(0, when)
  gainNode.gain.linearRampToValueAtTime(vol, when + attack)
  gainNode.gain.setValueAtTime(vol, when + attack + sustain)
  gainNode.gain.exponentialRampToValueAtTime(0.001, when + attack + sustain + release)
}

// ── Sound definitions ─────────────────────────────────────────────────────────

const SOUNDS = {

  // Soft "place" — warm marimba-like thud
  place: () => {
    const ac  = getCtx()
    const t   = ac.currentTime
    const out = ac.destination

    // Main tone — warm sine
    osc(ac, 'sine', 440, t, 0.4, 0.35, out)
    // Harmonic — slightly detuned
    osc(ac, 'sine', 441.5, t, 0.35, 0.12, out)
    // 2nd harmonic — octave up, soft
    osc(ac, 'sine', 880, t, 0.25, 0.06, out)
    // Low thump
    const lfo = ac.createOscillator()
    const lg  = ac.createGain()
    lfo.type = 'sine'
    lfo.frequency.setValueAtTime(120, t)
    lfo.frequency.exponentialRampToValueAtTime(60, t + 0.12)
    lg.gain.setValueAtTime(0, t)
    lg.gain.linearRampToValueAtTime(0.4, t + 0.01)
    lg.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
    lfo.connect(lg); lg.connect(out)
    lfo.start(t); lfo.stop(t + 0.2)
  },

  // Win — bright ascending chime cascade
  win: () => {
    const ac  = getCtx()
    const t   = ac.currentTime
    const rev = createReverb(ac, 2)
    rev.connect(ac.destination)

    const melody = [523.25, 659.25, 783.99, 1046.50, 1318.51]
    melody.forEach((freq, i) => {
      const when = t + i * 0.11
      osc(ac, 'sine',     freq,       when, 0.7, 0.3,  rev)
      osc(ac, 'triangle', freq * 2,   when, 0.4, 0.08, rev)
      osc(ac, 'sine',     freq * 0.5, when, 0.5, 0.06, rev)
    })

    // Final sparkle
    ;[2093, 2637, 3136].forEach((freq, i) => {
      osc(ac, 'sine', freq, t + 0.65 + i * 0.08, 0.5, 0.15, rev)
    })
  },

  // Lose — soft descending minor chord
  lose: () => {
    const ac  = getCtx()
    const t   = ac.currentTime
    const rev = createReverb(ac, 1.5)
    rev.connect(ac.destination)

    ;[392, 349.23, 311.13, 261.63].forEach((freq, i) => {
      osc(ac, 'sine', freq, t + i * 0.14, 0.6, 0.22, rev)
    })
    // Low rumble
    osc(ac, 'sine', 98, t + 0.1, 0.8, 0.18, ac.destination)
  },

  // Draw — gentle two-tone chime
  draw: () => {
    const ac  = getCtx()
    const t   = ac.currentTime
    const rev = createReverb(ac, 1.2)
    rev.connect(ac.destination)

    osc(ac, 'sine', 523.25, t,       0.5, 0.25, rev)
    osc(ac, 'sine', 659.25, t + 0.18, 0.5, 0.22, rev)
    osc(ac, 'sine', 523.25, t + 0.36, 0.5, 0.18, rev)
  },

  // Rematch / ready — ascending whoosh + bright ping
  rematch: () => {
    const ac  = getCtx()
    const t   = ac.currentTime
    const rev = createReverb(ac, 1.0)
    rev.connect(ac.destination)

    // Swoosh
    const sw  = ac.createOscillator()
    const swg = ac.createGain()
    const filt = ac.createBiquadFilter()
    filt.type = 'bandpass'; filt.frequency.value = 800; filt.Q.value = 2
    sw.type = 'sawtooth'
    sw.frequency.setValueAtTime(150, t)
    sw.frequency.exponentialRampToValueAtTime(900, t + 0.22)
    swg.gain.setValueAtTime(0, t)
    swg.gain.linearRampToValueAtTime(0.2, t + 0.05)
    swg.gain.exponentialRampToValueAtTime(0.001, t + 0.25)
    sw.connect(filt); filt.connect(swg); swg.connect(ac.destination)
    sw.start(t); sw.stop(t + 0.3)

    // Bright ping at end
    osc(ac, 'sine', 1046.5, t + 0.2, 0.6, 0.3, rev)
    osc(ac, 'sine', 1318.5, t + 0.25, 0.45, 0.2, rev)
  },

  // Error — soft dull thud, not harsh
  error: () => {
    const ac = getCtx()
    const t  = ac.currentTime

    const o   = ac.createOscillator()
    const g   = ac.createGain()
    const f   = ac.createBiquadFilter()
    f.type    = 'lowpass'; f.frequency.value = 300

    o.type = 'square'
    o.frequency.setValueAtTime(180, t)
    o.frequency.exponentialRampToValueAtTime(90, t + 0.18)

    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.25, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22)

    o.connect(f); f.connect(g); g.connect(ac.destination)
    o.start(t); o.stop(t + 0.25)

    // Short low sine underneath
    osc(ac, 'sine', 110, t, 0.2, 0.18, ac.destination)
  },

  // Shoot — realistic-ish gunshot (noise burst + body resonance)
  shoot: () => {
    const ac = getCtx()
    const t  = ac.currentTime

    // Noise burst — crack
    const bufSize = Math.floor(ac.sampleRate * 0.12)
    const buf     = ac.createBuffer(1, bufSize, ac.sampleRate)
    const data    = buf.getChannelData(0)
    for (let i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 0.6)
    }
    const noise  = ac.createBufferSource()
    noise.buffer = buf

    const hp = ac.createBiquadFilter()
    hp.type  = 'highpass'; hp.frequency.value = 1800

    const lp = ac.createBiquadFilter()
    lp.type  = 'lowpass'; lp.frequency.value = 6000

    const ng = ac.createGain()
    ng.gain.setValueAtTime(0.8, t)
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.09)

    noise.connect(hp); hp.connect(lp); lp.connect(ng); ng.connect(ac.destination)
    noise.start(t); noise.stop(t + 0.12)

    // Body thud — low sine with fast decay
    const body = ac.createOscillator()
    const bg   = ac.createGain()
    body.type  = 'sine'
    body.frequency.setValueAtTime(180, t)
    body.frequency.exponentialRampToValueAtTime(55, t + 0.12)
    bg.gain.setValueAtTime(0, t)
    bg.gain.linearRampToValueAtTime(0.6, t + 0.008)
    bg.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
    body.connect(bg); bg.connect(ac.destination)
    body.start(t); body.stop(t + 0.2)

    // Mid resonance
    osc(ac, 'sine', 380, t + 0.01, 0.12, 0.15, ac.destination)
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