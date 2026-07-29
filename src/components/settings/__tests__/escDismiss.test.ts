import { describe, it, expect } from "vitest";
import { escDismissTarget, type OverlayState } from "../escDismiss";

// M10.9 WP2 Phase 3 — the Esc-dismissal rule for stacked app-level overlays.
// M10.9 WP3 Phase 4 — extended from two overlays to three (the one-time invite joined).
//
// ## Why this file exists (read before simplifying it)
// The behavior it covers shipped BROKEN and three green tests missed it. The original
// implementation set a flag inside a `setShowSettings` updater and read it on the next
// line; React defers updater callbacks, so the read saw a stale `false` and ONE Esc
// closed BOTH the Settings panel and the dashboard.
//
// The guard that was supposed to catch this asserted the two branches appeared in the
// right ORDER IN THE SOURCE. That assertion was true the whole time. Source order is not
// execution order, and no amount of `?raw` text matching can tell the difference — so the
// decision was extracted into a pure function and is asserted here as a VALUE.
//
// Keep this exhaustive. There are only eight input states; enumerate all of them rather
// than sampling, because the original bug lived in exactly one (both-open) and the other
// states behaved correctly the entire time — which is precisely why it survived review.
//
// ## The WP3 extension was TYPE-DRIVEN, which is the system working
// Adding `invite` to `OverlayState` made this file fail to compile — six errors, one per
// call site. That is the correct outcome: a new overlay MUST force a decision about its
// Esc precedence rather than silently defaulting. The old tests were widened rather than
// type-patched, and the new stacking rows below are the actual point.

/** Build a full state, defaulting every overlay closed — so each test varies one axis. */
function state(over: Partial<OverlayState> = {}): OverlayState {
  return { dashboard: false, settings: false, invite: false, ...over };
}

describe("escDismissTarget — Esc dismisses the FRONT overlay only", () => {
  it("closes Settings when both it and the dashboard are open (the regression case)", () => {
    // THE original bug. Settings is z-index 45, the dashboard 40, so Settings is in front.
    // The user opened Settings *from* the dashboard and must be returned to it — not dumped
    // out of both surfaces by one keypress.
    expect(escDismissTarget(state({ dashboard: true, settings: true }))).toBe(
      "settings",
    );
  });

  it("closes Settings when only Settings is open", () => {
    expect(escDismissTarget(state({ settings: true }))).toBe("settings");
  });

  it("closes the dashboard when only the dashboard is open", () => {
    expect(escDismissTarget(state({ dashboard: true }))).toBe("dashboard");
  });

  it("closes the invite when only the invite is open", () => {
    expect(escDismissTarget(state({ invite: true }))).toBe("invite");
  });

  it("LOAD-BEARING — the invite outranks Settings, because it can OPEN Settings behind itself", () => {
    // The invite's primary button routes to Settings and highlights the gate row, so both
    // are legitimately open at once. If Settings won this contest, one Esc would close the
    // panel the user was just sent to while leaving the pitch up — exactly backwards.
    expect(escDismissTarget(state({ settings: true, invite: true }))).toBe(
      "invite",
    );
  });

  it("the invite outranks all three when everything is open", () => {
    expect(
      escDismissTarget(state({ dashboard: true, settings: true, invite: true })),
    ).toBe("invite");
  });

  it("returns null when no overlay is open — Esc is not ours to consume", () => {
    // `null` is a real verdict, not an absence. With nothing open, Esc must pass through
    // so the editor / finder / palette / terminal keep their own handling. Swallowing it
    // to do nothing is the "registered-with-a-no-op-handler" shape this milestone's seam
    // contract forbids elsewhere.
    expect(escDismissTarget(state())).toBeNull();
  });

  it("is exhaustive over all eight states (no input falls through undefined)", () => {
    for (const dashboard of [true, false]) {
      for (const settings of [true, false]) {
        for (const invite of [true, false]) {
          const target = escDismissTarget({ dashboard, settings, invite });
          expect(
            target === "invite" ||
              target === "settings" ||
              target === "dashboard" ||
              target === null,
            `escDismissTarget({dashboard:${dashboard},settings:${settings},invite:${invite}}) returned ${String(target)}`,
          ).toBe(true);
        }
      }
    }
  });

  it("never targets an overlay that is not open", () => {
    // The property that actually matters, stated independently of the ordering rule: you
    // cannot dismiss what is not there. A future FOURTH overlay must preserve this.
    for (const dashboard of [true, false]) {
      for (const settings of [true, false]) {
        for (const invite of [true, false]) {
          const target = escDismissTarget({ dashboard, settings, invite });
          if (target === "invite") expect(invite).toBe(true);
          if (target === "settings") expect(settings).toBe(true);
          if (target === "dashboard") expect(dashboard).toBe(true);
        }
      }
    }
  });

  it("always targets the front-most OPEN overlay (the ordering rule, stated as a property)", () => {
    // Independent of the hand-written rows above: derive the expected answer from the
    // z-order and compare. A future overlay inserted at the wrong precedence fails here
    // even if every enumerated row above was updated to match the buggy behavior.
    const frontToBack: (keyof OverlayState)[] = [
      "invite",
      "settings",
      "dashboard",
    ];
    for (const dashboard of [true, false]) {
      for (const settings of [true, false]) {
        for (const invite of [true, false]) {
          const s = { dashboard, settings, invite };
          const expected = frontToBack.find((k) => s[k]) ?? null;
          expect(escDismissTarget(s)).toBe(expected);
        }
      }
    }
  });
});
