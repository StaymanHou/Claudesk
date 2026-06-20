// WP2 — pure mapping from a file extension to the CodeMirror 6 language extension
// to load. No React, no IPC — unit-testable under vitest (the repo's frontend
// posture: pure logic is unit-tested, live DOM is Playwright-verified).
//
// Only the language packs actually installed are imported, so the editor bundle
// tree-shakes to the languages we support. An unknown extension returns `[]`
// (plaintext — CM6 renders fine with no language extension). See the
// single-source-of-truth note below for how to add a language.

import { javascript } from "@codemirror/lang-javascript";
import { rust } from "@codemirror/lang-rust";
import { markdown } from "@codemirror/lang-markdown";
import type { Extension } from "@codemirror/state";

// SINGLE SOURCE OF TRUTH for language packs: `languageForId` owns the only
// id → Extension switch. The two entry paths both route through it —
// `languageForExtension` maps a file extension to a canonical mode id (via
// `idForExtension`) then delegates, and the palette calls `languageForId`
// directly (WP3b). Adding a language = one pack import + one `languageForId`
// arm + (if extension-detectable) one `idForExtension` row + (if palette-
// selectable) one `SYNTAX_MODES` row. No duplicated pack-construction arms.

/** A selectable syntax mode for the palette: stable id + display label. */
export interface SyntaxMode {
  id: string;
  label: string;
}

/** The ordered syntax modes the palette offers (display order = this order). */
export const SYNTAX_MODES: readonly SyntaxMode[] = [
  { id: "javascript", label: "JavaScript" },
  { id: "jsx", label: "JavaScript (JSX)" },
  { id: "typescript", label: "TypeScript" },
  { id: "tsx", label: "TypeScript (TSX)" },
  { id: "rust", label: "Rust" },
  { id: "markdown", label: "Markdown" },
  { id: "plaintext", label: "Plain Text" },
];

/**
 * Canonical mode id for a language pack. The ONLY place pack constructors live.
 * Used by both the palette (`languageForId`) and extension detection
 * (`languageForExtension` → `idForExtension` → here). Unknown id → plaintext ([]).
 */
export function languageForId(id: string): Extension {
  switch (id) {
    case "javascript":
      return javascript();
    case "jsx":
      return javascript({ jsx: true });
    case "typescript":
      return javascript({ typescript: true });
    case "tsx":
      return javascript({ jsx: true, typescript: true });
    case "rust":
      return rust();
    case "markdown":
      return markdown();
    default:
      return []; // "plaintext" + any unknown id
  }
}

/** Lowercased file extension (no dot) → canonical mode id, or "plaintext". */
function idForExtension(ext: string): string {
  switch (ext.toLowerCase()) {
    case "js":
    case "cjs":
    case "mjs":
      return "javascript";
    case "jsx":
      return "jsx";
    case "ts":
    case "cts":
    case "mts":
      return "typescript";
    case "tsx":
      return "tsx";
    case "rs":
      return "rust";
    case "md":
    case "markdown":
    case "mdx":
      return "markdown";
    default:
      return "plaintext";
  }
}

/** Lowercased extension (no dot) → the CM6 language extension(s) for that file. */
export function languageForExtension(ext: string): Extension {
  return languageForId(idForExtension(ext));
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
