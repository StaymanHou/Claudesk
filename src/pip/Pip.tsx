// M5 WP3 — PiP status surface (the floating NSPanel's content).
//
// Phase 2 (this commit): the horizontal-mirror tile row — one tile per open workspace
// (project name + M3 status dot), the full roster INCLUDING the center-staged one (the
// intentional divergence from the filmstrip). Two live subscriptions:
//   - `workspace-status` — the SAME backend broadcast the filmstrip reads (the backend
//     `app.emit` reaches every webview), folded into a WorkspaceStatusMap. Reusing
//     `applyStatusUpdate`/`stateFor` + `WorkspaceStatusIndicator` means the PiP and the
//     filmstrip share ONE palette and can never disagree on a workspace's state.
//   - `pip-frame` — the roster, forwarded from the main webview (App's usePipFanout),
//     since the PiP can't read the main app's React state. On mount we fire `pip-ready`
//     so the main webview replies with the current frame (the initial-state handshake —
//     a freshly-shown panel missed all prior emits).
//
// Phase 3 (this commit): the live ~1 fps serialize mirror is written into each tile
// body — the main webview's single shared ticker (useMirrorTicker) emits a `pip-mirror`
// snapshot (id → serializeAsHTML() HTML) which we write out-of-React into per-tile
// `.pip-tile-mirror` nodes (same pattern + safety rationale as the filmstrip: it's
// xterm's own serialize of OUR buffer, so no untrusted-HTML concern, and the innerHTML
// write bypasses a 1 fps React re-render of the whole panel).
//
// DISPLAY-ONLY (vision anti-goal "Not PiP click-to-focus in v1"): the tile is a plain
// <div>, NOT a button — it has NO onClick / promote handler. A click is inert. Do NOT
// "fix" this into click-to-focus; the PiP mirrors status, it does not control workspaces.
//
// Dark-only (project convention): styles in pip.css, self-contained (the panel webview
// does NOT load App.css). `data-tauri-drag-region` on the root makes the borderless
// panel draggable by its body.

import { useEffect, useRef, useState } from "react";
import { emitTo, listen } from "@tauri-apps/api/event";
import { WorkspaceStatusIndicator } from "../components/workspace/WorkspaceStatusIndicator";
import {
  applyStatusUpdate,
  emptyStatusMap,
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
  type PipMirrorFrame,
} from "./pipFrame";
import "./pip.css";

export function Pip() {
  const [frame, setFrame] = useState<PipFrame>(emptyPipFrame);
  const [statusMap, setStatusMap] =
    useState<WorkspaceStatusMap>(emptyStatusMap);

  // Per-tile mirror-INNER element refs (keyed by workspace id). The pip-mirror listener
  // writes serialized HTML straight into these (out-of-React DOM write — same approach
  // as the filmstrip's mirrorRefs). The latest mirror frame is also kept in a ref so a
  // tile that mounts after a mirror arrived (roster change) can paint its last snapshot.
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
    <div className="pip-root" data-tauri-drag-region data-testid="pip-root">
      {frame.tiles.length === 0 ? (
        <span className="pip-empty" data-testid="pip-empty">
          No workspaces
        </span>
      ) : (
        <div className="pip-row" data-testid="pip-row">
          {frame.tiles.map((tile) => (
            // DISPLAY-ONLY: a plain <div>, NOT a button — no onClick/promote handler.
            // The mirror body is the BASE layer; the name+dot header is an overlay on
            // top (same structure as the filmstrip tile). data-tauri-drag-region keeps
            // the whole surface draggable.
            <div
              key={tile.id}
              className="pip-tile"
              data-testid={`pip-tile-${tile.id}`}
              title={tile.display_name}
            >
              <div
                className="pip-tile-mirror"
                data-testid={`pip-tile-mirror-${tile.id}`}
                ref={(el) => {
                  if (el) {
                    mirrorRefs.current.set(tile.id, el);
                    // Paint the last-known snapshot so a tile that mounted after a
                    // pip-mirror arrived isn't blank until the next tick.
                    const html = lastMirrorRef.current[tile.id];
                    if (html) el.innerHTML = html;
                  } else {
                    mirrorRefs.current.delete(tile.id);
                  }
                }}
              />
              <div className="pip-tile-header">
                <span className="pip-tile-name">{tile.display_name}</span>
                <WorkspaceStatusIndicator
                  state={stateFor(statusMap, tile.id)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
