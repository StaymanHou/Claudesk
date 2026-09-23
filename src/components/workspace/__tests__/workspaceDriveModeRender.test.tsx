// @vitest-environment jsdom
//
// ⚠️ Needed because `Workspace` reads browser globals through its hooks. Scoped per-file rather
// than flipping the project default — same reasoning as `projectModelCellRender.test.tsx`.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { Workspace } from "../Workspace";
import type { Workspace as WorkspaceModel } from "../../../state/workspace";

// M13.5 WP4 P2 verify-codify — the RENDER SITE honors the gate, not just the derivation.
//
// ── ⚠️ WHY THIS FILE EXISTS: a real gap, measured, not hypothetical ────────────────
// At verify-codify, a gate bypass was applied and **all 2239 tests passed.** Two routes were
// then proven separately, each with a CLEAN (non-crashing) mutant:
//
//   1. derivation-side — `workspaceDriveModeReadout` stops honoring `gateEnabled`;
//   2. render-site — `Workspace.tsx` keeps the derivation but reads through `?.`, falling back
//      to the raw stored value when it returns null.
//
// ⚠️ **The first mutant tried was crude and its "pass" was worthless**: a `||` fallback left the
// JSX dereferencing a null, so the component THREW and all three tests failed — including the
// positive control. Three failures looked like strong coverage and were actually a crash. The
// mutants above render cleanly, and each fails EXACTLY ONE test (this file's first) while the
// positive control and the ungated-siblings check pass — which is what makes the failure
// attributable to the gate rather than to nothing having rendered
// (`[[verify-the-mutation-landed]]`).
//
// `workspaceDriveModeReadout` was already mutation-proven (its own unit tests) AND guarded by
// the OFF-invariant guard's arm 6. Both prove the DERIVATION. Neither could see that the
// CALLER stopped honoring it — `arch.md`'s most-repeated defect shape, stated there verbatim:
// *"a mechanism correct in itself sitting behind a caller that does not honor it."* Arm 6 asserts
// a computed VALUE; only rendering the real component closes the caller side.
//
// This is also what the integration-boundary rule demands of this phase: `Workspace.tsx` is an
// existing UI component, so the test set must exercise the CONSUMING SURFACE, not only the new
// module.
//
// ── ⚠️ What server rendering can and cannot prove here ─────────────────────────────
// CAN: the resting DOM — that the gated element is ABSENT rather than hidden or disabled.
// CANNOT: anything needing an event, a state transition, or a resolved IPC promise.
//      `useWorkflowFeaturesEnabled` seeds asynchronously and returns its restrictive pre-seed
//      default (`false`) here, so **only the gate-OFF shape is reachable** — exactly as
//      `projectModelCellRender.test.tsx` documents for the picker cell.
//
// That limit is not a weakness for this particular property: gate-OFF is the shape the mutant
// broke, and it is the invariant that matters most (a non-workflow user must get a header
// byte-identical to a build that never had the feature). The gate-ON readout, the stale marker,
// and the tooltip were verified LIVE via the MCP bridge and are recorded in the WIP — that is
// the real evidence for those, and this file does not replace it.

function workspaceFixture(
  overrides: Partial<WorkspaceModel> = {},
): WorkspaceModel {
  return {
    id: "ws-1",
    project_path: "/tmp/scratch/scratch-a",
    cc_session_id: "cc-1",
    status: "idle",
    display_name: "scratch-a",
    pending_action: null,
    open_intent: "fire",
    ...overrides,
  } as WorkspaceModel;
}

function renderWorkspaceHeader(overrides: Partial<WorkspaceModel> = {}) {
  const html = renderToStaticMarkup(
    <Workspace workspace={workspaceFixture(overrides)} visible={true} />,
  );
  return new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
}

describe("Workspace header — the drive-mode readout's render site", () => {
  it("renders NO drive-mode readout while the gate is OFF", () => {
    // ⚠️ THE MUTANT-CATCHER. A render site that falls back to the raw stored value when the
    // derivation returns null passes every other test in the suite; it fails here.
    const doc = renderWorkspaceHeader();

    expect(
      doc.querySelector('[data-testid="workspace-header-drivemode"]'),
      "the drive-mode readout must not exist in the DOM while the gate is OFF — not hidden, " +
        "not disabled, not an empty reserved slot. If this fails, the RENDER SITE stopped " +
        "honoring workspaceDriveModeReadout's null (the derivation itself is covered by the " +
        "OFF-invariant guard's arm 6 and would still be green).",
    ).toBeNull();

    // The stale marker is a child of the readout, so it must be absent too — asserted
    // separately because a future refactor could hoist it out of that subtree.
    expect(
      doc.querySelector('[data-testid="workspace-header-drivemode-stale"]'),
    ).toBeNull();
  });

  it("is not vacuous — the header itself DID render", () => {
    // ⚠️ THE POSITIVE CONTROL, and it is the whole reason the assertion above means anything.
    // A `querySelector` returning null proves nothing if the component threw, rendered nothing,
    // or the fixture was malformed — the null would then be caused by the absence of a header
    // rather than by the gate.
    //
    // This is not a theoretical concern: at Phase 2 verify-self the subagent hit exactly this
    // shape in a backend-less page and CORRECTLY refused to report the gate-OFF outcome as a
    // pass, because its null came from no workspace existing at all.
    const doc = renderWorkspaceHeader();

    expect(
      doc.querySelector('[data-testid="workspace-header"]'),
      "the workspace header did not render at all — every absence assertion in this file is " +
        "vacuous until this passes",
    ).not.toBeNull();
    expect(doc.querySelector(".workspace-header-name")?.textContent).toBe(
      "scratch-a",
    );
  });

  it("the UNGATED header siblings survive the gate being OFF", () => {
    // ⚠️ Proves the gate is scoped PER ARM rather than a blanket wipe of the header. The
    // turn-nav controls are deliberately ungated (a "turn" is a plain Claude Code concept that
    // exists for every user, with or without ~/.claude/skills/), so if they vanish alongside
    // the drive-mode readout, the gate has been applied too broadly — the exact over-reach
    // arch.md warns about with "the gate applies PER ARM, by applicability, never by audience
    // size".
    const doc = renderWorkspaceHeader();

    expect(
      doc.querySelector('[data-testid="workspace-split-control"]'),
      "the split control is ungated and must survive a closed gate",
    ).not.toBeNull();
    // And the gated siblings are gone, confirming this render really is in the OFF state.
    expect(doc.querySelector('[data-testid="workspace-skill-row"]')).toBeNull();
  });

  // M13.5 WP5 P2 verify-codify — the ungated NAV BUTTONS, not just their container.
  //
  // ⚠️ WHY THIS IS NOT REDUNDANT WITH THE TEST ABOVE: that one asserts
  // `workspace-split-control` survives. The split control is a CONTAINER — it also holds the
  // collapse/cycle buttons, so it can survive intact while WP3's turn-nav buttons vanish from
  // inside it, and every existing assertion would still pass. WP5's exit-verify observed the
  // nav LIVE in a real header; this pins the same property mechanically.
  //
  // ⚠️ AND WHY THE SIBLING ASSERTION IS `contains`, NOT two independent lookups: two separate
  // `not.toBeNull()` checks would pass if a refactor moved the nav OUT of the split control to
  // somewhere else in the header. The live observation was specifically that the nav renders
  // *inside* the ungated cluster — which is what makes it ungated in the first place (the
  // skill row is gated wholesale, so an ungated affordance must not live there). Verified
  // reachable in server render before writing this: both testids are present and nested.
  //
  // ⚠️ SCOPE LIMIT, stated rather than implied: this is the gate-OFF shape only, per this
  // file's header — `useWorkflowFeaturesEnabled` returns its restrictive pre-seed default in
  // server rendering, so the gate-ON *coexistence* of all four M13.5 surfaces is NOT writable
  // in this harness and is NOT claimed here. That property's evidence is the live MCP-bridge
  // observation recorded in the WP5 WIP, and it stays that way.
  it("WP3's turn-nav buttons render INSIDE the ungated split control", () => {
    const doc = renderWorkspaceHeader();

    const splitControl = doc.querySelector(
      '[data-testid="workspace-split-control"]',
    );
    expect(splitControl, "the ungated container must exist").not.toBeNull();

    for (const id of ["workspace-turn-prev", "workspace-turn-next"]) {
      const btn = doc.querySelector(`[data-testid="${id}"]`);
      expect(
        btn,
        `${id} is ungated (a "turn" exists for every Claude Code user) and must render with the gate OFF`,
      ).not.toBeNull();
      expect(
        splitControl!.contains(btn),
        `${id} must live INSIDE the ungated split control, not merely somewhere in the header — the gated skill row is not a legal home for an ungated affordance`,
      ).toBe(true);
    }
  });
});

// The two BEHAVIOURAL properties that used to be source guards here — the broadcast path filter
// and Cancel writing nothing — are now driven on a live mount in `workspaceDriveModeLive.test.tsx`
// (paydown 2026-09-23 WP7, H4).
