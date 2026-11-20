//! M18 WP5 (§R.4) — the REAL `remote_cmd::substrate_refresh_script`, run locally under a temp
//! `HOME` against fixture clones whose `origin` is a local bare repo, through the real
//! `parse_refresh` and `Drift::decide`. What the readout says is decided by what the script prints,
//! so the script is what these tests run (never a retyped copy).
//!
//! The developer-tools guard's three arms use a stub `xcode-select` first on `PATH` (WP3 "Probe
//! outcomes" (5)): no host without the Command Line Tools exists to run them against.

use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::Command;

use tempfile::TempDir;

use super::parity::{git, git_repo};
use super::{Drift, HostSubstrate};
use crate::remote_cmd::{parse_refresh, substrate_refresh_script, DriftLine, RefreshFacts};

/// Run the real script with `HOME=home`, `PATH=<prefix>:/usr/bin:/bin`, optionally with the debug
/// sandbox root, and parse it.
fn run(home: &Path, path_prefix: Option<&Path>, sandbox: Option<&str>) -> RefreshFacts {
    let path = match path_prefix {
        Some(p) => format!("{}:/usr/bin:/bin", p.display()),
        None => "/usr/bin:/bin".to_string(),
    };
    let out = Command::new("/bin/zsh")
        .arg("-fc")
        .arg(substrate_refresh_script(sandbox))
        .env_clear()
        .env("HOME", home)
        .env("PATH", path)
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_CONFIG_SYSTEM", "/dev/null")
        .output()
        .expect("zsh runs");
    let stdout = String::from_utf8_lossy(&out.stdout);
    parse_refresh(&stdout).unwrap_or_else(|| panic!("no answer: {stdout:?} {out:?}"))
}

fn verdict(facts: &RefreshFacts) -> Option<Drift> {
    Drift::decide(
        &HostSubstrate::from_read(&facts.substrate),
        facts.drift.as_ref(),
    )
}

/// A marker clone linked into `home`, with a bare `origin` beside it. Returns (clone, bare, HEAD).
fn clone_with_origin(home: &Path, scratch: &Path) -> (PathBuf, PathBuf, String) {
    let (r, sha) = git_repo(home, scratch);
    let bare = scratch.join("origin.git");
    git(
        scratch,
        &[
            "clone",
            "-q",
            "--bare",
            r.to_str().unwrap(),
            bare.to_str().unwrap(),
        ],
    );
    git(&r, &["remote", "add", "origin", bare.to_str().unwrap()]);
    (r, bare, sha)
}

/// Put one more commit on `bare` (through a throwaway clone), so `origin` is ahead. Returns its sha.
fn advance(bare: &Path, scratch: &Path) -> String {
    let w = scratch.join("w");
    git(
        scratch,
        &["clone", "-q", bare.to_str().unwrap(), w.to_str().unwrap()],
    );
    fs::write(w.join("next"), "x").unwrap();
    git(&w, &["add", "-A"]);
    git(
        &w,
        &[
            "-c",
            "user.email=t@example.com",
            "-c",
            "user.name=t",
            "commit",
            "-qm",
            "next",
        ],
    );
    git(&w, &["push", "-q", "origin", "HEAD"]);
    git(&w, &["rev-parse", "HEAD"])
}

#[test]
fn a_clone_level_with_its_origin_is_up_to_date() {
    let home = TempDir::new().unwrap();
    let scratch = TempDir::new().unwrap();
    let (_, _, sha) = clone_with_origin(home.path(), scratch.path());
    let facts = run(home.path(), None, None);
    assert_eq!(facts.drift, Some(DriftLine::Remote(sha.clone())));
    assert_eq!(
        verdict(&facts),
        Some(Drift::UpToDate {
            head: sha.clone(),
            remote: sha
        })
    );
}

#[test]
fn a_clone_whose_origin_moved_on_is_behind_and_nothing_is_fetched() {
    let home = TempDir::new().unwrap();
    let scratch = TempDir::new().unwrap();
    let (r, bare, sha) = clone_with_origin(home.path(), scratch.path());
    let newer = advance(&bare, scratch.path());
    let refs_before = git(&r, &["for-each-ref"]);
    let facts = run(home.path(), None, None);
    assert_eq!(
        verdict(&facts),
        Some(Drift::Behind {
            head: sha,
            remote: newer
        })
    );
    // Read-only: `ls-remote` wrote no remote-tracking ref into the clone (§R.4).
    assert_eq!(git(&r, &["for-each-ref"]), refs_before);
}

#[test]
fn a_clone_without_an_origin_says_so() {
    let home = TempDir::new().unwrap();
    let scratch = TempDir::new().unwrap();
    git_repo(home.path(), scratch.path());
    assert_eq!(
        run(home.path(), None, None).drift,
        Some(DriftLine::NoOrigin)
    );
}

#[test]
fn an_unreachable_origin_carries_gits_own_words() {
    let home = TempDir::new().unwrap();
    let scratch = TempDir::new().unwrap();
    let (r, _) = git_repo(home.path(), scratch.path());
    let gone = scratch.path().join("gone.git");
    git(&r, &["remote", "add", "origin", gone.to_str().unwrap()]);
    match run(home.path(), None, None).drift {
        Some(DriftLine::Git(detail)) => assert!(!detail.is_empty(), "git's last line"),
        other => panic!("{other:?}"),
    }
}

#[test]
fn an_absent_substrate_runs_no_drift_half() {
    let home = TempDir::new().unwrap();
    let facts = run(home.path(), None, None);
    assert_eq!(facts.drift, None);
    assert_eq!(
        HostSubstrate::from_read(&facts.substrate),
        HostSubstrate::Absent
    );
    assert_eq!(verdict(&facts), None);
}

/// D3: the refresh honours the debug sandbox root exactly as the open check does.
#[test]
fn the_sandbox_root_is_read_in_place_of_home() {
    let home = TempDir::new().unwrap();
    let scratch = TempDir::new().unwrap();
    let sandbox = TempDir::new().unwrap();
    clone_with_origin(home.path(), scratch.path());
    assert!(matches!(
        HostSubstrate::from_read(&run(home.path(), None, None).substrate),
        HostSubstrate::Developer { .. }
    ));
    let facts = run(home.path(), None, Some(sandbox.path().to_str().unwrap()));
    assert_eq!(
        HostSubstrate::from_read(&facts.substrate),
        HostSubstrate::Absent
    );
    assert_eq!(facts.drift, None);
}

/// A stub `xcode-select` in a fresh `bin/` dir: prints `stdout` and exits `code`.
fn stub_xcode_select(scratch: &Path, stdout: &str, code: i32) -> PathBuf {
    let bin = scratch.join("bin");
    fs::create_dir_all(&bin).unwrap();
    let stub = bin.join("xcode-select");
    fs::write(
        &stub,
        format!("#!/bin/sh\nprintf '%s' '{stdout}'\nexit {code}\n"),
    )
    .unwrap();
    fs::set_permissions(&stub, fs::Permissions::from_mode(0o755)).unwrap();
    bin
}

/// D2, arm 1: no developer dir (`xcode-select -p` prints nothing, exits 2: a Mac without the
/// Command Line Tools). ⚠️ The empty-path test is what refuses here: without it the guard would
/// test `/usr/bin/git`, the shim, and pass.
#[test]
fn no_developer_dir_refuses_before_any_git() {
    let home = TempDir::new().unwrap();
    let scratch = TempDir::new().unwrap();
    clone_with_origin(home.path(), scratch.path());
    // Exit 2 is caught by the assignment's own status; an empty path with exit 0 is caught only by
    // the `-n` test (without it, `[ -x /usr/bin/git ]` passes on this Mac and the shim would run).
    for (case, code) in [("exit 2", 2), ("empty, exit 0", 0)] {
        let bin = stub_xcode_select(scratch.path(), "", code);
        let facts = run(home.path(), Some(&bin), None);
        assert_eq!(facts.drift, Some(DriftLine::NoDevTools), "{case}");
        match verdict(&facts) {
            Some(Drift::CantCheck { reason }) => {
                assert!(reason.contains("xcode-select --install"), "{case}")
            }
            other => panic!("{case}: {other:?}"),
        }
    }
}

/// D2, arm 2: a developer dir without a `git` in it (`xcode-select -p` does not validate the path).
#[test]
fn a_developer_dir_without_git_refuses() {
    let home = TempDir::new().unwrap();
    let scratch = TempDir::new().unwrap();
    clone_with_origin(home.path(), scratch.path());
    let bin = stub_xcode_select(scratch.path(), "/var/empty", 0);
    assert_eq!(
        run(home.path(), Some(&bin), None).drift,
        Some(DriftLine::NoDevTools)
    );
}

/// D2, arm 3: a developer dir WITH `git` proceeds, and the `git` that runs is THAT one (a wrapper
/// that logs each call, then hands over to the real git), never a PATH lookup.
#[test]
fn a_developer_dir_with_git_proceeds_with_its_own_git() {
    let home = TempDir::new().unwrap();
    let scratch = TempDir::new().unwrap();
    let (_, _, sha) = clone_with_origin(home.path(), scratch.path());
    let dev = scratch.path().join("Developer");
    let dev_bin = dev.join("usr/bin");
    fs::create_dir_all(&dev_bin).unwrap();
    let canary = scratch.path().join("DEV-GIT-RAN");
    let git_wrapper = dev_bin.join("git");
    fs::write(
        &git_wrapper,
        format!(
            "#!/bin/sh\necho \"$1 $2 $3\" >> '{}'\nexec /usr/bin/git \"$@\"\n",
            canary.display()
        ),
    )
    .unwrap();
    fs::set_permissions(&git_wrapper, fs::Permissions::from_mode(0o755)).unwrap();
    let bin = stub_xcode_select(scratch.path(), dev.to_str().unwrap(), 0);
    assert_eq!(
        run(home.path(), Some(&bin), None).drift,
        Some(DriftLine::Remote(sha))
    );
    // Both git calls (the `origin` check, then `ls-remote`) are THAT git, each one on its own.
    let calls = fs::read_to_string(&canary).expect("the developer dir's own git ran");
    let root = fs::canonicalize(scratch.path().join("r")).unwrap();
    let r = root.display();
    assert_eq!(
        calls,
        format!("-C {r} remote\n-C {r} ls-remote\n"),
        "each git call runs the developer dir's own git"
    );
}

/// The WHOLE command as it goes over ssh: `zsh -lc '<script>'`, handed to a shell the way sshd
/// hands it to the account's shell. The script carries single quotes (the awk program,
/// `GIT_SSH_COMMAND`), so a quoting slip in the login-shell layer would break only here, never in
/// the direct runs above (live-checked against the mini at Phase 1 verify-self).
#[test]
fn the_wrapped_command_gives_the_same_answer_through_its_login_shell() {
    let home = TempDir::new().unwrap();
    let scratch = TempDir::new().unwrap();
    let (_, _, sha) = clone_with_origin(home.path(), scratch.path());
    let out = Command::new("/bin/sh")
        .arg("-c")
        .arg(crate::remote_cmd::substrate_refresh_command(None))
        .env_clear()
        .env("HOME", home.path())
        .env("PATH", "/usr/bin:/bin")
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_CONFIG_SYSTEM", "/dev/null")
        .output()
        .expect("sh runs");
    let stdout = String::from_utf8_lossy(&out.stdout);
    let facts = parse_refresh(&stdout).unwrap_or_else(|| panic!("no answer: {out:?}"));
    assert_eq!(
        verdict(&facts),
        Some(Drift::UpToDate {
            head: sha.clone(),
            remote: sha
        })
    );
}

/// D3: the sandbox root is an env PREFIX on the probe only when given; with none (every release
/// build: `substrate_home_override` is `None` there) the command assigns no sandbox variable.
#[test]
fn only_a_given_sandbox_root_adds_the_prefix() {
    use crate::remote_cmd::{substrate_refresh_command, SUBSTRATE_HOME_ENV};
    let assign = format!("{SUBSTRATE_HOME_ENV}=");
    assert!(!substrate_refresh_command(None).contains(&assign));
    let with = substrate_refresh_script(Some("/Users/me/sand box"));
    assert_eq!(with.matches(&assign).count(), 1, "{with}");
    assert!(
        with.contains(&format!("{assign}'/Users/me/sand box' ")),
        "{with}"
    );
}
