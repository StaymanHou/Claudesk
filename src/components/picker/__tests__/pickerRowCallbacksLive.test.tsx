// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import {
  calls,
  mountPicker,
  pickerRow,
  setGate,
  setNativeValue,
  settle,
  teardownLive,
} from "./livePicker";

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

const ONE = "/p/one";
const TWO = "/p/two";
let host: HTMLDivElement;

afterEach(teardownLive);

async function mount(onOpen = vi.fn()) {
  ({ el: host } = await mountPicker({
    projects: [
      { project_path: ONE, display_name: "one", last_opened_at: 2 },
      { project_path: TWO, display_name: "two", last_opened_at: 1 },
    ],
    announce: { [ONE]: "continue" },
    profiles: [
      {
        name: "neo",
        config_dir: "/u/.config/claude-neo",
        provenance: "adopted",
      },
    ],
    onOpen,
    gateOn: true,
  }));
  return onOpen;
}

const row = (name: string) => pickerRow(host, name);

async function typeFilter(value: string) {
  const input = host.querySelector<HTMLInputElement>(
    '[data-testid="picker-filter"]',
  );
  await act(async () => setNativeValue(input, value));
  await settle();
}

/** Filter row `one` out (unmounting it) and back in, so it re-seeds from `recents`. */
async function roundTripRowOne() {
  await typeFilter("two");
  expect(host.textContent).not.toContain("/p/one"); // it really unmounted
  await typeFilter("");
}

async function pickInSelect(select: HTMLSelectElement, value: string) {
  await act(async () => setNativeValue(select, value));
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
    expect(host.textContent).not.toContain("/p/two");
    expect(host.textContent).toContain("/p/one"); // control: the other row stays
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
    await act(async () => setNativeValue(input, "sonnet"));
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
    await setGate(true);
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
