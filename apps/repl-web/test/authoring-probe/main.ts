import { createAuthoringController } from "../../src/agent/authoring-controller.ts";
import {
  createEditorAdapter,
  editorRegistry,
} from "../../src/editor/authoring-adapter.ts";
import { createEditor, type EditorHandle } from "../../src/editor/create-editor.ts";
import { createDraftStore } from "../../src/stores/draft.ts";

const store = createDraftStore();
const controller = createAuthoringController(store, { editorRegistry });
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const snapshot = document.querySelector<HTMLElement>("#snapshot")!;
const mainHost = document.querySelector<HTMLDivElement>("#main-editor")!;
const utilsHost = document.querySelector<HTMLDivElement>("#utils-editor")!;
const applyButton = document.querySelector<HTMLButtonElement>("#apply")!;
const undoButton = document.querySelector<HTMLButtonElement>("#undo")!;
const redoButton = document.querySelector<HTMLButtonElement>("#redo")!;
const conflictButton = document.querySelector<HTMLButtonElement>("#conflict")!;
const unmountButton = document.querySelector<HTMLButtonElement>("#unmount")!;
const mountButton = document.querySelector<HTMLButtonElement>("#mount")!;

let mainEditor: EditorHandle;
let utilsEditor: EditorHandle | undefined;
let unregisterUtils: (() => void) | undefined;

function render(message?: string): void {
  const current = controller.read();
  snapshot.textContent = JSON.stringify(
    { revision: current.revision, main: current.main, utils: current.utils },
    null,
    2,
  );
  if (message) status.textContent = `${message} · revision ${current.revision}`;
}

function mountMain(): void {
  mainEditor = createEditor({
    parent: mainHost,
    initialDoc: store.getState().main,
    ariaLabel: "Probe main source",
    onChange: ({ doc, programmatic }) => {
      if (!programmatic && !editorRegistry.isBatching) {
        store.getState().actions.setSource("main", doc);
        render("Manual main edit");
      }
    },
  });
  editorRegistry.register(createEditorAdapter("main", mainEditor));
}

function mountUtils(): void {
  if (utilsEditor?.isReady()) return;
  utilsHost.replaceChildren();
  utilsEditor = createEditor({
    parent: utilsHost,
    initialDoc: store.getState().utils,
    ariaLabel: "Probe utils source",
    onChange: ({ doc, programmatic }) => {
      if (!programmatic && !editorRegistry.isBatching) {
        store.getState().actions.setSource("utils", doc);
        render("Manual utils edit");
      }
    },
  });
  unregisterUtils = editorRegistry.register(
    createEditorAdapter("utils", utilsEditor),
  );
}

function unmountUtils(): void {
  unregisterUtils?.();
  unregisterUtils = undefined;
  utilsEditor?.destroy();
  utilsEditor = undefined;
  utilsHost.replaceChildren();
  render("Utils editor unmounted");
}

applyButton.addEventListener("click", () => {
  const current = controller.read();
  const result = controller.update({
    expectedRevision: current.revision,
    main: `${current.main}\n// applied by the authoring controller`,
    utils: "const helper = (value) => value;",
  });
  render(result.ok ? "Programmatic source edit applied" : `Rejected: ${result.error.message}`);
});

undoButton.addEventListener("click", () => {
  render(mainEditor.undo() ? "Main undo" : "Nothing to undo");
});

redoButton.addEventListener("click", () => {
  render(mainEditor.redo() ? "Main redo" : "Nothing to redo");
});

conflictButton.addEventListener("click", () => {
  const before = controller.read();
  mainEditor.replace(`${before.main}\n// manual edit`);
  store.getState().actions.setSource("main", mainEditor.read());
  const result = controller.update({
    expectedRevision: before.revision,
    main: "stale agent edit",
  });
  render(result.ok ? "Unexpectedly accepted stale edit" : `Conflict: ${result.error.message}`);
});

unmountButton.addEventListener("click", unmountUtils);
mountButton.addEventListener("click", () => {
  mountUtils();
  render("Utils editor mounted");
});

mountMain();
mountUtils();
render("Ready — use Apply, Undo/Redo, conflict, and unmount buttons");
