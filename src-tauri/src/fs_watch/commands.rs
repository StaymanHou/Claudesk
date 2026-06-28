//! Runtime wiring for the filesystem watcher: per-workspace `notify-debouncer-full`
//! debouncers, the managed [`WatcherRegistry`], and the `fs-change` emit.
//!
//! The pure transform ([`super::paths_to_change`], [`super::is_ignored`], the
//! [`super::FsChange`] DTO) lives in [`super`]; this module adds only the
//! runtime-dependent pieces — the `AppHandle`-bound emit, the debouncer threads, and
//! the managed registry. Mirrors `status_broadcaster::commands`' split (pure transform
//! in the parent, launch wiring + managed state here).
//!
//! ## Lifecycle (the WP1 pairing)
//! `workspace_watch_start` is called by the frontend on workspace-open (alongside
//! `workspace_register`); `workspace_watch_stop` on workspace-close/absent. A
//! `notify-debouncer-full` `Debouncer` STOPS ON DROP, so stop = remove the handle from
//! the registry. Until QoL-WP1 (close-workspace) routes its teardown through stop, the
//! watcher's only stop path is app shutdown (the registry — and its debouncers — drop
//! when the managed state is torn down).

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use notify_debouncer_full::notify::{EventKind, RecursiveMode};
use notify_debouncer_full::{new_debouncer, DebounceEventResult};
use tauri::{AppHandle, Emitter, State};

use super::{paths_to_change, FsKind, FsWatchError};

/// The Tauri event name the FileTree + editor consumers subscribe to. Defined here,
/// mirrored verbatim by the frontend `listen("fs-change", …)`.
pub const FS_CHANGE_EVENT: &str = "fs-change";

/// Debounce window. Long enough to coalesce an editor/formatter write-then-rename
/// burst and a bulk `git checkout` into a handful of batches, short enough that the
/// tree/editor feel live (~the operator's "within a second or two" bar).
const DEBOUNCE: Duration = Duration::from_millis(200);

/// A type-erased watcher handle. We only ever need to DROP it (the debouncer stops on
/// drop) and to know which workspace it belongs to. Boxed because `Debouncer<T>` is
/// generic over the watcher backend (`new_debouncer` returns `impl Watcher`).
type WatcherHandle = Box<dyn std::any::Any + Send>;

/// workspace_id → its live debouncer handle. Dropping a handle stops its watcher.
#[derive(Default)]
pub struct WatcherRegistry {
    watchers: HashMap<String, WatcherHandle>,
}

impl WatcherRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Number of live watchers — observability; exercised by the lifecycle tests.
    #[cfg(test)]
    pub fn len(&self) -> usize {
        self.watchers.len()
    }

    #[cfg(test)]
    pub fn is_empty(&self) -> bool {
        self.watchers.is_empty()
    }

    /// Insert (replacing any prior watcher for the same id — dropping the old one
    /// stops it, so a re-open never leaks a watcher).
    fn insert(&mut self, workspace_id: String, handle: WatcherHandle) {
        self.watchers.insert(workspace_id, handle);
    }

    /// Remove + drop a workspace's watcher (stops it). Absent id = no-op.
    fn remove(&mut self, workspace_id: &str) {
        self.watchers.remove(workspace_id);
    }
}

/// The managed registry, mirroring `status_broadcaster::init_registry`'s shape.
pub type SharedWatcherRegistry = Mutex<WatcherRegistry>;

pub fn init_watcher_registry() -> SharedWatcherRegistry {
    Mutex::new(WatcherRegistry::new())
}

/// Classify a debounced batch's `notify` event kinds into one coarse [`FsKind`]. A
/// batch may mix kinds (the debouncer coalesces); we pick the most specific single
/// kind when the batch is homogeneous, else `Other`. Renames in notify 8 surface as
/// `Modify(ModifyKind::Name(..))`; the debouncer pairs From/To, so a name-modify in
/// the batch is reported as `Renamed`.
fn classify(kinds: &[EventKind]) -> FsKind {
    use notify_debouncer_full::notify::event::ModifyKind;
    let mut seen: Option<FsKind> = None;
    for k in kinds {
        let this = match k {
            EventKind::Create(_) => FsKind::Created,
            EventKind::Remove(_) => FsKind::Removed,
            EventKind::Modify(ModifyKind::Name(_)) => FsKind::Renamed,
            EventKind::Modify(_) => FsKind::Modified,
            _ => FsKind::Other,
        };
        match seen {
            None => seen = Some(this),
            Some(prev) if prev == this => {}
            Some(_) => return FsKind::Other, // mixed batch
        }
    }
    seen.unwrap_or(FsKind::Other)
}

/// Start watching a workspace's project root and emit debounced, ignore-filtered
/// `fs-change` events for it. Idempotent per workspace_id (a re-start replaces +
/// stops the prior watcher).
///
/// Errors are returned as a human-readable string for the frontend to surface (the
/// never-swallow lesson — a failed watcher means the tree/editor silently go stale).
#[tauri::command]
pub fn workspace_watch_start(
    app: AppHandle,
    registry: State<'_, SharedWatcherRegistry>,
    project_path: String,
    workspace_id: String,
) -> Result<(), String> {
    let root = PathBuf::from(&project_path);
    if !root.is_dir() {
        return Err(FsWatchError::BadRoot {
            root: project_path.clone(),
        }
        .to_string());
    }

    // Exclusion is now a pure NAME-based heavy-dir predicate (M6 WP6) — no per-root
    // matcher to build; `paths_to_change` calls `is_ignored` directly.
    let cb_root = root.clone();
    let cb_ws = workspace_id.clone();
    let cb_app = app.clone();

    let mut debouncer = new_debouncer(DEBOUNCE, None, move |result: DebounceEventResult| {
        let events = match result {
            Ok(events) => events,
            Err(errors) => {
                // notify reported watch errors (e.g. a transient FSEvents hiccup).
                // Log, don't crash the callback thread — the watcher keeps running.
                for e in errors {
                    eprintln!("[claudesk] fs-watch: debounce error: {e}");
                }
                return;
            }
        };
        // Collect all paths + kinds across the debounced batch, then run the pure
        // transform once (it dedups + ignore-filters). Emit only on Some.
        let mut paths: Vec<PathBuf> = Vec::new();
        let mut kinds: Vec<EventKind> = Vec::new();
        for ev in &events {
            kinds.push(ev.kind);
            for p in &ev.paths {
                paths.push(p.clone());
            }
        }
        let kind = classify(&kinds);
        if let Some(change) = paths_to_change(&cb_ws, &cb_root, &paths, kind) {
            if let Err(e) = cb_app.emit(FS_CHANGE_EVENT, &change) {
                eprintln!("[claudesk] fs-watch: emit failed: {e}");
            }
        }
    })
    .map_err(|e| {
        FsWatchError::WatchStart {
            root: project_path.clone(),
            reason: e.to_string(),
        }
        .to_string()
    })?;

    debouncer
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|e| {
            FsWatchError::WatchStart {
                root: project_path.clone(),
                reason: e.to_string(),
            }
            .to_string()
        })?;

    // Park the debouncer in the registry (boxed/type-erased — we only drop it). A
    // prior watcher for this id is replaced (and thereby stopped).
    let mut reg = registry
        .lock()
        .map_err(|_| FsWatchError::LockPoisoned.to_string())?;
    reg.insert(workspace_id, Box::new(debouncer));
    Ok(())
}

/// Stop watching a workspace (drops its debouncer → stops the thread). Absent id is a
/// no-op. A poisoned lock is surfaced, never swallowed.
#[tauri::command]
pub fn workspace_watch_stop(
    registry: State<'_, SharedWatcherRegistry>,
    workspace_id: String,
) -> Result<(), String> {
    let mut reg = registry
        .lock()
        .map_err(|_| FsWatchError::LockPoisoned.to_string())?;
    reg.remove(&workspace_id);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify_debouncer_full::notify::event::{CreateKind, ModifyKind, RemoveKind};

    #[test]
    fn classify_homogeneous_kinds() {
        assert_eq!(
            classify(&[EventKind::Create(CreateKind::File)]),
            FsKind::Created
        );
        assert_eq!(
            classify(&[EventKind::Remove(RemoveKind::File)]),
            FsKind::Removed
        );
        assert_eq!(
            classify(&[EventKind::Modify(ModifyKind::Data(
                notify_debouncer_full::notify::event::DataChange::Content
            ))]),
            FsKind::Modified
        );
        assert_eq!(
            classify(&[EventKind::Modify(ModifyKind::Name(
                notify_debouncer_full::notify::event::RenameMode::Both
            ))]),
            FsKind::Renamed
        );
    }

    #[test]
    fn classify_mixed_batch_is_other() {
        let mixed = [
            EventKind::Create(CreateKind::File),
            EventKind::Remove(RemoveKind::File),
        ];
        assert_eq!(classify(&mixed), FsKind::Other);
    }

    #[test]
    fn classify_empty_is_other() {
        assert_eq!(classify(&[]), FsKind::Other);
    }

    #[test]
    fn registry_insert_remove_len() {
        // The registry's insert/remove are the lifecycle the commands drive; exercise
        // them directly (the #[tauri::command] State injection needs a live app).
        let mut reg = WatcherRegistry::new();
        assert!(reg.is_empty());
        reg.insert("ws-1".to_string(), Box::new(()));
        reg.insert("ws-2".to_string(), Box::new(()));
        assert_eq!(reg.len(), 2);
        reg.remove("ws-1");
        assert_eq!(reg.len(), 1);
        // Absent id = no-op.
        reg.remove("never");
        assert_eq!(reg.len(), 1);
    }

    #[test]
    fn registry_reinsert_replaces() {
        // A re-open (same id) must replace, not duplicate — dropping the old handle
        // stops its watcher, so we never leak.
        let mut reg = WatcherRegistry::new();
        reg.insert("ws-1".to_string(), Box::new(()));
        reg.insert("ws-1".to_string(), Box::new(()));
        assert_eq!(reg.len(), 1);
    }
}
