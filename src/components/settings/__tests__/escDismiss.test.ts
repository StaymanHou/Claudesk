import { describe, it, expect } from "vitest";
import { escDismissTarget } from "../escDismiss";

// M10.9 WP2 Phase 3 — the Esc-dismissal rule for stacked app-level overlays.
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
// Keep this exhaustive. There are only four input states; enumerate all of them rather
// than sampling, because the bug lived in exactly one (both-open) and the other three
// behaved correctly the entire time — which is precisely why it survived review.

describe("escDismissTarget — Esc dismisses the FRONT overlay only", () => {
  it("closes Settings when both are open (the regression case)", () => {
    // THE bug. Settings is z-index 45, the dashboard 40, so Settings is in front. The
    // user opened Settings *from* the dashboard and must be returned to it — not dumped
    // out of both surfaces by one keypress.
    expect(escDismissTarget({ dashboard: true, settings: true })).toBe(
      "settings",
    );
  });

  it("closes Settings when only Settings is open", () => {
    expect(escDismissTarget({ dashboard: false, settings: true })).toBe(
      "settings",
    );
  });

  it("closes the dashboard when only the dashboard is open", () => {
    expect(escDismissTarget({ dashboard: true, settings: false })).toBe(
      "dashboard",
    );
  });

  it("returns null when no overlay is open — Esc is not ours to consume", () => {
    // `null` is a real verdict, not an absence. With nothing open, Esc must pass through
    // so the editor / finder / palette / terminal keep their own handling. Swallowing it
    // to do nothing is the "registered-with-a-no-op-handler" shape this milestone's seam
    // contract forbids elsewhere.
    expect(escDismissTarget({ dashboard: false, settings: false })).toBeNull();
  });

  it("is exhaustive over all four states (no input falls through undefined)", () => {
    for (const dashboard of [true, false]) {
      for (const settings of [true, false]) {
        const target = escDismissTarget({ dashboard, settings });
        expect(
          target === "settings" || target === "dashboard" || target === null,
          `escDismissTarget({dashboard:${dashboard},settings:${settings})} returned ${String(target)}`,
        ).toBe(true);
      }
    }
  });

  it("never targets an overlay that is not open", () => {
    // The property that actually matters, stated independently of the ordering rule: you
    // cannot dismiss what is not there. A future third overlay must preserve this.
    for (const dashboard of [true, false]) {
      for (const settings of [true, false]) {
        const target = escDismissTarget({ dashboard, settings });
        if (target === "settings") expect(settings).toBe(true);
        if (target === "dashboard") expect(dashboard).toBe(true);
      }
    }
  });
});
