// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import {
  ipcCalls,
  mountWorkspace,
  rightPanel,
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

// M17 WP6 (AC-1, AC-11) — on a LIVE Workspace mount with a remote key, the turn-marker jump and the
// supervisor control are ABSENT (no DOM), and the supervisor's per-project read is not made. The
// local mounts are the positive controls: the same selectors exist there.

const REMOTE = "ssh://me@mini-host/Users/me/proj";

afterEach(async () => {
  vi.restoreAllMocks();
  await unmountWorkspace();
});

const q = (el: Element, id: string) =>
  el.querySelector(`[data-testid="${id}"]`);

const TURN_IDS = [
  "workspace-turn-prev",
  "workspace-turn-next",
  "workspace-turn-readout",
];

describe("a remote workspace's header", () => {
  it("has no turn-marker jump (operator ruling: absent permanently)", async () => {
    const el = await mountWorkspace({ gate: false, projectPath: REMOTE });
    for (const id of TURN_IDS) expect(q(el, id), id).toBeNull();
    expect(uncaught).toEqual([]);
  });

  it("has no supervisor control and makes no supervisor read, even with the gate ON", async () => {
    const el = await mountWorkspace({ gate: true, projectPath: REMOTE });
    expect(q(el, "workspace-header-supervisor")).toBeNull();
    expect(ipcCalls.map((c) => c.cmd)).not.toContain(
      "project_get_supervisor_enabled",
    );
    expect(uncaught).toEqual([]);
  });
});

describe("positive control: a LOCAL workspace's header is unchanged", () => {
  it("has the turn-marker jump", async () => {
    const el = await mountWorkspace({ gate: false });
    for (const id of TURN_IDS) expect(q(el, id), id).not.toBeNull();
  });

  it("has the supervisor control and reads it, with the gate ON", async () => {
    const el = await mountWorkspace({ gate: true });
    expect(q(el, "workspace-header-supervisor")).not.toBeNull();
    expect(ipcCalls.map((c) => c.cmd)).toContain(
      "project_get_supervisor_enabled",
    );
  });
});

// M17 WP6 (AC-4) — the chord notice RightPanelHost raises lands in THIS workspace's toast. The
// right panel is stubbed here, so this pins the WIRING (the prop Workspace passes), which the
// RightPanelHost tests cannot see.
describe("the chord-notice wiring", () => {
  it("a notice raised by the right panel shows in the workspace's toast", async () => {
    const el = await mountWorkspace({ gate: false, projectPath: REMOTE });
    expect(q(el, "workspace-inject-toast")).toBeNull();
    await act(async () =>
      rightPanel.props?.onSurfaceUnavailable?.(
        "The editor isn't available on a remote workspace.",
      ),
    );
    const toast = q(el, "workspace-inject-toast");
    expect(toast?.textContent).toContain(
      "The editor isn't available on a remote workspace.",
    );
    // P3.verify-human.2 (decision B): informational, not an error.
    expect(toast?.getAttribute("data-kind")).toBe("info");
    expect(toast?.getAttribute("role")).toBe("status");
    expect(toast?.classList.contains("is-info")).toBe(true);
  });

  it("a failure (the inject path) keeps the red alert", async () => {
    const el = await mountWorkspace({ gate: false, projectPath: REMOTE });
    await act(async () => rightPanel.props?.onInjectFailure?.("not sent"));
    const toast = q(el, "workspace-inject-toast");
    expect(toast?.getAttribute("data-kind")).toBe("error");
    expect(toast?.getAttribute("role")).toBe("alert");
    expect(toast?.classList.contains("is-info")).toBe(false);
  });
});
