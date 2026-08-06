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

pub mod commands;
pub mod settings;

use std::path::{Path, PathBuf};

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
    /// **This is Claudesk's FIRST per-project setting with a live read/write path** —
    /// do not mistake it for the placeholder [`Self::default_drive_mode`] below, which
    /// looks similar and is never read. Written by `set_default_model`, read at spawn
    /// time by `SessionRegistry::spawn` and mapped to CC's `--model` by `build_cc_argv`.
    ///
    /// Stored **verbatim, unvalidated**. `claude --help` documents an open value set
    /// (an alias like `opus`, or a full ID like `claude-fable-5`), and an unusable value
    /// makes CC print its own precise in-session error — which knows about entitlements,
    /// not just existence. A Claudesk-side allowlist would be both less accurate and
    /// guaranteed to reject models released after this build. See the WP1 probe findings.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_model: Option<String>,
    /// Reserved for Phase 2 (WP15 drive-mode selector). Never read or written in
    /// Phase 1 — present so the on-disk shape is forward-stable. **Contrast
    /// [`Self::default_model`] above, which IS live.**
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_drive_mode: Option<DriveMode>,
}

/// The four workflow drive modes. Reserved on [`Project`] for Phase 2; defined
/// now so the field is typed. Serializes to the kebab-case vocabulary the
/// workflow system uses in WIP frontmatter (`drive_mode: autopilot`, etc.).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DriveMode {
    StepByStep,
    Orchestrated,
    Autopilot,
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

/// Add a project if its path is new, or refresh `last_opened_at` if it already
/// exists. Paths are compared verbatim (the frontend supplies canonicalized
/// dialog/dir paths). Returns the resulting record. Persists the full list.
pub fn add_or_touch(data_dir: &Path, path: PathBuf, now_ms: i64) -> Result<Project, ConfigError> {
    let mut projects = read_projects(data_dir)?;
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
    write_projects(data_dir, &projects)?;
    Ok(record)
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
    let mut projects = read_projects(data_dir)?;
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
    write_projects(data_dir, &projects)?;
    Ok(())
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
    let mut projects = read_projects(data_dir)?;
    let before = projects.len();
    projects.retain(|p| p.path != path);
    if projects.len() != before {
        write_projects(data_dir, &projects)?;
    }
    Ok(())
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
    let projects = read_projects(data_dir)?;
    let (kept, dropped): (Vec<Project>, Vec<Project>) =
        projects.into_iter().partition(|p| p.path.exists());
    if !dropped.is_empty() {
        write_projects(data_dir, &kept)?;
    }
    Ok(dropped)
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

    /// ⚠️ **This test pins values that are KNOWN WRONG on 2 of 4 variants.** It is a
    /// tripwire for M12 WP4b, not an endorsement.
    ///
    /// M12 WP4a measured that `DriveMode`'s `kebab-case` serialization disagrees with the
    /// vocabulary every workflow skill actually reads:
    ///
    /// | variant | serializes to | what skills read | |
    /// |---|---|---|---|
    /// | `StepByStep`    | `step-by-step`    | **`stepping`** | ❌ |
    /// | `Orchestrated`  | `orchestrated`    | `orchestrated` | ✓ |
    /// | `Autopilot`     | `autopilot`       | `autopilot`    | ✓ |
    /// | `FullAutopilot` | `full-autopilot`  | **`fsd`**      | ❌ |
    ///
    /// Authority: `transitions.md:165` (*"drive_mode: stepping | orchestrated | autopilot
    /// | fsd"*), `session-handoff/SKILL.md:75`'s writer template, and 29 real archive WIP
    /// files (28 `autopilot`, 1 `orchestrated`).
    ///
    /// **Why pin the wrong values instead of the right ones:** the fix is production work
    /// the operator assigned to **WP4b task 4b.1** (WP4a is a probe; shipping the rename
    /// here would breach its scope guard). A test asserting the *correct* strings would be
    /// red on `main`, which is worse than no test. So this asserts today's reality and
    /// **fails the moment WP4b renames the variants** — at which point WP4b updates the
    /// expectations to `stepping`/`fsd` and deletes this note. That failure is the point:
    /// it makes the rename impossible to forget.
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

        // TODO(M12 WP4b 4b.1): change to ["stepping", "orchestrated", "autopilot", "fsd"]
        // in the same commit as the `#[serde(rename = ...)]` fix.
        assert_eq!(
            observed,
            vec![
                "step-by-step",
                "orchestrated",
                "autopilot",
                "full-autopilot"
            ],
            "DriveMode's serialized vocabulary changed. If WP4b just fixed it, the \
             expectation should now be [stepping, orchestrated, autopilot, fsd] — update \
             it here and drop this test's WRONG-VALUES note."
        );

        // The two that are already correct must STAY correct through the WP4b rename.
        // ⚠️ Asserted BY VARIANT, not by index into `observed`. These were `observed[1]` /
        // `observed[2]` until code review: positional indices into an array built 30 lines
        // above mean a WP4b editor who reorders that array silently changes what these
        // lines pin — while the test keeps passing.
        let wire = |m: DriveMode| {
            serde_json::to_string(&m)
                .unwrap()
                .trim_matches('"')
                .to_string()
        };
        assert_eq!(wire(DriveMode::Orchestrated), "orchestrated");
        assert_eq!(wire(DriveMode::Autopilot), "autopilot");
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
    /// The property: [`write_projects`] serializes the WHOLE slice, so two writers that
    /// each read-modify-write the list **lose each other's edits** — last `rename` wins
    /// entirely. The existing
    /// `set_default_model_on_one_project_leaves_every_field_of_the_others_untouched`
    /// asserts the *sequential* case (read → write → read → write) and passes; it does NOT
    /// cover interleaving, which is what the flag would have hit, because
    /// `record_open`(→`add_or_touch`) and the flag write are co-triggered by ONE click
    /// (`ProjectPicker.tsx:145-146`).
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
