//! M12 WP2 — the unclean-exit flag store (`session-state.json`).
//!
//! One boolean per project path answering: *did the last session for this project end
//! without a clean exit?* M12's auto-resume reads it to decide whether to fire
//! `/resume` on the next open. The flag is **default-SET on workspace open** and cleared
//! **only** by a clean exit, so a power loss — which runs no code at all — leaves it set
//! for free. A crash and a clean shutdown are therefore distinguishable without asking
//! the crash to cooperate.
//!
//! ## Category: machine-local session state, NOT a user preference
//! This is the reason it lives here and not in `settings.json` (WP1 Verdict (a)). The
//! user never sets, reads, or reasons about this value; it must **never** appear in a
//! settings surface. `settings.json` is deliberately consolidated behind the `⌘,`
//! Settings panel (M10.9 WP2) and holds preferences. `default_model` is the **shape**
//! precedent for "one value per project" — never the **category** precedent.
//!
//! ## Why its own file (and not a field on `Project`)
//! Candidate 1 — a field on `Project` in `projects.json` — was disqualified by a
//! **lost-update hazard**, not by byte cost. Every `projects.json` write is a whole-file
//! read-modify-write (`config_store::write_projects`), and set-on-open is **co-triggered
//! by the same click** as `add_or_touch`'s recency stamp, so whichever `rename`s last
//! silently discards the other's field. Losing the flag **silently disables auto-resume**.
//! Pinned by `config_store`'s `interleaved_whole_file_writes_lose_the_earlier_writers_edit`.
//!
//! **Reopening condition** (recorded so a future reader need not re-litigate): candidate 1
//! becomes viable only if `projects.json` writes stop being whole-file RMW — e.g. a
//! per-record write path or an in-process lock serializing all writers. Absent that, the
//! co-trigger is unconditional. See
//! `SURFACE-2026-08-03-PROJECTS-JSON-WRITERS-ARE-WHOLE-FILE-RMW`.
//!
//! ## Precedent
//! `status_log` already owns a small machine-local file in the same per-identity
//! `app_data_dir()`. This is the **third instance of an established pattern**, not a new
//! one — and dev/prod isolation (`com.claudesk.app/` vs `com.claudesk.app.dev/`) comes
//! free, which is required: dogfooding Claudesk with Claudesk runs both identities
//! concurrently and they must not share a flag.
//!
//! ## ABSENT MEANS CLEAN (the load-bearing invariant)
//! Clearing **removes the key** rather than writing `false`, and a missing file is the
//! correct cold-start state — not an error. Every degraded read (missing / unreadable /
//! corrupt) yields "clean" for every path, so the failure direction is **no auto-fire**,
//! which is the safe one: a spurious `/resume` acts on the user's session without being
//! asked, whereas a missed one costs a click. [`is_unclean`] is the only reader and it
//! returns a bare `bool` precisely so no caller can accidentally treat a read failure as
//! "unclean".
//!
//! ## Why every item below carries its own `#[allow(dead_code)]` (WP2 Phase 1 only)
//! Phase 1 builds the store; Phase 2 wires the callers (spawn, the clean-exit routes) and
//! WP3 wires [`consume`]. Until then nothing in production calls into this module, and
//! `-D warnings` fails the build.
//!
//! These are **targeted per-item allows, each naming the consumer that retires it** — NOT
//! a module-wide `#![allow(dead_code)]`. That distinction is a lesson this codebase already
//! paid for: `workflow_install` carried a blanket allow with an expiry note ("remove when
//! Phase 4 lands"), Phase 4 landed, **nothing tracked it**, and it masked a test-only helper
//! sitting in production code until code review caught it (see
//! `workflow_install/mod.rs:48` — "Do not re-add it"). `reclassify` reached the same verdict
//! independently. One allow per item means each expires visibly and separately, and a
//! genuinely orphaned function can still be seen among them.
//!
//! **Retirement is mechanical:** when Phase 2/WP3 wires a consumer, delete that item's
//! attribute. If any attribute still survives at WP2 close, that item has no caller and the
//! honest question is whether it should exist at all.

pub mod commands;

use std::collections::BTreeMap;
use std::path::Path;

/// Basename of the session-state file within the per-identity app-data directory.
/// Consumer: Phase 2 (the live-file assertions in verify-self) + [`read`]/[`write`].
#[allow(dead_code)]
pub const SESSION_STATE_FILE: &str = "session-state.json";
/// Sidecar temp file used for the atomic write-then-rename. Consumer: [`write`].
#[allow(dead_code)]
const SESSION_STATE_TMP_FILE: &str = "session-state.json.tmp";

/// The on-disk map: project path → unclean. A `BTreeMap` (not `HashMap`) so the
/// serialized key order is deterministic — a stable file is easier to diff by hand when
/// debugging a lifecycle question, and it makes the round-trip tests order-independent.
///
/// **Only `true` is ever stored.** [`clear`] removes the key; see the module header.
/// Consumer: Phase 2 (every wiring site) — retire this attribute then.
#[allow(dead_code)]
pub type SessionStateMap = BTreeMap<String, bool>;

/// Read the map. **Every failure mode degrades to an empty map**, never an error:
/// a missing file is the normal cold-start state, and an unreadable or malformed file
/// must not be able to assert "unclean" for anything (fail toward no auto-fire).
///
/// Deliberately infallible. An earlier draft returned `Result` to mirror
/// `read_projects`, but every caller would immediately `.unwrap_or_default()` — and one
/// that forgot could turn a corrupt file into a spurious `/resume`. Making the
/// degradation the *only* behavior removes that call-site decision entirely.
/// Consumer: Phase 2 via [`set_and_persist`]/[`clear_and_persist`]; WP3 reads it directly
/// for the announce batch. Retire the attribute at Phase 2.
#[allow(dead_code)]
pub fn read(data_dir: &Path) -> SessionStateMap {
    let bytes = match std::fs::read(data_dir.join(SESSION_STATE_FILE)) {
        Ok(b) => b,
        Err(_) => return SessionStateMap::new(),
    };
    serde_json::from_slice(&bytes).unwrap_or_default()
}

/// Atomically persist the map: serialize → `session-state.json.tmp` → `rename`. The
/// caller ensures `data_dir` exists (the command wrappers do). Same discipline as
/// `write_projects` / `write_settings`.
///
/// The atomic rename means a crash mid-write leaves the **previous** state intact rather
/// than a truncated file. Combined with absent-means-clean, the only way to lose a flag
/// is to lose the whole file — which fails toward "no auto-fire".
/// Consumer: the persist wrappers below (Phase 2).
#[allow(dead_code)]
pub fn write(data_dir: &Path, map: &SessionStateMap) -> Result<(), std::io::Error> {
    let tmp = data_dir.join(SESSION_STATE_TMP_FILE);
    let json = serde_json::to_vec_pretty(map)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    std::fs::write(&tmp, &json)?;
    std::fs::rename(&tmp, data_dir.join(SESSION_STATE_FILE))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// The pure lifecycle. Three transitions over the map value, extracted so tests drive
// the REAL transitions rather than a replica (`extract-for-import-when-a-raw-guard-
// cant-express-the-property`). The IO wrappers below are thin read → transition →
// write shells; all the behavior worth asserting is here.
// ---------------------------------------------------------------------------

/// Mark `project_path` unclean. Idempotent — setting an already-set flag is a no-op in
/// effect (the value is the same), which matters because a re-open before any clean exit
/// must not be able to *un*-set it.
/// Consumer: Phase 2 task P2.1 (set-on-open, after `SessionRegistry::spawn` succeeds).
#[allow(dead_code)]
pub fn set(map: &mut SessionStateMap, project_path: &str) {
    map.insert(project_path.to_string(), true);
}

/// Mark `project_path` clean by **REMOVING the key** — not by writing `false`.
///
/// This is the invariant the whole store rests on: absent means clean. Writing `false`
/// would work today but would let the file accumulate one dead entry per project ever
/// opened, and would make a future `map.contains_key(p)` read — the natural thing to
/// write — silently wrong. Returns whether a flag was actually removed, so a caller can
/// skip the write when nothing changed.
/// Consumer: Phase 2 tasks P2.2/P2.3 (the clean-exit routes).
#[allow(dead_code)]
pub fn clear(map: &mut SessionStateMap, project_path: &str) -> bool {
    map.remove(project_path).is_some()
}

/// Read-and-clear: returns whether `project_path` was unclean, **and** clears it.
///
/// WP3's auto-fire path uses this — firing consumes the flag, so a `/resume` fires at
/// most once per unclean exit. A second open with no intervening crash gets the "neither"
/// arm, which is correct: the mid-flight work was already resumed.
/// Consumer: **WP3** (the auto-fire path) — this one legitimately outlives Phase 2, so it
/// is the single attribute expected to survive WP2 close. Named here so that is a recorded
/// decision rather than an oversight.
#[allow(dead_code)]
pub fn consume(map: &mut SessionStateMap, project_path: &str) -> bool {
    map.remove(project_path).unwrap_or(false)
}

/// Whether `project_path` is currently marked unclean. A missing key is clean.
/// Consumer: WP3's `predictAction` input + Phase 2 assertions.
#[allow(dead_code)]
pub fn is_unclean(map: &SessionStateMap, project_path: &str) -> bool {
    map.get(project_path).copied().unwrap_or(false)
}

// ---------------------------------------------------------------------------
// IO wrappers — read → transition → write. Best-effort by design: an IO failure must
// never block a spawn or panic a quit path (the `status_log` posture). A workspace that
// opens without its flag recorded is a mild degradation (one missed auto-resume); a
// workspace that refuses to open is a dead click.
// ---------------------------------------------------------------------------

/// The canonical key form for a project path.
///
/// ⚠️ **Every set and every clear must go through this**, or a flag set under one spelling
/// of a path would be uncleared by another. That is not hypothetical: the app-quit route
/// (P2.3) reads its paths from `WorkspaceRegistry`, which stores **canonicalized** keys,
/// while the spawn path (P2.1) receives the frontend's raw `projectPath`. Both ultimately
/// derive from the same `ws.project_path`, so they agree *today* — but relying on that is
/// relying on two call sites never diverging. Canonicalizing here makes agreement a
/// property of the store instead of a coincidence at the callers.
///
/// Delegates to `status_broadcaster::canonical_key`, which is already the project's
/// path-key convention (falls back to the lossy string form when `canonicalize` fails, so
/// a since-deleted directory still keys stably rather than panicking).
fn key_for(project_path: &str) -> String {
    crate::status_broadcaster::canonical_key(Path::new(project_path))
}

/// Set the flag for `project_path` and persist. Best-effort: returns `false` if the
/// write failed (callers log-and-continue rather than propagating).
/// Consumer: `SessionRegistry::spawn` (P2.1) — live.
pub fn set_and_persist(data_dir: &Path, project_path: &str) -> bool {
    let mut map = read(data_dir);
    set(&mut map, &key_for(project_path));
    write(data_dir, &map).is_ok()
}

/// Clear the flag for `project_path` and persist. Best-effort. Skips the write entirely
/// when the flag was not set — the common case on a clean exit of a project that was
/// already clean, and it keeps clean quits off the disk-write path.
/// Consumer: `session_state::commands::session_state_mark_clean` (P2.2/P2.3/P2.5) — live.
pub fn clear_and_persist(data_dir: &Path, project_path: &str) -> bool {
    let mut map = read(data_dir);
    if !clear(&mut map, &key_for(project_path)) {
        return true; // nothing to do; already clean
    }
    write(data_dir, &map).is_ok()
}

/// Whether `project_path` is marked unclean, read straight from disk. Keyed through
/// [`key_for`] so it agrees with what [`set_and_persist`] wrote.
/// Consumer: WP3's announce batch + `predictAction` input. Retire the attribute then.
#[allow(dead_code)]
pub fn is_unclean_on_disk(data_dir: &Path, project_path: &str) -> bool {
    is_unclean(&read(data_dir), &key_for(project_path))
}

// ---------------------------------------------------------------------------
// The clean-exit routes, enumerated AS DATA (P2.3).
// ---------------------------------------------------------------------------

/// Every route by which a session ends *cleanly* — i.e. every route that must clear the
/// unclean flag. Enumerated as data so the set is testable and exhaustive rather than a
/// prose list in a comment that drifts.
///
/// ## Why clearing is OPT-IN per route (the load-bearing design decision, P2.2/P2.4)
/// The obvious implementation — clear whenever a PTY session ends — is **wrong**, and the
/// plan initially assumed it. `cc-exit-<sid>` fires on *every* teardown: a user-typed
/// `/exit`, the filmstrip ×, an app quit, **and** the unclean-exit button, because
/// `CcSession::kill`'s step 4 reaps the leader precisely so the reader thread hits EOF.
/// A clear driven off that signal would clear the flag the unclean-exit button exists to
/// preserve, silently defeating it.
///
/// Two further facts force the same conclusion: `PtyCcSession` does **not** retain
/// `project_path` (it is consumed as the PTY's cwd at spawn), and `cc_kill` receives only
/// a `session_id` — so no kill site can even name the project to clear. And `cc_kill`
/// fires from `XtermPane`'s **unmount cleanup**, which runs identically for every close
/// intent; by unmount time the reason is gone.
///
/// So clearing is an **explicit act on the routes that are clean**, never a side effect of
/// teardown. The unclean-exit button clears nothing *by not calling* — it cannot forget to
/// opt out, because there is nothing to opt out of. Fail-safe by construction: a route
/// someone forgets to wire leaves a stale flag (one spurious `/resume` offer), whereas the
/// inverse default would silently disable the whole feature.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CleanExitRoute {
    /// The user typed `/exit` in the CC pane and the session ended on its own.
    CcExitCommand,
    /// The filmstrip × closed the workspace (the ordinary close).
    WorkspaceClose,
    /// The app quit gracefully (⌘Q / red button → `CloseRequested` → `quit_now`).
    AppQuit,
    /// **M13 Recycle Session** (P2.5). Pinned here now, ahead of M13, because Recycle
    /// writes `.session.md` first and is therefore clean **by intent** — M13 should
    /// inherit that contract rather than rediscover it. A Recycle that left the flag set
    /// would fire `/resume` over a session the user deliberately recycled.
    RecycleSession,
}

impl CleanExitRoute {
    /// All clean-exit routes. A new variant must be added here — the exhaustiveness test
    /// fails until it is, and the `match` below fails to compile until it is handled.
    pub const ALL: [CleanExitRoute; 4] = [
        CleanExitRoute::CcExitCommand,
        CleanExitRoute::WorkspaceClose,
        CleanExitRoute::AppQuit,
        CleanExitRoute::RecycleSession,
    ];

    /// The wire name the frontend sends. Kebab-case, matching the project's existing
    /// wire vocabulary (`CcPermissionMode`, `DriveMode`).
    pub fn as_wire(self) -> &'static str {
        match self {
            CleanExitRoute::CcExitCommand => "cc-exit-command",
            CleanExitRoute::WorkspaceClose => "workspace-close",
            CleanExitRoute::AppQuit => "app-quit",
            CleanExitRoute::RecycleSession => "recycle-session",
        }
    }

    /// Parse a wire name. Unknown → `None`, which the command treats as a no-op rather
    /// than a clear: an unrecognized route must never clear a flag by accident.
    pub fn from_wire(s: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|r| r.as_wire() == s)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    const A: &str = "/Users/dev/project-a";
    const B: &str = "/Users/dev/project-b";

    // -- the pure lifecycle ------------------------------------------------

    #[test]
    fn set_marks_only_the_named_path() {
        let mut map = SessionStateMap::new();
        set(&mut map, A);
        assert!(is_unclean(&map, A), "the set path must read unclean");
        assert!(
            !is_unclean(&map, B),
            "an unrelated path must remain clean — the flag is per-project"
        );
    }

    #[test]
    fn set_is_idempotent_a_reopen_cannot_unset() {
        let mut map = SessionStateMap::new();
        set(&mut map, A);
        set(&mut map, A);
        assert!(
            is_unclean(&map, A),
            "re-opening before any clean exit must not clear the flag"
        );
    }

    #[test]
    fn clear_removes_the_key_rather_than_writing_false() {
        let mut map = SessionStateMap::new();
        set(&mut map, A);
        assert!(clear(&mut map, A), "clear reports it removed something");
        assert!(
            !map.contains_key(A),
            "ABSENT MEANS CLEAN: clear must REMOVE the key, not store false — a `false` \
             entry would make a future contains_key() read silently wrong"
        );
    }

    #[test]
    fn clear_on_an_already_clean_path_reports_no_change() {
        let mut map = SessionStateMap::new();
        assert!(
            !clear(&mut map, A),
            "clearing an unset flag must report false so callers can skip the write"
        );
    }

    #[test]
    fn consume_returns_the_prior_value_and_clears() {
        let mut map = SessionStateMap::new();
        set(&mut map, A);
        assert!(
            consume(&mut map, A),
            "consume returns the prior unclean value"
        );
        assert!(
            !map.contains_key(A),
            "consume must clear — firing /resume consumes the flag so it fires at most once"
        );
        assert!(
            !consume(&mut map, A),
            "a second consume with no intervening crash yields the clean/neither arm"
        );
    }

    #[test]
    fn consume_of_a_clean_path_is_false_and_does_not_create_a_key() {
        let mut map = SessionStateMap::new();
        assert!(!consume(&mut map, A));
        assert!(
            map.is_empty(),
            "consuming a clean path must not materialize a key"
        );
    }

    #[test]
    fn is_unclean_defaults_to_clean_for_an_unknown_path() {
        let map = SessionStateMap::new();
        assert!(
            !is_unclean(&map, A),
            "an absent key is CLEAN — the load-bearing invariant"
        );
    }

    // -- the store round-trip ----------------------------------------------

    #[test]
    fn round_trips_through_disk() {
        let dir = TempDir::new().unwrap();
        let mut map = SessionStateMap::new();
        set(&mut map, A);
        write(dir.path(), &map).unwrap();

        let reread = read(dir.path());
        assert!(is_unclean(&reread, A));
        assert!(!is_unclean(&reread, B));
    }

    #[test]
    fn a_cleared_key_is_absent_from_the_serialized_json() {
        let dir = TempDir::new().unwrap();
        let mut map = SessionStateMap::new();
        set(&mut map, A);
        set(&mut map, B);
        clear(&mut map, A);
        write(dir.path(), &map).unwrap();

        // Assert on the PARSED key set, not on a bool: a `false` value would satisfy
        // `!is_unclean` while still leaving the key on disk, which is the exact defect
        // this invariant exists to prevent.
        let raw = std::fs::read_to_string(dir.path().join(SESSION_STATE_FILE)).unwrap();
        let parsed: SessionStateMap = serde_json::from_str(&raw).unwrap();
        let keys: Vec<&String> = parsed.keys().collect();
        assert_eq!(
            keys,
            vec![&B.to_string()],
            "only the still-unclean key survives"
        );
    }

    // -- degraded reads: every arm must fail toward CLEAN -------------------

    #[test]
    fn missing_file_reads_clean_for_every_path() {
        let dir = TempDir::new().unwrap();
        let map = read(dir.path());
        assert!(
            map.is_empty(),
            "a missing file is the normal cold-start state"
        );
        assert!(!is_unclean(&map, A));
    }

    #[test]
    fn corrupt_json_reads_clean_rather_than_asserting_unclean() {
        let dir = TempDir::new().unwrap();
        std::fs::write(dir.path().join(SESSION_STATE_FILE), b"{not json at all").unwrap();
        let map = read(dir.path());
        assert!(
            map.is_empty(),
            "a malformed file must degrade to clean — a corrupt file must never be able \
             to assert 'unclean' and trigger a spurious /resume"
        );
    }

    #[test]
    fn wrong_shaped_json_reads_clean() {
        let dir = TempDir::new().unwrap();
        // Valid JSON, wrong shape (an array where a map is expected).
        std::fs::write(dir.path().join(SESSION_STATE_FILE), b"[1, 2, 3]").unwrap();
        assert!(read(dir.path()).is_empty());
    }

    #[test]
    fn unreadable_path_reads_clean() {
        let dir = TempDir::new().unwrap();
        // Point the store at a path that cannot be read as a file: the data_dir's own
        // child is a DIRECTORY named session-state.json, so `fs::read` errors.
        std::fs::create_dir(dir.path().join(SESSION_STATE_FILE)).unwrap();
        assert!(read(dir.path()).is_empty());
    }

    // -- the persist wrappers ----------------------------------------------

    #[test]
    fn set_and_persist_then_clear_and_persist_round_trip_on_disk() {
        let dir = TempDir::new().unwrap();
        assert!(set_and_persist(dir.path(), A));
        assert!(
            is_unclean(&read(dir.path()), A),
            "set must survive a re-read"
        );

        assert!(clear_and_persist(dir.path(), A));
        assert!(
            !read(dir.path()).contains_key(A),
            "clear must survive a re-read as an ABSENT key"
        );
    }

    #[test]
    fn set_and_persist_preserves_other_projects_flags() {
        let dir = TempDir::new().unwrap();
        set_and_persist(dir.path(), A);
        set_and_persist(dir.path(), B);
        let map = read(dir.path());
        assert!(
            is_unclean(&map, A) && is_unclean(&map, B),
            "writes must merge, not replace"
        );
    }

    #[test]
    fn clear_and_persist_leaves_sibling_flags_intact() {
        let dir = TempDir::new().unwrap();
        set_and_persist(dir.path(), A);
        set_and_persist(dir.path(), B);
        clear_and_persist(dir.path(), A);
        let map = read(dir.path());
        assert!(!map.contains_key(A), "the cleared project's key is gone");
        assert!(
            is_unclean(&map, B),
            "the sibling project's flag is untouched"
        );
    }

    #[test]
    fn clear_and_persist_on_a_clean_path_succeeds_without_creating_a_file() {
        let dir = TempDir::new().unwrap();
        assert!(
            clear_and_persist(dir.path(), A),
            "clearing an already-clean path is a success, not a failure"
        );
        assert!(
            !dir.path().join(SESSION_STATE_FILE).exists(),
            "a no-op clear must not create the file — it skips the write entirely"
        );
    }

    #[test]
    fn set_and_persist_reports_failure_when_the_dir_does_not_exist() {
        let dir = TempDir::new().unwrap();
        let missing = dir.path().join("no-such-dir");
        assert!(
            !set_and_persist(&missing, A),
            "a failed write must report false so the caller can log-and-continue rather \
             than believing the flag landed"
        );
    }

    // -- durability contract (verify-codify) -------------------------------
    //
    // The three tests below cover properties the module HEADER claims but which no
    // behavioral test above would catch if they broke — each is a silent-regression
    // channel, not redundant coverage.

    #[test]
    fn write_leaves_no_tmp_sidecar_behind() {
        let dir = TempDir::new().unwrap();
        let mut map = SessionStateMap::new();
        set(&mut map, A);
        write(dir.path(), &map).unwrap();

        assert!(
            !dir.path().join(SESSION_STATE_TMP_FILE).exists(),
            "the .tmp sidecar must be RENAMED away, not copied — a leaked temp file would \
             accumulate one stale artifact per write"
        );
        assert!(dir.path().join(SESSION_STATE_FILE).exists());
    }

    #[test]
    fn write_replaces_rather_than_appends_so_a_shrinking_map_cannot_leave_stale_keys() {
        let dir = TempDir::new().unwrap();
        let mut map = SessionStateMap::new();
        set(&mut map, A);
        set(&mut map, B);
        write(dir.path(), &map).unwrap();

        // Now write a STRICTLY SMALLER map over the top. A naive append-or-merge write
        // (or a partial overwrite that left the file's tail intact) would leave A's key
        // behind — and a stale `true` key is precisely a spurious /resume on next open.
        let mut shrunk = SessionStateMap::new();
        set(&mut shrunk, B);
        write(dir.path(), &shrunk).unwrap();

        let reread = read(dir.path());
        assert_eq!(
            reread.keys().collect::<Vec<_>>(),
            vec![&B.to_string()],
            "a smaller map must fully REPLACE the file — a surviving key from the larger \
             prior write would fire an unasked-for /resume"
        );
    }

    #[test]
    fn interleaved_writers_do_not_lose_each_others_flags() {
        // This is the hazard that DISQUALIFIED candidate 1 (a field on `Project`), where
        // two whole-file read-modify-writes co-triggered by one click silently discard
        // each other's field. The same shape is modeled here against THIS store to prove
        // the replacement does not inherit the flaw it was chosen to avoid.
        //
        // Why it holds: each persist wrapper does its own read→mutate→write, so a writer
        // that starts AFTER another has landed observes the earlier write. The candidate-1
        // failure needed two writers snapshotting the same PRE-state; the wrappers here
        // re-read immediately before mutating, so sequential co-triggered writes compose.
        let dir = TempDir::new().unwrap();

        // Writer 1 lands.
        assert!(set_and_persist(dir.path(), A));
        // Writer 2 (a different project, same click in the real app) lands after it.
        assert!(set_and_persist(dir.path(), B));

        let map = read(dir.path());
        assert!(
            is_unclean(&map, A) && is_unclean(&map, B),
            "neither writer may discard the other's flag — losing a flag silently disables \
             auto-resume, which is the exact defect that ruled out storing this on `Project`"
        );

        // And the inverse direction: a clear must not resurrect or drop the sibling.
        assert!(clear_and_persist(dir.path(), A));
        let after = read(dir.path());
        assert!(!after.contains_key(A), "the cleared flag is gone");
        assert!(is_unclean(&after, B), "the sibling flag survives the clear");
    }
}
