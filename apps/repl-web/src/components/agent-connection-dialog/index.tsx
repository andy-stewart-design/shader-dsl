import {
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
  type SubmitEvent,
} from "react";
import {
  useAgentActions,
  useAgentConnectionState,
  useAgentEnabled,
} from "#/stores/agent.ts";
import { Dialog } from "#/components/core/dialog/index.tsx";
import ConnectionDetails from "./connection-details/index.tsx";
import s from "./style.module.css";
import Button from "../core/button/index.tsx";

export type AgentConnectionHandle = { showModal(): void; close(): void };

interface Props {
  ref: Ref<AgentConnectionHandle>;
}

export default function AgentConnectionDialog({ ref }: Props) {
  const state = useAgentConnectionState();
  const enabled = useAgentEnabled();
  const { connect, disconnect } = useAgentActions();
  const [pairingLink, setPairingLink] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
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
    setMessage(null);
    setPairingLink("");
    void connect(link).catch(() => {
      setMessage("Needs attention. Check the pairing link and try again.");
    });
  }

  function showModal() {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    setIsDialogOpen(true);
  }

  function handleClose() {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.close();
    setIsDialogOpen(false);
    setMessage(null);
  }

  useImperativeHandle(ref, () => ({ showModal, close }), []);

  return (
    <Dialog.Root
      ref={dialogRef}
      aria-label="Agent connection"
      onClose={() => setIsDialogOpen(false)}
    >
      <Dialog.Header onClose={handleClose}>
        <div className={s.title}>
          <span>Agent</span>
          <span className={s.status} data-status={state.status}>
            {statusText(state.status)}
          </span>
        </div>
      </Dialog.Header>
      <Dialog.Content className={s.content}>
        {!isConnected && (
          <form onSubmit={submit} className={s.form}>
            <label htmlFor="agent-pairing-link" className={s.label}>
              Pairing URL
            </label>
            <div className={s.controls}>
              <input
                id="agent-pairing-link"
                className={s.input}
                value={pairingLink}
                onChange={(event) => setPairingLink(event.target.value)}
                placeholder={enabled ? "http://www.shdr..." : "Preparing…"}
                autoComplete="off"
                spellCheck={false}
                disabled={!enabled || isConnecting}
              />
              <Button type="submit" disabled={!enabled || isConnecting}>
                Connect
              </Button>
            </div>
          </form>
        )}
        {isConnected && (
          <>
            {isDialogOpen && (
              <ConnectionDetails key={state.sessionId} state={state} />
            )}
            <button className={s.action} type="button" onClick={disconnect}>
              Disconnect
            </button>
          </>
        )}
        {message && (
          <p className={s.message} role="status">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 7V12M12 16V17M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                vector-effect="non-scaling-stroke"
              />
            </svg>
            {message}
          </p>
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
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
