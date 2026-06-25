import { describe, expect, it } from "vitest";
// Vite ?raw import: bundles the component source text at test time (repo posture —
// pure logic → vitest, live DOM → verify-human; same ?raw trick as
// autofocusCcOnPromote.test.ts / spawnOnceOnReactivate.test.ts). The live "Commits
// section is collapsed on first open + toggles" check is the QoL-WP8 Phase 1
// verify-human Browser outcome (operator-approved 2026-06-25); these structural
// assertions pin the wiring so a future edit can't silently flip the default back
// to expanded.
import diffPanelSource from "../DiffPanel.tsx?raw";
import commitListSource from "../CommitList.tsx?raw";

// QoL-WP8 item B — the Commits section starts COLLAPSED by default.
//
// Failure modes these tests exist to prevent:
//  1. Someone resets the commitsCollapsed initial state to useState(false) (or omits
//     the arg, defaulting to undefined→falsy), re-expanding the commit list on mount.
//  2. The collapsed flag stops being threaded into CommitList, so the prop is ignored
//     and the section renders regardless of the default.
//  3. CommitList stops gating its body on `collapsed`, so a collapsed default no longer
//     hides the commit rows.
// All three are wiring invariants; the live render is covered by verify-human.

describe("DiffPanel defaults the Commits section to collapsed (QoL-WP8 item B)", () => {
  it("initializes commitsCollapsed to true", () => {
    expect(diffPanelSource).toMatch(
      /const\s*\[\s*commitsCollapsed\s*,\s*setCommitsCollapsed\s*\]\s*=\s*useState\(\s*true\s*\)/,
    );
  });

  it("does NOT initialize commitsCollapsed to false", () => {
    expect(diffPanelSource).not.toMatch(/useState\(\s*false\s*\)\s*;?\s*\/\/.*commitsCollapsed/);
    // Belt-and-suspenders: the exact false-default form must be absent for this hook.
    expect(diffPanelSource).not.toMatch(
      /\[\s*commitsCollapsed\s*,\s*setCommitsCollapsed\s*\]\s*=\s*useState\(\s*false\s*\)/,
    );
  });

  it("threads the collapsed flag into CommitList", () => {
    expect(diffPanelSource).toMatch(/collapsed=\{commitsCollapsed\}/);
  });
});

describe("CommitList gates its body on the collapsed prop (QoL-WP8 item B)", () => {
  it("renders the commits body only when not collapsed", () => {
    expect(commitListSource).toMatch(/\{!collapsed\s*&&/);
  });

  it("reflects collapsed in the header's aria-expanded + chevron", () => {
    expect(commitListSource).toMatch(/aria-expanded=\{!collapsed\}/);
    expect(commitListSource).toMatch(/collapsed\s*\?\s*"▸"\s*:\s*"▾"/);
  });
});
