// WP5 — Workspace: one project's pane. 50/50 horizontal split.
//
// Left half: the xterm.js terminal — a real PTY-backed CC session as of WP7.
// Right half: the RightPanelHost (WP5) — owns the Editor↔Diff(↔terminal) panels,
// the panel-select hotkeys (⌘⇧E/D/T), and the external-Sublime launch icon buttons
// (in the panel tab row, WP8).
// (Before WP5 the right half was an inline segmented toggle living in this file.)
//
// CRITICAL invariant (CLAUDE.md "All workspaces stay mounted"): this component
// is NEVER unmounted to switch the center stage. When not focused it stays mounted
// (xterm + PTY connection persist) but is pushed OFF-VIEWPORT (`left:-99999px`),
// NOT hidden with `display:none`. Two reasons, both load-bearing for M4 WP3's live
// filmstrip mirror (WP4 thumbnail-probe findings):
//   1. Off-viewport keeps the element laid out with real dimensions, so xterm's
//      FitAddon `fit()` still works (`display:none` → zero dims → `fit()` throws).
//   2. Off-viewport lets xterm's IntersectionObserver PAUSE the background
//      renderer for free (~5ms/frame saved) while the buffer still updates via
//      `write()` — so the filmstrip can read a current `serializeAsHTML()` snapshot
//      from the paused-renderer buffer (WP3 P3). `display:none` would also pause
//      rendering but breaks fit + can't be serialized into a sized tile.
// The `visible` prop drives that toggle, and is forwarded to RightPanelHost to gate
// panel liveness + the capture-phase hotkey (only the focused workspace's host reacts).

import { useEffect, useRef, useState } from "react";
import type { Workspace as WorkspaceModel } from "../../state/workspace";
import { XtermPane, type XtermPaneHandle } from "./XtermPane";
import { RightPanelHost } from "./RightPanelHost";
import { WorkspaceStatusIndicator } from "./WorkspaceStatusIndicator";
import type { WireWorkspaceState } from "../../state/workspaceStatus";
import { deriveFocusHalf, type FocusHalf } from "./focusHalf";

interface WorkspaceProps {
  workspace: WorkspaceModel;
  visible: boolean;
  /** Store the backend CC session id once cc_spawn resolves (WP7). */
  onSessionId?: (workspaceId: string, ccSessionId: string) => void;
  /** QoL-WP1 — register this workspace's unsaved-doc probe with App's close guard. */
  registerDirtyProbe?: (
    workspaceId: string,
    probe: (() => number) | null,
  ) => void;
  /**
   * Live CC state from the `workspace-status` hook channel (M3 WP6). Defaults to
   * `"unknown"` — the honest no-data state before any hook event arrives. Phase 2
   * feeds the live value from the app-level subscription.
   */
  statusState?: WireWorkspaceState;
  /** Last prompt/message snippet for the indicator tooltip (M3 WP6). */
  statusSnippet?: string;
}

export function Workspace({
  workspace,
  visible,
  onSessionId,
  registerDirtyProbe,
  statusState = "unknown",
  statusSnippet,
}: WorkspaceProps) {
  // M4 WP4b — which half (left CC terminal / right panel) holds keyboard focus, so the
  // CSS can paint a #6ea8ff accent on it. Capture-phase focusin/focusout on this
  // workspace's root keeps the read scoped to THIS workspace (no document-level
  // listener that every workspace would re-handle). Only the visible/center-stage
  // workspace indicates: backgrounds are off-viewport + unfocusable, and clearing to
  // "none" on hide prevents a stale accent if a workspace is demoted while focused.
  const rootRef = useRef<HTMLDivElement>(null);
  const [focusHalf, setFocusHalf] = useState<FocusHalf>("none");

  // QoL-WP3 — auto-focus the LEFT CC terminal when this workspace becomes the center
  // stage. The promote path (filmstrip click / ⌘⇧+digit / picker overlay / close
  // re-pick) only flips `focusedId` → our `visible` prop; the CC XtermPane is always
  // active=true, so its own mount/active-transition focus never re-fires on a switch.
  // This effect closes that gap: on the false→true `visible` edge (and on mount when
  // already visible), call the pane's imperative focus() so keystrokes land in this
  // project's CC session with zero clicks. Operator decision: ALWAYS focus CC-left for
  // v1 (no last-focused-half restore). rAF-deferred so the off-viewport→on-viewport
  // layout flip settles first (focusing a parked element is unreliable in WKWebview —
  // mirrors XtermPane's existing rAF-then-focus pattern). It calls focus() only — it
  // NEVER sends a byte to the PTY, so a switch can't inject a spurious prompt line.
  const ccPaneRef = useRef<XtermPaneHandle>(null);
  useEffect(() => {
    if (!visible) return;
    const raf = requestAnimationFrame(() => ccPaneRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !visible) {
      setFocusHalf("none");
      return;
    }
    // focusin bubbles (unlike focus) so a single listener on the root sees focus landing
    // anywhere inside either half. focusout's relatedTarget is where focus is GOING —
    // deriving the half from it (not the leaving element) keeps the accent correct when
    // moving directly from one half to the other, and clears to "none" on focus leaving
    // the workspace entirely (relatedTarget null or outside both halves).
    const onFocusIn = (e: FocusEvent) =>
      setFocusHalf(deriveFocusHalf(e.target));
    const onFocusOut = (e: FocusEvent) =>
      setFocusHalf(deriveFocusHalf(e.relatedTarget));
    root.addEventListener("focusin", onFocusIn, true);
    root.addEventListener("focusout", onFocusOut, true);
    return () => {
      root.removeEventListener("focusin", onFocusIn, true);
      root.removeEventListener("focusout", onFocusOut, true);
    };
  }, [visible]);

  return (
    <div
      ref={rootRef}
      className="workspace"
      data-testid={`workspace-${workspace.id}`}
      data-visible={visible ? "true" : "false"}
      // M4 WP4b — only the center-stage workspace lights a half; backgrounds stay "none".
      data-focus-half={visible ? focusHalf : "none"}
      // Always display:grid (real dimensions → FitAddon works); hidden workspaces
      // are pushed off-viewport instead of `display:none`. See the header comment:
      // this is what keeps background xterm buffers serializable for the WP3
      // filmstrip mirror while xterm pauses their off-screen renderer.
      style={
        visible
          ? { display: "grid" }
          : {
              display: "grid",
              position: "absolute",
              left: "-99999px",
              top: 0,
              // Match the on-stage footprint so FitAddon sizes the background
              // terminal the same as it will appear once promoted.
              width: "100%",
              height: "100%",
            }
      }
    >
      <div className="workspace-header" data-testid="workspace-header">
        <span className="workspace-header-name">{workspace.display_name}</span>
        <WorkspaceStatusIndicator state={statusState} snippet={statusSnippet} />
      </div>
      <div className="workspace-left">
        <XtermPane
          ref={ccPaneRef}
          workspaceId={workspace.id}
          projectPath={workspace.project_path}
          onSessionId={(sid) => onSessionId?.(workspace.id, sid)}
        />
      </div>
      <RightPanelHost
        workspaceId={workspace.id}
        projectPath={workspace.project_path}
        visible={visible}
        registerDirtyProbe={registerDirtyProbe}
      />
    </div>
  );
}
