import { useEffect, useRef } from "react";
import { Dialog } from "#/components/core/dialog";
import type { useSketchLibrary } from "#/hooks/use-sketch-library.ts";
import s from "./style.module.css";

type Props = { library: ReturnType<typeof useSketchLibrary> };

export default function DeleteDialog({ library }: Props) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
  }, []);

  if (!library.selected?.name) return null;

  function handleClose() {
    library.showList();
  }

  return (
    <Dialog.Root ref={dialogRef} onClose={handleClose}>
      <Dialog.Header title="Delete sketch" onClose={handleClose} />
      <Dialog.Content className={s.content}>
        <h2>Are you sure you want to delete {library.selected.name}?</h2>
        <p>This cannot be undone.</p>
      </Dialog.Content>
      <Dialog.Footer>
        <button
          type="button"
          className={s.action}
          disabled={library.saving}
          onClick={() => library.confirmManage()}
        >
          Delete
        </button>
        <button
          type="button"
          className={s.action}
          disabled={library.saving}
          onClick={library.showList}
        >
          Cancel
        </button>
      </Dialog.Footer>
    </Dialog.Root>
  );
}
