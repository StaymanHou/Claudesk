//! Claudesk CC-hook registration in `~/.claude/settings.json`.
//!
//! Claudesk reports each workspace's CC lifecycle (idle/running/awaiting-input)
//! from CC's official hook channel, not by scraping PTY output (see `CLAUDE.md` →
//! "PTY byte-injection for input; hook channel for state"). To receive those
//! events it must register a hook script for the three Milestone-3 events in the
//! user's `~/.claude/settings.json`.
//!
//! ## The merge contract (confirmed by the WP1 probe)
//! Each event in `settings.json`'s `hooks` block maps to an **array of
//! matcher-group objects**, each `{ "matcher"?: String, "hooks": [{ "type":
//! "command", "command": String, "timeout"?: Number }] }`. The real config on
//! this machine already runs *multiple independent* matcher-groups per event
//! (e.g. `claude-time-hook.pl` + `notify-telegram.sh` both on `Notification`), so
//! registration is an **array MERGE** — append a Claudesk matcher-group, never
//! overwrite. See `docs/product/wp1-hook-socket-probe-outcome.md`.
//!
//! ## Invariants
//! - **Additive** — never touch a matcher-group that isn't ours.
//! - **Idempotent** — re-running install adds nothing (detected by our `command`
//!   marker, which embeds the stable Claudesk script path).
//! - **Reversible** — [`uninstall`] removes only Claudesk's groups, pruning a now-
//!   empty event array, and leaves everything else byte-for-byte.
//! - **Never wipe a file we can't parse** — a malformed `settings.json` is an
//!   error, not a silent overwrite (mirrors `config_store`'s precedent).
//!
//! ## Layout (mirrors `config_store`)
//! - Pure functions ([`merge_claudesk_hooks`], [`remove_claudesk_hooks`]) operate
//!   on a `serde_json::Value` so they unit-test with no filesystem.
//! - File-level [`install`]/[`uninstall`] take an injected `settings_path: &Path`
//!   so they test against a `TempDir`. The launch wiring (resolving the real
//!   `~/.claude/settings.json`, copying the script, chmod) lives in `commands`.

pub mod commands;

use std::path::Path;

use serde_json::{json, Map, Value};
use thiserror::Error;

/// The three Milestone-3 lifecycle events Claudesk registers for.
/// `UserPromptSubmit` → Running, `Stop` → Idle, `Notification` → AwaitingInput
/// (the state mapping itself lives in WP4's broadcaster, not here).
pub const CLAUDESK_EVENTS: [&str; 3] = ["UserPromptSubmit", "Stop", "Notification"];

/// Basename of the settings file's sidecar temp used for the atomic write.
const SETTINGS_TMP_SUFFIX: &str = ".claudesk.tmp";

/// Errors from hook registration. The IPC wrapper maps this to a `String`.
#[derive(Debug, Error)]
pub enum HookInstallError {
    #[error("settings I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("settings.json parse error (left untouched): {0}")]
    Parse(#[from] serde_json::Error),
    #[error("settings.json root is not a JSON object")]
    NotAnObject,
}

/// Does this matcher-group object register our `command`? Detection marker for
/// idempotency + surgical uninstall. A group is "ours" iff any of its
/// `hooks[].command` strings contains the Claudesk script path.
fn group_is_claudesk(group: &Value, command: &str) -> bool {
    group
        .get("hooks")
        .and_then(Value::as_array)
        .map(|hooks| {
            hooks
                .iter()
                .any(|h| h.get("command").and_then(Value::as_str) == Some(command))
        })
        .unwrap_or(false)
}

/// Build Claudesk's matcher-group object for one event.
fn claudesk_group(command: &str) -> Value {
    json!({
        "hooks": [
            { "type": "command", "command": command }
        ]
    })
}

/// Merge Claudesk's hook into `settings`'s `hooks` block for all
/// [`CLAUDESK_EVENTS`]. Idempotent: a group already carrying our `command` marker
/// is left as-is (no duplicate appended). Additive: existing matcher-groups for
/// any event are preserved untouched. `command` is the exact string registered as
/// the hook's `command` (it doubles as the idempotency/uninstall marker).
///
/// Returns `true` if anything changed (a caller can skip the write when not).
/// Errors only if the JSON root or an existing `hooks` value has the wrong shape.
pub fn merge_claudesk_hooks(settings: &mut Value, command: &str) -> Result<bool, HookInstallError> {
    let root = settings
        .as_object_mut()
        .ok_or(HookInstallError::NotAnObject)?;

    // Ensure a `hooks` object exists.
    let hooks = root
        .entry("hooks")
        .or_insert_with(|| Value::Object(Map::new()));
    let hooks = hooks.as_object_mut().ok_or(HookInstallError::NotAnObject)?;

    let mut changed = false;
    for event in CLAUDESK_EVENTS {
        let arr = hooks
            .entry(event.to_string())
            .or_insert_with(|| Value::Array(Vec::new()));
        let arr = arr.as_array_mut().ok_or(HookInstallError::NotAnObject)?;

        // Idempotency: skip if a Claudesk group is already present.
        if arr.iter().any(|g| group_is_claudesk(g, command)) {
            continue;
        }
        arr.push(claudesk_group(command));
        changed = true;
    }
    Ok(changed)
}

/// Remove only Claudesk's matcher-groups (those carrying `command`) from every
/// event in `settings`'s `hooks` block, preserving all other groups. An event
/// array left empty after removal is dropped entirely (so uninstall returns the
/// block to its pre-install shape). Returns `true` if anything was removed.
pub fn remove_claudesk_hooks(
    settings: &mut Value,
    command: &str,
) -> Result<bool, HookInstallError> {
    let Some(root) = settings.as_object_mut() else {
        return Err(HookInstallError::NotAnObject);
    };
    let Some(hooks) = root.get_mut("hooks").and_then(Value::as_object_mut) else {
        return Ok(false); // no hooks block → nothing of ours to remove
    };

    let mut changed = false;
    let mut empty_events: Vec<String> = Vec::new();
    for (event, arr) in hooks.iter_mut() {
        let Some(arr) = arr.as_array_mut() else {
            continue;
        };
        let before = arr.len();
        arr.retain(|g| !group_is_claudesk(g, command));
        if arr.len() != before {
            changed = true;
        }
        if arr.is_empty() {
            empty_events.push(event.clone());
        }
    }
    for event in empty_events {
        hooks.remove(&event);
    }
    Ok(changed)
}

/// Read `settings.json` (or `{}` if it doesn't exist) as a JSON value.
/// A present-but-malformed file is a [`HookInstallError::Parse`] — we never
/// silently wipe a file we failed to understand (the `config_store` precedent).
fn read_settings(settings_path: &Path) -> Result<Value, HookInstallError> {
    match std::fs::read(settings_path) {
        Ok(bytes) => Ok(serde_json::from_slice(&bytes)?),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Value::Object(Map::new())),
        Err(e) => Err(e.into()),
    }
}

/// Atomically write `settings` to `settings_path`: serialize → `<path>.claudesk.tmp`
/// → `rename`. A crash mid-write leaves the live file untouched. Preserves pretty
/// formatting + a trailing newline (matches how editors leave the file).
fn write_settings(settings_path: &Path, settings: &Value) -> Result<(), HookInstallError> {
    let mut tmp = settings_path.as_os_str().to_owned();
    tmp.push(SETTINGS_TMP_SUFFIX);
    let tmp = std::path::PathBuf::from(tmp);

    let mut json = serde_json::to_vec_pretty(settings)?;
    json.push(b'\n');
    std::fs::write(&tmp, &json)?;
    std::fs::rename(&tmp, settings_path)?;
    Ok(())
}

/// Install Claudesk's hook into the settings file at `settings_path`, registering
/// `command` for all three events. Idempotent — re-running is a no-op write-skip.
/// A missing settings file is created with just our hooks block.
pub fn install(settings_path: &Path, command: &str) -> Result<(), HookInstallError> {
    let mut settings = read_settings(settings_path)?;
    if merge_claudesk_hooks(&mut settings, command)? {
        write_settings(settings_path, &settings)?;
    }
    Ok(())
}

/// Uninstall Claudesk's hook (only ours) from the settings file at
/// `settings_path`. No-op (and not an error) if the file is missing or carries
/// none of our entries.
pub fn uninstall(settings_path: &Path, command: &str) -> Result<(), HookInstallError> {
    if !settings_path.exists() {
        return Ok(());
    }
    let mut settings = read_settings(settings_path)?;
    if remove_claudesk_hooks(&mut settings, command)? {
        write_settings(settings_path, &settings)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tempfile::TempDir;

    const CMD: &str = "/usr/bin/perl /app-data/claudesk-hook.pl";
    const OTHER: &str = "~/.claude/hooks/claude-time-hook.pl";

    /// A settings value pre-populated with a claude-time entry on every event
    /// (and an extra notify-telegram group on Notification), mirroring the real
    /// machine's config so the additive-merge invariant is tested against the
    /// production shape, not an empty file.
    fn settings_with_claude_time() -> Value {
        json!({
            "model": "opus",
            "hooks": {
                "UserPromptSubmit": [
                    { "hooks": [ { "type": "command", "command": OTHER } ] }
                ],
                "Stop": [
                    { "hooks": [ { "type": "command", "command": OTHER } ] }
                ],
                "Notification": [
                    { "matcher": "", "hooks": [ { "type": "command", "command": "$HOME/.claude/hooks/notify-telegram.sh", "timeout": 10 } ] },
                    { "hooks": [ { "type": "command", "command": OTHER } ] }
                ]
            }
        })
    }

    fn claudesk_group_count(settings: &Value, event: &str) -> usize {
        settings["hooks"][event]
            .as_array()
            .map(|a| a.iter().filter(|g| group_is_claudesk(g, CMD)).count())
            .unwrap_or(0)
    }

    #[test]
    fn merge_into_empty_settings_creates_all_three_events() {
        let mut s = json!({});
        let changed = merge_claudesk_hooks(&mut s, CMD).unwrap();
        assert!(changed);
        for event in CLAUDESK_EVENTS {
            assert_eq!(claudesk_group_count(&s, event), 1, "event {event}");
        }
    }

    #[test]
    fn merge_is_additive_and_preserves_existing_hooks() {
        let mut s = settings_with_claude_time();
        merge_claudesk_hooks(&mut s, CMD).unwrap();

        // claude-time survives on every event...
        for event in CLAUDESK_EVENTS {
            let arr = s["hooks"][event].as_array().unwrap();
            assert!(
                arr.iter().any(|g| group_is_claudesk(g, OTHER)),
                "claude-time entry must survive on {event}"
            );
        }
        // notify-telegram survives on Notification...
        let notif = s["hooks"]["Notification"].as_array().unwrap();
        assert!(notif.iter().any(|g| {
            g.get("hooks")
                .and_then(Value::as_array)
                .map(|h| {
                    h.iter().any(|x| {
                        x["command"]
                            .as_str()
                            .unwrap_or("")
                            .contains("notify-telegram")
                    })
                })
                .unwrap_or(false)
        }));
        // ...and exactly one Claudesk group is added per event.
        for event in CLAUDESK_EVENTS {
            assert_eq!(claudesk_group_count(&s, event), 1, "event {event}");
        }
        // The unrelated top-level key is untouched.
        assert_eq!(s["model"], json!("opus"));
    }

    #[test]
    fn merge_is_idempotent() {
        let mut s = settings_with_claude_time();
        let first = merge_claudesk_hooks(&mut s, CMD).unwrap();
        let snapshot = s.clone();
        let second = merge_claudesk_hooks(&mut s, CMD).unwrap();

        assert!(first, "first merge changes the file");
        assert!(!second, "second merge is a no-op (changed=false)");
        assert_eq!(s, snapshot, "second merge leaves the value byte-identical");
        for event in CLAUDESK_EVENTS {
            assert_eq!(
                claudesk_group_count(&s, event),
                1,
                "no duplicate on {event}"
            );
        }
    }

    #[test]
    fn uninstall_removes_only_claudesk_and_restores_shape() {
        let original = settings_with_claude_time();
        let mut s = original.clone();
        merge_claudesk_hooks(&mut s, CMD).unwrap();
        let removed = remove_claudesk_hooks(&mut s, CMD).unwrap();

        assert!(removed);
        // Back to exactly the pre-install value (empty arrays pruned, others kept).
        assert_eq!(
            s, original,
            "uninstall restores the pre-install settings shape"
        );
    }

    #[test]
    fn uninstall_prunes_event_array_emptied_of_everything_but_ours() {
        // An event where Claudesk was the ONLY entry must have its now-empty array
        // dropped, not left as `"SomeEvent": []`.
        let mut s = json!({ "hooks": {} });
        merge_claudesk_hooks(&mut s, CMD).unwrap();
        // Each event array now holds exactly our one group.
        remove_claudesk_hooks(&mut s, CMD).unwrap();
        for event in CLAUDESK_EVENTS {
            assert!(
                s["hooks"].get(event).is_none(),
                "{event} array must be pruned, not left empty"
            );
        }
    }

    #[test]
    fn uninstall_when_nothing_ours_is_noop() {
        let mut s = settings_with_claude_time();
        let snapshot = s.clone();
        let removed = remove_claudesk_hooks(&mut s, CMD).unwrap();
        assert!(!removed);
        assert_eq!(s, snapshot);
    }

    #[test]
    fn two_command_strings_in_one_group_both_detected() {
        // The WP1 doc notes two commands can share one matcher-group's `hooks`
        // array. If a hand-edit ever co-locates ours with claude-time, we must
        // still detect ours (and removing ours must keep claude-time's command).
        let mut s = json!({
            "hooks": {
                "Stop": [
                    { "hooks": [
                        { "type": "command", "command": OTHER },
                        { "type": "command", "command": CMD }
                    ] }
                ]
            }
        });
        // Our marker is present...
        assert_eq!(claudesk_group_count(&s, "Stop"), 1);
        // ...and a re-merge sees us already there (idempotent on the co-located form).
        let changed = merge_claudesk_hooks(&mut s, CMD).unwrap();
        // UserPromptSubmit + Notification get added (were absent); Stop stays as-is.
        assert!(changed);
        let stop = s["hooks"]["Stop"].as_array().unwrap();
        assert_eq!(stop.len(), 1, "no extra Claudesk group appended to Stop");
    }

    // ---- file-level install/uninstall over an injected path ----

    #[test]
    fn install_missing_file_creates_it_with_our_hooks() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("settings.json");
        install(&path, CMD).unwrap();

        assert!(path.exists());
        let written: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        for event in CLAUDESK_EVENTS {
            assert_eq!(claudesk_group_count(&written, event), 1, "event {event}");
        }
    }

    #[test]
    fn install_then_install_again_does_not_rewrite_or_duplicate() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("settings.json");
        // Seed with the real-config shape so we're merging, not creating.
        std::fs::write(
            &path,
            serde_json::to_vec_pretty(&settings_with_claude_time()).unwrap(),
        )
        .unwrap();

        install(&path, CMD).unwrap();
        let after_first = std::fs::read(&path).unwrap();
        install(&path, CMD).unwrap();
        let after_second = std::fs::read(&path).unwrap();

        assert_eq!(
            after_first, after_second,
            "idempotent install must not rewrite the file the second time"
        );
        let v: Value = serde_json::from_slice(&after_second).unwrap();
        for event in CLAUDESK_EVENTS {
            assert_eq!(claudesk_group_count(&v, event), 1, "no dup on {event}");
        }
    }

    #[test]
    fn install_then_uninstall_round_trips_to_original_bytes() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("settings.json");
        let original = serde_json::to_vec_pretty(&settings_with_claude_time()).unwrap();
        // Write original with the same serializer install/uninstall use, plus the
        // trailing newline write_settings adds, so a clean round-trip is byte-exact.
        let mut seeded = original.clone();
        seeded.push(b'\n');
        std::fs::write(&path, &seeded).unwrap();

        install(&path, CMD).unwrap();
        uninstall(&path, CMD).unwrap();

        let after = std::fs::read(&path).unwrap();
        assert_eq!(
            after, seeded,
            "install→uninstall returns the file to its original bytes"
        );
    }

    #[test]
    fn malformed_settings_is_an_error_not_a_wipe() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("settings.json");
        std::fs::write(&path, b"{ not valid json").unwrap();

        let result = install(&path, CMD);
        assert!(matches!(result, Err(HookInstallError::Parse(_))));
        // The malformed file is left intact — never silently overwritten.
        assert_eq!(std::fs::read(&path).unwrap(), b"{ not valid json");
    }

    #[test]
    fn uninstall_missing_file_is_noop() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("does-not-exist.json");
        uninstall(&path, CMD).unwrap(); // no error
        assert!(!path.exists(), "uninstall must not create the file");
    }
}
