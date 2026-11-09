import assert from "node:assert/strict";
import { afterEach, beforeEach } from "node:test";
import test from "node:test";
import { getDraftState, useDraftStore } from "./draft.ts";
import { initialShaderSource } from "../shared/initial-source.ts";

function resetDraftStore() {
  useDraftStore.setState({ main: initialShaderSource, utils: "", uniforms: [] });
}

beforeEach(resetDraftStore);
afterEach(resetDraftStore);

test("draft store defaults keep sources and uniforms isolated", () => {
  const state = getDraftState();
  assert.equal(state.main, initialShaderSource);
  assert.equal(state.utils, "");
  assert.deepEqual(state.uniforms, []);
});

test("draft source and uniform actions update independently", () => {
  const { actions } = useDraftStore.getState();
  const originalMain = getDraftState().main;
  const uniform = {
    id: "uniform-test",
    name: "gain",
    type: "float" as const,
    value: "0",
    min: "-1",
    max: "1",
  };

  actions.setSource("utils", "const helper = 1;");
  actions.setUniforms(() => [uniform]);
  assert.equal(getDraftState().main, originalMain);
  assert.equal(getDraftState().utils, "const helper = 1;");
  assert.deepEqual(getDraftState().uniforms, [uniform]);

  actions.setSource("utils", "");
  actions.setUniforms([]);
});
