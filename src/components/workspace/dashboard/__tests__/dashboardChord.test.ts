import { describe, expect, it } from "vitest";
import { isDashboardChord } from "../dashboardChord";
import { panelForChord } from "../../panelHost";
import { newWorkspaceChord } from "../../newWorkspaceChord";
import { workspaceSwitchIndex } from "../../workspaceSwitchChord";

describe("isDashboardChord (⌘⇧A → global dashboard)", () => {
  it("matches ⌘⇧A (case-insensitive — Shift uppercases to 'A')", () => {
    expect(isDashboardChord({ metaKey: true, shiftKey: true, key: "a" })).toBe(
      true,
    );
    expect(isDashboardChord({ metaKey: true, shiftKey: true, key: "A" })).toBe(
      true,
    );
  });

  it("rejects bare ⌘A (select-all — Shift absent)", () => {
    expect(isDashboardChord({ metaKey: true, shiftKey: false, key: "a" })).toBe(
      false,
    );
  });

  it("rejects ⇧A without Cmd, and other letters", () => {
    expect(isDashboardChord({ metaKey: false, shiftKey: true, key: "a" })).toBe(
      false,
    );
    expect(isDashboardChord({ metaKey: true, shiftKey: true, key: "n" })).toBe(
      false,
    );
  });

  it("is permissive on Ctrl/Alt (only ⌘+Shift+A define the chord)", () => {
    expect(
      isDashboardChord({
        metaKey: true,
        shiftKey: true,
        key: "a",
        ctrlKey: true,
        altKey: true,
      }),
    ).toBe(true);
  });
});

describe("⌘⇧A exclusivity — no other chord predicate claims it", () => {
  const cmdShiftA = { metaKey: true, shiftKey: true, key: "a" };

  it("panelForChord does NOT map ⌘⇧A (it is app-level, not a panel)", () => {
    expect(panelForChord(cmdShiftA)).toBeNull();
  });

  it("newWorkspaceChord does NOT match ⌘⇧A (that is ⌘⇧N)", () => {
    expect(newWorkspaceChord(cmdShiftA)).toBe(false);
  });

  it("workspaceSwitchIndex does NOT match ⌘⇧A (that is ⌘⇧+digit)", () => {
    // 'a' is not a digit → no workspace-switch index.
    expect(workspaceSwitchIndex(cmdShiftA)).toBeNull();
  });
});
