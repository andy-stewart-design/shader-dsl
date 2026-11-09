import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { javascript, typescriptLanguage } from "@codemirror/lang-javascript";
import {
  bracketMatching,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import {
  highlightSelectionMatches,
  search,
  searchKeymap,
} from "@codemirror/search";
import { EditorState, type Extension } from "@codemirror/state";
import {
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { insertLineAbove } from "./commands";
import { editorHighlightStyle, editorTheme } from "./theme";

export function createEditorExtensions(): Extension[] {
  return [
    EditorState.allowMultipleSelections.of(true),
    javascript({ typescript: true }),
    typescriptLanguage.data.of({
      closeBrackets: {
        brackets: ["(", "[", "{", "'", '"', "`", "<"],
      },
    }),
    lineNumbers(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    history(),
    drawSelection(),
    indentOnInput(),
    editorTheme,
    syntaxHighlighting(editorHighlightStyle),
    bracketMatching(),
    closeBrackets(),
    search(),
    highlightSelectionMatches(),
    // Earlier bindings win; paired-bracket deletion precedes Backspace.
    keymap.of([
      ...closeBracketsKeymap,
      ...searchKeymap,
      { key: "Mod-Shift-Enter", run: insertLineAbove },
      indentWithTab,
      ...defaultKeymap,
      ...historyKeymap,
    ]),
  ];
}
