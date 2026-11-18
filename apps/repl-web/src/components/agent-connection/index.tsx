import { createRef, useState, type SubmitEvent } from "react";
import { useAgentConnection } from "../../agent/provider.tsx";
import s from "./style.module.css";

export default function AgentConnection() {
  const { state, editorsReady, connect, disconnect } = useAgentConnection();
  const [pairingLink, setPairingLink] = useState("");
  const [message, setMessage] = useState<string | undefined>();
  const dialogRef = createRef<HTMLDialogElement | null>();

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
            {isConnecting
              ? "Connecting…"
              : isConnected
                ? "Connected"
                : state.status === "error"
                  ? "Needs attention"
                  : "Not connected"}
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
          <button className={s.action} type="button" onClick={disconnect}>
            Disconnect
          </button>
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
