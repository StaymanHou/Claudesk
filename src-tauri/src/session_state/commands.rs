//! M12 WP2 — the Tauri command surface for the unclean-exit flag.
//!
//! One command: [`session_state_mark_clean`]. There is deliberately **no** `mark_unclean`
//! command — setting is owned by the backend spawn path (`SessionRegistry::spawn`), where
//! it is co-located with the `?` that guarantees a failed spawn leaves no flag. Exposing a
//! setter to the frontend would create a second way to set the flag with no such guarantee.
//!
//! Clearing is **opt-in per route** — rationale lives on
//! [`crate::session_state::CleanExitRoute`] (the canonical home), not restated here.

use tauri::{AppHandle, Manager};

use super::CleanExitRoute;

/// Clear the unclean-exit flag for `project_path`, because the session ended via a clean
/// route. Best-effort and idempotent: clearing an already-clean project is a success.
///
/// `route` is the [`CleanExitRoute`] wire name. An **unrecognized route is a no-op**, not
/// a clear — a typo or a stale frontend must never be able to clear a flag by accident.
/// The route is recorded (rather than being a bare bool) so the reason a flag was cleared
/// is legible at the call site and in tests, and so M13's Recycle path is a named,
/// pinned member of the set rather than an ad-hoc fourth caller.
///
/// Returns `true` when the clear was applied (or the project was already clean), `false`
/// when the route was unrecognized or no app-data dir could be resolved. Deliberately not
/// a `Result`: a clearing failure must not surface as an error dialog on a close the user
/// already committed to — the cost is one spurious `/resume` offer on next open.
#[tauri::command]
pub fn session_state_mark_clean(app: AppHandle, project_path: String, route: String) -> bool {
    // Parse-to-validate: every clean route clears identically, so the parsed value is not
    // branched on — but an unrecognized route must refuse, failing toward keeping the flag
    // (a spurious /resume offer) rather than dropping it (silently disabling auto-resume).
    if CleanExitRoute::from_wire(&route).is_none() {
        return false;
    }
    let Ok(dir) = app.path().app_data_dir() else {
        return false;
    };
    super::clear_and_persist(&dir, &project_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    // The command itself needs an `AppHandle`, which is not constructible in a unit test;
    // its logic is two guards plus a delegation to `clear_and_persist` (covered directly
    // in the parent module). What IS unit-testable — and what actually carries risk — is
    // the route-parsing guard, since that is the thing standing between a stale/typo'd
    // frontend string and an unintended clear.

    #[test]
    fn every_known_route_parses_back_from_its_wire_name() {
        for route in CleanExitRoute::ALL {
            assert_eq!(
                CleanExitRoute::from_wire(route.as_wire()),
                Some(route),
                "{route:?} must round-trip through its wire name — a mismatch means the \
                 frontend's string silently stops clearing"
            );
        }
    }

    #[test]
    fn an_unknown_route_does_not_parse_so_the_command_refuses_to_clear() {
        for bogus in [
            "",
            "unclean-exit",    // the button's *intent*, deliberately NOT a clean route
            "workspace_close", // snake_case instead of kebab — a plausible typo
            "WorkspaceClose",  // the Rust variant name leaking onto the wire
            "recycle",         // truncated
            "app-quit ",       // trailing space
        ] {
            assert_eq!(
                CleanExitRoute::from_wire(bogus),
                None,
                "{bogus:?} must NOT parse as a clean route — an unrecognized string \
                 clearing a flag would silently disable auto-resume"
            );
        }
    }

    #[test]
    fn the_unclean_exit_button_has_no_route_by_construction() {
        // The button's whole purpose is to close WITHOUT clearing. There must be no wire
        // name it could send that clears — this asserts the absence, which is the property
        // that makes the button correct by construction rather than by remembering to
        // skip a call.
        let names: Vec<&str> = CleanExitRoute::ALL.iter().map(|r| r.as_wire()).collect();
        assert!(
            !names.iter().any(|n| n.contains("unclean")),
            "no clean-exit route may be named for the unclean button; routes: {names:?}"
        );
    }
}
