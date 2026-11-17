import { describe, expect, it } from "vitest";
import {
  AVAILABLE_PANELS,
  availablePanels,
  defaultPanel,
  reconcilePanel,
  selectPanel,
} from "../panelHost";
import { workspaceSurfaces } from "../../../state/workspaceSurfaces";

// M17 WP6 (AC-2) — the panel registry takes the workspace KIND as a second, independent input.

const REMOTE = workspaceSurfaces("ssh://me@mini-host/Users/me/proj");
const LOCAL = workspaceSurfaces("/Users/me/proj");

describe("availablePanels × workspace kind", () => {
  it("the gate-only call shape is unchanged (the OFF-invariant guard's call)", () => {
    expect(availablePanels(false)).toBe(AVAILABLE_PANELS);
    expect(availablePanels(false, LOCAL)).toBe(AVAILABLE_PANELS);
    expect(availablePanels(true, LOCAL)).toEqual([
      "docs",
      "prompt",
      "editor",
      "diff",
      "terminal",
    ]);
  });

  it("a remote workspace keeps only the panels that do not read the local disk", () => {
    expect(availablePanels(false, REMOTE)).toEqual(["prompt"]);
    expect(availablePanels(true, REMOTE)).toEqual(["docs", "prompt"]);
  });
});

describe("defaultPanel / reconcilePanel / selectPanel × workspace kind", () => {
  it("a remote workspace opens on Prompt (gate OFF) or Docs (gate ON)", () => {
    expect(defaultPanel(false, REMOTE)).toBe("prompt");
    expect(defaultPanel(true, REMOTE)).toBe("docs");
    // Local is untouched: Editor with the gate off.
    expect(defaultPanel(false)).toBe("editor");
    expect(defaultPanel(false, LOCAL)).toBe("editor");
  });

  it("reconcile evicts an absent panel to the kind's default", () => {
    for (const p of ["editor", "diff", "terminal"] as const) {
      expect(reconcilePanel(p, false, REMOTE)).toBe("prompt");
      expect(reconcilePanel(p, true, REMOTE)).toBe("docs");
      expect(reconcilePanel(p, false, LOCAL)).toBe(p);
    }
  });

  it("selecting an absent panel on a remote workspace keeps the current one", () => {
    expect(selectPanel("prompt", "editor", false, REMOTE)).toBe("prompt");
    expect(selectPanel(null, "diff", false, REMOTE)).toBe("prompt");
    expect(selectPanel("docs", "terminal", true, REMOTE)).toBe("docs");
    expect(selectPanel("prompt", "editor", false, LOCAL)).toBe("editor");
  });
});
