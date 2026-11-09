// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountWorkspace, uncaught, unmountWorkspace } from "./liveWorkspace";

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

// paydown-2026-11-08 WP5 Phase 2 — the workspace header's next-open indicator, on a LIVE mount.
//
// `nextOpenIndicator` is unit-tested for its wording; this pins the CALLER: `Workspace` must pass
// the announce's manual bit through, or an untrusted folder's header promises "will run
// /session-restore" while the fire withholds it. (A mutant passing `manual: false` there survived
// every other test.)

const PATH = "/tmp/scratch/scratch-a"; // the harness's mounted project

afterEach(async () => {
  await unmountWorkspace();
});

async function headerFor(announced: string) {
  const el = await mountWorkspace({
    gate: true,
    profile: null,
    ipcAnswers: { picker_announce_actions: { [PATH]: announced } },
  });
  return el.querySelector('[data-testid="workspace-header-nextopen"]')
    ?.textContent;
}

describe("the header's next-open indicator and folder trust", () => {
  it("an untrusted folder does not promise the command will run", async () => {
    expect(await headerFor("restore-manual")).toBe(
      "↻ type /session-restore after trusting",
    );
    expect(uncaught).toEqual([]);
  });

  it("control: a trusted folder still reads 'will run'", async () => {
    expect(await headerFor("restore")).toBe("↻ will run /session-restore");
  });
});
