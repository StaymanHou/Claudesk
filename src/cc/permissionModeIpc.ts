// M10.9 WP2 Phase 4 — typed IPC wrappers for the CC permission mode.
//
// Deliberately SEPARATE from `permissionMode.ts`, which is the pure (no React / no Tauri
// IPC) core holding the vocabulary, labels, and coercion so they stay vitest-pinnable
// without a running app. Adding `invoke` there would break that contract — so the wire
// calls live here, mirroring `updater/updaterPrefs.ts` and `state/workflowGate.ts`.
//
// Extracted during the Settings-panel migration: the picker previously inlined these two
// `invoke` calls, which meant the panel would have had to re-inline them (a second,
// drifting call site). One typed pair, one source of truth.

import { invoke } from "@tauri-apps/api/core";
import type { CcPermissionMode } from "./permissionMode";

/** Read the persisted CC permission mode. Coerce the result before use — a stale or
 *  corrupt persisted value should fall back to the default, not select an impossible
 *  option (`coerceCcPermissionMode` in the pure module). */
export async function getCcPermissionMode(): Promise<CcPermissionMode> {
  return invoke<CcPermissionMode>("cc_get_permission_mode");
}

/** Persist the CC permission mode. The backend re-broadcasts `cc-permission-mode`, which
 *  re-syncs every surface reflecting it (the Settings control AND the native View-menu
 *  radio). Takes effect on the NEXT `cc_spawn` — argv is chosen once per process. */
export async function setCcPermissionMode(
  mode: CcPermissionMode,
): Promise<void> {
  return invoke<void>("cc_set_permission_mode", { mode });
}
