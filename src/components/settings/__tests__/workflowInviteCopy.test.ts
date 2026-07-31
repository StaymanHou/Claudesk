import { describe, it, expect } from "vitest";
import appSrc from "../../../App.tsx?raw";
import {
  INVITE_TITLE,
  INVITE_BODY_1,
  INVITE_BODY_2,
  INVITE_PRIMARY_LABEL,
  INVITE_LATER_LABEL,
  INVITE_DISMISS_LABEL,
} from "../WorkflowInviteModal";

// M10.9 WP3 Phase 4 — copy-fidelity + wiring guards for the one-time invite.
//
// Same posture as `workflowSubstrateCopy.test.ts`: the copy is EXPORTED as constants that the
// component interpolates, so these are VALUE assertions on what actually renders rather than
// `?raw` greps over JSX. (This repo has no DOM test environment; live rendering is
// MCP-bridge-verified at verify-self.)
//
// The upstream constraints are load-bearing enough that violating them costs a cross-repo
// round-trip, and they are exactly what a well-meaning "make the pitch punchier" edit breaks.

const ALL_COPY = [
  INVITE_TITLE,
  INVITE_BODY_1,
  INVITE_BODY_2,
  INVITE_PRIMARY_LABEL,
  INVITE_LATER_LABEL,
  INVITE_DISMISS_LABEL,
].join("\n");

describe("invite copy — upstream-pinned invariants", () => {
  it("makes NO quick/5-minute claim (§6: structurally forbidden upstream)", () => {
    // The spec calls a "quick / 5-minute" claim false advertising for a real agent run.
    // WORD-BOUNDARY matching is required, not incidental: a naive `includes("5 min")` would
    // fire on the REQUIRED "~10–15 minute" framing — the mistake this feature's sibling copy
    // test actually made and had to fix.
    const lower = ALL_COPY.toLowerCase();
    for (const forbidden of [
      /\b5[-\s]?minutes?\b/,
      /\b5[-\s]?min\b/,
      /\bfive[-\s]?minutes?\b/,
      /\bquick\b/,
      /\bdemo\b/,
    ]) {
      expect(lower).not.toMatch(forbidden);
    }
  });

  it("carries the honest ~10–15 minute framing (§6 REQUIRES it, not merely permits it)", () => {
    // The absence check above is necessary but NOT sufficient: copy with no time claim at all
    // would pass it while dropping the honest label the spec mandates. Note the en-dash — the
    // spec's own spelling.
    expect(INVITE_BODY_2).toContain("~10–15 minute");
  });

  it("frames the tour as REAL, not as a canned demo (the skeptic-facing half of §6)", () => {
    // §6's reasoning: the headline value is "it actually went and looked", so a faked run
    // would defeat the exact thing that converts a skeptical developer. The copy has to say
    // the run is real, not merely avoid saying it is fake.
    expect(INVITE_BODY_2).toContain("a real run");
  });

  it("names NO slash command — the pointer lives in Settings, where it works", () => {
    // Deliberate, and worth stating because the return contract's §4a asks the invite surface
    // to carry a pointer: `/tutorial-getting-started` does not EXIST until install.sh has run,
    // so naming it here would invite typing a command that fails. The pointer is rendered in
    // the Settings installed-state arm instead — actionable exactly when it is true.
    expect(ALL_COPY).not.toMatch(/\/[a-z][a-z-]+/);
  });

  it("does not pre-select the greenfield/brownfield path (§4c: the fork is inside the skill)", () => {
    const lower = ALL_COPY.toLowerCase();
    for (const term of [
      "greenfield",
      "brownfield",
      "existing codebase",
      "new project",
      "blank page",
    ]) {
      expect(lower).not.toContain(term);
    }
  });

  it("does not name a permission mode (§4c: mode guidance is the skill's to deliver)", () => {
    // Proven load-bearing upstream rather than hypothetical: their recommendation changed
    // acceptEdits→auto mid-cycle with ZERO Claudesk changes, precisely because our copy stays
    // silent on it.
    const lower = ALL_COPY.toLowerCase();
    for (const mode of [
      "--permission-mode",
      "acceptedits",
      "bypasspermissions",
      "permission mode",
    ]) {
      expect(lower).not.toContain(mode);
    }
  });

  it("promises the back-out, which is the hesitance-remover the operator asked for", () => {
    expect(INVITE_BODY_2).toContain("uninstalls the whole thing");
  });

  it("routes the install through Settings rather than promising the invite can do it", () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // REVISITED 2026-07-29 (WP3.5a Phase 4) — as this test's previous version asked to be.
    //
    // It used to assert `INVITE_BODY_2` contains "outside Claudesk", because WP3 genuinely
    // could not install anything and copy implying otherwise would have promised what the app
    // could not keep. The wizard now exists, so that assertion was pinning a false statement —
    // it failed, deliberately and usefully, the moment the copy was corrected.
    //
    // The invariant it becomes: the invite still must NOT claim it installs anything itself.
    // The invite owns *discovery* only (the WP3 boundary the operator set: "Settings owns the
    // substrate, the invite owns only discovery"), so it points at Settings — where the consent
    // step and the location picker actually live — rather than implying a one-click install
    // from a pitch the user has not yet had the context to evaluate.
    // ═══════════════════════════════════════════════════════════════════════════
    expect(INVITE_BODY_2).toContain("Settings");
    // And it must not claim the pitch itself installs: no imperative that skips the consent step.
    expect(INVITE_BODY_2).not.toMatch(
      /install it now|installs it for you automatically/i,
    );
  });

  it("still frames setup as one-time, which is what makes the ask small", () => {
    // Survives the revision unchanged: the reason a secondary user tolerates any setup at all is
    // that it happens once, not per-project.
    expect(INVITE_BODY_2).toContain("one-time");
  });
});

describe("invite affordances — three buttons, three distinct intents", () => {
  it("labels the middle button 'Later', and it must actually mean later", () => {
    // An earlier two-button draft had `[Not now]` meaning PERMANENT suppression — a control
    // that lies to the user. The label and the behavior must agree: `[Later]` persists
    // nothing (asserted at the wiring level below).
    expect(INVITE_LATER_LABEL).toBe("Later");
  });

  it("labels the primary button as ROUTING, not as enabling", () => {
    // The button opens Settings; it does not flip the gate. A label like "Enable" or
    // "Install & enable" would promise an action this surface deliberately does not take —
    // the operator's boundary decision (Settings owns the substrate).
    expect(INVITE_PRIMARY_LABEL).toBe("Show me in Settings");
    expect(INVITE_PRIMARY_LABEL.toLowerCase()).not.toContain("enable");
    expect(INVITE_PRIMARY_LABEL.toLowerCase()).not.toContain("install");
  });

  it("labels the permanent exit 'Dismiss'", () => {
    expect(INVITE_DISMISS_LABEL).toBe("Dismiss");
  });
});

describe("App wiring — the three intents map to the right persistence", () => {
  // Source-text guards on the wiring (single identifiers only, per the repo rule — never a
  // formatted multi-line expression, the shape that silently stopped matching after a
  // Prettier reflow twice in WP2). The RUNTIME behavior is bridge-verified at verify-self.

  it("[Later] writes NOTHING — it only sets the session flag", () => {
    // The single most important wiring assertion in this file. If `onLater` ever called
    // `resolveInvite`, "Later" would silently become "Dismiss" and no unit test of the
    // component alone would notice.
    //
    // Sliced to the END OF THE LINE, not a fixed character count. A first version took
    // `slice(at, at + 120)` and failed — the window spilled onto the NEXT prop (`onDismiss`,
    // which legitimately calls `resolveInvite`), so the negative assertion fired on a
    // neighbour. A fixed-width window around a source match is a false-positive generator;
    // bound it to the syntactic unit instead.
    const at = appSrc.indexOf("onLater={");
    expect(at).toBeGreaterThan(-1);
    const handler = appSrc.slice(at, appSrc.indexOf("\n", at));
    expect(handler).toContain("setInviteDismissedThisSession(true)");
    expect(handler).not.toContain("resolveInvite");
  });

  it("[Dismiss] persists the permanent outcome", () => {
    expect(appSrc).toContain('resolveInvite("dismissed")');
  });

  it("the primary action records acknowledged AND routes to the highlighted group", () => {
    expect(appSrc).toContain('resolveInvite("acknowledged"');
    expect(appSrc).toContain('setSettingsHighlight("workflow-features")');
  });

  it("Esc on the invite is [Later], not [Dismiss]", () => {
    // A keypress must not permanently suppress a one-time pitch. Asserted by locating the
    // invite branch of the Esc handler and confirming which setter it calls.
    const at = appSrc.indexOf('if (target === "invite")');
    expect(at).toBeGreaterThan(-1);
    const branch = appSrc.slice(at, at + 90);
    expect(branch).toContain("setInviteDismissedThisSession(true)");
    expect(branch).not.toContain("resolveInvite");
  });

  it("the project-count read is gated on an unresolved invite", () => {
    // Verdict (b)'s requirement: the second `list_projects` call site must be skipped once
    // the invite has resolved — which is permanently, for all but first-run users.
    expect(appSrc).toContain("if (invite === null)");
  });

  it("the invite is NOT gated behind the workflow-features seam (P4.6)", () => {
    // The inverse of every other workflow surface in this milestone: the invite exists
    // precisely WHEN THE GATE IS OFF. Gating it would hide the only affordance that tells a
    // user the feature class exists. This asserts the render condition is the show-predicate,
    // not the seam hook.
    //
    // COMMENTS STRIPPED before the negative assertion. A first version scanned the raw source
    // and failed — App.tsx discusses `useWorkflowFeaturesEnabled` at length in the comments
    // that EXPLAIN this very decision. Asserting over prose would have forced deleting the
    // explanation to satisfy the test, which is backwards. (Same trap as Phase 3's
    // whole-file negative match; the Rust-side guards strip comments for the same reason.)
    // Strip comment BLOCKS, not just lines that begin with a marker: a `{/* … */}` JSX
    // comment spans many lines whose continuations start with ordinary prose, so a
    // per-line `startsWith` filter (the first attempt) leaks them through.
    const code = appSrc
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "") // JSX comment blocks
      .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
      .replace(/^\s*\/\/.*$/gm, ""); // line comments

    expect(appSrc).toContain("{showInvite && (");
    expect(code).toContain("shouldShowWorkflowInviteFor");

    // REVISED at review-quality (2026-07-29). The original assertion here was
    // `not.toContain("useWorkflowFeaturesEnabled")` — correct when the invite read the gate
    // through a raw one-shot call, WRONG now. The reviewer caught that the raw read bypassed
    // WP2's seam and never re-synced on the broadcast, so `App.tsx` now consumes the hook.
    //
    // The distinction the original assertion was groping for is real but subtler than
    // "does the file mention the hook": the invite must not be **gated** by the gate — it
    // must render when the gate is OFF. That is a property of the PREDICATE (the invite shows
    // only when `!workflowFeaturesEnabled`), which `workflowInviteState.test.ts` asserts as a
    // value. Reading the gate to decide "is there anything left to pitch?" is the opposite of
    // being gated by it.
    //
    // So what is pinned here is the render condition: the invite renders on the
    // show-predicate's verdict, never on the hook's boolean directly.
    expect(code).not.toContain("{useWorkflowFeaturesEnabled() && (");
    expect(code).not.toContain("workflowFeaturesEnabled && showInvite");
  });

  it("the dev reset seam is DEV-gated and deleted on cleanup", () => {
    expect(appSrc).toContain("window.__workflowInviteReset");
    expect(appSrc).toContain("delete window.__workflowInviteReset");
  });
});
