// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { emit } from "@tauri-apps/api/event";
import { PROFILES_CHANGED_EVENT } from "../../../state/profiles";
import { NEW_PROFILE_OPTION } from "../profileLine";
import {
  calls,
  mountPicker,
  setNativeValue,
  settle as settleFor,
  teardownLive,
} from "./livePicker";

// F-b Phase 4 — the PICKER PAGE on a live mount (the consuming surface): the real component,
// real clicks, real (mocked) Tauri events. Pins what no unit test of the cell can see — the
// page reads the profile list, re-reads it on `profiles-changed`, refuses a missing row BEFORE
// opening, and sends a profile change as `set_project_profile`.

const ROW = "/tmp/scratch/proj";
const neo = {
  name: "neo",
  config_dir: "/u/.config/claude-neo",
  provenance: "adopted",
};

let listed: (typeof neo)[] = [];

const settle = () => settleFor(25);

function mount(rowProfile: string | null, onOpen = vi.fn()) {
  return mountPicker({
    projects: [
      {
        project_path: ROW,
        display_name: "proj",
        ...(rowProfile === null ? {} : { profile: rowProfile }),
      },
    ],
    profiles: () => listed,
    onOpen,
    ipc: (cmd, args) => {
      switch (cmd) {
        case "profile_wizard_defaults":
          return {
            config_root: "/u/.config",
            permission_mode: "default",
            cleanup_period_days: 99999,
            theme: "dark",
            status_line: null,
            themes: ["dark"],
          };
        case "profile_dir_status":
          return "absent";
        case "profile_create": {
          // The backend lists the profile, then emits `profiles-changed` (emitted by the test).
          const spec = (args as { spec: { name: string; config_dir: string } })
            .spec;
          const created = {
            name: spec.name,
            config_dir: spec.config_dir,
            provenance: "created",
          };
          listed = [...listed, created];
          return created;
        }
        default:
          return null;
      }
    },
  });
}

const profileLine = (el: ParentNode) =>
  el.querySelector('[data-testid="project-profile-line"]');

afterEach(async () => {
  await teardownLive();
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
    expect([...select.options].map((o) => o.value)).toEqual([
      "",
      "neo",
      NEW_PROFILE_OPTION,
    ]);
    await act(async () => setNativeValue(select, "neo"));
    await settle();
    expect(calls.filter((c) => c.cmd === "set_project_profile")).toEqual([
      { cmd: "set_project_profile", args: { path: ROW, profile: "neo" } },
    ]);
    expect(profileLine(el)?.textContent).toBe("Profile: neo");
  });

  it("F-b Phase 5 — a profile created from the row's New profile… is committed to it and the row OPENS under it", async () => {
    listed = [neo];
    const { el, onOpen } = await mount(null);
    await act(async () => {
      (profileLine(el) as HTMLElement).click();
    });
    const select = el.querySelector(
      '[data-testid="project-profile-select"]',
    ) as HTMLSelectElement;
    await act(async () => setNativeValue(select, NEW_PROFILE_OPTION));
    await settle();
    const name = document.body.querySelector(
      '[data-testid="profile-wizard-name"]',
    );
    await act(async () => setNativeValue(name, "work"));
    for (let i = 0; i < 8; i++) {
      await act(async () => {
        (
          document.body.querySelector(
            '[data-testid="profile-wizard-next"]',
          ) as HTMLElement
        ).click();
      });
      await settle();
    }
    await act(async () => {
      await emit(PROFILES_CHANGED_EVENT);
    });
    await settle();

    expect(calls.filter((c) => c.cmd === "set_project_profile")).toEqual([
      { cmd: "set_project_profile", args: { path: ROW, profile: "work" } },
    ]);
    // Re-read on profiles-changed, so the new name resolves — never "missing".
    expect(profileLine(el)?.textContent).toBe("Profile: work");
    await act(async () => {
      (el.querySelector(".picker-recent") as HTMLElement).click();
    });
    await settle();
    expect(calls.map((c) => c.cmd)).toContain("record_open");
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
