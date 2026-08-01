import { describe, expect, it } from "vitest";
import { isSettingsChord } from "../settingsChord";
import settingsPanel from "../SettingsPanel.tsx?raw";
import globalDashboard from "../../workspace/dashboard/GlobalDashboard.tsx?raw";

// M11.5 WP3 verify-codify — the CROSS-SURFACE PROMISE.
//
// `settingsTimeTrackingCopy.test.ts` (build-time, mutation-proven) pins WHAT each surface
// says. This file pins something it cannot: that the dashboard's instruction is still
// TRUE. Those are different properties, and only the second one rots silently.
//
// The dashboard empty state tells the user, in prose:
//     "Turn on **Time tracking** in Settings (⌘,)"
// That single sentence hardcodes THREE facts that live in other modules:
//   1. the chord is ⌘,                      → owned by settingsChord.ts
//   2. Settings contains the control        → owned by SettingsPanel.tsx
//   3. the control is labelled "Time tracking" → owned by SettingsPanel.tsx
// Nothing tied those together. A chord rebind or a label rename would leave every
// existing assertion green while the advertised route quietly became wrong.
//
// This is not hypothetical — it is the EXACT defect this WP repaired. The previous copy
// said "in the project picker" and stayed in the tree long after M10.9 WP2 deleted the
// picker settings strip, because the copy and the surface it named had no test coupling
// them. Codifying the promise (not just the wording) is what stops the next recurrence.
//
// Method note: assertion 1 tests the chord through the real `isSettingsChord` PREDICATE
// rather than grepping for a "⌘," literal in the source. A source-text match would pass
// even if the predicate had been rebound to ⌘; — proving the two agree requires executing
// one of them.

/** The chord the dashboard copy advertises, as a KeyboardEvent-shaped literal. */
const ADVERTISED_CHORD = { metaKey: true, shiftKey: false, key: "," };

/** The control name the dashboard copy tells the user to look for. */
const ADVERTISED_CONTROL_LABEL = "Time tracking";

describe("M11.5 WP3 — the dashboard's advertised route is actually true", () => {
  it("the advertised chord (⌘,) is the chord the app really opens Settings with", () => {
    // Executes the real predicate. If someone rebinds Settings to ⌘; or adds a Shift
    // requirement, this fails — and the failure names the copy as the thing to update.
    expect(isSettingsChord(ADVERTISED_CHORD)).toBe(true);
  });

  it("the copy advertises that chord in prose, so the two cannot drift apart", () => {
    // Pairs with the assertion above: one proves the chord WORKS, this proves it is what
    // we TELL the user. Both are needed — a correct chord nobody advertises, and an
    // advertised chord that does not work, are both failures of the same promise.
    expect(globalDashboard).toContain("in Settings (⌘,)");
  });

  it("Settings really contains a control with the advertised label", () => {
    // The label is what the user visually scans for after pressing the chord. Renaming it
    // to "Session tracking" or "Analytics" would strand a user who followed the
    // instruction — and would otherwise pass every test in the suite.
    expect(settingsPanel).toContain(`>${ADVERTISED_CONTROL_LABEL}<`);
  });

  it("that control is the time-tracking toggle, not a coincidental same-named element", () => {
    // Guards the assertion above against a false positive: the label text must sit in the
    // same group as the time-tracking checkbox, so a match elsewhere in the panel cannot
    // satisfy it. Located by slicing between the Analytics group marker and the next
    // group, then asserting BOTH the testid and the label appear inside that window.
    const analyticsStart = settingsPanel.indexOf('id="analytics"');
    expect(analyticsStart).toBeGreaterThan(-1);
    const nextGroup = settingsPanel.indexOf(
      "<SettingsGroup",
      analyticsStart + 1,
    );
    const analyticsBlock = settingsPanel.slice(
      analyticsStart,
      nextGroup === -1 ? undefined : nextGroup,
    );
    expect(analyticsBlock).toContain('data-testid="picker-time-tracking"');
    expect(analyticsBlock).toContain(ADVERTISED_CONTROL_LABEL);
  });

  it("the dashboard does not advertise a route to a surface that no longer exists", () => {
    // The regression this WP fixed, stated as a permanent invariant rather than a
    // one-time correction. M10.9 WP2 deleted the ProjectPicker settings strip; any copy
    // sending a user there is wrong by construction.
    //
    // ⚠️ Matches the RENDERED PHRASING, deliberately not the keyword. A first pass also
    // asserted `not.toContain("in the picker")` and FAILED — on a code COMMENT at :503
    // describing the M9 live-sync mechanism ("flipping the WP5 checkbox in the picker
    // flips this view live"), which routes nobody anywhere. Same over-broad-matcher error
    // the OFF-invariant guard's word-boundary matching exists to prevent (`docs` once
    // fired on `docstring`). A keyword guard here is self-defeating: WP3 deliberately
    // ADDED a comment naming the removed surface, precisely so a future edit would not
    // reinstate it — a guard that trips on such comments fights its own documentation.
    expect(globalDashboard).not.toContain("in the project picker");
  });
});

describe("meta — this guard can fail", () => {
  it("rejects a chord the app does NOT use, so assertion 1 is not vacuous", () => {
    // If isSettingsChord were stubbed to return true for everything, assertion 1 would
    // pass while proving nothing. This pins that the predicate discriminates.
    expect(isSettingsChord({ metaKey: true, shiftKey: false, key: ";" })).toBe(
      false,
    );
    expect(isSettingsChord({ metaKey: false, shiftKey: false, key: "," })).toBe(
      false,
    );
  });

  it("reads real source text from both surfaces", () => {
    expect(settingsPanel.length).toBeGreaterThan(1000);
    expect(globalDashboard.length).toBeGreaterThan(1000);
  });
});
