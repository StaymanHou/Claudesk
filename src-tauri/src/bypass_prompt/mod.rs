//! M18 WP2 — can Claude Code open THIS session on its "Bypass Permissions mode" warning?
//!
//! ═══════════════════════════════════════════════════════════════════════════════
//! ⚠️ WHY THIS EXISTS: THE AUTO-RESUME INJECT EXITS CC ON THE BYPASS WARNING
//!
//! An account (or profile) that has never accepted the warning opens a bypass-mode CC on
//! "WARNING: Claude Code running in Bypass Permissions mode … ❯ No, exit / Yes, I accept". The
//! cursor starts on "No, exit", so the `\r` ending an injected `/session-restore` exits CC and the
//! session is lost (`SURFACE-2026-11-17-AUTO-RESUME-INJECT-ANSWERS-BYPASS-PERMISSIONS-DIALOG-NO-EXIT`).
//! The same class as the folder-trust dialog ([`crate::folder_trust`]), and the same default D4:
//! **any doubt withholds**. A withheld fire costs one typed command; a wrong fire costs the session.
//!
//! Rust does the file IO and answers one boolean; the fire decision stays in TypeScript
//! (`autoResumeFire.ts` → `shouldInject`).
//!
//! ═══════════════════════════════════════════════════════════════════════════════
//! ⚠️ FACTS, PROBED LIVE AT CC 2.1.327 (2026-11-18, local + the mini) — do not re-derive
//!
//! 1. **When the warning shows.** `--permission-mode bypassPermissions`,
//!    `--dangerously-skip-permissions`, or NO flag with `permissions.defaultMode:
//!    "bypassPermissions"` in the config's `settings.json`. Any other `--permission-mode`
//!    (`default`, `acceptEdits`, `dontAsk`, `auto`, `plan`) shows none, even over a bypass
//!    `defaultMode`: the flag overrides it.
//! 2. **What clears it.** `"skipDangerousModePermissionPrompt": true` (a JSON boolean) in the
//!    config's `settings.json`: `~/.claude/settings.json` for the default profile, or
//!    `$CLAUDE_CONFIG_DIR/settings.json` for a profile. Accepting the warning writes exactly that
//!    and nothing bypass-related elsewhere. `false` or the STRING `"true"` still show it. A `true`
//!    in the PROJECT's `.claude/settings.json` is ignored.
//! 3. **⚠️ Accepted gap (operator ruling, 2026-11-18):** a `true` in the project's
//!    `.claude/settings.local.json` ALSO clears it, and this module does not read that file. Such
//!    a project withholds (one typed command), never loses the session.
//! 4. **Order:** an untrusted folder shows the folder-trust dialog FIRST, then this warning.
//!
//! ⚠️ **Which arm is live today.** Only DEFAULT-profile rows reach the restore arm (a profile row
//! has none: F-b ruling 4, `config_store::profiles::workflow_applicable`), and Recycle is gated the
//! same way, so in practice every session asked about here is a [`SpawnPermission::Flag`]. The
//! [`SpawnPermission::Unflagged`] arm is defensive: it stays correct if profile rows ever gain the arm.
//!
//! The probe table: the archived WIP `m18-wp2-fresh-account-hardening.md` → "Probe outcomes".

pub mod commands;

use std::path::{Path, PathBuf};

use crate::cc_session::{CcPermissionMode, SpawnPermission};
use crate::config_store::profiles::ConfigTarget;

/// The CC key that records an accepted bypass warning (fact 2).
pub const ACCEPTED_KEY: &str = "skipDangerousModePermissionPrompt";

/// The `settings.json` CC reads the key from, for a resolved profile (fact 2).
///
/// ⚠️ Inside `~/.claude/` for the default profile. This is NOT the trust record's file, which is
/// `~/.claude.json`, a sibling ([`crate::folder_trust::claude_json_path`]).
pub fn settings_path(home: &Path, target: &ConfigTarget) -> PathBuf {
    match target {
        ConfigTarget::Default => home.join(".claude").join("settings.json"),
        ConfigTarget::Dir(dir) => dir.join("settings.json"),
    }
}

/// What a config's `settings.json` says about the warning.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SettingsFacts {
    /// [`ACCEPTED_KEY`] is JSON `true`.
    pub accepted: bool,
    /// `permissions.defaultMode` is `"bypassPermissions"`: `Some(true)`/`Some(false)` when known,
    /// `None` when it cannot be known (an unreadable or malformed file, or a REMOTE config, whose
    /// `defaultMode` is not read over the link).
    pub default_mode_bypass: Option<bool>,
}

/// Read [`SettingsFacts`] from the text of a `settings.json`. Malformed JSON, or JSON that is not
/// an object, knows nothing: not accepted, `defaultMode` unknown.
pub fn facts_from_text(text: &str) -> SettingsFacts {
    let Ok(serde_json::Value::Object(map)) = serde_json::from_str::<serde_json::Value>(text) else {
        return SettingsFacts {
            accepted: false,
            default_mode_bypass: None,
        };
    };
    SettingsFacts {
        accepted: map.get(ACCEPTED_KEY) == Some(&serde_json::Value::Bool(true)),
        default_mode_bypass: Some(
            map.get("permissions")
                .and_then(|p| p.get("defaultMode"))
                .and_then(serde_json::Value::as_str)
                == Some("bypassPermissions"),
        ),
    }
}

/// [`SettingsFacts`] for the `settings.json` at `path`. A MISSING file is a known answer (CC runs
/// with its defaults: not accepted, `defaultMode` not bypass); any other read failure is doubt.
pub fn facts_on_disk(path: &Path) -> SettingsFacts {
    match std::fs::read_to_string(path) {
        Ok(text) => facts_from_text(&text),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => SettingsFacts {
            accepted: false,
            default_mode_bypass: Some(false),
        },
        Err(_) => SettingsFacts {
            accepted: false,
            default_mode_bypass: None,
        },
    }
}

/// THE decision: can a session started as `permission` NOT open on the bypass warning, given its
/// config's `facts`? `true` = nothing to withhold for. `None` (no such session) is doubt: `false`.
///
/// - [`SpawnPermission::NoStart`]: no CC started, no startup dialog.
/// - [`SpawnPermission::Flag`]: only `bypassPermissions` can show it (fact 1), and then only an
///   accepted key clears it.
/// - [`SpawnPermission::Unflagged`]: the config's `defaultMode` decides whether it can show; an
///   accepted key clears it either way. An unknown `defaultMode` is doubt.
pub fn dialog_cleared(permission: Option<SpawnPermission>, facts: SettingsFacts) -> bool {
    match permission {
        None => false,
        Some(SpawnPermission::NoStart) => true,
        Some(SpawnPermission::Flag(mode)) => {
            mode != CcPermissionMode::BypassPermissions || facts.accepted
        }
        Some(SpawnPermission::Unflagged) => {
            facts.accepted || facts.default_mode_bypass == Some(false)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use CcPermissionMode::*;

    const ACCEPTED: SettingsFacts = SettingsFacts {
        accepted: true,
        default_mode_bypass: Some(true),
    };
    const NOT_ACCEPTED: SettingsFacts = SettingsFacts {
        accepted: false,
        default_mode_bypass: Some(false),
    };

    #[test]
    fn settings_path_is_inside_dot_claude_for_the_default_profile() {
        let home = Path::new("/h");
        assert_eq!(
            settings_path(home, &ConfigTarget::Default),
            PathBuf::from("/h/.claude/settings.json")
        );
        assert_eq!(
            settings_path(home, &ConfigTarget::Dir("/p/prof".into())),
            PathBuf::from("/p/prof/settings.json")
        );
    }

    #[test]
    fn only_a_json_true_key_counts_as_accepted() {
        // Probe fact 2: `false` and the STRING "true" still show the warning.
        assert!(facts_from_text(r#"{"skipDangerousModePermissionPrompt": true}"#).accepted);
        for text in [
            r#"{"skipDangerousModePermissionPrompt": false}"#,
            r#"{"skipDangerousModePermissionPrompt": "true"}"#,
            r#"{"skipDangerousModePermissionPrompt": 1}"#,
            r#"{"theme": "dark"}"#,
            r#"{}"#,
            r#"not json"#,
            r#"[true]"#,
        ] {
            assert!(!facts_from_text(text).accepted, "{text}");
        }
    }

    #[test]
    fn default_mode_is_read_and_a_malformed_file_is_unknown() {
        assert_eq!(
            facts_from_text(r#"{"permissions": {"defaultMode": "bypassPermissions"}}"#)
                .default_mode_bypass,
            Some(true)
        );
        assert_eq!(
            facts_from_text(r#"{"permissions": {"defaultMode": "acceptEdits"}}"#)
                .default_mode_bypass,
            Some(false)
        );
        assert_eq!(facts_from_text(r#"{}"#).default_mode_bypass, Some(false));
        assert_eq!(facts_from_text("{oops").default_mode_bypass, None);
    }

    #[test]
    fn a_missing_file_is_known_defaults_and_an_unreadable_one_is_doubt() {
        let dir = tempfile::tempdir().unwrap();
        let missing = facts_on_disk(&dir.path().join("settings.json"));
        assert_eq!(missing, NOT_ACCEPTED);
        // A directory where the file should be: a read error that is not NotFound.
        let unreadable = facts_on_disk(dir.path());
        assert!(!unreadable.accepted);
        assert_eq!(unreadable.default_mode_bypass, None);
        let file = dir.path().join("s.json");
        std::fs::write(&file, r#"{"skipDangerousModePermissionPrompt": true}"#).unwrap();
        assert!(facts_on_disk(&file).accepted);
    }

    #[test]
    fn a_bypass_flag_needs_the_key_and_every_other_flag_shows_no_warning() {
        // Probe fact 1: only `bypassPermissions` shows it, even over a bypass `defaultMode`.
        let bypass_default_not_accepted = SettingsFacts {
            accepted: false,
            default_mode_bypass: Some(true),
        };
        assert!(!dialog_cleared(
            Some(SpawnPermission::Flag(BypassPermissions)),
            bypass_default_not_accepted
        ));
        assert!(dialog_cleared(
            Some(SpawnPermission::Flag(BypassPermissions)),
            ACCEPTED
        ));
        for mode in [Default, AcceptEdits, Plan, Auto, DontAsk] {
            assert!(
                dialog_cleared(
                    Some(SpawnPermission::Flag(mode)),
                    bypass_default_not_accepted
                ),
                "{mode:?}"
            );
        }
    }

    #[test]
    fn an_unflagged_spawn_follows_the_default_mode_and_doubt_withholds() {
        let unflagged = Some(SpawnPermission::Unflagged);
        assert!(dialog_cleared(unflagged, NOT_ACCEPTED));
        assert!(dialog_cleared(unflagged, ACCEPTED));
        assert!(!dialog_cleared(
            unflagged,
            SettingsFacts {
                accepted: false,
                default_mode_bypass: Some(true),
            }
        ));
        assert!(!dialog_cleared(
            unflagged,
            SettingsFacts {
                accepted: false,
                default_mode_bypass: None,
            }
        ));
    }

    #[test]
    fn no_start_is_clear_and_an_unknown_session_is_doubt() {
        let worst = SettingsFacts {
            accepted: false,
            default_mode_bypass: None,
        };
        assert!(dialog_cleared(Some(SpawnPermission::NoStart), worst));
        assert!(!dialog_cleared(None, ACCEPTED));
    }
}
