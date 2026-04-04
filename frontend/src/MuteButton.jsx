import { useState, useEffect } from 'react'
import { setMuted, isMuted } from './music.js'

export default function MuteButton() {
  const [muted, setMutedState] = useState(isMuted())

  const toggle = () => {
    const next = !muted
    setMuted(next)
    setMutedState(next)
    localStorage.setItem('musicMuted', next ? '1' : '0')
  }

  // Restore mute preference on mount
  useEffect(() => {
    const saved = localStorage.getItem('musicMuted')
    if (saved === '1') {
      setMuted(true)
      setMutedState(true)
    }
  }, [])

  return (
    <button
      onClick={toggle}
      title={muted ? 'Unmute music' : 'Mute music'}
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 9999,
        width: 44,
        height: 44,
        borderRadius: '50%',
        border: 'none',
        background: muted ? '#f1f5f9' : '#6366f1',
        color: muted ? '#94a3b8' : '#fff',
        fontSize: 18,
        cursor: 'pointer',
        boxShadow: '0 4px 16px #0002',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.2s',
      }}
    >
      {muted ? '🔇' : '🎵'}
    </button>
  )
}