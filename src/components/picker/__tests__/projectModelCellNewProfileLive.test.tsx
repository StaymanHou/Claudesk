// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { ProjectModelCell } from "../ProjectModelCell";
import { NEW_PROFILE_OPTION } from "../profileLine";
import {
  calls,
  mountLive,
  setNativeValue,
  settle as settleFor,
  teardownLive,
} from "./livePicker";

// F-b Phase 5 — "New profile…" in the picker row's `Profile:` select, on a LIVE mount. Picking
// it must open the wizard and commit NOTHING. A profile the wizard then creates is committed to
// THIS row, through the same `set_project_profile` writer as any other pick.

const settle = () => settleFor(20);

async function mount() {
  await mountLive(
    <ProjectModelCell
      projectPath="/tmp/proj"
      projectLabel="proj"
      seedModel={null}
      profile={null}
      profiles={[
        {
          name: "neo",
          config_dir: "/u/.config/claude-neo",
          provenance: "adopted",
        },
      ]}
    />,
    (cmd, a) => {
      if (cmd === "profile_wizard_defaults")
        return {
          config_root: "/u/.config",
          permission_mode: "default",
          cleanup_period_days: 99999,
          theme: "dark",
          status_line: null,
          themes: ["dark"],
        };
      if (cmd === "profile_dir_status") return "absent";
      if (cmd === "profile_create") {
        const spec = a.spec as { name: string; config_dir: string };
        return {
          name: spec.name,
          config_dir: spec.config_dir,
          provenance: "created",
        };
      }
      return null;
    },
    20,
  );
}

afterEach(teardownLive);

const q = <T extends Element = HTMLElement>(id: string) =>
  document.body.querySelector<T>(`[data-testid="${id}"]`);

async function click(el: Element | null) {
  if (!el) throw new Error("click target not found");
  await act(async () => (el as HTMLElement).click());
  await settle();
}

async function setValue(
  el: HTMLInputElement | HTMLSelectElement | null,
  v: string,
) {
  await act(async () => setNativeValue(el, v));
  await settle();
}

describe("the Profile: select's New profile… entry — live", () => {
  it("is offered, opens the wizard, and commits nothing", async () => {
    await mount();
    await click(q("project-profile-line"));
    const select = q<HTMLSelectElement>("project-profile-select");
    const options = [...(select?.options ?? [])].map((o) => o.textContent);
    expect(options).toEqual(["default", "neo", "New profile…"]);
    await setValue(select, NEW_PROFILE_OPTION);
    expect(q("profile-wizard")).not.toBeNull();
    expect(calls.some((c) => c.cmd === "set_project_profile")).toBe(false);
    // The line is back at rest and still reads the old value.
    expect(q("project-profile-line")?.textContent).toBe("Profile: default");
  });

  it("a profile created from the row is committed to THAT row", async () => {
    await mount();
    await click(q("project-profile-line"));
    await setValue(
      q<HTMLSelectElement>("project-profile-select"),
      NEW_PROFILE_OPTION,
    );
    await setValue(q<HTMLInputElement>("profile-wizard-name"), "work");
    for (let i = 0; i < 8; i++) await click(q("profile-wizard-next"));
    expect(calls.filter((c) => c.cmd === "profile_create")).toHaveLength(1);
    expect(calls.filter((c) => c.cmd === "set_project_profile")).toEqual([
      {
        cmd: "set_project_profile",
        args: { path: "/tmp/proj", profile: "work" },
      },
    ]);
    expect(q("profile-wizard")).toBeNull();
  });
});
