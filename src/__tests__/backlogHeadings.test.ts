import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ═══════════════════════════════════════════════════════════════════════════════
// THE BACKLOG'S `## ` HEADINGS ARE WELL-FORMED AND UNIQUE.
//
// Closing skills find a backlog item by its heading and delete the block under it. A duplicated
// heading means a resolve can delete the wrong copy and leave the other standing, and a mangled
// one (a stray backtick, a lowercased id) is an item no `grep` for its ID will ever find. Both
// have happened in edits to this file; nothing else checks it, since it is prose to every gate.
//
// ⚠️ What this does NOT check: the body under a heading, `#`/`###` lines, or that a resolved
// item was deleted (that is the closing skill's invariant, upstream).
// ═══════════════════════════════════════════════════════════════════════════════

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");

const SURFACE = /^## SURFACE-\d{4}-\d{2}-\d{2}-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

/** Every shape a `## ` line in `backlog.md` may take. */
const BACKLOG_SHAPES = [
  SURFACE,
  /^## Code-quality findings — [a-z0-9][a-z0-9.-]*[a-z0-9] \(\d{4}-\d{2}-\d{2}\)$/,
  /^## Buried$/,
  /^## Session Handoff — \S.*$/,
];

const headings = (text: string) =>
  text.split("\n").filter((line) => line.startsWith("## "));

/** Headings that match none of `shapes`. */
function malformed(text: string, shapes: RegExp[]): string[] {
  return headings(text).filter((h) => !shapes.some((re) => re.test(h)));
}

/** Headings that occur more than once (each reported once). */
function duplicated(text: string): string[] {
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const h of headings(text)) (seen.has(h) ? dups : seen).add(h);
  return [...dups];
}

const FILES: { rel: string; shapes: RegExp[] }[] = [
  { rel: "workflow-system/state/backlog.md", shapes: BACKLOG_SHAPES },
  {
    rel: "workflow-system/state/backlog-quality-findings.md",
    shapes: [SURFACE],
  },
];

describe("⚠️ backlog headings", () => {
  for (const { rel, shapes } of FILES) {
    it(`every \`## \` heading in ${rel} has an expected shape`, () => {
      expect(malformed(read(rel), shapes)).toEqual([]);
    });
    it(`no \`## \` heading in ${rel} occurs twice`, () => {
      expect(duplicated(read(rel))).toEqual([]);
    });
    it(`${rel} is not vacuous: it has SURFACE headings to check`, () => {
      expect(
        headings(read(rel)).filter((h) => SURFACE.test(h)).length,
      ).toBeGreaterThan(0);
    });
  }
});

describe("the heading checks catch what they exist for (positive controls)", () => {
  const good = "## SURFACE-2026-11-09-SOME-ITEM\n- body\n\n## Buried\n";

  it("accepts a well-formed file", () => {
    expect(malformed(good, BACKLOG_SHAPES)).toEqual([]);
    expect(duplicated(good)).toEqual([]);
  });

  it("a planted duplicate heading is reported", () => {
    const text = `${good}\n## SURFACE-2026-11-09-SOME-ITEM\n- a second copy\n`;
    expect(duplicated(text)).toEqual(["## SURFACE-2026-11-09-SOME-ITEM"]);
  });

  it.each([
    "## `SURFACE-2026-11-09-SOME-ITEM`",
    "## ` heading with a stray backtick",
    "## SURFACE-2026-11-09-some-item",
    "## SURFACE-26-11-09-SOME-ITEM",
    "## Code-quality findings — some-slug (2026-11-9)",
  ])("a mangled heading is reported: %s", (bad) => {
    expect(malformed(`${good}\n${bad}\n`, BACKLOG_SHAPES)).toEqual([bad]);
  });
});
