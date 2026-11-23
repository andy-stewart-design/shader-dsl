import { useEffect, useRef, useState } from "react";
import { sketchStorage, type SketchRecord } from "../library/storage.ts";
import { downloadSketch } from "../library/download-sketch.ts";
import {
  decodeSketch,
  encodeSketch,
  validateSnapshot,
} from "../library/codec.ts";
import { replaceDraft } from "../editor/replace-draft.ts";
import { initialShaderSource } from "../shared/initial-source.ts";
import { cloneUniforms } from "../shared/uniforms.ts";
import {
  draftContentEqual,
  getDraftState,
  useDraftStore,
  type DraftContent,
} from "../stores/draft.ts";

type ActiveSketch = { id: string; name: string };
type Target = { kind: "new" } | { kind: "open"; id: string };
type Dialog =
  | { view: "guard"; target: Target }
  | { view: "name"; target?: Target }
  | { view: "rename" | "delete"; record: SketchRecord }
  | { view: "list" | "error" | null };
const starter: DraftContent = {
  main: initialShaderSource,
  utils: "",
  uniforms: [],
};

function capture(): DraftContent {
  const { main, utils, uniforms } = getDraftState();
  return { main, utils, uniforms: cloneUniforms(uniforms) };
}

function message(reason: unknown): string {
  return reason instanceof Error ? reason.message : "Library storage failed.";
}

export function useSketchLibrary(onSwitch: () => void) {
  const [baseline, setBaseline] = useState(capture);
  const [dialog, setDialog] = useState<Dialog>({ view: null });
  const [active, setActive] = useState<ActiveSketch | null>(null);
  const [records, setRecords] = useState<SketchRecord[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const listVersion = useRef(0);

  const main = useDraftStore((state) => state.main);
  const utils = useDraftStore((state) => state.utils);
  const uniforms = useDraftStore((state) => state.uniforms);
  const dirty = !draftContentEqual({ main, utils, uniforms }, baseline);

  const selected =
    dialog.view === "rename" || dialog.view === "delete" ? dialog.record : null;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function _runExclusive<T>(action: () => Promise<T>) {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setActionError(null);
    try {
      return await action();
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  function _request(next: Target) {
    if (busy.current) return;
    setActionError(null);
    if (!draftContentEqual(capture(), baseline))
      setDialog({ view: "guard", target: next });
    else void _proceed(next);
  }

  async function _switchTo(next: Target, revision: number) {
    try {
      const record =
        next.kind === "open" ? await sketchStorage.read(next.id) : null;
      if (next.kind === "open" && !record)
        throw new Error("The saved sketch no longer exists.");
      if (getDraftState().revision !== revision)
        throw new Error(
          "The draft changed while switching. Your edits were kept; please try again.",
        );
      const content = record ? validateSnapshot(record) : starter;
      replaceDraft(content);
      setBaseline(content);
      setActive(record ? { id: record.id, name: record.name } : null);
      setDialog({ view: null });
      onSwitch();
    } catch (reason) {
      setActionError(message(reason));
      setDialog({ view: "error" });
    }
  }

  async function _proceed(next: Target) {
    await _runExclusive(() => _switchTo(next, getDraftState().revision));
  }

  async function _write(name: string, id?: string, next?: Target) {
    await _runExclusive(async () => {
      const content = capture();
      const revision = getDraftState().revision;
      try {
        const snapshot = { name, ...content };
        const saved = id
          ? await sketchStorage.update(id, snapshot)
          : await sketchStorage.create(snapshot);
        if (!saved) throw new Error("The saved sketch no longer exists.");
        setActive({ id: saved.id, name: saved.name });
        setBaseline(content);
        if (next) {
          if (getDraftState().revision !== revision)
            throw new Error(
              "The draft changed while saving. Your newer edits were kept; please try again.",
            );
          await _switchTo(next, revision);
        } else {
          setDialog({ view: null });
        }
      } catch (reason) {
        setActionError(message(reason));
        setDialog({ view: "error" });
      }
    });
  }

  function _manage(record: SketchRecord, action: "rename" | "delete") {
    if (busy.current) return;
    setActionError(null);
    setDialog({ view: action, record });
  }

  function close() {
    if (busy.current) return;
    listVersion.current++;
    setDialog({ view: null });
    setActionError(null);
  }

  function showList() {
    if (busy.current) return;
    const version = ++listVersion.current;
    setDialog({ view: "list" });
    setRecords(null);
    setListError(null);
    setActionError(null);
    void sketchStorage
      .list()
      .then((items) => {
        if (version === listVersion.current) setRecords(items);
      })
      .catch((reason: unknown) => {
        if (version === listVersion.current) setListError(message(reason));
      });
  }

  function save() {
    if (busy.current || dialog.view === "rename" || dialog.view === "delete")
      return;
    const next = dialog.view === "guard" ? dialog.target : undefined;
    if (active) void _write(active.name, active.id, next);
    else {
      setActionError(null);
      setDialog({ view: "name", ...(next ? { target: next } : {}) });
    }
  }

  function saveCopy() {
    if (!busy.current && dialog.view !== "rename" && dialog.view !== "delete") {
      setActionError(null);
      setDialog({ view: "name" });
    }
  }

  async function confirmManage(name?: string) {
    if (dialog.view !== "rename" && dialog.view !== "delete") return;
    const { view: action, record } = dialog;
    const succeeded = await _runExclusive(async () => {
      try {
        if (action === "rename") {
          const renamed = await sketchStorage.rename(record.id, name ?? "");
          if (!renamed) throw new Error("The saved sketch no longer exists.");
          setActive((current) =>
            current?.id === record.id
              ? { id: current.id, name: renamed.name }
              : current,
          );
        } else {
          if (!(await sketchStorage.delete(record.id)))
            throw new Error("The saved sketch no longer exists.");
          if (active?.id === record.id) {
            setActive(null);
            setBaseline(starter);
          }
        }
        return true;
      } catch (reason) {
        setActionError(message(reason));
        return false;
      }
    });
    if (succeeded) showList();
  }

  async function importFile(file: File) {
    const succeeded = await _runExclusive(async () => {
      try {
        const snapshot = decodeSketch(await file.text());
        await sketchStorage.create(snapshot);
        return true;
      } catch (reason) {
        setActionError(`Import failed: ${message(reason)}`);
        return false;
      }
    });
    if (succeeded) showList();
  }

  async function exportRecord(id: string) {
    await _runExclusive(async () => {
      try {
        const record = await sketchStorage.read(id);
        if (!record) throw new Error("The saved sketch no longer exists.");
        const json = encodeSketch(record);
        downloadSketch(json, record.name);
      } catch (reason) {
        setActionError(`Export failed: ${message(reason)}`);
      }
    });
  }

  return {
    view: dialog.view,
    records,
    listError,
    actionError,
    saving,
    dirty,
    selected,
    showList,
    close,
    save,
    saveCopy,
    importFile,
    exportRecord,
    rename: (record: SketchRecord) => _manage(record, "rename"),
    deleteSketch: (record: SketchRecord) => _manage(record, "delete"),
    confirmManage,
    submitName: (name: string) =>
      void _write(
        name,
        undefined,
        dialog.view === "name" ? dialog.target : undefined,
      ),
    newSketch: () => _request({ kind: "new" }),
    open: (id: string) => _request({ kind: "open", id }),
    discard: () => {
      if (dialog.view === "guard") void _proceed(dialog.target);
    },
  };
}
