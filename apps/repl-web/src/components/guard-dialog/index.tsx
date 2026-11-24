import { useLayoutEffect, useRef } from "react";
import { Dialog } from "#/components/core/dialog";
import type { useSketchLibrary } from "#/hooks/use-sketch-library.ts";
import s from "./style.module.css";

type Props = { library: ReturnType<typeof useSketchLibrary> };

export default function GuardDialog({ library }: Props) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const active = library.view === "guard";

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

  return (
    <Dialog.Root
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
    >
      <Dialog.Header title="New sketch" onClose={requestClose} />
      <Dialog.Content>
        <p>Save changes before switching sketches?</p>
      </Dialog.Content>
      <Dialog.Footer>
        <button
          type="button"
          className={s.action}
          disabled={!active || library.saving}
          onClick={library.save}
        >
          Save
        </button>
        <button
          type="button"
          className={s.action}
          disabled={!active || library.saving}
          onClick={library.discard}
        >
          Discard
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
