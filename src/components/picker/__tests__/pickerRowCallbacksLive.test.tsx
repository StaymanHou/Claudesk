// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import { WORKFLOW_FEATURES_ENABLED_EVENT } from "../../../state/workflowGate";
import { ProjectPicker } from "../ProjectPicker";

// Paydown 2026-11-04 WP13 — every callback the picker hands `PickerRow`, driven on a live mount
// of the real picker (the consuming surface).
//
// WP13 turned the row's handlers into props. Probed at verify-codify: making the row's ×, or any
// of the three commit callbacks, a no-op passed all 750 picker/app tests. The commit callbacks
// are only observable after the row UNMOUNTS: they fold the persisted value back into the
// picker's `recents`, so a row filtered out and back in re-seeds from a truthful value
// (`applyCommittedModel.ts`). So each commit test does that filter round-trip.
//
// ⚠️ The gate is moved through the seam's broadcast (the drive-mode line only renders with it
// ON), never by answering its seed command by name (offInvariantGuard).

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const ONE = "/p/one";
const TWO = "/p/two";
const calls: { cmd: string; args: unknown }[] = [];
let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  clearMocks();
});

async function settle(ms = 15) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

async function mount(onOpen = vi.fn()) {
  calls.length = 0;
  mockWindows("main");
  mockIPC(
    (cmd, args) => {
      calls.push({ cmd, args });
      switch (cmd) {
        case "prune_missing_projects":
          return [];
        case "list_projects":
          return [
            { project_path: ONE, display_name: "one", last_opened_at: 2 },
            { project_path: TWO, display_name: "two", last_opened_at: 1 },
          ];
        case "picker_announce_actions":
          return { [ONE]: "continue" };
        case "profiles_list":
          return [
            {
              name: "neo",
              config_dir: "/u/.config/claude-neo",
              provenance: "adopted",
            },
          ];
        default:
          return null;
      }
    },
    { shouldMockEvents: true },
  );
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<ProjectPicker onOpen={onOpen} />);
  });
  await settle(25);
  await act(async () => {
    await emit(WORKFLOW_FEATURES_ENABLED_EVENT, true);
  });
  await settle();
  return onOpen;
}

function row(name: string): HTMLElement {
  const li = [
    ...host!.querySelectorAll<HTMLElement>("li.picker-recent-row"),
  ].find((l) => l.querySelector(".picker-recent-name")?.textContent === name);
  if (!li) throw new Error(`no row ${name}`);
  return li;
}

async function typeFilter(value: string) {
  const input = host!.querySelector<HTMLInputElement>(
    '[data-testid="picker-filter"]',
  )!;
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  await act(async () => {
    setValue.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
}

/** Filter row `one` out (unmounting it) and back in, so it re-seeds from `recents`. */
async function roundTripRowOne() {
  await typeFilter("two");
  expect(host!.textContent).not.toContain("/p/one"); // it really unmounted
  await typeFilter("");
}

async function pickInSelect(select: HTMLSelectElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  )!.set!;
  await act(async () => {
    setValue.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
}

describe("PickerRow — the open doors reach the picker's ONE open path", () => {
  it("⊘ opens WITHOUT the announced action: record_open, then onOpen(path, null, no-fire)", async () => {
    const onOpen = await mount();
    await act(async () => {
      row("one")
        .querySelector<HTMLElement>('[data-testid="picker-recent-nofire"]')!
        .click();
    });
    await settle();
    expect(calls.filter((c) => c.cmd === "record_open")).toEqual([
      { cmd: "record_open", args: { path: ONE } },
    ]);
    expect(onOpen.mock.calls).toEqual([[ONE, null, "no-fire"]]);
  });

  it("the row itself opens WITH the announced action (fire)", async () => {
    const onOpen = await mount();
    await act(async () => {
      row("one")
        .querySelector<HTMLElement>('[data-testid="picker-recent"]')!
        .click();
    });
    await settle();
    expect(onOpen.mock.calls).toEqual([
      [ONE, { kind: "argv", flag: "--continue" }, "fire"],
    ]);
  });
});

describe("PickerRow — remove reaches the picker", () => {
  it("× sends remove_project for THIS row and the row leaves the list", async () => {
    await mount();
    await act(async () => {
      row("two")
        .querySelector<HTMLElement>('[data-testid="picker-recent-remove"]')!
        .click();
    });
    await settle();
    expect(calls.filter((c) => c.cmd === "remove_project")).toEqual([
      { cmd: "remove_project", args: { path: TWO } },
    ]);
    expect(host!.textContent).not.toContain("/p/two");
    expect(host!.textContent).toContain("/p/one"); // control: the other row stays
  });
});

describe("PickerRow — a committed value survives the row unmounting (the picker's reducers)", () => {
  it("model", async () => {
    await mount();
    await act(async () => {
      row("one")
        .querySelector<HTMLElement>('[data-testid="picker-recent-model-line"]')!
        .click();
    });
    await settle();
    const input = row("one").querySelector<HTMLInputElement>(
      '[data-testid="picker-recent-model-input"]',
    )!;
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!;
    await act(async () => {
      setValue.call(input, "sonnet");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    await settle();
    expect(
      calls.filter((c) => c.cmd === "project_set_default_model"),
    ).toHaveLength(1);
    await roundTripRowOne();
    expect(
      row("one").querySelector('[data-testid="picker-recent-model-line"]')!
        .textContent,
    ).toContain("sonnet");
  });

  it("drive mode", async () => {
    await mount();
    await act(async () => {
      row("one")
        .querySelector<HTMLElement>('[data-testid="picker-recent-mode-line"]')!
        .click();
    });
    await settle();
    await pickInSelect(
      row("one").querySelector<HTMLSelectElement>(
        '[data-testid="picker-recent-mode-select"]',
      )!,
      "stepping",
    );
    expect(
      calls.filter((c) => c.cmd === "project_set_default_drive_mode"),
    ).toHaveLength(1);
    await roundTripRowOne();
    // The remounted cell seeds the gate from its command, which this harness answers as OFF
    // (it may not name it); re-broadcast it, as the real app's seed would read it ON.
    await act(async () => {
      await emit(WORKFLOW_FEATURES_ENABLED_EVENT, true);
    });
    await settle();
    expect(
      row("one").querySelector('[data-testid="picker-recent-mode-line"]')!
        .textContent,
    ).toContain("stepping");
  });

  it("profile", async () => {
    await mount();
    const profileLine = () =>
      row("one").querySelector<HTMLElement>(
        '[data-testid="project-profile-line"]',
      );
    await act(async () => {
      profileLine()!.click();
    });
    await settle();
    await pickInSelect(
      row("one").querySelector<HTMLSelectElement>(
        '[data-testid="project-profile-select"]',
      )!,
      "neo",
    );
    expect(calls.filter((c) => c.cmd === "set_project_profile")).toEqual([
      { cmd: "set_project_profile", args: { path: ONE, profile: "neo" } },
    ]);
    await roundTripRowOne();
    expect(profileLine()!.textContent).toBe("Profile: neo");
  });
});
