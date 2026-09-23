import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import workspaceSource from "../Workspace.tsx?raw";

// M13.5 WP3 Phase 3 — the CONTROL-SIDE contract for turn navigation.
//
// ⚠️ WHAT THIS COVERS THAT NOTHING ELSE DOES. The model is proven by `turnMarkers.test.ts` (62),
// the pane's wiring by `turnNavWiring.test.ts` (9), and the runtime import contract by
// `turnNavExportContract.test.ts` (4). None of them would fail if `Workspace.tsx` rendered the
// controls wrongly — wired `disabled` to the wrong flag, left the readout visible at zero turns,
// or dropped the AC-6 push. That is the `arch.md` recurring shape one level further out: the
// machine is proven, the caller is proven, and the SURFACE the user actually touches is not.
//
// ⚠️ `cssModifierAudit.test.ts` does NOT cover these classes, and that is correct rather than a
// gap in it: its scope is `.block.is-*` MODIFIER selectors, and these are base classes plus a
// `:disabled` pseudo-class. The `.is-inert` modifier it *would* have covered is the one this phase
// deleted. So the emitted↔styled contract for the new classes needs asserting here.
//
// ⚠️ COMMENTS ARE STRIPPED FIRST. `Workspace.tsx`'s prose deliberately names `jumpInert` and
// `inertAfter` while explaining why they are gone, so an unstripped haystack would make the
// absence assertions permanently false-positive
// (`[[raw-guard-identifier-satisfied-by-own-comments]]`, inverted).
const code = workspaceSource
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

// ⚠️ CSS is read via node:fs, NOT a Vitest `?raw` import — Vite's CSS plugin intercepts `?raw`
// for `.css` and returns PROCESSED output rather than source text
// (`[[vitest-raw-import-css-returns-processed-not-text]]`).
const cssPath = fileURLToPath(new URL("../../../App.css", import.meta.url));
const css = readFileSync(cssPath, "utf8");

describe("turn-nav controls — the surface the operator touches", () => {
  it("is not vacuous — the stripped source still contains the controls", () => {
    // ⚠️ Emptiness meta-guard: several assertions below are `not.toMatch`, so an over-eager strip
    // would leave `code` empty and every absence check would pass while verifying nothing.
    // Anchored on LIVE symbols only — a meta-guard naming a removed symbol is permanently vacuous
    // (the trap found at Phase 1 verify-codify).
    expect(code).toMatch(/workspace-turn-prev/);
    expect(code).toMatch(/workspace-turn-next/);
    expect(code).toMatch(/setTurnNav/);
    expect(code.length).toBeGreaterThan(2000);
    expect(css.length).toBeGreaterThan(2000);
  });

  it("⚠️ renders BOTH controls — paired affordances, not one direction", () => {
    // design-prior [[paired-actions-need-paired-affordances]]: prev/next are inverses, so both get
    // a control of the same kind. The shipped single backward-only button is what this replaced.
    for (const id of ["workspace-turn-prev", "workspace-turn-next"]) {
      expect(code).toMatch(new RegExp(`data-testid="${id}"`));
    }
    // Same element kind for both — a button paired with a button.
    const buttons =
      code.match(/data-testid="workspace-turn-(prev|next)"/g) ?? [];
    expect(buttons.length).toBe(2);
  });

  it("⚠️ drives disabled from canPrev/canNext — the correct flag on each control", () => {
    // The failure this pins is a crossed wiring that no model test can see: `prev` disabled by
    // `canNext` looks plausible in a diff and is wrong at both ends simultaneously.
    expect(code).toMatch(
      /data-testid="workspace-turn-prev"[\s\S]{0,200}?disabled=\{!turnNav\.canPrev\}/,
    );
    expect(code).toMatch(
      /data-testid="workspace-turn-next"[\s\S]{0,200}?disabled=\{!turnNav\.canNext\}/,
    );
  });

  it("⚠️ hides the readout at zero turns (AC-5), rather than showing 0/0", () => {
    expect(code).toMatch(/turnNav\.total > 0 &&/);
    expect(code).toMatch(/\{turnNav\.ordinal\}\/\{turnNav\.total\}/);
  });

  it("⚠️ pushes fresh nav state on a recorded turn start (AC-6)", () => {
    // The shipped defect was the affordance only learning the truth from a click, then lying.
    // `XtermPane` pushes; this component stores. A poll here would be the old post-hoc shape.
    expect(code).toMatch(
      /onTurnStartRecorded=\{\(nav\) => setTurnNav\(nav\)\}/,
    );
  });

  it("⚠️ stores fresh nav state after EVERY step — both directions", () => {
    // A step that navigates but does not refresh `turnNav` leaves the ends stale: the readout
    // would drift from the position and a control could stay enabled at an end.
    const stores = code.match(/if \(next\) setTurnNav\(next\)/g) ?? [];
    expect(
      stores.length,
      "both prev and next handlers must store the re-read nav state",
    ).toBe(2);
    for (const dir of ["prev", "next"]) {
      expect(code).toMatch(
        new RegExp(
          `stepTurn\\("${dir}"\\)[\\s\\S]{0,160}?if \\(next\\) setTurnNav\\(next\\)`,
        ),
      );
    }
  });

  it("⚠️ the deleted inert-state machine is gone from the component", () => {
    // Keeping both would be two mechanisms for one job, and the inert one LIED (it explained a
    // dead click that a correct `disabled` makes impossible).
    for (const gone of ["jumpInert", "inertAfter", "jumpToPreviousTurn"]) {
      expect(
        code,
        `\`${gone}\` belongs to the deleted inert/backward-jump design and must not reappear`,
      ).not.toMatch(new RegExp(`\\b${gone}\\b`));
    }
  });

  it("⚠️ every emitted class is STYLED — the emitted↔styled contract", () => {
    // `SURFACE-2026-08-10-NO-GUARD-COUPLES-A-CSS-CLASS-TO-ITS-EMITTING-COMPONENT`: an
    // emitted-but-unstyled class was a prior CRITICAL here. cssModifierAudit covers modifiers
    // only, so these base classes need it asserted.
    for (const cls of [
      "workspace-turn-nav-btn",
      "workspace-turn-nav-readout",
    ]) {
      expect(code, `${cls} must be emitted by Workspace.tsx`).toMatch(
        new RegExp(`className="${cls}"`),
      );
      expect(css, `${cls} must have a base rule in App.css`).toMatch(
        new RegExp(`\\.${cls}\\s*\\{`),
      );
    }
    // AC-4's disabled styling must exist, and must not offer a pointer cursor on an inert control
    // (a pointer there is the same lie the deleted `.is-inert` told).
    expect(css).toMatch(/\.workspace-turn-nav-btn:disabled\s*\{/);
    const disabledRule = css.slice(
      css.indexOf(".workspace-turn-nav-btn:disabled"),
      css.indexOf(".workspace-turn-nav-btn:disabled") + 220,
    );
    expect(disabledRule).toMatch(/cursor:\s*default/);
  });

  it("⚠️ the DELETED classes are gone from BOTH sides", () => {
    for (const cls of ["workspace-jump-turn-btn"]) {
      expect(code).not.toMatch(new RegExp(`className="[^"]*${cls}`));
      expect(css).not.toMatch(new RegExp(`\\.${cls}\\s*\\{`));
    }
    // The `.is-inert` modifier rule must be gone too — dead CSS carrying a retired behaviour.
    expect(css).not.toMatch(/\.workspace-jump-turn-btn\.is-inert\s*\{/);
  });

  it("⚠️ the controls are UNGATED (AC-10) — outside the skill-button row", () => {
    // The skill row is gated wholesale by `showSkillButtons`; putting these inside it would make
    // them vanish whenever the workflow gate is off. A turn is a plain Claude Code concept.
    const prevAt = code.indexOf('data-testid="workspace-turn-prev"');
    const splitAt = code.indexOf('data-testid="workspace-split-control"');
    expect(prevAt).toBeGreaterThan(-1);
    expect(splitAt).toBeGreaterThan(-1);
    expect(
      prevAt,
      "the controls must sit INSIDE the ungated split-control cluster (after its opening tag)",
    ).toBeGreaterThan(splitAt);
    // And must not be inside a workflow-gate conditional.
    const window = code.slice(Math.max(0, prevAt - 600), prevAt);
    expect(window).not.toMatch(/showSkillButtons|workflowEnabled/);
  });
});
