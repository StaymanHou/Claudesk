import { describe, it, expect } from "vitest";
import panelSrc from "../SettingsPanel.tsx?raw";
import infoSrc from "../WorkflowSubstrateInfo.tsx?raw";
import {
  substrateArmFor,
  type SubstratePresence,
} from "../WorkflowSubstrateInfo";

// M10.9 WP3 Phase 3 verify-codify — the three-state presence decision.
//
// ## What was missing before this file
// verify-human approved the substrate surface after seeing BOTH arms in the live app, and
// `workflowSubstrateCopy.test.ts` pins the copy strings — but nothing asserted WHICH arm
// renders for a given presence value. The copy could be perfect while the branch was inverted.
//
// The decision is now a pure function (`substrateArmFor`), so this is a VALUE assertion rather
// than a source grep — the repo rule is that `?raw` guards verify structure, never runtime, and
// a three-arm branch with a consequential default is exactly what that rule points at.

describe("substrateArmFor — the three-state presence decision", () => {
  it("renders the installed arm when the substrate is present", () => {
    expect(substrateArmFor(true)).toBe("installed");
  });

  it("renders the absent arm when the substrate is missing", () => {
    expect(substrateArmFor(false)).toBe("absent");
  });

  it("LOAD-BEARING — renders NOTHING while the check is unresolved (null)", () => {
    // The arm with real consequences, and the one a two-state model gets wrong:
    //  - defaulting to "absent" flashes install instructions at every user who HAS the
    //    substrate — the operator, on every panel open;
    //  - defaulting to "installed" hides the instructions from the one person who needs them
    //    and claims a /tutorial-getting-started command that does not exist yet.
    // A rejected check also lands here (the backend is contracted never to error, so a
    // rejection means something unexpected — show nothing rather than assert a falsehood).
    expect(substrateArmFor(null)).toBe("nothing");
  });

  it("is total over the input space — every value maps to exactly one arm", () => {
    // `SubstratePresence` is boolean | null, so the space is exactly three values. Guards
    // against a future edit that adds a state (e.g. an "error" value) without deciding what it
    // renders — the `toHaveLength(3)` is what makes this non-vacuous if the union grows.
    const all: SubstratePresence[] = [true, false, null];
    const arms = all.map(substrateArmFor);
    expect(arms).toEqual(["installed", "absent", "nothing"]);
    expect(new Set(arms).size).toBe(3); // no two inputs collapse to the same arm
    expect(all).toHaveLength(3);
  });

  it("is pure — same input, same arm, no argument mutation", () => {
    expect(substrateArmFor(true)).toBe(substrateArmFor(true));
    expect(substrateArmFor(null)).toBe(substrateArmFor(null));
  });
});

describe("the component delegates to the pure function rather than re-deriving the branch", () => {
  it("calls substrateArmFor and branches on its result", () => {
    // The anti-vacuous guard for the tests above: pinning a pure function proves nothing if the
    // component computes its own branch. Single-identifier matches only, per the repo rule
    // (never a formatted multi-line expression — that shape silently stopped matching after a
    // Prettier reflow twice in WP2).
    expect(infoSrc).toContain("substrateArmFor(present)");
    expect(infoSrc).toContain('arm === "nothing"');
    expect(infoSrc).toContain('arm === "absent"');
  });

  it("does NOT re-test `present` directly in the render branch", () => {
    // The exact regression this pair exists to catch: someone "simplifies" the component back
    // to `if (present === null)` / `if (!present)` in the render body, the unit tests above
    // keep passing, and the function they pin becomes decoration.
    //
    // SCOPED TO THE RENDER FUNCTION, not the whole file. A first version asserted over the
    // entire source and failed — because `substrateArmFor` legitimately contains
    // `if (present === null)` (that IS the decision), and the doc comments discuss the branch
    // in prose. A whole-file negative match cannot tell the right location from the wrong one,
    // and "fixing" it by rewording a comment would have been the wrong move.
    const renderStart = infoSrc.indexOf("export function WorkflowSubstrateInfo");
    expect(renderStart).toBeGreaterThan(-1);
    const renderBody = infoSrc.slice(renderStart);

    expect(renderBody).not.toContain("if (present === null)");
    expect(renderBody).not.toContain("if (!present)");
  });
});

describe("the consuming surface renders the block (integration boundary)", () => {
  // Phase 3's boundary is `SettingsPanel.tsx` — an EXISTING UI component whose user-visible
  // behavior changed. Per the integration-boundary rule the test set must exercise that
  // consuming surface by name, not just the new module in isolation.

  it("SettingsPanel mounts WorkflowSubstrateInfo inside the workflow-features group", () => {
    expect(panelSrc).toContain("<WorkflowSubstrateInfo");
    // Ordering: the mount must sit after the group's own id, i.e. inside that group and not
    // in Analytics/Updates. Index comparison rather than a multi-line regex.
    const groupAt = panelSrc.indexOf('id="workflow-features"');
    const mountAt = panelSrc.indexOf("<WorkflowSubstrateInfo");
    const analyticsAt = panelSrc.indexOf('id="analytics"');
    expect(groupAt).toBeGreaterThan(-1);
    expect(mountAt).toBeGreaterThan(groupAt);
    expect(mountAt).toBeLessThan(analyticsAt);
  });

  it("seeds presence from the read-only backend command", () => {
    expect(panelSrc).toContain("getWorkflowSubstrateInstalled");
  });

  it("starts at null so nothing renders before the check resolves", () => {
    // The pre-resolve default, pinned at the call site as well as in the pure function — this
    // is what makes the LOAD-BEARING null arm reachable in practice rather than theoretical.
    expect(panelSrc).toContain("useState<SubstratePresence>(null)");
  });

  it("guards the async seed against StrictMode's double mount", () => {
    // `useSettingControl`'s one applicable discipline, kept even though the rest of that hook
    // does not apply to a read-only probe with no setter and no broadcast event.
    expect(panelSrc).toContain("cancelled");
  });

  it("does NOT invent a broadcast event or poll for a directory's existence", () => {
    // The deliberate departure from `useSettingControl`: a directory's presence changes about
    // once in a user's lifetime, so there is no event to listen to and polling would be waste.
    // If a future edit adds either, it should be a conscious decision, not a copy-paste of the
    // settings-control shape.
    expect(panelSrc).not.toContain("SUBSTRATE_INSTALLED_EVENT");
    expect(panelSrc).not.toContain("setInterval");
  });
});
