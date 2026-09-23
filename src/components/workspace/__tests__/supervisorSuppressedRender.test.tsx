// @vitest-environment jsdom
//
// ⚠️ Needed because `Workspace` reads browser globals through its hooks. Scoped per-file rather
// than flipping the project default — same reasoning as `workspaceDriveModeRender.test.tsx`,
// which this file deliberately mirrors.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { Workspace } from "../Workspace";
import type { Workspace as WorkspaceModel } from "../../../state/workspace";

// M14 WP0 Phase 3 (D-5) verify-codify — the SUPPRESSED marker's RENDER SITE honors the gate.
//
// ── ⚠️ WHY THIS FILE EXISTS: the caller-side gap, not the derivation ───────────────
// Phase 3 shipped three kinds of coverage for the suppressed marker, and none of them render
// the component:
//
//   1. `workspaceSupervisor.test.ts` — the DERIVATION. Four D-5 cases, mutation-proven.
//   2. `unsentInput.test.ts` — the WATERMARK's transition-only notify contract, mutation-proven.
//   3. `supervisorToggleStyles.test.ts` — a SOURCE-TEXT guard: the emitted class has a CSS rule
//      and no rule is orphaned. It reads `Workspace.tsx` as a STRING.
//
// ⚠️ All three are green if the render site stops honoring the derivation's `null`. That is
// `arch.md`'s most-repeated defect shape, stated there verbatim: *"a mechanism correct in itself
// sitting behind a caller that does not honor it."* It is also the local four-times defect the
// plan called out at P1.5 — extracting a state machine proves the MACHINE, not its CALLER.
//
// A source-text guard cannot close this: it asserts the class NAME appears in the file, which is
// satisfied whether or not the surrounding conditional is still correct. Only rendering the real
// component reaches the caller.
//
// ── ⚠️ What server rendering can and cannot prove here ─────────────────────────────
// CAN: the resting DOM — that the gated element is ABSENT rather than hidden or disabled.
// CANNOT: anything needing an event, a state transition, or a resolved IPC promise.
//      `useWorkflowFeaturesEnabled` seeds asynchronously and returns its restrictive pre-seed
//      default (`false`) here, so **only the gate-OFF shape is reachable** — exactly as
//      `workspaceDriveModeRender.test.tsx` and `projectModelCellRender.test.tsx` document.
//
// ⚠️ **That limit is why this file does NOT assert the marker's PRESENCE.** The appear-on-type /
// disappear-on-Esc cycle was verified LIVE via the MCP bridge at Phase 3 verify-self (marker
// nodes 0→1→0, glyph absent from `document.body.innerText` entirely, positive control held at 1
// across every read) and by the operator hands-on at verify-human. That is the real evidence for
// the ON shape; this file does not replace it and must not be read as the whole story.
//
// What this file DOES close: the marker is a NEW gated element, and the OFF invariant is that a
// non-workflow user gets a header byte-identical to a build that never had the feature. A marker
// that leaked through a closed gate would be a visible artifact of a feature the user never
// opted into.

function workspaceFixture(
  overrides: Partial<WorkspaceModel> = {},
): WorkspaceModel {
  return {
    id: "ws-1",
    project_path: "/tmp/scratch/scratch-a",
    cc_session_id: "cc-1",
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

describe("Workspace header — the SUPPRESSED marker's render site", () => {
  it("renders NO suppressed marker while the gate is OFF", () => {
    // ⚠️ THE MUTANT-CATCHER. The marker is nested inside the supervisor badge, so a render site
    // that hoisted it out of that subtree — or that read the watermark ref directly instead of
    // the derivation — would leak a ⏸ into a header the gate is supposed to have emptied.
    // Asserted SEPARATELY from the parent badge below, because nesting is an implementation
    // detail a refactor can change while every source-text guard stays green.
    const doc = renderWorkspaceHeader();

    expect(
      doc.querySelector(
        '[data-testid="workspace-header-supervisor-suppressed"]',
      ),
      "the suppressed marker must not exist in the DOM while the gate is OFF — not hidden, " +
        "not disabled, not an empty reserved slot. If this fails, the RENDER SITE stopped " +
        "honoring workspaceSupervisorReadout's null (the derivation itself is mutation-proven " +
        "in workspaceSupervisor.test.ts and would still be green).",
    ).toBeNull();
  });

  it("renders NO supervisor badge at all while the gate is OFF", () => {
    // The marker's parent. Absent for the same reason — `workspaceSupervisorReadout` returns
    // null before it ever computes `suppressed`, so the whole badge is gone, not just its child.
    const doc = renderWorkspaceHeader();

    expect(
      doc.querySelector('[data-testid="workspace-header-supervisor"]'),
    ).toBeNull();
  });

  it("⚠️ the marker's GLYPH appears nowhere in the rendered header", () => {
    // ⚠️ NOT redundant with the two testid assertions above. Those pin the element; this pins
    // the user-visible ARTIFACT. A render site that dropped the data-testid while keeping the
    // glyph — or that moved the ⏸ into the badge's own text — passes both assertions above and
    // still shows the operator a mark from a feature they never enabled.
    //
    // This mirrors the live verify-self check, which asserted the glyph was absent from
    // `document.body.innerText` rather than trusting the node count alone.
    const doc = renderWorkspaceHeader();

    expect(doc.body.textContent ?? "").not.toContain("⏸");
  });

  it("is not vacuous — the header itself DID render", () => {
    // ⚠️ THE POSITIVE CONTROL, and it is the whole reason the assertions above mean anything.
    // A `querySelector` returning null proves nothing if the component threw, rendered nothing,
    // or the fixture was malformed — the null would then be caused by the absence of a header
    // rather than by the gate.
    //
    // This is not theoretical here: at Phase 3 verify-self the FIRST live read returned 0 for
    // the positive control because no workspace was open yet, and a "no marker" verdict taken at
    // that moment would have been pure instrument error. The workspace had to be opened first.
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
    // ⚠️ Proves the absence readings above come from the GATE rather than from a header that
    // rendered empty for some other reason. If the ungated siblings vanished too, the marker's
    // absence would be uninformative — the same reasoning the drive-mode render test applies,
    // and the reason `arch.md` insists the gate applies PER ARM, never as a blanket wipe.
    const doc = renderWorkspaceHeader();

    expect(
      doc.querySelector('[data-testid="workspace-split-control"]'),
      "the split control is ungated and must survive a closed gate",
    ).not.toBeNull();
  });
});
