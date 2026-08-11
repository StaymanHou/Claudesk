//! Tauri command wrappers over the pure [`super`] store functions.
//!
//! These are thin: resolve the real app-data dir from the `AppHandle`, ensure it
//! exists, delegate to the pure store function, and map [`ConfigError`] to a
//! `String` so it can cross the IPC boundary (Tauri requires command errors to
//! be `Serialize`). All persistence logic and ordering live in [`super`]; these
//! wrappers add only the runtime-dependent path resolution and the wall clock.

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager};

use super::{
    add_or_touch, prune_missing, read_default_model, read_projects, remove as remove_project_inner,
    set_default_drive_mode, set_default_model, DriveMode, Project, PROJECTS_FILE,
};

/// Resolve `~/Library/Application Support/<identifier>/` and ensure it exists.
/// `pub(crate)` so the `cc_session` / `pip` command modules share this one
/// definition rather than each keeping a verbatim module-local copy (Theme A dedup).
pub(crate) fn resolve_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("could not resolve app data dir: {e}"))?;
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("could not create app data dir {}: {e}", dir.display()))?;
    Ok(dir)
}

/// One-time seed of the DEV build's `projects.json` from the PROD build's, so the
/// first `pnpm tauri:dev` launch starts with the operator's real project list
/// (dev/prod isolation, 2026-06-24). Best-effort + idempotent:
/// - no-op unless the running identifier ends in `.dev` (prod never seeds);
/// - no-op if the dev `projects.json` already exists (never clobber dev edits);
/// - no-op if the prod `projects.json` doesn't exist (nothing to seed from).
///
/// The prod dir is resolved as a SIBLING of the dev data dir (same parent, prod
/// identifier as the folder name) — `app_data_dir()` returns
/// `…/Application Support/<identifier>/`, so the prod dir is
/// `<parent>/<prod-identifier>/`. Prod's file is the copy SOURCE, never written.
/// Errors are logged, never propagated — seeding must never block launch.
pub fn seed_dev_projects_from_prod(app: &AppHandle) {
    let identifier = app.config().identifier.clone();
    let dev_dir = match resolve_data_dir(app) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("[claudesk] dev projects seed: could not resolve dev data dir: {e}");
            return;
        }
    };
    match seed_dev_projects(&dev_dir, &identifier) {
        Ok(Some((src, dst))) => {
            eprintln!(
                "[claudesk] dev projects seed: copied {} → {}",
                src.display(),
                dst.display()
            )
        }
        Ok(None) => {} // no-op (prod build, already seeded, or no prod list)
        Err(e) => eprintln!("[claudesk] dev projects seed: {e}"),
    }
}

/// Pure-IO core of [`seed_dev_projects_from_prod`], testable with a `TempDir`.
/// Given the resolved dev data dir and the running identifier, copy prod's
/// `projects.json` into the dev dir iff: identifier ends in `.dev`, dev's file is
/// absent, and prod's file exists. Returns `Ok(Some((src, dst)))` when it copied,
/// `Ok(None)` for any no-op branch, `Err` only on a real copy failure. Prod dir is
/// the sibling of the dev dir named by the prod identifier (the `.dev` stripped).
fn seed_dev_projects(
    dev_dir: &Path,
    identifier: &str,
) -> Result<Option<(PathBuf, PathBuf)>, String> {
    let Some(prod_identifier) = identifier.strip_suffix(".dev") else {
        return Ok(None); // prod build (or non-dev identity) — nothing to seed
    };
    let dev_file = dev_dir.join(PROJECTS_FILE);
    if dev_file.exists() {
        return Ok(None); // already seeded (or dev built its own) — never clobber
    }
    let Some(parent) = dev_dir.parent() else {
        return Ok(None);
    };
    let prod_file = parent.join(prod_identifier).join(PROJECTS_FILE);
    if !prod_file.exists() {
        return Ok(None); // no prod list to seed from (fresh machine) — dev empty
    }
    std::fs::copy(&prod_file, &dev_file).map_err(|e| {
        format!(
            "copy {} → {} failed: {e}",
            prod_file.display(),
            dev_file.display()
        )
    })?;
    Ok(Some((prod_file, dev_file)))
}

/// Current wall-clock time in unix epoch milliseconds.
///
/// `duration_since(UNIX_EPOCH)` only errors if the system clock is set before 1970
/// — not a real condition, but if it ever fires we must NOT fall back to `0`: the
/// store sorts most-recently-opened first by descending `last_opened_at`
/// (`super::sort_by_recency`), so a `0` stamp would silently sink the just-opened
/// project to the BOTTOM of recents — the exact opposite of what the user just did.
/// Instead we log the anomaly and stamp `i64::MAX` so the actively-opened record
/// sorts FIRST, matching intent, and surface the clock fault rather than swallowing it.
fn now_ms() -> i64 {
    match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(d) => d.as_millis() as i64,
        Err(e) => {
            eprintln!(
                "[claudesk] system clock is before the unix epoch ({e}); \
                 stamping recency as i64::MAX so the just-opened project sorts first"
            );
            i64::MAX
        }
    }
}

/// List remembered projects, most-recently-opened first.
#[tauri::command]
pub fn list_projects(app: AppHandle) -> Result<Vec<Project>, String> {
    let dir = resolve_data_dir(&app)?;
    read_projects(&dir).map_err(|e| e.to_string())
}

/// Add a project (or refresh its recency if already present). Returns the record.
///
/// NOTE: this body is DELIBERATELY identical to [`record_open`] — both are thin
/// aliases over `add_or_touch(.., now_ms())`. They are kept as two distinct IPC
/// commands for frontend readability (the picker calls `add_project` from "Open
/// Folder…" and `record_open` from clicking a recent — the names document intent at
/// the call site). The single point of truth is `add_or_touch`; if its contract ever
/// needs to differ per entry point, split it there, not by editing one wrapper and
/// not the other. Do not "dedupe" these into one command.
#[tauri::command]
pub fn add_project(app: AppHandle, path: String) -> Result<Project, String> {
    let dir = resolve_data_dir(&app)?;
    add_or_touch(&dir, PathBuf::from(path), now_ms()).map_err(|e| e.to_string())
}

/// Stamp `last_opened_at = now` for a project (adding it if unknown). Returns the
/// record so the frontend can reflect the new recency immediately.
///
/// Deliberately a byte-identical alias of [`add_project`] — see the note there.
#[tauri::command]
pub fn record_open(app: AppHandle, path: String) -> Result<Project, String> {
    let dir = resolve_data_dir(&app)?;
    add_or_touch(&dir, PathBuf::from(path), now_ms()).map_err(|e| e.to_string())
}

/// Remove a project from the list. No-op if absent.
#[tauri::command]
pub fn remove_project(app: AppHandle, path: String) -> Result<(), String> {
    let dir = resolve_data_dir(&app)?;
    remove_project_inner(&dir, Path::new(&path)).map_err(|e| e.to_string())
}

/// Drop projects whose folder no longer exists on disk, returning the dropped
/// records so the picker can show a toast naming how many were removed. Called on
/// picker mount (WP9): a project deleted between sessions otherwise lingers as a
/// dead click.
#[tauri::command]
pub fn prune_missing_projects(app: AppHandle) -> Result<Vec<Project>, String> {
    let dir = resolve_data_dir(&app)?;
    prune_missing(&dir).map_err(|e| e.to_string())
}

/// Read a project's per-project CC model override (M11.5 WP1). `None` = the project
/// inherits CC's own default model — which is also the answer for an unknown path, so a
/// caller can seed its control without special-casing a missing record.
#[tauri::command]
pub fn project_get_default_model(app: AppHandle, path: String) -> Result<Option<String>, String> {
    let dir = resolve_data_dir(&app)?;
    read_default_model(&dir, Path::new(&path)).map_err(|e| e.to_string())
}

/// Set (`Some`) or clear (`None`) a project's CC model override.
///
/// Takes effect on that project's **next** CC spawn — argv is fixed once per process,
/// exactly like the app-global permission mode. A blank string is normalized to "clear",
/// so the frontend may forward a trimmed-empty input without special-casing it.
/// An unknown path is an error (there is no record to attach the value to).
#[tauri::command]
pub fn project_set_default_model(
    app: AppHandle,
    path: String,
    model: Option<String>,
) -> Result<(), String> {
    let dir = resolve_data_dir(&app)?;
    set_default_model(&dir, Path::new(&path), model).map_err(|e| e.to_string())
}

/// Set (`Some`) or clear (`None`) a project's workflow drive mode (M12 WP4c).
///
/// Takes effect on that project's **next** CC spawn: the mode is read at spawn time and
/// becomes the `CLAUDESK_DRIVE_MODE` env var gating the `UserPromptSubmit` hook. An
/// unknown path is an error — there is no record to attach the value to, and reporting
/// success for a write that vanishes on the next read is worse than failing.
///
/// ⚠️ **`mode` is TYPED (`Option<DriveMode>`), deliberately unlike
/// [`project_set_default_model`]'s free `Option<String>`** — and the asymmetry is a
/// correctness requirement, not a style choice. An unrecognized *model* string is
/// adjudicated by CC itself, loudly and precisely, in the pane the operator is already
/// looking at. An unrecognized *drive-mode* string instead fails `serde` on the way back
/// **in and takes the whole project list with it** (`read_projects` returns `Err`, so the
/// picker cannot render at all — see `tests::an_unknown_drive_mode_string_fails_the_whole_project_list`).
/// So this boundary must reject at the type level; do NOT "harmonize" it to a `String` for
/// symmetry with the model command, and do NOT copy `cc/modelOverride.ts`'s emphatic
/// "this module does NOT validate" rule across — that rule is about the open-valued
/// sibling.
///
/// Clearing removes the key from disk (via `skip_serializing_if`) rather than writing
/// `null`, which is what makes "absent → do not set the env var" one code path instead of
/// two.
#[tauri::command]
pub fn project_set_default_drive_mode(
    app: AppHandle,
    path: String,
    mode: Option<DriveMode>,
) -> Result<(), String> {
    let dir = resolve_data_dir(&app)?;
    set_default_drive_mode(&dir, Path::new(&path), mode).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    /// Build a `<root>/<prod-id>/` and `<root>/<dev-id>/` sibling layout mirroring
    /// the real `…/Application Support/<identifier>/` shape. Returns the dev dir.
    fn sibling_layout(root: &Path, prod_id: &str, dev_id: &str) -> PathBuf {
        std::fs::create_dir_all(root.join(prod_id)).unwrap();
        let dev_dir = root.join(dev_id);
        std::fs::create_dir_all(&dev_dir).unwrap();
        dev_dir
    }

    #[test]
    fn seed_copies_prod_list_into_empty_dev_dir() {
        let tmp = TempDir::new().unwrap();
        let dev_dir = sibling_layout(tmp.path(), "com.claudesk.app", "com.claudesk.app.dev");
        std::fs::write(
            tmp.path().join("com.claudesk.app").join(PROJECTS_FILE),
            br#"{"projects":["real"]}"#,
        )
        .unwrap();

        let res = seed_dev_projects(&dev_dir, "com.claudesk.app.dev").unwrap();
        assert!(res.is_some(), "should have copied");
        let seeded = std::fs::read(dev_dir.join(PROJECTS_FILE)).unwrap();
        assert_eq!(seeded, br#"{"projects":["real"]}"#);
    }

    #[test]
    fn seed_is_noop_for_prod_identity() {
        let tmp = TempDir::new().unwrap();
        // dev_dir arg is irrelevant here — prod identity returns early.
        let res = seed_dev_projects(tmp.path(), "com.claudesk.app").unwrap();
        assert!(res.is_none(), "prod build must never seed");
    }

    #[test]
    fn seed_never_clobbers_existing_dev_list() {
        let tmp = TempDir::new().unwrap();
        let dev_dir = sibling_layout(tmp.path(), "com.claudesk.app", "com.claudesk.app.dev");
        std::fs::write(
            tmp.path().join("com.claudesk.app").join(PROJECTS_FILE),
            br#"{"projects":["prod"]}"#,
        )
        .unwrap();
        // Dev already has its own divergent list.
        std::fs::write(dev_dir.join(PROJECTS_FILE), br#"{"projects":["dev-own"]}"#).unwrap();

        let res = seed_dev_projects(&dev_dir, "com.claudesk.app.dev").unwrap();
        assert!(res.is_none(), "must not overwrite an existing dev list");
        let kept = std::fs::read(dev_dir.join(PROJECTS_FILE)).unwrap();
        assert_eq!(
            kept, br#"{"projects":["dev-own"]}"#,
            "dev's own list preserved"
        );
    }

    #[test]
    fn seed_is_noop_when_no_prod_list_exists() {
        let tmp = TempDir::new().unwrap();
        let dev_dir = sibling_layout(tmp.path(), "com.claudesk.app", "com.claudesk.app.dev");
        // No prod projects.json written → nothing to seed from.
        let res = seed_dev_projects(&dev_dir, "com.claudesk.app.dev").unwrap();
        assert!(res.is_none(), "no prod list → dev starts empty");
        assert!(!dev_dir.join(PROJECTS_FILE).exists());
    }
}
