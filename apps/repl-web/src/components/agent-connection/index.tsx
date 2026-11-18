import { useEffect, useRef, useState, type SubmitEvent } from "react";
import type { BridgeConnectionState } from "app-mcp/react";
import { useAgentConnection } from "../../agent/provider.tsx";
import s from "./style.module.css";

export default function AgentConnection() {
  const { state, editorsReady, connect, disconnect } = useAgentConnection();
  const [pairingLink, setPairingLink] = useState("");
  const [message, setMessage] = useState<string | undefined>();
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  const isConnecting = state.status === "connecting";
  const isConnected = state.status === "connected";

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const link = pairingLink.trim();
    if (!link) {
      setMessage("Paste a pairing link before connecting.");
      return;
    }
    setMessage(undefined);
    setPairingLink("");
    void connect(link).catch(() => {
      setMessage("Needs attention. Check the pairing link and try again.");
    });
  }

  function openDialog() {
    dialogRef.current?.showModal();
  }

  return (
    <>
      <button className={s.trigger} onClick={openDialog}>
        <span className={s.indicator} data-connected={isConnected} />
        Agent
      </button>

      <dialog
        ref={dialogRef}
        className={s.dialog}
        aria-label="Agent connection"
      >
        <div className={s.heading}>
          <span>Agent</span>
          <span className={s.status} data-status={state.status}>
            {statusText(state.status)}
          </span>
        </div>
        {!isConnected && (
          <form onSubmit={submit} className={s.form}>
            <label htmlFor="agent-pairing-link" className={s.label}>
              Pairing URL
            </label>
            <div className={s.controls}>
              <input
                id="agent-pairing-link"
                className={s.input}
                type="password"
                value={pairingLink}
                onChange={(event) => setPairingLink(event.target.value)}
                placeholder={editorsReady ? "http://www.shdr..." : "Preparing…"}
                autoComplete="off"
                spellCheck={false}
                disabled={!editorsReady || isConnecting}
              />
              <button
                type="submit"
                className={s.action}
                disabled={!editorsReady || isConnecting}
              >
                Connect
              </button>
            </div>
          </form>
        )}
        {isConnected && (
          <>
            <ConnectionDetails key={state.sessionId} state={state} />
            <button className={s.action} type="button" onClick={disconnect}>
              Disconnect
            </button>
          </>
        )}
        {message && (
          <p className={s.message} role="status">
            {message}
          </p>
        )}
      </dialog>
    </>
  );
}

function ConnectionDetails({
  state,
}: {
  state: Extract<BridgeConnectionState, { status: "connected" }>;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <dl className={s.details} aria-label="Connection details">
      <div className={s.detail}>
        <dt>MCP client</dt>
        <dd>
          {state.client
            ? `${state.client.name} ${state.client.version}`
            : "Unknown"}
        </dd>
      </div>
      <div className={s.detail}>
        <dt>Connected since</dt>
        <dd>
          {formatTimestamp(state.connectedAt)}
          {isValidTimestamp(state.connectedAt) &&
            ` (${formatElapsed(now - state.connectedAt)} ago)`}
        </dd>
      </div>
      {isValidTimestamp(state.lastConnectedAt) &&
        state.lastConnectedAt !== state.connectedAt && (
          <div className={s.detail}>
            <dt>Last reconnected</dt>
            <dd>
              {formatTimestamp(state.lastConnectedAt)}
              {` (${formatElapsed(now - state.lastConnectedAt)} ago)`}
            </dd>
          </div>
        )}
    </dl>
  );
}

const MAX_VALID_DATE_MS = 8.64e15;

function isValidTimestamp(timestamp: number | undefined): timestamp is number {
  return (
    timestamp !== undefined &&
    Number.isSafeInteger(timestamp) &&
    timestamp >= 0 &&
    timestamp <= MAX_VALID_DATE_MS
  );
}

function formatTimestamp(timestamp: number | undefined) {
  if (!isValidTimestamp(timestamp)) return "Unknown";
  return new Date(timestamp).toLocaleString();
}

function formatElapsed(milliseconds: number) {
  const minutes = Math.max(0, Math.floor(milliseconds / 60_000));
  if (minutes < 1) return "less than a minute";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

function statusText(status: string) {
  switch (status) {
    case "connecting":
      return "Connecting…";
    case "connected":
      return "Connected";
    case "error":
      return "Needs attention";
    default:
      return "Not connected";
  }
}
