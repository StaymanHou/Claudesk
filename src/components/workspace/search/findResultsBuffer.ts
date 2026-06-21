// WP7 Phase 2 — pure formatter for the Sublime-style "Find Results" tab.
//
// The operator chose (2026-06-21) the Sublime "Find in Files" result UX: search
// results render into a read-only synthetic editor TAB (the WP12 seam), NOT a floating
// overlay list. This module turns the backend's grouped `FileMatches[]` into that tab's
// TEXT BUFFER plus a parallel `lineMap` so a click on a buffer line resolves back to the
// match it represents — `SyntheticView` reports clicks as 1-based buffer line numbers,
// and `RightPanelHost` looks up `lineMap[clickedLine - 1]` to open the file at the match.
//
// Pure (no React, no DOM, no IPC) → vitest-testable (repo posture: pure logic → vitest,
// live DOM → Playwright; mirrors searchModel.ts / openFiles.ts / paletteCommands.ts).
//
// BUFFER LAYOUT (one entry in `lineMap` per buffer line, index = lineNumber - 1):
//
//   Searching 142 files for "openFile"        ← header        (lineMap: null)
//                                              ← blank         (lineMap: null)
//   src/components/workspace/RightPanelHost.tsx:  ← file header (lineMap: null)
//      96:  const openFile = (path, target) => {  ← match row   (lineMap: {file, match})
//      99:    editorSplitRef.current?.openFile(path);  ← match row (lineMap: {file, match})
//                                              ← blank         (lineMap: null)
//   src/components/workspace/finder/FileFinder.tsx:  ← file header (lineMap: null)
//      41:    onOpen={openFile}               ← match row     (lineMap: {file, match})
//                                              ← blank         (lineMap: null)
//   2 matches across 2 files                   ← footer        (lineMap: null)
//
// Only MATCH rows are clickable; header / file-header / blank / footer lines map to null
// (a click there is a no-op). `text` and `lineMap` are always the same length in lines.
//
// `highlights` carries the absolute char-offset span of the matched text WITHIN each
// match row (the row prefix `   <line>:  ` plus the byte→char-converted hit offset) — the
// synthetic view marks these so the matched substring stands out like Sublime's Find
// Results (WP7 verify-human, 2026-06-21).

import {
  byteOffsetToCharIndex,
  totalMatchCount,
  type FileMatches,
  type LineMatch,
} from "./searchModel";

/** A clickable match row's payload: which file + which match it represents. */
export interface FlatMatch {
  /** Project-relative POSIX path of the file the match is in. */
  file: string;
  /** The match (line number + byte range + line text) — fed to `matchTargetFor`. */
  match: LineMatch;
}

/**
 * An absolute-offset span in the buffer text to mark as a search hit. `from`/`to` are
 * 0-based character offsets into the full `text` (newlines counted as one char each) —
 * directly usable as CM6 `Decoration.mark` ranges in the synthetic view. (Mirrors
 * Sublime's highlighted matched text in its Find Results panel.)
 */
export interface HighlightRange {
  from: number;
  to: number;
}

/** The formatted Find Results buffer: text + per-line click map + match-hit highlights. */
export interface FindResultsBuffer {
  /** The full buffer text rendered into the synthetic tab. */
  text: string;
  /**
   * One entry per buffer line (index = 1-based line number - 1). A `FlatMatch` for a
   * clickable match row, or `null` for a header / file-header / blank / footer line.
   */
  lineMap: (FlatMatch | null)[];
  /**
   * Absolute char-offset spans of the matched text within each match row — for the
   * synthetic view to highlight the hit (the matched substring, not the whole row).
   */
  highlights: HighlightRange[];
}

/**
 * Count + pluralized noun — "1 file" / "2 files", "1 match" / "2 matches". Handles the
 * two nouns this buffer needs (file → files, match → matches); not a general pluralizer.
 */
function plural(n: number, noun: "file" | "match"): string {
  if (n === 1) return `${n} ${noun}`;
  return `${n} ${noun === "match" ? "matches" : `${noun}s`}`;
}

/**
 * Format grouped search results into the Find Results tab buffer + its line→match map.
 *
 * `query.pattern` is echoed in the header so the operator sees what was searched. An
 * empty `results` produces a header + a "No matches" body (still a valid, clickable-free
 * buffer) so the tab never renders blank after a no-match search.
 */
export function formatFindResults(
  results: FileMatches[],
  query: { pattern: string },
): FindResultsBuffer {
  const lines: string[] = [];
  const lineMap: (FlatMatch | null)[] = [];
  const highlights: HighlightRange[] = [];

  // Running 0-based char offset of the START of the line about to be pushed. Each push
  // advances it by the line's char length + 1 for the joining newline — so a match row's
  // highlight offset = (this line's start) + (prefix char length) + (char offset of the
  // hit within line_text). Tracking it here keeps the highlight math co-located with the
  // exact layout that produces it (no second source of truth for the row prefix).
  let offset = 0;
  const push = (
    text: string,
    entry: FlatMatch | null,
    highlight?: HighlightRange,
  ) => {
    lines.push(text);
    lineMap.push(entry);
    if (highlight) highlights.push(highlight);
    offset += text.length + 1; // +1 for the "\n" that join() inserts between lines
  };

  const fileCount = results.length;
  const matchCount = totalMatchCount(results);

  // Header — echoes the pattern + the searched-file count (Sublime parity).
  push(`Searching ${plural(fileCount, "file")} for "${query.pattern}"`, null);
  push("", null);

  if (fileCount === 0) {
    push("No matches", null);
    return { text: lines.join("\n"), lineMap, highlights };
  }

  for (const fileGroup of results) {
    push(`${fileGroup.file}:`, null);
    for (const match of fileGroup.matches) {
      // "   <line>:  <line text>" — the line number is right-context, the text follows.
      // Leading spaces indent the row under its file header (Sublime layout).
      const prefix = `   ${match.line}:  `;
      const rowStart = offset; // captured BEFORE push advances `offset`
      // The hit's char range within line_text (byte→char converted, exact for multi-byte
      // lines), shifted by this row's start + the prefix length to absolute buffer chars.
      const hitFrom =
        rowStart +
        prefix.length +
        byteOffsetToCharIndex(match.line_text, match.start);
      const hitTo =
        rowStart +
        prefix.length +
        byteOffsetToCharIndex(match.line_text, match.end);
      push(
        `${prefix}${match.line_text}`,
        { file: fileGroup.file, match },
        {
          from: hitFrom,
          to: hitTo,
        },
      );
    }
    push("", null); // blank separator after each file group
  }

  // Footer — total match/file summary (also drives the overlay-free count).
  push(
    `${plural(matchCount, "match")} across ${plural(fileCount, "file")}`,
    null,
  );

  return { text: lines.join("\n"), lineMap, highlights };
}
