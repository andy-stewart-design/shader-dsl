import assert from "node:assert/strict";
import { afterEach, beforeEach } from "node:test";
import test from "node:test";
import { createDraftStore, getDraftState, useDraftStore } from "./draft.ts";
import { initialShaderSource } from "../shared/initial-source.ts";

function resetDraftStore() {
  useDraftStore.setState({
    main: initialShaderSource,
    utils: "",
    uniforms: [],
    revision: 0,
  });
}

beforeEach(resetDraftStore);
afterEach(resetDraftStore);

test("draft store defaults keep sources and uniforms isolated", () => {
  const state = getDraftState();
  assert.equal(state.main, initialShaderSource);
  assert.equal(state.utils, "");
  assert.deepEqual(state.uniforms, []);
  assert.equal(state.revision, 0);
});

test("manual source and definition edits advance one revision each", () => {
  const { actions } = useDraftStore.getState();
  const uniform = {
    id: "uniform-test",
    name: "gain",
    type: "float" as const,
    value: "0",
    min: "-1",
    max: "1",
  };

  actions.setSource("utils", "const helper = 1;");
  assert.equal(getDraftState().revision, 1);
  actions.setUniforms([uniform]);
  assert.equal(getDraftState().revision, 2);
  assert.equal(getDraftState().main, initialShaderSource);
  assert.equal(getDraftState().utils, "const helper = 1;");
  assert.deepEqual(getDraftState().uniforms, [uniform]);
});

test("invalid intermediate drafts still advance and true noops do not", () => {
  const { actions } = useDraftStore.getState();
  const invalid = {
    id: "uniform-test",
    name: "not valid yet",
    type: "float" as const,
    value: "pending",
    min: "",
    max: "",
  };

  actions.setUniforms([invalid]);
  assert.equal(getDraftState().revision, 1);
  actions.setUniforms([invalid]);
  actions.setSource("main", initialShaderSource);
  assert.equal(getDraftState().revision, 1);
});

test("factory stores are isolated for controller-oriented tests", () => {
  const first = createDraftStore();
  const second = createDraftStore();
  first.getState().actions.setSource("main", "first");
  assert.equal(first.getState().revision, 1);
  assert.equal(second.getState().revision, 0);
  assert.equal(second.getState().main, initialShaderSource);
});
