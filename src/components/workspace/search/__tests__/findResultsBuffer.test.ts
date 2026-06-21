// WP7 Phase 2 — tests for the pure Find Results buffer formatter.

import { describe, it, expect } from "vitest";
import { formatFindResults, type FlatMatch } from "../findResultsBuffer";
import { matchTargetFor, type FileMatches } from "../searchModel";

/** Build a LineMatch terse-ly (byte range defaults don't matter for layout tests). */
function m(line: number, line_text: string, start = 0, end = 0) {
  return { line, start, end, line_text };
}

describe("formatFindResults", () => {
  it("renders the Sublime-style layout for a single file", () => {
    const results: FileMatches[] = [
      {
        file: "src/a.ts",
        matches: [m(12, "const openFile = 1"), m(20, "openFile()")],
      },
    ];
    const { text } = formatFindResults(results, { pattern: "openFile" });
    expect(text).toBe(
      [
        'Searching 1 file for "openFile"',
        "",
        "src/a.ts:",
        "   12:  const openFile = 1",
        "   20:  openFile()",
        "",
        "2 matches across 1 file",
      ].join("\n"),
    );
  });

  it("groups multiple files with a blank separator and a multi-file footer", () => {
    const results: FileMatches[] = [
      { file: "src/a.ts", matches: [m(1, "aaa")] },
      { file: "src/b.ts", matches: [m(2, "bbb"), m(3, "ccc")] },
    ];
    const { text } = formatFindResults(results, { pattern: "x" });
    expect(text).toBe(
      [
        'Searching 2 files for "x"',
        "",
        "src/a.ts:",
        "   1:  aaa",
        "",
        "src/b.ts:",
        "   2:  bbb",
        "   3:  ccc",
        "",
        "3 matches across 2 files",
      ].join("\n"),
    );
  });

  it("maps each match ROW to its {file, match} and every other line to null", () => {
    const results: FileMatches[] = [
      { file: "src/a.ts", matches: [m(12, "first"), m(20, "second")] },
      { file: "src/b.ts", matches: [m(5, "third")] },
    ];
    const { text, lineMap } = formatFindResults(results, { pattern: "p" });

    // lineMap is parallel to the buffer's lines.
    expect(lineMap).toHaveLength(text.split("\n").length);

    // The header, blank, file-header, blank, and footer lines are non-clickable.
    const clickable = lineMap
      .map((entry, i) => ({ entry, line: i + 1 }))
      .filter((x): x is { entry: FlatMatch; line: number } => x.entry !== null);

    expect(clickable.map((c) => c.entry.file)).toEqual([
      "src/a.ts",
      "src/a.ts",
      "src/b.ts",
    ]);
    expect(clickable.map((c) => c.entry.match.line)).toEqual([12, 20, 5]);

    // Spot-check: the very first buffer line (the header) is null, not a match.
    expect(lineMap[0]).toBeNull();
    // The line after the header is the blank → null.
    expect(lineMap[1]).toBeNull();
    // Line 3 is "src/a.ts:" (file header) → null.
    expect(lineMap[2]).toBeNull();
    // Line 4 is the first match row → src/a.ts line 12.
    expect(lineMap[3]).toEqual({ file: "src/a.ts", match: m(12, "first") });
    // The last buffer line (footer) is null.
    expect(lineMap[lineMap.length - 1]).toBeNull();
  });

  it("renders a header + 'No matches' body (no clickable lines) for empty results", () => {
    const { text, lineMap, highlights } = formatFindResults([], {
      pattern: "nope",
    });
    expect(text).toBe(
      ['Searching 0 files for "nope"', "", "No matches"].join("\n"),
    );
    expect(lineMap.every((e) => e === null)).toBe(true);
    expect(highlights).toEqual([]);
  });

  it("emits a highlight span whose buffer slice is exactly the matched text", () => {
    // "openFile" starts at byte 6 of "const openFile = 1" and is 8 chars long.
    const results: FileMatches[] = [
      { file: "src/a.ts", matches: [m(12, "const openFile = 1", 6, 14)] },
    ];
    const { text, highlights } = formatFindResults(results, {
      pattern: "openFile",
    });
    expect(highlights).toHaveLength(1);
    // The absolute span, sliced out of the buffer, is the matched word — proves the
    // prefix-length + line-start offset math (not just a relative range).
    expect(text.slice(highlights[0].from, highlights[0].to)).toBe("openFile");
  });

  it("offsets multi-byte hits correctly (byte→char) across multiple match rows", () => {
    // Line 1: a multi-byte char ('→', 3 bytes / 1 UTF-16 unit) precedes the hit, so the
    // raw byte offset would mis-place it; byteOffsetToCharIndex must correct it.
    const results: FileMatches[] = [
      { file: "f.ts", matches: [m(1, "x → hit", 6, 9)] }, // "hit" at byte 6 (x=1,space=1,→=3,space=1)
    ];
    const { text, highlights } = formatFindResults(results, { pattern: "hit" });
    expect(highlights).toHaveLength(1);
    expect(text.slice(highlights[0].from, highlights[0].to)).toBe("hit");
  });

  // Codify the click→open contract (the bridge RightPanelHost performs): a clicked
  // buffer LINE resolves via lineMap to the right {file, match}, and matchTargetFor on it
  // yields the open-at-match target. This pins that the formatter's lineMap indexing and
  // the synthetic view's 1-based click line agree — the heart of the Find-Results-tab UX.
  it("resolves a clicked buffer line through lineMap to the correct open-at-match target", () => {
    const results: FileMatches[] = [
      { file: "src/a.ts", matches: [m(12, "const openFile = 1", 6, 14)] },
      { file: "src/b.ts", matches: [m(5, "openFile()", 0, 8)] },
    ];
    const { lineMap } = formatFindResults(results, { pattern: "openFile" });

    // Buffer: 1=header, 2=blank, 3="src/a.ts:", 4=match(a:12), 5=blank, 6="src/b.ts:",
    // 7=match(b:5). A click on buffer line 7 (1-based) → lineMap[6].
    const clickedLine = 7;
    const hit = lineMap[clickedLine - 1] as FlatMatch;
    expect(hit.file).toBe("src/b.ts");
    expect(matchTargetFor(hit.match)).toEqual({
      line: 5,
      startCol: 0,
      endCol: 8,
    });

    // A click on a NON-match line (the blank at buffer line 5) resolves to null → no-op.
    expect(lineMap[5 - 1]).toBeNull();
  });
});
