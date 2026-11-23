import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { Dialog } from "#/components/core/dialog";
import type { useSketchLibrary } from "#/hooks/use-sketch-library.ts";
import s from "./style.module.css";

type Props = { library: ReturnType<typeof useSketchLibrary> };

export default function NameDialog({ library }: Props) {
  const [name, setName] = useState(library.selected?.name ?? "");
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  const title =
    library.view === "rename" ? "Rename sketch" : "Duplicate sketch";

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim()) {
      if (library.view === "rename") library.confirmManage(name.trim());
      else library.submitName(name.trim());
    }
  }

  function handleClose() {
    if (library.view === "rename") library.showList();
    else if (library.view === "name") library.close();
  }

  return (
    <Dialog.Root ref={dialogRef} onClose={handleClose}>
      <form className={s.form} onSubmit={submit}>
        <Dialog.Header title={title} onClose={handleClose} />
        <Dialog.Content>
          <label className={s.label}>
            <span>Name</span>
            <input
              className={s.input}
              id="sketch-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              autoFocus
            />
          </label>
        </Dialog.Content>
        <Dialog.Footer>
          <button
            className={s.action}
            type="submit"
            disabled={library.saving || !name.trim()}
          >
            {library.saving
              ? "Saving…"
              : library.view === "rename"
                ? "Rename"
                : "Save"}
          </button>
        </Dialog.Footer>
      </form>
    </Dialog.Root>
  );
}
