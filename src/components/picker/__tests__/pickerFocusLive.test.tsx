// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { mountLive, mountPicker, settle, teardownLive } from "./livePicker";
import { PickerOverlay, restoreFocus } from "../PickerOverlay";

// SURFACE-2026-11-18-PICKER-SEARCH-BOX-NOT-AUTOFOCUSED — the filter takes focus the moment a
// picker appears (both surfaces mount `ProjectPicker` fresh per appearance), and the "+"
// overlay hands focus back to what had it (normally the CC pane's xterm) on every DISMISS
// path, so the pane keeps taking keys after an Esc.

const PROJECTS = [
  { project_path: "/p/alpha", display_name: "alpha", last_opened_at: 2 },
  { project_path: "/p/beta", display_name: "beta", last_opened_at: 1 },
];

function pickerIpc(cmd: string): unknown {
  switch (cmd) {
    case "prune_missing_projects":
      return [];
    case "list_projects":
      return PROJECTS;
    case "picker_announce_actions":
      return {};
    case "profiles_list":
      return [];
    default:
      return undefined;
  }
}

/** A stand-in for the CC pane's xterm helper textarea, focused before the overlay opens. */
let pane: HTMLTextAreaElement | null = null;

function focusPane(): HTMLTextAreaElement {
  pane = document.createElement("textarea");
  pane.className = "xterm-helper-textarea";
  document.body.appendChild(pane);
  pane.focus();
  expect(document.activeElement).toBe(pane);
  return pane;
}

async function mountOverlay() {
  const onDismiss = vi.fn();
  const onOpen = vi.fn();
  const el = await mountLive(
    <PickerOverlay onOpen={onOpen} onDismiss={onDismiss} />,
    pickerIpc,
  );
  return { el, onDismiss, onOpen };
}

const filterOf = (el: ParentNode) =>
  el.querySelector<HTMLInputElement>('[data-testid="picker-filter"]')!;

afterEach(async () => {
  await teardownLive();
  pane?.remove();
  pane = null;
});

describe("picker filter autofocus — live", () => {
  it("the first-open picker focuses the filter on mount", async () => {
    const { el } = await mountPicker({ projects: PROJECTS });
    expect(filterOf(el)).not.toBeNull();
    expect(document.activeElement).toBe(filterOf(el));
  });

  it("the + overlay takes focus OUT of the CC pane into the filter", async () => {
    focusPane();
    const { el } = await mountOverlay();
    expect(document.activeElement).toBe(filterOf(el));
  });
});

describe("PickerOverlay hands focus back on dismiss — live", () => {
  it("Esc: restores the pane's focus, then dismisses", async () => {
    const p = focusPane();
    const { onDismiss } = await mountOverlay();
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(p);
  });

  it("the × button: restores the pane's focus, then dismisses", async () => {
    const p = focusPane();
    const { el, onDismiss } = await mountOverlay();
    await act(async () => {
      el.querySelector<HTMLButtonElement>(
        '[data-testid="picker-overlay-close"]',
      )!.click();
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(p);
  });

  it("a backdrop mousedown: restores the pane's focus, then dismisses", async () => {
    const p = focusPane();
    const { el, onDismiss } = await mountOverlay();
    const backdrop = el.querySelector<HTMLElement>(
      '[data-testid="picker-overlay"]',
    )!;
    await act(async () => {
      backdrop.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(p);
  });

  it("opening a project does NOT hand focus back to the pane", async () => {
    const p = focusPane();
    const { el, onOpen, onDismiss } = await mountOverlay();
    const row = [
      ...el.querySelectorAll<HTMLButtonElement>("button.picker-recent"),
    ].find((b) => b.textContent?.includes("alpha"))!;
    await act(async () => row.click());
    await settle();
    expect(onOpen).toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(p);
  });
});

describe("restoreFocus", () => {
  it("does nothing for a detached element, null, or <body>", () => {
    const detached = document.createElement("button");
    const spy = vi.spyOn(detached, "focus");
    restoreFocus(detached);
    restoreFocus(null);
    restoreFocus(document.body);
    expect(spy).not.toHaveBeenCalled();
  });
});
