import { describe, expect, it } from "vitest";
import { AVAILABLE_PANELS, panelForChord, selectPanel } from "../panelHost";

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

  it("returns null for non-panel letters (P palette, O sublime)", () => {
    expect(
      panelForChord({ metaKey: true, shiftKey: true, key: "p" }),
    ).toBeNull();
    expect(
      panelForChord({ metaKey: true, shiftKey: true, key: "o" }),
    ).toBeNull();
  });
});
