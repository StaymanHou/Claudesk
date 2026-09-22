// F-a WP2 Phase 2 — per-project persistence for the staging area's in-progress draft.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ WHY `localStorage` AND NOT `projects.json` (F-a decision 1, settled at the grill).
//
// `projects.json` is read at startup through serde. A draft is unbounded operator prose —
// a long dictated passage, possibly tens of kilobytes — and a single malformed or oversized
// value there risks failing the whole deserialize and taking the ENTIRE PROJECT LIST down.
// The blast radius is the thing being avoided, not the disk cost. `localStorage` is
// frontend-only, tolerates a corrupt value per key, and is the established home for
// per-surface UI state in this app (`filmstripOrder.ts`, `terminalFontZoom.ts`).
//
// ⚠️ KEYED BY CANONICALIZED `project_path`, NOT BY WORKSPACE ID. `nextWorkspaceId()` mints
// an in-memory `ws-${++counter}` that RESETS EVERY LAUNCH, so a workspace-id key would lose
// the draft on exactly the restart this feature exists to survive. `openWorkspace` dedups on
// the canonical path, so workspace↔project is bijective and the path is the durable identity.
//
// ⚠️ ONE KEY PER PROJECT, not one map under a single key (P2.2). Two reasons: a single map
// is a read-modify-write across every open workspace, so two workspaces saving concurrently
// can clobber each other's draft; and one corrupt value would take out every project's draft
// at once instead of one. Per-key costs nothing and bounds the blast radius.
//
// ⚠️ NEVER THROWS, in either direction. `loadDraft` returns "" and `saveDraft` is a silent
// no-op when storage is unavailable (private mode, disabled storage, quota exhausted) or the
// stored value is corrupt. A draft that fails to persist is a bad day; an exception thrown
// into a React render is a blank app.

import { canonicalizeProjectPath } from "../../state/workspace";
import { safeStorage } from "./fontZoomCore";

/**
 * Key prefix for a project's staged draft. The canonicalized project path is appended.
 *
 * ⚠️ Namespaced under `claudesk.` like every other key in this app
 * (`claudesk.filmstripOrder`, `claudesk.terminal.fontSize`) — localStorage is a flat
 * per-origin namespace shared with anything else running in the webview.
 *
 * ⚠️ SAYS `staging`, THE PANEL SAYS `Prompt` — DELIBERATE, NOT DRIFT. The panel was
 * renamed at WP3 verify-human (2026-09-22) because "Staging" reads as git's staging area
 * beside a Diff tab. The STORAGE KEY was deliberately left alone: it is a persisted wire
 * format, and renaming it would orphan every draft already on disk for a purely cosmetic
 * gain. A migration would be the only honest alternative, and it is not worth writing for
 * a prefix no user ever sees. Do not "fix" this to match the UI label.
 */
export const DRAFT_KEY_PREFIX = "claudesk.staging.draft:";

/** The storage key for one project's draft. Canonicalization is applied HERE, so read and
 *  write cannot disagree — `/a/b` and `/a/b/` must resolve to the same draft. */
function draftKey(projectPath: string): string {
  return `${DRAFT_KEY_PREFIX}${canonicalizeProjectPath(projectPath)}`;
}

/**
 * Read a project's persisted draft. Returns `""` when there is none, the value is
 * unusable, or storage is unavailable — never throws.
 *
 * `""` is the correct "no draft" value rather than `null`: the consumer is a text buffer
 * whose empty state IS the empty string, so a nullable return would push a `?? ""` into
 * every call site.
 */
export function loadDraft(projectPath: string): string {
  try {
    const storage = safeStorage();
    if (!storage) return "";
    const raw = storage.getItem(draftKey(projectPath));
    // ⚠️ A draft is stored as a RAW STRING, not JSON. Operator prose round-trips exactly,
    // and there is no parse step to fail on a stray quote or brace. The `typeof` guard
    // still matters: a non-string can come back from a shimmed or corrupted storage.
    return typeof raw === "string" ? raw : "";
  } catch {
    return "";
  }
}

/**
 * Persist a project's draft. Best-effort — swallows quota/unavailable errors.
 *
 * ⚠️ An EMPTY draft is stored as a deletion, not as an empty value. Leaving a stale key
 * behind for every project the operator ever typed one character into is unbounded litter
 * in a shared namespace, and `loadDraft` cannot distinguish the two anyway.
 */
export function saveDraft(projectPath: string, draft: string): void {
  try {
    const storage = safeStorage();
    if (!storage) return;
    if (draft === "") {
      storage.removeItem(draftKey(projectPath));
      return;
    }
    storage.setItem(draftKey(projectPath), draft);
  } catch {
    /* storage unavailable / quota exhausted — a non-persisted draft is acceptable */
  }
}

/** Drop a project's draft. Called on send, once the text has been handed to the PTY and
 *  appended to the history ring. Never throws. */
export function clearDraft(projectPath: string): void {
  try {
    safeStorage()?.removeItem(draftKey(projectPath));
  } catch {
    /* storage unavailable — nothing to clear */
  }
}
