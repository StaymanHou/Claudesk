// M4 WP3 — the Filmstrip: a roster of tiles, one per open workspace.
//
// Renders one tile per open workspace (including the center-staged one, marked active
// — a complete roster so ⌘⇧+digit indices stay stable), each with a project-name label
// + an M3-hook status dot (reusing WorkspaceStatusIndicator so the filmstrip and the
// center-stage header always agree). The WP2 "+" add-workspace control stays.
//
//   - P2: click + ⌘⇧+digit promote (tiles are switch affordances; promote via onPromote)
//   - P3: live ~1 fps serializeAsHTML() mirror on BACKGROUND tiles; the center-staged
//     tile is a STATIC placeholder (it's already full-size on the stage — mirroring it
//     is wasted CPU). (M5 WP3 update: the SERIALIZE moved to the App-level
//     useMirrorTicker — one shared loop feeds both the filmstrip and the PiP, no
//     duplicate serialize. This component's loop now only READS the shared mirrorFrame
//     snapshot and writes it into the tile body. Pauses on document.hidden; WP4 collapse
//     still gates it.)
//   - P4 (next): drag-to-reorder + persisted order.

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { WorkspaceStatusIndicator } from "./WorkspaceStatusIndicator";
import type { FilmstripTile } from "./filmstripTiles";
import { readMirrorFrame } from "./mirrorFrame";
import { shouldRunMirror } from "./mirrorTicker";
import { insertionIndex } from "./filmstripOrder";
import type { WireWorkspaceState } from "../../state/workspaceStatus";

/** ~1 fps — the WP4-probe-validated background mirror rate (lower if dogfooding shows
 *  the active-CPU p95 ~30%-on-bursts caveat bites: the documented mitigations are
 *  sub-1fps background rate, coalesced serialize, or mirror-only-visible tiles). */
const MIRROR_INTERVAL_MS = 1000;

interface FilmstripProps {
  /** The ordered tiles (derived once in App so the ⌘⇧+digit index agrees). */
  tiles: FilmstripTile[];
  /** Live CC state lookup by workspace id (M3 WP6 `workspace-status` channel). */
  statusFor: (workspaceId: string) => WireWorkspaceState;
  /** M4 WP4 — collapsed = one-line status-pill row (no live mirror); expanded = full
   *  thumbnail tiles. Drives both the render mode AND the mirror-ticker gate (P2). */
  collapsed: boolean;
  /** M4 WP4 — flip the collapse preference (App persists it). */
  onToggleCollapsed: () => void;
  /** Promote a workspace to center stage (M4 WP3 P2 — tile click). */
  onPromote: (workspaceId: string) => void;
  /** Reorder tiles LIVE: move from index → to index (fires on every pointermove that
   *  crosses a boundary — WYSIWYG, no persist). */
  onReorder: (from: number, to: number) => void;
  /** Commit + persist the current order (fires once on pointerup). */
  onReorderCommit: () => void;
  /** Open the ProjectPicker overlay to add another workspace (M4 WP2). */
  onAddWorkspace: () => void;
  /** Close a workspace (QoL-WP1 — the per-tile × button). App runs the dirty guard. */
  onClose: (workspaceId: string) => void;
}

/** Px the pointer must travel before a press becomes a drag (vs a click-to-promote). */
const DRAG_THRESHOLD_PX = 5;

export function Filmstrip({
  tiles,
  statusFor,
  collapsed,
  onToggleCollapsed,
  onPromote,
  onReorder,
  onReorderCommit,
  onAddWorkspace,
  onClose,
}: FilmstripProps) {
  // M4 WP3 P4 — POINTER-based live (WYSIWYG) reorder. A press that stays under
  // DRAG_THRESHOLD_PX is a click (promote, P2); past it, it's a drag — and on each move
  // we hit-test the pointer x against the tile rects and call onReorder LIVE so tiles
  // shuffle in real time. Persistence is committed once on pointerup. Native HTML5 DnD
  // was replaced here (P4 verify-human F23): its onDrop didn't fire in the WKWebView and
  // it can't do on-the-fly reordering.
  //
  // CRITICAL (P4 verify-human round 3, proven in a standalone hello-world): pointer
  // capture + the move/up handlers live on the STABLE strip container, NOT the per-tile
  // button. The live reorder re-renders the tiles every move, which destroys+recreates
  // the dragged button — if capture were on the button, that rebuild drops the capture
  // and the drag dies after one frame (the "won't move left / refuses to reorder" bug).
  // The strip <div> is never rebuilt, so capture survives the whole drag.
  const dragRef = useRef<{
    id: string;
    startX: number;
    started: boolean;
  } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);

  const onStripPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // primary button only
    const tileEl = (e.target as HTMLElement).closest<HTMLElement>(
      "[data-tile-index]",
    );
    if (!tileEl) return; // pressed the "+" control or empty space
    const id = tileEl.dataset.id;
    if (!id) return;
    dragRef.current = { id, startX: e.clientX, started: false };
    stripRef.current?.setPointerCapture(e.pointerId);
  };

  const onStripPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (!drag.started) {
      if (Math.abs(e.clientX - drag.startX) < DRAG_THRESHOLD_PX) return;
      drag.started = true; // crossed the threshold → it's a drag
      setDraggingId(drag.id);
    }
    const from = tiles.findIndex((t) => t.id === drag.id);
    if (from === -1) return;
    const to = targetIndex(e.clientX, from);
    if (from !== to) onReorder(from, to);
  };

  const onStripPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (stripRef.current?.hasPointerCapture(e.pointerId)) {
      stripRef.current.releasePointerCapture(e.pointerId);
    }
    if (!drag) return;
    if (drag.started) {
      setDraggingId(null);
      onReorderCommit(); // persist the final arrangement once
    } else {
      onPromote(drag.id); // no drag → it was a click
    }
  };

  const onStripPointerCancel = () => {
    dragRef.current = null;
    setDraggingId(null);
  };

  // Map a pointer clientX to the index the dragged tile should move to. The DOM read
  // (each tile's horizontal midpoint) stays here; the symmetric insertion math is the
  // pure `insertionIndex` (filmstripOrder.ts, vitest-pinned) — it excludes the dragged
  // tile so left and right both work (P4 verify-human r2 fix).
  const targetIndex = (clientX: number, fromIndex: number): number => {
    const strip = stripRef.current;
    if (!strip) return fromIndex;
    const midpoints = Array.from(
      strip.querySelectorAll<HTMLElement>("[data-tile-index]"),
    ).map((el) => {
      const r = el.getBoundingClientRect();
      return r.left + r.width / 2;
    });
    return insertionIndex(midpoints, fromIndex, clientX);
  };
  // Per-tile mirror-INNER element refs, keyed by workspace id. The ticker writes the
  // serialized HTML straight into these nodes (out-of-React DOM write — the content is
  // xterm's own serializeAsHTML() of our terminal buffer, so no untrusted-HTML concern,
  // and bypassing React state avoids a 1 fps re-render of the whole strip). The inner
  // node is sized to the terminal's NATURAL width (`.filmstrip-tile-mirror` in App.css:
  // fixed wide width + `white-space:pre` + `transform:scale(...)`) so serialized lines
  // do NOT wrap to the tiny tile width — wrapping was the "vertical white bar" bug
  // (P3 verify-human 2026-06-23: the <pre> reflowed every char into one column).
  const mirrorRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

  // A stable signature of "which tiles are backgrounds" — the ticker restarts when this
  // changes (a switch promotes/demotes a tile, or a workspace opens/closes), so the
  // newly-backgrounded tile starts mirroring and the newly-active one stops.
  const activeId = tiles.find((t) => t.active)?.id ?? null;
  const bgSignature = tiles
    .filter((t) => !t.active)
    .map((t) => t.id)
    .join(",");

  useEffect(() => {
    // The active tile is a static placeholder: clear any stale mirror HTML the ticker
    // wrote while it was a background (the out-of-React innerHTML isn't React-managed, so
    // it lingers across a promote unless we clear it here).
    if (activeId) {
      const activeMirror = mirrorRefs.current.get(activeId);
      if (activeMirror) activeMirror.innerHTML = "";
    }

    // M4 WP4 P2 — collapsed = no thumbnails to mirror into; gate the ticker entirely so
    // serializeTerminal() is never called and the background-render CPU cost goes to
    // zero. The decision (expanded AND ≥1 background tile) is the pure `shouldRunMirror`
    // (mirrorTicker.ts, vitest-pinned). `collapsed` is in the deps, so collapse tears the
    // interval down (cleanup) and expand restarts it (with the immediate first tick()
    // below). The xterm buffers keep updating via write() regardless (M1 rule) — only the
    // *read* pauses.
    const backgroundIds = bgSignature ? bgSignature.split(",") : [];
    if (!shouldRunMirror(collapsed, backgroundIds.length)) return;

    // M5 WP3 Phase 3: the SERIALIZE now happens once in the App-level useMirrorTicker
    // (shared with the PiP — no second serialize loop). This loop only READS the shared
    // `mirrorFrame` snapshot and writes it into the tile DOM. We keep a separate write
    // interval (vs. writing from the ticker) so the filmstrip's DOM-write stays local to
    // this component and its refs; the cost we eliminated was the duplicate serialize,
    // not the cheap innerHTML write.
    const tick = () => {
      if (document.hidden) return; // app not visible → skip the DOM churn
      for (const id of backgroundIds) {
        const mirror = mirrorRefs.current.get(id);
        if (!mirror) continue;
        const html = readMirrorFrame(id);
        // null → not serialized this frame yet (pre-mount / first tick); leave prior.
        if (html !== null) mirror.innerHTML = html;
      }
    };

    tick(); // paint an immediate first frame so a freshly-demoted tile isn't blank for 1s
    const timer = setInterval(tick, MIRROR_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [bgSignature, activeId, collapsed]);

  return (
    <div
      className={`filmstrip${collapsed ? " filmstrip--collapsed" : ""}`}
      data-testid="filmstrip"
      data-collapsed={collapsed ? "true" : "false"}
      ref={stripRef}
      // M4 WP3 P4 — pointer handlers live HERE on the stable strip (not per-tile): the
      // live reorder rebuilds the tile buttons each move, so capturing on a tile would
      // drop the capture mid-drag (proven root cause, P4 verify-human r3). closest()
      // resolves which tile was pressed. In collapsed mode the pills carry no
      // [data-tile-index], so onStripPointerDown bails and the pills' own onClick
      // (click-to-promote) handles them — drag-reorder is an expanded-only affordance.
      onPointerDown={onStripPointerDown}
      onPointerMove={onStripPointerMove}
      onPointerUp={onStripPointerUp}
      onPointerCancel={onStripPointerCancel}
    >
      {/* M4 WP4 — the collapse toggle. Expanded ↔ collapsed; persisted by App. Sits at
          the head of the strip in both modes. */}
      <button
        type="button"
        className="filmstrip-collapse-toggle"
        data-testid="filmstrip-collapse-toggle"
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand filmstrip" : "Collapse filmstrip"}
        title={collapsed ? "Expand filmstrip" : "Collapse filmstrip"}
        onClick={onToggleCollapsed}
      >
        {collapsed ? "▸" : "▾"}
      </button>

      {collapsed
        ? // COLLAPSED — a one-line row of mini status pills (project name + M3 dot only,
          // no live mirror). Click-to-promote preserved (vision metric 4: glance→switch
          // from the thin row). No drag wiring (no data-tile-index).
          tiles.map((tile) => (
            <button
              type="button"
              key={tile.id}
              data-id={tile.id}
              className={`filmstrip-pill${tile.active ? " filmstrip-pill--active" : ""}`}
              data-testid={`filmstrip-pill-${tile.id}`}
              data-active={tile.active ? "true" : "false"}
              title={tile.display_name}
              aria-label={`Switch to ${tile.display_name}`}
              aria-current={tile.active ? "true" : undefined}
              onClick={() => onPromote(tile.id)}
            >
              <span className="filmstrip-pill-name">{tile.display_name}</span>
              <WorkspaceStatusIndicator state={statusFor(tile.id)} />
              {/* QoL-WP1 (P3.6 — operator request) — close (×) on the collapsed pill too.
                  stopPropagation so the pill's own onClick (promote) doesn't fire; the
                  click routes through the SAME onClose → App.requestClose (dirty-guard +
                  focus-repick + reap unchanged). span role=button avoids nesting a
                  <button> inside the pill <button>. */}
              <span
                role="button"
                tabIndex={0}
                className="filmstrip-pill-close"
                data-testid={`filmstrip-close-${tile.id}`}
                aria-label={`Close ${tile.display_name}`}
                title={`Close ${tile.display_name}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(tile.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onClose(tile.id);
                  }
                }}
              >
                ×
              </span>
            </button>
          ))
        : // EXPANDED — the full WP3 thumbnail tiles.
          tiles.map((tile, index) => (
            <button
              type="button"
              key={tile.id}
              data-tile-index={index}
              data-id={tile.id}
              className={
                `filmstrip-tile${tile.active ? " filmstrip-tile--active" : ""}` +
                (draggingId === tile.id ? " filmstrip-tile--dragging" : "")
              }
              data-testid={`filmstrip-tile-${tile.id}`}
              data-active={tile.active ? "true" : "false"}
              title={tile.display_name}
              aria-label={`Switch to ${tile.display_name}`}
              aria-current={tile.active ? "true" : undefined}
            >
              {/* The mirror body is the BASE layer filling the whole tile; the header is
                  a semi-transparent OVERLAY floated on top (operator request P3
                  verify-human). Background tiles get a live ~1 fps serializeAsHTML()
                  mirror written into the inner `.filmstrip-tile-mirror` node by the
                  ticker; the active tile shows no mirror (just the glyph) — it's already
                  full-size on the center stage. The body clips; the inner node is
                  terminal-natural-width + scaled (App.css) so lines don't wrap (the P3
                  white-bar fix). */}
              <div
                className="filmstrip-tile-body"
                data-testid={`filmstrip-tile-body-${tile.id}`}
              >
                <div
                  className="filmstrip-tile-mirror"
                  data-testid={`filmstrip-tile-mirror-${tile.id}`}
                  ref={(el) => {
                    if (el) mirrorRefs.current.set(tile.id, el);
                    else mirrorRefs.current.delete(tile.id);
                  }}
                />
                {tile.active && (
                  <span
                    className="filmstrip-tile-active-glyph"
                    aria-hidden="true"
                  />
                )}
              </div>
              <div className="filmstrip-tile-header">
                <span className="filmstrip-tile-name">{tile.display_name}</span>
                <WorkspaceStatusIndicator state={statusFor(tile.id)} />
                {/* QoL-WP1 — close (×). stopPropagation on pointerdown so the strip's
                    drag/promote handler (onStripPointerDown) never treats this as a tile
                    press; the click closes via onClose (App runs the dirty guard). The
                    button is a child of the tile <button> — invalid nested <button> in
                    strict HTML, but it renders + works in WKWebView; rendered as a <span>
                    role=button to stay valid and avoid the nested-button warning. */}
                <span
                  role="button"
                  tabIndex={0}
                  className="filmstrip-tile-close"
                  data-testid={`filmstrip-close-${tile.id}`}
                  aria-label={`Close ${tile.display_name}`}
                  title={`Close ${tile.display_name}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(tile.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      onClose(tile.id);
                    }
                  }}
                >
                  ×
                </span>
              </div>
            </button>
          ))}
      <button
        type="button"
        className="filmstrip-add"
        data-testid="filmstrip-add-workspace"
        aria-label="Open another project"
        title="Open another project"
        onClick={onAddWorkspace}
      >
        +
      </button>
    </div>
  );
}
