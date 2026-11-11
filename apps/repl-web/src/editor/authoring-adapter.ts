import type { DraftDocument } from "../stores/draft.ts";
import type { EditorHandle } from "./create-editor.ts";

export interface EditorReplacement {
  readonly document: DraftDocument;
  readonly current: string;
  apply(): void;
  rollback(): void;
}

export interface EditorAdapter {
  readonly document: DraftDocument;
  isReady(): boolean;
  read(): string;
  prepareReplace(next: string): EditorReplacement | null;
}

export function createEditorAdapter(
  document: DraftDocument,
  handle: EditorHandle,
): EditorAdapter {
  return {
    document,
    isReady: handle.isReady,
    read: handle.read,
    prepareReplace: (next) => {
      const replacement = handle.prepareReplace(next);
      return replacement
        ? {
            document,
            current: replacement.current,
            apply: replacement.apply,
            rollback: replacement.rollback,
          }
        : null;
    },
  };
}

/**
 * App-local registry for the two CodeMirror documents. It deliberately has no
 * transport or window surface; an authoring controller receives a registry
 * explicitly when it needs visible editor transactions.
 */
export class EditorRegistry {
  private readonly entries = new Map<DraftDocument, EditorAdapter>();
  private batchDepth = 0;

  register(adapter: EditorAdapter): () => void {
    this.entries.set(adapter.document, adapter);
    return () => {
      if (this.entries.get(adapter.document) === adapter) {
        this.entries.delete(adapter.document);
      }
    };
  }

  get(document: DraftDocument): EditorAdapter | undefined {
    return this.entries.get(document);
  }

  /** True while a controller is dispatching a multi-editor command. */
  get isBatching(): boolean {
    return this.batchDepth > 0;
  }

  batch<T>(dispatch: () => T): T {
    this.batchDepth += 1;
    try {
      return dispatch();
    } finally {
      this.batchDepth -= 1;
    }
  }
}

export const editorRegistry = new EditorRegistry();
