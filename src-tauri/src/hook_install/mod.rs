//! Claudesk CC-hook registration in `~/.claude/settings.json`.
//!
//! Claudesk reports each workspace's CC lifecycle (idle/running/awaiting-input)
//! from CC's official hook channel, not by scraping PTY output (see `CLAUDE.md` →
//! "PTY byte-injection for input; hook channel for state"). To receive those
//! events it must register a hook script for the lifecycle events in the user's
//! `~/.claude/settings.json` (see [`CLAUDESK_EVENTS`]).
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
//! - **Idempotent + self-healing** — re-running install adds nothing when our
//!   entry is already current; if the command *format* changed (e.g. the
//!   2026-06-22 shell-quoting fix), it replaces the stale entry in place rather
//!   than duplicating. Detection keys on the script *basename*
//!   ([`script_basename_of_command`]), not the full command string.
//! - **Per-identity (dev/prod isolation, 2026-06-24)** — the basename is
//!   identity-specific (`claudesk-hook.pl` vs `claudesk-hook-dev.pl`), matched
//!   EXACTLY, so the installed prod build and `pnpm tauri:dev` each own a separate
//!   matcher-group in the shared `settings.json` and never touch each other's.
//! - **Reversible** — [`uninstall`] removes only THIS identity's groups, pruning a
//!   now-empty event array, and leaves everything else (incl. the OTHER identity's
//!   Claudesk group) byte-for-byte.
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

/// The lifecycle events Claudesk registers for. The state mapping itself lives in
/// the broadcaster (`status_broadcaster::event_to_state`), not here:
/// `UserPromptSubmit` → Running, `Stop` → Idle, `Notification` → AwaitingInput
/// (gated on `notification_type`), `PostToolUse` → Running.
///
/// `PostToolUse` was added (QoL-WP2, 2026-06-25) as the **resume signal**: when a
/// user answers an `AskUserQuestion`/permission prompt mid-turn, CC fires
/// `PostToolUse` and resumes working, but emits NO `UserPromptSubmit` (that's
/// top-level prompts only). Without registering `PostToolUse` the indicator stayed
/// stuck at AwaitingInput until the eventual `Stop`. `PreToolUse` is deliberately
/// NOT registered — the initial `UserPromptSubmit`→Running already covers a turn's
/// pre-tool state, and `PostToolUse` alone clears AwaitingInput on resume.
pub const CLAUDESK_EVENTS: [&str; 4] = ["UserPromptSubmit", "Stop", "Notification", "PostToolUse"];

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

/// Extract the hook-script basename (`claudesk-hook.pl` / `claudesk-hook-dev.pl`)
/// from a registered `command` string of the shape
/// `CLAUDESK_HOOK_SOCK='…' /usr/bin/perl '<script-path>'`. Returns the basename of
/// the last whitespace-delimited token that ends in `.pl`, with surrounding single
/// quotes stripped — `None` if no `.pl` token is present.
///
/// Detection keys on this **basename**, not the full `command` string, for two
/// reasons: (1) a change to the command *format* (e.g. the 2026-06-22 shell-quoting
/// fix) must still be recognized as "ours" so install self-heals the stale entry
/// rather than duplicating it; (2) — the dev/prod-isolation reason (2026-06-24) —
/// the basename is per-identity (`claudesk-hook.pl` vs `claudesk-hook-dev.pl`), so
/// matching on it lets the prod build and the dev build each own a SEPARATE
/// matcher-group in the shared `~/.claude/settings.json` without touching the
/// other's. Matching is EXACT (`==`), never substring: `claudesk-hook.pl` is a
/// substring of `claudesk-hook-dev.pl`, so a `.contains()` test would make prod
/// falsely adopt/replace dev's group (the "substring trap").
fn script_basename_of_command(command: &str) -> Option<&str> {
    // ASSUMPTION: no `.pl`-suffixed path segment contains a space — the split_whitespace
    // would break the `.pl` tail token off. Holds for every command Claudesk emits and for
    // the real macOS `/Application Support/…` path (the `.pl` tail token survives the split);
    // defensive-only since inputs are app-controlled.
    command
        .split_whitespace()
        .map(|tok| tok.trim_matches('\''))
        .rfind(|tok| tok.ends_with(".pl"))
        .map(|path| path.rsplit('/').next().unwrap_or(path))
}

/// Does this matcher-group register the SAME Claudesk hook identity as `command`?
/// True iff any of the group's `hooks[].command` strings embeds a script whose
/// basename EXACTLY equals `command`'s script basename. Per-identity by
/// construction: a prod `command` matches only prod groups, a dev `command` only
/// dev groups (see [`script_basename_of_command`]). A `command` with no `.pl`
/// token matches nothing.
fn group_is_claudesk(group: &Value, command: &str) -> bool {
    let Some(want) = script_basename_of_command(command) else {
        return false;
    };
    group
        .get("hooks")
        .and_then(Value::as_array)
        .map(|hooks| {
            hooks.iter().any(|h| {
                h.get("command")
                    .and_then(Value::as_str)
                    .and_then(script_basename_of_command)
                    .map(|have| have == want)
                    .unwrap_or(false)
            })
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
/// [`CLAUDESK_EVENTS`]. Additive: existing non-Claudesk matcher-groups are
/// preserved untouched. For the Claudesk entry, detection is by the stable
/// script-path marker ([`group_is_claudesk`]):
/// - no Claudesk group present → append `command`;
/// - a Claudesk group present with the **same** `command` → no-op (idempotent);
/// - a Claudesk group present with a **different** `command` (e.g. an older,
///   pre-quoting format) → replace it with the current `command` (self-heals a
///   command-format change on next launch — see the 2026-06-22 shell-quoting fix).
///
/// Returns `true` if anything changed (the caller skips the write when not).
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

        // Find an existing Claudesk group (by stable script-path marker).
        match arr.iter_mut().find(|g| group_is_claudesk(g, command)) {
            Some(existing) => {
                // Already ours. If the command text drifted (format change),
                // replace in place so the stale/broken entry self-heals; else
                // leave it untouched (idempotent).
                let want = claudesk_group(command);
                if *existing != want {
                    *existing = want;
                    changed = true;
                }
            }
            None => {
                arr.push(claudesk_group(command));
                changed = true;
            }
        }
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
/// `command` for all [`CLAUDESK_EVENTS`]. Idempotent — re-running is a no-op write-skip.
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
                ],
                // claude-time also taps PostToolUse on the real machine — keep the
                // fixture faithful so the additive-merge invariant is tested against
                // the production shape for every CLAUDESK_EVENT (QoL-WP2 added it).
                "PostToolUse": [
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
    fn merge_into_empty_settings_creates_a_group_per_event() {
        let mut s = json!({});
        let changed = merge_claudesk_hooks(&mut s, CMD).unwrap();
        assert!(changed);
        for event in CLAUDESK_EVENTS {
            assert_eq!(claudesk_group_count(&s, event), 1, "event {event}");
        }
    }

    #[test]
    fn claudesk_events_includes_post_tool_use_resume_signal() {
        // QoL-WP2: PostToolUse is the resume signal that clears stuck AwaitingInput
        // after an answered AskUserQuestion/permission prompt. Pin that it's
        // registered (and PreToolUse deliberately is NOT — see the const doc).
        assert!(
            CLAUDESK_EVENTS.contains(&"PostToolUse"),
            "PostToolUse must be registered as the answer-resume signal"
        );
        assert!(
            !CLAUDESK_EVENTS.contains(&"PreToolUse"),
            "PreToolUse is deliberately NOT registered (UserPromptSubmit covers pre-tool state)"
        );
        // The three original M3 events are still present.
        for ev in ["UserPromptSubmit", "Stop", "Notification"] {
            assert!(CLAUDESK_EVENTS.contains(&ev), "{ev} must remain registered");
        }
    }

    #[test]
    fn merge_is_additive_and_preserves_existing_hooks() {
        let mut s = settings_with_claude_time();
        merge_claudesk_hooks(&mut s, CMD).unwrap();

        // claude-time survives on every event... (detect by its OWN command —
        // group_is_claudesk now keys on the claudesk-hook.pl marker, so check the
        // raw command string for the claude-time path here).
        let has_claude_time = |g: &Value| {
            g.get("hooks")
                .and_then(Value::as_array)
                .map(|h| h.iter().any(|x| x["command"].as_str() == Some(OTHER)))
                .unwrap_or(false)
        };
        for event in CLAUDESK_EVENTS {
            let arr = s["hooks"][event].as_array().unwrap();
            assert!(
                arr.iter().any(has_claude_time),
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
    fn merge_self_heals_a_stale_claudesk_command_in_place() {
        // Regression (2026-06-22): a prior launch registered an UNQUOTED command
        // that word-split under /bin/sh because the macOS app-data path has a
        // space. The fix changed the command FORMAT (now shell-quoted). On the
        // next launch, merge must recognize the stale entry (by the
        // claudesk-hook.pl marker), REPLACE it in place with the corrected
        // command, and NOT append a duplicate — so the broken entry self-heals.
        const STALE: &str =
            "CLAUDESK_HOOK_SOCK=/Users/me/Library/Application Support/com.claudesk.app/hook.sock \
             /usr/bin/perl /Users/me/Library/Application Support/com.claudesk.app/claudesk-hook.pl";
        const FIXED: &str =
            "CLAUDESK_HOOK_SOCK='/Users/me/Library/Application Support/com.claudesk.app/hook.sock' \
             /usr/bin/perl '/Users/me/Library/Application Support/com.claudesk.app/claudesk-hook.pl'";

        let mut s = json!({
            "hooks": {
                "UserPromptSubmit": [
                    { "hooks": [ { "type": "command", "command": OTHER } ] },
                    { "hooks": [ { "type": "command", "command": STALE } ] }
                ],
                "Stop": [
                    { "hooks": [ { "type": "command", "command": STALE } ] }
                ],
                "Notification": [
                    { "hooks": [ { "type": "command", "command": STALE } ] }
                ]
            }
        });

        let changed = merge_claudesk_hooks(&mut s, FIXED).unwrap();
        assert!(changed, "replacing the stale command must report a change");

        for event in CLAUDESK_EVENTS {
            // Exactly one Claudesk group per event (no duplicate appended)...
            assert_eq!(claudesk_group_count(&s, event), 1, "event {event}");
            // ...and its command is the FIXED (quoted) form, not the stale one.
            let cmds: Vec<&str> = s["hooks"][event]
                .as_array()
                .unwrap()
                .iter()
                .flat_map(|g| g["hooks"].as_array().unwrap())
                .filter_map(|h| h["command"].as_str())
                .collect();
            assert!(
                cmds.contains(&FIXED),
                "{event} must carry the fixed command"
            );
            assert!(
                !cmds.contains(&STALE),
                "{event} must NOT keep the stale command"
            );
        }
        // claude-time (OTHER) on UserPromptSubmit is untouched.
        let ups = s["hooks"]["UserPromptSubmit"].as_array().unwrap();
        assert!(ups
            .iter()
            .any(|g| g["hooks"][0]["command"].as_str() == Some(OTHER)));

        // And a second merge with the same FIXED command is now a no-op.
        let again = merge_claudesk_hooks(&mut s, FIXED).unwrap();
        assert!(!again, "re-merge of the fixed command is idempotent");
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

    // ---- dev/prod isolation: per-identity coexistence (Phase 2, 2026-06-24) ----

    /// The prod and dev registered commands, embedding their distinct script
    /// basenames (the real shell-quoted shape).
    const CMD_PROD: &str = "CLAUDESK_HOOK_SOCK='/data/com.claudesk.app/hook.sock' \
         /usr/bin/perl '/data/com.claudesk.app/claudesk-hook.pl'";
    const CMD_DEV: &str = "CLAUDESK_HOOK_SOCK='/data/com.claudesk.app.dev/hook.sock' \
         /usr/bin/perl '/data/com.claudesk.app.dev/claudesk-hook-dev.pl'";

    #[test]
    fn script_basename_extraction_strips_quotes_and_dir() {
        assert_eq!(
            script_basename_of_command(CMD_PROD),
            Some("claudesk-hook.pl")
        );
        assert_eq!(
            script_basename_of_command(CMD_DEV),
            Some("claudesk-hook-dev.pl")
        );
        // A command with no .pl token matches nothing.
        assert_eq!(script_basename_of_command("/usr/bin/perl --version"), None);
    }

    #[test]
    fn substring_trap_closed_prod_marker_does_not_match_dev_group() {
        // `claudesk-hook.pl` is a substring of `claudesk-hook-dev.pl`. The match
        // MUST be basename-exact, so a prod command must NOT classify a dev group
        // as its own (and vice-versa) — else isolation silently breaks.
        let dev_group = json!({ "hooks": [ { "type": "command", "command": CMD_DEV } ] });
        let prod_group = json!({ "hooks": [ { "type": "command", "command": CMD_PROD } ] });

        assert!(
            !group_is_claudesk(&dev_group, CMD_PROD),
            "prod must NOT match dev group"
        );
        assert!(
            !group_is_claudesk(&prod_group, CMD_DEV),
            "dev must NOT match prod group"
        );
        // Sanity: each matches its own.
        assert!(group_is_claudesk(&prod_group, CMD_PROD));
        assert!(group_is_claudesk(&dev_group, CMD_DEV));
    }

    #[test]
    fn prod_and_dev_groups_coexist_per_event() {
        // Install prod, then dev, into the same settings — both must be present as
        // SEPARATE matcher-groups on every event (dev must not replace prod).
        let mut s = settings_with_claude_time();
        merge_claudesk_hooks(&mut s, CMD_PROD).unwrap();
        let dev_changed = merge_claudesk_hooks(&mut s, CMD_DEV).unwrap();
        assert!(dev_changed, "registering dev alongside prod is a change");

        for event in CLAUDESK_EVENTS {
            let arr = s["hooks"][event].as_array().unwrap();
            let prod_groups = arr
                .iter()
                .filter(|g| group_is_claudesk(g, CMD_PROD))
                .count();
            let dev_groups = arr.iter().filter(|g| group_is_claudesk(g, CMD_DEV)).count();
            assert_eq!(prod_groups, 1, "exactly one prod group on {event}");
            assert_eq!(dev_groups, 1, "exactly one dev group on {event}");
        }
    }

    #[test]
    fn uninstall_dev_leaves_prod_group_intact() {
        let mut s = settings_with_claude_time();
        merge_claudesk_hooks(&mut s, CMD_PROD).unwrap();
        merge_claudesk_hooks(&mut s, CMD_DEV).unwrap();

        // Uninstall ONLY dev.
        let removed = remove_claudesk_hooks(&mut s, CMD_DEV).unwrap();
        assert!(removed);
        for event in CLAUDESK_EVENTS {
            let arr = s["hooks"][event].as_array().unwrap();
            assert_eq!(
                arr.iter()
                    .filter(|g| group_is_claudesk(g, CMD_PROD))
                    .count(),
                1,
                "prod group survives dev uninstall on {event}"
            );
            assert_eq!(
                arr.iter().filter(|g| group_is_claudesk(g, CMD_DEV)).count(),
                0,
                "dev group is gone on {event}"
            );
        }
    }

    #[test]
    fn same_identity_remerge_still_idempotent_with_other_identity_present() {
        // With BOTH identities registered, re-merging prod is a no-op (doesn't
        // touch dev, doesn't duplicate prod) — coexistence preserves idempotency.
        let mut s = settings_with_claude_time();
        merge_claudesk_hooks(&mut s, CMD_PROD).unwrap();
        merge_claudesk_hooks(&mut s, CMD_DEV).unwrap();
        let snapshot = s.clone();

        let prod_again = merge_claudesk_hooks(&mut s, CMD_PROD).unwrap();
        assert!(
            !prod_again,
            "re-merge of prod is a no-op when already present"
        );
        assert_eq!(
            s, snapshot,
            "re-merge leaves both identities byte-identical"
        );
    }
}
