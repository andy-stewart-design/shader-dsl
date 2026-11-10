import { createRoot } from 'react-dom/client'
import { consumePairingLink } from '@shdr/agent-bridge/browser'
import './index.css'
import App from './App.tsx'

// Consume and remove credentials before React renders or any effects run.
const initialPairingLink = consumePairingLink()

createRoot(document.getElementById('root')!).render(
  <App initialPairingLink={initialPairingLink} />,
)
