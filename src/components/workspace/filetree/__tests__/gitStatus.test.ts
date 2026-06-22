import { describe, expect, it } from "vitest";
import { statusClass, statusGlyph, type GitFileStatus } from "../gitStatus";

describe("statusGlyph (WP11 — git status → tree-row glyph)", () => {
  it("maps each status to its sidebar glyph", () => {
    expect(statusGlyph("modified")).toBe("M");
    expect(statusGlyph("added")).toBe("A");
    expect(statusGlyph("untracked")).toBe("U");
    expect(statusGlyph("deleted")).toBe("D");
    expect(statusGlyph("renamed")).toBe("R");
  });

  it("distinguishes untracked (U) from added (A)", () => {
    // A new-but-staged file vs a never-added file read differently.
    expect(statusGlyph("untracked")).not.toBe(statusGlyph("added"));
  });

  it("returns null for clean/undefined (no indicator)", () => {
    expect(statusGlyph(undefined)).toBeNull();
  });
});

describe("statusClass (WP11 — git status → CSS modifier)", () => {
  it("maps each status to its modifier class", () => {
    expect(statusClass("modified")).toBe("file-tree-status--modified");
    expect(statusClass("added")).toBe("file-tree-status--added");
    expect(statusClass("untracked")).toBe("file-tree-status--untracked");
    expect(statusClass("deleted")).toBe("file-tree-status--deleted");
    expect(statusClass("renamed")).toBe("file-tree-status--renamed");
  });

  it("returns null for clean/undefined (no class, no indicator)", () => {
    expect(statusClass(undefined)).toBeNull();
  });

  it("glyph and class agree on which statuses have an indicator", () => {
    // Both must return null together (clean) or non-null together (changed).
    const all: (GitFileStatus | undefined)[] = [
      "modified",
      "added",
      "deleted",
      "renamed",
      "untracked",
      undefined,
    ];
    for (const s of all) {
      expect(statusGlyph(s) === null).toBe(statusClass(s) === null);
    }
  });
});
