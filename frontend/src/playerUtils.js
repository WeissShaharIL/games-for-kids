// playerUtils.js - shared player color/emoji lookup with fallbacks

const FALLBACK_PLAYERS = [
  { color: '#16a34a', light: '#dcfce7', bg: '#f0fdf4', emoji: '🎮' },
  { color: '#db2777', light: '#fce7f3', bg: '#fdf2f8', emoji: '🎮' },
  { color: '#2563eb', light: '#dbeafe', bg: '#eff6ff', emoji: '🎮' },
  { color: '#d97706', light: '#fef3c7', bg: '#fffbeb', emoji: '🎮' },
  { color: '#7c3aed', light: '#ede9fe', bg: '#faf5ff', emoji: '🎮' },
]

// Get player info from the players map, with graceful fallback
export function getPlayer(players, name, fallbackIdx = 0) {
  if (players && players[name]) return players[name]
  return FALLBACK_PLAYERS[fallbackIdx % FALLBACK_PLAYERS.length]
}

// Get the "other" player name (works for 2-player games)
export function getOther(players, currentPlayer) {
  const names = Object.keys(players || {})
  return names.find(n => n !== currentPlayer) || 'Opponent'
}

// Get all other players
export function getOthers(players, currentPlayer) {
  return Object.keys(players || {}).filter(n => n !== currentPlayer)
}