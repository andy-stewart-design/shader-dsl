import { useEffect, useRef } from "react";
import LibraryHeader from "./library-header/index.tsx";
import SketchLibrary from "./sketch-library/index.tsx";
import type { useSketchLibrary } from "../../hooks/use-sketch-library.ts";
import s from "./style.module.css";
import { Dialog } from "../core/dialog/index.tsx";

type Props = { library: ReturnType<typeof useSketchLibrary> };

export default function SketchLibraryDialog({ library }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (library.view && library.view !== "name" && !element.open)
      element.showModal();
    if (!library.view && element.open) element.close();
  }, [library]);

  return (
    <Dialog.Root
      ref={dialog}
      type="drawer"
      align="start"
      className={s.dialog}
      aria-label={library.view === "name" ? "Name sketch" : "Sketch library"}
      onCancel={(event) => {
        if (library.saving) event.preventDefault();
      }}
      onClose={library.close}
    >
      <LibraryHeader library={library} />
      {library.error && (
        <p className={s.message} role="alert">
          {library.error}
        </p>
      )}
      <SketchLibrary library={library} />
    </Dialog.Root>
  );
}
