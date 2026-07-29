import { describe, expect, it } from "vitest";
import { isSettingsChord } from "../settingsChord";
import { isDashboardChord } from "../../workspace/dashboard/dashboardChord";
import { panelForChord } from "../../workspace/panelHost";
import { newWorkspaceChord } from "../../workspace/newWorkspaceChord";
import { workspaceSwitchIndex } from "../../workspace/workspaceSwitchChord";

const CHORD = { metaKey: true, shiftKey: false, key: "," };

describe("isSettingsChord (⌘, → Settings panel)", () => {
  it("matches ⌘,", () => {
    expect(isSettingsChord(CHORD)).toBe(true);
  });

  it("rejects ⌘⇧, (that is ⌘< on a US layout — a chord we do not own)", () => {
    // Swallowing a chord we don't own to do nothing is the same shape the gate's seam
    // contract forbids ("registered-with-a-no-op-handler") — so Shift must be ABSENT,
    // not merely permissive.
    expect(isSettingsChord({ metaKey: true, shiftKey: true, key: "," })).toBe(
      false,
    );
  });

  it("rejects a bare comma with no Cmd (typing in the editor / terminal)", () => {
    expect(isSettingsChord({ metaKey: false, shiftKey: false, key: "," })).toBe(
      false,
    );
  });

  it("rejects other keys held with Cmd", () => {
    for (const key of [".", ";", "a", "p", "1", "Escape"]) {
      expect(isSettingsChord({ metaKey: true, shiftKey: false, key })).toBe(
        false,
      );
    }
  });

  it("is permissive on Ctrl/Alt (only Meta + no-Shift + ',' defines the chord)", () => {
    expect(isSettingsChord({ ...CHORD, ctrlKey: true, altKey: true })).toBe(
      true,
    );
  });
});

describe("⌘, is disjoint from every existing app chord", () => {
  // The real risk with a new chord is not "does it match" but "does it also fire
  // something else, or does something else also fire on it". Assert BOTH directions
  // against every sibling predicate (the dashboardChord.test.ts pattern).

  it("no existing predicate claims ⌘,", () => {
    expect(isDashboardChord(CHORD)).toBe(false);
    expect(panelForChord(CHORD)).toBeNull();
    expect(newWorkspaceChord(CHORD)).toBe(false);
    expect(workspaceSwitchIndex(CHORD)).toBeNull();
  });

  it("the settings chord does not fire on any existing chord's keystroke", () => {
    const existing = [
      { metaKey: true, shiftKey: true, key: "e" }, // panel: editor
      { metaKey: true, shiftKey: true, key: "d" }, // panel: diff
      { metaKey: true, shiftKey: true, key: "t" }, // panel: terminal
      { metaKey: true, shiftKey: true, key: "a" }, // dashboard
      { metaKey: true, shiftKey: true, key: "n" }, // new workspace
      { metaKey: true, shiftKey: true, key: "p" }, // palette
      { metaKey: true, shiftKey: true, key: "f" }, // find in files
      { metaKey: true, shiftKey: false, key: "p" }, // finder
      { metaKey: true, shiftKey: false, key: "w" }, // close tab
      { metaKey: true, shiftKey: true, key: "1" }, // workspace switch
    ];
    for (const e of existing) {
      expect(
        isSettingsChord(e),
        `unexpectedly matched ${JSON.stringify(e)}`,
      ).toBe(false);
    }
  });
});
