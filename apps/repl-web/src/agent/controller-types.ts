import type {
  AuthoringUpdateResult,
  DraftSnapshot,
} from "./authoring-controller.ts";

export type { DraftSnapshot } from "./authoring-controller.ts";

import type { ApplyState, ApplyRequest, ApplyResult } from "./apply-controller.ts";

export interface AuthoringController {
  read(): DraftSnapshot;
  update(request: unknown): AuthoringUpdateResult;
  /** Optional Phase 4 operation; absent controllers retain the Phase 3 catalog. */
  apply?(request: ApplyRequest): Promise<ApplyResult>;
  getApplyState?(): ApplyState;
  subscribeApply?(listener: () => void): () => void;
}
