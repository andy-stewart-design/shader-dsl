import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type { FormEvent } from 'react'
import {
  connectAgentBridge,
  imageResult,
  type BridgeConnectionState,
  type BridgeTool,
} from '@shdr/agent-bridge/browser'
import './App.css'

const emptyInputSchema = {
  type: 'object',
  properties: {},
  additionalProperties: false,
} as const

const demoTools: readonly BridgeTool[] = [
  {
    name: 'demo_get_state',
    description:
      'Read the current, static state of the Agent Bridge Demo. This tool does not change the page.',
    inputSchema: emptyInputSchema,
    handler: () => ({
      title: 'Agent Bridge Demo',
      message: 'A small read-only page for checking bridge connectivity and image delivery.',
      demoState: 'ready',
      capabilities: ['read-only state', 'generated PNG image'],
    }),
  },
  {
    name: 'demo_capture_image',
    description:
      'Generate a distinctive application-owned PNG with asymmetric purple and green panels and a readable label.',
    inputSchema: emptyInputSchema,
    handler: () => {
      const width = 640
      const height = 360
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')

      if (!context) {
        throw new Error('The browser could not create a 2D canvas.')
      }

      context.fillStyle = '#21143f'
      context.fillRect(0, 0, width, height)
      context.fillStyle = '#8f5bff'
      context.fillRect(0, 0, 390, height)
      context.fillStyle = '#8ee38f'
      context.fillRect(390, 0, width - 390, height)
      context.fillStyle = '#f7f3ff'
      context.beginPath()
      context.moveTo(72, 68)
      context.lineTo(300, 68)
      context.lineTo(188, 292)
      context.closePath()
      context.fill()
      context.fillStyle = '#21143f'
      context.beginPath()
      context.arc(505, 180, 82, 0, Math.PI * 2)
      context.fill()
      context.font = '600 26px system-ui, sans-serif'
      context.fillStyle = '#21143f'
      context.fillText('BRIDGE IMAGE', 424, 318)
      context.font = '600 24px system-ui, sans-serif'
      context.fillStyle = '#f7f3ff'
      context.fillText('AGENT BRIDGE DEMO', 28, 334)

      const dataUrl = canvas.toDataURL('image/png')
      const comma = dataUrl.indexOf(',')
      if (comma < 0) {
        throw new Error('The browser could not encode the demo image.')
      }

      return imageResult({
        data: dataUrl.slice(comma + 1),
        mimeType: 'image/png',
        metadata: {
          width,
          height,
          source: 'application-generated demo artwork',
        },
      })
    },
  },
]

type StateListener = () => void
const stateListeners = new Set<StateListener>()
let bridgeState: BridgeConnectionState

const bridge = connectAgentBridge({
  tools: demoTools,
  onStateChange: (state) => {
    bridgeState = state
    for (const listener of stateListeners) {
      listener()
    }
  },
})
bridgeState = bridge.getState()

function subscribeToBridge(listener: StateListener) {
  stateListeners.add(listener)
  return () => stateListeners.delete(listener)
}

function getBridgeState() {
  return bridgeState
}

function useBridgeState() {
  return useSyncExternalStore(subscribeToBridge, getBridgeState, getBridgeState)
}

type AppProps = {
  initialPairingLink?: string
}

function App({ initialPairingLink }: AppProps) {
  const state = useBridgeState()
  const [pairingLink, setPairingLink] = useState('')
  const [formMessage, setFormMessage] = useState<string | undefined>()
  const autoConnectStarted = useRef(false)

  const connect = useCallback((link: string) => {
    const trimmedLink = link.trim()
    if (!trimmedLink) {
      setFormMessage('Paste a pairing link before connecting.')
      return
    }

    setPairingLink('')
    setFormMessage(undefined)
    void bridge.connect(trimmedLink).catch(() => {
      // The bridge exposes a redacted state; do not echo or log the pairing link.
      setFormMessage('The helper could not connect. Check the pairing link and try again.')
    })
  }, [])

  useEffect(() => {
    if (initialPairingLink && !autoConnectStarted.current) {
      autoConnectStarted.current = true
      connect(initialPairingLink)
    }
  }, [connect, initialPairingLink])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    connect(pairingLink)
  }

  const isBusy = state.status === 'connecting'
  const isConnected = state.status === 'connected'

  return (
    <main className="page-shell">
      <header className="site-header">
        <div className="eyebrow">SHDR / BRIDGE LAB</div>
        <div className="header-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </header>

      <section className="hero-section">
        <div className="hero-copy">
          <p className="kicker">A tiny connected canvas</p>
          <h1>Meet the<br /><em>Agent Bridge.</em></h1>
          <p className="hero-description">
            A deliberately small React page that lets an external agent read a safe demo state
            and receive a generated image through the browser bridge.
          </p>
        </div>
        <div className="hero-art" aria-label="Abstract purple and green bridge artwork" role="img">
          <div className="art-sun" />
          <div className="art-slope" />
          <div className="art-line" />
          <span className="art-label">01 / CONNECT</span>
        </div>
      </section>

      <section className="connection-panel" aria-labelledby="connection-title">
        <div className="panel-heading">
          <div>
            <p className="section-label">01 — PAIRING</p>
            <h2 id="connection-title">Connect this page</h2>
          </div>
          <ConnectionBadge state={state} />
        </div>
        <p className="panel-intro">
          Paste the pairing link returned by your bridge helper. The link is held in memory only
          and is cleared after an attempt.
        </p>
        <form className="pair-form" onSubmit={handleSubmit}>
          <label htmlFor="pairing-link">Pairing link</label>
          <div className="input-row">
            <input
              id="pairing-link"
              type="password"
              value={pairingLink}
              onChange={(event) => setPairingLink(event.target.value)}
              placeholder="Paste a bridge pairing link"
              autoComplete="off"
              spellCheck={false}
              disabled={isBusy || isConnected}
            />
            <button type="submit" disabled={isBusy || isConnected}>
              {isBusy ? 'Connecting…' : 'Connect'}
            </button>
          </div>
        </form>
        {state.status === 'connected' && (
          <div className="connected-details">
            <span>Session {state.sessionId}</span>
            <span>Catalog v{state.catalogVersion}</span>
          </div>
        )}
        {state.status === 'error' && (
          <p className="message error-message" role="alert">
            The bridge reported a connection error. No pairing credential is shown here.
          </p>
        )}
        {formMessage && <p className="message" role="status">{formMessage}</p>}
        {isConnected && (
          <button
            className="disconnect-button"
            type="button"
            onClick={() => {
              bridge.disconnect()
              setFormMessage(undefined)
            }}
          >
            Disconnect
          </button>
        )}
      </section>

      <section className="tools-section" aria-labelledby="tools-title">
        <div className="section-heading">
          <div>
            <p className="section-label">02 — AVAILABLE TOOLS</p>
            <h2 id="tools-title">Only what this demo needs</h2>
          </div>
          <p className="tool-count">{demoTools.length} tools · read-only</p>
        </div>
        <div className="tool-grid">
          {demoTools.map((tool, index) => (
            <article className="tool-card" key={tool.name}>
              <div className="tool-number">0{index + 1}</div>
              <h3>{tool.name}</h3>
              <p>{tool.description}</p>
              <code>{'{}'} input</code>
            </article>
          ))}
        </div>
      </section>

      <footer className="site-footer">
        <span>APPLICATION-OWNED CAPABILITIES</span>
        <span>NO MUTATION TOOLS</span>
        <span>PNG OUTPUT</span>
      </footer>
    </main>
  )
}

function ConnectionBadge({ state }: { state: BridgeConnectionState }) {
  const label = state.status === 'connected'
    ? 'Connected'
    : state.status === 'connecting'
      ? 'Connecting'
      : state.status === 'error'
        ? 'Needs attention'
        : 'Not connected'

  return (
    <div className={`connection-badge ${state.status}`}>
      <span className="status-dot" aria-hidden="true" />
      {label}
    </div>
  )
}

export default App
