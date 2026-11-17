// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspaceStatusIndicator } from "../WorkspaceStatusIndicator";
import { Filmstrip } from "../Filmstrip";
import { PipTile } from "../../../pip/Pip";
import {
  applyStatusUpdate,
  emptyStatusMap,
  type WireLinkOverlay,
} from "../../../state/workspaceStatus";
import type { PipLayout } from "../../../pip/pipLayout";

// M17 WP4 (AC-6.2) — a remote workspace whose terminal is not attached shows the LAST state's hue,
// dimmed, plus a broken-link glyph and a plain-words tooltip, on the filmstrip (both tile forms)
// and the PiP row (every layout). Rendered, not regex'd: the question is what the DOM shows.

const LOST: WireLinkOverlay = { status: "reconnecting", host: "mini" };
const TITLE = "Not connected to mini: reconnecting";

const doc = (html: string) => {
  const d = document.implementation.createHTMLDocument("");
  d.body.innerHTML = html;
  return d;
};

const indicatorOf = (d: Document) =>
  d.querySelector<HTMLElement>('[data-testid="workspace-status-indicator"]')!;

describe("the link overlay's presentation", () => {
  it("dims the dot, keeps its hue, adds the glyph and the tooltip", () => {
    const d = doc(
      renderToStaticMarkup(
        <WorkspaceStatusIndicator
          state="awaiting_input"
          snippet="s"
          link={LOST}
        />,
      ),
    );
    const ind = indicatorOf(d);
    expect(ind.classList.contains("status-link-lost")).toBe(true);
    expect(ind.getAttribute("title")).toBe(TITLE);
    expect(ind.dataset.link).toBe("reconnecting");
    expect(ind.querySelector(".status-dot-awaiting")).not.toBeNull();
    expect(
      ind.querySelector('[data-testid="status-link-glyph"]'),
    ).not.toBeNull();
  });

  it("is absent without an overlay (positive control)", () => {
    const d = doc(
      renderToStaticMarkup(
        <WorkspaceStatusIndicator state="running" snippet="s" />,
      ),
    );
    const ind = indicatorOf(d);
    expect(ind.classList.contains("status-link-lost")).toBe(false);
    expect(ind.getAttribute("title")).toBe("s");
    expect(ind.querySelector('[data-testid="status-link-glyph"]')).toBeNull();
  });

  for (const collapsed of [true, false]) {
    it(`reaches the filmstrip tile (${collapsed ? "collapsed pill" : "expanded tile"})`, () => {
      const noop = () => {};
      const d = doc(
        renderToStaticMarkup(
          <Filmstrip
            tiles={[
              {
                id: "ws-r",
                project_path: "ssh://h/p",
                display_name: "remote",
                active: false,
              },
              {
                id: "ws-l",
                project_path: "/p",
                display_name: "local",
                active: false,
              },
            ]}
            statusFor={() => "running"}
            linkFor={(id) => (id === "ws-r" ? LOST : undefined)}
            collapsed={collapsed}
            onToggleCollapsed={noop}
            onPromote={noop}
            onReorder={noop}
            onAddWorkspace={noop}
            onOpenDashboard={noop}
            onClose={noop}
            onPauseClose={noop}
          />,
        ),
      );
      const titles = [
        ...d.querySelectorAll<HTMLElement>(
          '[data-testid="workspace-status-indicator"]',
        ),
      ].map((e) => e.getAttribute("title"));
      expect(titles).toContain(TITLE);
      expect(titles.filter((t) => t === TITLE)).toHaveLength(1);
      expect(d.querySelectorAll(".status-link-lost")).toHaveLength(1);
    });
  }

  // M17 WP5 (AC-4.4) — Detach is offered on REMOTE tiles only, in both layouts.
  for (const collapsed of [true, false]) {
    it(`offers Detach on the remote tile only (${collapsed ? "collapsed pill" : "expanded tile"})`, () => {
      const noop = () => {};
      const d = doc(
        renderToStaticMarkup(
          <Filmstrip
            tiles={[
              {
                id: "ws-r",
                project_path: "ssh://h/p",
                display_name: "remote",
                active: false,
              },
              {
                id: "ws-l",
                project_path: "/p",
                display_name: "local",
                active: false,
              },
            ]}
            statusFor={() => "running"}
            collapsed={collapsed}
            onToggleCollapsed={noop}
            onPromote={noop}
            onReorder={noop}
            onAddWorkspace={noop}
            onOpenDashboard={noop}
            onClose={noop}
            onPauseClose={noop}
            onDetach={noop}
          />,
        ),
      );
      const detach = d.querySelector('[data-testid="filmstrip-detach-ws-r"]');
      expect(detach).not.toBeNull();
      expect(detach?.getAttribute("aria-label")).toContain(
        "leave its Claude Code session running",
      );
      expect(
        d.querySelector('[data-testid="filmstrip-detach-ws-l"]'),
      ).toBeNull();
      // Positive control: the local tile has its × and ⏸.
      expect(
        d.querySelector('[data-testid="filmstrip-pause-ws-l"]'),
      ).not.toBeNull();
    });
  }

  const layouts: PipLayout[] = [
    "minimal",
    "compact",
    "horizontal-mirror",
    "vertical-mirror",
  ];
  for (const layout of layouts) {
    it(`reaches the PiP row (${layout})`, () => {
      const statusMap = applyStatusUpdate(emptyStatusMap, {
        workspace_id: "ws-r",
        state: "idle",
        link: LOST,
      });
      const d = doc(
        renderToStaticMarkup(
          <PipTile
            tile={{ id: "ws-r", display_name: "remote" }}
            layout={layout}
            statusMap={statusMap}
            mirrorRefs={{ current: new Map() }}
            lastMirrorRef={{ current: {} }}
          />,
        ),
      );
      const ind = indicatorOf(d);
      expect(ind.getAttribute("title")).toBe(TITLE);
      expect(ind.querySelector(".status-dot-idle")).not.toBeNull();
      expect(
        ind.querySelector('[data-testid="status-link-glyph"]'),
      ).not.toBeNull();
    });
  }
});
