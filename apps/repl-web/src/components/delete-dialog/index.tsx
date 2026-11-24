import { useLayoutEffect, useRef, useState } from "react";
import { Dialog } from "#/components/core/dialog";
import type { useSketchLibrary } from "#/hooks/use-sketch-library.ts";
import s from "./style.module.css";

type Props = { library: ReturnType<typeof useSketchLibrary> };

export default function DeleteDialog({ library }: Props) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [displayedName, setDisplayedName] = useState("");
  const active = library.view === "delete";

  if (
    active &&
    library.selected?.name &&
    displayedName !== library.selected.name
  ) {
    setDisplayedName(library.selected.name);
  }

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (active) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [active]);

  function requestClose() {
    if (!active || library.saving) return;
    library.showList();
  }

  function confirm() {
    if (!active || library.saving || !library.selected) return;
    library.confirmManage();
  }

  return (
    <Dialog.Root
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
    >
      <Dialog.Header title="Delete sketch" onClose={requestClose} />
      <Dialog.Content className={s.content}>
        <h2>Are you sure you want to delete {displayedName}?</h2>
        <p>This cannot be undone.</p>
      </Dialog.Content>
      <Dialog.Footer>
        <button
          type="button"
          className={s.action}
          disabled={!active || library.saving || !library.selected}
          onClick={confirm}
        >
          Delete
        </button>
        <button
          type="button"
          className={s.action}
          disabled={!active || library.saving}
          onClick={requestClose}
        >
          Cancel
        </button>
      </Dialog.Footer>
    </Dialog.Root>
  );
}
