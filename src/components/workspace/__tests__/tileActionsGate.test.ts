import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// M12 WP2 — the ⏸ (pause-close) must be ABSENT when the M10.9 workflow gate is OFF.
//
// Why this guard exists: the ⏸ is workflow-coupled — its entire purpose is to PRESERVE the
// unclean-exit flag that M12's auto-resume reads to fire `/resume`. With the workflow layer
// off there is nothing to resume into, so the control would be a dead affordance, which the
// seam contract in `useWorkflowFeaturesEnabled.ts` forbids: *not rendered-then-hidden, not
// present-but-disabled, not a no-op handler — ABSENT.*
//
// ⚠️ Found at verify-human (2026-08-03), NOT by any automated gate: the ⏸ shipped ungated
// through build, verify-auto, and a 5/5 live verify-self. The OFF-invariant guard could not
// catch it either — that guard enumerates three registries (panels, chords, menu ids) and a
// filmstrip control is in none of them. M12 WP5 owes the guard a fourth arm; until then,
// THIS is the guard.
//
// ⚠️ HONEST LIMITATION — this is a source-text guard, and CLAUDE.md is explicit that those
// verify STRUCTURE, never RUNTIME. The proper instrument is a component-render test
// asserting the ⏸ is absent from the rendered DOM with the gate off, but this repo has no
// React render harness (`@testing-library` is not a dependency — see
// `SURFACE-2026-07-31-NO-REACT-COMPONENT-RENDER-HARNESS`, still open). Adding one is a real
// decision, not a drive-by. So the runtime proof is the OPERATOR's, at verify-human: toggle
// the setting off in `⌘,` and confirm the ⏸ is gone. This guard's job is narrower — to make
// a future edit that ungates the control fail loudly.

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
 *  this codebase has bitten twice. */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");
}

describe("the ⏸ pause control is gated on the M10.9 workflow setting", () => {
  it("renders the pause control only inside a workflowEnabled branch", () => {
    const body = code(src);
    // The gate must appear as a real conditional around the pause control, not merely as a
    // prop that is accepted and ignored.
    expect(body).toMatch(/workflowEnabled\s*&&/);
    // And the pause ActionControl must live after that guard, not beside it.
    const guardAt = body.indexOf("workflowEnabled &&");
    const pauseAt = body.indexOf('kind="pause"');
    expect(guardAt).toBeGreaterThan(-1);
    expect(pauseAt).toBeGreaterThan(guardAt);
  });

  it("the × close control is NOT gated — closing a workspace is universal", () => {
    const body = code(src);
    const closeAt = body.indexOf('kind="close"');
    const guardAt = body.indexOf("workflowEnabled &&");
    // The close control must be rendered BEFORE the gate, i.e. unconditionally. If someone
    // moves it inside the gated branch, an OFF build loses its close button entirely.
    expect(closeAt).toBeGreaterThan(-1);
    expect(closeAt).toBeLessThan(guardAt);
  });

  it("Filmstrip reads the gate through the seam hook", () => {
    const body = code(filmstrip);
    expect(body).toContain("useWorkflowFeaturesEnabled(");
    // ⚠️ The "no bypass" half of this property is deliberately NOT asserted here — it is
    // already owned by `src/state/__tests__/offInvariantGuard.test.ts`, which scans every
    // module for ad-hoc reads of the gate command / raw getter.
    //
    // Spelling those bypass identifiers out here, even inside a `.not.toContain(...)`,
    // makes THIS FILE trip that guard: it scans source text and cannot distinguish an
    // assertion that forbids a call from the call itself. That actually happened while
    // writing this test — the guard failed the file on its own negative assertions, which
    // is the guard behaving correctly. Duplicating the check bought nothing and cost a
    // false positive, so the check stays where it belongs, once.
  });

  it("meta: the guard is not vacuous — the source actually loaded", () => {
    // `code("")` returns "" and would sail through every assertion above.
    expect(src.length).toBeGreaterThan(500);
    expect(filmstrip.length).toBeGreaterThan(500);
  });
});
