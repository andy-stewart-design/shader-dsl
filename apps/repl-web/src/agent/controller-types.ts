import type {
  AuthoringUpdateResult,
  DraftSnapshot,
} from "./authoring-controller.ts";

export type { DraftSnapshot } from "./authoring-controller.ts";

export interface AuthoringController {
  read(): DraftSnapshot;
  update(request: unknown): AuthoringUpdateResult;
}
