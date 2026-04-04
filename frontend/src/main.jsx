import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { startMusic } from './music.js'

// Start music on first user interaction (browser autoplay policy)
const startOnce = () => {
  startMusic()
  window.removeEventListener('pointerdown', startOnce)
  window.removeEventListener('keydown', startOnce)
}
window.addEventListener('pointerdown', startOnce)
window.addEventListener('keydown', startOnce)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)