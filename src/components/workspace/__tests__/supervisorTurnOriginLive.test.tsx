// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  click,
  forwardInput,
  mountWorkspace,
  pane,
  pushClaimedTurnStart,
  unmountWorkspace,
  uncaught,
} from "./liveWorkspace";
import {
  armOrigin,
  claimOrigin,
  resetOrigins,
} from "../../../state/supervisor/turnOrigin";

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

// Turn attribution on its CONSUMING SURFACE: the real `Workspace` wires the pane's claim to the
// supervisor's pending origin (keyed on its own workspace id), cancels it on forwarded input, and
// renders `⚙` in the turn readout only through the gated supervisor readout. The pane's half of
// the contract (claim at the marker) is pinned in `turnNavWiring.test.ts`; the supervisor's half
// (arm before `cc_input`, disarm on failure) in `activityFunnel.test.tsx`.

const q = (el: ParentNode, id: string) =>
  el.querySelector<HTMLElement>(`[data-testid="${id}"]`);

const FIRST_TURN = { canPrev: false, canNext: false, ordinal: 1, total: 1 };
const fire = () =>
  armOrigin("ws-1", { command: "/feature-verify-auto", firedAt: Date.now() });

afterEach(async () => {
  await unmountWorkspace();
  resetOrigins();
});

describe("the supervisor's ⚙ in the turn readout", () => {
  it("a supervisor-started turn renders ⚙, with a tooltip naming the command", async () => {
    const el = await mountWorkspace({
      gate: true,
      storedDriveMode: "autopilot",
    });
    fire();
    await pushClaimedTurnStart(FIRST_TURN);
    const readout = q(el, "workspace-turn-readout");
    expect(q(el, "workspace-turn-origin")?.textContent?.trim()).toBe("⚙");
    expect(readout?.textContent).toBe("⚙ 1/1");
    expect(readout?.title).toBe(
      "Turn 1 of 1 — The workflow supervisor started this turn (it ran /feature-verify-auto).",
    );
    expect(uncaught).toEqual([]);
  });

  it("an operator-typed turn (nothing armed) renders no ⚙", async () => {
    const el = await mountWorkspace({
      gate: true,
      storedDriveMode: "autopilot",
    });
    await pushClaimedTurnStart(FIRST_TURN);
    expect(q(el, "workspace-turn-origin")).toBeNull();
    expect(q(el, "workspace-turn-readout")?.textContent).toBe("1/1");
  });

  it("⚠️ operator input between the fire and the turn start cancels the tag", async () => {
    const el = await mountWorkspace({
      gate: true,
      storedDriveMode: "autopilot",
    });
    fire();
    await forwardInput("y");
    await pushClaimedTurnStart(FIRST_TURN);
    expect(q(el, "workspace-turn-origin")).toBeNull();
    expect(q(el, "workspace-turn-readout")?.textContent).toBe("1/1");
  });

  it("claims THIS workspace's origin only: another workspace's fire does not tag it", async () => {
    const el = await mountWorkspace({
      gate: true,
      storedDriveMode: "autopilot",
    });
    armOrigin("ws-2", { command: "/feature-build", firedAt: Date.now() });
    await pushClaimedTurnStart(FIRST_TURN);
    expect(q(el, "workspace-turn-origin")).toBeNull();
    // ...and it left ws-2's origin in place for ws-2's own turn start.
    expect(claimOrigin("ws-2", Date.now())?.command).toBe("/feature-build");
  });

  it("⚠️ with the gate OFF: the turn readout still works, but renders no ⚙", async () => {
    const el = await mountWorkspace({
      gate: false,
      storedDriveMode: "autopilot",
    });
    fire();
    await pushClaimedTurnStart(FIRST_TURN);
    // The ungated readout is live (proves this is not an empty render)...
    expect(q(el, "workspace-turn-readout")?.textContent).toBe("1/1");
    // ...and the gated mark is absent, although the pane reported a supervisor origin.
    expect(q(el, "workspace-turn-origin")).toBeNull();
    expect(q(el, "workspace-turn-readout")?.title).toBe("Turn 1 of 1");
  });

  it("stepping to an operator turn drops the ⚙: the re-read nav state is what renders", async () => {
    const el = await mountWorkspace({
      gate: true,
      storedDriveMode: "autopilot",
    });
    fire();
    await pushClaimedTurnStart({
      canPrev: true,
      canNext: false,
      ordinal: 2,
      total: 2,
    });
    expect(q(el, "workspace-turn-origin")).not.toBeNull();
    pane.navAfterStep = {
      canPrev: false,
      canNext: true,
      ordinal: 1,
      total: 2,
      origin: null,
    };
    await click(q(el, "workspace-turn-prev"));
    expect(q(el, "workspace-turn-origin")).toBeNull();
    expect(q(el, "workspace-turn-readout")?.textContent).toBe("1/2");
  });
});
