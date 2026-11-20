import type { AuthoringController } from "./controller-types.ts";
/**
 * Projects the live controller without implying that an untracked preview is
 * equal to the current draft. `draftDiffersFromApplied` is only boolean when
 * both revisions are known; null means there is no installed identity to
 * compare against.
 */
export function appStateFromController(
  controller: AuthoringController,
  capabilities: {
    readonly captureAvailable: boolean;
    readonly captureReady: boolean;
  },
) {
  const snapshot = controller.read();
  const apply = controller.getApplyState?.();
  const appliedRevision = apply?.appliedRevision ?? null;
  return {
    draftRevision: snapshot.revision,
    appliedRevision,
    draftDiffersFromApplied:
      appliedRevision === null ? null : snapshot.revision !== appliedRevision,
    phase: apply?.phase ?? null,
    backend: apply?.appliedBackend ?? null,
    diagnostics: apply?.diagnostics ?? [],
    capabilities: {
      applySketch: {
        available: Boolean(controller.apply),
        ready: Boolean(controller.apply && controller.isApplyReady?.()),
      },
      capturePreview: {
        available: capabilities.captureAvailable,
        ready: capabilities.captureReady,
      },
    },
  };
}
