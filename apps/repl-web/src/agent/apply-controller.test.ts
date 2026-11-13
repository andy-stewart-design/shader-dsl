import assert from "node:assert/strict";
import test from "node:test";
import {
  createApplyController,
  updateApplyErrorPresentation,
  type ApplyCompileResult,
  type ApplyErrorPresentation,
} from "./apply-controller.ts";
import type { DraftSnapshot } from "./authoring-controller.ts";

const artifact = { glsl: "", wgsl: "", defaults: { glsl: [], wgsl: [] } };
function snapshot(revision: number): DraftSnapshot {
  return { revision, main: `source-${revision}`, utils: "", uniforms: [] };
}
function setup(compile: (value: DraftSnapshot) => ApplyCompileResult | Promise<ApplyCompileResult>, installAndDraw: (options: { onDrawing?: () => void; signal: AbortSignal }) => Promise<{ backend: "webgl" | "webgpu" }>) {
  let current = snapshot(0);
  const preview = { current: { installAndDraw: (_next: typeof artifact, options: { onDrawing?: () => void; signal: AbortSignal }) => installAndDraw(options) } };
  const controller = createApplyController({ readDraft: () => current, compile, preview });
  return { controller, setRevision: (revision: number) => { current = snapshot(revision); } };
}

test("compile failures are structured and never install", async () => {
  let installs = 0;
  const { controller } = setup(() => ({
    ok: false,
    diagnostics: [{ code: "syntax", document: "main", range: { start: 3, length: 2 }, message: "bad syntax" }],
  }), async () => { installs++; return { backend: "webgl" }; });
  const result = await controller.apply({ expectedRevision: 0 });
  assert.equal(result.ok, false);
  if (!result.ok) assert.deepEqual(result.error, { code: "syntax", document: "main", range: { start: 3, length: 2 }, message: "bad syntax" });
  assert.equal(installs, 0);
  assert.equal(controller.getState().appliedRevision, null);
});

test("Apply remains installing/drawing until the real frame promise settles", async () => {
  let drawResolve!: () => void;
  const states: string[] = [];
  const { controller } = setup(() => ({ ok: true, artifact }), (options) => new Promise((resolve) => {
    options.onDrawing?.();
    drawResolve = () => resolve({ backend: "webgpu" });
  }));
  const unsubscribe = controller.subscribe(() => states.push(controller.getState().phase));
  const pending = controller.apply({ expectedRevision: 0 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controller.getState().phase, "drawing");
  assert.equal(controller.getState().appliedRevision, null);
  drawResolve();
  const result = await pending;
  unsubscribe();
  assert.equal(result.ok, true);
  assert.equal(controller.getState().phase, "applied");
  assert.equal(controller.getState().appliedRevision, 0);
  assert.deepEqual(states.slice(0, 3), ["compiling", "installing", "drawing"]);
});

test("a newer Apply owns status and late completion cannot retag it", async () => {
  const resolvers: Array<() => void> = [];
  const { controller } = setup(() => ({ ok: true, artifact }), () => new Promise((resolve) => {
    resolvers.push(() => resolve({ backend: "webgl" }));
  }));
  const first = controller.apply({ expectedRevision: 0 });
  const second = controller.apply({ expectedRevision: 0 });
  await Promise.resolve();
  await Promise.resolve();
  resolvers[0]!();
  const secondResult = await second;
  assert.equal(secondResult.ok, true);
  const firstResult = await first;
  assert.equal(firstResult.ok, false);
  assert.equal(controller.getState().attemptId, 2);
  assert.equal(controller.getState().phase, "applied");
});

test("draft edits during Apply retain the captured applied revision", async () => {
  let resolve!: () => void;
  const { controller, setRevision } = setup(() => ({ ok: true, artifact }), () => new Promise((r) => { resolve = () => r({ backend: "webgl" }); }));
  const pending = controller.apply({ expectedRevision: 0 });
  setRevision(1);
  await Promise.resolve();
  await Promise.resolve();
  resolve();
  const result = await pending;
  assert.equal(result.ok, true);
  assert.equal(result.appliedRevision, 0);
  assert.equal(controller.getState().draftRevision, 0);
});

test("cancellation settles without replaying installation", async () => {
  const abort = new AbortController();
  let resolve!: () => void;
  let installs = 0;
  const { controller } = setup(() => ({ ok: true, artifact }), () => {
    installs++;
    return new Promise((r) => { resolve = () => r({ backend: "webgl" }); });
  });
  const pending = controller.apply({ expectedRevision: 0, signal: abort.signal });
  await Promise.resolve();
  await Promise.resolve();
  abort.abort();
  resolve();
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(controller.getState().phase, "cancelled");
  assert.equal(installs, 1);
});

test("published Apply state drives the shared error surface and clears on recovery", async () => {
  let shouldFail = true;
  let presentation: ApplyErrorPresentation = { compileError: null, runtimeError: null };
  const { controller } = setup(
    () => shouldFail
      ? { ok: false, diagnostics: [{ code: "syntax", message: "invalid main" }] }
      : { ok: true, artifact },
    async () => ({ backend: "webgpu" }),
  );
  controller.subscribe(() => {
    presentation = updateApplyErrorPresentation(presentation, controller.getState());
  });

  await controller.apply({ expectedRevision: 0 });
  assert.deepEqual(presentation, { compileError: "invalid main", runtimeError: null });

  shouldFail = false;
  await controller.apply({ expectedRevision: 0 });
  assert.deepEqual(presentation, { compileError: null, runtimeError: null });
});

test("stale and superseded state cannot replace or clear a newer visible error", async () => {
  let compileCalls = 0;
  let presentation: ApplyErrorPresentation = { compileError: null, runtimeError: null };
  const { controller } = setup(
    () => ++compileCalls === 1
      ? { ok: true, artifact }
      : { ok: false, diagnostics: [{ code: "syntax", message: "newer syntax error" }] },
    () => new Promise(() => {
      // The older install never completes; supersession must settle it without
      // publishing a second presentation update.
    }),
  );
  controller.subscribe(() => {
    presentation = updateApplyErrorPresentation(presentation, controller.getState());
  });

  const older = controller.apply({ expectedRevision: 0 });
  const newer = controller.apply({ expectedRevision: 0 });
  await newer;
  assert.deepEqual(presentation, { compileError: "newer syntax error", runtimeError: null });
  await older;
  assert.deepEqual(presentation, { compileError: "newer syntax error", runtimeError: null });

  const stale = updateApplyErrorPresentation(presentation, {
    phase: "stale",
    attemptId: 3,
    appliedRevision: 0,
    diagnostics: [{ code: "stale", message: "old revision" }],
  });
  assert.deepEqual(stale, presentation);
});
