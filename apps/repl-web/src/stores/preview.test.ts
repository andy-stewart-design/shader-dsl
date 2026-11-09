import assert from "node:assert/strict";
import { afterEach, beforeEach } from "node:test";
import test from "node:test";
import { usePreviewStore } from "./preview.ts";

function resetPreviewStore() {
  usePreviewStore.setState({
    drawerMode: "closed",
    playing: true,
    widthRatio: 1,
    heightRatio: 1,
  });
}

beforeEach(resetPreviewStore);
afterEach(resetPreviewStore);

test("preview store has the expected defaults", () => {
  const state = usePreviewStore.getState();
  assert.equal(state.drawerMode, "closed");
  assert.equal(state.playing, true);
  assert.equal(state.widthRatio, 1);
  assert.equal(state.heightRatio, 1);
});

test("preview setters support functional updates", () => {
  const { actions } = usePreviewStore.getState();
  actions.setPlaying(false);
  actions.setWidthRatio((ratio) => ratio * 2);
  actions.setHeightRatio((ratio) => ratio + 0.5);
  actions.setDrawerMode("controls");

  const state = usePreviewStore.getState();
  assert.equal(state.playing, false);
  assert.equal(state.widthRatio, 2);
  assert.equal(state.heightRatio, 1.5);
  assert.equal(state.drawerMode, "controls");

  actions.setPlaying(true);
  actions.setWidthRatio(1);
  actions.setHeightRatio(1);
  actions.setDrawerMode("closed");
});
