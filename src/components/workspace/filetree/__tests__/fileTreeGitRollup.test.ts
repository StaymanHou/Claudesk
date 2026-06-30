import { describe, expect, it } from "vitest";
// Vite ?raw import: bundles the FileTree source text at test time (repo posture —
// pure logic → vitest, live DOM → Playwright/operator verify-human; same ?raw trick as
// autofocusCcOnPromote.test.ts / workspaceOffViewport.test.ts). The live "a collapsed
// folder hiding a changed file shows a roll-up marker" check is the QoL-WP7 verify-human
// Browser observable outcome; these structural assertions pin the wiring so a future
// edit can't silently sever it. (The roll-up DERIVATION is unit-tested directly in
// gitRollup.test.ts — these tests pin that FileTree actually CONSUMES it on dir rows.)
import fileTreeSource from "../FileTree.tsx?raw";

// QoL-WP7 — bubble the per-file git status up to parent folder rows.
//
// The failure modes these tests exist to prevent (none observable in jsdom — the tree's
// status rendering is a live-DOM concern verified by the operator):
//  1. The dominantStatusByDir derivation is dropped or stops being recomputed off the
//     same `gitStatus` source the leaf indicators use → folder roll-ups go stale or vanish.
//  2. The dir-row roll-up element is removed → folders stop showing the marker (the
//     whole feature silently no-ops).
//  3. The roll-up is keyed on the wrong path (not `node.path`) so it diverges from the
//     leaf lookup → a folder's marker disagrees with the files inside it.

describe("FileTree consumes the gitRollup derivation (QoL-WP7 P2.1)", () => {
  it("imports dominantStatusByDir from gitRollup", () => {
    expect(fileTreeSource).toMatch(
      /import\s*\{\s*dominantStatusByDir\s*\}\s*from\s*["']\.\/gitRollup["']/,
    );
  });

  it("memoizes the dir roll-up off the same gitStatus source as the leaf indicators", () => {
    // rollupByDir = useMemo(() => dominantStatusByDir(gitStatus), [gitStatus])
    // Match on the tokens + their order, tolerant of prettier's line-wrapping
    // (`[\s\S]*?` spans any whitespace/newlines) — the earlier whitespace-exact
    // regex broke whenever prettier re-wrapped the useMemo (SURFACE PRETTIER-DRIFT).
    expect(fileTreeSource).toMatch(
      /const\s+rollupByDir\s*=\s*useMemo\([\s\S]*?dominantStatusByDir\(gitStatus\)[\s\S]*?\[\s*gitStatus\s*\][\s\S]*?\)/,
    );
  });

  it("threads rollupByDir into TreeRow", () => {
    expect(fileTreeSource).toMatch(/rollupByDir=\{rollupByDir\}/);
  });
});

describe("FileTree renders the roll-up on dir rows (QoL-WP7 P2.2)", () => {
  it("looks the roll-up up by the dir's own node.path (same key space as the leaf lookup)", () => {
    expect(fileTreeSource).toMatch(/rollupByDir\[node\.path\]/);
  });

  it("derives the glyph + class from the rolled-up status via the shared gitStatus helpers", () => {
    expect(fileTreeSource).toMatch(/statusGlyph\(rollupStatus\)/);
    expect(fileTreeSource).toMatch(/statusClass\(rollupStatus\)/);
  });

  it("renders a distinct dir-status element only when there is a roll-up glyph", () => {
    // The element is gated on a non-null glyph (clean folder → no element) and tagged
    // with its own testid so it's distinguishable from the per-file leaf indicator.
    expect(fileTreeSource).toMatch(/rollupGlyph\s*!==\s*null\s*&&/);
    expect(fileTreeSource).toMatch(/data-testid="file-tree-dir-status"/);
  });
});
