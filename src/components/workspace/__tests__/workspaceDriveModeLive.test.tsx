// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { emit } from "@tauri-apps/api/event";
import { PROJECT_DRIVE_MODE_EVENT } from "../../../cc/driveModeIpc";
import {
  click,
  ipcCalls,
  mountWorkspace,
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
