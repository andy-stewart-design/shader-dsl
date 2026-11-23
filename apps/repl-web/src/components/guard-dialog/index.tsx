import { useEffect, useRef } from "react";
import { Dialog } from "#/components/core/dialog";
import type { useSketchLibrary } from "#/hooks/use-sketch-library.ts";
import s from "./style.module.css";

type Props = { library: ReturnType<typeof useSketchLibrary> };

export default function GuardDialog({ library }: Props) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
  }, []);

  function handleClose() {
    library.showList();
  }

  return (
    <Dialog.Root ref={dialogRef} onClose={handleClose}>
      <Dialog.Header title="New sketch" onClose={handleClose} />
      <Dialog.Content>
        <p>Save changes before switching sketches?</p>
      </Dialog.Content>
      <Dialog.Footer>
        <button
          type="button"
          className={s.action}
          disabled={library.saving}
          onClick={library.save}
        >
          Save
        </button>
        <button
          type="button"
          className={s.action}
          disabled={library.saving}
          onClick={library.discard}
        >
          Discard
        </button>
        <button
          type="button"
          className={s.action}
          disabled={library.saving}
          onClick={handleClose}
        >
          Cancel
        </button>
      </Dialog.Footer>
    </Dialog.Root>
  );
}
