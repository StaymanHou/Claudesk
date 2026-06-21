import { describe, it, expect } from "vitest";
import { fuzzyMatch, rankFiles } from "../fuzzyMatch";

describe("fuzzyMatch — subsequence scoring", () => {
  it("matches a contiguous substring", () => {
    expect(fuzzyMatch("read", "readme.md")).not.toBeNull();
  });

  it("matches a non-contiguous subsequence", () => {
    // r-a-d appear in order in "readme.md"
    expect(fuzzyMatch("rad", "readme.md")).not.toBeNull();
  });

  it("returns null when the query is not a subsequence", () => {
    expect(fuzzyMatch("xyz", "readme.md")).toBeNull();
    // right chars, wrong order:
    expect(fuzzyMatch("dr", "readme.md")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(fuzzyMatch("README", "src/readme.md")).not.toBeNull();
    expect(fuzzyMatch("readme", "src/README.md")).not.toBeNull();
  });

  it("empty / whitespace query scores 0 (matches everything)", () => {
    expect(fuzzyMatch("", "anything.ts")).toBe(0);
    expect(fuzzyMatch("   ", "anything.ts")).toBe(0);
  });

  it("scores a segment-boundary match higher than a buried match", () => {
    // 'f' at the start of the basename ("file.ts") beats 'f' buried in "buffer.ts"
    const boundary = fuzzyMatch("f", "src/file.ts")!;
    const buried = fuzzyMatch("f", "src/buffer.ts")!;
    expect(boundary).toBeGreaterThan(buried);
  });

  it("scores a basename match higher than a same-depth directory-only match", () => {
    // Both have "util" as a mid-path segment-boundary match at the SAME depth and
    // not at start-of-string; the difference is basename ("util.ts") vs directory
    // ("util/x.ts") — the basename bonus is what should tip it.
    const inName = fuzzyMatch("util", "src/util.ts")!;
    const inDir = fuzzyMatch("util", "src/util/x.ts")!;
    expect(inName).toBeGreaterThan(inDir);
  });
});

describe("rankFiles — ordering + tiebreaks", () => {
  const files = [
    "src/components/workspace/finder/FileFinder.tsx",
    "src/components/workspace/finder/fuzzyMatch.ts",
    "src/finder.ts",
    "README.md",
    "package.json",
  ];

  it("returns only matches, best-first", () => {
    const out = rankFiles("finder", files);
    expect(out.length).toBeGreaterThan(0);
    // shortest path containing 'finder' as a segment-boundary basename wins
    expect(out[0].path).toBe("src/finder.ts");
    // scores are non-increasing
    for (let i = 1; i < out.length; i++) {
      expect(out[i - 1].score).toBeGreaterThanOrEqual(out[i].score);
    }
  });

  it("drops non-matches", () => {
    const out = rankFiles("zzzz", files);
    expect(out).toEqual([]);
  });

  it("empty query returns all files sorted by path", () => {
    const out = rankFiles("", files);
    expect(out.map((m) => m.path)).toEqual([...files].sort());
  });

  it("shorter path wins on an otherwise-equal match", () => {
    const out = rankFiles("fuzzy", [
      "src/components/workspace/finder/fuzzyMatch.ts",
      "fuzzy.ts",
    ]);
    expect(out[0].path).toBe("fuzzy.ts");
  });

  it("respects the limit (bounds rendered rows)", () => {
    const many = Array.from({ length: 50 }, (_, i) => `file${i}.ts`);
    const out = rankFiles("file", many, 10);
    expect(out).toHaveLength(10);
  });

  it("limit -1 returns all matches (unbounded)", () => {
    const many = Array.from({ length: 50 }, (_, i) => `file${i}.ts`);
    const out = rankFiles("file", many, -1);
    expect(out).toHaveLength(50);
  });
});
