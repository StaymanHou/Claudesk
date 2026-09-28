// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { routeCcInput } from "../ccInputRouting";
import {
  forwardInput,
  mountWorkspace,
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

// silent-supervisor Phase 2 — the unsent-input marker (`⏸`) on its CONSUMING SURFACE. Each
// chunk goes through the real `routeCcInput`, exactly as `XtermPane`'s `onData` handler routes it,
// into the real `Workspace`. Live in the dev build (2026-09-28), a freshly opened workspace received
// a focus-in and a DA reply before the operator typed anything, and before this fix the marker was
// already showing: the supervisor started every workspace suppressed.

const SUPPRESSED = '[data-testid="workspace-header-supervisor-suppressed"]';
const typed = (chunk: string) =>
  routeCcInput(chunk, "cc-1", (s) => s).toWatermark;

afterEach(async () => {
  await unmountWorkspace();
});

describe("terminal reports never raise the unsent-input marker", () => {
  for (const [name, report] of [
    ["startup focus-in + DA reply", "\x1b[I\x1b[?1;2c"],
    ["focus-out", "\x1b[O"],
    ["cursor-position report", "\x1b[24;80R"],
  ] as const) {
    it(`a ${name} leaves the workspace unsuppressed`, async () => {
      const el = await mountWorkspace({
        gate: true,
        storedDriveMode: "autopilot",
      });
      await forwardInput(typed(report));
      expect(el.querySelector(SUPPRESSED)).toBeNull();
    });
  }

  // The positive control: the same path DOES raise the marker for real typing, and clears it on
  // submit, so the case above is not passing because the marker never renders at all.
  it("typing raises the marker through the same path, and Ctrl+U clears it", async () => {
    const el = await mountWorkspace({
      gate: true,
      storedDriveMode: "autopilot",
    });
    await forwardInput(typed("abc"));
    expect(el.querySelector(SUPPRESSED)).not.toBeNull();
    await forwardInput(typed("\x1b[O"));
    expect(
      el.querySelector(SUPPRESSED),
      "a report must not clear it either",
    ).not.toBeNull();
    await forwardInput(typed("\x15"));
    expect(el.querySelector(SUPPRESSED)).toBeNull();
  });
});
