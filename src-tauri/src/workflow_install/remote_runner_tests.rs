//! Tests for [`super`]: the pure builder, parser and reducer, then the REAL run script under
//! `/bin/zsh -c` (the host's login shell, minus the login) against a local fixture repo. The
//! fixture's `install.sh` carries the `claude-workflow-system` marker and links its skills under
//! `$HOME/.claude/skills`, as the real one does, so the substrate probe reads it the real way.

use super::*;
use crate::remote_cmd::{parse_refresh, substrate_refresh_script};
use crate::workflow_install::provenance;
use crate::workflow_install::runner::{run_streaming_abortable, OutputSink};
use crate::workflow_install::sandbox::Sandbox;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::Instant;
use tempfile::TempDir;

pub(crate) const NOW: &str = "2026-11-20T00:00:00+00:00";

// ── The pure builder ─────────────────────────────────────────────────────────────────────

#[test]
fn the_builder_refuses_a_root_that_is_not_an_absolute_normalized_path() {
    let rec = remote_record("/Users/me", NOW);
    for bad in [
        "", "/", "relative", "~/x", "/a/../b", "/a/./b", "/a//b", "/a/\nb", "/a/",
    ] {
        assert!(
            install_script_from(bad, REMOTE_ORIGIN_URL, &rec).is_err(),
            "{bad:?} must be refused"
        );
    }
    assert!(install_script_from("/Users/me", REMOTE_ORIGIN_URL, &rec).is_ok());
}

#[test]
fn every_value_enters_the_script_quoted_and_the_rest_is_constant() {
    let root = "/Users/me/it's $HOME `x`";
    let rec = remote_record(root, NOW);
    let s = install_script_from(root, REMOTE_ORIGIN_URL, &rec).unwrap();
    assert!(s.contains(&format!("root={}\n", quote(root))), "{s}");
    let json = serde_json::to_string(&rec).unwrap();
    assert!(
        s.contains(&format!("printf '%s\\n' {} >", quote(&json))),
        "{s}"
    );
    assert!(s.contains(&format!("clone -- {} \"$clone\"", quote(REMOTE_ORIGIN_URL))));
    assert!(!s.contains("__"), "every placeholder is filled: {s}");
    // The record is the clone under the root, with the public HTTPS origin.
    assert_eq!(
        rec.clone_path,
        PathBuf::from(format!("{root}/.claudesk/vendor/{CLONE_DIR_NAME}"))
    );
    assert!(REMOTE_ORIGIN_URL.starts_with("https://"));
}

/// A root that itself contains a placeholder token stays ONE quoted value: the fill never rescans
/// what it inserted. Run for real: the root's `$(touch …)` must not execute.
#[test]
fn a_root_carrying_a_placeholder_token_stays_quoted() {
    let canary = TempDir::new().unwrap();
    let mark = canary.path().join("MARK");
    for token in [
        "__JSON__",
        "__URL__",
        "__PROBE__",
        "__GUARD__",
        "__NAME__",
        "__ROOT__",
    ] {
        let root = format!("/x/$(touch {})/{token}", mark.display());
        let s = install_script_from(&root, REMOTE_ORIGIN_URL, &remote_record(&root, NOW)).unwrap();
        assert!(
            s.contains(&format!("root={}\n", quote(&root))),
            "{token}: {s}"
        );
        // Only the lines up to the root's use: the rest needs a host.
        let head: String = s.lines().take(5).collect::<Vec<_>>().join("\n");
        let out = Command::new("/bin/zsh")
            .arg("-f")
            .arg("-c")
            .arg(format!("{head}\necho \"$root\""))
            .output()
            .unwrap();
        assert!(!mark.exists(), "{token}: the root's $(…) ran");
        assert_eq!(
            String::from_utf8_lossy(&out.stdout).lines().last(),
            Some(root.as_str()),
            "{token}"
        );
    }
}

#[test]
fn git_runs_only_as_the_developer_dirs_binary_behind_the_guard_and_never_prompts() {
    let s = install_script_from(
        "/Users/me",
        REMOTE_ORIGIN_URL,
        &remote_record("/Users/me", NOW),
    )
    .unwrap();
    let guard = s.find(DEV_TOOLS_GUARD).expect("the guard");
    // The negation covers the WHOLE `&&` chain, not just its first command.
    assert!(
        s.contains(&format!("if ! {{ {DEV_TOOLS_GUARD}; }}; then")),
        "{s}"
    );
    let git = s.find("\"$d/usr/bin/git\" clone").expect("the clone");
    assert!(guard < git);
    assert_eq!(
        s.matches("git ").count(),
        s.matches("/usr/bin/git ").count(),
        "{s}"
    );
    let clone_line = s
        .lines()
        .find(|l| l.contains("/usr/bin/git\" clone"))
        .unwrap();
    assert!(
        clone_line.starts_with("GIT_TERMINAL_PROMPT=0 "),
        "{clone_line}"
    );
    assert!(clone_line.contains("</dev/null"), "{clone_line}");
}

#[test]
fn the_sentinels_and_the_install_window_come_in_order() {
    let s = install_script_from(
        "/Users/me",
        REMOTE_ORIGIN_URL,
        &remote_record("/Users/me", NOW),
    )
    .unwrap();
    let at = |needle: &str| s.find(needle).unwrap_or_else(|| panic!("{needle}: {s}"));
    assert!(
        s.starts_with("echo \"CLAUDESK-RUN:pgid:"),
        "the pgid comes first: {s}"
    );
    assert!(
        at("SUBSTRATE_HOME") < at("CLAUDESK-RUN:phase:clone"),
        "the host re-check first"
    );
    assert!(at("rm -rf") < at("CLAUDESK-RUN:phase:clone"));
    assert!(at("CLAUDESK-RUN:phase:clone") < at("/usr/bin/git\" clone"));
    // The window: signals ignored BEFORE the install phase is announced, the record after
    // install.sh, the result last.
    assert!(at("trap '' HUP PIPE TERM INT") < at("CLAUDESK-RUN:phase:install"));
    assert!(at("CLAUDESK-RUN:phase:install") < at("./install.sh"));
    assert!(at("./install.sh") < at("printf '%s\\n'"));
    assert!(at("./install.sh </dev/null >\"$log\" 2>&1").gt(&0));
    // A direct child, never a subshell: zsh resets an ignored trap inside `( … )` (the behaviour
    // itself is proven by `a_group_kill_after_the_install_phase_cannot_split_links_from_the_record`).
    assert!(
        !s.contains("( cd"),
        "install.sh must not run in a subshell: {s}"
    );
    assert!(at("printf '%s\\n'") < at("CLAUDESK-RUN:result:ok"));
}

#[test]
fn the_cancel_command_is_a_group_kill_of_a_parsed_number() {
    assert_eq!(cancel_command(4242), "kill -TERM -- -4242");
}

// ── The parser ───────────────────────────────────────────────────────────────────────────

#[test]
fn sentinel_lines_parse_and_anything_else_is_output() {
    let p = |l: &str| parse_run_line(l);
    assert_eq!(p("CLAUDESK-RUN:pgid:4242"), Some(RunLine::Pgid(4242)));
    for bad in [
        "CLAUDESK-RUN:pgid:",
        "CLAUDESK-RUN:pgid:0",
        "CLAUDESK-RUN:pgid:1",
        "CLAUDESK-RUN:pgid:-5",
        "CLAUDESK-RUN:pgid:12 3",
        "CLAUDESK-RUN:pgid:99999999999",
    ] {
        assert_eq!(p(bad), None, "{bad}");
    }
    assert_eq!(
        p("CLAUDESK-RUN:phase:clone"),
        Some(RunLine::Phase(Phase::Clone))
    );
    assert_eq!(
        p("CLAUDESK-RUN:phase:install"),
        Some(RunLine::Phase(Phase::Install))
    );
    assert_eq!(p("CLAUDESK-RUN:stale-removed"), Some(RunLine::StaleRemoved));
    for (line, want) in [
        ("ok", RunResult::Ok),
        ("no-root", RunResult::NoRoot),
        ("no-write", RunResult::NoWrite),
        ("no-devtools", RunResult::NoDevTools),
        ("already-present", RunResult::AlreadyPresent),
        ("no-install-script", RunResult::NoInstallScript),
        ("record-failed", RunResult::RecordWriteFailed),
        (
            "stale-refused:outside-root",
            RunResult::StaleRefused("outside-root".into()),
        ),
        ("clone-failed:128", RunResult::CloneFailed(128)),
        ("install-failed:7", RunResult::InstallFailed(7)),
    ] {
        assert_eq!(
            p(&format!("CLAUDESK-RUN:result:{line}")),
            Some(RunLine::Result(want))
        );
    }
    for other in [
        "",
        "Cloning into 'x'...",
        "[ok] feature-build",
        "CLAUDESK-RUN:result:nope",
        "CLAUDESK-RUN:result:clone-failed:x",
        "CLAUDESK-OPEN:substrate:no",
    ] {
        assert_eq!(p(other), None, "{other}");
    }
}

// ── The reducer ──────────────────────────────────────────────────────────────────────────

fn managed() -> HostSubstrate {
    HostSubstrate::Managed {
        root: None,
        head: None,
        record: remote_record("/Users/me", NOW),
    }
}

#[test]
fn the_reprobe_decides_success() {
    let ok = resolve("h", Some(&RunResult::Ok), 0, false, Some(&managed()));
    assert!(ok.ok && !ok.cancelled && ok.message.is_none(), "{ok:?}");
    // The script said ok but the host does not read as Managed: not a success.
    let dev = HostSubstrate::Developer {
        root: None,
        head: None,
    };
    let not = resolve("h", Some(&RunResult::Ok), 0, false, Some(&dev));
    assert!(!not.ok && not.message.unwrap().contains("Developer"));
    // The script said ok and the re-check failed: reported, and the message says so.
    let unk = resolve("h", Some(&RunResult::Ok), 0, false, None);
    assert!(unk.ok && unk.message.unwrap().contains("couldn't re-check"));
}

#[test]
fn a_run_that_never_reported_is_judged_by_what_the_host_now_is() {
    // A Cancel that landed after install.sh started: the install finished.
    let late = resolve("h", None, -1, true, Some(&managed()));
    assert!(late.ok && !late.cancelled, "{late:?}");
    assert!(late.message.unwrap().contains("finished"));
    // A Cancel during the clone.
    let early = resolve("h", None, -1, true, Some(&HostSubstrate::Absent));
    assert!(!early.ok && early.cancelled);
    assert_eq!(
        early.message.as_deref(),
        Some("Cancelled. Nothing was installed.")
    );
    // A dropped connection with nothing installed, and one after the install finished.
    let dropped = resolve("h", None, 255, false, Some(&HostSubstrate::Absent));
    assert!(!dropped.ok && !dropped.cancelled && dropped.message.unwrap().contains("exit 255"));
    assert!(resolve("h", None, 255, false, Some(&managed())).ok);
}

#[test]
fn every_failure_arm_is_not_ok_and_says_something() {
    for r in [
        RunResult::NoRoot,
        RunResult::NoWrite,
        RunResult::NoDevTools,
        RunResult::AlreadyPresent,
        RunResult::StaleRefused("outside-root".into()),
        RunResult::CloneFailed(128),
        RunResult::NoInstallScript,
        RunResult::InstallFailed(7),
        RunResult::RecordWriteFailed,
    ] {
        let f = resolve("h", Some(&r), 0, false, Some(&HostSubstrate::Absent));
        assert!(!f.ok && !f.cancelled, "{r:?}");
        assert!(f.message.as_deref().is_some_and(|m| !m.is_empty()), "{r:?}");
    }
    let nd = resolve("h", Some(&RunResult::NoDevTools), 0, false, None);
    assert!(nd.message.unwrap().contains(DEV_TOOLS_FIX));
}

/// Every message `resolve` can produce, over every result × cancel × re-probe: none carries a run
/// of spaces (WP6's review found four that did, from `\` continuations a scripted edit dropped).
#[test]
fn no_resolve_message_carries_a_space_run() {
    let results = [
        None,
        Some(RunResult::Ok),
        Some(RunResult::NoRoot),
        Some(RunResult::NoWrite),
        Some(RunResult::NoDevTools),
        Some(RunResult::AlreadyPresent),
        Some(RunResult::StaleRefused("outside-root".into())),
        Some(RunResult::CloneFailed(128)),
        Some(RunResult::NoInstallScript),
        Some(RunResult::InstallFailed(7)),
        Some(RunResult::RecordWriteFailed),
    ];
    let afters = [
        None,
        Some(HostSubstrate::Unknown),
        Some(HostSubstrate::Absent),
        Some(HostSubstrate::Developer {
            root: None,
            head: None,
        }),
        Some(managed()),
    ];
    for r in &results {
        for cancel in [false, true] {
            for after in &afters {
                let f = resolve("h", r.as_ref(), 3, cancel, after.as_ref());
                if let Some(m) = f.message {
                    assert!(!m.contains("  "), "{r:?} {cancel} {after:?}: {m:?}");
                }
            }
        }
    }
}

// ── The real script, locally ─────────────────────────────────────────────────────────────

/// A local repo shaped like the companion repo: `install.sh` with the marker, linking each
/// `skills/*` dir under `$HOME/.claude/skills` and appending a block to `$HOME/.claude/CLAUDE.md`.
/// `FIXTURE_SLEEP` (from the environment) makes it pause between links; `FIXTURE_FAIL` makes it
/// exit with that code after the first link.
pub(crate) fn fixture_repo(with_installer: bool) -> TempDir {
    let dir = TempDir::new().unwrap();
    let repo = dir.path();
    std::fs::create_dir_all(repo.join("skills/feature-build")).unwrap();
    std::fs::create_dir_all(repo.join("skills/task-plan")).unwrap();
    std::fs::write(repo.join("skills/feature-build/SKILL.md"), "x").unwrap();
    std::fs::write(repo.join("skills/task-plan/SKILL.md"), "x").unwrap();
    if with_installer {
        let script = r#"#!/bin/bash
# claude-workflow-system
set -euo pipefail
SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$HOME/.claude/skills"
for s in "$SOURCE_DIR"/skills/*; do
  ln -sfn "$s" "$HOME/.claude/skills/$(basename "$s")"
  echo "[ok] $(basename "$s")"
  if [ -n "${FIXTURE_FAIL:-}" ]; then exit "$FIXTURE_FAIL"; fi
  if [ -n "${FIXTURE_SLEEP:-}" ]; then sleep "$FIXTURE_SLEEP"; fi
done
printf '# workflow block\n' >> "$HOME/.claude/CLAUDE.md"
"#;
        let path = repo.join("install.sh");
        std::fs::write(&path, script).unwrap();
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        // WP7: the real `uninstall.sh`'s shape. It removes only links resolving into its own
        // repo (`readlink -f` vs a logical `pwd` SOURCE_DIR, as the real one), excises the block,
        // `--dry-run` changes nothing, `FIXTURE_UNINSTALL_FAIL` exits with that code after the
        // first removal, and `FIXTURE_SLEEP` pauses after each removal (WP8: the window test).
        let uninstall = r#"#!/bin/bash
set -euo pipefail
SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"
DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1
for l in "$HOME"/.claude/skills/*; do
  [ -L "$l" ] || continue
  case "$(readlink -f "$l")" in
    "$SOURCE_DIR"/*)
      if [ "$DRY" -eq 1 ]; then echo "  [remove] $(basename "$l") (dry-run)"
      else rm "$l"; echo "  [remove] $(basename "$l")"
        if [ -n "${FIXTURE_UNINSTALL_FAIL:-}" ]; then exit "$FIXTURE_UNINSTALL_FAIL"; fi
        if [ -n "${FIXTURE_SLEEP:-}" ]; then sleep "$FIXTURE_SLEEP"; fi
      fi ;;
    *) echo "  [skip] $(basename "$l") (not ours)" ;;
  esac
done
if [ "$DRY" -eq 0 ] && [ -f "$HOME/.claude/CLAUDE.md" ]; then
  grep -v '^# workflow block$' "$HOME/.claude/CLAUDE.md" > "$HOME/.claude/CLAUDE.md.tmp" || true
  mv "$HOME/.claude/CLAUDE.md.tmp" "$HOME/.claude/CLAUDE.md"
fi
"#;
        let path = repo.join("uninstall.sh");
        std::fs::write(&path, uninstall).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
    }
    let git = |args: &[&str]| {
        let out = Command::new("git")
            .args([
                "-c",
                "user.name=t",
                "-c",
                "user.email=t@t",
                "-c",
                "commit.gpgsign=false",
            ])
            .args(args)
            .current_dir(repo)
            .output()
            .unwrap();
        assert!(
            out.status.success(),
            "{}",
            String::from_utf8_lossy(&out.stderr)
        );
    };
    git(&["init", "-q"]);
    git(&["add", "-A"]);
    git(&["commit", "-q", "-m", "fixture"]);
    dir
}

/// The installer's sandbox root (`<sandbox>/home`, canonical: `/var` is `/private/var`), plus a
/// SEPARATE decoy `$HOME` for the shell, so a write that ignores the root lands somewhere visible.
pub(crate) struct Host {
    pub(crate) sandbox: Sandbox,
    pub(crate) decoy: TempDir,
}

impl Host {
    pub(crate) fn new() -> Self {
        Self {
            sandbox: Sandbox::new(),
            decoy: TempDir::new().unwrap(),
        }
    }
    pub(crate) fn root(&self) -> String {
        self.sandbox
            .home()
            .canonicalize()
            .unwrap()
            .display()
            .to_string()
    }
    pub(crate) fn clone_dir(&self) -> PathBuf {
        PathBuf::from(remote_clone_path(&self.root()))
    }
    pub(crate) fn record(&self) -> PathBuf {
        PathBuf::from(format!("{}/.claudesk/install-record.json", self.root()))
    }
    pub(crate) fn script(&self, url: &Path) -> String {
        let root = self.root();
        install_script_from(
            &root,
            &url.display().to_string(),
            &remote_record(&root, NOW),
        )
        .unwrap()
    }
    /// The real script under zsh, synchronously. Returns stdout.
    pub(crate) fn run(&self, script: &str, env: &[(&str, &str)]) -> String {
        let mut cmd = Command::new("/bin/zsh");
        cmd.arg("-c").arg(script).env("HOME", self.decoy.path());
        for (k, v) in env {
            cmd.env(k, v);
        }
        let out = cmd.output().unwrap();
        String::from_utf8_lossy(&out.stdout).into_owned()
    }
    /// What the open check / Settings probe reads for this root now.
    pub(crate) fn reprobe(&self) -> HostSubstrate {
        let out = Command::new("/bin/zsh")
            .arg("-c")
            .arg(substrate_refresh_script(Some(&self.root())))
            .env("HOME", self.decoy.path())
            .output()
            .unwrap();
        let facts = parse_refresh(&String::from_utf8_lossy(&out.stdout)).expect("an answer");
        HostSubstrate::from_read(&facts.substrate)
    }
    pub(crate) fn decoy_is_empty(&self) -> bool {
        std::fs::read_dir(self.decoy.path())
            .unwrap()
            .next()
            .is_none()
    }
}

fn results(out: &str) -> Vec<RunLine> {
    out.lines().filter_map(parse_run_line).collect()
}

pub(crate) fn result_of(out: &str) -> Option<RunResult> {
    results(out).into_iter().find_map(|l| match l {
        RunLine::Result(r) => Some(r),
        _ => None,
    })
}

/// Every path under `dir`, recursively, without following symlinks.
pub(crate) fn walk(dir: &Path) -> Vec<PathBuf> {
    let mut all = Vec::new();
    let mut stack = vec![dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        for e in std::fs::read_dir(&d).unwrap() {
            let e = e.unwrap();
            let p = e.path();
            all.push(p.clone());
            if e.file_type().unwrap().is_dir() {
                stack.push(p);
            }
        }
    }
    all
}

#[test]
fn a_clean_install_reports_ok_writes_the_record_last_and_reads_managed() {
    let repo = fixture_repo(true);
    let host = Host::new();
    let out = host.run(&host.script(repo.path()), &[]);
    let lines = results(&out);
    assert!(matches!(lines.first(), Some(RunLine::Pgid(_))), "{out}");
    let phases: Vec<_> = lines
        .iter()
        .filter_map(|l| match l {
            RunLine::Phase(p) => Some(*p),
            _ => None,
        })
        .collect();
    assert_eq!(phases, [Phase::Clone, Phase::Install], "{out}");
    assert_eq!(result_of(&out), Some(RunResult::Ok), "{out}");
    assert!(
        out.contains("[ok] feature-build"),
        "install.sh's log is printed: {out}"
    );
    assert!(
        !out.contains("CLAUDESK-OPEN:"),
        "the probe's lines stay inside the script: {out}"
    );

    let record = provenance::parse_record(&std::fs::read(host.record()).unwrap()).unwrap();
    assert_eq!(record, remote_record(&host.root(), NOW));
    let link =
        std::fs::canonicalize(format!("{}/.claude/skills/feature-build", host.root())).unwrap();
    assert!(link.starts_with(host.clone_dir()), "{link:?}");
    assert!(matches!(host.reprobe(), HostSubstrate::Managed { .. }));
    assert!(
        host.decoy_is_empty(),
        "nothing landed in the shell's own $HOME"
    );
}

/// 6.4 — containment. Every path the run created is under the injected root (canonical), the
/// shell's real `$HOME` (a decoy) is untouched, and the set `install.sh` + the run write is there.
#[test]
fn every_write_of_a_sandboxed_install_stays_under_the_root() {
    let repo = fixture_repo(true);
    let host = Host::new();
    let before: std::collections::BTreeSet<_> = walk(host.sandbox.boundary()).into_iter().collect();
    let out = host.run(&host.script(repo.path()), &[]);
    assert_eq!(result_of(&out), Some(RunResult::Ok), "{out}");
    let written: Vec<PathBuf> = walk(host.sandbox.boundary())
        .into_iter()
        .filter(|p| !before.contains(p))
        .collect();
    host.sandbox
        .assert_writes_stay_under(Path::new(&host.root()), &written);
    for expected in [
        ".claude/skills/feature-build",
        ".claude/skills/task-plan",
        ".claude/CLAUDE.md",
        ".claudesk/install-record.json",
        ".claudesk/install.log",
        &format!(".claudesk/vendor/{CLONE_DIR_NAME}/install.sh"),
    ] {
        // `walk` reports the sandbox's own (uncanonical, `/var`) spelling.
        let p = host.sandbox.home().join(expected);
        assert!(
            written.contains(&p),
            "{expected} was not written: {written:?}"
        );
    }
    assert!(!written
        .iter()
        .any(|p| p.ends_with("install-record.json.tmp")));
    assert!(
        host.decoy_is_empty(),
        "a write escaped to the shell's $HOME"
    );
}

#[test]
fn an_installed_root_is_refused_before_anything_is_written() {
    let repo = fixture_repo(true);
    let host = Host::new();
    assert_eq!(
        result_of(&host.run(&host.script(repo.path()), &[])),
        Some(RunResult::Ok)
    );
    let rec = std::fs::read(host.record()).unwrap();
    let out = host.run(&host.script(repo.path()), &[]);
    assert_eq!(result_of(&out), Some(RunResult::AlreadyPresent), "{out}");
    assert!(!out.contains("CLAUDESK-RUN:phase:clone"), "{out}");
    assert_eq!(
        std::fs::read(host.record()).unwrap(),
        rec,
        "the record is untouched"
    );

    // A record with NO links (the probe reads `no`) is refused too.
    let host = Host::new();
    std::fs::write(host.record(), b"{}").unwrap();
    assert_eq!(
        result_of(&host.run(&host.script(repo.path()), &[])),
        Some(RunResult::AlreadyPresent)
    );
}

#[test]
fn a_hand_install_the_probe_finds_is_refused() {
    // Links into a repo carrying the marker, with no record: the host reads Developer.
    let repo = fixture_repo(true);
    let host = Host::new();
    let skills = format!("{}/.claude/skills", host.root());
    std::fs::create_dir_all(&skills).unwrap();
    std::os::unix::fs::symlink(
        repo.path().join("skills/feature-build"),
        format!("{skills}/feature-build"),
    )
    .unwrap();
    let out = host.run(&host.script(repo.path()), &[]);
    assert_eq!(result_of(&out), Some(RunResult::AlreadyPresent), "{out}");
    assert!(!host.clone_dir().exists());
}

#[test]
fn a_leftover_clone_with_no_record_is_removed_then_installed() {
    let repo = fixture_repo(true);
    let host = Host::new();
    std::fs::create_dir_all(host.clone_dir().join(".git")).unwrap();
    std::fs::write(host.clone_dir().join("junk"), "x").unwrap();
    let out = host.run(&host.script(repo.path()), &[]);
    assert!(results(&out).contains(&RunLine::StaleRemoved), "{out}");
    assert_eq!(result_of(&out), Some(RunResult::Ok), "{out}");
    assert!(!host.clone_dir().join("junk").exists());
    assert!(host.clone_dir().join("install.sh").exists());
}

#[test]
fn a_leftover_that_is_a_symlink_or_resolves_outside_the_root_is_never_removed() {
    let repo = fixture_repo(true);
    // (a) The clone path is a symlink to a folder elsewhere.
    let host = Host::new();
    let elsewhere = TempDir::new().unwrap();
    std::fs::write(elsewhere.path().join("keep"), "x").unwrap();
    std::os::unix::fs::symlink(elsewhere.path(), host.clone_dir()).unwrap();
    let out = host.run(&host.script(repo.path()), &[]);
    assert_eq!(
        result_of(&out),
        Some(RunResult::StaleRefused("not-a-folder".into())),
        "{out}"
    );
    assert!(elsewhere.path().join("keep").exists());

    // (b) `vendor` itself is a symlink, so the clone dir's physical path is outside the root.
    let host = Host::new();
    let outside = TempDir::new().unwrap();
    std::fs::create_dir_all(outside.path().join(CLONE_DIR_NAME)).unwrap();
    std::fs::write(outside.path().join(CLONE_DIR_NAME).join("keep"), "x").unwrap();
    let vendor = PathBuf::from(format!("{}/.claudesk/vendor", host.root()));
    std::fs::remove_dir(&vendor).unwrap();
    std::os::unix::fs::symlink(outside.path(), &vendor).unwrap();
    let out = host.run(&host.script(repo.path()), &[]);
    assert_eq!(
        result_of(&out),
        Some(RunResult::StaleRefused("outside-root".into())),
        "{out}"
    );
    assert!(outside.path().join(CLONE_DIR_NAME).join("keep").exists());
}

#[test]
fn a_failed_clone_a_repo_without_installer_and_a_failed_install_leave_no_record() {
    let host = Host::new();
    let gone = TempDir::new().unwrap();
    let out = host.run(&host.script(&gone.path().join("no-such-repo")), &[]);
    assert!(
        matches!(result_of(&out), Some(RunResult::CloneFailed(c)) if c != 0),
        "{out}"
    );
    assert!(!host.record().exists());

    let host = Host::new();
    let bare = fixture_repo(false);
    let out = host.run(&host.script(bare.path()), &[]);
    assert_eq!(result_of(&out), Some(RunResult::NoInstallScript), "{out}");
    assert!(!host.record().exists());

    let host = Host::new();
    let repo = fixture_repo(true);
    let out = host.run(&host.script(repo.path()), &[("FIXTURE_FAIL", "7")]);
    assert_eq!(result_of(&out), Some(RunResult::InstallFailed(7)), "{out}");
    assert!(
        out.contains("[ok] feature-build"),
        "the log is printed on failure too: {out}"
    );
    assert!(
        !host.record().exists(),
        "no record after a failed install.sh"
    );
}

#[test]
fn a_root_that_does_not_exist_is_refused() {
    let host = Host::new();
    let root = format!("{}/missing", host.root());
    let s = install_script_from(&root, "/nowhere", &remote_record(&root, NOW)).unwrap();
    assert_eq!(result_of(&host.run(&s, &[])), Some(RunResult::NoRoot));
    assert!(!Path::new(&root).exists());
}

/// WP7 Phase 1 (MINOR): a root that exists but where Claudesk's own folder can't be created is
/// `no-write`, not "the install folder doesn't exist". Here the vendor dir is a FILE, so
/// `mkdir -p` fails; nothing is cloned or recorded.
#[test]
fn a_root_where_the_vendor_folder_cannot_be_made_is_no_write() {
    let repo = fixture_repo(true);
    let host = Host::new();
    let vendor = host.sandbox.vendor_dir();
    std::fs::remove_dir(&vendor).unwrap();
    std::fs::write(&vendor, "a file in the way").unwrap();
    let out = host.run(&host.script(repo.path()), &[]);
    assert_eq!(result_of(&out), Some(RunResult::NoWrite), "{out}");
    assert!(!host.record().exists() && vendor.is_file());
    let f = resolve(
        "h",
        Some(&RunResult::NoWrite),
        0,
        false,
        Some(&HostSubstrate::Absent),
    );
    assert!(f.message.unwrap().contains(".claudesk/vendor"));
}

/// The run script's fixed names come from the shared constants (WP7 Phase 1, MINOR): the record
/// is `provenance::RECORD_FILENAME` under the vendor subpath's dot-dir, the clone the vendor
/// subpath + `CLONE_DIR_NAME`, so the script, the probe's reader and the local wizard agree.
#[test]
fn the_scripts_names_come_from_the_shared_constants() {
    let s = install_script_from(
        "/Users/me",
        REMOTE_ORIGIN_URL,
        &remote_record("/Users/me", NOW),
    )
    .unwrap();
    assert!(
        s.contains(&format!(
            "rec=\"$root/{}/{}\"",
            crate::workflow_install::DEFAULT_VENDOR_SUBPATH[0],
            provenance::RECORD_FILENAME
        )),
        "{s}"
    );
    assert!(s.contains(&format!(
        "vendor=\"$root/{}\"",
        crate::workflow_install::DEFAULT_VENDOR_SUBPATH.join("/")
    )));
    assert!(
        s.contains("clone=\"$vendor/my-claude-code-customization\""),
        "{s}"
    );
    for c in [CLONE_DIR_NAME, provenance::RECORD_FILENAME]
        .into_iter()
        .chain(crate::workflow_install::DEFAULT_VENDOR_SUBPATH)
    {
        assert!(
            c.bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b)),
            "{c:?} enters the script unquoted, so it must be a plain name"
        );
    }
}

/// The preflight's three arms, with `xcode-select` stubbed on PATH ("Probe outcomes" (5)).
#[test]
fn the_developer_tools_preflight_refuses_without_running_git() {
    let repo = fixture_repo(true);
    let stub_dir = TempDir::new().unwrap();
    let stub = stub_dir.path().join("xcode-select");
    std::fs::write(&stub, "#!/bin/sh\nexit 2\n").unwrap();
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(&stub, std::fs::Permissions::from_mode(0o755)).unwrap();
    let path = format!(
        "{}:/usr/bin:/bin:/usr/sbin:/sbin",
        stub_dir.path().display()
    );

    // (a) No tools: empty output, exit 2.
    let host = Host::new();
    let out = host.run(&host.script(repo.path()), &[("PATH", &path)]);
    assert_eq!(result_of(&out), Some(RunResult::NoDevTools), "{out}");
    assert!(!host.clone_dir().exists(), "git never ran");

    // (b) An invalid developer dir: `xcode-select -p` prints it and exits 0, and the guard still
    // refuses, because it checks the binary.
    let host = Host::new();
    let out = host.run(
        &host.script(repo.path()),
        &[("DEVELOPER_DIR", "/var/empty")],
    );
    assert_eq!(result_of(&out), Some(RunResult::NoDevTools), "{out}");
    assert!(!host.clone_dir().exists());

    // (c) This Mac's real developer dir: the run proceeds.
    let host = Host::new();
    assert_eq!(
        result_of(&host.run(&host.script(repo.path()), &[])),
        Some(RunResult::Ok)
    );
}

// ── 6.3b: the install window on the host ─────────────────────────────────────────────────

struct Lines(Mutex<Vec<String>>);
impl OutputSink for Lines {
    fn line(&self, line: &str) {
        self.0.lock().unwrap().push(line.to_string());
    }
}
impl Lines {
    fn pgid(&self) -> Option<u32> {
        self.0
            .lock()
            .unwrap()
            .iter()
            .find_map(|l| match parse_run_line(l) {
                Some(RunLine::Pgid(p)) => Some(p),
                _ => None,
            })
    }
    fn saw(&self, needle: &str) -> bool {
        self.0.lock().unwrap().iter().any(|l| l == needle)
    }
}

/// How long after its line a test's group kill is delivered: well inside the step the line opens.
/// ⚠️ Not immediately: a kill sent within ~2 ms of `phase:install` landed before zsh forked
/// `install.sh`'s subshell, so the WP6 version of this test passed while a TERM 5 ms later killed
/// `install.sh` (WP7 Phase 1).
const KILL_DELAY: Duration = Duration::from_millis(300);

/// Run `script` the way the commands layer does (own process group, streamed), and
/// [`KILL_DELAY`] after the stream shows `when`, send `kill -TERM -- -<pgid>` to the run's group,
/// as Cancel does on the host. Returns the lines and the exit code.
pub(crate) fn run_and_group_kill_at(
    host: &Host,
    script: &str,
    when: &str,
    env: &str,
) -> (Vec<String>, i32) {
    let sink = Lines(Mutex::new(Vec::new()));
    let killed = std::cell::Cell::new(false);
    let seen_at = std::cell::Cell::new(None::<Instant>);
    let ours = unsafe { libc::getpgrp() };
    let hook = || {
        if seen_at.get().is_none() && sink.saw(when) {
            seen_at.set(Some(Instant::now()));
        }
        let due = seen_at.get().is_some_and(|t| t.elapsed() >= KILL_DELAY);
        if !killed.get() && due {
            let pgid = sink.pgid().expect("the pgid came first") as libc::pid_t;
            assert_ne!(pgid, ours, "never signal the test runner's own group");
            // SAFETY: a TERM to the run's own process group, as the remote Cancel sends.
            unsafe { libc::kill(-pgid, libc::SIGTERM) };
            killed.set(true);
        }
        false
    };
    let script = format!(
        "export HOME={} {env}\n{script}",
        quote(&host.decoy.path().display().to_string())
    );
    let (code, _) = run_streaming_abortable(
        "/bin/zsh",
        &["-c".into(), script],
        None,
        &sink,
        Duration::from_secs(60),
        &hook,
    )
    .unwrap();
    assert!(killed.get(), "the kill was sent");
    let lines = sink.0.lock().unwrap().clone();
    (lines, code)
}

#[test]
fn a_group_kill_after_the_install_phase_cannot_split_links_from_the_record() {
    let repo = fixture_repo(true);
    let host = Host::new();
    let started = Instant::now();
    let (lines, _) = run_and_group_kill_at(
        &host,
        &host.script(repo.path()),
        "CLAUDESK-RUN:phase:install",
        "FIXTURE_SLEEP=1; export FIXTURE_SLEEP",
    );
    assert!(
        started.elapsed() >= Duration::from_secs(2),
        "install.sh ran its full course"
    );
    let out = lines.join("\n");
    assert_eq!(result_of(&out), Some(RunResult::Ok), "{out}");
    assert!(host.record().exists(), "the record was written");
    assert!(matches!(host.reprobe(), HostSubstrate::Managed { .. }));
}

#[test]
fn a_group_kill_during_the_clone_stops_the_run_and_records_nothing() {
    let host = Host::new();
    // Only the clone fragment is replaced: a clone that takes 30 s.
    let script = host.script(Path::new("/unused")).replace(
        "GIT_TERMINAL_PROMPT=0 \"$d/usr/bin/git\" clone -- '/unused' \"$clone\" </dev/null 2>&1",
        "sleep 30",
    );
    assert!(
        script.contains("\nsleep 30\n"),
        "the clone fragment was replaced: {script}"
    );
    let started = Instant::now();
    let (lines, code) = run_and_group_kill_at(&host, &script, "CLAUDESK-RUN:phase:clone", "");
    assert!(
        started.elapsed() < Duration::from_secs(10),
        "stopped promptly"
    );
    let out = lines.join("\n");
    assert_eq!(
        result_of(&out),
        None,
        "no result: the run was killed: {out}"
    );
    assert_ne!(code, 0);
    assert!(!host.record().exists());
    let pgid = parse_run_line(&lines[0]).map(|l| match l {
        RunLine::Pgid(p) => p,
        _ => 0,
    });
    std::thread::sleep(Duration::from_millis(500));
    // SAFETY: signal 0 only asks whether any process is left in the group.
    let alive = unsafe { libc::kill(-(pgid.unwrap() as libc::pid_t), 0) } == 0;
    assert!(!alive, "a process of the run's group is still running");
}

// ── WP7 D2: Cancel reads the stream to its end once the pgid is known ────────────────────

/// Cancel's decision, per phase: honoured before and during the clone (a remote group kill when
/// the pgid is known, else a local stop), never once `install.sh` has started; and without a
/// Cancel nothing stops.
#[test]
fn the_abort_step_honours_cancel_only_before_the_install_phase() {
    let st = |cancel, pgid, phase| RemoteRunState {
        pgid,
        phase,
        cancel_requested: cancel,
        active: None,
    };
    assert_eq!(
        abort_step(&st(false, Some(9), Some(Phase::Clone))),
        AbortStep::Continue
    );
    assert_eq!(abort_step(&st(true, None, None)), AbortStep::StopLocal);
    assert_eq!(
        abort_step(&st(true, Some(9), None)),
        AbortStep::KillRemote(9)
    );
    assert_eq!(
        abort_step(&st(true, Some(9), Some(Phase::Clone))),
        AbortStep::KillRemote(9)
    );
    assert_eq!(
        abort_step(&st(true, Some(9), Some(Phase::Install))),
        AbortStep::Continue
    );
}

/// With the pgid known, the poll sends the kill ONCE and never asks for the local ssh to stop,
/// whether the kill confirmed or not; an unconfirmed kill says so once. Without a pgid it stops.
#[test]
fn the_abort_poll_kills_once_and_keeps_reading() {
    for kill_ok in [true, false] {
        let state = Mutex::new(RemoteRunState {
            pgid: Some(42),
            phase: Some(Phase::Clone),
            cancel_requested: true,
            active: None,
        });
        let sent = std::cell::Cell::new(false);
        let kills = Mutex::new(Vec::new());
        let notes = Mutex::new(Vec::new());
        let send = |p: u32| {
            kills.lock().unwrap().push(p);
            if kill_ok {
                Ok(())
            } else {
                Err("timed out".to_string())
            }
        };
        let note = |l: &str| notes.lock().unwrap().push(l.to_string());
        for _ in 0..5 {
            assert!(
                !abort_poll(&state, &sent, &send, &note),
                "a known pgid never stops the local side (kill_ok={kill_ok})"
            );
        }
        assert_eq!(*kills.lock().unwrap(), vec![42], "one kill");
        let expected: Vec<String> = if kill_ok {
            vec![]
        } else {
            vec![CANCEL_UNCONFIRMED_NOTE.to_string()]
        };
        assert_eq!(*notes.lock().unwrap(), expected);
    }
    let state = Mutex::new(RemoteRunState {
        pgid: None,
        phase: None,
        cancel_requested: true,
        active: None,
    });
    let sent = std::cell::Cell::new(false);
    assert!(abort_poll(&state, &sent, &|_| Ok(()), &|_| {}));
    let idle = Mutex::new(RemoteRunState::default());
    assert!(!abort_poll(&idle, &sent, &|_| Ok(()), &|_| {}));
}

/// The worker's sink, as `commands::RemoteSink` writes the cancel state, plus a Cancel requested
/// the moment the clone starts.
struct CancellingSink {
    lines: std::sync::Arc<Mutex<Vec<String>>>,
    state: Mutex<RemoteRunState>,
}
impl OutputSink for CancellingSink {
    fn line(&self, line: &str) {
        self.lines.lock().unwrap().push(line.to_string());
        let mut r = self.state.lock().unwrap();
        match parse_run_line(line) {
            Some(RunLine::Pgid(p)) => {
                r.pgid.get_or_insert(p);
            }
            Some(RunLine::Phase(p)) => {
                r.phase = Some(p);
                if p == Phase::Clone {
                    r.cancel_requested = true;
                }
            }
            _ => {}
        }
    }
}

/// Run the real install script through the PRODUCTION abort poll, with Cancel requested as the
/// clone starts and `send_kill` standing in for the remote group-kill exec. The clone is slowed
/// by a sleep in front of it, so the poll sees the Clone phase. The lines land in `lines` as they
/// arrive (a test's kill stand-in may watch them); returns them at the end.
fn run_with_cancel(
    host: &Host,
    repo: &Path,
    lines: &std::sync::Arc<Mutex<Vec<String>>>,
    send_kill: &dyn Fn(u32) -> Result<(), String>,
) -> Vec<String> {
    let script = host.script(repo).replace(
        "GIT_TERMINAL_PROMPT=0 \"$d/usr/bin/git\" clone",
        "sleep 1; GIT_TERMINAL_PROMPT=0 \"$d/usr/bin/git\" clone",
    );
    assert!(
        script.contains("sleep 1; GIT_TERMINAL_PROMPT=0"),
        "{script}"
    );
    let sink = CancellingSink {
        lines: std::sync::Arc::clone(lines),
        state: Mutex::new(RemoteRunState::default()),
    };
    let sent = std::cell::Cell::new(false);
    let abort = || abort_poll(&sink.state, &sent, send_kill, &|l| sink.line(l));
    let script = format!(
        "export HOME={} FIXTURE_SLEEP=1\n{script}",
        quote(&host.decoy.path().display().to_string())
    );
    run_streaming_abortable(
        "/bin/zsh",
        &["-c".into(), script],
        None,
        &sink,
        Duration::from_secs(60),
        &abort,
    )
    .unwrap();
    assert!(sent.get(), "the poll sent the kill during the clone");
    let lines = sink.lines.lock().unwrap().clone();
    lines
}

/// The MAJOR's first arm: the remote kill did not confirm (a failed or timed-out exec). The run
/// carries on on the host, so the result must come from the run, never "Nothing was installed".
/// Locally, stopping the ssh kills the script itself, so the old "kill then stop" code fails this
/// test by ending the run with no result.
#[test]
fn a_cancel_whose_kill_fails_waits_for_the_run_and_reports_the_install() {
    let repo = fixture_repo(true);
    let host = Host::new();
    let lines = run_with_cancel(
        &host,
        repo.path(),
        &std::sync::Arc::new(Mutex::new(Vec::new())),
        &|_| Err("timed out".to_string()),
    );
    let out = lines.join("\n");
    assert!(out.contains(CANCEL_UNCONFIRMED_NOTE), "{out}");
    assert_eq!(result_of(&out), Some(RunResult::Ok), "{out}");
    let after = host.reprobe();
    assert!(matches!(after, HostSubstrate::Managed { .. }));
    let finished = resolve("h", result_of(&out).as_ref(), 0, true, Some(&after));
    assert!(finished.ok && !finished.cancelled, "{finished:?}");
    assert_eq!(
        finished.message.as_deref(),
        Some("Cancel came after install.sh had started, so the install finished.")
    );
}

/// The MAJOR's second arm: the kill reaches the host only after the clone ended and the install
/// window's trap was set (here it is delivered when `phase:install` arrives, while install.sh
/// runs for 2 s). The trap ignores it, the stream is read to its end, and the run reports `ok`.
#[test]
fn a_cancel_whose_kill_lands_after_the_trap_reports_the_finished_install() {
    let repo = fixture_repo(true);
    let host = Host::new();
    let lines: std::sync::Arc<Mutex<Vec<String>>> = std::sync::Arc::new(Mutex::new(Vec::new()));
    let delivered = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let ours = unsafe { libc::getpgrp() };
    let (watch, flag) = (
        std::sync::Arc::clone(&lines),
        std::sync::Arc::clone(&delivered),
    );
    // The kill exec "succeeds", but its TERM reaches the group only once install.sh is running.
    let send = move |pgid: u32| {
        assert_ne!(
            pgid as libc::pid_t, ours,
            "never signal the test runner's own group"
        );
        let (watch, flag) = (std::sync::Arc::clone(&watch), std::sync::Arc::clone(&flag));
        std::thread::spawn(move || {
            let until = Instant::now() + Duration::from_secs(30);
            while Instant::now() < until {
                if watch
                    .lock()
                    .unwrap()
                    .iter()
                    .any(|l| l == "CLAUDESK-RUN:phase:install")
                {
                    std::thread::sleep(KILL_DELAY);
                    // SAFETY: a TERM to the run's own process group, as the remote Cancel sends.
                    unsafe { libc::kill(-(pgid as libc::pid_t), libc::SIGTERM) };
                    flag.store(true, std::sync::atomic::Ordering::SeqCst);
                    return;
                }
                std::thread::sleep(Duration::from_millis(10));
            }
        });
        Ok(())
    };
    let out = run_with_cancel(&host, repo.path(), &lines, &send).join("\n");
    assert!(
        delivered.load(std::sync::atomic::Ordering::SeqCst),
        "the TERM reached the run's group during install.sh"
    );
    assert!(!out.contains(CANCEL_UNCONFIRMED_NOTE), "{out}");
    assert_eq!(result_of(&out), Some(RunResult::Ok), "{out}");
    assert!(host.record().exists(), "the record was written");
    let after = host.reprobe();
    assert!(matches!(after, HostSubstrate::Managed { .. }));
    let finished = resolve("h", result_of(&out).as_ref(), 0, true, Some(&after));
    assert!(finished.ok && !finished.cancelled, "{finished:?}");
    assert_eq!(
        finished.message.as_deref(),
        Some("Cancel came after install.sh had started, so the install finished."),
        "the operator is told the Cancel came too late, not shown a bare success"
    );
}
