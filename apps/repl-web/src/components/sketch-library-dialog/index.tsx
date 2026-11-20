import { useEffect, useRef, useState, type FormEvent } from "react";
import type { useSketchLibrary } from "../../hooks/use-sketch-library.ts";
import s from "../agent-connection-dialog/style.module.css";

type Props = { library: ReturnType<typeof useSketchLibrary> };

export default function SketchLibraryDialog({ library }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (library.view && !element.open) element.showModal();
    if (!library.view && element.open) element.close();
    if (library.view === "name") setName("");
  }, [library.view]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim()) library.submitName(name.trim());
  }

  return (
    <dialog ref={dialog} className={s.dialog} aria-label={library.view === "name" ? "Name sketch" : "Sketch library"} onClose={library.close}>
      <div className={s.heading}>
        <strong>{library.view === "name" ? "Name sketch" : library.view === "error" ? "Save failed" : "Sketch library"}</strong>
        <button type="button" className={s.action} onClick={library.close}>Close</button>
      </div>
      {library.view === "name" && (
        <form className={s.form} onSubmit={submit}>
          <label className={s.label} htmlFor="sketch-name">Name</label>
          <input className={s.input} id="sketch-name" value={name} onChange={(event) => setName(event.target.value)} required autoFocus />
          <button className={s.action} type="submit" disabled={library.saving || !name.trim()}>{library.saving ? "Saving…" : "Save"}</button>
        </form>
      )}
      {library.error && <p className={s.message} role="alert">{library.error}</p>}
      {library.view === "list" && (
        library.listError ? <p className={s.message} role="alert">Could not read library: {library.listError}</p> :
        library.records === null ? <p role="status">Loading…</p> :
        library.records.length === 0 ? <p>No saved sketches yet.</p> :
        <ul>{library.records.map((record) => <li key={record.id}>{record.name} <small>({record.id})</small>{record.savedAt !== undefined && <div>Last saved: <time dateTime={new Date(record.savedAt).toISOString()}>{new Date(record.savedAt).toLocaleString()}</time></div>}</li>)}</ul>
      )}
    </dialog>
  );
}
