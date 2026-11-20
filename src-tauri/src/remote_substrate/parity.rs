//! M18 WP4 (§R.2) — the PARITY GUARD: `remote_cmd::SUBSTRATE_PROBE` (the host-side copy) and
//! `workflow_substrate::skills_dir_exists` (the local predicate) must answer the same question.
//!
//! A drifted shell copy would answer an ADJACENT question, the failure that shipped twice locally
//! (`arch/claude-substrate.md` §WP3.5b lesson 1). So the real constant runs here, under a temp
//! `HOME`, against every fixture shape, and the two are compared case by case. The probe's output
//! goes through the real `parse_open_facts`. The `filter_listing_agrees_with_discover` pattern.

use std::fs;
use std::os::unix::fs::{symlink, PermissionsExt};
use std::path::{Path, PathBuf};
use std::process::Command;

use tempfile::TempDir;

use crate::remote_cmd::{
    parse_open_facts, HostProbe, SubstrateRead, OPEN_SENTINEL, SUBSTRATE_HOME_ENV, SUBSTRATE_PROBE,
};
use crate::workflow_substrate::skills_dir_exists;

pub(super) const MARKER_INSTALLER: &[u8] =
    b"#!/usr/bin/env bash\nBEGIN=\"<!-- BEGIN claude-workflow-system -->\"\n";

/// Run the real probe with `HOME=home` (and an optional `PATH` prefix), through the real parser.
fn probe_with(home: &Path, path_prefix: Option<&Path>, env_home: Option<&Path>) -> HostProbe {
    let path = match path_prefix {
        Some(p) => format!("{}:/usr/bin:/bin", p.display()),
        None => "/usr/bin:/bin".to_string(),
    };
    let mut cmd = Command::new("/bin/zsh");
    cmd.arg("-fc")
        .arg(SUBSTRATE_PROBE)
        .env_clear()
        .env("HOME", home)
        .env("PATH", path);
    if let Some(h) = env_home {
        cmd.env(SUBSTRATE_HOME_ENV, h);
    }
    let out = cmd.output().expect("zsh runs");
    let stdout = String::from_utf8_lossy(&out.stdout);
    let framed = format!(
        "{s}dir:yes\n{s}live:no\n{s}substrate-probed\n{stdout}",
        s = OPEN_SENTINEL
    );
    match parse_open_facts(&framed)
        .expect("framed facts parse")
        .substrate
    {
        Some(SubstrateRead::Known(p)) => p,
        other => panic!("the probe printed no answer ({other:?}): {stdout:?}"),
    }
}

fn probe(home: &Path) -> HostProbe {
    probe_with(home, None, None)
}

/// A repo at `at` with a `skills/<skill>` dir and an `install.sh` holding `installer`.
pub(super) fn repo(at: &Path, installer: Option<&[u8]>) -> PathBuf {
    fs::create_dir_all(at.join("skills/feature-build")).unwrap();
    if let Some(body) = installer {
        fs::write(at.join("install.sh"), body).unwrap();
    }
    at.to_path_buf()
}

pub(super) fn skills(home: &Path) -> PathBuf {
    let d = home.join(".claude/skills");
    fs::create_dir_all(&d).unwrap();
    d
}

pub(super) fn link(home: &Path, repo: &Path, name: &str) {
    symlink(repo.join("skills/feature-build"), skills(home).join(name)).unwrap();
}

/// One fixture: a name, the expected answer, and a builder that lays out `home` (with a scratch
/// dir for repos) and returns the repo root the probe should print, if positive.
type Build = fn(&Path, &Path) -> Option<PathBuf>;

fn fixtures() -> Vec<(&'static str, bool, Build)> {
    vec![
        ("none", false, |_, _| None),
        ("no skills dir", false, |h, _| {
            fs::create_dir_all(h.join(".claude")).unwrap();
            None
        }),
        ("skills is a file", false, |h, _| {
            fs::create_dir_all(h.join(".claude")).unwrap();
            fs::write(h.join(".claude/skills"), "x").unwrap();
            None
        }),
        ("empty skills dir", false, |h, _| {
            skills(h);
            None
        }),
        ("a user's real dir", false, |h, _| {
            fs::create_dir_all(skills(h).join("mine")).unwrap();
            None
        }),
        ("a dangling link", false, |h, s| {
            symlink(s.join("gone"), skills(h).join("x")).unwrap();
            None
        }),
        ("a repo without an installer", false, |h, s| {
            let r = repo(&s.join("r"), None);
            link(h, &r, "x");
            None
        }),
        ("an installer without the marker", false, |h, s| {
            let r = repo(&s.join("r"), Some(b"#!/bin/sh\necho other system\n"));
            link(h, &r, "x");
            None
        }),
        ("the marker", true, |h, s| {
            let r = repo(&s.join("r"), Some(MARKER_INSTALLER));
            link(h, &r, "feature-build");
            Some(r)
        }),
        ("a user dir + a marker link", true, |h, s| {
            fs::create_dir_all(skills(h).join("mine")).unwrap();
            let r = repo(&s.join("r"), Some(MARKER_INSTALLER));
            link(h, &r, "feature-build");
            Some(r)
        }),
        ("a marker link under a dotfile name", true, |h, s| {
            let r = repo(&s.join("r"), Some(MARKER_INSTALLER));
            link(h, &r, ".hidden");
            Some(r)
        }),
        ("the skills dir itself a symlink", true, |h, s| {
            let r = repo(&s.join("r"), Some(MARKER_INSTALLER));
            let real = s.join("real-skills");
            fs::create_dir_all(&real).unwrap();
            symlink(r.join("skills/feature-build"), real.join("feature-build")).unwrap();
            fs::create_dir_all(h.join(".claude")).unwrap();
            symlink(&real, h.join(".claude/skills")).unwrap();
            Some(r)
        }),
        // Found at WP4 P1 verify-self (mutant M2 survived): a REAL dir whose grandparent holds a
        // marker installer. Only the symlink check rejects it, on both sides.
        (
            "a real dir under a marker installer two levels up",
            false,
            |h, _| {
                fs::create_dir_all(skills(h).join("mine")).unwrap();
                fs::write(h.join(".claude/install.sh"), MARKER_INSTALLER).unwrap();
                None
            },
        ),
        // Same round (the `-e $t` check): a skill deleted upstream with its link left behind. The
        // link dangles INTO a marker repo, so only the "target exists" check rejects it.
        ("a link dangling into a marker repo", false, |h, s| {
            let r = repo(&s.join("r"), Some(MARKER_INSTALLER));
            symlink(r.join("skills/deleted-upstream"), skills(h).join("x")).unwrap();
            None
        }),
        // WP3's known divergence, settled at P1.4: Rust now reads bytes, as perl does.
        ("a non-UTF-8 installer holding the marker", true, |h, s| {
            let mut body = b"#!/bin/sh\n# \xff\xfe latin-1 \xe9\n".to_vec();
            body.extend_from_slice(MARKER_INSTALLER);
            let r = repo(&s.join("r"), Some(&body));
            link(h, &r, "feature-build");
            Some(r)
        }),
        // D3: the answer keeps parity; the root (which would break the line protocol) is withheld.
        ("a repo path containing a newline", true, |h, s| {
            let r = repo(&s.join("odd\nroot"), Some(MARKER_INSTALLER));
            link(h, &r, "feature-build");
            None
        }),
    ]
}

#[test]
fn substrate_probe_agrees_with_skills_dir_exists() {
    let fixtures = fixtures();
    assert_eq!(fixtures.len(), 16, "every shape: WP3's 12 + four");
    for (name, want, build) in fixtures {
        let home = TempDir::new().unwrap();
        let scratch = TempDir::new().unwrap();
        let root = build(home.path(), scratch.path());
        let local = skills_dir_exists(home.path());
        let remote = probe(home.path());
        assert_eq!(local, want, "{name}: the local predicate");
        assert_eq!(
            remote.present, local,
            "{name}: the probe agrees with the local predicate"
        );
        let want_root = root.map(|r| r.canonicalize().unwrap().to_str().unwrap().to_string());
        assert_eq!(remote.root, want_root, "{name}: the printed root");
    }
}

pub(super) fn git(dir: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_CONFIG_SYSTEM", "/dev/null")
        .output()
        .expect("git runs");
    assert!(out.status.success(), "git {args:?}: {out:?}");
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

/// A marker repo under git, linked into `home`. Returns (repo, HEAD sha).
pub(super) fn git_repo(home: &Path, scratch: &Path) -> (PathBuf, String) {
    let r = repo(&scratch.join("r"), Some(MARKER_INSTALLER));
    link(home, &r, "feature-build");
    git(&r, &["init", "-q", "-b", "main"]);
    git(&r, &["add", "-A"]);
    git(
        &r,
        &[
            "-c",
            "user.email=t@example.com",
            "-c",
            "user.name=t",
            "commit",
            "-qm",
            "init",
        ],
    );
    let sha = git(&r, &["rev-parse", "HEAD"]);
    (r, sha)
}

/// D1: HEAD is read from `.git` in perl: a loose ref, a packed ref, a detached HEAD. A `.git` FILE
/// (a worktree) prints no head, and presence is unaffected.
#[test]
fn the_probe_reads_head_from_dot_git_without_git() {
    let home = TempDir::new().unwrap();
    let scratch = TempDir::new().unwrap();
    let (r, sha) = git_repo(home.path(), scratch.path());
    assert_eq!(
        probe(home.path()).head.as_deref(),
        Some(sha.as_str()),
        "loose ref"
    );
    git(&r, &["pack-refs", "--all"]);
    assert!(
        !r.join(".git/refs/heads/main").exists(),
        "the ref is packed now"
    );
    assert_eq!(
        probe(home.path()).head.as_deref(),
        Some(sha.as_str()),
        "packed ref"
    );
    git(&r, &["checkout", "-q", "--detach"]);
    assert_eq!(
        probe(home.path()).head.as_deref(),
        Some(sha.as_str()),
        "detached"
    );
    fs::remove_dir_all(r.join(".git")).unwrap();
    fs::write(r.join(".git"), "gitdir: /elsewhere/.git/worktrees/r\n").unwrap();
    let p = probe(home.path());
    assert!(p.present, "a worktree is still the substrate");
    assert_eq!(p.head, None, "a .git file: head unknown");
}

/// ⚠️ The finding D1 settles: no `git` runs. A `git` first on PATH that leaves a canary and fails
/// changes nothing (it would be the CLT shim on a host without the tools).
#[test]
fn the_probe_never_runs_git() {
    let home = TempDir::new().unwrap();
    let scratch = TempDir::new().unwrap();
    let (_, sha) = git_repo(home.path(), scratch.path());
    let bin = scratch.path().join("bin");
    fs::create_dir_all(&bin).unwrap();
    let canary = scratch.path().join("GIT-RAN");
    let stub = bin.join("git");
    fs::write(
        &stub,
        format!("#!/bin/sh\ntouch '{}'\nexit 1\n", canary.display()),
    )
    .unwrap();
    fs::set_permissions(&stub, fs::Permissions::from_mode(0o755)).unwrap();
    let p = probe_with(home.path(), Some(&bin), None);
    assert_eq!(p.head.as_deref(), Some(sha.as_str()));
    assert!(!canary.exists(), "the probe ran `git`");
}

/// D2: with the host-side sandbox variable set, the probe reads THAT root, not `$HOME`, for both
/// the skills and the record.
#[test]
fn the_sandbox_home_variable_redirects_the_skills_and_the_record() {
    let home = TempDir::new().unwrap();
    let sandbox = TempDir::new().unwrap();
    let scratch = TempDir::new().unwrap();
    let r = repo(&scratch.path().join("r"), Some(MARKER_INSTALLER));
    link(home.path(), &r, "feature-build");
    fs::create_dir_all(sandbox.path().join(".claudesk")).unwrap();
    fs::write(
        sandbox.path().join(".claudesk/install-record.json"),
        "{\"x\":1}\n",
    )
    .unwrap();
    // The real home has the substrate; the (empty) sandbox does not.
    assert!(probe(home.path()).present);
    let p = probe_with(home.path(), None, Some(sandbox.path()));
    assert!(!p.present, "the sandbox root is read, not $HOME");
    assert_eq!(
        p.record.as_deref(),
        Some(&b"{\"x\":1}\n"[..]),
        "the sandbox's record, hex round-tripped"
    );
    assert_eq!(
        probe(home.path()).record,
        None,
        "the real home has no record"
    );
}
