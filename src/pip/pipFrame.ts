// M5 WP3 — the PiP frame wire contract + pure derivation.
//
// The PiP NSPanel is a SEPARATE webview with its own JS heap: it cannot read the
// main app's React `workspaces`/`order` state or its module-level `terminalMirror`
// registry. So the main webview FORWARDS the roster to the PiP over a Tauri event
// (`pip-frame`), and the PiP renders from that. This module is the pure (no React /
// no Tauri IPC) core — the DTO + the main→PiP derivation + the PiP-side fold — so
// the contract is vitest-pinnable independent of the runtime wiring (repo posture:
// pure logic → vitest, listen/emit → verify-self).
//
// FAN-OUT (the WBS "share the serialize output rather than a second loop" mandate):
//   - STATUS already broadcasts to ALL webviews via the backend `app.emit(
//     "workspace-status", …)` (M3) — the PiP `listen`s the same channel, no new
//     source, no PTY scraping.
//   - ROSTER (names + order) lives in the MAIN webview only. App.tsx emits a
//     `pip-frame` to the `pip` window (`emitTo("pip", PIP_FRAME_EVENT, frame)`)
//     whenever the roster/order changes, plus once in reply to the PiP's mount-time
//     `pip-ready` ping (the initial-state handshake — a freshly-shown panel can't
//     have caught prior broadcasts).
//   - MIRROR HTML (Phase 3) extends `PipFrameTile` with `mirror_html`, fed from the
//     SAME serialize output the filmstrip ticker already produces — NOT a second loop.
//
// ROSTER DIVERGENCE (intentional — do NOT "fix" to match the filmstrip): the PiP
// mirrors ALL N workspaces INCLUDING the center-staged one. The filmstrip makes the
// center-staged tile a static active marker because it's redundant with the visible
// center stage; the PiP is the surface you watch when Claudesk is OUT of focus, so
// the center-staged project is just-as-invisible there and its live state matters.

/** One PiP tile's roster data. The live mirror HTML rides a SEPARATE event
 *  (`pip-mirror`, ~1 fps) so the low-frequency roster and the high-frequency mirror
 *  don't share an emit; the PiP merges them at render (mirror keyed by `id`). */
export interface PipFrameTile {
  /** Workspace id — the key the `workspace-status` + mirror maps are also keyed by. */
  id: string;
  /** Project display name (already derived in the main app's WorkspaceList). */
  display_name: string;
}

/**
 * The `pip-frame` event payload — the full ordered roster the PiP renders. snake_case
 * tile fields mirror the rest of the IPC-DTO convention (see workspaceStatus.ts), even
 * though this event is webview→webview rather than backend→webview, so the two surfaces
 * read identically.
 */
export interface PipFrame {
  tiles: PipFrameTile[];
}

/** The webview→webview event name carrying the roster to the PiP. */
export const PIP_FRAME_EVENT = "pip-frame";

/**
 * The webview→webview event carrying the live ~1 fps serialize mirror to the PiP —
 * payload is a `PipMirrorFrame` (id → serialized terminal HTML). Separate from
 * `pip-frame` so the high-frequency mirror doesn't churn the roster. Only emitted
 * while the PiP is shown (the cost gate — a hidden PiP pays nothing).
 */
export const PIP_MIRROR_EVENT = "pip-mirror";

/** The PiP→main ping fired on PiP mount so main replies with the current frame. */
export const PIP_READY_EVENT = "pip-ready";

/** The PiP NSPanel window label (mirrors `pip::commands::PANEL_LABEL` in Rust). */
export const PIP_WINDOW_LABEL = "pip";

/** `pip-mirror` payload — workspace id → its latest `serializeAsHTML()` snapshot. */
export type PipMirrorFrame = Record<string, string>;

/**
 * Build the PiP frame from the main app's ordered roster. The input is the SAME
 * ordered list the filmstrip derives (so PiP order == filmstrip order), but UNLIKE
 * the filmstrip, NO tile is dropped or marked static — the center-staged workspace is
 * a full roster member (the intentional divergence). `active`/`focusedId` is therefore
 * deliberately NOT a parameter here: the PiP does not distinguish a center-staged tile.
 *
 * @param ordered  the ordered roster (id + display_name), e.g. App's `tiles` mapped
 *                 down to {id, display_name}, in filmstrip/persisted order.
 */
export function derivePipFrame(
  ordered: readonly { id: string; display_name: string }[],
): PipFrame {
  return {
    tiles: ordered.map((w) => ({ id: w.id, display_name: w.display_name })),
  };
}

/**
 * The empty frame the PiP renders before any `pip-frame` arrives (honest "no roster
 * yet" — never a fabricated tile). Mirrors the `emptyStatusMap` posture in
 * workspaceStatus.ts.
 */
export const emptyPipFrame: PipFrame = { tiles: [] };
