import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'


// Start music on first user interaction (browser autoplay policy)
const startOnce = () => { 
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