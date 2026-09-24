//! F-b — the **profile list**: named `CLAUDE_CONFIG_DIR`s a project row can spawn under.
//!
//! A profile is nothing more than a config dir plus a name. The built-in profile
//! [`DEFAULT_PROFILE`] means *no* `CLAUDE_CONFIG_DIR` (CC's own `~/.claude`) and is **never
//! stored** — it cannot be listed, adopted, or removed, so no entry on disk can shadow it.
//!
//! ⚠️ **Its own file (`profiles.json`), deliberately NOT a field of `AppSettings`.** `settings.json`
//! deserializes in one shot, so one malformed profile entry there would fail the whole settings
//! read and take every other setting with it. Here the top level must still be an array (a file we
//! cannot understand at all is refused, never silently wiped), but **each entry parses on its own**
//! and a bad one is dropped with a log line — see [`read_profiles`].
//!
//! Writes share `config_store`'s single [`super::CONFIG_WRITE_LOCK`] via [`update_profiles`], the
//! only caller of [`write_profiles`].

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::{config_write_guard, ConfigError};

/// Basename of the persisted profile list within the app-data directory.
pub(crate) const PROFILES_FILE: &str = "profiles.json";
const PROFILES_TMP_FILE: &str = "profiles.json.tmp";

/// The name of the built-in profile: no `CLAUDE_CONFIG_DIR`, i.e. `~/.claude`.
pub const DEFAULT_PROFILE: &str = "default";

/// The env var CC reads its config root from.
pub const CONFIG_DIR_ENV: &str = "CLAUDE_CONFIG_DIR";

/// How a profile came to be listed — which decides what Claudesk may do to its directory.
///
/// ⚠️ **Provenance, not abstinence** (`arch/claude-substrate.md`): only a `Created` profile may be
/// moved to the Trash, because only then did Claudesk make the directory. An `Adopted` one can
/// only be removed from the list.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Provenance {
    Created,
    Adopted,
}

/// One listed profile.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Profile {
    /// The profile's identity **and** the value a `projects.json` row stores to reference it.
    /// Validated by [`validate_name`]; never [`DEFAULT_PROFILE`].
    pub name: String,
    /// Absolute path of the config dir, passed verbatim as `CLAUDE_CONFIG_DIR`.
    pub config_dir: PathBuf,
    pub provenance: Provenance,
}

/// What a project row's profile reference resolves to at spawn time.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ResolvedProfile {
    /// No reference, or an explicit `"default"` — spawn with `CLAUDE_CONFIG_DIR` removed.
    Default,
    /// A listed profile.
    Listed(Profile),
    /// A reference to a name that is not listed. ⚠️ **Must refuse the spawn** — falling back to
    /// the default profile would run the session under the wrong `CLAUDE.md`, permissions and
    /// memory with nothing on screen to say so.
    Missing(String),
}

/// Whether a stored reference means the built-in default profile: absent, blank, or
/// `"default"`. ⚠️ The ONE definition — [`resolve`] and [`workflow_applicable`] both read it, and
/// `src/state/workflowApplicable.ts` mirrors it for the frontend.
pub fn is_default_reference(reference: Option<&str>) -> bool {
    matches!(
        reference.map(str::trim),
        None | Some("") | Some(DEFAULT_PROFILE)
    )
}

/// F-b ruling 4 — **the workflow layer exists only for the default profile.** Gate ON ∧ default
/// profile. ⚠️ **Every backend consumer of the workflow gate that is scoped to one project or
/// session must read this, never the raw gate** — the spawn env (`CLAUDESK_DRIVE_MODE`) and the
/// picker's `/session-restore` announce arm. A non-default profile has no workflow skills (the
/// `original` profile says so outright), so anything fired into it is a slash command the
/// session cannot run. Mirrored by `isWorkflowApplicable` in `src/state/workflowApplicable.ts`.
pub fn workflow_applicable(gate_enabled: bool, profile_reference: Option<&str>) -> bool {
    gate_enabled && is_default_reference(profile_reference)
}

/// Resolve a row's stored reference against the profile list. Pure, so every caller shares it.
pub fn resolve(profiles: &[Profile], reference: Option<&str>) -> ResolvedProfile {
    if is_default_reference(reference) {
        return ResolvedProfile::Default;
    }
    match reference.map(str::trim) {
        None => ResolvedProfile::Default,
        Some(name) => profiles
            .iter()
            .find(|p| p.name == name)
            .cloned()
            .map_or_else(
                || ResolvedProfile::Missing(name.to_string()),
                ResolvedProfile::Listed,
            ),
    }
}

/// A profile name is lowercase ASCII letters, digits and `-`, 1–40 chars, not starting with `-`,
/// and never [`DEFAULT_PROFILE`]. The same alphabet the boilerplate's `claude-<name>` convention
/// uses, so a name round-trips into `~/.config/claude-<name>` without escaping.
pub fn validate_name(name: &str) -> Result<(), String> {
    if name == DEFAULT_PROFILE {
        return Err(format!(
            "\"{DEFAULT_PROFILE}\" is the built-in profile's name"
        ));
    }
    if name.is_empty() || name.len() > 40 {
        return Err("a profile name must be 1–40 characters".to_string());
    }
    if name.starts_with('-') {
        return Err("a profile name cannot start with \"-\"".to_string());
    }
    if !name
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
    {
        return Err("a profile name may use only a–z, 0–9 and \"-\"".to_string());
    }
    Ok(())
}

/// The name an adopted directory gets when the caller supplies none: its basename with a leading
/// `claude-` stripped (`~/.config/claude-neo` → `neo`), lowercased.
pub fn derive_name(config_dir: &Path) -> String {
    let base = config_dir
        .file_name()
        .map(|s| s.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    base.strip_prefix("claude-").unwrap_or(&base).to_string()
}

/// Read the profile list. Missing file → empty. A file whose top level is not a JSON array →
/// [`ConfigError::Parse`] (refused, never silently wiped). Each entry parses independently; an
/// entry that fails, is invalidly named, or repeats an earlier name is **dropped with a log line**.
pub fn read_profiles(data_dir: &Path) -> Result<Vec<Profile>, ConfigError> {
    let bytes = match std::fs::read(data_dir.join(PROFILES_FILE)) {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(e.into()),
    };
    let raw: Vec<serde_json::Value> = serde_json::from_slice(&bytes)?;
    let mut out: Vec<Profile> = Vec::with_capacity(raw.len());
    for (i, value) in raw.into_iter().enumerate() {
        match serde_json::from_value::<Profile>(value) {
            Ok(p) if validate_name(&p.name).is_err() => {
                eprintln!(
                    "[claudesk] profiles.json entry {i}: invalid name {:?}, dropped",
                    p.name
                )
            }
            Ok(p) if out.iter().any(|q| q.name == p.name) => {
                eprintln!(
                    "[claudesk] profiles.json entry {i}: duplicate name {:?}, dropped",
                    p.name
                )
            }
            Ok(p) => out.push(p),
            Err(e) => eprintln!("[claudesk] profiles.json entry {i}: {e}, dropped"),
        }
    }
    Ok(out)
}

/// Atomic tmp + rename. ⚠️ Only [`update_profiles`] may call this outside a test.
fn write_profiles(data_dir: &Path, profiles: &[Profile]) -> Result<(), ConfigError> {
    let tmp = data_dir.join(PROFILES_TMP_FILE);
    std::fs::write(&tmp, serde_json::to_vec_pretty(profiles)?)?;
    std::fs::rename(&tmp, data_dir.join(PROFILES_FILE))?;
    Ok(())
}

/// **THE funnel for every `profiles.json` mutation** — read → mutate → write under the shared
/// config lock, the twin of `update_projects` / `update_settings`.
pub(crate) fn update_profiles<T>(
    data_dir: &Path,
    mutate: impl FnOnce(&mut Vec<Profile>) -> Result<T, ConfigError>,
) -> Result<T, ConfigError> {
    let _guard = config_write_guard();
    let mut profiles = read_profiles(data_dir)?;
    let out = mutate(&mut profiles)?;
    write_profiles(data_dir, &profiles)?;
    Ok(out)
}

fn invalid(msg: impl Into<String>) -> ConfigError {
    ConfigError::Io(std::io::Error::new(
        std::io::ErrorKind::InvalidInput,
        msg.into(),
    ))
}

/// Same directory, compared through `canonicalize` when both resolve (so `/tmp` and
/// `/private/tmp` agree), verbatim otherwise.
fn same_dir(a: &Path, b: &Path) -> bool {
    match (std::fs::canonicalize(a), std::fs::canonicalize(b)) {
        (Ok(x), Ok(y)) => x == y,
        _ => a == b,
    }
}

/// Add an existing directory to the list as an `Adopted` profile. Writes **nothing** into the
/// directory (hook registration is a separate step). Refuses a missing / non-directory path, an
/// invalid or taken name, and a directory that is already listed under another name.
pub fn adopt(
    data_dir: &Path,
    config_dir: &Path,
    name: Option<&str>,
) -> Result<Profile, ConfigError> {
    if !config_dir.is_absolute() {
        return Err(invalid(format!(
            "{} is not an absolute path",
            config_dir.display()
        )));
    }
    if !config_dir.is_dir() {
        return Err(invalid(format!(
            "{} is not a directory",
            config_dir.display()
        )));
    }
    let name = name
        .map(str::trim)
        .filter(|n| !n.is_empty())
        .map_or_else(|| derive_name(config_dir), str::to_string);
    validate_name(&name).map_err(invalid)?;
    update_profiles(data_dir, |profiles| {
        if profiles.iter().any(|p| p.name == name) {
            return Err(invalid(format!(
                "a profile named \"{name}\" already exists"
            )));
        }
        if let Some(p) = profiles
            .iter()
            .find(|p| same_dir(&p.config_dir, config_dir))
        {
            return Err(invalid(format!(
                "{} is already listed as \"{}\"",
                config_dir.display(),
                p.name
            )));
        }
        let profile = Profile {
            name: name.clone(),
            config_dir: config_dir.to_path_buf(),
            provenance: Provenance::Adopted,
        };
        profiles.push(profile.clone());
        Ok(profile)
    })
}

/// Drop a profile from the list, returning the removed entry. Does not touch its directory.
pub fn remove_entry(data_dir: &Path, name: &str) -> Result<Profile, ConfigError> {
    update_profiles(data_dir, |profiles| {
        let idx = profiles
            .iter()
            .position(|p| p.name == name)
            .ok_or_else(|| invalid(format!("no profile named \"{name}\"")))?;
        Ok(profiles.remove(idx))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn listed(name: &str, dir: &str) -> Profile {
        Profile {
            name: name.to_string(),
            config_dir: PathBuf::from(dir),
            provenance: Provenance::Adopted,
        }
    }

    #[test]
    fn profile_resolve_maps_absent_blank_and_default_to_default() {
        let list = vec![listed("neo", "/x/claude-neo")];
        for r in [None, Some(""), Some("  "), Some("default")] {
            assert_eq!(resolve(&list, r), ResolvedProfile::Default, "{r:?}");
        }
    }

    #[test]
    fn profile_resolve_finds_a_listed_name_by_identity() {
        let list = vec![
            listed("eos", "/x/claude-eos"),
            listed("neo", "/x/claude-neo"),
        ];
        assert_eq!(
            resolve(&list, Some("neo")),
            ResolvedProfile::Listed(listed("neo", "/x/claude-neo"))
        );
    }

    #[test]
    fn profile_resolve_reports_an_unlisted_name_as_missing_never_default() {
        let list = vec![listed("neo", "/x/claude-neo")];
        assert_eq!(
            resolve(&list, Some("gone")),
            ResolvedProfile::Missing("gone".to_string())
        );
    }

    #[test]
    fn profile_workflow_applicable_truth_table() {
        // (gate, reference) → applicable. Mirrored row-for-row by the TS test of
        // `isWorkflowApplicable` — change both or neither.
        for (gate, reference, want) in [
            (true, None, true),
            (true, Some(""), true),
            (true, Some(" default "), true),
            (true, Some("neo"), false),
            (false, None, false),
            (false, Some("neo"), false),
        ] {
            assert_eq!(
                workflow_applicable(gate, reference),
                want,
                "{gate} {reference:?}"
            );
        }
    }

    #[test]
    fn profile_name_rules() {
        for ok in ["neo", "a", "claude-2", "x-y-z"] {
            assert!(validate_name(ok).is_ok(), "{ok}");
        }
        for bad in ["", "default", "-neo", "Neo", "a b", "a/b", &"x".repeat(41)] {
            assert!(validate_name(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn profile_derive_name_strips_the_claude_prefix() {
        assert_eq!(derive_name(Path::new("/u/.config/claude-neo")), "neo");
        assert_eq!(derive_name(Path::new("/u/.config/Work")), "work");
    }

    #[test]
    fn profile_missing_file_reads_as_empty() {
        let dir = TempDir::new().unwrap();
        assert_eq!(read_profiles(dir.path()).unwrap(), Vec::new());
    }

    #[test]
    fn profile_a_non_array_file_is_refused_not_wiped() {
        let dir = TempDir::new().unwrap();
        std::fs::write(dir.path().join(PROFILES_FILE), b"{\"oops\":1}").unwrap();
        assert!(matches!(
            read_profiles(dir.path()),
            Err(ConfigError::Parse(_))
        ));
        // And a mutation refuses too, leaving the file byte-identical.
        assert!(remove_entry(dir.path(), "x").is_err());
        assert_eq!(
            std::fs::read(dir.path().join(PROFILES_FILE)).unwrap(),
            b"{\"oops\":1}"
        );
    }

    #[test]
    fn profile_a_bad_entry_is_dropped_and_its_siblings_survive() {
        let dir = TempDir::new().unwrap();
        std::fs::write(
            dir.path().join(PROFILES_FILE),
            br#"[{"name":"neo","config_dir":"/x/claude-neo","provenance":"adopted"},
                 {"name":"broken"},
                 {"name":"default","config_dir":"/x","provenance":"adopted"},
                 {"name":"neo","config_dir":"/dup","provenance":"created"},
                 {"name":"eos","config_dir":"/x/claude-eos","provenance":"created"}]"#,
        )
        .unwrap();
        let names: Vec<String> = read_profiles(dir.path())
            .unwrap()
            .into_iter()
            .map(|p| p.name)
            .collect();
        assert_eq!(names, vec!["neo".to_string(), "eos".to_string()]);
    }

    #[test]
    fn profile_adopt_then_remove_round_trips() {
        let data = TempDir::new().unwrap();
        let cfg = TempDir::new().unwrap();
        let target = cfg.path().join("claude-neo");
        std::fs::create_dir(&target).unwrap();
        let p = adopt(data.path(), &target, None).unwrap();
        assert_eq!(p.name, "neo");
        assert_eq!(p.provenance, Provenance::Adopted);
        assert_eq!(read_profiles(data.path()).unwrap(), vec![p.clone()]);
        assert!(
            std::fs::read_dir(&target).unwrap().next().is_none(),
            "adopt wrote into the dir"
        );
        assert_eq!(remove_entry(data.path(), "neo").unwrap(), p);
        assert_eq!(read_profiles(data.path()).unwrap(), Vec::new());
    }

    #[test]
    fn profile_adopt_refuses_duplicates_and_non_dirs() {
        let data = TempDir::new().unwrap();
        let cfg = TempDir::new().unwrap();
        let target = cfg.path().join("claude-neo");
        std::fs::create_dir(&target).unwrap();
        adopt(data.path(), &target, None).unwrap();
        assert!(
            adopt(data.path(), &target, Some("other")).is_err(),
            "same dir twice"
        );
        let second = cfg.path().join("elsewhere");
        std::fs::create_dir(&second).unwrap();
        assert!(
            adopt(data.path(), &second, Some("neo")).is_err(),
            "same name twice"
        );
        assert!(
            adopt(data.path(), &cfg.path().join("nope"), None).is_err(),
            "missing dir"
        );
        assert!(
            adopt(data.path(), Path::new("rel/dir"), None).is_err(),
            "relative path"
        );
        assert_eq!(read_profiles(data.path()).unwrap().len(), 1);
    }
}
