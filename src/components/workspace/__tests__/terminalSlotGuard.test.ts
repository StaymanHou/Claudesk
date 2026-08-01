import { describe, expect, it } from "vitest";
import { AVAILABLE_PANELS, availablePanels } from "../panelHost";
// Vite ?raw import: bundles RightPanelHost's source text at test time — works in
// vitest with NO node:fs / @types/node dependency (the repo convention; same trick
// as probe/__tests__/replay.test.ts).
import hostSource from "../RightPanelHost.tsx?raw";

/** Strip comments before matching source text.
 *
 * Mirrors the helper in `src/state/__tests__/offInvariantGuard.test.ts` (local to that
 * file, so duplicated rather than imported from a test module). Load-bearing here for the
 * same reason it is there: a guard that matches an identifier against RAW source can be
 * satisfied by the module's own PROSE, which makes it vacuous exactly when the code it
 * describes has been deleted. Proven by mutation in this file's M11 WP2 suite below.
 */
function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

// SURFACE-2026-06-20-QUALITY-WP5-TERMINAL-SEAM-UNTESTED guard.
//
// The failure mode this test exists to prevent: `selectPanel` can return a panel
// (e.g. "terminal") for which RightPanelHost renders NO mounted slot — so the right
// half goes blank. The fix discipline (WP9) is "add to AVAILABLE_PANELS + mount the
// slot + the tab in the SAME change." This test enforces the invariant structurally
// without pulling in jsdom/RTL (repo posture: pure logic → vitest, live DOM →
// Playwright verify-self): for EVERY panel in AVAILABLE_PANELS, RightPanelHost's
// source must (a) gate a `.right-panel-slot` on `panel === "<name>"` and (b) expose a
// clickable `panel-tab-<name>` tab. The live "the slot is non-empty on screen" check
// is the Phase-1 verify-self Browser observable outcome.

describe("RightPanelHost mounts a slot + tab for every available panel", () => {
  it.each([...AVAILABLE_PANELS])(
    "panel '%s' has a display-gated slot",
    (panel) => {
      // The slot is rendered with `display: panel === "<name>" ? ... : "none"`.
      expect(hostSource).toContain(`panel === "${panel}"`);
    },
  );

  it.each([...AVAILABLE_PANELS])("panel '%s' has a selectable tab", (panel) => {
    expect(hostSource).toContain(`panel-tab-${panel}`);
  });

  it("renders the terminal pane component (not a placeholder)", () => {
    // The specific regression: AVAILABLE_PANELS gained "terminal" but the slot was
    // never wired to a real pane. Assert the TerminalPane is mounted.
    expect(hostSource).toContain("<TerminalPane");
  });
});

// Theme E (WP6) — the panel-tab row is a WAI-ARIA tablist; each tab must point at its
// panel via aria-controls, and the matching panel must be role=tabpanel labelled back
// by the tab. A drift (tab's aria-controls with no matching tabpanel id) is an a11y
// dead-link that ships green; this pins the id pairing structurally (same ?raw idiom).
describe("RightPanelHost panel tabs are aria-wired to their tabpanels", () => {
  // The source builds the ids as workspace-scoped template literals, e.g.
  //   id={`panel-editor-${workspaceId}`}  /  aria-controls={`panel-editor-${workspaceId}`}
  // We match the literal `panel-<name>-` / `paneltab-<name>-` prefixes (the `${workspaceId}`
  // suffix varies at runtime), which is enough to pin tab↔panel id agreement per panel.
  it.each([...AVAILABLE_PANELS])(
    "tab '%s' aria-controls a matching role=tabpanel slot",
    (panel) => {
      // Tab declares the relationship + carries a stable id the panel labels back to…
      expect(hostSource).toContain(`aria-controls={\`panel-${panel}-`);
      expect(hostSource).toContain(`id={\`paneltab-${panel}-`);
      // …and the slot is that tabpanel target, labelled by the tab.
      expect(hostSource).toContain(`id={\`panel-${panel}-`);
      expect(hostSource).toContain(`aria-labelledby={\`paneltab-${panel}-`);
    },
  );

  it("the panel-tab row and each slot carry the tablist/tabpanel roles", () => {
    expect(hostSource).toContain('role="tablist"');
    expect(hostSource).toContain('role="tabpanel"');
  });
});

// M11 WP2 — the same slot+tab invariant for the GATED panels.
//
// ⚠️ Why a separate block: the suites above iterate `AVAILABLE_PANELS`, which is now the
// OFF-state set, so a gated panel is (correctly) NOT covered there — it has no
// unconditional slot to find. Without this block, adding a gated panel would silently
// escape the "never blank" guard that the whole file exists to enforce.
//
// The contract differs by exactly one clause: a gated panel's slot and tab must be
// wrapped in the gate, so they do not exist while it is off. Everything else — the
// display gating, the aria pairing, a real component in the slot — is identical.
describe("RightPanelHost mounts a GATED slot + tab for every gate-only panel", () => {
  const gatedOnly = availablePanels(true).filter(
    (p) => !availablePanels(false).includes(p),
  );

  it("there is at least one gated panel — otherwise this suite is vacuous", () => {
    expect(gatedOnly.length).toBeGreaterThan(0);
  });

  it.each([...gatedOnly])(
    "gated panel '%s' has a display-gated slot",
    (panel) => {
      expect(hostSource).toContain(`panel === "${panel}"`);
    },
  );

  it.each([...gatedOnly])("gated panel '%s' has a selectable tab", (panel) => {
    expect(hostSource).toContain(`panel-tab-${panel}`);
  });

  it.each([...gatedOnly])(
    "gated panel '%s' is aria-wired tab↔tabpanel like its ungated siblings",
    (panel) => {
      expect(hostSource).toContain(`aria-controls={\`panel-${panel}-`);
      expect(hostSource).toContain(`id={\`paneltab-${panel}-`);
      expect(hostSource).toContain(`id={\`panel-${panel}-`);
      expect(hostSource).toContain(`aria-labelledby={\`paneltab-${panel}-`);
    },
  );

  it("renders the DocsPanel component in the slot (not a placeholder)", () => {
    expect(hostSource).toContain("<DocsPanel");
  });

  it("reads the gate through the seam hook, and reconciles a front panel against it", () => {
    // ⚠️ COMMENTS STRIPPED FIRST — this is load-bearing, not tidiness. The first version
    // of this test asserted the bare identifier `reconcilePanel` against the raw source,
    // and a verify-self mutation proved it VACUOUS: deleting the actual call site left
    // two prose mentions in this file's own comments, and the test stayed green while
    // reconciliation was entirely defeated. `offInvariantGuard.test.ts` added the same
    // stripComments step for exactly this reason; the lesson did not transfer here until
    // a mutation forced it.
    //
    // Runtime behavior (what reconcilePanel RETURNS) is pinned as pure-function values in
    // panelHost.test.ts. What this asserts is that the host actually CALLS it.
    const code = stripComments(hostSource);
    expect(code).toContain("useWorkflowFeaturesEnabled(");
    // The call, not the identifier: `reconcilePanel(` cannot be satisfied by prose.
    expect(code).toContain("reconcilePanel(");
    // And the derived value is what the UI reads — `storedPanel` must be the write
    // target only, never rendered directly.
    expect(code).toMatch(/const\s+panel\s*=\s*reconcilePanel\(/);
  });

  it.each([...gatedOnly])(
    "gated panel '%s' tab and slot are INSIDE a gate branch, not merely present",
    (panel) => {
      // ⚠️ The gap a verify-self mutation exposed: asserting that `panel-tab-docs`
      // EXISTS passes just as well when the tab renders unconditionally — a dead
      // affordance while the gate is OFF, which is the precise shape M10.9's seam
      // contract forbids by name. Presence is not gating.
      //
      // Both the tab and the slot must sit inside a `{workflowFeaturesEnabled && ...}`
      // branch. Asserted by locating each element and scanning BACKWARD for the nearest
      // gate opener, so the check follows the real JSX nesting rather than a fixed
      // offset that Prettier could reflow away.
      const code = stripComments(hostSource);
      const GATE = "workflowFeaturesEnabled && (";

      for (const marker of [
        `panel-tab-${panel}`,
        `right-panel-slot--${panel}`,
      ]) {
        const at = code.indexOf(marker);
        expect(at, `${marker} not found in RightPanelHost`).toBeGreaterThan(-1);
        const before = code.slice(0, at);
        const gateAt = before.lastIndexOf(GATE);
        expect(
          gateAt,
          `${marker} is rendered WITHOUT an enclosing \`${GATE}\` branch — a gated ` +
            `surface must not exist while the gate is off (not hidden, not disabled)`,
        ).toBeGreaterThan(-1);
        // Anti-false-positive: the nearest gate opener must come AFTER the previous
        // sibling slot, i.e. it really encloses this element rather than being some
        // earlier unrelated branch.
        //
        // ⚠️ SCOPE, measured at code review (2026-08-01) — this clause is load-bearing
        // for the SLOT marker only. For `panel-tab-docs` the terminal slot does not
        // appear earlier in the file (the tab row precedes every slot), so `prevSlot`
        // is -1 and the assertion degenerates into a duplicate of the `> -1` check
        // above. The tab's gating is still genuinely caught — by that first assertion,
        // mutation-proved — but do not read this second one as covering both markers.
        const prevSlot = before.lastIndexOf(
          "right-panel-slot right-panel-slot--terminal",
        );
        expect(
          gateAt,
          `the nearest \`${GATE}\` before ${marker} precedes the terminal slot, so it ` +
            `does not enclose it — the gate branch is in the wrong place`,
        ).toBeGreaterThan(prevSlot);
      }
    },
  );
});
