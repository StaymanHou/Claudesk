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
const LOCAL_B = "/tmp/scratch/scratch-b";

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

  it("a dismiss after a ⌘⇧digit switch focuses the NEW center-stage pane, never the background one", async () => {
    // paydown-2026-11-27 WP5. The saved restore target sits in the workspace that just went to
    // the background (`inert`). Live, focusing it is a no-op and focus was stranded on <body>;
    // jsdom does not enforce `inert`, so without the explicit check this test would see focus
    // land on the hidden pane instead. Either way the fix must hand focus to the visible pane.
    await bootApp();
    const seed = (window as { __seedWorkspace?: (p: string) => void })
      .__seedWorkspace!;
    await act(async () => seed(LOCAL));
    await settle();
    await act(async () => seed(LOCAL_B));
    await settle();
    const spaces = [...host!.querySelectorAll<HTMLElement>(".workspace")];
    expect(spaces).toHaveLength(2);
    // A CC-pane stand-in inside each workspace (the real `XtermPane` is stubbed here).
    const paneOf = new Map<HTMLElement, HTMLTextAreaElement>();
    for (const ws of spaces) {
      const wrap = document.createElement("div");
      wrap.dataset.testid = "xterm-pane";
      const ta = document.createElement("textarea");
      ta.className = "xterm-helper-textarea";
      wrap.appendChild(ta);
      ws.appendChild(wrap);
      paneOf.set(ws, ta);
    }
    const visible = () => spaces.find((w) => w.dataset.visible === "true")!;
    const before = visible();
    paneOf.get(before)!.focus();

    await summon();
    expect(document.activeElement).toBe(filter());
    // Switch to the OTHER workspace with the overlay still open (App's real capture listener).
    const otherIndex = spaces.indexOf(before) === 0 ? 2 : 1;
    await act(async () => {
      document.activeElement!.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: String(otherIndex),
          code: `Digit${otherIndex}`,
          metaKey: true,
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await settle();
    const after = visible();
    expect(after).not.toBe(before);
    expect(before.hasAttribute("inert")).toBe(true);

    await pressEscape();
    expect(overlay()).toBeNull();
    expect(document.activeElement).not.toBe(paneOf.get(before));
    expect(document.activeElement).toBe(paneOf.get(after));
  });
});
