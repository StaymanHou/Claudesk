// M12 WP2 — the clean-exit clearing seam.
//
// The unclean-exit flag is DEFAULT-SET on workspace open (backend, in
// `SessionRegistry::spawn`) and cleared ONLY by a clean exit. This module owns the
// frontend half of the clearing contract.
//
// ## Why clearing is OPT-IN per route (the load-bearing decision)
// The obvious implementation — clear whenever a PTY session ends — is wrong. At the PTY
// layer every teardown looks identical: `cc-exit-<sid>` fires for a user-typed `/exit`,
// the filmstrip ×, an app quit, AND the unclean-exit button, because `CcSession::kill`
// reaps the leader so the reader thread hits EOF. Worse, `XtermPane`'s unmount cleanup
// (the only place holding a session id) also runs on every **StrictMode remount** in dev,
// so clearing there would clear the flag on a remount that is not an exit at all.
//
// So clearing is an explicit act on the routes that are genuinely clean. The unclean-exit
// button clears nothing *by not calling* — it cannot forget to opt out, because there is
// nothing to opt out of.
//
// ## One funnel, by construction
// `closeWorkspace` has two call sites (the immediate close and the post-confirm close).
// Routing both through `closeWorkspaceCleanly` means a future third call site inherits the
// clearing automatically. This follows the M11 WP4 lesson recorded in CLAUDE.md: when a
// shared piece of state has several writers, funnel every write through ONE function and
// guard that function — a caller-side contract that each site must remember is exactly the
// shape that shipped a CRITICAL there.

import { invoke } from "@tauri-apps/api/core";

/**
 * The clean-exit routes. Mirrors the Rust `CleanExitRoute` wire vocabulary.
 *
 * ⚠️ A typed `/exit` in the CC pane is deliberately NOT a member — see the rationale on
 * the Rust enum (`session_state/mod.rs`). Short version: `/exit` leaves the workspace
 * OPEN with a "Session ended" overlay, so there is no close for a clear to hang off, and
 * whether that counts as clean is an open product question
 * (`SURFACE-2026-08-03-TYPED-EXIT-LEAVES-THE-UNCLEAN-FLAG-SET`). It was a member until
 * review found it dead — declared everywhere, called nowhere.
 */
export type CleanExitRoute = "workspace-close" | "app-quit" | "recycle-session";

/**
 * Which teardown a resolved close-confirm should run.
 *
 * Extracted as a pure function because the risk here is not arithmetic, it is a
 * *dropped intent*: the × and the ⏸ share one confirm dialog (a busy or dirty workspace
 * shows the same gate for both), so the resolve has to remember which control opened it.
 * Getting that wrong is silent and asymmetric — a ⏸ resolving as a clean close clears the
 * very flag the button exists to preserve, and nothing in the UI would show it.
 *
 * Pure + imported by the test rather than re-implemented in it, per the standing
 * `extract-for-import-when-a-raw-guard-cant-express-the-property` method.
 *
 * @param choice  what the user picked in the confirm
 * @param pending the close that was requested, or null if none is pending
 */
export function resolveCloseIntent(
  choice: "close" | "cancel",
  pending: { id: string; unclean: boolean } | null,
): { action: "close-clean" | "close-unclean" | "none"; id?: string } {
  if (choice !== "close" || !pending) return { action: "none" };
  return {
    action: pending.unclean ? "close-unclean" : "close-clean",
    id: pending.id,
  };
}

/**
 * Clear the unclean-exit flag for `projectPath` because the session ended cleanly via
 * `route`.
 *
 * Best-effort and never throwing: a clearing failure must not block a close the user
 * already committed to. The cost of a miss is one spurious `/resume` offer on next open —
 * deliberately the safe direction (the inverse, clearing when we should not have, would
 * silently disable auto-resume).
 */
export function markSessionClean(
  projectPath: string,
  route: CleanExitRoute,
): void {
  void invoke("session_state_mark_clean", { projectPath, route }).catch(
    (err) => {
      // Surfaced, never silently swallowed (the WP6 IPC-error lesson); does not block.
      console.error(
        `session_state_mark_clean failed for ${projectPath} (${route}):`,
        err,
      );
    },
  );
}
