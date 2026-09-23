import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
// Imported from PRODUCTION, not stubbed — the whole point is that this guard reads the
// same typed data the app does. A re-implementation would share the blind spot
// (`extract-for-import-when-a-raw-guard-cant-express-the-property`).
import { CHORD_REGISTRY } from "../../components/workspace/chordRegistry";
import {
  AVAILABLE_PANELS,
  availablePanels,
} from "../../components/workspace/panelHost";
// M14 WP4 Phase 3 — the tier-2 half needs the skill row, same production-import rule.
import { SKILL_BUTTONS } from "../../components/workspace/skillButtons";

// ═══════════════════════════════════════════════════════════════════════════════
// M14 WP4 Phase 2 — THE TIER-1 README HONESTY GUARD.
//
// The invariant: README's "Tier 1 — the lite IDE" section describes what a user gets
// with `workflow_features_enabled` OFF. It must therefore never promise a surface that
// is gated ON. Tier 1's whole promise is that a user who never installs the companion
// workflow system is a first-class user, not a degraded one — a README that advertises
// a gated surface as freely available breaks that promise silently, at the exact moment
// a stranger is deciding whether to install.
//
// ── WHY A GUARD AND NOT JUST A REVIEW ─────────────────────────────────────────
// Phase 1's corrections were about EDITORIAL INTENT (is this sentence forward-looking?)
// and were deliberately left unguarded — see the WIP's `## Codify Decision`, and
// `docs/lessons/source-text-guards.md` entry 14. This phase's claim is different in kind:
// it is MECHANICAL. "Does the README name a chord that `requiresWorkflowGate`?" has a
// typed answer in production data, so it is exactly the case the lessons say to extract
// and test for real rather than approximate with a prose predicate.
//
// ── THE DIRECTION THAT BITES (lessons entry 13) ───────────────────────────────
// A one-directional guard cannot see OMISSIONS. The failure this must catch is NOT
// "someone edits the README" — it is "a FUTURE MILESTONE GATES A NEW CHORD, and the
// tier-1 section silently starts overclaiming." Nobody editing `chordRegistry.ts` will
// think to re-read the README. So the guard is driven from the REGISTRY side: for every
// gated entry, assert the tier-1 window does not name it. A new gated chord fails this
// test on the day it is added, which is the only day the fix is cheap.
// ═══════════════════════════════════════════════════════════════════════════════

const REPO_ROOT = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../..",
);

/** The tier-1 section's text, bounded by its own heading and the next heading of ANY level.
 *
 * ⚠️ Read via `node:fs`, NOT a Vitest `?raw` import: a `?raw` import of a non-TS asset
 * has bitten this repo before (`vitest-raw-import-css-returns-processed-not-text`), and
 * `node:fs` is what the sibling OFF-invariant guard uses.
 *
 * ⚠️ THE TERMINATOR HAS BEEN WRONG TWICE, IN OPPOSITE DIRECTIONS. Both are recorded
 * because the second fix was a patch to the symptom and the shape bit again:
 *
 *   Phase 2 wrote `/\n## /` — true only while tier 1 was the last `###` before a `##`.
 *   Phase 3 added `### Tier 2 …` and the window ran PAST the end of tier 1, swallowing
 *   tier 2's gated surfaces. The guard reported `⌘⇧K` "inside tier 1". Failed CLOSED
 *   (false alarm) — visible, and fixed by widening the terminator to `/\n#{2,3} /`.
 *
 *   That fix then failed OPEN, which is the dangerous direction and is why the shape,
 *   not the level, is the thing to get right. Code review mutation-tested it: adding a
 *   `### Also in tier 1` subsection naming `⌘⇧K` left the suite 10/10 GREEN, because
 *   the window now STOPS at that sibling and simply excludes content a reader plainly
 *   reads as tier 1. A leak outside the window is invisible to every assertion over it.
 *
 * The shape: a tier section owns everything up to the next TIER or the next `## `. It is
 * bounded by its PEERS, not by "whatever heading level appears next" — descendant
 * subsections belong INSIDE it. Anchoring on the peers is what makes the window mean
 * "the tier", which is what every assertion below actually claims to be checking.
 */
const TIER_HEADINGS = [
  "### Tier 1 — the lite IDE",
  "### Tier 2 — the opt-in workflow layer",
] as const;

function sectionWindow(heading: string): string {
  const readme = readFileSync(join(REPO_ROOT, "README.md"), "utf8");
  const start = readme.indexOf(heading);
  if (start === -1) return "";
  const rest = readme.slice(start + heading.length);
  // The section ends at the next PEER tier heading or the next `## ` — never at a
  // descendant `### `/`#### `, which is part of this tier and must stay in the window.
  const ends = [
    ...TIER_HEADINGS.filter((h) => h !== heading).map((h) => rest.indexOf(h)),
    rest.search(/\n## /),
  ].filter((i) => i >= 0);
  return ends.length === 0
    ? heading + rest
    : heading + rest.slice(0, Math.min(...ends));
}

const tierOneWindow = (): string => sectionWindow("### Tier 1 — the lite IDE");
const tierTwoWindow = (): string =>
  sectionWindow("### Tier 2 — the opt-in workflow layer");

describe("README tier-1 section is honest about the workflow gate", () => {
  // ── NON-VACUITY FIRST ───────────────────────────────────────────────────────
  // Every assertion below is of the form "X does not appear in the window". An empty
  // window satisfies all of them trivially — the vacuous-pass trap that `docs/lessons/
  // source-text-guards.md` entries 9 and 14 both arrive at through different doors.
  // These two tests are the positive control, and they must fail loudly if the section
  // is renamed or removed rather than letting the real assertions pass on nothing.
  it("the tier-1 window is non-empty (positive control for every assertion below)", () => {
    const w = tierOneWindow();
    expect(w.length).toBeGreaterThan(200);
    expect(w).toContain("Claude Code CLI");
  });

  it("the registry actually contains a gated entry (positive control for the gated sweep)", () => {
    // If this ever reaches zero, the sweep below stops checking anything and would pass
    // for the wrong reason. That is a real possibility: a milestone could ungate the docs
    // panel. This test makes that a deliberate edit rather than a silent loss of coverage.
    const gated = CHORD_REGISTRY.filter((e) => e.requiresWorkflowGate);
    expect(gated.length).toBeGreaterThan(0);
  });

  // ── THE GUARD ───────────────────────────────────────────────────────────────
  it("names no gated chord in the tier-1 section", () => {
    const w = tierOneWindow();
    const gated = CHORD_REGISTRY.filter((e) => e.requiresWorkflowGate);
    const leaked = gated.filter((e) => w.includes(e.label));
    expect(
      leaked.map((e) => `${e.id} (${e.label})`),
      "tier-1 README names a chord that only exists with the workflow gate ON",
    ).toEqual([]);
  });

  it("names no right-panel PANEL that is unavailable while the gate is OFF", () => {
    // ⚠️ RE-AIMED at code review. This test previously computed
    // `visibleChords(true) \ visibleChords(false)` and called it "the gated delta" — but
    // `visibleChords(true)` IS `CHORD_REGISTRY` and `visibleChords(false)` filters out
    // exactly `requiresWorkflowGate`, so that difference is PROVABLY IDENTICAL to the
    // filter in the test above. It could not fail when its sibling passed: zero mutation
    // coverage, presented as independent protection.
    //
    // Re-aimed at the PANEL registry, which is a genuinely different derivation (panels,
    // not chords) and was unguarded on the tier-1 side. Goes through `availablePanels`,
    // the seam the app itself calls, rather than the unexported ON-state array.
    const w = tierOneWindow();
    const on = availablePanels(true);
    const off = availablePanels(false);
    const gatedOnly = on.filter((p) => !off.includes(p));
    // Non-vacuity: if the gate ever stops adding a panel this test silently checks
    // nothing, so pin that the delta is non-empty rather than trusting it.
    expect(gatedOnly.length).toBeGreaterThan(0);
    // ⚠️ ANCHORED TO THE PANEL ROW, not the window — entry 12 AGAIN, and it fired on the
    // very first run of this re-aimed test: `\bdocs\b` matched inside the tier-1 URL
    // `https://docs.claude.com`, flagging a leak that does not exist. A word boundary is
    // no defence when the token is a whole word inside a URL. Same remedy the sibling
    // panel test already uses: the haystack is the one row enumerating panel tabs.
    const row =
      w
        .split("\n")
        .find((l) => l.includes("The right half of each workspace")) ?? "";
    const leaked = gatedOnly.filter((p) =>
      new RegExp(`\\b${p}\\b`, "i").test(row),
    );
    expect(
      leaked,
      "tier-1 README names a right-panel tab that only exists with the gate ON",
    ).toEqual([]);
  });

  it("the Editor/Diff/Terminal row matches the ungated panel baseline", () => {
    // Guards the other drift direction: if AVAILABLE_PANELS gains or loses a member,
    // the README row naming them goes stale. Asserting each ungated panel is NAMED is
    // the forward direction; the gated sweep above is the reverse (entry 13's pairing).
    //
    // ⚠️ ANCHORED TO THE ROW, NOT THE WINDOW (`docs/lessons/source-text-guards.md`
    // entry 12). A window-wide `toContain(panel)` passes for the wrong reason: a mutant
    // adding "docs" to AVAILABLE_PANELS SURVIVED it, because the word "docs" occurs in
    // the window inside the URL `https://docs.claude.com`. Occurring in the window is
    // not the same as being named as a panel, so the haystack is the one table row that
    // actually enumerates the panel tabs.
    const row = tierOneWindow()
      .split("\n")
      .find((l) => l.includes("The right half of each workspace"));
    expect(
      row,
      "the panel-tab table row must exist to assert over",
    ).toBeDefined();
    const hay = (row ?? "").toLowerCase();
    for (const panel of AVAILABLE_PANELS) {
      expect(hay, `tier-1 README's panel row should name "${panel}"`).toContain(
        panel,
      );
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// M14 WP4 Phase 3 — THE TIER-2 COMPLETENESS GUARD (the INVERSE of the above).
//
// The tier-1 block asserts an ABSENCE (no gated surface promised as free). This block
// asserts a PRESENCE: the tier-2 section must actually NAME what the gate turns on.
//
// ⚠️ WHY BOTH DIRECTIONS ARE NEEDED (`docs/lessons/source-text-guards.md` entry 13).
// A one-directional guard cannot see OMISSIONS. With only the tier-1 half, a future
// milestone that gates a NEW surface stays green: nothing leaked into tier 1, so the
// absence-assertion passes — while tier 2 silently goes incomplete and the docs stop
// describing the product. That failure is invisible precisely because "nothing appeared
// where it shouldn't" is still true. This half is the direction that bites.
// ═══════════════════════════════════════════════════════════════════════════════
describe("README tier-2 section is complete about what the gate turns on", () => {
  it("the tier-2 window is non-empty (positive control for every assertion below)", () => {
    const w = tierTwoWindow();
    expect(w.length).toBeGreaterThan(200);
    expect(w).toContain("Workflow features");
  });

  it("names every gated chord", () => {
    // The mirror of the tier-1 sweep: there, a gated chord appearing is the failure;
    // here, a gated chord MISSING is the failure.
    const w = tierTwoWindow();
    const gated = CHORD_REGISTRY.filter((e) => e.requiresWorkflowGate);
    // ⚠️ ANCHORED on backticks (as the slash-command test below anchors on its own). A bare
    // substring could be satisfied by an incidental mention in adjacent prose. The tier-1 LEAK
    // arm above deliberately stays UNANCHORED: there a looser match fails closed, and
    // anchoring it would let an un-backticked gated chord in tier-1 prose slip through.
    const unmentioned = gated.filter((e) => !w.includes(`\`${e.label}\``));
    expect(
      unmentioned.map((e) => `${e.id} (${e.label})`),
      "a chord is gated behind the workflow feature but tier-2 README never mentions it",
    ).toEqual([]);
  });

  it("names every skill button the gated row ships", () => {
    const w = tierTwoWindow();
    const missing = SKILL_BUTTONS.filter((b) => !w.includes(b.command));
    expect(
      missing.map((b) => b.command),
      "the gated skill row ships a command tier-2 README does not name",
    ).toEqual([]);
  });

  it("names no slash command that the skill row does not actually ship", () => {
    // The other direction on the same subject — README over-promising rather than
    // under-describing. Scoped to backticked commands so prose like "session handoff"
    // cannot trip it.
    const w = tierTwoWindow();
    const claimed = [...w.matchAll(/`(\/[a-z][a-z-]*)`/g)].map((m) => m[1]);
    const shipped = new Set<string>(SKILL_BUTTONS.map((b) => b.command));
    const extra = [...new Set(claimed)].filter((c) => !shipped.has(c));
    expect(
      extra,
      "tier-2 README names a slash command the skill row does not ship",
    ).toEqual([]);
  });

  it("states the gate's two load-bearing promises", () => {
    // These two sentences are the PRIOR this section exists to serve
    // (`gate-substrate-dependent-feature-class-behind-default-off-opt-in`): default-OFF,
    // and enabling-the-UI is separate from installing-the-substrate. Prose can be
    // rewritten freely; losing either CLAIM is the regression. Matched on a flattened
    // haystack because where Prettier — or a human — wraps a line is not the contract
    // (`raw-guard-jsx-prose-needs-flattened-haystack`).
    const flat = tierTwoWindow().replace(/\s+/g, " ").toLowerCase();
    expect(flat, "tier-2 must state the gate is OFF by default").toMatch(
      /off by default/,
    );
    expect(
      flat,
      "tier-2 must state that enabling the UI is separate from installing the substrate",
    ).toMatch(/separate from installing/);
  });
});
