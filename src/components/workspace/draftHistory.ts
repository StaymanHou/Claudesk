// F-a WP2 Phase 3 — the per-project ring of recently-sent drafts.
//
// ═══════════════════════════════════════════════════════════════════════════════
// The recovery net for the third failure mode F-a exists to address: a draft that was
// SENT and is now gone from the staging area. The draft store (`draftStore.ts`) covers the
// unsent buffer; this covers the moment after a send, when the text has left Claudesk's
// surface and only the terminal holds it.
//
// Storage posture is `draftStore.ts`'s — read that header for the rationale rather than a
// restatement here.
//
// ⚠️ TWO DELIBERATE DIVERGENCES FROM IT, both of which look like inconsistencies and are not:
//
//   1. **JSON, not a raw string** (a ring is a list). So "corrupt stored value" is a REAL
//      failure mode here and vacuous in `draftStore` — which is why the tolerance tests differ.
//   2. ⚠️ **The whitespace rule INVERTS.** `saveDraft` preserves a whitespace-only draft;
//      `appendToHistory` refuses one. The store is a buffer that must hold exactly what was
//      typed; the ring is BOUNDED, so a junk entry evicts a real one. (Canonical statement of
//      this reason — other sites point here.)

import { canonicalizeProjectPath } from "../../state/workspace";
import { safeStorage } from "./fontZoomCore";

/** Key prefix for a project's sent-draft history. Canonicalized path is appended.
 *
 * ⚠️ Says `staging` while the panel says `Prompt` — deliberate, for the reason given at
 * `draftStore.ts`'s `DRAFT_KEY_PREFIX`: a persisted wire format is not renamed to chase a
 * UI label. */
export const HISTORY_KEY_PREFIX = "claudesk.staging.history:";

/**
 * How many sent drafts are retained per project.
 *
 * ⚠️ Exported as a named constant so the test asserts against the SAME value the module
 * uses — a test hardcoding `10` would silently stop testing the boundary if the cap moved.
 */
export const HISTORY_CAP = 10;

function historyKey(projectPath: string): string {
  return `${HISTORY_KEY_PREFIX}${canonicalizeProjectPath(projectPath)}`;
}

/**
 * Read a project's sent-draft history, newest first.
 *
 * Returns `[]` when there is none, the stored value is corrupt or the wrong shape, or
 * storage is unavailable — never throws.
 *
 * ⚠️ Every element is validated as a string, not just the array itself. A stored
 * `["ok", 42, null]` must not hand a non-string to a text surface, and `JSON.parse`
 * happily produces exactly that.
 */
export function loadHistory(projectPath: string): string[] {
  try {
    const storage = safeStorage();
    if (!storage) return [];
    const raw = storage.getItem(historyKey(projectPath));
    if (raw == null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e): e is string => typeof e === "string")
      .slice(0, HISTORY_CAP);
  } catch {
    // Corrupt JSON, or storage that throws on read. A lost history is acceptable; an
    // exception thrown into a React render is not.
    return [];
  }
}

/**
 * Append a just-sent draft to the front of a project's ring, evicting the oldest beyond
 * [`HISTORY_CAP`]. Returns the new ring so a caller can use it without a re-read.
 *
 * ⚠️ **A blank entry is REFUSED** (empty or whitespace-only) — see the module header for why
 * this inverts `saveDraft`'s preserve-whitespace rule.
 *
 * ⚠️ **EVERY non-append path returns the RING AS IT STANDS, never a bare `[]`.** The caller
 * contract is "the current ring", not "the ring if the write worked". A quota failure leaves
 * storage INTACT — the `setItem` threw, the data is still there — so returning `[]` would make
 * `setRing(appendToHistory(p, t))` blank a populated UI ring against live data.
 *
 * ⚠️ **Consecutive exact duplicates are NOT collapsed** (P3.2). ⚠️ Do not "optimize" this —
 * the reasoning, and the one condition that would reopen it, are at the duplicates test in
 * `draftHistory.test.ts`.
 */
export function appendToHistory(projectPath: string, entry: string): string[] {
  try {
    if (entry.trim() === "") return loadHistory(projectPath);
    const storage = safeStorage();
    if (!storage) return loadHistory(projectPath);
    const next = [entry, ...loadHistory(projectPath)].slice(0, HISTORY_CAP);
    storage.setItem(historyKey(projectPath), JSON.stringify(next));
    return next;
  } catch {
    // Quota exhausted or storage unavailable. The send itself already succeeded — failing to
    // record it must not surface as an error, and must not blank the caller's ring either:
    // storage is untouched by a throwing `setItem`, so the pre-append ring is still the truth.
    // `loadHistory` never throws, so this cannot re-enter the catch.
    return loadHistory(projectPath);
  }
}

/** Drop a project's history. Never throws. */
export function clearHistory(projectPath: string): void {
  try {
    safeStorage()?.removeItem(historyKey(projectPath));
  } catch {
    /* storage unavailable — nothing to clear */
  }
}
