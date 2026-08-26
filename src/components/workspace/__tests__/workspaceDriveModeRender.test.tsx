// @vitest-environment jsdom
//
// ⚠️ Needed because `Workspace` reads browser globals through its hooks. Scoped per-file rather
// than flipping the project default — same reasoning as `projectModelCellRender.test.tsx`.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
});

describe("the confirm's write decision is honored by its CALLER", () => {
  it("resolveDriveMode gates on driveModeWriteFor's persist, not on the outcome directly", () => {
    // ⚠️ A NARROW SOURCE GUARD, and the narrowness is deliberate — read before widening it.
    //
    // At verify-codify two mutants were probed. The first (Cancel persisting) is now killed by a
    // VALUE test on `driveModeWriteFor`. The second — the CALLER ignoring that decision and
    // persisting regardless — still passed all 2258 tests, because the handler is an inline
    // `useCallback` whose write behavior nothing can observe: server rendering reaches only the
    // gate-OFF shape, so the dialog and its buttons never mount in a test.
    //
    // ⚠️ This is the standing limitation, not a shortcut: `arch.md` says a `?raw` guard cannot
    // express a BEHAVIORAL property. What it CAN express is a STRUCTURAL coupling — that the
    // caller reads the decision at all — and that is exactly the mutant's shape. It would still
    // pass if `persist` were used wrongly, so it is a floor, not a proof. The real proof is the
    // operator's live verify-human run, recorded in the WIP.
    const src = readFileSync(
      join(process.cwd(), "src", "components", "workspace", "Workspace.tsx"),
      "utf8",
    );
    // Strip comments — this file's own prose names the identifiers, and a comment must not
    // satisfy the assertion on the code's behalf
    // (`[[raw-guard-identifier-satisfied-by-own-comments]]`, hit 3x in this repo).
    const code = src
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    expect(
      code,
      "Workspace.tsx must destructure `persist` from driveModeWriteFor — if the caller stops " +
        "reading the decision, Cancel can persist while every value test on the table stays green",
    ).toMatch(/const \{ persist \} = driveModeWriteFor\(/);
    expect(
      code,
      "the persist flag must GATE the write — a destructure that is never used is the same " +
        "bypass with extra steps",
    ).toMatch(/!persist/);
  });
});

describe("the broadcast subscriber filters by project path", () => {
  it("Workspace.tsx compares the payload path before applying a broadcast mode", () => {
    // ⚠️ REGRESSION GUARD for a gap found at Phase 4's verify-codify (Phase 3's own verify-codify
    // never ran — the F12 back-loop diverted to plan first). Dropping the path check passes 2259
    // tests, and the defect it admits is silent CROSS-PROJECT CORRUPTION: `PROJECT_DRIVE_MODE_EVENT`
    // is per-project (unlike the permission mode's app-global bare enum), so an unfiltered
    // subscriber makes ONE project's change rewrite EVERY open workspace's readout.
    //
    // ⚠️ Source-shaped for the same reason as the guard above: the subscriber is an inline effect
    // whose behaviour needs a mounted workspace plus a live Tauri event, neither of which server
    // rendering provides. Structural coupling is expressible; the behaviour is not. Floor, not
    // proof — the operator's live run (recorded in the WIP: scratch-b/scratch-c stayed `None`
    // while scratch-a changed) is the real evidence.
    const src = readFileSync(
      join(process.cwd(), "src", "components", "workspace", "Workspace.tsx"),
      "utf8",
    );
    const code = src
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    expect(
      code,
      "the PROJECT_DRIVE_MODE_EVENT subscriber must compare `e.payload.path` against this " +
        "workspace's project_path — without it, one project's mode change rewrites every open " +
        "workspace's readout",
    ).toMatch(/e\.payload\.path !== workspace\.project_path/);
  });
});
