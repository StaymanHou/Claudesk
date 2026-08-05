import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// M12 WP3 Phase 3.5 — the ⏸ (pause-close) is UNIVERSAL. It is NOT gated.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ THIS GUARD WAS INVERTED, NOT DELETED (2026-08-05). Read this before "restoring" it.
//
// WP2 wrote this file to assert the opposite: that the ⏸ was ABSENT when the M10.9 workflow
// gate was off. That was correct then, and the reason it existed is still worth knowing —
// the ⏸ shipped **ungated** through build, verify-auto, and a 5/5 live verify-self, and only
// the OPERATOR caught it at verify-human (2026-08-03). The OFF-invariant guard could not:
// it enumerates three registries (panels, chords, menu ids) and a filmstrip control is in
// none of them. So a per-surface guard was the right answer, and still is.
//
// What changed is the DIRECTION. M12 WP3 Phase 3.5 decoupled the unclean-flag arm from the
// gate (operator decision), which falsified WP2's own stated rationale — quoted verbatim so
// nobody reinstates it from memory:
//
//     "the ⏸ is workflow-coupled because its whole purpose is to preserve the unclean flag
//      that M12's auto-resume reads to fire /resume; with the workflow layer off there is
//      nothing to resume into, so the control would be a dead affordance."
//
// Both halves are now false. There IS something to resume into with the gate off
// (`--continue`, verified firing live), and it is not `/resume` (a bare `/resume` opens an
// interactive session picker — Phase 1, Verdict 2).
//
// And leaving it gated was actively harmful, which is what the operator found at Phase 3.5's
// verify-human: the flag is SET on every workspace open by `should_set_unclean_flag`
// (ungated), the × CLEARS it, and the ⏸ is the only route that declines to clear. Gating the
// ⏸ therefore made the flag write-only for a non-workflow user — they could consume an
// unclean flag but never deliberately produce one.
//
// ⚠️ HONEST LIMITATION (unchanged): this is a source-text guard, and CLAUDE.md is explicit
// that those verify STRUCTURE, never RUNTIME. The proper instrument is a component-render
// test against the rendered DOM, but this repo has no React render harness
// (`SURFACE-2026-07-31-NO-REACT-COMPONENT-RENDER-HARNESS`, still open). The runtime proof is
// the operator's, at verify-human — and note that it WAS the operator, twice: once catching
// the ungated ⏸ in WP2, once catching the over-gated ⏸ here.

const src = readFileSync(
  fileURLToPath(new URL("../TileActionButton.tsx", import.meta.url)),
  "utf8",
);
const filmstrip = readFileSync(
  fileURLToPath(new URL("../Filmstrip.tsx", import.meta.url)),
  "utf8",
);

/** Strip comments so a guard can never be satisfied by prose that MENTIONS the identifier
 *  it is asserting — the `raw-guard-identifier-satisfied-by-own-comments` trap, which in
 *  this codebase has now bitten three times (most recently in this very phase, where a CSS
 *  comment quoting `flex: 1 1 auto` satisfied an assertion about the declaration). */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");
}

describe("the ⏸ pause control is UNIVERSAL — not gated (Phase 3.5)", () => {
  it("the pause control renders unconditionally, with no gate identifier left", () => {
    const body = code(src);
    // The control still exists...
    expect(body).toContain('kind="pause"');
    // ...and no gate conditional wraps it. ⚠️ Asserted on comment-stripped source, or the
    // header above (which quotes the old rationale) would satisfy it on the code's behalf —
    // exactly the trap this file's own `code()` helper exists to close.
    expect(body).not.toMatch(/workflowEnabled\s*&&/);
    // The retired PROP must be gone too, not merely unused. A prop every caller sets to one
    // constant is a dead parameter — the WP2 dead-variant lesson (`CleanExitRoute::
    // CcExitCommand` declared everywhere, called by nothing) repeating.
    expect(body).not.toContain("workflowEnabled");
  });

  it("BOTH controls render unconditionally — × clears the flag, ⏸ declines to", () => {
    const body = code(src);
    // Replaces WP2's `closeAt < guardAt` ordering assertion, whose anchor
    // (`workflowEnabled &&`) no longer exists — it would have thrown on indexOf === -1.
    // The honest statement of the pair now is that neither is conditional.
    const closeAt = body.indexOf('kind="close"');
    const pauseAt = body.indexOf('kind="pause"');
    expect(closeAt).toBeGreaterThan(-1);
    expect(pauseAt).toBeGreaterThan(-1);
    // Neither control may sit inside ANY conditional render. `&&` immediately before a
    // control's JSX is the shape a re-gating edit would introduce.
    const between = body.slice(closeAt, pauseAt);
    expect(between).not.toContain("&&");
  });

  it("Filmstrip does NOT read the workflow gate — the ⏸ was its only consumer", () => {
    const body = code(filmstrip);
    // ⚠️ The hook identifier is ASSEMBLED AT RUNTIME rather than written as a literal. The
    // OFF-invariant guard scans source text for gate reads and cannot distinguish an
    // assertion that FORBIDS one from the call itself — spelling it out here would make this
    // file an offender. That actually happened when WP2 wrote this file, and again in
    // `announceRow.test.ts` this phase; assembling the string is the established fix.
    const hook = `use${"WorkflowFeaturesEnabled"}(`;
    expect(body).not.toContain(hook);
    // And the now-unused import must be gone (an unused import is dead weight and would
    // suggest to a reader that the gate is still consulted here).
    expect(body).not.toContain("useWorkflowFeaturesEnabled");
  });

  it("meta: the guard is not vacuous — the source actually loaded", () => {
    // `code("")` returns "" and would sail through every `not.toContain` above — which is
    // the specific hazard of a guard built from NEGATIVE assertions: an empty haystack
    // passes them all. This meta-test is what makes the three tests above mean anything.
    expect(src.length).toBeGreaterThan(500);
    expect(filmstrip.length).toBeGreaterThan(500);
    // Positive anchors too, so a truncated-but-nonempty read cannot pass either.
    expect(code(src)).toContain('kind="close"');
    expect(code(filmstrip)).toContain("TileActions");
  });
});
