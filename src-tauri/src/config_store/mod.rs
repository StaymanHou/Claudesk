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
    /// Reserved for Phase 2 (WP15 drive-mode selector). Never read or written in
    /// Phase 1 — present so the on-disk shape is forward-stable.
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
            default_drive_mode: None,
        };
        projects.push(project.clone());
        project
    };
    write_projects(data_dir, &projects)?;
    Ok(record)
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
            default_drive_mode: Some(DriveMode::Autopilot),
        }];
        write_projects(dir.path(), &with_mode).unwrap();
        let read = read_projects(dir.path()).unwrap();
        assert_eq!(read[0].default_drive_mode, Some(DriveMode::Autopilot));
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
}
