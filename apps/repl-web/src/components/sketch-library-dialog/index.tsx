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
    if (library.view === "rename") setName(library.selected?.name ?? "");
  }, [library.view]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim()) {
      if (library.view === "rename") library.confirmManage(name.trim());
      else library.submitName(name.trim());
    }
  }

  return (
    <dialog ref={dialog} className={s.dialog} aria-label={library.view === "name" ? "Name sketch" : "Sketch library"} onCancel={(event) => { if (library.saving) event.preventDefault(); }} onClose={library.close}>
      <div className={s.heading}>
        <strong>{library.view === "name" ? "Name sketch" : library.view === "rename" ? "Rename sketch" : library.view === "delete" ? "Delete sketch" : library.view === "guard" ? "Unsaved changes" : library.view === "error" ? "Library action failed" : "Sketch library"}</strong>
        <button type="button" className={s.action} disabled={library.saving} onClick={library.close}>Close</button>
      </div>
      {library.view === "guard" && <div>
        <p>Save changes before switching sketches?</p>
        <button type="button" className={s.action} disabled={library.saving} onClick={library.save}>Save</button>
        <button type="button" className={s.action} disabled={library.saving} onClick={library.discard}>Discard</button>
        <button type="button" className={s.action} disabled={library.saving} onClick={library.close}>Cancel</button>
      </div>}
      {(library.view === "name" || library.view === "rename") && (
        <form className={s.form} onSubmit={submit}>
          <label className={s.label} htmlFor="sketch-name">Name</label>
          <input className={s.input} id="sketch-name" value={name} onChange={(event) => setName(event.target.value)} required autoFocus />
          <button className={s.action} type="submit" disabled={library.saving || !name.trim()}>{library.saving ? "Saving…" : library.view === "rename" ? "Rename" : "Save"}</button>
        </form>
      )}
      {library.view === "rename" && library.selected && <p>Rename {library.selected.name} ({library.selected.id}).</p>}
      {library.view === "delete" && library.selected && <div>
        <p>Delete {library.selected.name} ({library.selected.id})? This cannot be undone.</p>
        <button type="button" className={s.action} disabled={library.saving} onClick={() => library.confirmManage()}>Delete</button>
        <button type="button" className={s.action} disabled={library.saving} onClick={library.showList}>Cancel</button>
      </div>}
      {library.error && <p className={s.message} role="alert">{library.error}</p>}
      {library.view === "list" && <button type="button" className={s.action} disabled={library.saving} onClick={library.newSketch}>New</button>}
      {library.view === "list" && (
        library.listError ? <p className={s.message} role="alert">Could not read library: {library.listError}</p> :
        library.records === null ? <p role="status">Loading…</p> :
        library.records.length === 0 ? <p>No saved sketches yet.</p> :
        <ul>{library.records.map((record) => <li key={record.id}>{record.name} <button type="button" className={s.action} disabled={library.saving} onClick={() => library.open(record.id)}>Open</button> <button type="button" className={s.action} disabled={library.saving} onClick={() => library.rename(record)}>Rename</button> <button type="button" className={s.action} disabled={library.saving} onClick={() => library.deleteSketch(record)}>Delete</button> <small>({record.id})</small>{record.savedAt !== undefined && <div>Last saved: <time dateTime={new Date(record.savedAt).toISOString()}>{new Date(record.savedAt).toLocaleString()}</time></div>}</li>)}</ul>
      )}
    </dialog>
  );
}
