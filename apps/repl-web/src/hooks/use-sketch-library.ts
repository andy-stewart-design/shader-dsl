import { useEffect, useRef, useState } from "react";
import { sketchStorage, type SketchRecord } from "../library/storage.ts";
import { cloneUniforms } from "../shared/uniforms.ts";
import { draftContentEqual, getDraftState, useDraftStore, type DraftContent } from "../stores/draft.ts";

type View = "list" | "name" | "error" | null;

function capture(): DraftContent {
  const { main, utils, uniforms } = getDraftState();
  return { main, utils, uniforms: cloneUniforms(uniforms) };
}

export function useSketchLibrary() {
  const [baseline, setBaseline] = useState(capture);
  const [active, setActive] = useState<{ id: string; name: string } | null>(null);
  const [view, setView] = useState<View>(null);
  const [records, setRecords] = useState<SketchRecord[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const listVersion = useRef(0);
  const main = useDraftStore((state) => state.main);
  const utils = useDraftStore((state) => state.utils);
  const uniforms = useDraftStore((state) => state.uniforms);
  const dirty = !draftContentEqual({ main, utils, uniforms }, baseline);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => () => { listVersion.current++; }, []);

  function close() {
    listVersion.current++;
    setView(null);
    setError(null);
  }

  function showList() {
    const version = ++listVersion.current;
    setView("list");
    setRecords(null);
    setListError(null);
    void sketchStorage.list().then((items) => {
      if (version === listVersion.current) setRecords(items);
    }).catch((reason: unknown) => {
      if (version === listVersion.current) setListError(message(reason));
    });
  }

  async function write(name: string, id?: string) {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    // Capture at submission (or the Save click for an associated sketch).
    const content = capture();
    try {
      const snapshot = { name, ...content };
      const saved = id ? await sketchStorage.update(id, snapshot) : await sketchStorage.create(snapshot);
      if (!saved) throw new Error("The saved sketch no longer exists.");
      setActive({ id: saved.id, name: saved.name });
      setBaseline(content);
      close();
    } catch (reason) {
      setError(message(reason));
      setView((current) => current === "name" ? current : "error");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function save() {
    if (savingRef.current) return;
    if (active) void write(active.name, active.id);
    else { setError(null); setView("name"); }
  }
  function saveCopy() {
    if (savingRef.current) return;
    setError(null);
    setView("name");
  }

  return { view, records, listError, error, saving, dirty, showList, close, save, saveCopy, submitName: (name: string) => void write(name) };
}

function message(reason: unknown): string {
  return reason instanceof Error ? reason.message : "Library storage failed.";
}
