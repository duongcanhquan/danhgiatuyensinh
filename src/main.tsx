import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initFirebaseAnalytics } from './services/firebase'
import { installViteChunkLoadRecovery } from './utils/chunkLoadRecovery'

installViteChunkLoadRecovery()
void initFirebaseAnalytics()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
