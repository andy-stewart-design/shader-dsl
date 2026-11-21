import { useEffect, useRef, useState } from "react";
import { sketchStorage, type SketchRecord } from "../library/storage.ts";
import { validateSnapshot } from "../library/codec.ts";
import { replaceDraft } from "../editor/replace-draft.ts";
import { initialShaderSource } from "../shared/initial-source.ts";
import { cloneUniforms } from "../shared/uniforms.ts";
import { draftContentEqual, getDraftState, useDraftStore, type DraftContent } from "../stores/draft.ts";

type View = "list" | "name" | "error" | "guard" | "rename" | "delete" | null;
type Target = { kind: "new" } | { kind: "open"; id: string };
const starter: DraftContent = { main: initialShaderSource, utils: "", uniforms: [] };
function capture(): DraftContent {
  const { main, utils, uniforms } = getDraftState();
  return { main, utils, uniforms: cloneUniforms(uniforms) };
}

export function useSketchLibrary(onSwitch: () => void) {
  const [baseline, setBaseline] = useState(capture);
  const [active, setActive] = useState<{ id: string; name: string } | null>(null);
  const [view, setView] = useState<View>(null);
  const [records, setRecords] = useState<SketchRecord[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SketchRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const target = useRef<Target | null>(null);
  const listVersion = useRef(0);
  const main = useDraftStore((state) => state.main);
  const utils = useDraftStore((state) => state.utils);
  const uniforms = useDraftStore((state) => state.uniforms);
  const dirty = !draftContentEqual({ main, utils, uniforms }, baseline);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => () => { listVersion.current++; }, []);

  function close() {
    if (busy.current) return;
    target.current = null;
    setSelected(null);
    listVersion.current++;
    setView(null);
    setError(null);
  }
  function showList() {
    if (busy.current) return;
    const version = ++listVersion.current;
    setView("list"); setRecords(null); setListError(null); setError(null);
    void sketchStorage.list().then((items) => {
      if (version === listVersion.current) setRecords(items);
    }).catch((reason: unknown) => {
      if (version === listVersion.current) setListError(message(reason));
    });
  }
  async function switchTo(next: Target, revision: number) {
    try {
      const record = next.kind === "open" ? await sketchStorage.read(next.id) : null;
      if (next.kind === "open" && !record) throw new Error("The saved sketch no longer exists.");
      if (getDraftState().revision !== revision) throw new Error("The draft changed while switching. Your edits were kept; please try again.");
      const content = record ? validateSnapshot(record) : starter;
      replaceDraft(content);
      setBaseline(content);
      setActive(record ? { id: record.id, name: record.name } : null);
      target.current = null;
      setView(null);
      onSwitch();
    } catch (reason) {
      target.current = null;
      setError(message(reason)); setView("error");
    }
  }
  async function proceed(next: Target) {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError(null);
    try { await switchTo(next, getDraftState().revision); }
    finally { busy.current = false; setSaving(false); }
  }
  function request(next: Target) {
    if (busy.current) return;
    target.current = next;
    setError(null);
    if (!draftContentEqual(capture(), baseline)) setView("guard");
    else void proceed(next);
  }
  async function write(name: string, id?: string) {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError(null);
    const content = capture();
    const revision = getDraftState().revision;
    try {
      const snapshot = { name, ...content };
      const saved = id ? await sketchStorage.update(id, snapshot) : await sketchStorage.create(snapshot);
      if (!saved) throw new Error("The saved sketch no longer exists.");
      setActive({ id: saved.id, name: saved.name }); setBaseline(content);
      const next = target.current;
      if (next) {
        if (getDraftState().revision !== revision) throw new Error("The draft changed while saving. Your newer edits were kept; please try again.");
        await switchTo(next, revision);
      } else { setView(null); }
    } catch (reason) {
      target.current = null;
      setError(message(reason)); setView("error");
    } finally { busy.current = false; setSaving(false); }
  }
  function save() {
    if (busy.current || view === "rename" || view === "delete") return;
    if (active) void write(active.name, active.id);
    else { setError(null); setView("name"); }
  }
  function saveCopy() { if (!busy.current && view !== "rename" && view !== "delete") { target.current = null; setError(null); setView("name"); } }
  function manage(record: SketchRecord, action: "rename" | "delete") {
    if (busy.current) return;
    setSelected(record); setError(null); setView(action);
  }
  async function confirmManage(name?: string) {
    if (busy.current || !selected || (view !== "rename" && view !== "delete")) return;
    const action = view;
    const record = selected;
    busy.current = true; setSaving(true); setError(null);
    let succeeded = false;
    try {
      if (action === "rename") {
        const renamed = await sketchStorage.rename(record.id, name ?? "");
        if (!renamed) throw new Error("The saved sketch no longer exists.");
        setActive((current) => current?.id === record.id ? { id: current.id, name: renamed.name } : current);
      } else {
        if (!await sketchStorage.delete(record.id)) throw new Error("The saved sketch no longer exists.");
        if (active?.id === record.id) {
          setActive(null);
          setBaseline(starter);
        }
      }
      succeeded = true;
    } catch (reason) {
      setError(message(reason));
    } finally {
      busy.current = false; setSaving(false);
    }
    if (succeeded) { setSelected(null); showList(); }
  }
  return { view, records, listError, error, saving, dirty, selected, showList, close, save, saveCopy,
    rename: (record: SketchRecord) => manage(record, "rename"),
    deleteSketch: (record: SketchRecord) => manage(record, "delete"),
    confirmManage: (name?: string) => void confirmManage(name),
    submitName: (name: string) => void write(name),
    newSketch: () => request({ kind: "new" }),
    open: (id: string) => request({ kind: "open", id }),
    discard: () => { if (target.current) void proceed(target.current); },
  };
}
function message(reason: unknown): string { return reason instanceof Error ? reason.message : "Library storage failed."; }
