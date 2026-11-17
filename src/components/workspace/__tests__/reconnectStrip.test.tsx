// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountWorkspace, uncaught, unmountWorkspace } from "./liveWorkspace";
import { reconnectStripText } from "../reconnectStrip";

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

// M17 WP4 (AC-7) — while a remote pane reconnects, keys typed into it are dropped; a persistent,
// non-modal strip says so, on a LIVE Workspace mount, and is gone without the overlay.

afterEach(async () => {
  vi.restoreAllMocks();
  await unmountWorkspace();
});

const stripOf = (el: Element) =>
  el.querySelector<HTMLElement>('[data-testid="workspace-reconnect-strip"]');

describe("the reconnecting strip", () => {
  it("shows the plain-words strip while the pane reconnects", async () => {
    const el = await mountWorkspace({
      gate: false,
      projectPath: "ssh://me@mini-host/Users/me/proj",
      statusLink: { status: "reconnecting", host: "mini" },
    });
    const strip = stripOf(el);
    expect(strip?.textContent).toBe(reconnectStripText("mini"));
    expect(strip?.getAttribute("role")).toBe("status");
    expect(strip?.textContent).toBe(
      "Not connected to mini. Keys you type are not sent; reconnecting…",
    );
    expect(uncaught).toEqual([]);
  });

  it("is absent when attached", async () => {
    const el = await mountWorkspace({
      gate: false,
      projectPath: "ssh://me@mini-host/Users/me/proj",
    });
    expect(stripOf(el)).toBeNull();
  });
});
