import { describe, expect, it } from "vitest";
import {
  AVAILABLE_PANELS,
  availablePanels,
  defaultPanel,
  panelForChord,
  reconcilePanel,
  selectPanel,
} from "../panelHost";

describe("selectPanel (direct-select, not cycling)", () => {
  it("selects the editor directly", () => {
    expect(selectPanel("diff", "editor")).toBe("editor");
  });

  it("selects the diff directly", () => {
    expect(selectPanel("editor", "diff")).toBe("diff");
  });

  it("is idempotent — selecting the current panel returns it unchanged", () => {
    expect(selectPanel("editor", "editor")).toBe("editor");
    expect(selectPanel("diff", "diff")).toBe("diff");
  });

  it("does NOT toggle — selecting diff from diff stays diff (no flip back to editor)", () => {
    // Guards against a cycle/toggle regression: a second ⌘⇧D must not bounce away.
    expect(selectPanel("diff", "diff")).toBe("diff");
  });

  it("selects terminal directly now that WP9 mounted it (no longer a no-op)", () => {
    // Regression guard for SURFACE-2026-06-20-QUALITY-WP5-TERMINAL-SEAM-UNTESTED:
    // selectPanel must return "terminal" — and RightPanelHost must mount a slot for
    // it (asserted in the structure test below) so the right half never goes blank.
    expect(selectPanel("editor", "terminal")).toBe("terminal");
    expect(selectPanel("diff", "terminal")).toBe("terminal");
    expect(selectPanel("terminal", "terminal")).toBe("terminal"); // idempotent
  });

  it("AVAILABLE_PANELS includes all three live panels", () => {
    expect(AVAILABLE_PANELS).toContain("editor");
    expect(AVAILABLE_PANELS).toContain("diff");
    expect(AVAILABLE_PANELS).toContain("terminal");
  });

  it("still no-ops a target that is not available (structural guard)", () => {
    // The guard branch is dormant (all three panels are live) but must stay intact:
    // an unknown/absent panel must never flip the host to an unmounted slot.
    // @ts-expect-error — deliberately passing an off-union value to exercise the guard.
    expect(selectPanel("editor", "nonexistent")).toBe("editor");
  });
});

describe("M11 gate-derived panel registry", () => {
  it("availablePanels(false) is the three ungated panels — no docs", () => {
    expect(availablePanels(false)).toEqual(["editor", "diff", "terminal"]);
    expect(availablePanels(false)).not.toContain("docs");
  });

  it("availablePanels(true) adds docs", () => {
    expect(availablePanels(true)).toContain("docs");
  });

  it("AVAILABLE_PANELS remains the OFF-state baseline (what the guard asserts)", () => {
    expect(AVAILABLE_PANELS).toEqual(availablePanels(false));
  });

  it("selectPanel REFUSES docs while the gate is off", () => {
    // Not "selects it and hides it" — refuses. The M10.9 contract is that a gated
    // surface must not exist when off, and `selectPanel` is the single enforcement
    // point all 10 setPanel call sites route through.
    expect(selectPanel("editor", "docs", false)).toBe("editor");
    expect(selectPanel("diff", "docs", false)).toBe("diff");
  });

  it("selectPanel allows docs while the gate is on", () => {
    expect(selectPanel("editor", "docs", true)).toBe("docs");
    expect(selectPanel("docs", "docs", true)).toBe("docs"); // idempotent
  });

  it("defaults to the gate being OFF when the argument is omitted", () => {
    // The restrictive default matters: a call site that forgets to thread the gate
    // fails CLOSED (no docs) rather than open. Mirrors the seam hook's own
    // pre-seed default, which is `false` for the same reason.
    // (The 3rd arg is optional by design, so this call is legal TS — that IS the point:
    // the omission compiles, and must still refuse the gated panel.)
    expect(selectPanel("editor", "docs")).toBe("editor");
  });
});

describe("reconcilePanel (the front-panel hazard — D3)", () => {
  it("kicks docs off the front when the gate flips off", () => {
    // THE hazard this function exists for: selectPanel guards transitions INTO a panel
    // and never re-examines one already front, so a runtime gate flip (⌘, Settings) would
    // otherwise strand `panel === "docs"` with nothing to correct it. The type system
    // cannot catch it — the value is already in useState, so no assignment type-checks.
    expect(reconcilePanel("docs", false)).toBe("editor");
  });

  it("leaves docs alone while the gate is on", () => {
    expect(reconcilePanel("docs", true)).toBe("docs");
  });

  it("never disturbs an ungated panel, in either gate state", () => {
    for (const panel of ["editor", "diff", "terminal"] as const) {
      expect(reconcilePanel(panel, true)).toBe(panel);
      expect(reconcilePanel(panel, false)).toBe(panel);
    }
  });

  it("is idempotent — safe to run on every render", () => {
    const once = reconcilePanel("docs", false);
    expect(reconcilePanel(once, false)).toBe(once);
  });

  it("its fallback target is itself ungated — the property, not the literal", () => {
    // The tests above assert the fallback IS "editor". This asserts WHY that is safe:
    // whatever reconcilePanel falls back to must be available in the OFF state. A
    // fallback to a gated panel would be a silent trap — reconciliation would "fix" a
    // dead surface by selecting another dead surface, and the assertions above would
    // still pass because they only check the literal string.
    const fallback = reconcilePanel("docs", false);

    expect(
      availablePanels(false),
      `reconcilePanel falls back to "${fallback}", which is not in the OFF-state panel ` +
        `set — the fallback must never itself require the gate`,
    ).toContain(fallback);
  });

  it("reconciles EVERY gated panel off the front, not just docs today", () => {
    // Generalizes the docs case: any panel available only while the gate is on must be
    // evicted when it flips off. Written against the derivation rather than a hardcoded
    // list, so a future gated panel inherits this coverage instead of needing a new test
    // someone has to remember to write.
    const gatedOnly = availablePanels(true).filter(
      (p) => !availablePanels(false).includes(p),
    );

    expect(
      gatedOnly.length,
      "no gated panels found — this test would be vacuous",
    ).toBeGreaterThan(0);

    for (const panel of gatedOnly) {
      expect(
        availablePanels(false),
        `gated panel "${panel}" survived reconciliation with the gate off`,
      ).toContain(reconcilePanel(panel, false));
    }
  });
});

describe("panelForChord (⌘⇧+mnemonic → panel)", () => {
  it("maps ⌘⇧E → editor", () => {
    expect(panelForChord({ metaKey: true, shiftKey: true, key: "e" })).toBe(
      "editor",
    );
    expect(panelForChord({ metaKey: true, shiftKey: true, key: "E" })).toBe(
      "editor",
    );
  });

  it("maps ⌘⇧D → diff", () => {
    expect(panelForChord({ metaKey: true, shiftKey: true, key: "d" })).toBe(
      "diff",
    );
  });

  it("maps ⌘⇧T → terminal", () => {
    expect(panelForChord({ metaKey: true, shiftKey: true, key: "t" })).toBe(
      "terminal",
    );
  });

  it("returns null for ⌘⇧A — the global-dashboard chord is app-level, NOT a panel (M9 WP6a)", () => {
    // ⌘⇧A toggles the global time-analytics view (App.tsx / dashboardChord.ts); it must
    // NOT resolve to a right-panel here, or a panel switch would fire alongside it.
    expect(
      panelForChord({ metaKey: true, shiftKey: true, key: "a" }),
    ).toBeNull();
  });

  it("returns null without Cmd", () => {
    expect(
      panelForChord({ metaKey: false, shiftKey: true, key: "e" }),
    ).toBeNull();
  });

  it("returns null without Shift (bare ⌘E / ⌘P finder territory)", () => {
    expect(
      panelForChord({ metaKey: true, shiftKey: false, key: "e" }),
    ).toBeNull();
  });

  it("maps ⌘⇧K → docs ONLY while the gate is on", () => {
    expect(
      panelForChord({ metaKey: true, shiftKey: true, key: "k" }, true),
    ).toBe("docs");
    expect(
      panelForChord({ metaKey: true, shiftKey: true, key: "K" }, true),
    ).toBe("docs");
  });

  it("returns null for ⌘⇧K while the gate is OFF — the key must pass through", () => {
    // A chord that matched and then no-opped would still SWALLOW the keystroke
    // (the handler calls preventDefault on any non-null result). The M10.9 seam
    // contract names "registered-with-a-no-op-handler" as explicitly forbidden, so
    // the predicate itself must not match while the gate is off.
    expect(
      panelForChord({ metaKey: true, shiftKey: true, key: "k" }, false),
    ).toBeNull();
    // And with the arg omitted — fails closed, same as selectPanel.
    expect(
      panelForChord({ metaKey: true, shiftKey: true, key: "k" }),
    ).toBeNull();
  });

  it("the ungated chords are unaffected by the gate in either state", () => {
    // Regression guard: threading `enabled` through must not accidentally gate
    // Editor/Diff/Terminal, which every user has regardless of the workflow layer.
    for (const [key, panel] of [
      ["e", "editor"],
      ["d", "diff"],
      ["t", "terminal"],
    ] as const) {
      expect(panelForChord({ metaKey: true, shiftKey: true, key }, false)).toBe(
        panel,
      );
      expect(panelForChord({ metaKey: true, shiftKey: true, key }, true)).toBe(
        panel,
      );
    }
  });

  it("returns null for non-panel letters (P palette, O sublime, F search)", () => {
    // Exclusivity guard: the ⌘⇧ chords owned by OTHER subsystems must NOT resolve to a
    // panel. A (dashboard), E/D/T (editor/diff/terminal) are the only panel letters.
    expect(
      panelForChord({ metaKey: true, shiftKey: true, key: "p" }),
    ).toBeNull();
    expect(
      panelForChord({ metaKey: true, shiftKey: true, key: "o" }),
    ).toBeNull();
    expect(
      panelForChord({ metaKey: true, shiftKey: true, key: "f" }),
    ).toBeNull();
  });
});

// WP11 Phase 5 — the `railVisibleForPanel` describe block was removed: the FileTree
// rail is now editor-only by STRUCTURE (it renders only inside the editor slot in
// RightPanelHost), not via a per-panel visibility predicate. There is no pure
// function left to unit-test; the editor-only placement is a DOM property confirmed
// at verify-self/human (repo posture: live DOM → Playwright).

// M11 WP3 (operator decision, 2026-08-02 verify-human) — Docs leads the tab row and is the
// default panel WHEN the gate is on. The two halves are tested separately because they can
// break independently: the ordering is what the tab row renders, the default is what a
// fresh workspace opens on.
describe("Docs-first ordering + default panel (gate ON only)", () => {
  it("puts docs FIRST in the gate-on panel order", () => {
    // Order here IS the tab order. Asserting the index, not just membership — membership
    // was already true before this change and would not have caught the regression.
    expect(availablePanels(true)[0]).toBe("docs");
    expect([...availablePanels(true)]).toEqual([
      "docs",
      "editor",
      "diff",
      "terminal",
    ]);
  });

  it("leaves the gate-OFF order completely untouched (M10.9 byte-identical contract)", () => {
    // The whole point of gating: a non-workflow user must see exactly the previous app.
    expect([...availablePanels(false)]).toEqual(["editor", "diff", "terminal"]);
    expect(availablePanels(false)[0]).toBe("editor");
    expect([...AVAILABLE_PANELS]).toEqual(["editor", "diff", "terminal"]);
  });

  it("defaults to docs when the gate is on, editor when off", () => {
    expect(defaultPanel(true)).toBe("docs");
    expect(defaultPanel(false)).toBe("editor");
  });

  it("resolves an UNCHOSEN panel (null) to the gate default, not a hardcoded editor", () => {
    // `null` = "user has not picked yet". This is what lets the default follow the
    // asynchronously-resolved gate instead of being fixed before the gate is known.
    expect(reconcilePanel(defaultPanel(true), true)).toBe("docs");
    expect(reconcilePanel(defaultPanel(false), false)).toBe("editor");
  });

  it("evicts docs to EDITOR when the gate flips off, not to a dead panel", () => {
    // The standing OFF-invariant: a gated panel must never remain front once revoked.
    expect(reconcilePanel("docs", false)).toBe("editor");
  });

  it("keeps an EXPLICIT user choice — the default never overrides a real selection", () => {
    // Docs-first is a default, not a lock. A user who picks Editor stays on Editor.
    expect(selectPanel(null, "editor", true)).toBe("editor");
    expect(reconcilePanel("editor", true)).toBe("editor");
  });

  it("a rejected target on an unchosen panel yields the gate default, never null", () => {
    // `selectPanel` returns `current` when the target is unavailable; with `current` now
    // nullable, that path must not write null back into state.
    expect(selectPanel(null, "docs", false)).toBe("editor");
  });
});
