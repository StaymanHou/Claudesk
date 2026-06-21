import { describe, it, expect } from "vitest";
import {
  byteOffsetToCharIndex,
  matchTargetFor,
  totalMatchCount,
  type FileMatches,
  type LineMatch,
} from "../searchModel";

describe("byteOffsetToCharIndex — backend byte offset → JS UTF-16 index", () => {
  it("is identity for pure-ASCII lines", () => {
    const line = "let foo = 1;";
    expect(byteOffsetToCharIndex(line, 4)).toBe(4); // start of "foo"
    expect(byteOffsetToCharIndex(line, 7)).toBe(7); // end of "foo"
  });

  it("clamps a non-positive offset to 0", () => {
    expect(byteOffsetToCharIndex("abc", 0)).toBe(0);
    expect(byteOffsetToCharIndex("abc", -5)).toBe(0);
  });

  it("accounts for a multi-byte char BEFORE the match (é = 2 bytes)", () => {
    // "café foo": 'café' is c(1)a(1)f(1)é(2) = 5 bytes, then space(1) = byte 6 is 'f'.
    // As a JS string, 'café ' is 5 chars (é is 1 UTF-16 unit), so char index 5.
    const line = "café foo";
    expect(byteOffsetToCharIndex(line, 6)).toBe(5); // byte 6 → char 5 = start of "foo"
  });

  it("accounts for a 3-byte char before the match (→ = 3 bytes)", () => {
    // "→ x": '→' is 3 bytes + space(1) = byte 4 is 'x'; as JS chars '→ ' is 2 chars.
    const line = "→ x";
    expect(byteOffsetToCharIndex(line, 4)).toBe(2);
  });

  it("handles an astral char (emoji = 4 bytes, 2 UTF-16 units) before the match", () => {
    // "😀x": emoji is 4 bytes; byte 4 is 'x'. As a JS string the emoji is 2 code
    // units, so 'x' is at char index 2.
    const line = "😀x";
    expect(byteOffsetToCharIndex(line, 4)).toBe(2);
  });

  it("clamps an offset past the end to the string length", () => {
    expect(byteOffsetToCharIndex("abc", 999)).toBe(3);
  });
});

describe("matchTargetFor — LineMatch → editor HighlightTarget", () => {
  it("passes the 1-based line through and converts byte cols to char cols", () => {
    const m: LineMatch = {
      line: 12,
      start: 4,
      end: 7,
      line_text: "let foo = 1;",
    };
    expect(matchTargetFor(m)).toEqual({ line: 12, startCol: 4, endCol: 7 });
  });

  it("converts cols for a multi-byte line", () => {
    // "café foo" — match "foo" is bytes [6,9); chars [5,8).
    const m: LineMatch = { line: 3, start: 6, end: 9, line_text: "café foo" };
    expect(matchTargetFor(m)).toEqual({ line: 3, startCol: 5, endCol: 8 });
  });
});

describe("totalMatchCount", () => {
  it("sums matches across all file groups", () => {
    const results: FileMatches[] = [
      {
        file: "a.ts",
        matches: [
          { line: 1, start: 0, end: 3, line_text: "foo" },
          { line: 5, start: 0, end: 3, line_text: "foo" },
        ],
      },
      {
        file: "b.ts",
        matches: [{ line: 2, start: 1, end: 4, line_text: "xfoo" }],
      },
    ];
    expect(totalMatchCount(results)).toBe(3);
  });

  it("is 0 for an empty result set", () => {
    expect(totalMatchCount([])).toBe(0);
  });
});

describe("IPC wire-shape contract (regression: WP7 P2 verify-human BLOCKING)", () => {
  // The backend `project_search` command returns serde-serialized snake_case keys
  // (Tauri does NOT camelCase-convert return values). This test feeds a literal of
  // EXACTLY that shape — as it arrives over IPC — through the consuming code path, so
  // a future rename that drifts the field name away from the backend fails here
  // instead of white-screening the app (SURFACE-2026-06-21-IPC-DTO-FIELD-CASE-…).
  // The `line_text` key (snake_case) is the load-bearing assertion.
  const fromBackend = JSON.parse(
    '[{"file":"src/main.rs","matches":[{"line":12,"start":4,"end":7,"line_text":"let foo = 1;"}]}]',
  ) as FileMatches[];

  it("matchTargetFor reads the snake_case `line_text` field off a real IPC payload", () => {
    const m = fromBackend[0].matches[0];
    // If the field were misnamed (e.g. lineText), m.line_text would be undefined and
    // byteOffsetToCharIndex would throw — the exact Phase-2 crash this pins against.
    expect(m.line_text).toBe("let foo = 1;");
    expect(matchTargetFor(m)).toEqual({ line: 12, startCol: 4, endCol: 7 });
  });

  it("totalMatchCount handles a real IPC payload", () => {
    expect(totalMatchCount(fromBackend)).toBe(1);
  });
});
