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
import {
  loadSplitState,
  saveSplitState,
  gridColumnsFor,
  cycleRatio,
  toggleCollapse,
  type SplitState,
} from "./splitWidth";

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

  // M6 WP3 — the outer left/right split ratio. App-global (one state shared by all
  // workspaces, mirroring the file-tree rail's app-global model — UI chrome, not
  // project data). The derived `grid-template-columns` overrides the App.css 1fr/1fr
  // default via an inline style on `.workspace`. Phase 1: the three ratio presets,
  // cycled by the header button. Collapse toggles arrive in Phase 2 (the state shape
  // already carries `collapsed`, so persistence is forward-compatible).
  const [splitState, setSplitState] = useState<SplitState>(loadSplitState);
  const cycleSplit = () =>
    setSplitState((s) => {
      const next: SplitState = { ...s, ratio: cycleRatio(s.ratio) };
      saveSplitState(next);
      return next;
    });
  // M6 WP3 Phase 2 — collapse a half (◀ CC / ED ▶). The collapsed half gets
  // display:none (below), which makes XtermPane's existing offsetParent===null
  // fit-guard skip fitting to 0 — no crash, PTY stays alive. Toggling the same
  // half restores to the last ratio (toggleCollapse preserves `ratio`).
  const toggleSplitCollapse = (half: "left" | "right") =>
    setSplitState((s) => {
      const next = toggleCollapse(s, half);
      saveSplitState(next);
      return next;
    });
  const leftCollapsed = splitState.collapsed === "left";
  const rightCollapsed = splitState.collapsed === "right";

  // M6 WP3 Phase 2 — nudge a terminal re-fit when the CC half un-collapses
  // (display:none → shown). The ResizeObserver on the xterm host usually catches the
  // box going 0 → real, but a display flip is not guaranteed to fire it under
  // WKWebView, so we explicitly refit on the leftCollapsed false-edge. rAF-deferred
  // so the layout settles first (same pattern as the visible-edge focus above);
  // fitAndResize's offsetParent guard makes it a no-op if still hidden.
  useEffect(() => {
    if (leftCollapsed) return;
    const raf = requestAnimationFrame(() => ccPaneRef.current?.refit());
    return () => cancelAnimationFrame(raf);
  }, [leftCollapsed]);

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
        // M6 WP3 — the split ratio drives grid-template-columns (overrides the
        // App.css 1fr/1fr default). Applied in BOTH branches so a backgrounded
        // workspace lays out at the same track as it will when promoted (keeps
        // FitAddon sizing the background terminal correctly).
        visible
          ? {
              display: "grid",
              gridTemplateColumns: gridColumnsFor(splitState),
            }
          : {
              display: "grid",
              gridTemplateColumns: gridColumnsFor(splitState),
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
        {/* M6 WP3 — the split-ratio control. Two collapse toggles (◀ CC / ED ▶)
            flank a cycle button whose label is the current ratio (3:1 / 2:2 / 1:3).
            Collapse + cycle are orthogonal: the cycle steps the three ratios; the
            toggles fully hide a half (and restore to the last ratio on re-click).
            At most one half collapsed at a time (toggleCollapse mutual exclusion). */}
        <div className="workspace-split-control" data-testid="workspace-split-control">
          <button
            type="button"
            className={`split-collapse-btn${leftCollapsed ? " is-active" : ""}`}
            data-testid="split-collapse-cc"
            aria-label={leftCollapsed ? "Show CC terminal" : "Collapse CC terminal"}
            aria-pressed={leftCollapsed}
            title={leftCollapsed ? "Show CC terminal" : "Collapse CC (show editor only)"}
            onClick={() => toggleSplitCollapse("left")}
          >
            ◀ CC
          </button>
          <button
            type="button"
            className="split-cycle-btn"
            data-testid="split-cycle-btn"
            aria-label={`Split ratio ${splitState.ratio} — click to cycle`}
            title="Cycle split ratio (CC ↔ editor)"
            disabled={splitState.collapsed !== "none"}
            onClick={cycleSplit}
          >
            {splitState.ratio}
          </button>
          <button
            type="button"
            className={`split-collapse-btn${rightCollapsed ? " is-active" : ""}`}
            data-testid="split-collapse-ed"
            aria-label={rightCollapsed ? "Show editor panel" : "Collapse editor panel"}
            aria-pressed={rightCollapsed}
            title={rightCollapsed ? "Show editor panel" : "Collapse editor (show CC only)"}
            onClick={() => toggleSplitCollapse("right")}
          >
            ED ▶
          </button>
        </div>
        <WorkspaceStatusIndicator state={statusState} snippet={statusSnippet} />
      </div>
      {/* M6 WP3 — the ◀ CC collapse hides the left half via display:none. That makes
          XtermPane's fitAndResize see host.offsetParent === null and SKIP fit()
          (no fit-to-0 crash); the PTY session stays alive. On restore, the
          ResizeObserver re-fires and fits to the recovered width. */}
      <div
        className="workspace-left"
        style={leftCollapsed ? { display: "none" } : undefined}
      >
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
        collapsed={rightCollapsed}
        registerDirtyProbe={registerDirtyProbe}
      />
    </div>
  );
}
