import assert from "node:assert/strict";
import test from "node:test";
import { createAuthoringController } from "./authoring-controller.ts";
import { EditorRegistry } from "../editor/authoring-adapter.ts";
import { createDraftStore } from "../stores/draft.ts";

function makeController() {
  const store = createDraftStore();
  return { store, controller: createAuthoringController(store) };
}

const validFloat = {
  name: "gain",
  type: "float" as const,
  value: "0.5",
  min: "0",
  max: "1",
};
const validColor = {
  name: "tint",
  type: "color" as const,
  value: "#0f8",
};

test("reads cloned raw drafts and maps color value from draft", () => {
  const { controller } = makeController();
  const first = controller.update({
    expectedRevision: 0,
    uniforms: [
      { ...validFloat },
      { ...validColor },
      {
        name: "unfinished",
        type: "float",
        value: "not numeric",
        min: "",
        max: "1",
      },
    ],
  });
  assert.equal(first.ok, false);

  const { store } = makeController();
  store.getState().actions.setUniforms([
    {
      id: "manual",
      name: "unfinished",
      type: "float",
      value: "not numeric",
      min: "",
      max: "1",
    },
    {
      id: "color",
      name: "tint",
      type: "color",
      draft: "#abc",
      valid: "#aabbcc",
    },
  ]);
  const isolated = createAuthoringController(store);
  const snapshot = isolated.read();
  assert.deepEqual(snapshot.uniforms, [
    {
      id: "manual",
      name: "unfinished",
      type: "float",
      value: "not numeric",
      min: "",
      max: "1",
    },
    { id: "color", name: "tint", type: "color", value: "#abc" },
  ]);
  snapshot.uniforms[0]!.name = "mutated outside";
  assert.equal(isolated.read().uniforms[0]!.name, "unfinished");
});

test("commits all requested fields in one coherent subscriber notification", () => {
  const { controller, store } = makeController();
  const seen: Array<{
    revision: number;
    main: string;
    utils: string;
    count: number;
  }> = [];
  const unsubscribe = store.subscribe((state) => {
    seen.push({
      revision: state.revision,
      main: state.main,
      utils: state.utils,
      count: state.uniforms.length,
    });
  });

  const result = controller.update({
    expectedRevision: 0,
    main: "not valid shader text",
    utils: "helper source can also be incomplete(",
    uniforms: [{ ...validFloat }, { ...validColor }],
  });
  unsubscribe();

  assert.equal(result.ok, true);
  assert.deepEqual(seen, [
    {
      revision: 1,
      main: "not valid shader text",
      utils: "helper source can also be incomplete(",
      count: 2,
    },
  ]);
  assert.equal(controller.read().revision, 1);
});

test("omitted fields stay unchanged and a source-only no-op keeps revision", () => {
  const { controller } = makeController();
  const first = controller.update({ expectedRevision: 0, main: "draft" });
  assert.equal(first.ok, true);
  const second = controller.update({ expectedRevision: 1, utils: "helpers" });
  assert.equal(second.ok, true);
  assert.equal(controller.read().main, "draft");
  assert.equal(controller.read().utils, "helpers");
  const noop = controller.update({ expectedRevision: 2, main: "draft" });
  assert.equal(noop.ok, true);
  assert.equal(controller.read().revision, 2);
});

test("stale, malformed, and semantically invalid requests are atomic", () => {
  const { controller } = makeController();
  assert.equal(
    controller.update({ expectedRevision: 0, main: "before" }).ok,
    true,
  );
  const before = controller.read();

  const stale = controller.update({
    expectedRevision: 0,
    main: "stale",
    uniforms: [{ ...validFloat }],
  });
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.error.code, "conflict");
  assert.deepEqual(controller.read(), before);

  const invalid = controller.update({
    expectedRevision: 1,
    main: "would be valid to store",
    uniforms: [{ ...validFloat, value: "not-a-number" }],
  });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.error.code, "validation");
  assert.deepEqual(controller.read(), before);

  const malformed = controller.update({ expectedRevision: 1 });
  assert.equal(malformed.ok, false);
  assert.deepEqual(controller.read(), before);
});

test("definition replacement supports CRUD, preserves IDs, and derives colors", () => {
  const { controller } = makeController();
  const added = controller.update({
    expectedRevision: 0,
    uniforms: [{ ...validFloat }, { ...validColor }],
  });
  assert.equal(added.ok, true);
  const initial = controller.read().uniforms;
  assert.deepEqual(
    initial.map((uniform) => uniform.id),
    ["uniform-0", "uniform-1"],
  );

  const gain = initial[0]!;
  const tint = initial[1]!;
  const changed = controller.update({
    expectedRevision: 1,
    uniforms: [
      {
        id: gain.id,
        name: "renamed",
        type: "float",
        value: "2",
        min: "1",
        max: "3",
      },
      { id: tint.id, name: "tint", type: "color", value: "#123456" },
      { name: "newValue", type: "float", value: "0", min: "-2", max: "2" },
    ],
  });
  assert.equal(changed.ok, true);
  assert.deepEqual(controller.read().uniforms, [
    {
      id: gain.id,
      name: "renamed",
      type: "float",
      value: "2",
      min: "1",
      max: "3",
    },
    { id: tint.id, name: "tint", type: "color", value: "#123456" },
    {
      id: "uniform-2",
      name: "newValue",
      type: "float",
      value: "0",
      min: "-2",
      max: "2",
    },
  ]);

  const typeChanged = controller.update({
    expectedRevision: 2,
    uniforms: [
      { id: gain.id, name: "renamed", type: "color", value: "#abc" },
      { id: tint.id, name: "tint", type: "color", value: "#123456" },
      {
        id: "uniform-2",
        name: "newValue",
        type: "float",
        value: "0",
        min: "-2",
        max: "2",
      },
    ],
  });
  assert.equal(typeChanged.ok, true);
  assert.deepEqual(controller.read().uniforms[0], {
    id: gain.id,
    name: "renamed",
    type: "color",
    value: "#abc",
  });

  const deleted = controller.update({
    expectedRevision: 3,
    uniforms: [{ id: tint.id, name: "tint", type: "color", value: "#ffffff" }],
  });
  assert.equal(deleted.ok, true);
  assert.deepEqual(
    controller.read().uniforms.map((uniform) => uniform.id),
    [tint.id],
  );
});

test("preflights every requested editor before changing any document", () => {
  const { store } = makeController();
  const registry = new EditorRegistry();
  let main = store.getState().main;
  let utils = store.getState().utils;
  registry.register({
    document: "main",
    isReady: () => true,
    read: () => main,
    prepareReplace: (next) => ({
      document: "main",
      current: main,
      apply: () => {
        main = next;
      },
      rollback: () => {},
    }),
  });
  registry.register({
    document: "utils",
    isReady: () => false,
    read: () => utils,
    prepareReplace: (next) => ({
      document: "utils",
      current: utils,
      apply: () => {
        utils = next;
      },
      rollback: () => {},
    }),
  });

  const controller = createAuthoringController(store, { editorRegistry: registry });
  const before = controller.read();
  const result = controller.update({
    expectedRevision: before.revision,
    main: "new main",
    utils: "new utils",
  });
  assert.equal(result.ok, false);
  assert.equal(main, before.main);
  assert.equal(utils, before.utils);
  assert.deepEqual(controller.read(), before);
});

test("visible editor replacements commit once and preserve omitted documents", () => {
  const { store } = makeController();
  const registry = new EditorRegistry();
  let main = store.getState().main;
  let utils = store.getState().utils;
  for (const document of ["main", "utils"] as const) {
    registry.register({
      document,
      isReady: () => true,
      read: () => (document === "main" ? main : utils),
      prepareReplace: (next) => {
        const current = document === "main" ? main : utils;
        return {
          document,
          current,
          apply: () => {
            if (document === "main") main = next;
            else utils = next;
          },
          rollback: () => {
            if (document === "main") main = current;
            else utils = current;
          },
        };
      },
    });
  }
  const controller = createAuthoringController(store, { editorRegistry: registry });
  const seen: number[] = [];
  const unsubscribe = store.subscribe((state) => seen.push(state.revision));
  const result = controller.update({
    expectedRevision: 0,
    main: "agent main",
  });
  unsubscribe();
  assert.equal(result.ok, true);
  assert.equal(main, "agent main");
  assert.equal(utils, "");
  assert.deepEqual(seen, [1]);
  assert.equal(controller.read().main, main);
});

test("restores staged documents when a later editor dispatch fails", () => {
  const { store } = makeController();
  const registry = new EditorRegistry();
  let main = store.getState().main;
  let utils = store.getState().utils;
  const originalMain = main;
  const originalUtils = utils;
  let mainApplied = false;
  let utilsApplied = false;
  for (const document of ["main", "utils"] as const) {
    registry.register({
      document,
      isReady: () => true,
      read: () => (document === "main" ? main : utils),
      prepareReplace: (next) => {
        const current = document === "main" ? main : utils;
        return {
          document,
          current,
          apply: () => {
            if (document === "main") {
              main = next;
              mainApplied = true;
            } else {
              utils = next;
              utilsApplied = true;
              throw new Error("synthetic dispatch failure");
            }
          },
          rollback: () => {
            if (document === "main") main = current;
            else utils = current;
          },
        };
      },
    });
  }
  const controller = createAuthoringController(store, { editorRegistry: registry });
  const result = controller.update({
    expectedRevision: 0,
    main: "staged main",
    utils: "staged utils",
  });

  assert.equal(result.ok, false);
  assert.equal(mainApplied, true);
  assert.equal(utilsApplied, true);
  assert.equal(main, originalMain);
  assert.equal(utils, originalUtils);
  assert.equal(controller.read().revision, 0);
});

test("does not roll back visible documents when a committed observer throws", () => {
  const { store } = makeController();
  const registry = new EditorRegistry();
  let main = store.getState().main;
  registry.register({
    document: "main",
    isReady: () => true,
    read: () => main,
    prepareReplace: (next) => {
      const current = main;
      return {
        document: "main",
        current,
        apply: () => {
          main = next;
        },
        rollback: () => {
          main = current;
        },
      };
    },
  });
  const unsubscribe = store.subscribe(() => {
    throw new Error("observer failure");
  });
  const controller = createAuthoringController(store, { editorRegistry: registry });
  assert.throws(
    () => controller.update({ expectedRevision: 0, main: "published" }),
    /observer failure/,
  );
  unsubscribe();
  assert.equal(main, "published");
  assert.equal(store.getState().main, "published");
  assert.equal(store.getState().revision, 1);
});

test("rejects duplicate IDs, duplicate/reserved names, invalid numbers, ranges, and colors", () => {
  const { controller } = makeController();
  assert.equal(
    controller.update({ expectedRevision: 0, uniforms: [{ ...validFloat }] })
      .ok,
    true,
  );
  const before = controller.read();
  const cases = [
    [
      { id: "uniform-0", ...validFloat },
      { id: "uniform-0", ...validColor },
    ],
    [
      { id: "uniform-0", ...validFloat },
      { name: "gain", type: "color", value: "#fff" },
    ],
    [{ id: "uniform-0", ...validFloat, name: "resolution" }],
    [{ id: "uniform-0", ...validFloat, value: "1e300" }],
    [{ id: "uniform-0", ...validFloat, min: "1", max: "1" }],
    [{ id: "uniform-0", name: "tint", type: "color", value: "#12" }],
    [{ id: "unknown", ...validFloat }],
  ];

  for (const uniforms of cases) {
    const result = controller.update({
      expectedRevision: before.revision,
      uniforms,
    });
    assert.equal(result.ok, false);
    assert.deepEqual(controller.read(), before);
  }
});
