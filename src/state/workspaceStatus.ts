// M3 WP6 — Frontend mirror of the backend `workspace-status` channel.
//
// This module holds NO React and NO Tauri IPC — only the wire DTO type and the
// pure mapping/reducer logic the indicator renders from. Keeping it pure makes it
// unit-testable under vitest without a Tauri runtime (the WP5/WP7 frontend posture:
// pure logic is unit-tested, the `listen`/`invoke` wiring is verify-self/human).
//
// THE WIRE CONTRACT (fixed by WP4 — `status_broadcaster::WorkspaceStatusUpdate`):
// snake_case end-to-end, NO camelCase / kebab drift. The field names + the `state`
// literals below mirror the Rust serde shape VERBATIM, pinned on the backend by
// `dto_serde_shape_is_snake_case`. This is the M2 IPC-DTO lesson, now an arch.md
// convention. Do NOT rename these to camelCase or kebab — the boundary is the
// backend's shape; presentation (label/dot) is derived separately below.

/**
 * The CC lifecycle state as the backend emits it. snake_case `awaiting_input`
 * mirrors `WorkspaceState`'s serde rendering verbatim (NOT the kebab
 * `awaiting-input` of the legacy `WorkspaceStatus` model type — different type,
 * different layer; see `state/workspace.ts`).
 */
export type WireWorkspaceState =
  | "idle"
  | "running"
  | "awaiting_input"
  | "unknown";

/**
 * The payload of the `workspace-status` Tauri event — mirrors
 * `status_broadcaster::WorkspaceStatusUpdate` field-for-field, snake_case.
 * Optional fields are omitted on the wire when absent (backend
 * `skip_serializing_if = Option::is_none`), so they are `?` here.
 */
export interface WorkspaceStatusUpdate {
  workspace_id: string;
  state: WireWorkspaceState;
  /** Hook-side send time (epoch ms), if the event carried one. */
  last_event_at?: number;
  /** The event's prompt/message text, if present (telemetry for the surface). */
  last_output_snippet?: string;
}

/** The Tauri event name — mirrors `status_broadcaster::commands::STATUS_EVENT`. */
export const WORKSPACE_STATUS_EVENT = "workspace-status";

/**
 * Presentation for a wire state: the human label + the dark-palette dot class.
 * The dot classes resolve to colors in App.css (dark-only — no light tokens).
 */
export interface StatusPresentation {
  label: string;
  dotClass: string;
}

/**
 * Pure map: wire state → indicator presentation. `unknown` is the honest
 * no-data default a surface shows before any hook event arrives (arch.md
 * failure mode) — never a guessed live state.
 */
export function statusPresentation(
  state: WireWorkspaceState,
): StatusPresentation {
  switch (state) {
    case "running":
      return { label: "Running", dotClass: "status-dot-running" };
    case "idle":
      return { label: "Idle", dotClass: "status-dot-idle" };
    case "awaiting_input":
      return { label: "Awaiting input", dotClass: "status-dot-awaiting" };
    case "unknown":
    default:
      // Default arm also covers any future wire state we don't yet render —
      // honest Unknown rather than a thrown error (a surface must never crash
      // on an unrecognized status).
      return { label: "Unknown", dotClass: "status-dot-unknown" };
  }
}

/**
 * The live status map: `workspace_id` → its latest wire state. A workspace not
 * present in the map has never received an event and is treated as `unknown` by
 * the reader (`stateFor` below) — the map only ever holds the last *observed*
 * state, never a fabricated `unknown` entry.
 */
export type WorkspaceStatusMap = Record<string, WireWorkspaceState>;

export const emptyStatusMap: WorkspaceStatusMap = {};

/**
 * Pure reducer: fold an incoming `workspace-status` update into the map. Keys by
 * the wire's `workspace_id` verbatim (no renaming). Returns a new map (immutable
 * update) so React state setters see a fresh reference.
 */
export function applyStatusUpdate(
  map: WorkspaceStatusMap,
  update: WorkspaceStatusUpdate,
): WorkspaceStatusMap {
  return { ...map, [update.workspace_id]: update.state };
}

/**
 * The state to render for a workspace id: its last observed state, or `unknown`
 * if no event has been observed for it yet. This is where the honest default
 * lives — absence in the map is `unknown`, not an error.
 */
export function stateFor(
  map: WorkspaceStatusMap,
  workspaceId: string,
): WireWorkspaceState {
  return map[workspaceId] ?? "unknown";
}
