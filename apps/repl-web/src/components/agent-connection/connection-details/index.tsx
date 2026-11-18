import { useEffect, useState } from "react";
import type { BridgeConnectionState } from "app-mcp/react";
import s from "./style.module.css";

export default function ConnectionDetails({
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
