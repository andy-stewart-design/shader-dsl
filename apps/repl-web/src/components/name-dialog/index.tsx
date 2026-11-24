import { useLayoutEffect, useRef, useState, type SyntheticEvent } from "react";
import { Dialog } from "#/components/core/dialog";
import type { useSketchLibrary } from "#/hooks/use-sketch-library.ts";
import s from "./style.module.css";

type Props = { library: ReturnType<typeof useSketchLibrary> };
type NameView = "save" | "duplicate" | "rename";
type Session = { view: NameView | null; name: string; active: boolean };

const labels: Record<NameView, { title: string; action: string }> = {
  save: { title: "Save sketch", action: "Save" },
  duplicate: { title: "Save as copy", action: "Save as copy" },
  rename: { title: "Rename sketch", action: "Rename" },
};

function isNameView(view: string | null): view is NameView {
  return view === "save" || view === "duplicate" || view === "rename";
}

export default function SaveDialog({ library }: Props) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [session, setSession] = useState<Session>({
    view: null,
    name: "",
    active: false,
  });
  const activeView = isNameView(library.view) ? library.view : null;

  if (!activeView && session.active) {
    setSession((current) => ({ ...current, active: false }));
  } else if (activeView && (!session.active || session.view !== activeView)) {
    setSession({
      view: activeView,
      name: activeView === "rename" ? (library.selected?.name ?? "") : "",
      active: true,
    });
  }

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (activeView) {
      if (!dialog.open) dialog.showModal();
      inputRef.current?.focus();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [activeView]);

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeView || !session.name.trim()) return;
    if (activeView === "rename") library.confirmManage(session.name.trim());
    else library.submitName(session.name.trim());
  }

  function requestClose() {
    if (library.saving || !activeView) return;
    if (activeView === "rename") library.showList();
    else library.close();
  }

  const displayedLabels = session.view ? labels[session.view] : labels.save;

  return (
    <Dialog.Root
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
    >
      <form className={s.form} onSubmit={submit}>
        <Dialog.Header title={displayedLabels.title} onClose={requestClose} />
        <Dialog.Content>
          <label className={s.label}>
            <span>Name</span>
            <input
              ref={inputRef}
              className={s.input}
              id="sketch-name"
              value={session.name}
              onChange={(event) =>
                setSession((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              required
              data-1p-ignore
            />
          </label>
        </Dialog.Content>
        <Dialog.Footer>
          <button
            className={s.action}
            type="submit"
            disabled={library.saving || !session.name.trim() || !activeView}
          >
            {library.saving ? "Saving…" : displayedLabels.action}
          </button>
        </Dialog.Footer>
      </form>
    </Dialog.Root>
  );
}
