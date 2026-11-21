import { test } from "node:test";
import assert from "node:assert/strict";
import type { ApplyState } from "../agent/apply-controller.ts";
import { switchPreviewStatus } from "./switch-preview-status.ts";

const state = (phase: ApplyState["phase"], appliedRevision: number | null): ApplyState => ({
  phase, appliedRevision, draftRevision: 5, attemptId: 1, diagnostics: [],
});

test("switch status uses the last confirmed frame, not the latest Run phase", () => {
  assert.equal(switchPreviewStatus(null, state("failed", null)), null);
  assert.equal(switchPreviewStatus(5, state("applied", 5)), null);
  assert.equal(switchPreviewStatus(5, state("failed", 5)), null);
  assert.equal(switchPreviewStatus(5, state("installing", 5)), null);
  assert.equal(switchPreviewStatus(5, state("installing", 4)), null);
  assert.match(switchPreviewStatus(5, state("idle", 4))!, /Use Run/);
  assert.match(switchPreviewStatus(6, state("failed", 4))!, /has not been rendered/);
  assert.match(switchPreviewStatus(5, state("failed", 4))!, /not rendered successfully/);
  assert.match(switchPreviewStatus(5, state("failed", null))!, /not rendered successfully/);
});
