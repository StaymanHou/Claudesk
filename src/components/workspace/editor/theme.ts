// WP2 — the lite editor's dark CodeMirror 6 theme + syntax highlight style.
//
// Claudesk is dark-only and never follows the OS theme (CLAUDE.md "Dark mode
// only"): this is the ONLY theme, with NO light variant and NO
// prefers-color-scheme. Two parts:
//   - `editorChromeTheme` — the editor "chrome" (background, gutter, cursor,
//     selection), palette-aligned to App.css (#1e1e1e body, #6ea8ff accent).
//   - `editorHighlightStyle` — the SYNTAX token colors, a VS Code "Dark+"-flavored
//     palette (operator's choice at WP2 verify-human, 2026-06-19) on the same
//     #1e1e1e background so the editor reads as part of the app.
// `editorDarkTheme` bundles both as the single extension EditorPanel applies.

import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { Compartment, type Extension } from "@codemirror/state";

/** Editor chrome: background, gutter, cursor, selection. */
const editorChromeTheme = EditorView.theme(
  {
    // No `height` here: the editor's height is owned by the flex chain in
    // App.css (.editor-panel > .cm-editor is flex:1; min-height:0). A `height:
    // 100%` on the editor `&` fights flex:1 — it resolves to the FULL panel
    // height, ignoring the status bar above it, so the editor overflows the
    // (overflow:hidden) panel and content below the clip can't be scrolled to.
    // Dropping it lets flex bound the editor correctly and .cm-scroller scroll
    // both axes (WP3a verify-human, 2026-06-20).
    "&": {
      color: "#d4d4d4",
      backgroundColor: "#1e1e1e",
    },
    ".cm-content": {
      caretColor: "#aeafad",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      // fontSize is NOT set here — it lives in the font-size COMPARTMENT below so
      // Cmd+= / Cmd+- / Cmd+0 can reconfigure it at runtime (WP3a Phase 2). The
      // gutter font-size is tied to it too (fontSizeTheme) so line numbers scale.
    },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#aeafad" },
    "&.cm-focused .cm-cursor": { borderLeftColor: "#aeafad" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection":
      {
        backgroundColor: "#264f78",
      },
    ".cm-gutters": {
      backgroundColor: "#1e1e1e",
      color: "#858585",
      border: "none",
    },
    ".cm-activeLine": { backgroundColor: "rgba(255, 255, 255, 0.04)" },
    ".cm-activeLineGutter": {
      backgroundColor: "rgba(255, 255, 255, 0.06)",
      color: "#c6c6c6",
    },
    ".cm-lineNumbers .cm-gutterElement": { padding: "0 8px 0 6px" },
    // The scroller owns BOTH axes: vertical scroll for tall files, and — now that
    // line-wrapping is off (operator choice, WP3a verify-human) — a horizontal
    // scrollbar when a long line overflows the panel width. `overflow: auto`
    // shows each scrollbar only when needed. For vertical scroll to engage, the
    // editor's height must be bounded by its container (see .editor-panel height
    // chain in App.css), not shrink-wrapped to content.
    ".cm-scroller": { overflow: "auto" },
    // Search/replace panel (@codemirror/search, WP3a) — dark-only, palette-aligned
    // to App.css so the find UI reads as part of Claudesk (no light variant, per
    // CLAUDE.md "Dark mode only").
    ".cm-panels": {
      backgroundColor: "#252526",
      color: "#d4d4d4",
    },
    ".cm-panels.cm-panels-top": { borderBottom: "1px solid #333" },
    ".cm-panels.cm-panels-bottom": { borderTop: "1px solid #333" },
    ".cm-search": { padding: "6px 8px" },
    ".cm-search input, .cm-search button, .cm-search label": {
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: "12px",
    },
    ".cm-search input[type=text]": {
      backgroundColor: "#1e1e1e",
      color: "#d4d4d4",
      border: "1px solid #3c3c3c",
      borderRadius: "3px",
      padding: "2px 6px",
    },
    ".cm-search input[type=text]:focus": {
      outline: "none",
      borderColor: "#6ea8ff",
    },
    ".cm-search button": {
      backgroundColor: "#3a3d41",
      color: "#d4d4d4",
      border: "1px solid #3c3c3c",
      borderRadius: "3px",
      padding: "2px 8px",
      cursor: "pointer",
    },
    ".cm-search button:hover": { backgroundColor: "#45494e" },
    ".cm-button": {
      backgroundColor: "#3a3d41",
      backgroundImage: "none",
      color: "#d4d4d4",
    },
    ".cm-textfield": {
      backgroundColor: "#1e1e1e",
      color: "#d4d4d4",
      border: "1px solid #3c3c3c",
    },
  },
  { dark: true },
);

/**
 * VS Code "Dark+"-flavored syntax colors. Token→color choices mirror VS Code's
 * default dark theme so the editor feels familiar to a daily VS Code / Sublime
 * user (operator's pick at WP2 verify-human).
 */
const editorHighlightStyle = HighlightStyle.define(
  [
    { tag: [t.keyword, t.modifier, t.controlKeyword], color: "#569cd6" },
    { tag: [t.string, t.special(t.string)], color: "#ce9178" },
    {
      tag: [t.function(t.variableName), t.function(t.propertyName)],
      color: "#dcdcaa",
    },
    { tag: [t.number, t.bool, t.null], color: "#b5cea8" },
    {
      tag: [t.comment, t.lineComment, t.blockComment],
      color: "#6a9955",
      fontStyle: "italic",
    },
    { tag: [t.typeName, t.className, t.namespace], color: "#4ec9b0" },
    { tag: [t.propertyName, t.attributeName], color: "#9cdcfe" },
    { tag: [t.variableName], color: "#9cdcfe" },
    {
      tag: [t.operator, t.punctuation, t.bracket, t.separator],
      color: "#d4d4d4",
    },
    { tag: [t.tagName], color: "#569cd6" },
    { tag: [t.constant(t.variableName), t.standard(t.name)], color: "#4fc1ff" },
    { tag: [t.regexp], color: "#d16969" },
    { tag: [t.meta, t.documentMeta], color: "#9b9b9b" },
    { tag: [t.heading], color: "#569cd6", fontWeight: "bold" },
    { tag: [t.link, t.url], color: "#ce9178", textDecoration: "underline" },
    { tag: [t.emphasis], fontStyle: "italic" },
    { tag: [t.strong], fontWeight: "bold" },
    { tag: [t.invalid], color: "#f44747" },
  ],
  { themeType: "dark" },
);

/** The single dark theme extension EditorPanel applies: chrome + syntax colors. */
export const editorDarkTheme: Extension = [
  editorChromeTheme,
  syntaxHighlighting(editorHighlightStyle),
];

/**
 * WP3a Phase 2 — runtime-swappable editor font size. The size lives in its own
 * Compartment so the Cmd+= / Cmd+- / Cmd+0 keybindings can `reconfigure` it
 * without rebuilding the whole editor. Both the content and the gutter (line
 * numbers) scale together so the layout stays aligned at any zoom.
 */
export const fontSizeCompartment = new Compartment();

/** The font-size theme extension for a given px — fed into the compartment. */
export function fontSizeTheme(px: number): Extension {
  const fontSize = `${px}px`;
  return EditorView.theme({
    ".cm-content": { fontSize },
    ".cm-gutters": { fontSize },
  });
}
