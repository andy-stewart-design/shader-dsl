import { useEffect, useRef, useState, type FormEvent } from "react";
import type { useSketchLibrary } from "../../hooks/use-sketch-library.ts";
import s from "./style.module.css";

type Props = { library: ReturnType<typeof useSketchLibrary> };

export default function SketchLibraryDialog({ library }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
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
        <button type="button" className={s.quiet} disabled={library.saving} onClick={library.close}>Close</button>
      </div>
      {library.view === "guard" && <div className={s.content}>
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
      {library.view === "delete" && library.selected && <div className={s.content}>
        <p>Delete {library.selected.name} ({library.selected.id})? This cannot be undone.</p>
        <button type="button" className={s.action} disabled={library.saving} onClick={() => library.confirmManage()}>Delete</button>
        <button type="button" className={s.action} disabled={library.saving} onClick={library.showList}>Cancel</button>
      </div>}
      {library.error && <p className={s.message} role="alert">{library.error}</p>}
      {library.view === "list" && <div className={s.toolbar}>
        <button type="button" className={s.action} disabled={library.saving} onClick={library.newSketch}>New sketch</button>
        <button type="button" className={s.secondary} disabled={library.saving} onClick={() => fileInput.current?.click()}>Import sketch JSON</button>
        <input ref={fileInput} className={s.fileInput} type="file" accept=".json,application/json" disabled={library.saving} tabIndex={-1} aria-label="Import sketch JSON file" onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) library.importFile(file);
        }} />
      </div>}
      {library.view === "list" && (
        library.listError ? <p className={s.message} role="alert">Could not read library: {library.listError}</p> :
        library.records === null ? <p role="status">Loading…</p> :
        library.records.length === 0 ? <p>No saved sketches yet.</p> :
        <ul className={s.list}>{library.records.map((record) => {
          const duplicates = library.records!.filter((item) => item.name === record.name);
          // Extend the prefix if necessary so even unusually similar IDs remain distinct.
          let length = 8;
          while (length < record.id.length && duplicates.some((item) => item.id !== record.id && item.id.slice(0, length) === record.id.slice(0, length))) length++;
          const identity = duplicates.length > 1 ? `${record.name} (${record.id.slice(0, length)})` : record.name;
          const date = record.savedAt === undefined ? null : new Date(record.savedAt);
          return <li className={s.row} key={record.id}>
            <div className={s.details}>
              <div className={s.name}>{record.name}{duplicates.length > 1 && <span className={s.identifier}> · {record.id.slice(0, length)}</span>}</div>
              {date && <time className={s.timestamp} dateTime={date.toISOString()} title={date.toLocaleString()}>Saved {date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time>}
            </div>
            <div className={s.rowActions}>
              <button type="button" className={s.action} aria-label={`Open ${identity}`} disabled={library.saving} onClick={() => library.open(record.id)}>Open</button>
              <button type="button" className={s.quiet} aria-label={`Rename ${identity}`} disabled={library.saving} onClick={() => library.rename(record)}>Rename</button>
              <button type="button" className={s.quiet} aria-label={`Delete ${identity}`} disabled={library.saving} onClick={() => library.deleteSketch(record)}>Delete</button>
              <button type="button" className={s.quiet} aria-label={`Export ${identity}`} disabled={library.saving} onClick={() => library.exportRecord(record.id)}>Export</button>
            </div>
          </li>;
        })}</ul>
      )}
    </dialog>
  );
}
