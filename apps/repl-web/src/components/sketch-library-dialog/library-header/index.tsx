import { useRef } from "react";
import IconClose from "#/components/core/icons/close";
import IconImport from "#/components/core/icons/import";
import IconPlus from "#/components/core/icons/plus";
import type { useSketchLibrary } from "#/hooks/use-sketch-library";
import s from "./style.module.css";

type Props = { library: ReturnType<typeof useSketchLibrary> };

export default function LibraryHeader({ library }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <div className={s.heading}>
      <strong>Sketch library</strong>
      <div className={s.actions}>
        <button
          type="button"
          className={s.quiet}
          disabled={library.saving}
          onClick={library.newSketch}
        >
          <IconPlus size={8} strokeWidth={1} />
          New
        </button>
        <button
          type="button"
          className={s.quiet}
          disabled={library.saving}
          onClick={() => fileInput.current?.click()}
        >
          <IconImport size={8} strokeWidth={1} />
          Import
        </button>
        <input
          ref={fileInput}
          className={s.fileInput}
          type="file"
          accept=".json,application/json"
          disabled={library.saving}
          tabIndex={-1}
          aria-label="Import sketch JSON file"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) library.importFile(file);
          }}
        />
        <button
          type="button"
          className={s.quiet}
          disabled={library.saving}
          onClick={library.close}
          aria-label="Close sketch library"
        >
          <IconClose size={12} />
        </button>
      </div>
    </div>
  );
}
