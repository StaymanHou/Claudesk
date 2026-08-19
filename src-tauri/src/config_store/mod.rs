//! Project config store — durable persistence for the project list.
//!
//! Backs the VSCode-style Project Picker. The list lives as a flat JSON file at
//! `~/Library/Application Support/Claudesk/projects.json` (no DB, ≤100 entries;
//! see `docs/product/arch.md` §Persistence). Records keep every project until
//! the user explicitly deletes one — nothing auto-evicts.
//!
//! ## Layout
//! - **Pure store functions** ([`read_projects`], [`write_projects`],
//!   [`add_or_touch`], [`remove`]) take an injected `data_dir: &Path` so they are
//!   unit-testable against a `TempDir` with no Tauri runtime.
//! - **Tauri command wrappers** ([`commands`]) resolve the real app-data dir via
//!   `app_handle.path().app_data_dir()`, ensure it exists, and delegate to the
//!   pure functions. They are the only IPC surface.
//!
//! ## Durability
//! Writes are atomic: serialize → `projects.json.tmp` → `fs::rename`. A crash
//! mid-write leaves the live `projects.json` untouched (the half-written tmp is
//! discarded on next run). `rename` within one directory is atomic on macOS.
//!
//! ## ✅ The `#[allow(dead_code)]` ledger — CLOSED (M12 WP4c Phase 2, 2026-08-10)
//! Both attributed items have retired to their **named** consumers, which is the outcome
//! this ledger existed to force:
//!
//! - [`read_default_drive_mode`] — retired in **WP4b Phase 2** as predicted
//!   (`SessionRegistry::spawn` reads the mode to compose the CC spawn env).
//! - [`set_default_drive_mode`] — retired in **WP4c Phase 2** as predicted
//!   (`commands::project_set_default_drive_mode` is the picker cell's write path).
//!
//! `cargo clippy --all-targets -- -D warnings` now passes with **neither attribute
//! present**, which was the stated close condition — the passing run is the proof each item
//! has a real caller, not their deletion. **Both consumers arrived as named**, so neither
//! became the `is_unclean_on_disk` case (attributed on a predicted consumer that never
//! materialized, and rightly deleted rather than re-attributed).
//!
//! ⚠️ Kept as a closed record rather than deleted, because the *discipline* is what
//! transfers: attribute **per item** and name the consumer, never a module-wide
//! `#![allow(dead_code)]` (per `session_state/mod.rs:47`, where a blanket allow with an
//! expiry note masked a test-only helper sitting in production until code review caught it).
//! A future placeholder field in this module should re-open the ledger in this shape.

pub mod commands;
pub mod settings;

use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Basename of the persisted project list within the app-data directory.
/// `pub(crate)` so the seed-once path resolution in [`commands`] uses this single
/// definition rather than its own mirror copy (Theme A dedup).
pub(crate) const PROJECTS_FILE: &str = "projects.json";
/// Sidecar temp file used for the atomic write-then-rename.
const PROJECTS_TMP_FILE: &str = "projects.json.tmp";

/// A single remembered project.
///
/// `path` serializes as `project_path` to match the frontend `RecentProject`
/// shape (`{ display_name, project_path }`) without a frontend type rename.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Project {
    /// Absolute path to the project directory.
    #[serde(rename = "project_path")]
    pub path: PathBuf,
    /// Last-opened timestamp, unix epoch milliseconds. Drives recency ordering.
    pub last_opened_at: i64,
    /// Display label; defaults to the directory basename when omitted.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    /// Per-project override for the model the spawned CC session runs (M11.5 WP1).
    /// `None` = **inherit CC's own global default** — the pre-M11.5 behavior — and the
    /// key is omitted from disk entirely, so existing `projects.json` files and users
    /// who never touch the control are byte-for-byte unaffected.
    ///
    /// This was Claudesk's **first** per-project setting with a live read/write path.
    /// Written by `set_default_model`, read at spawn time by `SessionRegistry::spawn` and
    /// mapped to CC's `--model` by `build_cc_argv`.
    ///
    /// ⚠️ [`Self::default_drive_mode`] below is **also live as of M12 WP4b** — this comment
    /// used to call it a never-read placeholder, which is no longer true. The two are
    /// siblings in storage and divergent in consumption: this one ends in **argv**, that
    /// one in an **env var**. Do not reason from one to the other past the store layer.
    ///
    /// Stored **verbatim, unvalidated**. `claude --help` documents an open value set
    /// (an alias like `opus`, or a full ID like `claude-fable-5`), and an unusable value
    /// makes CC print its own precise in-session error — which knows about entitlements,
    /// not just existence. A Claudesk-side allowlist would be both less accurate and
    /// guaranteed to reject models released after this build. See the WP1 probe findings.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_model: Option<String>,
    /// This project's workflow drive mode. **LIVE since M12 WP4b** — written by
    /// [`set_default_drive_mode`], read at spawn time by `SessionRegistry::spawn`.
    ///
    /// ⚠️ **Its consumption path differs from [`Self::default_model`]'s, and the
    /// difference is the whole point.** `default_model` terminates in **argv**
    /// (`--model`); this value has **no CLI flag and no argv destination**. It reaches
    /// CC as the `CLAUDESK_DRIVE_MODE` **environment variable**, which gates a
    /// `UserPromptSubmit` hook that emits an `additionalContext` line naming the mode —
    /// so `/session-restore` does not re-ask a question the operator already answered.
    /// Read `default_model` for the **storage** precedent only; the consumption analogy
    /// breaks at the point that matters (a WP sized on that analogy was mis-sized once
    /// already).
    ///
    /// Absent value → the var is **not set** → the hook is inert, which is the same
    /// mechanism that keeps a plain-terminal `claude` byte-identical. The value is also
    /// gated spawn-side on `workflow_features_enabled`; gate OFF likewise means "do not
    /// set the var". Claudesk never writes this mode into any `workflow-system/` file —
    /// see the WP4b WIP's task 4b.7 for why that mechanism was rejected.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_drive_mode: Option<DriveMode>,
}

/// The four workflow drive modes, serializing to **the exact vocabulary the workflow
/// skills read**: `stepping` · `orchestrated` · `autopilot` · `fsd`.
///
/// ⚠️ **Every rename here is load-bearing — do not "tidy" them into `rename_all`.**
/// Two of these four are NOT the kebab-case form of the variant name, so a
/// `rename_all = "kebab-case"` attribute (which is what this enum carried until M12
/// WP4b) silently emits `step-by-step` and `full-autopilot` — values **no skill
/// recognizes**. The consumer is external, so a wrong value is not a type error: the
/// hook's known-mode allowlist correctly rejects it and the feature does **nothing at
/// all** for that mode (measured: 0 bytes). Modes 1 and 4 shipped broken for exactly
/// that reason before this fix.
///
/// Authority, three independent sources in agreement: `transitions.md:165`
/// (*"drive_mode: stepping | orchestrated | autopilot | fsd"*),
/// `session-handoff/SKILL.md:75`'s writer template, and 29 real archive WIP files.
///
/// Per-variant `rename` is deliberate over `rename_all`: it puts each wire value on the
/// line you read when adding a 5th variant, so a new mode cannot inherit a derived shape
/// that happens to be wrong. Pinned by
/// [`tests::drive_mode_serializes_to_these_literal_strings`], which asserts the literal
/// strings transcribed from `transitions.md` — **not** a round-trip through this
/// serializer, which would prove symmetry rather than correctness.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DriveMode {
    #[serde(rename = "stepping")]
    StepByStep,
    #[serde(rename = "orchestrated")]
    Orchestrated,
    #[serde(rename = "autopilot")]
    Autopilot,
    #[serde(rename = "fsd")]
    FullAutopilot,
}

/// Errors from the config store. IPC-facing wrappers map this to a `String`.
#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("config I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("config parse error: {0}")]
    Parse(#[from] serde_json::Error),
}

/// Read the project list, ordered most-recently-opened first.
///
/// A missing file is normal on first run and returns an empty vec — not an
/// error. A present-but-malformed file returns [`ConfigError::Parse`] (we never
/// silently wipe a file we failed to understand).
pub fn read_projects(data_dir: &Path) -> Result<Vec<Project>, ConfigError> {
    let file = data_dir.join(PROJECTS_FILE);
    let bytes = match std::fs::read(&file) {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(e.into()),
    };
    let mut projects: Vec<Project> = serde_json::from_slice(&bytes)?;
    sort_by_recency(&mut projects);
    Ok(projects)
}

/// Atomically persist the project list: serialize → `projects.json.tmp` →
/// `rename` over `projects.json`. The caller is responsible for ensuring
/// `data_dir` exists (the command wrappers do this).
pub fn write_projects(data_dir: &Path, projects: &[Project]) -> Result<(), ConfigError> {
    let tmp = data_dir.join(PROJECTS_TMP_FILE);
    let final_path = data_dir.join(PROJECTS_FILE);
    let json = serde_json::to_vec_pretty(projects)?;
    std::fs::write(&tmp, &json)?;
    std::fs::rename(&tmp, &final_path)?;
    Ok(())
}

/// Serializes every config read-modify-write in this process (paydown WP8).
///
/// ⚠️ **ONE lock for BOTH stores**, deliberately. A caller can legitimately touch
/// `projects.json` and `settings.json` in the same logical operation, and two locks invite a
/// lock-ordering bug for no benefit: these writes are sub-millisecond and uncontended in
/// practice, so the coarser lock costs nothing measurable and removes a whole failure class.
///
/// ⚠️ **In-process only, and that IS the whole surface.** A dev build and a prod build resolve
/// different `app_data_dir`s by bundle identity (`com.claudesk.app` vs `.dev`), so they never
/// share these files — cross-process locking would guard a collision that cannot happen. If that
/// isolation is ever removed, this becomes insufficient and needs a real file lock.
///
/// ⚠️ Poisoning is deliberately ignored (`unwrap_or_else(|e| e.into_inner())`): a panic mid-write
/// leaves the *file* intact because writes are atomic (tmp + rename), so the next writer's
/// read-modify-write is still correct. Refusing all further config writes because an unrelated
/// write panicked once would be a worse outcome than proceeding.
///
/// ⚠️ **THE LOCK GUARDS TWO DISTINCT FAILURES, AND THE SECOND IS WORSE THAN THE FILED ONE.**
/// Paydown WP8 was filed as a *lost update* (two writers clobber one another's field), and the
/// filing explicitly said "this is NOT a torn-write problem" because each write is atomic. That is
/// half right. Each write IS atomic — but **all writers of a store share ONE fixed tmp path**
/// (`settings.json.tmp` / `projects.json.tmp`), so two concurrent writers also race on the sidecar
/// itself: one `rename`s it away while the other is still writing to it, and the loser's write
/// fails outright with `ENOENT` rather than merely losing a field. Measured, not theorized —
/// removing this lock makes `settings::tests::concurrent_funnelled_writers_never_lose_a_field`
/// panic with `Io(NotFound)` from the writer thread, not just fail its field assertion.
/// So serializing here is what makes the atomic-write scheme actually atomic under concurrency.
/// A per-writer unique tmp name would fix the `ENOENT` half alone and leave the lost update.
static CONFIG_WRITE_LOCK: Mutex<()> = Mutex::new(());

fn config_write_guard() -> MutexGuard<'static, ()> {
    CONFIG_WRITE_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// **THE funnel for every `projects.json` mutation.** Read → apply `mutate` → write, all while
/// holding [`CONFIG_WRITE_LOCK`], so no other config writer can interleave.
///
/// ⚠️ **THIS IS THE ONLY THING THAT MAY CALL [`write_projects`] outside a test**, and a guard in
/// `settings.rs`'s tests enforces that. The point is not merely the lock — it is that there is now
/// exactly ONE place to add serialization, validation, or a migration, instead of five call sites
/// each with its own read→write window. Before this, two mutators touching different fields
/// clobbered one another (reproduced deterministically in
/// `settings::tests::interleaved_field_writers_...`).
///
/// ⚠️ Standing lesson this implements: *"funnel every write of shared state through ONE function
/// and guard THAT"* (`docs/lessons/verify-self-tiers.md` §4) — banked from two shipped defects in
/// this repo, one a CRITICAL, where a correct mechanism sat behind a caller that bypassed it.
///
/// The closure returns a value so a mutator can report what it did (e.g. `add_or_touch`'s record)
/// without a second read.
pub(crate) fn update_projects<T>(
    data_dir: &Path,
    mutate: impl FnOnce(&mut Vec<Project>) -> Result<T, ConfigError>,
) -> Result<T, ConfigError> {
    let _guard = config_write_guard();
    let mut projects = read_projects(data_dir)?;
    let out = mutate(&mut projects)?;
    write_projects(data_dir, &projects)?;
    Ok(out)
}

/// **THE funnel for every `settings.json` mutation** — the `settings.rs` twin of
/// [`update_projects`], sharing the same lock. Lives here rather than in `settings.rs` so both
/// funnels and the lock they share are in one place; `settings.rs` calls it.
///
/// ⚠️ Same rule: this is the ONLY thing that may call `write_settings` outside a test.
pub(crate) fn update_settings<T>(
    data_dir: &Path,
    mutate: impl FnOnce(&mut settings::AppSettings) -> Result<T, ConfigError>,
) -> Result<T, ConfigError> {
    let _guard = config_write_guard();
    let mut current = settings::read_settings(data_dir)?;
    let out = mutate(&mut current)?;
    settings::write_settings(data_dir, &current)?;
    Ok(out)
}

/// Add a project if its path is new, or refresh `last_opened_at` if it already
/// exists. Paths are compared verbatim (the frontend supplies canonicalized
/// dialog/dir paths). Returns the resulting record. Persists the full list.
pub fn add_or_touch(data_dir: &Path, path: PathBuf, now_ms: i64) -> Result<Project, ConfigError> {
    update_projects(data_dir, |projects| {
        let record = if let Some(existing) = projects.iter_mut().find(|p| p.path == path) {
            existing.last_opened_at = now_ms;
            existing.clone()
        } else {
            let project = Project {
                display_name: derive_display_name(&path),
                path,
                last_opened_at: now_ms,
                default_model: None,
                default_drive_mode: None,
            };
            projects.push(project.clone());
            project
        };
        Ok(record)
    })
}

/// Read one project's per-project CC model override (M11.5 WP1).
///
/// `Ok(None)` covers **both** "the project has no override" and "there is no record for
/// this path at all" — the caller ([`crate::cc_session::SessionRegistry::spawn`]) treats
/// them identically as *inherit CC's global default*, so distinguishing them would only
/// invite a spawn-blocking error path where none is wanted. A malformed `projects.json`
/// still surfaces as [`ConfigError::Parse`]; the spawn call site is what degrades that to
/// `None`, keeping "never block a spawn" a decision of the caller rather than a silent
/// swallow here.
///
/// Paths are compared verbatim, matching [`add_or_touch`] and [`remove`].
pub fn read_default_model(
    data_dir: &Path,
    project_path: &Path,
) -> Result<Option<String>, ConfigError> {
    let projects = read_projects(data_dir)?;
    Ok(projects
        .into_iter()
        .find(|p| p.path == project_path)
        .and_then(|p| p.default_model))
}

/// Set (or clear, with `None`) one project's CC model override, persisting the list.
///
/// Unlike [`read_default_model`], an unknown path IS an error: there is no record to
/// attach the value to, and silently doing nothing would present to the UI as a
/// successful write that vanishes on the next read.
///
/// A `Some` value is trimmed, and a blank string is normalized to `None` (= clear), so
/// whitespace can never become an argv token that CC would reject. Clearing removes the
/// key from disk rather than writing `null` — see [`Project::default_model`].
pub fn set_default_model(
    data_dir: &Path,
    project_path: &Path,
    model: Option<String>,
) -> Result<(), ConfigError> {
    update_projects(data_dir, |projects| {
        let target = projects
            .iter_mut()
            .find(|p| p.path == project_path)
            .ok_or_else(|| {
                ConfigError::Io(std::io::Error::new(
                    std::io::ErrorKind::NotFound,
                    format!("no project record for {}", project_path.display()),
                ))
            })?;
        target.default_model = normalize_model(model);
        Ok(())
    })
}

/// Read one project's drive-mode override, or `None` if the project has no record or no
/// mode set. Mirrors [`read_default_model`]: an unknown path is **not** an error, because
/// the caller (spawn) treats "no override" and "no record" identically — both mean "set no
/// env var, leave the hook inert".
///
/// Paths are compared verbatim, matching [`add_or_touch`] and [`remove`].
///
/// ⚠️ Unlike the model override, the value is **typed** ([`DriveMode`]), so an
/// unrecognized on-disk string fails the read rather than reaching the caller — see
/// [`tests::an_unknown_drive_mode_string_fails_the_whole_project_list`] for that blast
/// radius. The spawn-side caller degrades a read error to `None` for exactly this reason.
///
/// ⚠️ **The `#[allow(dead_code)]` this fn carried was REMOVED at M12 WP4c Phase 2** — and it
/// should have gone at **WP4b Phase 2**, when its named consumer actually landed. The real
/// caller is `resolve_cc_spawn_env`'s argument in `cc_session/mod.rs` (the CC spawn path,
/// production code), so the attribute had been redundant for a whole WP while still *reading*
/// as "this is not called yet".
///
/// ⚠️ **That is the ledger's own failure mode, caught here rather than by the gate:** an
/// `#[allow(dead_code)]` that outlives its consumer is invisible to `clippy -D warnings` (it
/// suppresses precisely the warning that would flag it), so nothing fails when it goes stale
/// — it just quietly misinforms the next reader. Removing it is what makes clippy the guard
/// again: a fresh dead-code warning here now means the spawn path stopped reading the mode,
/// which would silently disable the whole drive-mode signal.
pub fn read_default_drive_mode(
    data_dir: &Path,
    project_path: &Path,
) -> Result<Option<DriveMode>, ConfigError> {
    let projects = read_projects(data_dir)?;
    Ok(projects
        .into_iter()
        .find(|p| p.path == project_path)
        .and_then(|p| p.default_drive_mode))
}

/// Set (or clear, with `None`) one project's drive mode, persisting the list.
///
/// Unlike [`read_default_drive_mode`], an unknown path IS an error — same reasoning as
/// [`set_default_model`]: there is no record to attach the value to, and silently doing
/// nothing would present to the UI as a successful write that vanishes on the next read.
///
/// Clearing removes the key from disk rather than writing `null` (via the field's
/// `skip_serializing_if`), so an unset mode is indistinguishable from a project that
/// predates the feature — which is what makes "absent → do not set the env var" a single
/// code path rather than two.
///
/// ⚠️ **Whole-file read-modify-write, like every other writer here.** `set_default_model`
/// and `add_or_touch` share this shape, and a concurrent pair of writers can lose one
/// update (`SURFACE-2026-08-03-PROJECTS-JSON-WRITERS-ARE-WHOLE-FILE-RMW`). This writer is
/// driven by an explicit picker-cell edit, so it is not co-triggered by the open click the
/// way the recency stamp is — but do not add a *reflexive* mode write to any open path
/// without reading that item first.
///
/// ⚠️ **The `#[allow(dead_code)]` this fn carried was REMOVED at M12 WP4c Phase 2**, when
/// `project_set_default_drive_mode` (`commands.rs`) became its real caller and put it on the
/// IPC surface. Per the ledger's own close condition, `cargo clippy --all-targets -D warnings`
/// passing with the attribute **absent** is what proves the consumer exists — its removal is
/// the evidence, not a tidy-up. Do not re-add it: a fresh dead-code warning here means the
/// command was unregistered from `lib.rs`'s invoke handler, which would silently break the
/// picker cell's write path.
pub fn set_default_drive_mode(
    data_dir: &Path,
    project_path: &Path,
    mode: Option<DriveMode>,
) -> Result<(), ConfigError> {
    update_projects(data_dir, |projects| {
        let target = projects
            .iter_mut()
            .find(|p| p.path == project_path)
            .ok_or_else(|| {
                ConfigError::Io(std::io::Error::new(
                    std::io::ErrorKind::NotFound,
                    format!("no project record for {}", project_path.display()),
                ))
            })?;
        target.default_drive_mode = mode;
        Ok(())
    })
}

/// Trim a model override, mapping blank to `None` (= inherit CC's default).
///
/// Pure so the blank-is-unset rule is unit-testable on its own and is guaranteed to be
/// the *same* rule the argv builder applies (`build_cc_argv` re-checks for defense in
/// depth against values written by an older build or hand-edited into the file).
fn normalize_model(model: Option<String>) -> Option<String> {
    model
        .map(|m| m.trim().to_string())
        .filter(|m| !m.is_empty())
}

/// Remove a project by path. No-op (and not an error) if the path is absent.
/// Persists the resulting list.
pub fn remove(data_dir: &Path, path: &Path) -> Result<(), ConfigError> {
    // ⚠️ Goes through the funnel even though the original skipped the write when nothing
    // changed. The funnel always writes, so an absent path now rewrites an identical file —
    // a no-op rename, not a behavior change (the list is byte-identical). Keeping the
    // short-circuit would mean a second write path outside the funnel, which is the thing
    // this WP exists to remove.
    update_projects(data_dir, |projects| {
        projects.retain(|p| p.path != path);
        Ok(())
    })
}

/// Drop projects whose directory no longer exists on disk.
///
/// A project's folder can be deleted, renamed, or unmounted between sessions; such
/// an entry is a dead click in the picker. This reads the list, partitions it into
/// survivors (path still exists) and dropped (path gone), persists the survivors
/// **only if any were dropped** (no needless write on the common all-present case),
/// and returns the dropped records so the caller can name them in a toast.
///
/// Existence is tested with [`Path::exists`], which follows symlinks and treats any
/// stat error (including permission denied) as "does not exist". For the picker that
/// is the right call: an entry we cannot stat is one we cannot open either.
pub fn prune_missing(data_dir: &Path) -> Result<Vec<Project>, ConfigError> {
    // ⚠️ Like `remove`, this now always writes (the funnel does), where before it skipped the
    // write when nothing was dropped. The file content is identical in that case, so this is a
    // redundant atomic rename rather than a behavior change — and it buys a single write path.
    update_projects(data_dir, |projects| {
        let (kept, dropped): (Vec<Project>, Vec<Project>) = std::mem::take(projects)
            .into_iter()
            .partition(|p| p.path.exists());
        *projects = kept;
        Ok(dropped)
    })
}

/// Sort most-recently-opened first (descending `last_opened_at`).
fn sort_by_recency(projects: &mut [Project]) {
    projects.sort_by_key(|p| std::cmp::Reverse(p.last_opened_at));
}

/// Derive a display name from the directory basename. `None` only for paths with
/// no final component (e.g. `/`), in which case the frontend falls back to path.
fn derive_display_name(path: &Path) -> Option<String> {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn p(path: &str, ts: i64) -> Project {
        Project {
            path: PathBuf::from(path),
            last_opened_at: ts,
            display_name: Some(
                Path::new(path)
                    .file_name()
                    .unwrap()
                    .to_string_lossy()
                    .into_owned(),
            ),
            default_model: None,
            default_drive_mode: None,
        }
    }

    #[test]
    fn missing_file_reads_as_empty_vec() {
        let dir = TempDir::new().unwrap();
        let projects = read_projects(dir.path()).unwrap();
        assert!(projects.is_empty());
    }

    #[test]
    fn round_trip_write_then_read_is_equal() {
        let dir = TempDir::new().unwrap();
        let written = vec![p("/a/one", 100), p("/b/two", 200)];
        write_projects(dir.path(), &written).unwrap();
        let read = read_projects(dir.path()).unwrap();
        // read sorts by recency desc; compare against the same ordering.
        let mut expected = written.clone();
        expected.sort_by_key(|p| std::cmp::Reverse(p.last_opened_at));
        assert_eq!(read, expected);
    }

    #[test]
    fn list_is_ordered_recency_desc() {
        let dir = TempDir::new().unwrap();
        write_projects(
            dir.path(),
            &[p("/old", 100), p("/newest", 300), p("/mid", 200)],
        )
        .unwrap();
        let read = read_projects(dir.path()).unwrap();
        let order: Vec<i64> = read.iter().map(|p| p.last_opened_at).collect();
        assert_eq!(order, vec![300, 200, 100]);
    }

    #[test]
    fn malformed_file_is_an_error_not_a_wipe() {
        let dir = TempDir::new().unwrap();
        std::fs::write(dir.path().join(PROJECTS_FILE), b"{ not valid json").unwrap();
        let result = read_projects(dir.path());
        assert!(matches!(result, Err(ConfigError::Parse(_))));
        // The malformed file is left intact — we never silently overwrite it.
        let raw = std::fs::read(dir.path().join(PROJECTS_FILE)).unwrap();
        assert_eq!(raw, b"{ not valid json");
    }

    #[test]
    fn add_existing_path_dedupes_and_updates_timestamp() {
        let dir = TempDir::new().unwrap();
        add_or_touch(dir.path(), PathBuf::from("/repo/alpha"), 100).unwrap();
        add_or_touch(dir.path(), PathBuf::from("/repo/beta"), 150).unwrap();
        // Re-open alpha later.
        let touched = add_or_touch(dir.path(), PathBuf::from("/repo/alpha"), 300).unwrap();

        assert_eq!(touched.last_opened_at, 300);
        let projects = read_projects(dir.path()).unwrap();
        // No duplicate alpha.
        assert_eq!(projects.len(), 2);
        // Recency order: alpha (300) now ahead of beta (150).
        assert_eq!(projects[0].path, PathBuf::from("/repo/alpha"));
        assert_eq!(projects[0].last_opened_at, 300);
    }

    #[test]
    fn add_new_path_derives_display_name_from_basename() {
        let dir = TempDir::new().unwrap();
        let record = add_or_touch(dir.path(), PathBuf::from("/x/my-repo"), 100).unwrap();
        assert_eq!(record.display_name.as_deref(), Some("my-repo"));
    }

    #[test]
    fn remove_drops_entry_and_persists() {
        let dir = TempDir::new().unwrap();
        add_or_touch(dir.path(), PathBuf::from("/repo/alpha"), 100).unwrap();
        add_or_touch(dir.path(), PathBuf::from("/repo/beta"), 200).unwrap();
        remove(dir.path(), Path::new("/repo/alpha")).unwrap();

        let projects = read_projects(dir.path()).unwrap();
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].path, PathBuf::from("/repo/beta"));
    }

    #[test]
    fn remove_absent_path_is_noop_not_error() {
        let dir = TempDir::new().unwrap();
        add_or_touch(dir.path(), PathBuf::from("/repo/alpha"), 100).unwrap();
        // Removing something that isn't there must not error or change the file.
        remove(dir.path(), Path::new("/repo/ghost")).unwrap();
        let projects = read_projects(dir.path()).unwrap();
        assert_eq!(projects.len(), 1);
    }

    #[test]
    fn atomic_write_leaves_old_file_intact_when_rename_does_not_happen() {
        // Simulate a crash *after* the tmp is written but *before* the rename:
        // write a valid list, then write a fresh tmp by hand and assert the live
        // file is still the original (the rename is what commits the new state).
        let dir = TempDir::new().unwrap();
        let original = vec![p("/keep/me", 100)];
        write_projects(dir.path(), &original).unwrap();

        // Hand-write a tmp that, if a rename had happened, would replace the file.
        let doomed = serde_json::to_vec_pretty(&[p("/should/not/win", 999)]).unwrap();
        std::fs::write(dir.path().join(PROJECTS_TMP_FILE), &doomed).unwrap();

        // No rename occurred (crash) → the live file is still the original.
        let read = read_projects(dir.path()).unwrap();
        assert_eq!(read, original);
    }

    #[test]
    fn drive_mode_field_is_reserved_and_round_trips() {
        let dir = TempDir::new().unwrap();
        let with_mode = vec![Project {
            path: PathBuf::from("/m"),
            last_opened_at: 1,
            display_name: Some("m".into()),
            default_model: None,
            default_drive_mode: Some(DriveMode::Autopilot),
        }];
        write_projects(dir.path(), &with_mode).unwrap();
        let read = read_projects(dir.path()).unwrap();
        assert_eq!(read[0].default_drive_mode, Some(DriveMode::Autopilot));
    }

    /// Pins `DriveMode`'s wire vocabulary to **the literal strings the external consumer
    /// reads**. M12 WP4b fixed the 2-of-4 mismatch this test was created (in WP4a) to
    /// tripwire; the expectations below are now the correct values, and this test's job
    /// changed from *"fail when WP4b renames"* to *"fail if anyone renames them back."*
    ///
    /// | variant | wire value | |
    /// |---|---|---|
    /// | `StepByStep`    | `stepping`     | ⚠️ not the kebab-case form |
    /// | `Orchestrated`  | `orchestrated` | |
    /// | `Autopilot`     | `autopilot`    | |
    /// | `FullAutopilot` | `fsd`          | ⚠️ not the kebab-case form |
    ///
    /// Authority: `transitions.md:165` (*"drive_mode: stepping | orchestrated | autopilot
    /// | fsd"*), `session-handoff/SKILL.md:75`'s writer template, and 29 real archive WIP
    /// files (28 `autopilot`, 1 `orchestrated`).
    ///
    /// ⚠️ **The expectations below are TRANSCRIBED from `transitions.md`, not derived from
    /// this enum.** That is the entire value of the test: two of the four values are not
    /// the kebab-case form of their variant name, so anything computed from the Rust side
    /// (including a `rename_all` attribute, which is what shipped the bug) can be
    /// self-consistently wrong. A wrong value is **not** a compile error — the consumer is
    /// an external Perl allowlist, and a rejected mode makes the feature emit nothing at
    /// all for that mode. Modes 1 and 4 were broken exactly this way.
    ///
    /// **Why this test exists at all** — `drive_mode_round_trips` above writes
    /// `DriveMode::Autopilot` and reads back `DriveMode::Autopilot`, never inspecting the
    /// JSON. It passes identically whether the on-disk value is `autopilot`,
    /// `full-autopilot`, or `banana`. **A round-trip through your own serializer proves
    /// symmetry, not correctness** — the same blind spot that hid this bug from WP4a's own
    /// fixture (which shared a third, differently-wrong vocabulary) and from an evidence
    /// script's substring match. Only asserting the literal string catches it.
    #[test]
    fn drive_mode_serializes_to_these_literal_strings() {
        // The external consumer reads STRINGS out of YAML frontmatter; assert strings.
        let observed: Vec<String> = [
            DriveMode::StepByStep,
            DriveMode::Orchestrated,
            DriveMode::Autopilot,
            DriveMode::FullAutopilot,
        ]
        .iter()
        .map(|m| {
            serde_json::to_string(m)
                .unwrap()
                .trim_matches('"')
                .to_string()
        })
        .collect();

        // Transcribed by hand from `transitions.md:165`. Do NOT regenerate these from the
        // enum — see this test's doc comment for why that defeats its purpose.
        assert_eq!(
            observed,
            vec!["stepping", "orchestrated", "autopilot", "fsd"],
            "DriveMode's serialized vocabulary no longer matches what the workflow skills \
             read (`transitions.md:165`: stepping | orchestrated | autopilot | fsd). Two of \
             these four are NOT the kebab-case form of the variant name, so a `rename_all` \
             attribute or a 'tidied' rename will silently break modes 1 and 4 — the hook's \
             allowlist rejects the unknown value and emits nothing for that mode."
        );

        // Each variant pinned to its wire value INDIVIDUALLY.
        // ⚠️ Asserted BY VARIANT, not by index into `observed`. These were `observed[1]` /
        // `observed[2]` until code review: positional indices into an array built 30 lines
        // above mean an editor who reorders that array silently changes what these lines
        // pin — while the test keeps passing.
        // M12 WP4b extended this from 2 variants to all 4: the two renamed ones are now the
        // ones most worth pinning by variant, since their values are the non-obvious ones.
        let wire = |m: DriveMode| {
            serde_json::to_string(&m)
                .unwrap()
                .trim_matches('"')
                .to_string()
        };
        assert_eq!(wire(DriveMode::StepByStep), "stepping");
        assert_eq!(wire(DriveMode::Orchestrated), "orchestrated");
        assert_eq!(wire(DriveMode::Autopilot), "autopilot");
        assert_eq!(wire(DriveMode::FullAutopilot), "fsd");

        // Deserialization must accept the same vocabulary — the field is read back off
        // disk, so a one-way rename would round-trip fine in Rust and still be wrong.
        let parse = |s: &str| serde_json::from_str::<DriveMode>(&format!("\"{s}\"")).unwrap();
        assert_eq!(parse("stepping"), DriveMode::StepByStep);
        assert_eq!(parse("fsd"), DriveMode::FullAutopilot);

        // And the OLD values are now REJECTED at the type level.
        assert!(serde_json::from_str::<DriveMode>("\"full-autopilot\"").is_err());
        assert!(serde_json::from_str::<DriveMode>("\"step-by-step\"").is_err());
    }

    /// The drive-mode vocabulary lives in **two languages**, and until this test nothing
    /// tied them together (M12 WP4b Phase 3 verify-codify).
    ///
    /// Rust owns the values above via `#[serde(rename = ...)]`. The Perl hook
    /// (`resources/claudesk-hook.pl`) owns an **independent literal allowlist** —
    /// `qw(stepping orchestrated autopilot fsd)` — and matches it EXACTLY, so an
    /// unrecognized value emits nothing at all.
    ///
    /// ⚠️ **The failure mode is silent, and both existing suites stay green through it.**
    /// The sibling test above pins the Rust side; `hook_pl_output.rs` pins the Perl side by
    /// feeding it hard-coded literals. Rename a variant on either side and **neither notices**
    /// — Claudesk writes the new value into `CLAUDESK_DRIVE_MODE`, the hook does not recognise
    /// it, stdout is byte-empty, and the drive-mode signal simply stops arriving. No crash, no
    /// error, no failing test; the only symptom is `/session-restore` asking a question it
    /// should have skipped. That is precisely this WP's constraint 1, where two of four
    /// variants were already serializing to values nothing consumed.
    ///
    /// ⚠️ **Reads the allowlist out of the real script rather than restating it**, so this
    /// cannot drift into a third copy of the vocabulary — the thing it exists to prevent.
    /// A hand-transcribed expectation here would be one more place to forget.
    #[test]
    fn the_perl_hook_allowlist_matches_rusts_drive_mode_vocabulary() {
        let script = include_str!("../../resources/claudesk-hook.pl");

        // Pull the literals out of `my %KNOWN = map { $_ => 1 } qw(a b c d);`. Anchored on
        // `qw(` inside the KNOWN assignment specifically — not a loose scan for the words,
        // which the script's own comments would satisfy
        // (`[[raw-guard-identifier-satisfied-by-own-comments]]`).
        let known_line = script
            .lines()
            .find(|l| l.contains("%KNOWN") && l.contains("qw("))
            .expect(
                "claudesk-hook.pl must define the drive-mode allowlist as `my %KNOWN = ... qw(...)`. \
                 If that line was restructured, update THIS test rather than deleting it — it is \
                 the only thing tying the Perl vocabulary to Rust's.",
            );
        let inner = known_line
            .split_once("qw(")
            .and_then(|(_, rest)| rest.split_once(')'))
            .map(|(list, _)| list)
            .expect("the qw(...) list must be on one line");
        let perl_allowlist: Vec<&str> = inner.split_whitespace().collect();

        let rust_vocabulary: Vec<String> = [
            DriveMode::StepByStep,
            DriveMode::Orchestrated,
            DriveMode::Autopilot,
            DriveMode::FullAutopilot,
        ]
        .iter()
        .map(|m| {
            serde_json::to_string(m)
                .unwrap()
                .trim_matches('"')
                .to_string()
        })
        .collect();

        assert_eq!(
            perl_allowlist, rust_vocabulary,
            "the Perl hook's allowlist and Rust's DriveMode vocabulary have DRIFTED.\n  \
             Perl accepts: {perl_allowlist:?}\n  Rust emits:   {rust_vocabulary:?}\n\
             Claudesk writes Rust's value into CLAUDESK_DRIVE_MODE and the hook matches its \
             own list EXACTLY, so any value in one list but not the other makes the \
             drive-mode signal silently stop reaching CC — no crash, no error, and every \
             other test still green. Fix whichever side is wrong; `transitions.md:165` is \
             the authority for both."
        );
    }

    /// Documents the **blast radius of an unparseable `default_drive_mode`**, which is
    /// wider than it looks and was measured (not assumed) during the M12 WP4b rename.
    ///
    /// `read_projects` deserializes the whole file in one `from_slice`, so a single
    /// unknown mode string fails the **entire project list** with [`ConfigError::Parse`] —
    /// it is not scoped to the offending record, and the picker would present as empty
    /// rather than as "one project lost its mode".
    ///
    /// **Why the WP4b rename was nonetheless migration-free:** the field had never been
    /// written by any code path (its own doc comment said "never read or written", and
    /// both the real `com.claudesk.app` and `com.claudesk.app.dev` stores were checked at
    /// rename time — **0 occurrences of `default_drive_mode` in either**). So no on-disk
    /// value could exist in the old vocabulary. This test exists so that fact is recorded
    /// as a *measurement* rather than an assumption, and so the failure mode is pinned
    /// **before** the field has real users: the moment modes are actually being persisted,
    /// any future vocabulary change is a breaking migration and needs a lenient reader or
    /// a version bump, not another rename.
    #[test]
    fn an_unknown_drive_mode_string_fails_the_whole_project_list() {
        let dir = TempDir::new().unwrap();
        // The pre-WP4b wire value, i.e. exactly what a file written by an older build
        // would have carried had the field ever been written.
        std::fs::write(
            dir.path().join(PROJECTS_FILE),
            br#"[{"path":"/a","last_opened_at":1,"default_drive_mode":"full-autopilot"},
                {"path":"/b","last_opened_at":2}]"#,
        )
        .unwrap();

        let err = read_projects(dir.path()).unwrap_err();
        assert!(
            matches!(err, ConfigError::Parse(_)),
            "expected a Parse error, got {err:?}"
        );
        // ⚠️ Note what is NOT asserted: that project `/b` survives. It does not — the
        // whole read fails. That is the blast radius this test documents.
    }

    /// Pins the P1.4 doc corrections so they cannot silently regress.
    ///
    /// M12 WP4b removed two stale claims about [`Project::default_drive_mode`] — *"Never read
    /// or written"* and a *"Reserved for Phase 2 (WP15 …)"* reference to a numbering that no
    /// longer exists — plus a third found during the same pass: `default_model`'s own comment
    /// described the drive-mode field as a never-read placeholder, which this WP made false.
    ///
    /// **Why a test rather than trusting the edit:** these were verified once by a one-off
    /// `grep` at verify-auto, and nothing pinned the result. A doc claim that reverts is
    /// invisible to every other gate in this repo — `tsc`, clippy, and 810 passing tests are
    /// all indifferent to a comment — yet this particular class of claim is load-bearing: a
    /// future reader who trusts *"never read or written"* will mis-plan, which is precisely
    /// how WP4b's own task 4b.1 came to be written on a false premise.
    ///
    /// ⚠️ **This asserts an ABSENCE, and that direction is deliberate.** This repo has a
    /// logged failure mode where a source-text guard asserting a bare *identifier* is
    /// satisfied by the module's **own comments**, so it passes exactly when the code it
    /// names has been deleted (`[[raw-guard-identifier-satisfied-by-own-comments]]`). An
    /// absence assertion cannot be falsely satisfied that way: a comment mentioning the
    /// forbidden phrase makes this test FAIL, not pass.
    ///
    /// ⚠️ **The scope is the FIELD DOCS, not the whole file — and that narrowing was forced
    /// by this test failing on its first run.** Two test docs in this module (this one, and
    /// `an_unknown_drive_mode_string_fails_the_whole_project_list`) legitimately *quote* the
    /// retired phrasing to explain what changed; a whole-file scan cannot tell a historical
    /// quote from a live claim. So the haystack is the `Project` struct's field docs — the
    /// only place where the phrase would be an assertion about current behavior. ⚠️ Note the
    /// verify-auto `grep -c "Never read or written\|WP15"` returned **0** on this same file
    /// while a **lowercase** instance sat at line 628: the grep was case-sensitive and the
    /// quote is lowercase. Two independent runs of that grep agreed, and both were blind the
    /// same way — which is the argument for pinning this in a test with an explicit haystack
    /// rather than re-running a one-off grep.
    ///
    /// Per `CLAUDE.md`, a source-text guard verifies STRUCTURE, never RUNTIME. Used narrowly
    /// and honestly here: it is a tripwire against a stale claim returning, not a proof that
    /// the surviving prose is accurate.
    #[test]
    fn the_retired_drive_mode_doc_claims_do_not_come_back() {
        let src = include_str!("mod.rs");

        // Haystack = the `Project` struct definition only, where a claim about the field's
        // readership would be a live assertion rather than a historical quote in a test doc.
        let start = src
            .find("pub struct Project {")
            .expect("the Project struct declaration moved; re-scope this guard");
        let end = src[start..]
            .find("\n}")
            .map(|rel| start + rel)
            .expect("could not find the end of the Project struct");
        let field_docs = &src[start..end];

        for stale in [
            // The two claims P1.4 removed from `default_drive_mode`'s own doc comment.
            // Matched case-insensitively — see the doc comment above for why.
            "never read or written",
            "reserved for phase 2",
            // The pre-M12 WP numbering the second claim referenced.
            "wp15",
        ] {
            assert!(
                !field_docs.to_lowercase().contains(stale),
                "the retired doc claim {stale:?} is back in `Project`'s field docs. \
                 `default_drive_mode` has been LIVE since M12 WP4b (written by \
                 set_default_drive_mode, read at spawn to compose CLAUDESK_DRIVE_MODE). \
                 If you are re-adding this text, the field's readership genuinely changed — \
                 update the field docs and this test together."
            );
        }

        // The inverse half: the corrected claim must actually be present IN THE FIELD DOCS.
        // Absence-only would pass on a file that deleted the documentation entirely — and,
        // now that the haystack is a slice, it would also pass on a mis-scoped empty slice.
        assert!(
            field_docs.contains("LIVE since M12 WP4b"),
            "default_drive_mode's field doc no longer states that the field is live; the \
             absence assertions above would then be vacuously satisfied."
        );
        // Meta-guard against the haystack silently becoming useless: the slice must actually
        // contain the field it is about. Cheap, and it is the failure mode a `find`-based
        // window has (a moved declaration yields a valid-but-wrong slice).
        assert!(
            field_docs.contains("pub default_drive_mode"),
            "the guard's haystack no longer contains the default_drive_mode field — \
             re-scope it; every assertion above is vacuous as written."
        );
    }

    // ── Paydown WP8 — the funnel must be the ONLY write path ─────────────────────────
    //
    // ⚠️ WHY A GUARD AND NOT JUST THE FUNNEL. The standing lesson in this repo is that
    // extracting a correct mechanism proves the MECHANISM, not that callers use it — hit
    // four times here, once shipped as a CRITICAL (`docs/lessons/verify-self-tiers.md` §4).
    // `update_projects`/`update_settings` can be perfectly correct while a thirteenth mutator
    // is added next month that calls `write_projects` directly and silently re-opens both the
    // lost update and the shared-tmp `ENOENT` race. That regression is invisible to every
    // other test, because each individual write still works.

    /// Strip Rust comments so a guard is not satisfied by the very prose that describes it.
    ///
    /// ⚠️ Load-bearing here: the funnel's own doc comments name `write_projects` and
    /// `write_settings` repeatedly (they must, to say "only this may call them"), so an
    /// unstripped haystack would match those mentions and the guard would pass **exactly when
    /// the funnel was deleted** (`[[raw-guard-identifier-satisfied-by-own-comments]]`).
    fn strip_rust_comments(src: &str) -> String {
        let mut out = String::with_capacity(src.len());
        let mut rest = src;
        loop {
            // Block comments first, then line comments; whichever comes first wins.
            let block = rest.find("/*");
            let line = rest.find("//");
            // Whichever delimiter appears first decides; `None` sorts last.
            let block_first = match (block, line) {
                (Some(b), Some(l)) => b < l,
                (Some(_), None) => true,
                _ => false,
            };
            if block_first {
                let b = block.expect("block_first implies Some");
                out.push_str(&rest[..b]);
                rest = match rest[b + 2..].find("*/") {
                    Some(e) => &rest[b + 2 + e + 2..],
                    None => return out,
                };
            } else if let Some(l) = line {
                out.push_str(&rest[..l]);
                rest = match rest[l..].find('\n') {
                    Some(e) => &rest[l + e..],
                    None => return out,
                };
            } else {
                out.push_str(rest);
                return out;
            }
        }
    }

    /// The set of `fn` bodies in a module that call `needle(`, excluding `#[cfg(test)]` code.
    fn callers_of(src: &str, needle: &str) -> Vec<String> {
        let code = strip_rust_comments(src);
        // Everything before `mod tests` — test code may legitimately call the primitives.
        let prod = match code.find("mod tests {") {
            Some(i) => &code[..i],
            None => &code[..],
        };
        let mut found = Vec::new();
        let mut current = String::from("<module scope>");
        for line in prod.lines() {
            let t = line.trim_start();
            if let Some(rest) = t
                .strip_prefix("pub(crate) fn ")
                .or_else(|| t.strip_prefix("pub fn ").or_else(|| t.strip_prefix("fn ")))
            {
                current = rest
                    .split(['(', '<'])
                    .next()
                    .unwrap_or("?")
                    .trim()
                    .to_string();
            }
            if t.contains(&format!("{needle}(")) && !t.starts_with('#') {
                found.push(current.clone());
            }
        }
        found
    }

    #[test]
    fn only_the_funnel_writes_the_project_list() {
        let callers = callers_of(include_str!("mod.rs"), "write_projects");
        // The funnel is the only legitimate caller. `write_projects` itself appears as its own
        // definition line, which `callers_of` attributes to `write_projects` — allow that.
        let unexpected: Vec<_> = callers
            .iter()
            .filter(|f| f.as_str() != "update_projects" && f.as_str() != "write_projects")
            .collect();
        assert!(
            unexpected.is_empty(),
            "these fns call write_projects directly instead of going through update_projects, \
             which re-opens the lost update AND the shared-tmp ENOENT race: {unexpected:?}"
        );
    }

    #[test]
    fn only_the_funnel_writes_the_settings_file() {
        let callers = callers_of(include_str!("settings.rs"), "write_settings");
        // In `settings.rs` the only permitted mention is `write_settings`'s own definition;
        // every mutator must route through `update_settings` (which lives in `mod.rs`).
        let unexpected: Vec<_> = callers
            .iter()
            .filter(|f| f.as_str() != "write_settings")
            .collect();
        assert!(
            unexpected.is_empty(),
            "these fns in settings.rs call write_settings directly instead of update_settings: \
             {unexpected:?}"
        );
    }

    #[test]
    fn the_funnel_guard_is_not_vacuous() {
        // ⚠️ The anti-vacuity arm. If `callers_of` silently found nothing — a renamed helper, an
        // over-eager comment strip, a changed `fn` prefix — both guards above would pass while
        // checking nothing. Prove the walker actually resolves a known caller.
        let found = callers_of(include_str!("mod.rs"), "read_projects");
        assert!(
            found.iter().any(|f| f == "update_projects"),
            "the walker cannot see update_projects calling read_projects; it is broken, so the \
             two guards above are not checking anything. Found: {found:?}"
        );
        // And the comment stripper must really remove prose that names the primitives.
        let stripped = strip_rust_comments("// write_projects(x)\nlet y = 1;");
        assert!(
            !stripped.contains("write_projects"),
            "strip_rust_comments left a commented mention in place"
        );
    }

    /// M12 WP4c Phase 2 — the two drive-mode accessors must stay free of
    /// `#[allow(dead_code)]` now that both their named consumers exist.
    ///
    /// ⚠️ **This guards a blind spot in the ledger's own close condition.** That condition is
    /// *"`clippy --all-targets -- -D warnings` passes with the attribute absent"* — but a
    /// **stale** attribute suppresses precisely the warning that would flag it, so clippy
    /// passes just as happily *with* it present. Nothing in the gate fails; the attribute just
    /// misinforms the next reader about whether the code is live.
    ///
    /// That is not hypothetical: `read_default_drive_mode` kept its attribute for a whole WP
    /// **after** `resolve_cc_spawn_env` (`cc_session/mod.rs`, production code on the CC spawn
    /// path) became its real caller at WP4b Phase 2. It read as "not called yet" while being
    /// load-bearing for the entire drive-mode signal, and was only caught at WP4c verify-self
    /// by counting attributes instead of trusting the module header's prose.
    /// (`SURFACE-2026-08-10-ALLOW-DEAD-CODE-OUTLIVING-ITS-CONSUMER-IS-INVISIBLE-TO-THE-GATE`)
    ///
    /// ⚠️ **Deliberately scoped to these two functions, NOT crate-wide.** A crate-wide
    /// "no `#[allow(dead_code)]`" assertion would be wrong: `reclassify/mod.rs` carries 9 of
    /// them, each **legitimately** attributed to a consumer that genuinely has not landed
    /// ("the WP6 palette consumer of `Kind::family` hasn't landed — test-only"). The defect
    /// being guarded is **staleness**, not presence, and only a named-item check can tell those
    /// apart. Extend this list when a *new* accessor here gains a live consumer.
    #[test]
    fn the_live_drive_mode_accessors_carry_no_dead_code_allowance() {
        let src = include_str!("mod.rs");

        for (func, consumer) in [
            (
                "pub fn read_default_drive_mode(",
                "resolve_cc_spawn_env in cc_session/mod.rs (the CC spawn path)",
            ),
            (
                "pub fn set_default_drive_mode(",
                "commands::project_set_default_drive_mode (the picker cell's write path)",
            ),
        ] {
            let at = src
                .find(func)
                .unwrap_or_else(|| panic!("{func} moved or was renamed; re-scope this guard"));

            // Look back over the item's attributes + doc comment. 1200 bytes covers a long
            // doc block without reaching the previous item's attributes.
            let window_start = at.saturating_sub(1200);
            let preamble = &src[window_start..at];

            // Only an ATTRIBUTE counts — the doc comments above these fns discuss
            // `#[allow(dead_code)]` at length (explaining why it was removed), so a bare
            // substring search would be satisfied by the very prose describing its absence
            // (`[[raw-guard-identifier-satisfied-by-own-comments]]`). Strip doc/line comments
            // first, then look for the attribute on its own line.
            let code_only: String = preamble
                .lines()
                .filter(|l| {
                    let t = l.trim_start();
                    !t.starts_with("///") && !t.starts_with("//!") && !t.starts_with("//")
                })
                .collect::<Vec<_>>()
                .join("\n");

            assert!(
                !code_only.contains("#[allow(dead_code)]"),
                "{func} carries #[allow(dead_code)], but its named consumer EXISTS: {consumer}. \
                 A stale allowance is invisible to `clippy -D warnings` (it suppresses the very \
                 warning that would flag it), so nothing fails — it only misleads the next \
                 reader into thinking this code is unused. Remove the attribute; if clippy then \
                 reports it as genuinely dead, the consumer regressed and THAT is the bug."
            );
        }

        // Meta-guard: prove the comment-stripping above cannot make this vacuous. A synthetic
        // preamble containing the attribute as real code must be detected — otherwise a filter
        // bug would silently pass every case.
        let synthetic = "/// #[allow(dead_code)] in a doc comment\n#[allow(dead_code)]\n";
        let stripped: String = synthetic
            .lines()
            .filter(|l| {
                let t = l.trim_start();
                !t.starts_with("///") && !t.starts_with("//!") && !t.starts_with("//")
            })
            .collect::<Vec<_>>()
            .join("\n");
        assert!(
            stripped.contains("#[allow(dead_code)]"),
            "the comment filter dropped a REAL attribute line; this guard would be vacuous"
        );
        assert!(
            !stripped.contains("in a doc comment"),
            "the comment filter failed to strip a doc line; this guard would false-positive"
        );
    }

    #[test]
    fn empty_list_round_trips() {
        // Removing the last project leaves an explicitly-empty list on disk —
        // distinct from the missing-file path. Writing [] then reading must
        // yield [], not an error and not the missing-file fallback masking a
        // real empty file.
        let dir = TempDir::new().unwrap();
        write_projects(dir.path(), &[]).unwrap();
        assert!(dir.path().join(PROJECTS_FILE).exists());
        let read = read_projects(dir.path()).unwrap();
        assert!(read.is_empty());
    }

    #[test]
    fn add_or_touch_returns_record_with_refreshed_timestamp() {
        // The returned record (not just the persisted list) is the API contract
        // a caller relies on to reflect new recency immediately. On a touch of an
        // existing path, the returned record carries the new timestamp and the
        // original display_name.
        let dir = TempDir::new().unwrap();
        let first = add_or_touch(dir.path(), PathBuf::from("/r/proj"), 100).unwrap();
        assert_eq!(first.last_opened_at, 100);
        assert_eq!(first.display_name.as_deref(), Some("proj"));

        let touched = add_or_touch(dir.path(), PathBuf::from("/r/proj"), 500).unwrap();
        assert_eq!(touched.last_opened_at, 500);
        // display_name is preserved across a touch, not re-derived/cleared.
        assert_eq!(touched.display_name.as_deref(), Some("proj"));
    }

    #[test]
    fn prune_missing_drops_gone_paths_keeps_present_and_returns_dropped() {
        let dir = TempDir::new().unwrap();
        // Two real subdirectories that exist on disk, one path that does not.
        let alive_a = dir.path().join("alive-a");
        let alive_b = dir.path().join("alive-b");
        std::fs::create_dir(&alive_a).unwrap();
        std::fs::create_dir(&alive_b).unwrap();
        let gone = dir.path().join("deleted-since");

        write_projects(
            dir.path(),
            &[
                p(alive_a.to_str().unwrap(), 100),
                p(gone.to_str().unwrap(), 200),
                p(alive_b.to_str().unwrap(), 300),
            ],
        )
        .unwrap();

        let dropped = prune_missing(dir.path()).unwrap();
        // The one missing path is returned as dropped...
        assert_eq!(dropped.len(), 1);
        assert_eq!(dropped[0].path, gone);
        // ...and the persisted list now holds only the two that exist.
        let remaining = read_projects(dir.path()).unwrap();
        assert_eq!(remaining.len(), 2);
        assert!(remaining.iter().all(|r| r.path != gone));
    }

    #[test]
    fn prune_missing_is_noop_when_all_present() {
        let dir = TempDir::new().unwrap();
        let alive = dir.path().join("alive");
        std::fs::create_dir(&alive).unwrap();
        write_projects(dir.path(), &[p(alive.to_str().unwrap(), 100)]).unwrap();

        // Capture the file's bytes; a no-drop prune must not rewrite the file.
        let before = std::fs::read(dir.path().join(PROJECTS_FILE)).unwrap();
        let dropped = prune_missing(dir.path()).unwrap();
        assert!(dropped.is_empty());
        let after = std::fs::read(dir.path().join(PROJECTS_FILE)).unwrap();
        assert_eq!(before, after, "no drops → no rewrite");
    }

    #[test]
    fn prune_missing_on_empty_store_is_empty_and_ok() {
        let dir = TempDir::new().unwrap();
        // No projects.json yet (first run) — prune returns nothing, no error.
        let dropped = prune_missing(dir.path()).unwrap();
        assert!(dropped.is_empty());
    }

    #[test]
    fn project_serializes_path_as_project_path_for_frontend_contract() {
        // The IPC payload field name is load-bearing: the frontend RecentProject
        // type reads `project_path`. A rename of this serde attribute would
        // silently break the picker. Pin it.
        let json = serde_json::to_string(&p("/x/repo", 1)).unwrap();
        assert!(
            json.contains("\"project_path\""),
            "path must serialize as project_path, got: {json}"
        );
        assert!(!json.contains("\"path\""));
    }

    // --- M11.5 WP1: per-project CC model override ---------------------------------
    //
    // The load-bearing property across this block is that UNSET is indistinguishable
    // on disk from pre-WP1: no key, no `null`. Every existing projects.json must
    // round-trip byte-identically for a user who never touches the control.

    #[test]
    fn unset_default_model_key_is_absent_from_serialized_json() {
        let json = serde_json::to_string(&p("/x/repo", 1)).unwrap();
        assert!(
            !json.contains("default_model"),
            "an unset override must not appear on disk at all (not even as null), got: {json}"
        );
    }

    #[test]
    fn legacy_file_without_default_model_key_parses_as_none() {
        // Forward-compat: a projects.json written by any pre-M11.5 build has no such
        // key. It must parse, not error, and read as "inherit CC's default".
        let dir = TempDir::new().unwrap();
        std::fs::write(
            dir.path().join(PROJECTS_FILE),
            r#"[{"project_path":"/a/one","last_opened_at":100,"display_name":"one"}]"#,
        )
        .unwrap();
        let projects = read_projects(dir.path()).unwrap();
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].default_model, None);
    }

    #[test]
    fn set_default_model_then_read_returns_the_value() {
        let dir = TempDir::new().unwrap();
        write_projects(dir.path(), &[p("/a/one", 100)]).unwrap();
        set_default_model(dir.path(), Path::new("/a/one"), Some("opus".into())).unwrap();
        assert_eq!(
            read_default_model(dir.path(), Path::new("/a/one")).unwrap(),
            Some("opus".to_string())
        );
    }

    #[test]
    fn set_default_model_accepts_a_model_that_does_not_exist_yet() {
        // Forward-compatibility, asked about directly by the operator at Phase 3
        // verify-human: *"what would happen if CC introduced a new model?"*
        //
        // The answer must be "it just works", and this is the layer where that is most
        // likely to be broken by a well-meaning addition — the store is the natural place
        // someone would slip in a "sanity check" against a known-models list. The sibling
        // test below uses `claude-fable-5`, which exists TODAY, so it would keep passing
        // against a validator seeded with today's models. This one cannot: the value is
        // deliberately not a real model and not in `MODEL_ALIAS_HINTS`.
        //
        // Any validation added here — an allowlist, a regex on the ID shape, a prefix
        // check — fails this test. That is the point.
        let dir = TempDir::new().unwrap();
        write_projects(dir.path(), &[p("/a/one", 100)]).unwrap();
        set_default_model(
            dir.path(),
            Path::new("/a/one"),
            Some("claude-nonexistent-model-from-the-future-9".into()),
        )
        .unwrap();
        assert_eq!(
            read_default_model(dir.path(), Path::new("/a/one")).unwrap(),
            Some("claude-nonexistent-model-from-the-future-9".to_string()),
            "an unrecognized model must round-trip verbatim — CC adjudicates usability \
             (including entitlements, which no local list can know), not Claudesk"
        );
    }

    #[test]
    fn set_default_model_accepts_a_full_model_id_verbatim() {
        // The probe established an OPEN value set (alias OR full ID) and that CC — not
        // Claudesk — adjudicates usability. Nothing here may normalize or reject shapes.
        let dir = TempDir::new().unwrap();
        write_projects(dir.path(), &[p("/a/one", 100)]).unwrap();
        set_default_model(
            dir.path(),
            Path::new("/a/one"),
            Some("claude-fable-5".into()),
        )
        .unwrap();
        assert_eq!(
            read_default_model(dir.path(), Path::new("/a/one")).unwrap(),
            Some("claude-fable-5".to_string())
        );
    }

    #[test]
    fn clearing_default_model_removes_the_key_rather_than_writing_null() {
        let dir = TempDir::new().unwrap();
        write_projects(dir.path(), &[p("/a/one", 100)]).unwrap();
        set_default_model(dir.path(), Path::new("/a/one"), Some("opus".into())).unwrap();
        set_default_model(dir.path(), Path::new("/a/one"), None).unwrap();

        let raw = std::fs::read_to_string(dir.path().join(PROJECTS_FILE)).unwrap();
        assert!(
            !raw.contains("default_model"),
            "clearing must return the file to its unset shape, got: {raw}"
        );
        assert_eq!(
            read_default_model(dir.path(), Path::new("/a/one")).unwrap(),
            None
        );
    }

    #[test]
    fn set_default_model_normalizes_blank_and_whitespace_to_unset() {
        let dir = TempDir::new().unwrap();
        write_projects(dir.path(), &[p("/a/one", 100)]).unwrap();

        set_default_model(dir.path(), Path::new("/a/one"), Some("   ".into())).unwrap();
        assert_eq!(
            read_default_model(dir.path(), Path::new("/a/one")).unwrap(),
            None,
            "whitespace-only must mean unset, never an argv token CC would reject"
        );

        set_default_model(dir.path(), Path::new("/a/one"), Some("  opus  ".into())).unwrap();
        assert_eq!(
            read_default_model(dir.path(), Path::new("/a/one")).unwrap(),
            Some("opus".to_string()),
            "a padded value is trimmed, not stored with its padding"
        );
    }

    #[test]
    fn set_default_model_on_one_project_leaves_every_field_of_the_others_untouched() {
        // Named for exactly what it asserts (per the overstated-assertion class this
        // repo has hit three times): it compares the FULL sibling records, not one field.
        let dir = TempDir::new().unwrap();
        let mut other = p("/b/two", 200);
        other.default_model = Some("sonnet".into());
        other.default_drive_mode = Some(DriveMode::Autopilot);
        let untouched = p("/c/three", 300);
        write_projects(
            dir.path(),
            &[p("/a/one", 100), other.clone(), untouched.clone()],
        )
        .unwrap();

        set_default_model(dir.path(), Path::new("/a/one"), Some("opus".into())).unwrap();

        let after = read_projects(dir.path()).unwrap();
        let find = |path: &str| {
            after
                .iter()
                .find(|p| p.path == Path::new(path))
                .unwrap()
                .clone()
        };
        assert_eq!(
            find("/b/two"),
            other,
            "sibling record must be byte-identical"
        );
        assert_eq!(find("/c/three"), untouched);
        assert_eq!(after.len(), 3, "no project may be added or dropped");
        assert_eq!(find("/a/one").default_model, Some("opus".to_string()));
        assert_eq!(
            find("/a/one").display_name,
            Some("one".to_string()),
            "the target's own other fields must also survive"
        );
        assert_eq!(find("/a/one").last_opened_at, 100);
    }

    /// M12 WP1 Verdict (a) — the fact that disqualified storing the unclean-exit flag on
    /// [`Project`]. Pinned as a test because the verdict *reasons from it*, and a future
    /// refactor that made `projects.json` writes per-record would silently invalidate the
    /// recorded rejection without anything failing.
    ///
    /// The property: [`write_projects`] serializes the WHOLE slice, so two interleaved
    /// read-modify-write callers **lose each other's edits** — last `rename` wins. (The
    /// sequential case is covered separately by
    /// `set_default_model_on_one_project_leaves_every_field_of_the_others_untouched`.)
    ///
    /// ⚠️ This test asserts the hazard EXISTS. It is not aspirational — if a future change
    /// serializes writers or adds per-record writes, this test SHOULD fail, and the correct
    /// response is to update `SURFACE-2026-08-03-PROJECTS-JSON-WRITERS-ARE-WHOLE-FILE-RMW`
    /// and Verdict (a)'s "Reopening condition", not to delete the test.
    #[test]
    fn interleaved_whole_file_writes_lose_the_earlier_writers_edit() {
        let dir = TempDir::new().unwrap();
        write_projects(dir.path(), &[p("/a/one", 100), p("/b/two", 200)]).unwrap();

        // Writer A and writer B both snapshot the SAME pre-state — the interleaving a
        // single user action produces today.
        let mut snapshot_a = read_projects(dir.path()).unwrap();
        let mut snapshot_b = read_projects(dir.path()).unwrap();

        // Writer A stamps recency on /a/one (what `add_or_touch` does on open).
        snapshot_a
            .iter_mut()
            .find(|proj| proj.path == Path::new("/a/one"))
            .unwrap()
            .last_opened_at = 999;
        write_projects(dir.path(), &snapshot_a).unwrap();

        // Writer B sets a per-project field on the SAME record from its stale snapshot
        // (standing in for the unclean flag). `default_model` is used only because it is a
        // real per-project field — the hazard is about the write path, not the field.
        snapshot_b
            .iter_mut()
            .find(|proj| proj.path == Path::new("/a/one"))
            .unwrap()
            .default_model = Some("opus".into());
        write_projects(dir.path(), &snapshot_b).unwrap();

        let after = read_projects(dir.path()).unwrap();
        let target = after
            .iter()
            .find(|proj| proj.path == Path::new("/a/one"))
            .unwrap();

        // B's write landed...
        assert_eq!(
            target.default_model,
            Some("opus".to_string()),
            "last writer's own edit survives"
        );
        // ...and it DISCARDED A's, because B wrote a whole list built from a stale read.
        assert_eq!(
            target.last_opened_at, 100,
            "THE HAZARD: writer A's recency stamp was silently lost — this is why the \
             M12 unclean flag does NOT live on `Project` (Verdict (a)). If this assertion \
             starts failing, `projects.json` writes are no longer whole-file RMW and \
             Verdict (a)'s reopening condition has been met."
        );
    }

    #[test]
    fn read_default_model_for_an_unknown_path_is_none_not_an_error() {
        let dir = TempDir::new().unwrap();
        write_projects(dir.path(), &[p("/a/one", 100)]).unwrap();
        // "No record" and "record with no override" are deliberately the same answer:
        // the spawn call site treats both as inherit-CC's-default.
        assert_eq!(
            read_default_model(dir.path(), Path::new("/nope")).unwrap(),
            None
        );
    }

    #[test]
    fn read_default_model_on_a_missing_store_is_none_not_an_error() {
        let dir = TempDir::new().unwrap();
        // First run: no projects.json at all. Must not error a spawn.
        assert_eq!(
            read_default_model(dir.path(), Path::new("/a/one")).unwrap(),
            None
        );
    }

    #[test]
    fn set_default_model_on_an_unknown_path_is_an_error() {
        let dir = TempDir::new().unwrap();
        write_projects(dir.path(), &[p("/a/one", 100)]).unwrap();
        // Unlike the reader, a write with nowhere to land must NOT report success —
        // that would present as a value that vanishes on the next read.
        let err = set_default_model(dir.path(), Path::new("/nope"), Some("opus".into()));
        assert!(err.is_err());
    }

    // ---- M12 WP4b: default_drive_mode accessors ----------------------------------
    // Mirrors of the default_model accessor tests above. The two fields deliberately
    // share a STORAGE posture (verbatim path compare, lenient read, strict write,
    // key-absent-when-unset) and deliberately do NOT share a CONSUMPTION posture —
    // model terminates in argv, mode terminates in an env var. See the field's docs.

    #[test]
    fn set_default_drive_mode_then_read_returns_the_value() {
        let dir = TempDir::new().unwrap();
        write_projects(dir.path(), &[p("/a/one", 100)]).unwrap();
        set_default_drive_mode(dir.path(), Path::new("/a/one"), Some(DriveMode::Autopilot))
            .unwrap();
        assert_eq!(
            read_default_drive_mode(dir.path(), Path::new("/a/one")).unwrap(),
            Some(DriveMode::Autopilot)
        );
    }

    #[test]
    fn set_default_drive_mode_round_trips_all_four_modes_through_disk() {
        // Not a symmetry check — each mode is written, re-read from an actual file, AND
        // its on-disk STRING is asserted against the transcribed vocabulary. The
        // serializer test proves the mapping; this proves the mapping survives the store.
        for (mode, wire) in [
            (DriveMode::StepByStep, "stepping"),
            (DriveMode::Orchestrated, "orchestrated"),
            (DriveMode::Autopilot, "autopilot"),
            (DriveMode::FullAutopilot, "fsd"),
        ] {
            let dir = TempDir::new().unwrap();
            write_projects(dir.path(), &[p("/a/one", 100)]).unwrap();
            set_default_drive_mode(dir.path(), Path::new("/a/one"), Some(mode)).unwrap();

            assert_eq!(
                read_default_drive_mode(dir.path(), Path::new("/a/one")).unwrap(),
                Some(mode)
            );
            let raw = std::fs::read_to_string(dir.path().join(PROJECTS_FILE)).unwrap();
            assert!(
                raw.contains(&format!("\"default_drive_mode\": \"{wire}\"")),
                "expected {mode:?} to persist as {wire:?}; file was:\n{raw}"
            );
        }
    }

    #[test]
    fn clearing_the_drive_mode_removes_the_key_rather_than_writing_null() {
        // "Absent" is the inert state that keeps a plain-terminal `claude` byte-identical,
        // so a cleared mode must be indistinguishable from a never-set one on disk.
        let dir = TempDir::new().unwrap();
        write_projects(dir.path(), &[p("/a/one", 100)]).unwrap();
        set_default_drive_mode(dir.path(), Path::new("/a/one"), Some(DriveMode::Autopilot))
            .unwrap();
        set_default_drive_mode(dir.path(), Path::new("/a/one"), None).unwrap();

        let raw = std::fs::read_to_string(dir.path().join(PROJECTS_FILE)).unwrap();
        assert!(
            !raw.contains("default_drive_mode"),
            "cleared mode should leave no key at all; file was:\n{raw}"
        );
        assert!(
            !raw.contains("null"),
            "must not write null; file was:\n{raw}"
        );
        assert_eq!(
            read_default_drive_mode(dir.path(), Path::new("/a/one")).unwrap(),
            None
        );
    }

    /// M12 WP4c P2.2 — the drive mode must reach the FRONTEND, not merely disk.
    ///
    /// Every other drive-mode test above asserts the **disk** round-trip. None asserted
    /// what `list_projects` actually hands the webview, which is the property the picker
    /// cell's seed depends on: it reads `r.default_drive_mode` off the `recents` array
    /// rather than issuing a per-row IPC read.
    ///
    /// ⚠️ **Why the absence of a read command is the DESIGN, not an omission.** M11.5's
    /// repair (B) deleted a per-row `project_get_default_model` fetch because each call
    /// re-read + re-parsed + re-sorted the entire `projects.json` to obtain one field
    /// `list_projects` had **already** put on the wire — and because filtered-out rows
    /// unmount, clearing the filter box re-fired all N
    /// (`SURFACE-2026-07-31-QUALITY-WP1-PER-ROW-IPC-REFETCHES-DATA-ALREADY-ON-THE-WIRE`).
    /// This test is what makes the wire-seed path safe to rely on, so nobody "fixes" the
    /// missing getter by re-introducing that N+1.
    ///
    /// Asserts the serialized JSON directly rather than a Rust round-trip: a
    /// `#[serde(skip_serializing_if)]` typo or a stray `#[serde(skip)]` would keep the Rust
    /// struct field working while the value silently never left the process.
    #[test]
    fn the_drive_mode_is_serialized_onto_the_list_projects_wire() {
        let mut project = p("/a/one", 100);
        project.default_drive_mode = Some(DriveMode::FullAutopilot);

        // `list_projects` returns `Vec<Project>` verbatim, so serializing the vec IS the
        // wire payload the frontend receives.
        let wire = serde_json::to_string(&vec![project]).unwrap();
        assert!(
            wire.contains(r#""default_drive_mode":"fsd""#),
            "the drive mode must be present on the wire for the picker cell to seed from \
             `recents` (NOT via a per-row read command — see this test's docs); payload was:\n{wire}"
        );

        // …and an unset mode omits the key entirely rather than sending `null`, so the
        // frontend's `?? null` seed and a project predating the feature are one code path.
        let unset = serde_json::to_string(&vec![p("/a/two", 100)]).unwrap();
        assert!(
            !unset.contains("default_drive_mode"),
            "an unset mode must omit the key from the wire; payload was:\n{unset}"
        );
    }

    #[test]
    fn read_default_drive_mode_for_an_unknown_path_is_none_not_an_error() {
        let dir = TempDir::new().unwrap();
        write_projects(dir.path(), &[p("/a/one", 100)]).unwrap();
        assert_eq!(
            read_default_drive_mode(dir.path(), Path::new("/nope")).unwrap(),
            None
        );
    }

    #[test]
    fn read_default_drive_mode_on_a_missing_store_is_none_not_an_error() {
        let dir = TempDir::new().unwrap();
        // First run: no projects.json. Must not error a spawn — an absent mode is inert.
        assert_eq!(
            read_default_drive_mode(dir.path(), Path::new("/a/one")).unwrap(),
            None
        );
    }

    #[test]
    fn set_default_drive_mode_on_an_unknown_path_is_an_error() {
        let dir = TempDir::new().unwrap();
        write_projects(dir.path(), &[p("/a/one", 100)]).unwrap();
        let err =
            set_default_drive_mode(dir.path(), Path::new("/nope"), Some(DriveMode::Autopilot));
        assert!(err.is_err());
    }

    #[test]
    fn set_default_drive_mode_leaves_the_model_override_untouched_and_vice_versa() {
        // The two settings share one column in the picker cell (WP4a Verdict (f)) and one
        // whole-file writer. Setting either must not disturb the other.
        let dir = TempDir::new().unwrap();
        write_projects(dir.path(), &[p("/a/one", 100)]).unwrap();
        set_default_model(dir.path(), Path::new("/a/one"), Some("opus".into())).unwrap();
        set_default_drive_mode(dir.path(), Path::new("/a/one"), Some(DriveMode::StepByStep))
            .unwrap();

        assert_eq!(
            read_default_model(dir.path(), Path::new("/a/one")).unwrap(),
            Some("opus".to_string())
        );
        set_default_model(dir.path(), Path::new("/a/one"), None).unwrap();
        assert_eq!(
            read_default_drive_mode(dir.path(), Path::new("/a/one")).unwrap(),
            Some(DriveMode::StepByStep),
            "clearing the model must not clear the mode sharing its column"
        );
    }

    #[test]
    fn add_or_touch_preserves_an_existing_projects_drive_mode() {
        // The exact hazard the model field's sibling test guards, and the reason
        // SURFACE-2026-08-03-PROJECTS-JSON-WRITERS-ARE-WHOLE-FILE-RMW matters here:
        // add_or_touch runs on EVERY project open and rebuilds the record.
        let dir = TempDir::new().unwrap();
        write_projects(dir.path(), &[p("/a/one", 100)]).unwrap();
        set_default_drive_mode(
            dir.path(),
            Path::new("/a/one"),
            Some(DriveMode::FullAutopilot),
        )
        .unwrap();

        add_or_touch(dir.path(), PathBuf::from("/a/one"), 200).unwrap();

        assert_eq!(
            read_default_drive_mode(dir.path(), Path::new("/a/one")).unwrap(),
            Some(DriveMode::FullAutopilot),
            "a project open must not drop the drive mode"
        );
    }

    #[test]
    fn add_or_touch_preserves_an_existing_projects_default_model() {
        // add_or_touch runs on every project open. It refreshes last_opened_at and
        // clones the record — so a naive rebuild of the struct would silently drop
        // the override on the very next open.
        let dir = TempDir::new().unwrap();
        write_projects(dir.path(), &[p("/a/one", 100)]).unwrap();
        set_default_model(dir.path(), Path::new("/a/one"), Some("opus".into())).unwrap();

        let touched = add_or_touch(dir.path(), PathBuf::from("/a/one"), 999).unwrap();

        assert_eq!(touched.last_opened_at, 999, "touch still updates recency");
        assert_eq!(
            touched.default_model,
            Some("opus".to_string()),
            "the returned record must carry the override"
        );
        assert_eq!(
            read_default_model(dir.path(), Path::new("/a/one")).unwrap(),
            Some("opus".to_string()),
            "and it must still be on disk after the touch"
        );
    }

    #[test]
    fn add_or_touch_creates_a_new_project_with_no_override() {
        let dir = TempDir::new().unwrap();
        let created = add_or_touch(dir.path(), PathBuf::from("/fresh/repo"), 1).unwrap();
        assert_eq!(
            created.default_model, None,
            "a newly added project inherits CC's default"
        );
    }
}
