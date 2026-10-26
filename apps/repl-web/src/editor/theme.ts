import { HighlightStyle } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

// Keep design values in CSS so ancestor overrides update existing editors.
export const editorTheme = EditorView.theme(
	{
		"&": {
			height: "100%",
			minHeight: "0",
			colorScheme: "dark",
			backgroundColor: "var(--editor-background)",
			color: "var(--editor-foreground)",
			fontSize: "var(--editor-font-size)",
		},
		"&.cm-focused": {
			outline: "var(--editor-focus-outline)",
			outlineOffset: "-2px",
		},
		".cm-scroller": {
			minHeight: "0",
			overflow: "auto",
			fontFamily: "var(--editor-font-family)",
			lineHeight: "var(--editor-line-height)",
		},
		".cm-content": {
			padding: "var(--editor-padding) 0",
			caretColor: "var(--editor-cursor)",
		},
		".cm-line": { padding: "0 var(--editor-padding)" },
		".cm-cursor, .cm-dropCursor": {
			borderLeftColor: "var(--editor-cursor)",
		},
		".cm-selectionBackground": {
			backgroundColor: "var(--editor-selection-inactive)",
		},
		"&.cm-focused .cm-selectionBackground, .cm-content ::selection": {
			backgroundColor: "var(--editor-selection)",
		},
		".cm-gutters": {
			backgroundColor: "var(--editor-gutter-background)",
			color: "var(--editor-gutter-foreground)",
			borderRight: "var(--editor-gutter-border)",
		},
		".cm-activeLine": {
			backgroundColor: "var(--editor-active-line)",
		},
		".cm-activeLineGutter": {
			backgroundColor: "var(--editor-gutter-active-line-background)",
		},
		"&.cm-focused .cm-matchingBracket": {
			backgroundColor: "var(--editor-bracket-match)",
			outline: "1px solid var(--editor-border)",
		},
		"&.cm-focused .cm-nonmatchingBracket": {
			color: "var(--editor-invalid)",
		},
		".cm-searchMatch": {
			backgroundColor: "var(--editor-search-match)",
			outline: "1px solid var(--editor-search-border)",
		},
		".cm-searchMatch-selected": {
			backgroundColor: "var(--editor-search-match-selected)",
		},
		".cm-selectionMatch": {
			backgroundColor: "var(--editor-selection-match)",
		},
		".cm-panels": {
			backgroundColor: "var(--editor-panel-background)",
			color: "var(--editor-foreground)",
		},
		".cm-panels-top": { borderBottom: "1px solid var(--editor-border)" },
		".cm-panels-bottom": { borderTop: "1px solid var(--editor-border)" },
		".cm-panel.cm-search": { padding: "var(--editor-padding)" },
		".cm-textfield, .cm-button": {
			background: "var(--editor-control-background)",
			color: "var(--editor-foreground)",
			border: "1px solid var(--editor-border)",
			borderRadius: "var(--editor-control-radius)",
		},
		".cm-button:hover": { background: "var(--editor-control-hover)" },
		".cm-panel.cm-search input": { accentColor: "var(--editor-focus)" },
		".cm-panel.cm-search :focus-visible": {
			outline: "2px solid var(--editor-focus)",
			outlineOffset: "1px",
		},
	},
	{ dark: true },
);

export const editorHighlightStyle = HighlightStyle.define([
	{ tag: tags.keyword, color: "var(--editor-keyword)" },
	{ tag: tags.variableName, color: "var(--editor-foreground)" },
	{ tag: tags.propertyName, color: "var(--editor-property)" },
	{ tag: tags.function(tags.variableName), color: "var(--editor-function)" },
	{ tag: tags.function(tags.propertyName), color: "var(--editor-function)" },
	{
		tag: [tags.typeName, tags.className, tags.namespace],
		color: "var(--editor-type)",
	},
	{ tag: [tags.string, tags.regexp], color: "var(--editor-string)" },
	{ tag: [tags.number, tags.bool, tags.null], color: "var(--editor-literal)" },
	{ tag: tags.escape, color: "var(--editor-escape)" },
	{ tag: tags.operator, color: "var(--editor-operator)" },
	{ tag: tags.punctuation, color: "var(--editor-punctuation)" },
	{ tag: tags.comment, color: "var(--editor-comment)", fontStyle: "italic" },
	{ tag: tags.meta, color: "var(--editor-meta)" },
	{
		tag: tags.invalid,
		color: "var(--editor-invalid)",
		textDecoration: "underline wavy",
	},
]);
