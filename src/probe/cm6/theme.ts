// WP1 probe — minimal CM6 dark theme (no extra dep; project is dark-only).
// THROWAWAY probe code. WP2 will decide the real theme extension.
import { EditorView } from "@codemirror/view";

export const oneDarkTheme = EditorView.theme(
  {
    "&": { color: "#ddd", backgroundColor: "#1a1a1a" },
    ".cm-content": {
      caretColor: "#9cf",
      fontFamily: "ui-monospace, monospace",
    },
    ".cm-gutters": {
      backgroundColor: "#161616",
      color: "#666",
      border: "none",
    },
    ".cm-activeLine": { backgroundColor: "#222" },
    ".cm-activeLineGutter": { backgroundColor: "#222" },
    "&.cm-focused .cm-cursor": { borderLeftColor: "#9cf" },
    "&.cm-focused .cm-selectionBackground, ::selection": {
      backgroundColor: "#264f78",
    },
  },
  { dark: true },
);
