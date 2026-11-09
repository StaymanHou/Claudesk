//! paydown-2026-11-08 WP5 — has Claude Code's folder-trust dialog already been accepted for a
//! project?
//!
//! ═══════════════════════════════════════════════════════════════════════════════
//! ⚠️ WHY THIS EXISTS: THE AUTO-RESUME INJECT EXITS CC ON AN UNTRUSTED FOLDER
//!
//! The first time CC opens a folder it has never trusted, it shows "Quick safety check: … trust
//! this folder?", whose default answer is "No, exit". The auto-resume inject types
//! `/session-restore\r` 1500 ms after spawn, and that `\r` picks the default, so CC quits and the
//! session is lost (`SURFACE-2026-11-03-AUTO-RESUME-FIRES-INTO-THE-FOLDER-TRUST-PROMPT`). Ruling
//! R1: read CC's own trust record before firing, and withhold when the folder is not trusted.
//! Default D4: **any doubt withholds** (missing or unreadable file, malformed JSON, no matching
//! key, a value other than JSON `true`). A withheld fire costs one typed command; a wrong fire
//! costs the session.
//!
//! Like the transcript reader (M15 R-4), Rust does the file IO and answers one boolean; the fire
//! decision stays in TypeScript (`autoResumeFire.ts` → `shouldInject`).
//!
//! ═══════════════════════════════════════════════════════════════════════════════
//! ⚠️ THREE FACTS, PROBED LIVE AT CC 2.1.319 (2026-11-09) — do not re-derive from memory
//!
//! 1. **Where the record is.** Default profile: `$HOME/.claude.json`, a SIBLING of `~/.claude/`,
//!    not inside it. A listed profile: `$CLAUDE_CONFIG_DIR/.claude.json`. See
//!    [`claude_json_path`] — joining onto the transcript root (`~/.claude`) is the wrong file.
//! 2. **The key.** `projects["<absolute physical path>"].hasTrustDialogAccepted`, no trailing
//!    slash; macOS `/tmp` paths appear as `/private/tmp/...`, so the path is canonicalized first.
//! 3. **⚠️ CC trusts by ANCESTOR WALK, not by exact key.** A folder is trusted when it or ANY
//!    ancestor has `hasTrustDialogAccepted: true`. A nearer `false` does NOT override a farther
//!    `true`: a child whose own key is `false` under a trusted parent opens with no prompt. So
//!    an exact-key lookup would wrongly withhold every project nested under a trusted folder.
//!    (CC also writes its entry keyed by the git ROOT, not the cwd, which the walk covers.)
//!
//! The probe table: the archived WIP `paydown-2026-11-08-wp5-auto-resume-folder-trust.md` →
//! "Probe outcomes".

pub mod commands;

use std::path::{Path, PathBuf};

use crate::config_store::profiles::ConfigTarget;

/// The file CC keeps its per-folder trust record in, for a resolved profile.
///
/// ⚠️ The default profile's file is `<home>/.claude.json`, NOT `<home>/.claude/.claude.json`
/// (fact 1 in the module docs).
pub fn claude_json_path(home: &Path, target: &ConfigTarget) -> PathBuf {
    match target {
        ConfigTarget::Default => home.join(".claude.json"),
        ConfigTarget::Dir(dir) => dir.join(".claude.json"),
    }
}

/// Whether `project_path` is trusted according to the text of a `.claude.json`.
///
/// Trusted ⇔ the canonicalized path or any ancestor has `hasTrustDialogAccepted` equal to JSON
/// `true` (fact 3). Anything else is `false`, including malformed JSON and non-boolean values.
/// A path that cannot be canonicalized (it does not exist) is used as given.
pub fn is_trusted(claude_json: &str, project_path: &Path) -> bool {
    let Ok(root) = serde_json::from_str::<serde_json::Value>(claude_json) else {
        return false;
    };
    let Some(projects) = root.get("projects").and_then(|p| p.as_object()) else {
        return false;
    };
    let physical = project_path
        .canonicalize()
        .unwrap_or_else(|_| project_path.to_path_buf());
    physical.ancestors().any(|dir| {
        dir.to_str()
            .and_then(|key| projects.get(key))
            .and_then(|entry| entry.get("hasTrustDialogAccepted"))
            .and_then(serde_json::Value::as_bool)
            == Some(true)
    })
}

/// Read the trust record from disk. Any read error is `false` (D4).
pub fn is_trusted_on_disk(claude_json: &Path, project_path: &Path) -> bool {
    std::fs::read_to_string(claude_json).is_ok_and(|text| is_trusted(&text, project_path))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A `.claude.json` with the given `(path, value)` trust entries, values as raw JSON.
    fn json(entries: &[(&str, &str)]) -> String {
        let body = entries
            .iter()
            .map(|(k, v)| format!("{k:?}: {{\"hasTrustDialogAccepted\": {v}}}"))
            .collect::<Vec<_>>()
            .join(", ");
        format!("{{\"numStartups\": 3, \"projects\": {{{body}}}}}")
    }

    // Paths under `/u/` do not exist, so `canonicalize` fails and they are used as given; that
    // keeps these cases about the WALK, not about the machine's filesystem.

    #[test]
    fn an_exact_true_key_is_trusted() {
        assert!(is_trusted(&json(&[("/u/p", "true")]), Path::new("/u/p")));
    }

    #[test]
    fn a_child_of_a_trusted_folder_is_trusted_with_no_key_of_its_own() {
        // Probe row 3: `…/scratch-a/probe-child` opened with no prompt.
        assert!(is_trusted(
            &json(&[("/u/p", "true")]),
            Path::new("/u/p/child")
        ));
    }

    #[test]
    fn a_nearer_false_does_not_override_a_farther_true() {
        // Probe rows 4 and 5: own `false` (and parent `false`) under a trusted ancestor.
        let text = json(&[("/u/p/child", "false"), ("/u/p", "false"), ("/u", "true")]);
        assert!(is_trusted(&text, Path::new("/u/p/child")));
    }

    #[test]
    fn no_true_on_the_path_or_any_ancestor_is_untrusted() {
        // Probe row 1 (the positive control: the prompt DID appear).
        let text = json(&[
            ("/u/p", "false"),
            ("/u/other", "true"),
            ("/u/p/child/deeper", "true"),
        ]);
        assert!(!is_trusted(&text, Path::new("/u/p/child")));
    }

    #[test]
    fn a_sibling_with_a_shared_prefix_is_not_an_ancestor() {
        // `/u/p` must not trust `/u/pp`: the walk is by path component, never by string prefix.
        assert!(!is_trusted(&json(&[("/u/p", "true")]), Path::new("/u/pp")));
    }

    #[test]
    fn only_json_true_counts() {
        for v in ["\"true\"", "1", "null", "{}", "false"] {
            assert!(
                !is_trusted(&json(&[("/u/p", v)]), Path::new("/u/p")),
                "{v} must not read as trusted"
            );
        }
    }

    #[test]
    fn a_missing_field_a_missing_projects_map_or_bad_json_is_untrusted() {
        assert!(!is_trusted(
            r#"{"projects": {"/u/p": {}}}"#,
            Path::new("/u/p")
        ));
        assert!(!is_trusted(r#"{"numStartups": 1}"#, Path::new("/u/p")));
        assert!(!is_trusted(r#"{"projects": []}"#, Path::new("/u/p")));
        assert!(!is_trusted("{\"projects\": {", Path::new("/u/p")));
        assert!(!is_trusted("", Path::new("/u/p")));
    }

    #[test]
    fn the_path_is_canonicalized_so_a_symlink_reaches_the_physical_key() {
        // Probe row 6: CC resolves the realpath. A key written under the physical path must be
        // found through a symlink to it.
        let base =
            std::env::temp_dir().join(format!("claudesk-folder-trust-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let real = base.join("real");
        std::fs::create_dir_all(&real).unwrap();
        let link = base.join("link");
        std::os::unix::fs::symlink(&real, &link).unwrap();
        let physical = real.canonicalize().unwrap();
        let text = json(&[(physical.to_str().unwrap(), "true")]);
        assert!(
            is_trusted(&text, &link),
            "a symlinked path must reach the physical key"
        );
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn the_default_profile_record_is_a_sibling_of_dot_claude_not_inside_it() {
        assert_eq!(
            claude_json_path(Path::new("/h"), &ConfigTarget::Default),
            PathBuf::from("/h/.claude.json")
        );
        assert_eq!(
            claude_json_path(
                Path::new("/h"),
                &ConfigTarget::Dir(PathBuf::from("/h/.config/claude-neo"))
            ),
            PathBuf::from("/h/.config/claude-neo/.claude.json")
        );
    }

    #[test]
    fn a_missing_file_on_disk_is_untrusted() {
        assert!(!is_trusted_on_disk(
            Path::new("/definitely/not/here/.claude.json"),
            Path::new("/u/p")
        ));
    }

    #[test]
    fn a_trusted_record_on_disk_is_read() {
        let dir =
            std::env::temp_dir().join(format!("claudesk-folder-trust-disk-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join(".claude.json");
        std::fs::write(&file, json(&[("/u/p", "true")])).unwrap();
        assert!(is_trusted_on_disk(&file, Path::new("/u/p/child")));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
