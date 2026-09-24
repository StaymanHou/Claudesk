//! F-b Phase 5 — **creating** a profile (the New-profile wizard's backend) and **deleting** a
//! `Created` one to the Trash.
//!
//! ## Where each seeded value lives (probe P1.1 (1), CC 2.1.281 — do NOT re-derive)
//! - `theme` → `settings.json`. A `theme` in `.claude.json` is **stripped at startup**.
//! - `copyOnSelect` → `<dir>/.claude.json` (a global-config key; CC merges into a pre-seeded file).
//! - mouse tracking OFF → `settings.json` `env.CLAUDE_CODE_DISABLE_MOUSE = "1"` (there is no
//!   settings key), so it holds in a bare terminal too, not just inside Claudesk.
//! - `statusLine` → copied **verbatim** from `~/.claude/settings.json`, snapshotted at CALL time.
//! - `cleanupPeriodDays`, `permissions.defaultMode`, `model` → `settings.json`.
//! - ⚠️ **`hasCompletedOnboarding` is NEVER seeded** — it also skips CC's own login step (D.21).
//!
//! ## What this never touches
//! `~/.zshrc` (D.20) — no code path here reads or writes it. `~/.claude/settings.json` is only
//! ever READ (the status-line snapshot).
//!
//! ## Provenance
//! Create refuses a non-empty directory (D.19 — "adopt instead"), so everything under a
//! `Created` profile's dir was minted by Claudesk or by CC running in it. That is what licenses
//! [`delete_created`] to move the whole directory to the Trash, and why an `Adopted` profile
//! can never reach it.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

use super::profiles::{self, Profile, Provenance};
use crate::cc_session::CcPermissionMode;

/// CC's `theme` values (CC 2.1.281: `"auto"` plus the six named themes).
pub const THEMES: [&str; 7] = [
    "auto",
    "dark",
    "light",
    "dark-daltonized",
    "light-daltonized",
    "dark-ansi",
    "light-ansi",
];

/// CC's built-in theme when none is set — what the default profile resolves to today.
pub const FALLBACK_THEME: &str = "dark";

/// The wizard's default log retention (the boilerplate's value, and `~/.claude`'s today).
pub const DEFAULT_CLEANUP_PERIOD_DAYS: u32 = 99_999;

/// The env var that turns CC's mouse tracking off. There is no settings key for it.
pub const DISABLE_MOUSE_ENV: &str = "CLAUDE_CODE_DISABLE_MOUSE";

/// Everything the wizard collects. Field names are the wire contract with
/// `NewProfileSpec` in `src/state/profiles.ts`.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct NewProfileSpec {
    pub name: String,
    pub config_dir: PathBuf,
    pub permission_mode: CcPermissionMode,
    pub cleanup_period_days: u32,
    /// `None` / blank = no `model` key (CC's own default).
    pub model: Option<String>,
    pub theme: String,
    /// Copy `~/.claude/settings.json`'s `statusLine` (snapshotted when [`create`] runs).
    pub copy_status_line: bool,
    pub mouse_tracking: bool,
    pub copy_on_select: bool,
}

/// What the wizard pre-fills, read from the default profile when it OPENS. ⚠️ A snapshot, not a
/// live link — a later change to `~/.claude` does not reach profiles that already exist.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct WizardDefaults {
    /// Parent of the default config dir (`~/.config`); the wizard appends `claude-<name>`.
    pub config_root: PathBuf,
    pub permission_mode: CcPermissionMode,
    pub cleanup_period_days: u32,
    pub theme: String,
    /// `~/.claude/settings.json`'s `statusLine`, verbatim, or `None` when it has none.
    pub status_line: Option<Value>,
    pub themes: Vec<String>,
}

/// What a candidate config dir is, for the wizard's refusal (D.19).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DirStatus {
    Absent,
    Empty,
    NonEmpty,
    NotADirectory,
}

pub fn dir_status(path: &Path) -> DirStatus {
    match std::fs::symlink_metadata(path) {
        Err(_) => DirStatus::Absent,
        Ok(m) if !m.is_dir() => DirStatus::NotADirectory,
        Ok(_) => match std::fs::read_dir(path).map(|mut e| e.next().is_none()) {
            Ok(true) => DirStatus::Empty,
            _ => DirStatus::NonEmpty,
        },
    }
}

/// Read `~/.claude/settings.json` as an object; missing or unreadable → empty (the wizard then
/// falls back to CC's own defaults, which is what that profile resolves to anyway).
fn read_json_object(path: &Path) -> Map<String, Value> {
    std::fs::read(path)
        .ok()
        .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
        .and_then(|v| match v {
            Value::Object(m) => Some(m),
            _ => None,
        })
        .unwrap_or_default()
}

/// The wizard's pre-fill. Pure over its inputs so it is testable without the operator's home.
pub fn wizard_defaults(default_settings: &Path, config_root: &Path) -> WizardDefaults {
    let settings = read_json_object(default_settings);
    let theme = settings
        .get("theme")
        .and_then(Value::as_str)
        .filter(|t| THEMES.contains(t))
        .unwrap_or(FALLBACK_THEME)
        .to_string();
    let permission_mode = settings
        .get("permissions")
        .and_then(|p| p.get("defaultMode"))
        .cloned()
        .and_then(|v| serde_json::from_value::<CcPermissionMode>(v).ok())
        .unwrap_or_default();
    WizardDefaults {
        config_root: config_root.to_path_buf(),
        permission_mode,
        cleanup_period_days: DEFAULT_CLEANUP_PERIOD_DAYS,
        theme,
        status_line: settings.get("statusLine").cloned(),
        themes: THEMES.iter().map(|t| t.to_string()).collect(),
    }
}

/// The seeded `<dir>/settings.json` (before Claudesk's hook is merged in).
pub fn seed_settings(spec: &NewProfileSpec, status_line: Option<&Value>) -> Value {
    let mut s = Map::new();
    s.insert(
        "permissions".into(),
        json!({ "defaultMode": spec.permission_mode }),
    );
    s.insert("cleanupPeriodDays".into(), json!(spec.cleanup_period_days));
    if let Some(model) = spec
        .model
        .as_deref()
        .map(str::trim)
        .filter(|m| !m.is_empty())
    {
        s.insert("model".into(), json!(model));
    }
    s.insert("theme".into(), json!(spec.theme));
    if let Some(line) = status_line {
        s.insert("statusLine".into(), line.clone());
    }
    if !spec.mouse_tracking {
        s.insert("env".into(), json!({ DISABLE_MOUSE_ENV: "1" }));
    }
    Value::Object(s)
}

/// The seeded `<dir>/.claude.json`. ⚠️ Only `copyOnSelect` — never `hasCompletedOnboarding`, and
/// never `theme` (CC strips it from this file).
pub fn seed_claude_json(spec: &NewProfileSpec) -> Value {
    json!({ "copyOnSelect": spec.copy_on_select })
}

/// The seeded `<dir>/CLAUDE.md`: the boilerplate's "never touch `~/.claude/`" guard, naming the
/// dir so a session can check `$CLAUDE_CONFIG_DIR` against it.
pub fn seed_claude_md(name: &str, config_dir: &Path) -> String {
    let dir = config_dir.display();
    format!(
        "# Global instructions — claude-{name} config

This Claude Code config directory (`CLAUDE_CONFIG_DIR={dir}`) is a
**separate, non-default config root** from `~/.claude/`. Any session running
under this config dir is isolated from the default one on purpose.

## Never touch `~/.claude/`

**Never read or write anything under `~/.claude/` (the default Claude Code
config dir) from a session running here.** All settings, skills, permissions,
and other config for sessions under this config dir live under
`{dir}/` instead — e.g. `settings.json` is at
`{dir}/settings.json`, not `~/.claude/settings.json`.

This applies to every kind of config change: `statusLine`, `permissions`,
hooks, skills, etc. Before editing any Claude Code config file, confirm which
config dir is actually active (check `$CLAUDE_CONFIG_DIR`) rather than
assuming `~/.claude`. If delegating a config change to a subagent (e.g.
`statusline-setup`), tell it explicitly which config dir to target.
"
    )
}

/// The files [`create`] writes, relative to the config dir — also what a rollback removes.
const SEEDED_FILES: [&str; 3] = ["settings.json", ".claude.json", "CLAUDE.md"];

/// Write via a sibling temp file + rename, so a crash never leaves a half-written config file.
fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(".claudesk-tmp");
    let tmp = PathBuf::from(tmp);
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, path)
}

fn pretty(v: &Value) -> Vec<u8> {
    let mut out = serde_json::to_vec_pretty(v).unwrap_or_default();
    out.push(b'\n');
    out
}

/// Create a profile: validate, write the seeded files, register the hook (`register`), then list
/// it as `Created`. Any failure after the first write is rolled back — the seeded files are
/// removed, and the directory too when this call made it — so a failed create leaves nothing
/// behind and no listed profile without a registration.
///
/// `default_settings` is `~/.claude/settings.json` (READ only, for the status-line snapshot).
pub fn create(
    data_dir: &Path,
    default_settings: &Path,
    spec: &NewProfileSpec,
    register: impl FnOnce(&Path) -> Result<(), String>,
) -> Result<Profile, String> {
    profiles::validate_name(&spec.name)?;
    let dir = spec.config_dir.as_path();
    if !dir.is_absolute() {
        return Err(format!("{} is not an absolute path", dir.display()));
    }
    if !THEMES.contains(&spec.theme.as_str()) {
        return Err(format!("\"{}\" is not a Claude Code theme", spec.theme));
    }
    let listed = profiles::read_profiles(data_dir).map_err(|e| e.to_string())?;
    if listed.iter().any(|p| p.name == spec.name) {
        return Err(format!("a profile named \"{}\" already exists", spec.name));
    }
    let made_dir = match dir_status(dir) {
        DirStatus::Absent => {
            std::fs::create_dir_all(dir)
                .map_err(|e| format!("couldn't create {}: {e}", dir.display()))?;
            true
        }
        DirStatus::Empty => false,
        DirStatus::NonEmpty => {
            return Err(format!(
                "{} is not empty — add it as an existing config dir instead",
                dir.display()
            ))
        }
        DirStatus::NotADirectory => {
            return Err(format!("{} exists and is not a directory", dir.display()))
        }
    };

    let result = (|| {
        let status_line = if spec.copy_status_line {
            read_json_object(default_settings)
                .get("statusLine")
                .cloned()
        } else {
            None
        };
        let io = |what: &str, e: std::io::Error| format!("couldn't write {what}: {e}");
        write_atomic(
            &dir.join("settings.json"),
            &pretty(&seed_settings(spec, status_line.as_ref())),
        )
        .map_err(|e| io("settings.json", e))?;
        write_atomic(&dir.join(".claude.json"), &pretty(&seed_claude_json(spec)))
            .map_err(|e| io(".claude.json", e))?;
        write_atomic(
            &dir.join("CLAUDE.md"),
            seed_claude_md(&spec.name, dir).as_bytes(),
        )
        .map_err(|e| io("CLAUDE.md", e))?;
        register(dir)?;
        profiles::update_profiles(data_dir, |list| {
            if list.iter().any(|p| p.name == spec.name) {
                return Err(profiles_invalid(format!(
                    "a profile named \"{}\" already exists",
                    spec.name
                )));
            }
            let p = Profile {
                name: spec.name.clone(),
                config_dir: dir.to_path_buf(),
                provenance: Provenance::Created,
            };
            list.push(p.clone());
            Ok(p)
        })
        .map_err(|e| e.to_string())
    })();

    if result.is_err() {
        for f in SEEDED_FILES {
            let _ = std::fs::remove_file(dir.join(f));
        }
        if made_dir {
            // Non-recursive: if anything we did not write is in there, it stays.
            let _ = std::fs::remove_dir(dir);
        }
    }
    result
}

fn profiles_invalid(msg: String) -> super::ConfigError {
    super::ConfigError::Io(std::io::Error::new(std::io::ErrorKind::InvalidInput, msg))
}

/// F-b D.24 — move a **`Created`** profile's directory to the Trash, then drop it from the list.
///
/// ⚠️ Refuses an `Adopted` profile: Claudesk trashes only what it made. The directory goes
/// FIRST — if the Trash move fails, the entry stays listed and the error is returned. A
/// directory that is already gone has nothing to trash, so the entry is simply dropped. No hook
/// teardown: the registration lives in the dir and goes with it.
///
/// `trash` is injected (`trash::delete` in production) so tests never touch the real Trash.
pub fn delete_created(
    data_dir: &Path,
    name: &str,
    trash: impl FnOnce(&Path) -> Result<(), String>,
) -> Result<Profile, String> {
    let profile = profiles::read_profiles(data_dir)
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|p| p.name == name)
        .ok_or_else(|| format!("no profile named \"{name}\""))?;
    if profile.provenance != Provenance::Created {
        return Err(format!(
            "\"{name}\" was added from an existing directory, so Claudesk will not delete it — remove it from Claudesk instead"
        ));
    }
    if std::fs::symlink_metadata(&profile.config_dir).is_ok() {
        trash(&profile.config_dir)?;
    }
    profiles::remove_entry(data_dir, name).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn spec(dir: &Path) -> NewProfileSpec {
        NewProfileSpec {
            name: "work".into(),
            config_dir: dir.to_path_buf(),
            permission_mode: CcPermissionMode::AcceptEdits,
            cleanup_period_days: DEFAULT_CLEANUP_PERIOD_DAYS,
            model: None,
            theme: "dark".into(),
            copy_status_line: true,
            mouse_tracking: false,
            copy_on_select: false,
        }
    }

    fn read(p: &Path) -> Value {
        serde_json::from_slice(&std::fs::read(p).unwrap()).unwrap()
    }

    fn default_settings(home: &TempDir, body: &str) -> PathBuf {
        let p = home.path().join("settings.json");
        std::fs::write(&p, body).unwrap();
        p
    }

    fn ok_register(_: &Path) -> Result<(), String> {
        Ok(())
    }

    #[test]
    fn profile_create_seeds_every_value_where_probe_1_put_it() {
        let data = TempDir::new().unwrap();
        let home = TempDir::new().unwrap();
        let line = json!({"type":"command","command":"npx -y ccstatusline@latest","padding":0});
        let def = default_settings(&home, &json!({ "statusLine": line }).to_string());
        let dir = home.path().join("claude-work");
        let p = create(data.path(), &def, &spec(&dir), ok_register).unwrap();
        assert_eq!(p.provenance, Provenance::Created);

        let s = read(&dir.join("settings.json"));
        assert_eq!(s["permissions"]["defaultMode"], "acceptEdits");
        assert_eq!(s["cleanupPeriodDays"], 99_999);
        assert_eq!(s["statusLine"], line, "status line is copied verbatim");
        assert_eq!(s["env"][DISABLE_MOUSE_ENV], "1");
        assert_eq!(s["theme"], "dark", "theme lives in settings.json");
        assert!(s.get("model").is_none());

        let c = read(&dir.join(".claude.json"));
        assert_eq!(c, json!({ "copyOnSelect": false }));
        assert!(c.get("hasCompletedOnboarding").is_none());
        assert!(c.get("theme").is_none(), "CC strips a .claude.json theme");

        let md = std::fs::read_to_string(dir.join("CLAUDE.md")).unwrap();
        assert!(md.contains("## Never touch `~/.claude/`"));
        assert!(md.contains(&format!("CLAUDE_CONFIG_DIR={}", dir.display())));

        assert_eq!(profiles::read_profiles(data.path()).unwrap(), vec![p]);
    }

    #[test]
    fn profile_create_honors_the_on_choices_and_the_optional_model() {
        let data = TempDir::new().unwrap();
        let home = TempDir::new().unwrap();
        let def = default_settings(&home, r#"{"statusLine":{"type":"command","command":"x"}}"#);
        let dir = home.path().join("claude-work");
        let mut sp = spec(&dir);
        sp.copy_status_line = false;
        sp.mouse_tracking = true;
        sp.copy_on_select = true;
        sp.model = Some(" opus ".into());
        create(data.path(), &def, &sp, ok_register).unwrap();
        let s = read(&dir.join("settings.json"));
        assert!(s.get("statusLine").is_none());
        assert!(s.get("env").is_none(), "mouse ON writes no env");
        assert_eq!(s["model"], "opus");
        assert_eq!(read(&dir.join(".claude.json"))["copyOnSelect"], true);
    }

    #[test]
    fn profile_create_refuses_a_non_empty_dir_and_leaves_it_byte_identical() {
        let data = TempDir::new().unwrap();
        let home = TempDir::new().unwrap();
        let def = default_settings(&home, "{}");
        let dir = home.path().join("claude-work");
        std::fs::create_dir(&dir).unwrap();
        std::fs::write(dir.join("settings.json"), b"{\"mine\":1}").unwrap();
        let err = create(data.path(), &def, &spec(&dir), ok_register).unwrap_err();
        assert!(err.contains("add it as an existing config dir"), "{err}");
        assert_eq!(
            std::fs::read(dir.join("settings.json")).unwrap(),
            b"{\"mine\":1}"
        );
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 1);
        assert!(profiles::read_profiles(data.path()).unwrap().is_empty());
    }

    #[test]
    fn profile_create_accepts_an_existing_empty_dir() {
        let data = TempDir::new().unwrap();
        let home = TempDir::new().unwrap();
        let def = default_settings(&home, "{}");
        let dir = home.path().join("claude-work");
        std::fs::create_dir(&dir).unwrap();
        create(data.path(), &def, &spec(&dir), ok_register).unwrap();
        assert!(dir.join("settings.json").is_file());
    }

    #[test]
    fn profile_create_rejects_a_taken_name_bad_theme_and_relative_dir() {
        let data = TempDir::new().unwrap();
        let home = TempDir::new().unwrap();
        let def = default_settings(&home, "{}");
        create(
            data.path(),
            &def,
            &spec(&home.path().join("a")),
            ok_register,
        )
        .unwrap();
        let taken = create(
            data.path(),
            &def,
            &spec(&home.path().join("b")),
            ok_register,
        );
        assert!(taken.unwrap_err().contains("already exists"));
        assert!(
            !home.path().join("b").exists(),
            "a refused create made its dir"
        );

        let mut bad = spec(&home.path().join("c"));
        bad.name = "other".into();
        bad.theme = "neon".into();
        assert!(create(data.path(), &def, &bad, ok_register).is_err());
        let mut rel = spec(Path::new("rel/claude-x"));
        rel.name = "x".into();
        assert!(create(data.path(), &def, &rel, ok_register).is_err());
        let mut dflt = spec(&home.path().join("d"));
        dflt.name = "default".into();
        assert!(create(data.path(), &def, &dflt, ok_register).is_err());
    }

    #[test]
    fn profile_create_rolls_back_everything_when_registration_fails() {
        let data = TempDir::new().unwrap();
        let home = TempDir::new().unwrap();
        let def = default_settings(&home, "{}");
        let fresh = home.path().join("claude-fresh");
        let err = create(data.path(), &def, &spec(&fresh), |_| Err("nope".into()));
        assert_eq!(err.unwrap_err(), "nope");
        assert!(!fresh.exists(), "the dir this call made was left behind");
        assert!(profiles::read_profiles(data.path()).unwrap().is_empty());

        // A pre-existing EMPTY dir is kept, but emptied of what we wrote.
        let empty = home.path().join("claude-empty");
        std::fs::create_dir(&empty).unwrap();
        assert!(create(data.path(), &def, &spec(&empty), |_| Err("nope".into())).is_err());
        assert!(empty.is_dir());
        assert_eq!(std::fs::read_dir(&empty).unwrap().count(), 0);
    }

    #[test]
    fn profile_create_registers_after_the_settings_file_exists() {
        let data = TempDir::new().unwrap();
        let home = TempDir::new().unwrap();
        let def = default_settings(&home, "{}");
        let dir = home.path().join("claude-work");
        create(data.path(), &def, &spec(&dir), |d| {
            assert!(
                d.join("settings.json").is_file(),
                "registered before seeding"
            );
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn profile_create_with_the_real_registration_keeps_every_seeded_key() {
        let data = TempDir::new().unwrap();
        let home = TempDir::new().unwrap();
        let def = default_settings(&home, r#"{"statusLine":{"type":"command","command":"x"}}"#);
        let dir = home.path().join("claude-work");
        let cmd = "CLAUDESK_HOOK_SOCK='/d/hook.sock' /usr/bin/perl '/d/claudesk-hook.pl'";
        create(data.path(), &def, &spec(&dir), |d| {
            crate::hook_install::commands::register_profile(d, cmd)
        })
        .unwrap();
        let s = read(&dir.join("settings.json"));
        assert!(s["hooks"].to_string().contains("claudesk-hook.pl"), "{s}");
        assert_eq!(s["permissions"]["defaultMode"], "acceptEdits");
        assert_eq!(s["statusLine"]["command"], "x");
        assert_eq!(s["env"][DISABLE_MOUSE_ENV], "1");
    }

    #[test]
    fn profile_create_code_never_names_the_shell_rc_file() {
        // F-b D.20 — the wizard writes nothing to `~/.zshrc`. Checked over CODE lines only (the
        // module doc names the file to say it is never touched).
        let code: String = include_str!("profile_create.rs")
            .lines()
            .filter(|l| !l.trim_start().starts_with("//"))
            .collect::<Vec<_>>()
            .join("\n");
        let needle = ["zsh", "rc"].concat();
        assert!(
            !code.contains(&needle),
            "profile_create.rs code mentions {needle}"
        );
    }

    #[test]
    fn profile_wizard_defaults_snapshot_the_default_profile() {
        let home = TempDir::new().unwrap();
        let def = default_settings(
            &home,
            r#"{"theme":"light","permissions":{"defaultMode":"plan"},"statusLine":{"type":"command","command":"x"}}"#,
        );
        let d = wizard_defaults(&def, Path::new("/u/.config"));
        assert_eq!(d.theme, "light");
        assert_eq!(d.permission_mode, CcPermissionMode::Plan);
        assert_eq!(d.status_line, Some(json!({"type":"command","command":"x"})));
        assert_eq!(d.cleanup_period_days, 99_999);
        assert_eq!(d.config_root, PathBuf::from("/u/.config"));

        // Nothing set (or no file) → CC's own defaults.
        let d = wizard_defaults(&home.path().join("absent.json"), Path::new("/u/.config"));
        assert_eq!(d.theme, FALLBACK_THEME);
        assert_eq!(d.permission_mode, CcPermissionMode::Default);
        assert_eq!(d.status_line, None);
    }

    #[test]
    fn profile_dir_status_classifies() {
        let t = TempDir::new().unwrap();
        assert_eq!(dir_status(&t.path().join("x")), DirStatus::Absent);
        assert_eq!(dir_status(t.path()), DirStatus::Empty);
        std::fs::write(t.path().join("f"), b"").unwrap();
        assert_eq!(dir_status(t.path()), DirStatus::NonEmpty);
        assert_eq!(dir_status(&t.path().join("f")), DirStatus::NotADirectory);
    }

    fn listed_as(data: &Path, name: &str, dir: &Path, provenance: Provenance) {
        profiles::update_profiles(data, |l| {
            l.push(Profile {
                name: name.into(),
                config_dir: dir.to_path_buf(),
                provenance,
            });
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn profile_delete_trashes_a_created_dir_then_drops_the_entry() {
        let data = TempDir::new().unwrap();
        let home = TempDir::new().unwrap();
        let dir = home.path().join("claude-work");
        std::fs::create_dir(&dir).unwrap();
        listed_as(data.path(), "work", &dir, Provenance::Created);
        let mut trashed = None;
        delete_created(data.path(), "work", |p| {
            trashed = Some(p.to_path_buf());
            Ok(())
        })
        .unwrap();
        assert_eq!(trashed, Some(dir));
        assert!(profiles::read_profiles(data.path()).unwrap().is_empty());
    }

    #[test]
    fn profile_delete_refuses_an_adopted_profile_and_never_trashes_it() {
        let data = TempDir::new().unwrap();
        let home = TempDir::new().unwrap();
        listed_as(data.path(), "neo", home.path(), Provenance::Adopted);
        let err = delete_created(data.path(), "neo", |_| panic!("trashed an adopted dir"));
        assert!(err.unwrap_err().contains("remove it from Claudesk"));
        assert_eq!(profiles::read_profiles(data.path()).unwrap().len(), 1);
    }

    #[test]
    fn profile_delete_keeps_the_entry_when_the_trash_move_fails() {
        let data = TempDir::new().unwrap();
        let home = TempDir::new().unwrap();
        let dir = home.path().join("claude-work");
        std::fs::create_dir(&dir).unwrap();
        listed_as(data.path(), "work", &dir, Provenance::Created);
        assert!(delete_created(data.path(), "work", |_| Err("busy".into())).is_err());
        assert_eq!(profiles::read_profiles(data.path()).unwrap().len(), 1);
    }

    #[test]
    fn profile_delete_of_a_gone_dir_just_drops_the_entry() {
        let data = TempDir::new().unwrap();
        let home = TempDir::new().unwrap();
        listed_as(
            data.path(),
            "work",
            &home.path().join("gone"),
            Provenance::Created,
        );
        delete_created(data.path(), "work", |_| panic!("nothing to trash")).unwrap();
        assert!(profiles::read_profiles(data.path()).unwrap().is_empty());
    }
}
