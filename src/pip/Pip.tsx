// M5 WP3/WP4 — PiP status surface (the floating NSPanel's content).
//
// WP3 shipped ONE layout (the horizontal-mirror tile row). WP4 generalizes to FOUR
// (horizontal-mirror → vertical-mirror → compact → minimal); the active layout is
// BACKEND-OWNED — it arrives on the `pip-layout` broadcast (same single-source-of-truth
// posture as `pip-visibility`), so render (here) and resize (backend) read one value.
//
// Subscriptions (all webview-reachable; the backend `app.emit` reaches every webview):
//   - `workspace-status` — the SAME backend broadcast the filmstrip reads, folded into a
//     WorkspaceStatusMap. Reusing `applyStatusUpdate`/`stateFor` + `WorkspaceStatusIndicator`
//     means the PiP and the filmstrip share ONE palette and can never disagree on a
//     workspace's state (the WP4 cross-layout invariant).
//   - `pip-frame` — the roster, forwarded from the main webview (App's usePipFanout),
//     since the PiP can't read the main app's React state. On mount we fire `pip-ready`
//     so the main webview replies with the current frame (the initial-state handshake).
//   - `pip-mirror` — the live ~1 fps serialize snapshot (only emitted while a MIRROR
//     layout is active — compact/minimal pay nothing).
//   - `pip-layout` — the active layout. (Phase 2 adds the on-panel switcher + persisted
//     read-back; Phase 1 seeds the default and just renders whatever layout arrives.)
//
// DISPLAY-ONLY (vision anti-goal "Not PiP click-to-focus in v1"): tiles are plain <div>s,
// NOT buttons — no onClick/promote handler in any layout. A click is inert. Do NOT
// "fix" this into click-to-focus; the PiP mirrors status, it does not control workspaces.
//
// Dark-only (project convention): styles in pip.css, self-contained (the panel webview
// does NOT load App.css). The borderless panel is dragged by its body via the root's
// `onMouseDown={startPanelDrag}` → `pip_move` (data-tauri-drag-region is inert on the
// swizzled NSPanel — see startPanelDrag below).

import { useEffect, useRef, useState } from "react";
import { emitTo, listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { WorkspaceStatusIndicator } from "../components/workspace/WorkspaceStatusIndicator";
import {
  applyStatusUpdate,
  emptyStatusMap,
  snippetFor,
  stateFor,
  WORKSPACE_STATUS_EVENT,
  type WorkspaceStatusMap,
  type WorkspaceStatusUpdate,
} from "../state/workspaceStatus";
import {
  emptyPipFrame,
  PIP_FRAME_EVENT,
  PIP_MIRROR_EVENT,
  PIP_READY_EVENT,
  type PipFrame,
  type PipFrameTile,
  type PipMirrorFrame,
} from "./pipFrame";
import {
  coercePipLayout,
  DEFAULT_PIP_LAYOUT,
  isAwaitingInput,
  nextLayout,
  orderForAttention,
  PIP_LAYOUT_EVENT,
  type PipLayout,
} from "./pipLayout";
import { computePanelSize } from "./pipPanelSize";
import "./pip.css";

export function Pip() {
  const [frame, setFrame] = useState<PipFrame>(emptyPipFrame);
  const [statusMap, setStatusMap] =
    useState<WorkspaceStatusMap>(emptyStatusMap);
  // WP4 — the active layout, driven by the backend `pip-layout` broadcast (single
  // source of truth). Seeded to the default; Phase 2 wires the persisted read-back.
  const [layout, setLayout] = useState<PipLayout>(DEFAULT_PIP_LAYOUT);

  // Per-tile mirror-INNER element refs (keyed by workspace id). The pip-mirror listener
  // writes serialized HTML straight into these (out-of-React DOM write — same approach
  // as the filmstrip's mirrorRefs). The latest mirror frame is also kept in a ref so a
  // tile that mounts after a mirror arrived (roster/layout change) can paint its last
  // snapshot. Only the mirror layouts register these nodes; compact/minimal don't.
  const mirrorRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const lastMirrorRef = useRef<PipMirrorFrame>({});

  // Subscribe to the roster (pip-frame from the main webview) + fire the mount-time
  // pip-ready ping so the main webview replies with the current frame. The `cancelled`
  // guard mirrors useWorkspaceStatus (async `listen` must still unlisten if torn down
  // before it resolves).
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void listen<PipFrame>(PIP_FRAME_EVENT, (event) => {
      setFrame(event.payload);
    }).then((fn) => {
      if (cancelled) {
        fn();
        return;
      }
      unlisten = fn;
      // Ask the main webview for the current frame now that we're listening.
      void emitTo("main", PIP_READY_EVENT, {}).catch(() => {
        // Best-effort: if main isn't reachable yet, the next roster change re-emits.
      });
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // Subscribe to the same workspace-status broadcast the filmstrip reads (the backend
  // emits to ALL webviews). Honest `unknown` until a workspace's first event.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void listen<WorkspaceStatusUpdate>(WORKSPACE_STATUS_EVENT, (event) => {
      setStatusMap((map) => applyStatusUpdate(map, event.payload));
    }).then((fn) => {
      if (cancelled) {
        fn();
        return;
      }
      unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // WP4 — subscribe to the active layout (backend `pip-layout` broadcast). coerce so a
  // stale/corrupt value falls back to the default rather than rendering a broken panel.
  // ALSO seed the layout once on mount from the PERSISTED value (pip_get_layout) — a
  // freshly-shown panel must open in the user's last-chosen layout, not the default,
  // and it missed any prior broadcast (same rationale as the pip-frame handshake).
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void listen<string>(PIP_LAYOUT_EVENT, (event) => {
      setLayout(coercePipLayout(event.payload));
    }).then((fn) => {
      if (cancelled) {
        fn();
        return;
      }
      unlisten = fn;
    });
    // Seed from the persisted layout. coerce guards a malformed stored value.
    void invoke<string>("pip_get_layout")
      .then((stored) => {
        if (!cancelled) setLayout(coercePipLayout(stored));
      })
      .catch(() => {
        // Best-effort: on failure we keep the default; the next pip-layout broadcast
        // (or a manual switch) corrects it.
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // WP4 — the on-panel switcher. Cycle to the next layout (pure nextLayout) and call
  // the backend to PERSIST + broadcast it; the listener above then drives our `layout`
  // state from the broadcast (backend = single source of truth, NOT an optimistic
  // local set — keeps render/resize/persist reading one value). The switcher button is
  // excluded from the body-drag in startPanelDrag (`.pip-layout-switch` closest-check)
  // so a click cycles rather than starting a window drag.
  const cycleLayout = () => {
    void invoke("pip_set_layout", { layout: nextLayout(layout) }).catch(() => {
      // Best-effort; a failed persist leaves the current layout in place.
    });
  };

  // WP4 Phase 5 — drag the panel by its body. Neither `data-tauri-drag-region` nor the
  // Tauri window-move API works on this borderless NonactivatingPanel (both inert —
  // confirmed 2026-06-26), and dropping `.borderless()` to get AppKit's native body-drag
  // re-triggers the WP1 setStyleMask crash. So we track the pointer ourselves and move the
  // panel via the backend `pip_move` (AppKit setFrameOrigin:, the only path that moves it).
  // On mousedown (primary button, NOT on the switcher button), we capture the screen
  // position and listen on `window` for mousemove/up; each move sends the delta since the
  // last move. Listening on `window` (not the element) keeps the drag alive even if the
  // fast-moving cursor outruns the small panel. screenX/screenY are stable across the move.
  const startPanelDrag = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // primary button only
    if ((e.target as HTMLElement).closest(".pip-layout-switch")) return; // switcher click-through
    e.preventDefault();
    let lastX = e.screenX;
    let lastY = e.screenY;
    const onMove = (m: MouseEvent) => {
      const dx = m.screenX - lastX;
      const dy = m.screenY - lastY;
      lastX = m.screenX;
      lastY = m.screenY;
      if (dx === 0 && dy === 0) return;
      void invoke("pip_move", { dx, dy }).catch(() => {
        // Best-effort; if the panel isn't ready the move just no-ops.
      });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // WP4 Phase 3 (content-driven sizing) — the panel size is a function of the LAYOUT and
  // the WORKSPACE COUNT, computed HERE (the PiP has the roster + screen) and applied via
  // the backend `pip_resize`. Recompute whenever the layout or the roster size changes —
  // 2 workspaces in a row need a narrower panel than 5; switching to minimal shrinks it;
  // a row/column that would exceed ~90% of the screen wraps (computePanelSize handles the
  // cap + wrap). Reading window.screen.avail* keeps it on the current display.
  const tileCount = frame.tiles.length;
  useEffect(() => {
    const { width, height } = computePanelSize(layout, tileCount, {
      availWidth: window.screen.availWidth,
      availHeight: window.screen.availHeight,
    });
    void invoke("pip_resize", { width, height }).catch(() => {
      // Best-effort; if the panel isn't built yet the backend no-ops.
    });
  }, [layout, tileCount]);

  // Subscribe to the live ~1 fps serialize mirror (pip-mirror from the main webview's
  // single shared ticker). Write each tile's HTML straight into its mirror node (out of
  // React — no 1 fps whole-panel re-render). A tile with no entry this frame keeps its
  // prior content (don't blank it). Stash the frame so a just-mounted tile can paint.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void listen<PipMirrorFrame>(PIP_MIRROR_EVENT, (event) => {
      lastMirrorRef.current = event.payload;
      for (const [id, html] of Object.entries(event.payload)) {
        const node = mirrorRefs.current.get(id);
        if (node) node.innerHTML = html;
      }
    }).then((fn) => {
      if (cancelled) {
        fn();
        return;
      }
      unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return (
    <div
      className={`pip-root pip-layout-${layout}`}
      data-testid="pip-root"
      data-layout={layout}
      onMouseDown={startPanelDrag}
    >
      {/* Layout switcher — its OWN ROW at the top (NOT an overlay on a tile — that
          overlapped the status dot + was hard to spot; operator feedback 2026-06-26).
          The whole panel drags by its body via `onMouseDown={startPanelDrag}`; the
          switcher button opts OUT of the drag (`.pip-layout-switch` is excluded in
          startPanelDrag) so a click cycles rather than dragging. The button shows an icon
          DEPICTING THE CURRENT LAYOUT — clicking advances to the next, and the icon
          updates. So the control doubles as a layout indicator. */}
      <div className="pip-switch-row">
        <button
          type="button"
          className="pip-layout-switch"
          data-testid="pip-layout-switch"
          onClick={cycleLayout}
          aria-label={`PiP layout: ${layout} — click to cycle`}
          title={`Layout: ${layout} — click to cycle`}
        >
          <LayoutIcon layout={layout} />
        </button>
      </div>
      {frame.tiles.length === 0 ? (
        <span className="pip-empty" data-testid="pip-empty">
          No workspaces
        </span>
      ) : (
        <div className="pip-tiles" data-testid="pip-tiles">
          {/* Phase 4 — the minimal layout (the "is anyone waiting on me?" glance) sorts
              awaiting-input workspaces to the FRONT so "needs me" lands where the eye
              hits first; every other layout keeps the persisted filmstrip order. */}
          {(layout === "minimal"
            ? orderForAttention(frame.tiles, statusMap)
            : frame.tiles
          ).map((tile) => (
            <PipTile
              key={tile.id}
              tile={tile}
              layout={layout}
              statusMap={statusMap}
              mirrorRefs={mirrorRefs}
              lastMirrorRef={lastMirrorRef}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The switcher's icon — DEPICTS THE CURRENT LAYOUT (operator design, 2026-06-26): the
 * control is also a layout indicator. One glyph per layout, drawn as a tiny SVG (crisp at
 * 14px, dark-palette stroke/fill):
 *   - horizontal-mirror → two TALL rectangles side-by-side (the thumbnail row)
 *   - vertical-mirror    → two FLAT rectangles stacked (the thumbnail column)
 *   - compact            → hamburger (3 horizontal lines = the name rows)
 *   - minimal            → 3 dots (= the dots view)
 * `currentColor` so the button's hover color flows through.
 */
function LayoutIcon({ layout }: { layout: PipLayout }) {
  const stroke = "currentColor";
  switch (layout) {
    case "horizontal-mirror":
      // two tall rects side-by-side
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <rect x="2" y="2.5" width="4" height="9" rx="1" fill={stroke} />
          <rect x="8" y="2.5" width="4" height="9" rx="1" fill={stroke} />
        </svg>
      );
    case "vertical-mirror":
      // two flat rects stacked
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <rect x="2.5" y="2" width="9" height="4" rx="1" fill={stroke} />
          <rect x="2.5" y="8" width="9" height="4" rx="1" fill={stroke} />
        </svg>
      );
    case "compact":
      // hamburger — 3 horizontal lines (name rows)
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <rect x="2" y="3" width="10" height="1.6" rx="0.8" fill={stroke} />
          <rect x="2" y="6.2" width="10" height="1.6" rx="0.8" fill={stroke} />
          <rect x="2" y="9.4" width="10" height="1.6" rx="0.8" fill={stroke} />
        </svg>
      );
    case "minimal":
      // 3 dots (the dots view)
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <circle cx="3.5" cy="7" r="1.4" fill={stroke} />
          <circle cx="7" cy="7" r="1.4" fill={stroke} />
          <circle cx="10.5" cy="7" r="1.4" fill={stroke} />
        </svg>
      );
  }
}

/**
 * One PiP tile, rendered per the active layout. DISPLAY-ONLY (plain <div>, no onClick) in
 * every layout. The four layouts differ only in WHAT each tile shows:
 *   - mirror layouts (horizontal/vertical) → the live serialize mirror BASE + a name+dot
 *     header overlay (WP3's structure), arranged in a row or column by `.pip-tiles` CSS.
 *   - compact → name + dot only, no mirror node (so no serialize target is registered).
 *   - minimal → a bare dot only (Phase 4 adds attention-weighting + ordering); a `title`
 *     keeps the project resolvable on hover even with no visible name.
 */
function PipTile({
  tile,
  layout,
  statusMap,
  mirrorRefs,
  lastMirrorRef,
}: {
  tile: PipFrameTile;
  layout: PipLayout;
  statusMap: WorkspaceStatusMap;
  mirrorRefs: React.MutableRefObject<Map<string, HTMLDivElement | null>>;
  lastMirrorRef: React.MutableRefObject<PipMirrorFrame>;
}) {
  const state = stateFor(statusMap, tile.id);
  const snippet = snippetFor(statusMap, tile.id);

  if (layout === "minimal") {
    // Dot only — no name, no mirror. `title` keeps it resolvable to a project on hover
    // (P4.3). Phase 4: an awaiting-input ("needs me") dot gets `.pip-tile-awaiting` so CSS
    // makes it POP (larger + brighter + pulse) against the calm running/idle dots — the
    // operator's "is anyone waiting on me?" glance. The dot COLOR is unchanged (shared M3
    // palette via WorkspaceStatusIndicator → never disagrees with the filmstrip); only the
    // EMPHASIS differs. Ordering (awaiting-first) is applied by the caller's orderForAttention.
    const awaiting = isAwaitingInput(statusMap, tile.id);
    return (
      <div
        className={`pip-tile pip-tile-minimal${awaiting ? " pip-tile-awaiting" : ""}`}
        data-testid={`pip-tile-${tile.id}`}
        title={tile.display_name}
      >
        <WorkspaceStatusIndicator state={state} snippet={snippet} />
      </div>
    );
  }

  if (layout === "compact") {
    // Name + dot, no mirror (no serialize cost — the mirror node is NOT registered).
    return (
      <div
        className="pip-tile pip-tile-compact"
        data-testid={`pip-tile-${tile.id}`}
        title={tile.display_name}
      >
        <span className="pip-tile-name">{tile.display_name}</span>
        <WorkspaceStatusIndicator state={state} snippet={snippet} />
      </div>
    );
  }

  // Mirror layouts (horizontal-mirror / vertical-mirror): the serialized terminal is the
  // BASE layer; the name+dot header is an overlay on top (same structure as WP3 + the
  // filmstrip tile). The whole panel stays draggable via the root's `startPanelDrag`
  // (data-tauri-drag-region is inert on the swizzled NSPanel — see WP4 Phase 5 above).
  // Row-vs-column flow is decided by `.pip-tiles` CSS per `data-layout` — NOT here.
  return (
    <div
      className="pip-tile pip-tile-mirror-layout"
      data-testid={`pip-tile-${tile.id}`}
      title={tile.display_name}
    >
      <div
        className="pip-tile-mirror"
        data-testid={`pip-tile-mirror-${tile.id}`}
        ref={(el) => {
          if (el) {
            mirrorRefs.current.set(tile.id, el);
            // Paint the last-known snapshot so a tile that mounted after a pip-mirror
            // arrived (or after a layout switch back to a mirror layout) isn't blank
            // until the next tick.
            const html = lastMirrorRef.current[tile.id];
            if (html) el.innerHTML = html;
          } else {
            mirrorRefs.current.delete(tile.id);
          }
        }}
      />
      <div className="pip-tile-header">
        <span className="pip-tile-name">{tile.display_name}</span>
        <WorkspaceStatusIndicator state={state} snippet={snippet} />
      </div>
    </div>
  );
}
