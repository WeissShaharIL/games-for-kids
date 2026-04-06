// playerUtils.js - shared player color/emoji lookup with fallbacks

const FALLBACKS = [
  { color: '#16a34a', light: '#dcfce7', bg: '#f0fdf4', emoji: '🎮' },
  { color: '#db2777', light: '#fce7f3', bg: '#fdf2f8', emoji: '🎮' },
  { color: '#2563eb', light: '#dbeafe', bg: '#eff6ff', emoji: '🎮' },
  { color: '#d97706', light: '#fef3c7', bg: '#fffbeb', emoji: '🎮' },
  { color: '#7c3aed', light: '#ede9fe', bg: '#faf5ff', emoji: '🎮' },
]

/**
 * Get player info from the players map.
 * ALWAYS returns a valid object — never null, never undefined.
 */
export function getPlayer(players, name, fallbackIdx = 0) {
  if (players && name && players[name]) return players[name]
  return { ...FALLBACKS[fallbackIdx % FALLBACKS.length], name: name || 'Player' }
}

/**
 * Get the "other" player name in a 2-player game.
 * Uses state.connected if available, falls back to players map.
 */
export function getOther(players, currentPlayer, connected) {
  // Prefer connected list from server state (most accurate)
  if (connected && Array.isArray(connected)) {
    const other = connected.find(n => n !== currentPlayer)
    if (other) return other
  }
  // Fall back to players map
  const names = Object.keys(players || {})
  return names.find(n => n !== currentPlayer) || 'Opponent'
}

/**
 * Get all other players except the current one.
 */
export function getOthers(players, currentPlayer) {
  return Object.keys(players || {}).filter(n => n !== currentPlayer)
}