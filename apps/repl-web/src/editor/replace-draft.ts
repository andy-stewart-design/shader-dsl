import { editorRegistry } from "./authoring-adapter.ts";
import { getDraftState, type DraftContent, type DraftDocument } from "../stores/draft.ts";

/** Switch both editor histories and the draft at one synchronous boundary. */
export function replaceDraft(content: DraftContent): void {
  const replacements = (["main", "utils"] as DraftDocument[]).flatMap((document) => {
    const editor = editorRegistry.get(document);
    if (!editor) return [];
    if (!editor.prepareFresh) throw new Error("Editor cannot switch sketches.");
    return [editor.prepareFresh(content[document])];
  });
  editorRegistry.batch(() => {
    const applied = [] as typeof replacements;
    try {
      for (const replacement of replacements) {
        replacement.apply();
        applied.push(replacement);
      }
    } catch (error) {
      for (const replacement of applied.reverse()) replacement.rollback();
      throw error;
    }
    getDraftState().actions.commit(content);
  });
}
