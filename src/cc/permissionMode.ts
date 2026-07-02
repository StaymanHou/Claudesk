// CC permission mode (the friend-requested dropdown, replacing the yolo on/off checkbox).
//
// A new CC session spawns under one of Claude Code's `--permission-mode` values (the full
// choice set from `claude --help`). The mode is app-global, persisted by the Rust settings
// store, and chosen once per CC process — so a change takes effect on the NEXT spawn.
//
// This module is the pure (no React / no Tauri IPC) core so the mode vocabulary + labels +
// coercion are vitest-pinnable independent of the wiring. The Rust side mirrors these EXACT
// strings via serde (`cc_session::CcPermissionMode`) — and they are also the literal tokens
// CC's `--permission-mode` flag accepts — so the value is identical end-to-end (TS union ↔
// persisted JSON ↔ CLI). Same discipline as `pip/pipLayout.ts`.

/**
 * The six CC permission modes. The string values are the wire contract: byte-identical to
 * the Rust `CcPermissionMode` serde rendering (the `cc_get_permission_mode` /
 * `cc_set_permission_mode` IPC + the `cc-permission-mode` event payload) AND to the tokens
 * CC's `--permission-mode` flag accepts.
 */
export type CcPermissionMode =
  | "default"
  | "plan"
  | "acceptEdits"
  | "auto"
  | "dontAsk"
  | "bypassPermissions";

/** The default mode on first run (before any persisted choice) — CC's normal prompts. */
export const DEFAULT_CC_PERMISSION_MODE: CcPermissionMode = "default";

/** The event (all webviews) carrying the active mode — mirrors Rust `CC_PERMISSION_MODE_EVENT`. */
export const CC_PERMISSION_MODE_EVENT = "cc-permission-mode";

/**
 * The modes in display order (coarse → permissive), each with the human label shown in the
 * picker dropdown. Single source of truth for the `<option>` list; the native View-menu
 * radio (Rust `CC_PERMISSION_MODE_ITEMS`) mirrors the same order + labels.
 */
export const CC_PERMISSION_MODE_OPTIONS: readonly {
  value: CcPermissionMode;
  label: string;
}[] = [
  { value: "default", label: "Default (ask each time)" },
  { value: "plan", label: "Plan" },
  { value: "acceptEdits", label: "Accept Edits" },
  { value: "auto", label: "Auto" },
  { value: "dontAsk", label: "Don't Ask" },
  { value: "bypassPermissions", label: "Bypass Permissions (yolo)" },
];

/** Every valid mode value, derived from the option list (kept in one place). */
export const CC_PERMISSION_MODES: readonly CcPermissionMode[] =
  CC_PERMISSION_MODE_OPTIONS.map((o) => o.value);

/**
 * Normalize an arbitrary persisted/wire value to a known mode, defaulting on any
 * unrecognized value. Used when reading `cc_get_permission_mode` / a `cc-permission-mode`
 * payload so a stale or corrupt value never leaves the dropdown in an impossible state
 * (honest fall-back to the default).
 */
export function coerceCcPermissionMode(value: unknown): CcPermissionMode {
  return CC_PERMISSION_MODES.includes(value as CcPermissionMode)
    ? (value as CcPermissionMode)
    : DEFAULT_CC_PERMISSION_MODE;
}
