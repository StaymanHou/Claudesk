// @vitest-environment jsdom
// SURFACE-2026-11-18-PICKER-SEARCH-BOX-NOT-AUTOFOCUSED, through the REAL `App` (the consuming
// surface): the first-open scene focuses the filter at boot, and the filmstrip "+" focuses it on
// EVERY summon, not just the first. That second half is what `pickerFocusLive` cannot see: the
// filter's `autoFocus` fires only on mount, so it relies on App MOUNTING the overlay per summon
// (`showPicker && <PickerOverlay …>`). An App that kept the overlay mounted and toggled it would
// focus the filter once and never again. Also pins that a dismiss hands focus back through App's
// own `onDismiss` wiring.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  bootIpc,
  settle,
  teardownIpc,
  uncaught,
} from "../components/workspace/__tests__/liveWorkspace";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock(
  "../components/workspace/XtermPane",
  async () =>
    (await import("../components/workspace/__tests__/liveWorkspace"))
      .xtermPaneModule,
);
vi.mock(
  "../components/workspace/RightPanelHost",
  async () =>
    (await import("../components/workspace/__tests__/liveWorkspace"))
      .rightPanelModule,
);
vi.mock(
  "../state/useWorkflowFeaturesEnabled",
  async () =>
    (await import("../components/workspace/__tests__/liveWorkspace"))
      .gateModule,
);

const LOCAL = "/tmp/scratch/scratch-a";

let root: Root | null = null;
let host: HTMLDivElement | null = null;
/** Stands in for the focused CC pane's xterm helper textarea (the pane itself is stubbed). */
let pane: HTMLTextAreaElement | null = null;

afterEach(async () => {
  await teardownIpc(root, host);
  pane?.remove();
  root = null;
  host = null;
  pane = null;
  expect(uncaught).toEqual([]);
});

async function bootApp() {
  bootIpc((cmd) => {
    if (cmd === "prune_missing_projects") return [];
    if (cmd === "list_projects")
      return [{ project_path: LOCAL, display_name: "scratch-a" }];
    if (cmd === "picker_announce_actions") return {};
    return null;
  });
  const { default: App } = await import("../App");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<App />));
  await settle();
}

const filter = () =>
  host!.querySelector<HTMLInputElement>('[data-testid="picker-filter"]');
const overlay = () => host!.querySelector('[data-testid="picker-overlay"]');

async function summon() {
  const plus = host!.querySelector<HTMLElement>(
    '[data-testid="filmstrip-add-workspace"]',
  );
  if (!plus) throw new Error("no filmstrip + control");
  await act(async () => plus.click());
  await settle();
}

async function pressEscape() {
  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
  await settle();
}

describe("picker filter focus through the real App", () => {
  it("the first-open scene focuses the filter at boot", async () => {
    await bootApp();
    expect(filter()).not.toBeNull();
    expect(document.activeElement).toBe(filter());
  });

  it("the + overlay focuses the filter on EVERY summon, and Esc hands focus back to the pane", async () => {
    await bootApp();
    const seed = (window as { __seedWorkspace?: (p: string) => void })
      .__seedWorkspace!;
    await act(async () => seed(LOCAL));
    await settle();
    expect(overlay()).toBeNull();

    pane = document.createElement("textarea");
    pane.className = "xterm-helper-textarea";
    document.body.appendChild(pane);
    pane.focus();

    for (const round of [1, 2]) {
      await summon();
      expect(overlay(), `round ${round}: overlay open`).not.toBeNull();
      expect(document.activeElement, `round ${round}: filter focused`).toBe(
        filter(),
      );
      await pressEscape();
      expect(overlay(), `round ${round}: overlay closed`).toBeNull();
      expect(document.activeElement, `round ${round}: pane refocused`).toBe(
        pane,
      );
    }
  });
});
