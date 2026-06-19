// WP2 — pure mapping from a file extension to the CodeMirror 6 language extension
// to load. No React, no IPC — unit-testable under vitest (the repo's frontend
// posture: pure logic is unit-tested, live DOM is Playwright-verified).
//
// Only the language packs actually installed are imported, so the editor bundle
// tree-shakes to the languages we support. Adding a language = one import + one
// row here. An unknown extension returns `[]` (plaintext — CM6 renders fine with
// no language extension).

import { javascript } from "@codemirror/lang-javascript";
import { rust } from "@codemirror/lang-rust";
import { markdown } from "@codemirror/lang-markdown";
import type { Extension } from "@codemirror/state";

/** Lowercased extension (no dot) → the CM6 language extension(s) for that file. */
export function languageForExtension(ext: string): Extension {
  switch (ext.toLowerCase()) {
    case "js":
    case "cjs":
    case "mjs":
      return javascript();
    case "jsx":
      return javascript({ jsx: true });
    case "ts":
    case "cts":
    case "mts":
      return javascript({ typescript: true });
    case "tsx":
      return javascript({ jsx: true, typescript: true });
    case "rs":
      return rust();
    case "md":
    case "markdown":
    case "mdx":
      return markdown();
    default:
      return []; // plaintext — no language extension
  }
}

/** Extract the lowercased extension from a path/filename, or "" if none. */
export function extensionOf(pathOrName: string): string {
  // Strip any directory portion, then take the substring after the last dot.
  // A leading-dot filename (".gitignore") has no extension.
  const base = pathOrName.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return ""; // no dot, or dotfile with no further extension
  return base.slice(dot + 1).toLowerCase();
}

/** Convenience: language extension for a full path/filename. */
export function languageForPath(pathOrName: string): Extension {
  return languageForExtension(extensionOf(pathOrName));
}
