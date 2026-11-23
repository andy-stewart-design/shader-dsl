import type { ApplyState } from "../agent/apply-controller.ts";

/** The last confirmed frame remains evidence even if a later Run fails. */
export function switchPreviewStatus(
  switchRevision: number | null,
  applyState: ApplyState,
): string | null {
  if (
    switchRevision === null ||
    (applyState.appliedRevision ?? -1) >= switchRevision
  )
    return null;
  if (["compiling", "installing", "drawing"].includes(applyState.phase)) {
    return null;
  }
  if (
    applyState.phase === "failed" &&
    (applyState.draftRevision ?? -1) >= switchRevision
  ) {
    return "Current sketch has not rendered successfully; any visible preview may be from an earlier run.";
  }
  return "Current sketch has not been rendered; any visible preview may be from an earlier run. Use Run to render it.";
}
