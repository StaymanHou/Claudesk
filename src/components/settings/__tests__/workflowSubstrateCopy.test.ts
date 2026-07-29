import { describe, it, expect } from "vitest";
import {
  TUTORIAL_POINTER_COPY,
  TUTORIAL_COMMAND,
} from "../WorkflowSubstrateInfo";

// M10.9 WP3 task 3.3 — the copy-fidelity test.
//
// ## What this exists to prevent
// Two constraints on this copy are pinned UPSTREAM (in the companion workflow-system repo's
// `onboarding-flow-spec.md`) and are load-bearing enough that violating them costs a
// cross-repo round-trip. They are the kind of thing a well-meaning future copy edit breaks
// silently — "let's make the pitch punchier" is exactly how a "5-minute tour" claim gets
// written. So they are enforced mechanically on our side.
//
// ## Why VALUE assertions and not a `?raw` source grep
// The repo rule (root CLAUDE.md) is that `?raw` guards verify STRUCTURE, never content, and
// this feature already paid twice for that idiom in WP2 — one guard passed while the behavior
// was broken, another silently stopped matching after a Prettier reflow. This project also
// has no DOM test environment (pure logic → vitest, live DOM → the MCP bridge), so rendering
// the component and reading its text is not available either.
//
// The resolution: the copy is EXPORTED as a constant, and the component interpolates that
// same constant rather than re-typing the sentence. So a value assertion here pins what the
// user actually reads — the vacuous-guard trap (pinning a string nobody renders) is closed by
// construction, not by hope. The component is verified to render it live at Phase 3's
// verify-self via the MCP bridge.

describe("tutorial pointer copy — upstream-pinned invariants", () => {
  it("names exactly /tutorial-getting-started (§4c: the only stable coupling)", () => {
    expect(TUTORIAL_POINTER_COPY).toContain(TUTORIAL_COMMAND);
    expect(TUTORIAL_COMMAND).toBe("/tutorial-getting-started");
  });

  it("makes NO quick/5-minute claim (§6: structurally forbidden upstream)", () => {
    // The spec calls a "quick / 5-minute" claim false advertising for a real agent run, and
    // pins its absence on their side too.
    //
    // WORD-BOUNDARY MATCHING IS REQUIRED, not incidental. A naive `includes("5 min")` check
    // (the first version of this test) FAILED against the correct copy: "5 min" is a
    // substring of the REQUIRED "~10–15 min" framing. So a substring check here would reject
    // exactly the phrasing the spec mandates — and the tempting "fix" would have been to
    // reword the honest label. `\b` before the digit distinguishes "a 5 minute tour" from
    // "~10–15 min".
    const lower = TUTORIAL_POINTER_COPY.toLowerCase();
    for (const forbidden of [
      /\b5[-\s]?minutes?\b/,
      /\b5[-\s]?min\b/,
      /\bfive[-\s]?minutes?\b/,
      /\bquick\b/,
    ]) {
      expect(lower).not.toMatch(forbidden);
    }
  });

  it("carries the honest ~10–15 min framing (§6 REQUIRES it, not merely permits it)", () => {
    // The absence check above is necessary but not sufficient: copy with NO time claim at all
    // would pass it while dropping the honest label the spec mandates. Note the en-dash — the
    // spec's own spelling, and what the component renders.
    expect(TUTORIAL_POINTER_COPY).toContain("~10–15 min");
  });

  it("does not pre-select the greenfield/brownfield path (§4c: the fork is inside the skill)", () => {
    const lower = TUTORIAL_POINTER_COPY.toLowerCase();
    expect(lower).not.toContain("greenfield");
    expect(lower).not.toContain("brownfield");
    expect(lower).not.toContain("existing codebase");
    expect(lower).not.toContain("new project");
  });

  it("does not name a permission mode (§4c: mode guidance is the skill's to deliver)", () => {
    // Proven load-bearing upstream, not hypothetical: their recommendation changed
    // acceptEdits→auto mid-cycle with ZERO Claudesk changes, precisely because our copy
    // stayed silent on it. Keep it that way.
    const lower = TUTORIAL_POINTER_COPY.toLowerCase();
    for (const mode of [
      "--permission-mode",
      "acceptedits",
      "bypasspermissions",
      "permission mode",
    ]) {
      expect(lower).not.toContain(mode);
    }
  });

  it("names no OTHER slash command (unguaranteed couplings stay out of the pinned string)", () => {
    // The installed-state surface DOES list /session-start, /feature-plan, /task-plan, and
    // /incident-report — an operator decision made knowing they carry no upstream stability
    // guarantee. Those live in the component's JSX and are deliberately NOT pinned here:
    // asserting them would turn an upstream rename into a test failure in THIS repo, which is
    // the exact brittleness §4c exists to prevent.
    //
    // What IS asserted: the one guaranteed command is the only one inside the pinned string,
    // so the guarantee boundary stays legible. A future edit that pulls another command into
    // this constant fails here and has to make that choice deliberately.
    const commands = TUTORIAL_POINTER_COPY.match(/\/[a-z][a-z-]+/g) ?? [];
    expect(commands).toEqual([TUTORIAL_COMMAND]);
  });
});
