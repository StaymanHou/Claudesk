// WP7 Phase 2 — pure core for the project-wide search overlay.
//
// APP-LAYER subsystem (research.md correction): the backend `project_search` command
// does the ripgrep-style content search and returns matches already grouped by file.
// This module holds the React-free, DOM-free pieces so they are vitest-testable
// (repo posture: pure logic → vitest, live DOM → Playwright):
//   - the result types mirroring the backend's FileMatches / LineMatch,
//   - the SearchQuery the overlay sends,
//   - byteOffsetToCharIndex: converts the backend's BYTE match offsets into JS
//     string (UTF-16) indices so the editor can position a selection exactly,
//   - matchTargetFor: builds the open-with-highlight target passed through openFile.
//
// WHY the byte→char conversion: the Rust `regex` crate reports match offsets as BYTE
// positions within the line (m.start()/m.end() into a &str). JS strings are UTF-16,
// so for any line with a multi-byte char (é, →, emoji) BEFORE the match, the raw byte
// offset would mis-position the highlight. TextEncoder makes the conversion exact and
// is itself pure (no DOM). For pure-ASCII lines byte index == char index, so the
// common code-search case is a no-op.

/** One match within a file — mirrors the backend `LineMatch` (byte offsets). */
export interface LineMatch {
  /** 1-based line number. */
  line: number;
  /** Byte offset of the match start within `line_text` (0-based). */
  start: number;
  /** Byte offset one past the match end within `line_text`. */
  end: number;
  /**
   * The full text of the matched line (no trailing newline). snake_case to MIRROR
   * the backend serde field name VERBATIM — Tauri does not camelCase-convert command
   * return values, so this must match Rust's `LineMatch::line_text` exactly (the
   * codebase convention: IPC DTOs are snake_case end-to-end, same as git_diff /
   * fs_index). Reading it as `lineText` returns undefined → render crash (the WP7
   * Phase-2 verify-human BLOCKING; SURFACE-2026-06-21-IPC-DTO-FIELD-CASE-…).
   */
  line_text: string;
}

/** All matches in a single file — mirrors the backend `FileMatches`. */
export interface FileMatches {
  /** Project-relative POSIX path. */
  file: string;
  matches: LineMatch[];
}

/** The search request sent to the backend `project_search` command. */
export interface SearchQuery {
  pattern: string;
  regex: boolean;
  caseSensitive: boolean;
  wholeWord: boolean;
}

/**
 * The open-with-highlight target threaded through `openFile`. Line is 1-based; col
 * offsets are JS-string (UTF-16) indices INTO the matched line (already converted
 * from the backend's byte offsets), so the editor can map them to an absolute doc
 * position via the CM6 line API.
 */
export interface HighlightTarget {
  /** 1-based line number. */
  line: number;
  /** Char (UTF-16) index of the match start within the line. */
  startCol: number;
  /** Char (UTF-16) index one past the match end within the line. */
  endCol: number;
}

/**
 * Convert a BYTE offset within `lineText` (as the Rust `regex` crate reports it) to a
 * JS-string (UTF-16) char index. Pure — uses TextEncoder, no DOM.
 *
 * Walks the string counting the UTF-8 byte length of each code point until the byte
 * budget is reached. For pure-ASCII text this returns the same number (1 byte/char).
 * A byteOffset past the end clamps to the string length (defensive).
 */
export function byteOffsetToCharIndex(
  lineText: string,
  byteOffset: number,
): number {
  if (byteOffset <= 0) return 0;
  const encoder = new TextEncoder();
  let bytes = 0;
  // Iterating the string yields whole code points (handles surrogate pairs), so a
  // 4-byte emoji advances charIndex by its UTF-16 length (2) correctly.
  let charIndex = 0;
  for (const ch of lineText) {
    if (bytes >= byteOffset) break;
    bytes += encoder.encode(ch).length;
    charIndex += ch.length; // UTF-16 code units (1 for BMP, 2 for astral)
  }
  return charIndex;
}

/**
 * Build the editor highlight target for a single match: the 1-based line plus the
 * match's char-offset range within that line (byte→char converted). The editor adds
 * the document-line base offset to land the selection on the exact match.
 */
export function matchTargetFor(m: LineMatch): HighlightTarget {
  return {
    line: m.line,
    startCol: byteOffsetToCharIndex(m.line_text, m.start),
    endCol: byteOffsetToCharIndex(m.line_text, m.end),
  };
}

/** Total match count across all files (for the result summary + replace-all count). */
export function totalMatchCount(results: FileMatches[]): number {
  return results.reduce((sum, f) => sum + f.matches.length, 0);
}

/**
 * Count + pluralized noun for the search/replace surfaces — "1 file" / "2 files",
 * "1 match" / "2 matches". Handles only the two nouns these surfaces need (file →
 * files, match → matches); NOT a general pluralizer. Shared by findResultsBuffer (the
 * Find Results header/footer) + replaceConfirm (the Replace-All blast-radius message)
 * so the two don't keep parallel copies.
 */
export function pluralCount(n: number, noun: "file" | "match"): string {
  if (n === 1) return `${n} ${noun}`;
  return `${n} ${noun === "match" ? "matches" : `${noun}s`}`;
}
