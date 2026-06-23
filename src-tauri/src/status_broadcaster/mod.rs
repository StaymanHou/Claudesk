//! Status broadcaster — Milestone 3's central node (WP4).
//!
//! WP3 delivers a stream of parsed [`HookEvent`](crate::hook_socket::HookEvent)s on
//! an `mpsc::Receiver` held in `HookSocketState`. This module is the transform on
//! top of that stream: it **normalizes** each event to a [`WorkspaceState`], **maps**
//! the event's `cwd` to a known open workspace via the [`WorkspaceRegistry`], builds
//! a [`WorkspaceStatusUpdate`] DTO, and (in [`commands`]) emits it on the Tauri event
//! channel as `workspace-status`. Every later status surface (M4 filmstrip, M5 PiP,
//! M6 menu-bar) subscribes to that one event — this is the single source of truth.
//!
//! ## State mapping (the M3 contract)
//! - `UserPromptSubmit` → [`WorkspaceState::Running`] (CC is working a prompt)
//! - `Stop`             → [`WorkspaceState::Idle`] (CC finished, awaiting nothing)
//! - `Notification`     → [`WorkspaceState::AwaitingInput`] (CC paused for the user)
//! - any other event    → no-op (`None`) — never guessed, never emitted
//!
//! [`WorkspaceState::Unknown`] is the **honest no-data default** a surface shows for
//! a workspace before any event has arrived (arch.md failure mode). The broadcaster
//! never *emits* `Unknown` from an event — an event either maps to one of the three
//! live states or is dropped. `Unknown` is the registry/frontend initial value.
//!
//! ## cwd→workspace mapping
//! [`WorkspaceRegistry::resolve_cwd`] canonicalizes both the event's `cwd` and each
//! registered project path before comparing (the M2 WP11 path-keying lesson —
//! symlinks / `.` / relative segments must not defeat the match; see
//! `git_status/mod.rs`). An event whose `cwd` matches no open workspace is **dropped,
//! not an error**. The actual open→register / close→deregister wiring is WP6's
//! concern; WP4 defines the seam and tests the mapping in isolation.
//!
//! ## Serde shape
//! [`WorkspaceStatusUpdate`] is **snake_case end-to-end** — NO `rename_all`, no field
//! rename — so WP6's TS type can mirror the field names verbatim with no camelCase
//! drift. The contract is pinned by [`tests::dto_serde_shape_is_snake_case`], folding
//! in `SURFACE-2026-06-21-IPC-DTO-FIELD-CASE-TESTS-MISS-SERDE-SHAPE`.
//!
//! The `commands` submodule (the receiver-drain thread + the Tauri `app.emit`
//! wiring) is the runtime consumer of this pure transform core.

pub mod commands;

use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

use serde::Serialize;

use crate::hook_socket::HookEvent;

/// A workspace's CC lifecycle state, derived solely from the hook channel (never
/// from PTY output). Serializes snake_case so the frontend mirrors it verbatim.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceState {
    /// CC is idle (finished its last turn) — emitted on `Stop`.
    Idle,
    /// CC is actively working a prompt — emitted on `UserPromptSubmit`.
    Running,
    /// CC has paused for the user (permission / input) — emitted on `Notification`.
    AwaitingInput,
    /// No hook event observed yet — the honest default a surface shows before any
    /// event arrives. Never *emitted* from an event (the broadcaster only ever
    /// produces the three live states); it exists on the Rust side so the DTO enum
    /// is complete and its `"unknown"` serde rendering is pinned. The frontend (TS)
    /// owns it as the initial state a workspace shows before its first hook event.
    /// Marked the `#[default]` because Unknown IS the absence-of-data state — this
    /// also gives the variant a live (non-test) presence via the derived `Default`.
    #[default]
    Unknown,
}

/// Normalize a [`HookEvent`] to a [`WorkspaceState`]. Returns `None` for any event
/// that is not one of the three M3 lifecycle events — an unknown event is a no-op,
/// never a guessed state.
pub fn event_to_state(event: &HookEvent) -> Option<WorkspaceState> {
    match event.hook_event_name.as_str() {
        "UserPromptSubmit" => Some(WorkspaceState::Running),
        "Stop" => Some(WorkspaceState::Idle),
        "Notification" => Some(WorkspaceState::AwaitingInput),
        _ => None,
    }
}

/// The status update broadcast on the `workspace-status` Tauri event — the single
/// DTO every status surface consumes.
///
/// Field names are **snake_case verbatim** (NO `rename_all`); WP6's TS type mirrors
/// them exactly. `last_event_at` carries the hook-side send time (`HookEvent.timestamp`,
/// epoch ms) when present; `last_output_snippet` carries the event's `prompt`
/// (`UserPromptSubmit`) or `message` (`Notification`) when present. Both are `Option`
/// and `skip_serializing_if`-omitted when absent so the wire shape is minimal.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct WorkspaceStatusUpdate {
    /// The registry id of the workspace this event belongs to.
    pub workspace_id: String,
    /// The derived CC lifecycle state.
    pub state: WorkspaceState,
    /// Hook-side send time (epoch ms), if the event carried one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_event_at: Option<u64>,
    /// The event's prompt/message text, if present (telemetry for the surface).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_output_snippet: Option<String>,
}

/// Maps a canonicalized project path → its `workspace_id`. The cwd→workspace seam:
/// WP4 defines + tests it; WP6 wires open→[`register`](Self::register) /
/// close→[`deregister`](Self::deregister). Held in Tauri managed state behind a
/// `Mutex` (see [`SharedRegistry`]) so the drain thread and a future WP6 command
/// share one instance. Empty at launch — WP4 emits nothing until WP6 registers a
/// workspace.
#[derive(Debug, Default)]
pub struct WorkspaceRegistry {
    /// canonicalized-project-path-string → workspace_id
    by_path: HashMap<String, String>,
}

impl WorkspaceRegistry {
    /// A fresh, empty registry.
    pub fn new() -> Self {
        Self::default()
    }

    /// Register an open workspace: its project path (canonicalized) → `workspace_id`.
    /// A path that fails to canonicalize (does not exist) is stored verbatim so an
    /// exact-string match can still resolve it (best-effort; the resolve side also
    /// canonicalizes, so a both-canonicalizable pair matches regardless).
    ///
    /// Called by WP6's `workspace_register` command (open → register).
    pub fn register(&mut self, project_path: &Path, workspace_id: String) {
        let key = canonical_key(project_path);
        self.by_path.insert(key, workspace_id);
    }

    /// Deregister a closed workspace by its project path. Called by WP6's
    /// `workspace_deregister` command (close → deregister).
    pub fn deregister(&mut self, project_path: &Path) {
        let key = canonical_key(project_path);
        self.by_path.remove(&key);
    }

    /// Resolve an event's `cwd` to a `workspace_id`, or `None` if no open workspace
    /// matches (the event is then dropped, not an error). Canonicalizes the `cwd`
    /// the same way [`register`](Self::register) canonicalized the stored path, so
    /// symlinks / `.` / relative segments do not defeat the match (M2 WP11 lesson).
    pub fn resolve_cwd(&self, cwd: &str) -> Option<String> {
        let key = canonical_key(Path::new(cwd));
        self.by_path.get(&key).cloned()
    }

    /// Test/inspection helper: number of registered workspaces.
    #[cfg(test)]
    pub fn len(&self) -> usize {
        self.by_path.len()
    }
}

/// Canonicalize a path to its registry key. Falls back to the lossy string form when
/// `canonicalize` fails (e.g. the path no longer exists on disk) — a non-existent
/// `cwd` then simply won't match any canonicalized registered path and is dropped,
/// which is the intended "no open workspace" behavior. Never panics.
fn canonical_key(path: &Path) -> String {
    match path.canonicalize() {
        Ok(p) => p.to_string_lossy().into_owned(),
        Err(_) => path.to_string_lossy().into_owned(),
    }
}

/// Tauri-managed shared registry: a `Mutex` so the drain thread and WP6's
/// register/deregister command share one instance.
pub type SharedRegistry = Mutex<WorkspaceRegistry>;

/// The pure transform the drain thread runs per event: normalize → resolve cwd →
/// build the DTO. Returns `None` when the event is not a mapped lifecycle event OR
/// its `cwd` matches no open workspace (both = drop, not error). Kept pure (no
/// `AppHandle`, no IO) so the whole transform unit-tests without a Tauri app — the
/// drain thread's only un-testable line is the `app.emit` of the returned `Some`.
pub fn to_update(event: &HookEvent, registry: &WorkspaceRegistry) -> Option<WorkspaceStatusUpdate> {
    let state = event_to_state(event)?;
    let workspace_id = registry.resolve_cwd(&event.cwd)?;
    let last_output_snippet = event.prompt.clone().or_else(|| event.message.clone());
    Some(WorkspaceStatusUpdate {
        workspace_id,
        state,
        last_event_at: event.timestamp,
        last_output_snippet,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ev(name: &str, cwd: &str) -> HookEvent {
        HookEvent {
            hook_event_name: name.to_string(),
            session_id: "s".to_string(),
            cwd: cwd.to_string(),
            timestamp: None,
            prompt: None,
            message: None,
        }
    }

    // ---- event_to_state: the 3 mapped events + unknown → None ----

    #[test]
    fn user_prompt_submit_maps_to_running() {
        assert_eq!(
            event_to_state(&ev("UserPromptSubmit", "/p")),
            Some(WorkspaceState::Running)
        );
    }

    #[test]
    fn stop_maps_to_idle() {
        assert_eq!(
            event_to_state(&ev("Stop", "/p")),
            Some(WorkspaceState::Idle)
        );
    }

    #[test]
    fn notification_maps_to_awaiting_input() {
        assert_eq!(
            event_to_state(&ev("Notification", "/p")),
            Some(WorkspaceState::AwaitingInput)
        );
    }

    #[test]
    fn default_workspace_state_is_unknown() {
        // P2.4: Unknown is the derived Default — the honest no-data state. This pins
        // the #[default] choice so a future reorder/rename can't silently change the
        // default a consumer constructing `WorkspaceState::default()` would get.
        assert_eq!(WorkspaceState::default(), WorkspaceState::Unknown);
    }

    #[test]
    fn unknown_event_is_a_noop() {
        // Any event outside the M3 trio is a no-op — never a guessed state.
        assert_eq!(event_to_state(&ev("PreToolUse", "/p")), None);
        assert_eq!(event_to_state(&ev("", "/p")), None);
        assert_eq!(event_to_state(&ev("SessionStart", "/p")), None);
    }

    // ---- WorkspaceRegistry::resolve_cwd: hit / miss / canonicalization ----

    #[test]
    fn resolve_cwd_hit_on_registered_path() {
        let dir = tempfile::TempDir::new().unwrap();
        let mut reg = WorkspaceRegistry::new();
        reg.register(dir.path(), "ws-1".to_string());
        assert_eq!(
            reg.resolve_cwd(&dir.path().to_string_lossy()),
            Some("ws-1".to_string())
        );
    }

    #[test]
    fn resolve_cwd_miss_returns_none() {
        let dir = tempfile::TempDir::new().unwrap();
        let mut reg = WorkspaceRegistry::new();
        reg.register(dir.path(), "ws-1".to_string());
        // A different (real) path is not registered → dropped.
        let other = tempfile::TempDir::new().unwrap();
        assert_eq!(reg.resolve_cwd(&other.path().to_string_lossy()), None);
        // A non-existent path also misses (canonicalize fails → lossy key → no match).
        assert_eq!(reg.resolve_cwd("/no/such/path/xyz"), None);
    }

    #[test]
    fn resolve_cwd_canonicalizes_both_sides() {
        // Register the canonical path, then resolve a non-canonical form of the same
        // dir (a trailing `.` component / symlink-equivalent). Canonicalization on
        // both sides must make them match (the M2 WP11 path-keying lesson).
        let dir = tempfile::TempDir::new().unwrap();
        let mut reg = WorkspaceRegistry::new();
        reg.register(dir.path(), "ws-1".to_string());

        // Build a non-canonical but equivalent path: <dir>/. (a redundant component).
        let non_canonical = dir.path().join(".");
        assert_eq!(
            reg.resolve_cwd(&non_canonical.to_string_lossy()),
            Some("ws-1".to_string()),
            "a non-canonical form of a registered dir must resolve via canonicalization"
        );
    }

    #[test]
    fn deregister_removes_the_mapping() {
        let dir = tempfile::TempDir::new().unwrap();
        let mut reg = WorkspaceRegistry::new();
        reg.register(dir.path(), "ws-1".to_string());
        assert_eq!(reg.len(), 1);
        reg.deregister(dir.path());
        assert_eq!(reg.len(), 0);
        assert_eq!(reg.resolve_cwd(&dir.path().to_string_lossy()), None);
    }

    #[test]
    fn registry_generalizes_to_n_gt_1_no_cross_workspace_bleed() {
        // M4 WP2 P4.3 — confirm the WP6 register/deregister list-diffing generalizes from
        // N<=1 to N>1: the map holds N entries, each cwd resolves to ITS OWN workspace_id
        // (no bleed), and deregistering one leaves the others intact + still resolving.
        let dir_a = tempfile::TempDir::new().unwrap();
        let dir_b = tempfile::TempDir::new().unwrap();
        let dir_c = tempfile::TempDir::new().unwrap();
        let mut reg = WorkspaceRegistry::new();
        reg.register(dir_a.path(), "ws-1".to_string());
        reg.register(dir_b.path(), "ws-2".to_string());
        reg.register(dir_c.path(), "ws-3".to_string());
        assert_eq!(reg.len(), 3, "the map must hold all N=3 entries");

        // Each cwd resolves to its OWN workspace — a status event for one workspace's cwd
        // never bleeds into another's id.
        assert_eq!(
            reg.resolve_cwd(&dir_a.path().to_string_lossy()),
            Some("ws-1".to_string())
        );
        assert_eq!(
            reg.resolve_cwd(&dir_b.path().to_string_lossy()),
            Some("ws-2".to_string())
        );
        assert_eq!(
            reg.resolve_cwd(&dir_c.path().to_string_lossy()),
            Some("ws-3".to_string())
        );

        // Deregister the middle one (close one of N workspaces) — the others survive.
        reg.deregister(dir_b.path());
        assert_eq!(reg.len(), 2);
        assert_eq!(reg.resolve_cwd(&dir_b.path().to_string_lossy()), None);
        assert_eq!(
            reg.resolve_cwd(&dir_a.path().to_string_lossy()),
            Some("ws-1".to_string()),
            "deregistering ws-2 must not disturb ws-1"
        );
        assert_eq!(
            reg.resolve_cwd(&dir_c.path().to_string_lossy()),
            Some("ws-3".to_string()),
            "deregistering ws-2 must not disturb ws-3"
        );
    }

    // ---- to_update: full transform (mapped+resolved → Some; unmapped/unresolved → None) ----

    #[test]
    fn to_update_builds_dto_for_mapped_and_resolved_event() {
        let dir = tempfile::TempDir::new().unwrap();
        let mut reg = WorkspaceRegistry::new();
        reg.register(dir.path(), "ws-1".to_string());

        let mut event = ev("UserPromptSubmit", &dir.path().to_string_lossy());
        event.timestamp = Some(1_718_000_000_000);
        event.prompt = Some("do the thing".to_string());

        let update = to_update(&event, &reg).expect("mapped+resolved event yields a DTO");
        assert_eq!(update.workspace_id, "ws-1");
        assert_eq!(update.state, WorkspaceState::Running);
        assert_eq!(update.last_event_at, Some(1_718_000_000_000));
        assert_eq!(update.last_output_snippet.as_deref(), Some("do the thing"));
    }

    #[test]
    fn to_update_drops_event_for_unregistered_cwd() {
        let reg = WorkspaceRegistry::new(); // empty — nothing registered
        let event = ev("Stop", "/some/unregistered/path");
        assert!(to_update(&event, &reg).is_none());
    }

    #[test]
    fn to_update_drops_unmapped_event_even_when_cwd_registered() {
        let dir = tempfile::TempDir::new().unwrap();
        let mut reg = WorkspaceRegistry::new();
        reg.register(dir.path(), "ws-1".to_string());
        // A non-lifecycle event is a no-op regardless of cwd registration.
        let event = ev("PreToolUse", &dir.path().to_string_lossy());
        assert!(to_update(&event, &reg).is_none());
    }

    #[test]
    fn to_update_uses_message_as_snippet_for_notification() {
        let dir = tempfile::TempDir::new().unwrap();
        let mut reg = WorkspaceRegistry::new();
        reg.register(dir.path(), "ws-1".to_string());
        let mut event = ev("Notification", &dir.path().to_string_lossy());
        event.message = Some("Claude needs your permission".to_string());

        let update = to_update(&event, &reg).unwrap();
        assert_eq!(update.state, WorkspaceState::AwaitingInput);
        assert_eq!(
            update.last_output_snippet.as_deref(),
            Some("Claude needs your permission")
        );
    }

    // ---- DTO serde-shape contract (folds in SURFACE-2026-06-21-IPC-DTO-FIELD-CASE-TESTS-MISS-SERDE-SHAPE) ----

    #[test]
    fn dto_serde_shape_is_snake_case() {
        // Pin the exact wire keys so WP6's TS type mirrors them verbatim. A future
        // `rename_all`/field rename must break this test, not silently drift.
        let update = WorkspaceStatusUpdate {
            workspace_id: "ws-1".to_string(),
            state: WorkspaceState::Running,
            last_event_at: Some(123),
            last_output_snippet: Some("hi".to_string()),
        };
        let value = serde_json::to_value(&update).unwrap();
        let obj = value.as_object().unwrap();

        // Exact key set, all snake_case.
        let mut keys: Vec<&String> = obj.keys().collect();
        keys.sort();
        assert_eq!(
            keys,
            vec![
                &"last_event_at".to_string(),
                &"last_output_snippet".to_string(),
                &"state".to_string(),
                &"workspace_id".to_string(),
            ]
        );

        // The state enum serializes snake_case too.
        assert_eq!(obj["state"], serde_json::json!("running"));
        assert_eq!(obj["workspace_id"], serde_json::json!("ws-1"));
        assert_eq!(obj["last_event_at"], serde_json::json!(123));
        assert_eq!(obj["last_output_snippet"], serde_json::json!("hi"));
    }

    #[test]
    fn dto_omits_optional_fields_when_absent() {
        // skip_serializing_if = Option::is_none → minimal wire shape.
        let update = WorkspaceStatusUpdate {
            workspace_id: "ws-1".to_string(),
            state: WorkspaceState::Unknown,
            last_event_at: None,
            last_output_snippet: None,
        };
        let value = serde_json::to_value(&update).unwrap();
        let obj = value.as_object().unwrap();
        assert!(!obj.contains_key("last_event_at"));
        assert!(!obj.contains_key("last_output_snippet"));
        assert_eq!(obj["state"], serde_json::json!("unknown"));
    }
}
