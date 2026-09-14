// M15 WP4 Phase 2 — the WIP phase parser's contract.
//
// ⚠️ The failure modes here are silent in BOTH directions:
//   • Matching indented child leaves as phases inflates the count ~6x and corrupts the
//     done/open ratio — the recycle then fires (or withholds) for the wrong reason.
//   • Reading the `<!-- status: -->` comment instead of the checkbox parses free-form prose
//     with no fixed vocabulary.
// Both are covered by tests that fail on the naive implementation, plus a test against a REAL
// archived WIP file so the parser is pinned to the actual schema rather than to fixtures that
// share this file's assumptions.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  atNonFinalPhaseBoundary,
  isFeatureWorkflow,
  parseWip,
} from "../wipPhases";

/** Repo root, from this test file's location. */
const ROOT = resolve(__dirname, "../../../..");

const wip = (...lines: string[]) => lines.join("\n");

describe("parseWip — workflow frontmatter", () => {
  it("reads the **Workflow:** line", () => {
    expect(parseWip("**Workflow:** feature")?.workflow).toBe("feature");
    expect(parseWip("**Workflow:** task")?.workflow).toBe("task");
    expect(parseWip("**Workflow:** incident")?.workflow).toBe("incident");
    expect(parseWip("**Workflow:** product")?.workflow).toBe("product");
  });

  it("reads an unknown workflow name as null rather than trusting it", () => {
    // ⚠️ An unrecognized name must not pass the feature gate by accident.
    expect(parseWip("**Workflow:** banana")?.workflow).toBeNull();
  });

  it("is null when no Workflow line is present", () => {
    expect(
      parseWip("# Feature: something\n\nno frontmatter")?.workflow,
    ).toBeNull();
  });

  it("returns null for empty or absent input, never throws", () => {
    expect(parseWip("")).toBeNull();
    expect(parseWip("   \n  ")).toBeNull();
    expect(parseWip(null)).toBeNull();
    expect(parseWip(undefined)).toBeNull();
  });
});

describe("parseWip — phase lines", () => {
  it("reads the checkbox, not the status comment", () => {
    // ⚠️ THE DISCRIMINATING CASE. The checkbox says done; the comment says in-progress.
    // A comment-reading implementation returns done=false here and the test fails.
    const p = parseWip(
      wip("- [x] Phase 1: Something  <!-- status: in-progress -->"),
    );
    expect(p?.phases).toHaveLength(1);
    expect(p?.phases[0].done).toBe(true);
  });

  it("does NOT match indented child leaves as phases", () => {
    // Child impl tasks are indented two spaces.
    const p = parseWip(
      wip(
        "- [ ] Phase 1: Real phase  <!-- status: NOT-STARTED -->",
        "  - [x] P1.1 a child task  <!-- status: DONE -->",
        "  - [ ] P1.2 another child  <!-- status: NOT-STARTED -->",
        "  - [ ] verify-auto  <!-- status: NOT-STARTED -->",
      ),
    );
    expect(p?.phases).toHaveLength(1);
    expect(p?.phases[0].done).toBe(false);
  });

  it("does NOT match an INDENTED line that itself says `Phase N:` — the ^ anchor's real job", () => {
    // ⚠️ **THIS TEST EXISTS BECAUSE A MUTANT SURVIVED WITHOUT IT.** Removing the `^` anchor from
    // PHASE_LINE left all other tests green, because every child leaf in those fixtures is named
    // `P1.1` / `verify-auto` — none contains the word "Phase", so `Phase\s+\d+:` already
    // excluded them and the anchor was never exercised.
    //
    // ⚠️ The shape below is NOT invented: `archive/wp4-thumbnail-rendering-probe.md` line 14
    // carries a real indented, commented-out phase line
    // (`  <!-- ORIGINAL: - [ ] Phase 1: Harness scaffold … -->`). Unanchored, that parses as a
    // live Phase 1 — inflating the count and corrupting the done/open ratio the recycle reads.
    const p = parseWip(
      wip(
        "- [x] Phase 1: The only real phase  <!-- status: DONE -->",
        "  <!-- ORIGINAL: - [ ] Phase 1: Harness scaffold + deps -->",
        "  - [ ] Phase 2: an indented impostor  <!-- status: NOT-STARTED -->",
      ),
    );
    expect(p?.phases).toHaveLength(1);
    expect(p?.phases[0].done).toBe(true);
    // ⚠️ And the consequence that actually matters: unanchored, the impostor makes this look
    // like a non-final boundary and the supervisor would recycle a COMPLETED feature.
    expect(atNonFinalPhaseBoundary(p)).toBe(false);
  });

  it("strips the status comment out of the title", () => {
    const p = parseWip(
      wip("- [ ] Phase 2: WIP phase parser  <!-- status: X -->"),
    );
    expect(p?.phases[0].title).toBe("WIP phase parser");
  });

  it("accepts an uppercase [X]", () => {
    expect(parseWip(wip("- [X] Phase 1: Upper"))?.phases[0].done).toBe(true);
  });

  it("reads multiple phases in document order", () => {
    const p = parseWip(
      wip("- [x] Phase 1: One", "- [x] Phase 2: Two", "- [ ] Phase 3: Three"),
    );
    expect(p?.phases.map((x) => x.done)).toEqual([true, true, false]);
  });

  it("is stable across repeated calls (the g-flag lastIndex trap)", () => {
    // ⚠️ A module-level `g` regex resumes from `lastIndex` on the next call. Without the reset
    // the SECOND call finds zero phases — and the supervisor runs this once per turn.
    const text = wip("- [x] Phase 1: One", "- [ ] Phase 2: Two");
    expect(parseWip(text)?.phases).toHaveLength(2);
    expect(parseWip(text)?.phases).toHaveLength(2);
    expect(parseWip(text)?.phases).toHaveLength(2);
  });

  it("returns zero phases (not null) for a file with a Work Tree but no phases", () => {
    const p = parseWip("**Workflow:** task\n\n## Plan\n- [ ] do the thing");
    expect(p).not.toBeNull();
    expect(p?.phases).toHaveLength(0);
  });
});

describe("atNonFinalPhaseBoundary", () => {
  const phases = (...done: boolean[]) =>
    parseWip(
      wip(
        "**Workflow:** feature",
        ...done.map((d, i) => `- [${d ? "x" : " "}] Phase ${i + 1}: P${i + 1}`),
      ),
    );

  it("is true when some phases are done and a later one is not", () => {
    expect(atNonFinalPhaseBoundary(phases(true, true, false))).toBe(true);
    expect(atNonFinalPhaseBoundary(phases(true, false))).toBe(true);
  });

  it("is FALSE when every phase is done — the last-phase case", () => {
    // ⚠️ Recycling here hands a fresh session a feature with no work left.
    expect(atNonFinalPhaseBoundary(phases(true, true, true))).toBe(false);
  });

  it("is FALSE when NO phase is done — a fresh WIP is not a boundary", () => {
    // ⚠️ The case the obvious reading ("is any phase incomplete?") gets wrong. Nothing has been
    // finished, so recycling would discard a session that produced nothing.
    expect(atNonFinalPhaseBoundary(phases(false, false, false))).toBe(false);
  });

  it("is false for a null parse or a phase-less file", () => {
    expect(atNonFinalPhaseBoundary(null)).toBe(false);
    expect(atNonFinalPhaseBoundary(parseWip("**Workflow:** task"))).toBe(false);
  });
});

describe("isFeatureWorkflow", () => {
  it("is true only for feature", () => {
    expect(isFeatureWorkflow(parseWip("**Workflow:** feature"))).toBe(true);
    expect(isFeatureWorkflow(parseWip("**Workflow:** task"))).toBe(false);
    expect(isFeatureWorkflow(parseWip("**Workflow:** incident"))).toBe(false);
    expect(isFeatureWorkflow(parseWip("**Workflow:** product"))).toBe(false);
    expect(isFeatureWorkflow(null)).toBe(false);
  });
});

// ⚠️ THE REAL-FILE TESTS. Every fixture above uses a shape THIS FILE constructed, so they share
// the author's assumptions about the schema. These read actual WIP files committed to the repo —
// the same discipline Phase 1 used for the transcript fixture, and the reason the parser can be
// called a contract-reader at all until mccc's schema pin (task 4.7) lands.
describe("against REAL WIP files in this repo", () => {
  it("parses the archived M15 WP3 file — 5 phases, all complete, feature workflow", () => {
    const text = readFileSync(
      resolve(
        ROOT,
        "workflow-system/state/archive/m15-wp3-break-detection-and-auto-fire.md",
      ),
      "utf8",
    );
    const p = parseWip(text);
    expect(p?.workflow).toBe("feature");
    expect(p?.phases).toHaveLength(5);
    expect(p?.phases.every((x) => x.done)).toBe(true);
    // ⚠️ A COMPLETED feature is NOT at a non-final boundary — the ship/finalize case.
    expect(atNonFinalPhaseBoundary(p)).toBe(false);
    expect(isFeatureWorkflow(p)).toBe(true);
  });

  it("excludes the REAL indented impostor in wp4-thumbnail-rendering-probe.md", () => {
    // ⚠️ **THIS TEST READS THE ACTUAL FILE, and that is the point.** The anchor test above uses a
    // hand-built fixture that IMITATES this shape — so it proves the parser handles the shape the
    // author had in mind, not the shape the corpus actually contains. If a future WIP-editing
    // convention introduces a different indented-phase form, the imitation stays green and only
    // this test notices.
    //
    // The file carries 3 real top-level phases plus ONE indented `<!-- ORIGINAL: - [ ] Phase 1: …`
    // line (an ordinary artifact of revising a Work Tree, not a contrivance). Unanchored, the
    // parser reads 4 phases with one open → `boundary: true` → it would **recycle a COMPLETED
    // feature**. Anchored, it reads 3, all done, `boundary: false`.
    const text = readFileSync(
      resolve(
        ROOT,
        "workflow-system/state/archive/wp4-thumbnail-rendering-probe.md",
      ),
      "utf8",
    );
    const p = parseWip(text);
    expect(p?.phases).toHaveLength(3);
    expect(p?.phases.every((x) => x.done)).toBe(true);
    // ⚠️ The consequence, asserted directly rather than left implied by the count.
    expect(atNonFinalPhaseBoundary(p)).toBe(false);
  });

  it("parses a real mixed-state WIP synthesized from the archived file's own phase lines", () => {
    // ⚠️ **DELIBERATELY NOT READ FROM THE LIVE `wip/` FILE.** An earlier draft of this test read
    // `wip/m15-wp4-context-pressure-recycle.md` directly and asserted "Phase 1 done, boundary
    // true". That passes today and **fails the moment this WP completes its last phase** — a
    // test that breaks because the work it describes FINISHED is a time-bomb, and it would land
    // in the archive asserting a state its own subject no longer has.
    //
    // Instead: take the REAL phase lines from the archived file (so the shape is still schema-
    // sourced, not invented here) and re-open the last one. The mixed state is then permanent.
    const text = readFileSync(
      resolve(
        ROOT,
        "workflow-system/state/archive/m15-wp3-break-detection-and-auto-fire.md",
      ),
      "utf8",
    );
    const reopened = text.replace("- [x] Phase 5:", "- [ ] Phase 5:");
    const p = parseWip(reopened);
    expect(p?.workflow).toBe("feature");
    expect(p?.phases).toHaveLength(5);
    expect(p?.phases[0].done).toBe(true);
    expect(p?.phases[4].done).toBe(false);
    // The exact state the recycle branch must recognize: work done, work remaining.
    expect(atNonFinalPhaseBoundary(p)).toBe(true);
  });
});
