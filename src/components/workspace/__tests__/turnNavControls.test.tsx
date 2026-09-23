// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  click,
  mountWorkspace,
  pane,
  pushTurnStart,
  uncaught,
  unmountWorkspace,
} from "./liveWorkspace";

vi.mock(
  "../XtermPane",
  async () => (await import("./liveWorkspace")).xtermPaneModule,
);
vi.mock(
  "../RightPanelHost",
  async () => (await import("./liveWorkspace")).rightPanelModule,
);
vi.mock(
  "../../../state/useWorkflowFeaturesEnabled",
  async () => (await import("./liveWorkspace")).gateModule,
);

// M13.5 WP3 Phase 3 — the CONTROL-SIDE contract for turn navigation, rebuilt at paydown
// 2026-09-23 WP7 (I1) on a live mount of the real `Workspace`.
//
// ⚠️ WHAT THIS COVERS THAT NOTHING ELSE DOES. The model is proven by `turnMarkers.test.ts`, the
// pane's wiring by `turnNavWiring.test.ts`, and the runtime import contract by
// `turnNavExportContract.test.ts`. None of them would fail if `Workspace.tsx` rendered the controls
// wrongly: `disabled` wired to the wrong flag, the readout visible at zero turns, or the AC-6 push
// dropped. This file drives those through the DOM.
//
// It replaced ten `?raw` source-grep arms. Those could not see a rendered attribute, broke on a
// Prettier reflow, and could not reach any state but the one in the source text. The pane is a stub
// (see `liveWorkspace.tsx`), so a test pushes turn-starts and answers `turnNavState()` exactly as
// the real pane would.

const nav = (
  canPrev: boolean,
  canNext: boolean,
  ordinal: number,
  total: number,
) => ({
  canPrev,
  canNext,
  ordinal,
  total,
});

const q = (el: ParentNode, id: string) =>
  el.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`);

afterEach(async () => {
  await unmountWorkspace();
  expect(uncaught).toEqual([]);
});

describe("turn-nav controls — the surface the operator touches", () => {
  it("renders BOTH controls as buttons, inside the ungated split control", async () => {
    // design-prior [[paired-actions-need-paired-affordances]]: prev/next are inverses, so both get
    // a control of the same kind.
    const el = await mountWorkspace({ gate: true });
    const split = q(el, "workspace-split-control");
    expect(split, "positive control: the header rendered").not.toBeNull();
    for (const id of ["workspace-turn-prev", "workspace-turn-next"]) {
      const btn = q(el, id);
      expect(btn?.tagName).toBe("BUTTON");
      expect(split!.contains(btn)).toBe(true);
    }
  });

  it("⚠️ at rest (zero turns): both disabled, and an EMPTY readout rather than 0/0 (AC-5)", async () => {
    const el = await mountWorkspace({ gate: true });
    expect(q(el, "workspace-turn-prev")!.disabled).toBe(true);
    expect(q(el, "workspace-turn-next")!.disabled).toBe(true);
    expect(q(el, "workspace-turn-readout")?.textContent).toBe("");
    expect(q(el, "workspace-turn-readout")?.hasAttribute("title")).toBe(false);
    expect(el.textContent).not.toContain("0/0");
  });

  it("⚠️ the FIRST turn is announced: the live region exists before its first value (I6)", async () => {
    // A screen reader announces CHANGES to a live region that is already in the tree. A region that
    // mounts together with its first value is not a change, so the first turn went unannounced.
    // Identity is the property: the node at rest must be the SAME node that later holds "1/1".
    const el = await mountWorkspace({ gate: true });
    const atRest = q(el, "workspace-turn-readout");
    expect(atRest?.getAttribute("aria-live")).toBe("polite");
    await pushTurnStart(nav(false, false, 1, 1));
    const after = q(el, "workspace-turn-readout");
    expect(after?.textContent).toBe("1/1");
    expect(after).toBe(atRest);
  });

  it("⚠️ disabled tracks EACH flag — the correct flag on each control", async () => {
    // The failure this pins is a crossed wiring: `prev` disabled by `canNext` looks plausible in a
    // diff and is wrong at both ends. Two asymmetric states tell the two flags apart; a symmetric
    // one (the at-rest state) cannot.
    const el = await mountWorkspace({ gate: true });
    await pushTurnStart(nav(true, false, 3, 3));
    expect(q(el, "workspace-turn-prev")!.disabled).toBe(false);
    expect(q(el, "workspace-turn-next")!.disabled).toBe(true);
    await pushTurnStart(nav(false, true, 1, 3));
    expect(q(el, "workspace-turn-prev")!.disabled).toBe(true);
    expect(q(el, "workspace-turn-next")!.disabled).toBe(false);
  });

  it("⚠️ a recorded turn start updates the controls BEFORE any click (AC-6)", async () => {
    // The shipped defect was the affordance only learning the truth from a click, then lying.
    const el = await mountWorkspace({ gate: true });
    await pushTurnStart(nav(true, false, 2, 2));
    const readout = q(el, "workspace-turn-readout");
    expect(readout?.textContent).toBe("2/2");
    expect(readout?.getAttribute("title")).toBe("Turn 2 of 2");
    expect(pane.steps).toEqual([]);
  });

  for (const dir of ["prev", "next"] as const) {
    it(`⚠️ a ${dir} click steps the pane and stores the RE-READ state`, async () => {
      // A step that navigates but does not refresh the nav state leaves the ends stale: the readout
      // drifts from the position and a control can stay enabled at an end.
      const el = await mountWorkspace({ gate: true });
      await pushTurnStart(nav(true, true, 2, 3));
      pane.navAfterStep =
        dir === "prev" ? nav(false, true, 1, 3) : nav(true, false, 3, 3);
      await click(q(el, `workspace-turn-${dir}`));
      expect(pane.steps).toEqual([dir]);
      expect(q(el, "workspace-turn-readout")?.textContent).toBe(
        dir === "prev" ? "1/3" : "3/3",
      );
      expect(q(el, `workspace-turn-${dir}`)!.disabled).toBe(true);
    });
  }

  it("⚠️ the controls render AND work with the workflow gate OFF (AC-10)", async () => {
    // A "turn" is a plain Claude Code concept, so these must not vanish with the gate. The gated
    // skill row is absent in the same render, which proves this really is the OFF state.
    const el = await mountWorkspace({ gate: false });
    expect(q(el, "workspace-skill-row")).toBeNull();
    await pushTurnStart(nav(true, false, 1, 1));
    pane.navAfterStep = nav(false, false, 1, 1);
    await click(q(el, "workspace-turn-prev"));
    expect(pane.steps).toEqual(["prev"]);
    expect(q(el, "workspace-turn-readout")?.textContent).toBe("1/1");
  });
});

// ⚠️ CSS is read via node:fs, NOT a Vitest `?raw` import — Vite's CSS plugin intercepts `?raw`
// for `.css` and returns PROCESSED output rather than source text
// (`[[vitest-raw-import-css-returns-processed-not-text]]`). "Does App.css carry this rule" IS a
// question about source text, so a source read is the right instrument for this half.
const css = readFileSync(join(process.cwd(), "src", "App.css"), "utf8");

describe("the emitted ↔ styled contract", () => {
  it("every class the controls EMIT has a base rule in App.css", async () => {
    // `SURFACE-2026-08-10-NO-GUARD-COUPLES-A-CSS-CLASS-TO-ITS-EMITTING-COMPONENT`: an
    // emitted-but-unstyled class was a prior CRITICAL here. `cssModifierAudit` covers `.is-*`
    // modifiers only, so these base classes are asserted here — read off the RENDERED DOM.
    const el = await mountWorkspace({ gate: true });
    await pushTurnStart(nav(true, false, 1, 1));
    const emitted = new Set<string>();
    for (const id of [
      "workspace-turn-prev",
      "workspace-turn-next",
      "workspace-turn-readout",
    ]) {
      q(el, id)!.classList.forEach((c) => emitted.add(c));
    }
    expect([...emitted].sort()).toEqual([
      "workspace-turn-nav-btn",
      "workspace-turn-nav-readout",
    ]);
    for (const cls of emitted) {
      expect(css, `${cls} must have a base rule in App.css`).toMatch(
        new RegExp(`\\.${cls}\\s*\\{`),
      );
    }
    // AC-4: a disabled control must not offer a pointer cursor (the lie the deleted `.is-inert`
    // told).
    const at = css.indexOf(".workspace-turn-nav-btn:disabled");
    expect(at).toBeGreaterThan(-1);
    expect(css.slice(at, at + 220)).toMatch(/cursor:\s*default/);
  });

  it("the DELETED backward-jump button is gone from BOTH the DOM and the CSS", async () => {
    const el = await mountWorkspace({ gate: true });
    expect(el.querySelector(".workspace-jump-turn-btn")).toBeNull();
    expect(el.querySelector(".is-inert")).toBeNull();
    // Rule-shaped on purpose: App.css still NAMES the class in a comment recording its removal.
    expect(css).not.toMatch(/\.workspace-jump-turn-btn\s*\{/);
    expect(css).not.toMatch(/\.workspace-jump-turn-btn\.is-inert\s*\{/);
  });
});
