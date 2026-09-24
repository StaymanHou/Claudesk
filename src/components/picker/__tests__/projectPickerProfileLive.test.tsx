// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import { ProjectPicker } from "../ProjectPicker";
import { PROFILES_CHANGED_EVENT } from "../../../state/profiles";

// F-b Phase 4 — the PICKER PAGE on a live mount (the consuming surface): the real component,
// real clicks, real (mocked) Tauri events. Pins what no unit test of the cell can see — the
// page reads the profile list, re-reads it on `profiles-changed`, refuses a missing row BEFORE
// opening, and sends a profile change as `set_project_profile`.

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const ROW = "/tmp/scratch/proj";
const neo = {
  name: "neo",
  config_dir: "/u/.config/claude-neo",
  provenance: "adopted",
};

let listed: (typeof neo)[] = [];
const calls: { cmd: string; args: Record<string, unknown> }[] = [];
let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 25));
  });
}

async function mount(rowProfile: string | null, onOpen = vi.fn()) {
  calls.length = 0;
  mockWindows("main");
  mockIPC(
    (cmd, args) => {
      calls.push({ cmd, args: (args ?? {}) as Record<string, unknown> });
      switch (cmd) {
        case "prune_missing_projects":
          return [];
        case "list_projects":
          return [
            {
              project_path: ROW,
              display_name: "proj",
              ...(rowProfile === null ? {} : { profile: rowProfile }),
            },
          ];
        case "picker_announce_actions":
          return {};
        case "profiles_list":
          return listed;
        case "set_project_profile":
        case "record_open":
          return null;
        default:
          return null;
      }
    },
    { shouldMockEvents: true },
  );
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<ProjectPicker onOpen={onOpen} />));
  await settle();
  return { el: host, onOpen };
}

const profileLine = (el: ParentNode) =>
  el.querySelector('[data-testid="project-profile-line"]');

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  clearMocks();
  listed = [];
});

describe("ProjectPicker × profiles — live (F-b Phase 4)", () => {
  it("reads the profile list once, and RE-reads it on profiles-changed (no reopen)", async () => {
    listed = [];
    const { el } = await mount("neo");
    expect(calls.filter((c) => c.cmd === "profiles_list")).toHaveLength(1);
    expect(profileLine(el)?.textContent).toBe("Profile: ⚠ neo missing");
    listed = [neo];
    await act(async () => {
      await emit(PROFILES_CHANGED_EVENT);
    });
    await settle();
    expect(calls.filter((c) => c.cmd === "profiles_list")).toHaveLength(2);
    expect(profileLine(el)?.textContent).toBe("Profile: neo");
  });

  it("a MISSING row refuses to open: a toast, no record_open, no onOpen", async () => {
    listed = [];
    const { el, onOpen } = await mount("gone");
    await act(async () => {
      (el.querySelector(".picker-recent") as HTMLElement).click();
    });
    await settle();
    expect(onOpen).not.toHaveBeenCalled();
    expect(calls.map((c) => c.cmd)).not.toContain("record_open");
    expect(el.textContent).toContain('the profile "gone"');
  });

  it("positive control: a DEFAULT row does open", async () => {
    const { el, onOpen } = await mount(null);
    await act(async () => {
      (el.querySelector(".picker-recent") as HTMLElement).click();
    });
    await settle();
    expect(calls.map((c) => c.cmd)).toContain("record_open");
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("choosing a profile sends set_project_profile for THIS row", async () => {
    listed = [neo];
    const { el } = await mount(null);
    await act(async () => {
      (profileLine(el) as HTMLElement).click();
    });
    const select = el.querySelector(
      '[data-testid="project-profile-select"]',
    ) as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(["", "neo"]);
    await act(async () => {
      select.value = "neo";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
    expect(calls.filter((c) => c.cmd === "set_project_profile")).toEqual([
      { cmd: "set_project_profile", args: { path: ROW, profile: "neo" } },
    ]);
    expect(profileLine(el)?.textContent).toBe("Profile: neo");
  });
});
