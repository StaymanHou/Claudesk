//! The REMOTE refuse-guard (M18 WP7, `arch/claude-substrate.md` §R.3) — the remote analogue of
//! [`super::guard`], built before the remote deleting path exists, in the same shape.
//!
//! ## What this is
//! The single authority on what a remote Uninstall may remove. The deleting script
//! ([`super::remote_ops::uninstall_script`]) takes an [`ApprovedRemoteClone`], whose fields are
//! private and whose only constructor is [`remote_refuse_guard`]. So "the remote delete goes
//! through the guard" is enforced by the compiler (`error[E0451]` for a struct literal outside this
//! module), not by review.
//!
//! ## Its inputs: the host's record NOW, and what the host observes
//! Never the cached `HostSubstrate` (a readout can be stale) and never a caller's path. The record
//! is the one the host holds at the moment of the check, read by the same exec that observes the
//! paths ([`HostObservation`], built by `remote_ops::parse_observation` from a `pwd -P`-style
//! resolution ON THE HOST: a remote path cannot be canonicalized here).
//!
//! ## What it refuses (each arm is the local guard's, with the same `RefusalReason`)
//! - no well-formed record (absent, unreadable and corrupt all collapse to `None` upstream);
//! - the recorded clone path does not resolve on the host;
//! - the resolved target IS a protected root, or sits inside a `.claude`, or CONTAINS a protected
//!   root (an ancestor of one; `/` included);
//! - the target is not a directory, or carries no `uninstall.sh`.
//!
//! ⚠️ **The protected roots are the install root AND the account's real `$HOME`, each with its
//! `.claude`** (WP7 D5). They are the same in production; under the debug sandbox override they
//! differ, and a record pointing at the account's real home must still be refused.
//!
//! ## Belt and braces
//! The approved target is re-checked ON THE HOST by the deleting script (the record's bytes and the
//! path's physical form, WP7 D6), and `uninstall.sh` itself refuses links outside its own repo.
//! This guard is the first line, not the only one.

use std::path::Path;

use super::guard::RefusalReason;
use super::provenance::InstallRecord;

/// What one exec on the host observed, for the guard. Every path is the host's physical form
/// (symlinks resolved), or `None` when it does not exist there.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HostObservation {
    /// The install root (normally the account's `$HOME`; the sandbox under the debug override).
    pub root: String,
    /// `<root>/.claude`, when it exists.
    pub root_claude: Option<String>,
    /// The account's own `$HOME`.
    pub home: String,
    /// `$HOME/.claude`, when it exists.
    pub home_claude: Option<String>,
    /// The record's `clone_path`, resolved; `None` when it does not resolve.
    pub target: Option<String>,
    /// The resolved target is a directory.
    pub target_is_dir: bool,
    /// The resolved target holds a regular `uninstall.sh`.
    pub has_uninstall: bool,
    /// The record's bytes as the host read them (hex), so the deleting script can tell whether the
    /// record changed after this check.
    pub record_hex: String,
}

/// A remote clone the refuse-guard approved: what Uninstall removes AND what Update pulls and
/// re-installs (hence named for neither). Private fields, one constructor:
/// [`remote_refuse_guard`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApprovedRemoteClone {
    clone_dir: String,
    root: String,
    record_hex: String,
}

impl ApprovedRemoteClone {
    /// The approved clone directory: the host's physical path.
    pub fn clone_dir(&self) -> &str {
        &self.clone_dir
    }
    /// The install root, physical: `uninstall.sh` runs with `HOME=` this.
    pub fn root(&self) -> &str {
        &self.root
    }
    /// The record's bytes (hex) as the guard saw them.
    pub fn record_hex(&self) -> &str {
        &self.record_hex
    }
}

/// The `.claude` of a root: the observed one, or its literal form when it does not exist (a
/// literal still compares correctly against a resolved target, as the local guard's fallback).
fn claude_of(observed: &Option<String>, root: &str) -> String {
    observed
        .clone()
        .unwrap_or_else(|| format!("{root}/.claude"))
}

/// The remote refuse-guard: the host's record + the host's observation → an approved
/// [`ApprovedRemoteClone`], or a [`RefusalReason`]. Pure.
pub fn remote_refuse_guard(
    record: Option<&InstallRecord>,
    obs: &HostObservation,
) -> Result<ApprovedRemoteClone, RefusalReason> {
    let record = record.ok_or(RefusalReason::NoRecord)?;
    let target = obs
        .target
        .as_deref()
        .ok_or_else(|| RefusalReason::RecordedPathUnresolvable {
            recorded: record.clone_path.clone(),
        })?;
    let resolved = Path::new(target).to_path_buf();
    let roots = [obs.root.as_str(), obs.home.as_str()];
    let claudes = [
        claude_of(&obs.root_claude, &obs.root),
        claude_of(&obs.home_claude, &obs.home),
    ];

    if roots.iter().any(|r| Path::new(r) == resolved) {
        return Err(RefusalReason::TargetIsHome { resolved });
    }
    if claudes.iter().any(|c| resolved.starts_with(c)) {
        return Err(RefusalReason::TargetInClaudeDir { resolved });
    }
    let protected = roots
        .iter()
        .copied()
        .chain(claudes.iter().map(String::as_str));
    if protected
        .into_iter()
        .any(|p| Path::new(p).starts_with(&resolved))
    {
        return Err(RefusalReason::TargetContainsProtectedRoot { resolved });
    }
    if !obs.target_is_dir {
        return Err(RefusalReason::NotADirectory { resolved });
    }
    if !obs.has_uninstall {
        return Err(RefusalReason::MissingUninstallScript { resolved });
    }
    Ok(ApprovedRemoteClone {
        clone_dir: target.to_string(),
        root: obs.root.clone(),
        record_hex: obs.record_hex.clone(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workflow_install::source_guard;
    use std::path::PathBuf;

    const CLONE: &str = "/Users/me/.claudesk/vendor/my-claude-code-customization";

    fn record() -> InstallRecord {
        InstallRecord {
            updated_at: None,
            clone_path: PathBuf::from(CLONE),
            installed_at: "2026-11-20T00:00:00+00:00".into(),
            origin_url: "https://example.com/r.git".into(),
        }
    }

    /// A Managed host, production-shaped: the root is the account's home.
    fn managed() -> HostObservation {
        HostObservation {
            root: "/Users/me".into(),
            root_claude: Some("/Users/me/.claude".into()),
            home: "/Users/me".into(),
            home_claude: Some("/Users/me/.claude".into()),
            target: Some(CLONE.into()),
            target_is_dir: true,
            has_uninstall: true,
            record_hex: "7b7d0a".into(),
        }
    }

    fn with_target(t: &str) -> HostObservation {
        HostObservation {
            target: Some(t.into()),
            ..managed()
        }
    }

    #[test]
    fn a_managed_clone_is_approved_with_the_hosts_physical_path() {
        let t = remote_refuse_guard(Some(&record()), &managed()).expect("approved");
        assert_eq!(t.clone_dir(), CLONE);
        assert_eq!(t.root(), "/Users/me");
        assert_eq!(t.record_hex(), "7b7d0a");
    }

    #[test]
    fn no_record_is_refused() {
        assert_eq!(
            remote_refuse_guard(None, &managed()),
            Err(RefusalReason::NoRecord)
        );
    }

    #[test]
    fn an_unresolvable_path_is_refused() {
        let obs = HostObservation {
            target: None,
            ..managed()
        };
        assert_eq!(
            remote_refuse_guard(Some(&record()), &obs),
            Err(RefusalReason::RecordedPathUnresolvable {
                recorded: PathBuf::from(CLONE)
            })
        );
    }

    #[test]
    fn the_root_itself_is_refused() {
        assert!(matches!(
            remote_refuse_guard(Some(&record()), &with_target("/Users/me")),
            Err(RefusalReason::TargetIsHome { .. })
        ));
    }

    /// Under the sandbox the root is NOT the home: the account's real home is still protected.
    fn sandboxed() -> HostObservation {
        HostObservation {
            root: "/Users/me/sandbox".into(),
            root_claude: Some("/Users/me/sandbox/.claude".into()),
            target: Some("/Users/me/sandbox/.claudesk/vendor/my-claude-code-customization".into()),
            ..managed()
        }
    }

    #[test]
    fn the_accounts_real_home_is_refused_under_a_sandbox_root() {
        let obs = HostObservation {
            target: Some("/Users/me".into()),
            ..sandboxed()
        };
        assert!(matches!(
            remote_refuse_guard(Some(&record()), &obs),
            Err(RefusalReason::TargetIsHome { .. })
        ));
        assert!(remote_refuse_guard(Some(&record()), &sandboxed()).is_ok());
    }

    #[test]
    fn a_target_inside_the_roots_claude_is_refused() {
        assert!(matches!(
            remote_refuse_guard(Some(&record()), &with_target("/Users/me/.claude/skills")),
            Err(RefusalReason::TargetInClaudeDir { .. })
        ));
        assert!(matches!(
            remote_refuse_guard(Some(&record()), &with_target("/Users/me/.claude")),
            Err(RefusalReason::TargetInClaudeDir { .. })
        ));
    }

    #[test]
    fn a_target_inside_the_homes_claude_is_refused_under_a_sandbox_root() {
        let obs = HostObservation {
            target: Some("/Users/me/.claude/agents".into()),
            ..sandboxed()
        };
        assert!(matches!(
            remote_refuse_guard(Some(&record()), &obs),
            Err(RefusalReason::TargetInClaudeDir { .. })
        ));
    }

    /// A `.claude` that does not exist is compared in its literal form, as the local guard does.
    #[test]
    fn an_absent_claude_is_still_protected_by_its_literal_path() {
        let obs = HostObservation {
            root_claude: None,
            home_claude: None,
            target: Some("/Users/me/.claude/x".into()),
            ..managed()
        };
        assert!(matches!(
            remote_refuse_guard(Some(&record()), &obs),
            Err(RefusalReason::TargetInClaudeDir { .. })
        ));
    }

    #[test]
    fn an_ancestor_of_a_protected_root_is_refused() {
        for t in ["/Users", "/"] {
            assert!(
                matches!(
                    remote_refuse_guard(Some(&record()), &with_target(t)),
                    Err(RefusalReason::TargetContainsProtectedRoot { .. })
                ),
                "{t}"
            );
        }
        // Under a sandbox: the sandbox's parent is the real home, an ancestor of nothing else.
        let obs = HostObservation {
            target: Some("/Users".into()),
            ..sandboxed()
        };
        assert!(matches!(
            remote_refuse_guard(Some(&record()), &obs),
            Err(RefusalReason::TargetContainsProtectedRoot { .. })
        ));
    }

    /// A sibling whose name merely starts with a protected root's is not inside it: the compare
    /// is per path component, never a string prefix.
    #[test]
    fn a_string_prefix_is_not_containment() {
        let obs = with_target("/Users/me/.claude-backup/clone");
        assert!(remote_refuse_guard(Some(&record()), &obs).is_ok());
    }

    #[test]
    fn not_a_directory_is_refused() {
        let obs = HostObservation {
            target_is_dir: false,
            ..managed()
        };
        assert!(matches!(
            remote_refuse_guard(Some(&record()), &obs),
            Err(RefusalReason::NotADirectory { .. })
        ));
    }

    #[test]
    fn a_folder_without_uninstall_sh_is_refused() {
        let obs = HostObservation {
            has_uninstall: false,
            ..managed()
        };
        assert!(matches!(
            remote_refuse_guard(Some(&record()), &obs),
            Err(RefusalReason::MissingUninstallScript { .. })
        ));
    }

    #[test]
    fn roots_are_injected_never_ambient() {
        let code = source_guard::production_code(include_str!("remote_guard.rs"));
        for forbidden in ["home_dir", "env::var", "std::env", "dirs::home"] {
            assert!(
                !code.contains(forbidden),
                "`{forbidden}` in the remote guard"
            );
        }
        assert!(code.contains("pub fn remote_refuse_guard("));
    }
}
