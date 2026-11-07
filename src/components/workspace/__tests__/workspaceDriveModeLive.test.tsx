// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { emit } from "@tauri-apps/api/event";
import { PROJECT_DRIVE_MODE_EVENT } from "../../../cc/driveModeIpc";
import { IDLE_POLL_MS } from "../applyDriveMode";
import {
  click,
  ipcCalls,
  mountWorkspace,
  pane,
  settle,
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

// The drive-mode readout's BEHAVIOUR on a live mount (paydown 2026-09-23 WP7, H4). The resting
// DOM (gate OFF → no readout) stays in `workspaceDriveModeRender.test.tsx`.
//
// These replaced two comment-stripped source regexes. One asserted that `Workspace.tsx` compares
// `e.payload.path`; the other asserted that it destructures `persist` from `driveModeWriteFor`. Both
// were labelled "floor, not proof": they broke on a rename, and a semantically wrong comparison
// passed them. Here the real subscriber receives a real (mocked) Tauri event, and the real confirm
// is clicked, so what is asserted is the OUTCOME.

const OWN = "/tmp/scratch/scratch-a";

const readout = (el: ParentNode) =>
  el.querySelector('[data-testid="workspace-header-drivemode"]');

const writes = () =>
  ipcCalls.filter((c) => c.cmd === "project_set_default_drive_mode");

async function broadcast(path: string, mode: string | null) {
  await act(async () => {
    await emit(PROJECT_DRIVE_MODE_EVENT, { path, mode });
  });
  await settle();
}

/** Open the readout's editor and pick `mode`, which opens the confirm. */
async function choose(el: HTMLElement, mode: string) {
  await click(readout(el));
  const select = el.querySelector<HTMLSelectElement>(
    '[data-testid="workspace-header-drivemode-select"]',
  );
  if (!select) throw new Error("the drive-mode editor did not open");
  await act(async () => {
    select.value = mode;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
  if (!el.querySelector('[data-testid="drivemode-confirm-apply"]')) {
    throw new Error("choosing a new mode did not open the confirm");
  }
}

afterEach(async () => {
  await unmountWorkspace();
  expect(uncaught).toEqual([]);
});

describe("the broadcast subscriber filters by project path", () => {
  it("a FOREIGN project's change is ignored; this project's is applied", async () => {
    // ⚠️ The defect an unfiltered subscriber admits is silent CROSS-PROJECT CORRUPTION:
    // `PROJECT_DRIVE_MODE_EVENT` is per-project, so without the check one project's change would
    // rewrite every open workspace's readout. The own-path broadcast is the POSITIVE CONTROL: it
    // proves the subscriber is live, so the unchanged readout above it means "filtered", not
    // "nothing listened".
    const el = await mountWorkspace({
      gate: true,
      storedDriveMode: "autopilot",
    });
    expect(readout(el)?.textContent).toContain("autopilot");

    await broadcast("/tmp/scratch/some-other-project", "fsd");
    expect(readout(el)?.textContent).toContain("autopilot");

    await broadcast(OWN, "stepping");
    expect(readout(el)?.textContent).toContain("stepping");
  });
});

describe("the confirm's write decision is honored by its CALLER", () => {
  it("Cancel writes NOTHING and leaves the readout on the stored mode", async () => {
    // ⚠️ `driveModeWriteFor`'s value tests cannot see a caller that ignores its decision. Only the
    // mounted component can: here Cancel is clicked and the IPC log is read.
    const el = await mountWorkspace({
      gate: true,
      storedDriveMode: "autopilot",
    });
    await choose(el, "fsd");
    await click(el.querySelector('[data-testid="drivemode-confirm-cancel"]'));
    expect(writes()).toEqual([]);
    expect(
      el.querySelector('[data-testid="drivemode-confirm-apply"]'),
    ).toBeNull();
    expect(readout(el)?.textContent).toContain("autopilot");
  });

  it("Apply writes the chosen mode for THIS project (positive control)", async () => {
    const el = await mountWorkspace({
      gate: true,
      storedDriveMode: "autopilot",
    });
    await choose(el, "fsd");
    await click(el.querySelector('[data-testid="drivemode-confirm-apply"]'));
    expect(writes().map((c) => c.args)).toEqual([{ path: OWN, mode: "fsd" }]);
    expect(readout(el)?.textContent).toContain("fsd");
  });
});

describe("R1 — the readout is disabled while an apply is queued (paydown WP8, H1)", () => {
  it("a queued apply cannot reopen the editor, by click OR keyboard", async () => {
    // ⚠️ The defect: during a queued apply, a second pick → confirm → Apply was silently dropped
    // at `resolveDriveMode`'s `respawnWanted` early return, while the readout showed the new
    // value. `running` keeps `waitForIdle` polling, so the apply stays queued for the whole test.
    const el = await mountWorkspace({
      gate: true,
      storedDriveMode: "autopilot",
      statusState: "running",
    });
    // Positive control: `choose` itself proves the editor OPENS before anything is queued.
    await choose(el, "fsd");
    await click(el.querySelector('[data-testid="drivemode-confirm-apply"]'));
    expect(
      el.querySelector('[data-testid="workspace-header-drivemode-pending"]'),
      "the apply must be QUEUED for this test to mean anything",
    ).not.toBeNull();

    const r = readout(el)!;
    expect(r.getAttribute("aria-disabled")).toBe("true");
    expect(r.classList.contains("is-queued")).toBe(true);
    expect(r.getAttribute("title")).toContain("fsd");

    await click(r);
    expect(
      el.querySelector('[data-testid="workspace-header-drivemode-select"]'),
    ).toBeNull();

    await act(async () => {
      r.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    await settle();
    expect(
      el.querySelector('[data-testid="workspace-header-drivemode-select"]'),
    ).toBeNull();
    expect(writes().map((c) => c.args)).toEqual([{ path: OWN, mode: "fsd" }]);
  });
});

describe("M16.5 WP4 — the verify-human overlay is DISPLAY ONLY (operator ruling Q1, 'color only')", () => {
  it("the header dot reads awaiting while the respawn guard still sees idle", async () => {
    // The true state is idle; the overlay says a verify-human pause is up. The dot must go
    // blue, and a drive-mode Apply must still apply at once rather than queue as "busy" —
    // `readyToRespawn` reads `statusState`, never the display state.
    const el = await mountWorkspace({
      gate: true,
      storedDriveMode: "autopilot",
      statusState: "idle",
      statusDisplayState: "awaiting_input",
    });
    const dot = el.querySelector(".workspace-header .status-dot, .status-dot");
    expect(dot?.className).toContain("status-dot-awaiting");

    // The confirm's body is `applyConfirmBody(readyToRespawn(statusState, …))`: the "now"
    // wording means the guard saw idle, the "busy" wording would mean it saw the overlay.
    await choose(el, "fsd");
    const body = el.textContent ?? "";
    expect(body).toContain("to this session now?");
    expect(body).not.toContain("Claude Code is busy");
  });

  it("with no overlay the dot shows the true state (positive control)", async () => {
    const el = await mountWorkspace({ gate: true, statusState: "idle" });
    expect(el.querySelector(".status-dot")?.className).toContain(
      "status-dot-idle",
    );
  });
});

describe("the apply's respawn takes turn-respawn by REF, at spawn time (paydown 2026-11-04 WP12)", () => {
  it("Apply on an idle agent relaunches ONCE, and that spawn sends turn-respawn", async () => {
    // The stub's relaunch takes the override through the real `takeSpawnArgs`, so this reads
    // what the real pane's spawn would send.
    const el = await mountWorkspace({
      gate: true,
      storedDriveMode: "autopilot",
      statusState: "idle",
    });
    await choose(el, "fsd");
    await click(el.querySelector('[data-testid="drivemode-confirm-apply"]'));
    expect(pane.relaunches).toBe(1);
    expect(pane.spawnIntents).toEqual(["turn-respawn"]);
    // One-shot: taken and cleared, and the pane's own door was never rewritten, so any LATER
    // relaunch (the relaunch button, a Recycle) spawns as the door it was opened with.
    expect(pane.props?.spawnIntentRef?.current).toBeNull();
    expect(pane.props?.openIntent).toBe("fire");
    // No longer queued once the respawn is under way.
    expect(
      el.querySelector('[data-testid="workspace-header-drivemode-pending"]'),
    ).toBeNull();
  });

  it("with no pane handle, Apply leaves NO override behind for the next unrelated spawn", async () => {
    // The override is one-shot. Set with no relaunch to take it, it would sit in the ref until
    // the next spawn (Retry, `cc-relaunch`, Recycle) and turn that one into a `turn-respawn`.
    const el = await mountWorkspace({
      gate: true,
      storedDriveMode: "autopilot",
      statusState: "idle",
      detachedPane: true,
    });
    await choose(el, "fsd");
    await click(el.querySelector('[data-testid="drivemode-confirm-apply"]'));
    expect(pane.relaunches).toBe(0);
    expect(pane.props?.spawnIntentRef?.current).toBeNull();
    // The apply still finished: it is not left queued.
    expect(
      el.querySelector('[data-testid="workspace-header-drivemode-pending"]'),
    ).toBeNull();
  });

  it("with no apply, nothing relaunches and no override is pending (positive control)", async () => {
    await mountWorkspace({ gate: true, statusState: "idle" });
    expect(pane.relaunches).toBe(0);
    expect(pane.props?.spawnIntentRef?.current).toBeNull();
  });
});

describe("an apply still queued when the workspace unmounts is aborted (paydown 2026-11-04 WP12)", () => {
  it("stops polling for idle once the workspace is gone", async () => {
    const el = await mountWorkspace({
      gate: true,
      storedDriveMode: "autopilot",
      statusState: "running",
    });
    await choose(el, "fsd");
    await click(el.querySelector('[data-testid="drivemode-confirm-apply"]'));
    expect(
      el.querySelector('[data-testid="workspace-header-drivemode-pending"]'),
      "the apply must be QUEUED for this test to mean anything",
    ).not.toBeNull();

    const warn = vi.spyOn(console, "warn");
    await unmountWorkspace();
    // Count the poll's own sleeps from here on. Before the abort existed, a queued apply kept
    // scheduling one every IDLE_POLL_MS for up to ten minutes after the unmount.
    const spy = vi.spyOn(globalThis, "setTimeout");
    try {
      await new Promise((r) => setTimeout(r, 3 * IDLE_POLL_MS + 50));
      const polls = spy.mock.calls.filter(([, ms]) => ms === IDLE_POLL_MS);
      expect(polls).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
    // An aborted apply is the operator closing the workspace, so it reports nothing.
    const applyWarns = warn.mock.calls.filter(([m]) =>
      String(m).startsWith("drive-mode apply"),
    );
    warn.mockRestore();
    expect(applyWarns).toEqual([]);
    expect(pane.relaunches).toBe(0);
  });
});

describe("a failed drive-mode write reverts and abandons the respawn (paydown 2026-11-04 WP12)", () => {
  it("the readout returns to the stored mode, nothing relaunches, and the failure is logged", async () => {
    // A thenable rather than `Promise.reject`, so the rejection exists only once the IPC call
    // awaits it (an eager rejected promise is reported as unhandled before it is ever used).
    const rejects = {
      then(_ok: unknown, fail: (e: Error) => void) {
        fail(new Error("disk full"));
      },
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const el = await mountWorkspace({
        gate: true,
        storedDriveMode: "autopilot",
        statusState: "idle",
        ipcAnswers: { project_set_default_drive_mode: rejects },
      });
      await choose(el, "fsd");
      await click(el.querySelector('[data-testid="drivemode-confirm-apply"]'));
      // The write was attempted, for this project…
      expect(writes().map((c) => c.args)).toEqual([{ path: OWN, mode: "fsd" }]);
      // …failed, so the optimistic value is reverted and the respawn never happens.
      expect(readout(el)?.textContent).toContain("autopilot");
      expect(
        el.querySelector('[data-testid="workspace-header-drivemode-pending"]'),
      ).toBeNull();
      expect(pane.relaunches).toBe(0);
      expect(
        warn.mock.calls.some(
          ([m]) => String(m) === "drive-mode apply: write failed",
        ),
      ).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });
});
