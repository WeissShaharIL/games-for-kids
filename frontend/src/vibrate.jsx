// vibrate.js - Haptic feedback via browser Vibration API
// Silently fails on browsers/devices that don't support it (desktop, iOS)

export function vibrate(pattern = 30) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // Silently ignore
  }
}

export const VIBRATIONS = {
  tap:     15,           // very short — tap feedback
  dpad:    20,           // slightly longer — d-pad press
  pick:    [30, 20, 30], // double pulse — piece confirmed
  spin:    [50, 30, 50, 30, 100], // dramatic — spin start
  win:     [50, 50, 100, 50, 200], // celebration
  lose:    [200],        // single long — sad
  draw:    [100, 50, 100], // neutral double
}