//! Tests for [`super`]: the observation parser, the guard over REAL host observations (the observe
//! script under `/bin/zsh -c`, a separate decoy `$HOME`), the real uninstall script against a root
//! that WP6's real install script made Managed, and the reducer. The fixture repo's `uninstall.sh`
//! has the real one's shape (`remote_runner_tests::fixture_repo`).

use super::*;
use crate::workflow_install::remote_runner::tests::{fixture_repo, walk, Host};
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use tempfile::TempDir;

/// Run one host script the way the tests run every host script: zsh, the decoy as `$HOME`.
fn exec_on(host: &Host) -> impl Fn(&str) -> Result<String, String> + '_ {
    move |script: &str| {
        let out = Command::new("/bin/zsh")
            .arg("-c")
            .arg(script)
            .env("HOME", host.decoy.path())
            .output()
            .map_err(|e| e.to_string())?;
        Ok(String::from_utf8_lossy(&out.stdout).into_owned())
    }
}

/// A root WP6's real install script made Managed.
fn managed_host() -> (Host, TempDir) {
    let repo = fixture_repo(true);
    let host = Host::new();
    let out = host.run(&host.script(repo.path()), &[]);
    assert!(out.contains("CLAUDESK-RUN:result:ok"), "{out}");
    assert!(matches!(host.reprobe(), HostSubstrate::Managed { .. }));
    (host, repo)
}

fn guard(host: &Host) -> Result<RemoteUninstallTarget, String> {
    observe_and_guard(&host.root(), &exec_on(host))
}

/// Replace the host's record with one naming `clone_path` (everything else as written).
fn rewrite_record(host: &Host, clone_path: &Path) {
    let mut rec: InstallRecord =
        serde_json::from_slice(&std::fs::read(host.record()).unwrap()).unwrap();
    rec.clone_path = clone_path.to_path_buf();
    std::fs::write(host.record(), serde_json::to_vec(&rec).unwrap()).unwrap();
}

fn links(host: &Host) -> usize {
    std::fs::read_dir(format!("{}/.claude/skills", host.root()))
        .map(|d| d.count())
        .unwrap_or(0)
}

fn uninstall_result(out: &str) -> Option<UninstallResult> {
    out.lines().find_map(parse_uninstall_line)
}

// ── The observation ──────────────────────────────────────────────────────────────────────

#[test]
fn an_observation_round_trips_and_a_malformed_one_reads_as_nothing() {
    let hex = |s: &str| s.bytes().map(|b| format!("{b:02x}")).collect::<String>();
    let out = format!(
        "noise\nCLAUDESK-OBS:root:{}\nCLAUDESK-OBS:root-claude:-\nCLAUDESK-OBS:home:{}\n\
         CLAUDESK-OBS:home-claude:{}\nCLAUDESK-OBS:target:{}\nCLAUDESK-OBS:target-dir:1\n\
         CLAUDESK-OBS:target-uninstall:0\nCLAUDESK-OBS:record:7b7d\n",
        hex("/r"),
        hex("/h"),
        hex("/h/.claude"),
        hex("/r/a\nb"),
    );
    let o = parse_observation(&out).expect("parses");
    assert_eq!(o.root, "/r");
    assert_eq!(o.root_claude, None);
    assert_eq!(
        o.target.as_deref(),
        Some("/r/a\nb"),
        "a newline stays inside its value"
    );
    assert!(o.target_is_dir && !o.has_uninstall);
    assert_eq!(o.record_hex, "7b7d");
    for broken in [
        out.replace("CLAUDESK-OBS:root:", "CLAUDESK-OBS:rooot:"),
        out.replace(&format!("root:{}", hex("/r")), "root:-"),
        out.replace("target-dir:1", "target-dir:yes"),
        out.replace("record:7b7d", "record:7g"),
        out.replace(&format!("home:{}", hex("/h")), "home:zz"),
    ] {
        assert_eq!(parse_observation(&broken), None, "{broken}");
    }
}

// ── The guard, over real host observations ───────────────────────────────────────────────

#[test]
fn a_managed_root_is_approved_with_the_clones_physical_path() {
    let (host, _repo) = managed_host();
    let t = guard(&host).expect("approved");
    assert_eq!(
        Path::new(t.clone_dir()),
        host.clone_dir().canonicalize().unwrap()
    );
    assert_eq!(t.root(), host.root());
}

#[test]
fn no_record_and_a_corrupt_record_are_refused_as_no_record() {
    let (host, _repo) = managed_host();
    std::fs::write(host.record(), b"{ not json").unwrap();
    let e = guard(&host).unwrap_err();
    assert_eq!(e, RefusalReason::NoRecord.user_message());
    std::fs::remove_file(host.record()).unwrap();
    assert_eq!(
        guard(&host).unwrap_err(),
        RefusalReason::NoRecord.user_message()
    );
}

#[test]
fn a_record_pointing_through_a_link_into_claude_is_refused() {
    let (host, _repo) = managed_host();
    let link = PathBuf::from(format!("{}/innocent", host.root()));
    std::os::unix::fs::symlink(format!("{}/.claude", host.root()), &link).unwrap();
    rewrite_record(&host, &link);
    let e = guard(&host).unwrap_err();
    assert!(e.contains("resolves into ~/.claude"), "{e}");
}

#[test]
fn a_record_pointing_at_the_root_or_the_real_home_is_refused() {
    let (host, _repo) = managed_host();
    rewrite_record(&host, Path::new(&host.root()));
    assert!(guard(&host).unwrap_err().contains("home directory"));
    // The decoy is the account's own `$HOME` here, and differs from the root (as the sandbox does).
    rewrite_record(&host, host.decoy.path());
    assert!(guard(&host).unwrap_err().contains("home directory"));
}

#[test]
fn a_clone_without_uninstall_sh_and_a_missing_clone_are_refused() {
    let (host, _repo) = managed_host();
    std::fs::remove_file(host.clone_dir().join("uninstall.sh")).unwrap();
    assert!(guard(&host)
        .unwrap_err()
        .contains("does not contain uninstall.sh"));
    std::fs::remove_dir_all(host.clone_dir()).unwrap();
    assert!(guard(&host).unwrap_err().contains("no longer resolves"));
}

// ── The run ──────────────────────────────────────────────────────────────────────────────

#[test]
fn a_clean_uninstall_removes_links_clone_and_record_and_writes_only_under_the_root() {
    let (host, _repo) = managed_host();
    assert_eq!(links(&host), 2);
    let t = guard(&host).unwrap();

    let preview = exec_on(&host)(&dry_run_script(&t)).unwrap();
    assert!(
        preview.contains("[remove] feature-build (dry-run)"),
        "{preview}"
    );
    assert_eq!(links(&host), 2, "the preview changed nothing");

    let before: Vec<PathBuf> = walk(Path::new(&host.root()));
    let out = exec_on(&host)(&uninstall_script(&t)).unwrap();
    assert_eq!(uninstall_result(&out), Some(UninstallResult::Ok), "{out}");
    assert!(
        out.contains("[remove] task-plan"),
        "uninstall.sh's output is shown: {out}"
    );
    assert_eq!(links(&host), 0);
    assert!(!host.clone_dir().exists());
    assert!(!host.record().exists());
    assert_eq!(host.reprobe(), HostSubstrate::Absent);
    // Containment: nothing outside the root changed (the decoy home is still empty), and every
    // path that appeared under the root is the uninstall log.
    assert!(host.decoy_is_empty(), "a write escaped the root");
    let added: Vec<PathBuf> = walk(Path::new(&host.root()))
        .into_iter()
        .filter(|p| !before.contains(p))
        .collect();
    assert_eq!(
        added,
        vec![PathBuf::from(format!(
            "{}/.claudesk/uninstall.log",
            host.root()
        ))]
    );
    let f = resolve_uninstall(
        "h",
        uninstall_result(&out).as_ref(),
        0,
        Some(&host.reprobe()),
    );
    assert!(
        f.ok && f.message.is_none() && f.op == RemoteOp::Uninstall,
        "{f:?}"
    );
}

#[test]
fn a_failed_uninstall_sh_keeps_the_clone_and_the_record() {
    let (host, _repo) = managed_host();
    let t = guard(&host).unwrap();
    let out = exec_on(&host)(&format!(
        "export FIXTURE_UNINSTALL_FAIL=7\n{}",
        uninstall_script(&t)
    ))
    .unwrap();
    assert_eq!(
        uninstall_result(&out),
        Some(UninstallResult::UninstallFailed(7)),
        "{out}"
    );
    assert!(host.clone_dir().is_dir() && host.record().exists());
}

#[test]
fn a_clone_that_cannot_be_removed_keeps_the_record() {
    let (host, _repo) = managed_host();
    let t = guard(&host).unwrap();
    let vendor = host.sandbox.vendor_dir();
    std::fs::set_permissions(&vendor, std::fs::Permissions::from_mode(0o555)).unwrap();
    let out = exec_on(&host)(&uninstall_script(&t)).unwrap();
    std::fs::set_permissions(&vendor, std::fs::Permissions::from_mode(0o755)).unwrap();
    assert_eq!(
        uninstall_result(&out),
        Some(UninstallResult::RmFailed),
        "{out}"
    );
    assert!(
        host.record().exists(),
        "the record is deleted only after the clone is gone"
    );
}

#[test]
fn a_record_that_cannot_be_deleted_is_reported() {
    let (host, _repo) = managed_host();
    let t = guard(&host).unwrap();
    let dot = host.sandbox.claudesk_root();
    // The log must be writable for the run to reach the record delete.
    std::fs::write(dot.join("uninstall.log"), "").unwrap();
    std::fs::set_permissions(&dot, std::fs::Permissions::from_mode(0o555)).unwrap();
    let out = exec_on(&host)(&uninstall_script(&t)).unwrap();
    std::fs::set_permissions(&dot, std::fs::Permissions::from_mode(0o755)).unwrap();
    assert_eq!(
        uninstall_result(&out),
        Some(UninstallResult::RecordDeleteFailed),
        "{out}"
    );
    assert!(host.record().exists());
}

/// D6: the host re-checks what the guard approved, and a change touches nothing.
#[test]
fn a_host_that_changed_after_the_guard_is_left_untouched() {
    // (a) The record's bytes changed.
    let (host, _repo) = managed_host();
    let t = guard(&host).unwrap();
    let mut bytes = std::fs::read(host.record()).unwrap();
    bytes.push(b' ');
    std::fs::write(host.record(), &bytes).unwrap();
    let out = exec_on(&host)(&uninstall_script(&t)).unwrap();
    assert_eq!(
        uninstall_result(&out),
        Some(UninstallResult::Changed),
        "{out}"
    );
    assert_eq!(links(&host), 2);
    assert!(host.clone_dir().is_dir());

    // (b) The clone was swapped for a link to a decoy folder that holds an uninstall.sh.
    let (host, _repo) = managed_host();
    let t = guard(&host).unwrap();
    let decoy = TempDir::new().unwrap();
    std::fs::write(decoy.path().join("uninstall.sh"), "#!/bin/sh\n").unwrap();
    std::fs::write(decoy.path().join("keep"), "precious").unwrap();
    let moved = PathBuf::from(format!("{}/moved", host.root()));
    std::fs::rename(host.clone_dir(), &moved).unwrap();
    std::os::unix::fs::symlink(decoy.path(), host.clone_dir()).unwrap();
    let out = exec_on(&host)(&uninstall_script(&t)).unwrap();
    assert_eq!(
        uninstall_result(&out),
        Some(UninstallResult::Changed),
        "{out}"
    );
    assert!(decoy.path().join("keep").exists(), "the decoy is intact");
    assert!(host.record().exists());
}

// ── The reducer ──────────────────────────────────────────────────────────────────────────

#[test]
fn the_reprobe_decides_and_every_message_is_plain() {
    let managed = HostSubstrate::Managed {
        root: None,
        head: None,
        record: crate::workflow_install::remote_runner::remote_record("/Users/me", "t"),
    };
    let ok = resolve_uninstall(
        "h",
        Some(&UninstallResult::Ok),
        0,
        Some(&HostSubstrate::Absent),
    );
    assert!(ok.ok && ok.message.is_none());
    let still = resolve_uninstall("h", Some(&UninstallResult::Ok), 0, Some(&managed));
    assert!(
        !still.ok,
        "a host that still reads Managed is not uninstalled"
    );
    for r in [
        None,
        Some(UninstallResult::Ok),
        Some(UninstallResult::Changed),
        Some(UninstallResult::UninstallFailed(3)),
        Some(UninstallResult::RmFailed),
        Some(UninstallResult::RecordDeleteFailed),
    ] {
        for after in [
            None,
            Some(HostSubstrate::Unknown),
            Some(HostSubstrate::Absent),
            Some(managed.clone()),
        ] {
            let f = resolve_uninstall("h", r.as_ref(), 1, after.as_ref());
            assert_eq!(f.op, RemoteOp::Uninstall);
            assert!(!f.cancelled);
            if let Some(m) = &f.message {
                assert!(!m.contains("  "), "{r:?} {after:?}: {m:?}");
            }
            let clean = r == Some(UninstallResult::Ok) && after == Some(HostSubstrate::Absent);
            assert_eq!(
                f.message.is_none(),
                clean,
                "{r:?} {after:?}: only a clean, re-checked uninstall goes without words"
            );
        }
    }
    for kept in [
        UninstallResult::UninstallFailed(3),
        UninstallResult::RmFailed,
    ] {
        let f = resolve_uninstall("h", Some(&kept), 0, Some(&managed));
        assert!(!f.ok && f.message.unwrap().contains("Uninstall can be retried"));
    }
}

#[test]
fn result_lines_parse_and_anything_else_is_output() {
    for (line, want) in [
        ("CLAUDESK-RUN:result:ok", Some(UninstallResult::Ok)),
        (
            "CLAUDESK-RUN:result:changed",
            Some(UninstallResult::Changed),
        ),
        (
            "CLAUDESK-RUN:result:rm-failed",
            Some(UninstallResult::RmFailed),
        ),
        (
            "CLAUDESK-RUN:result:record-failed",
            Some(UninstallResult::RecordDeleteFailed),
        ),
        (
            "CLAUDESK-RUN:result:uninstall-failed:2",
            Some(UninstallResult::UninstallFailed(2)),
        ),
        ("CLAUDESK-RUN:result:uninstall-failed:x", None),
        ("CLAUDESK-RUN:result:nope", None),
        ("  [remove] feature-build", None),
    ] {
        assert_eq!(parse_uninstall_line(line), want, "{line}");
    }
}

// ── The type-level fence ─────────────────────────────────────────────────────────────────

/// The deleting builders take ONLY an approved target, and nothing but the guard constructs one.
/// The compiler already refuses a `RemoteUninstallTarget { … }` outside `remote_guard.rs`
/// (`error[E0451]`, proven by a verify-self mutation, WP7 D10); this pins the two halves the
/// compiler cannot: the builders' signatures, and that inside `remote_guard.rs` the one struct
/// literal sits in `remote_refuse_guard`.
#[test]
fn the_deleting_builders_take_only_an_approved_target() {
    use syn::visit::Visit;
    let ops = syn::parse_file(include_str!("remote_ops.rs")).expect("parses");
    for name in ["uninstall_script", "dry_run_script"] {
        let f = ops
            .items
            .iter()
            .find_map(|i| match i {
                syn::Item::Fn(f) if f.sig.ident == name => Some(f),
                _ => None,
            })
            .unwrap_or_else(|| panic!("{name} exists"));
        let only_an_approved_target = f.sig.inputs.len() == 1
            && matches!(f.sig.inputs.first(), Some(syn::FnArg::Typed(t))
                if matches!(&*t.ty, syn::Type::Reference(r)
                    if r.mutability.is_none()
                        && matches!(&*r.elem, syn::Type::Path(p)
                            if p.path.is_ident("RemoteUninstallTarget"))));
        assert!(
            only_an_approved_target,
            "{name} takes exactly one `&RemoteUninstallTarget`"
        );
    }
    // The `rm -rf` lives in UNINSTALL_TEMPLATE, which only `uninstall_script` reads.
    struct Uses<'a>(&'a str, Vec<String>, String);
    impl<'ast> Visit<'ast> for Uses<'_> {
        fn visit_item_fn(&mut self, f: &'ast syn::ItemFn) {
            let prev = std::mem::replace(&mut self.2, f.sig.ident.to_string());
            syn::visit::visit_item_fn(self, f);
            self.2 = prev;
        }
        fn visit_path(&mut self, p: &'ast syn::Path) {
            if p.is_ident(self.0) {
                self.1.push(self.2.clone());
            }
            syn::visit::visit_path(self, p);
        }
    }
    let mut uses = Uses("UNINSTALL_TEMPLATE", vec![], String::new());
    uses.visit_file(&ops);
    assert_eq!(uses.1, vec!["uninstall_script"]);

    struct Literals(Vec<String>, String);
    impl<'ast> Visit<'ast> for Literals {
        fn visit_item_fn(&mut self, f: &'ast syn::ItemFn) {
            let prev = std::mem::replace(&mut self.1, f.sig.ident.to_string());
            syn::visit::visit_item_fn(self, f);
            self.1 = prev;
        }
        fn visit_expr_struct(&mut self, e: &'ast syn::ExprStruct) {
            if e.path.is_ident("RemoteUninstallTarget") {
                self.0.push(self.1.clone());
            }
            syn::visit::visit_expr_struct(self, e);
        }
    }
    let src = include_str!("remote_guard.rs");
    let production = &src[..src.find("#[cfg(test)]").expect("a test module")];
    let mut lits = Literals(vec![], String::new());
    lits.visit_file(&syn::parse_file(production).expect("parses"));
    assert_eq!(lits.0, vec!["remote_refuse_guard"]);
    // And no other module of `workflow_install` names a struct literal of it.
    for (name, other) in [
        ("remote_ops.rs", include_str!("remote_ops.rs")),
        ("commands.rs", include_str!("commands.rs")),
        ("remote_runner.rs", include_str!("remote_runner.rs")),
    ] {
        let mut l = Literals(vec![], String::new());
        l.visit_file(&syn::parse_file(other).expect("parses"));
        assert!(
            l.0.is_empty(),
            "{name} builds a RemoteUninstallTarget: {:?}",
            l.0
        );
    }
}

// ── Update (WP7 Phase 3) ─────────────────────────────────────────────────────────────────
//
// The Managed root's clone was cloned from the fixture repo, so the fixture repo is its origin:
// a commit there makes the host clone behind. The fixture `install.sh` appends one block per run,
// so the block count says whether it ran.

use crate::workflow_install::remote_runner::tests::run_and_group_kill_at;

fn git_in(dir: &Path, args: &[&str]) -> String {
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
        .current_dir(dir)
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

/// A new commit on the clone's origin: the host clone is now behind.
fn advance_origin(repo: &Path) -> String {
    std::fs::write(repo.join("NEWS"), "a newer version\n").unwrap();
    git_in(repo, &["add", "-A"]);
    git_in(repo, &["commit", "-q", "-m", "newer"]);
    git_in(repo, &["rev-parse", "HEAD"])
}

fn blocks(host: &Host) -> usize {
    std::fs::read_to_string(format!("{}/.claude/CLAUDE.md", host.root()))
        .unwrap_or_default()
        .matches("# workflow block")
        .count()
}

fn head(host: &Host) -> String {
    git_in(&host.clone_dir(), &["rev-parse", "HEAD"])
}

fn update_of(host: &Host, now: &str) -> String {
    let t = guard(host).expect("approved");
    update_script(&t, &updated_record(&t, now).unwrap()).unwrap()
}

fn update_result(out: &str) -> Option<UpdateResult> {
    out.lines().find_map(parse_update_line)
}

fn record_bytes(host: &Host) -> Vec<u8> {
    std::fs::read(host.record()).unwrap()
}

#[test]
fn a_behind_clone_is_fast_forwarded_reinstalled_and_its_record_stamped_last() {
    let (host, repo) = managed_host();
    let before: InstallRecord = serde_json::from_slice(&record_bytes(&host)).unwrap();
    assert_eq!(before.updated_at, None);
    let newer = advance_origin(repo.path());
    assert_ne!(head(&host), newer);
    let out = exec_on(&host)(&update_of(&host, "2026-11-21T00:00:00+00:00")).unwrap();
    assert_eq!(update_result(&out), Some(UpdateResult::Ok), "{out}");
    assert!(out.contains("CLAUDESK-RUN:phase:fetch") && out.contains("CLAUDESK-RUN:phase:install"));
    assert_eq!(head(&host), newer, "fast-forwarded to the origin");
    assert_eq!(blocks(&host), 2, "install.sh ran again");
    // install.sh writes to a log (it is `set -e`; a dead pipe would end it), and the script
    // prints that log before its result: the operator sees what the re-install did (runner M6).
    let shown = out
        .find("[ok] feature-build")
        .expect("install.sh's output is shown");
    assert!(shown < out.find("CLAUDESK-RUN:result:ok").unwrap(), "{out}");
    let after: InstallRecord = serde_json::from_slice(&record_bytes(&host)).unwrap();
    assert_eq!(
        after,
        InstallRecord {
            updated_at: Some("2026-11-21T00:00:00+00:00".into()),
            ..before
        },
        "every other field kept byte-for-byte"
    );
    let reprobed = host.reprobe();
    assert!(matches!(reprobed, HostSubstrate::Managed { .. }));
    let f = resolve_update("h", update_result(&out).as_ref(), 0, false, Some(&reprobed));
    assert!(
        f.ok && f.message.is_none() && f.op == RemoteOp::Update,
        "{f:?}"
    );
    assert!(host.decoy_is_empty(), "a write escaped the root");
}

/// Every refusal before the fetch runs nothing: HEAD, the record and the install stay as they were.
fn assert_untouched(host: &Host, head_before: &str, record_before: &[u8]) {
    assert_eq!(head(host), head_before);
    assert_eq!(record_bytes(host), record_before);
    assert_eq!(blocks(host), 1, "install.sh did not run");
}

#[test]
fn a_dirty_clone_is_refused_before_anything_runs() {
    let (host, repo) = managed_host();
    advance_origin(repo.path());
    let (h0, r0) = (head(&host), record_bytes(&host));
    std::fs::write(
        host.clone_dir().join("install.sh"),
        "#!/bin/bash\n# claude-workflow-system\necho hacked\n",
    )
    .unwrap();
    let script = update_of(&host, "t");
    let out = exec_on(&host)(&script).unwrap();
    assert_eq!(update_result(&out), Some(UpdateResult::Dirty), "{out}");
    assert!(
        out.contains("install.sh"),
        "the changed file is listed: {out}"
    );
    assert!(!out.contains("phase:fetch"));
    assert_untouched(&host, &h0, &r0);
}

#[test]
fn a_clone_that_cannot_fast_forward_is_refused_before_install_sh() {
    let (host, repo) = managed_host();
    advance_origin(repo.path());
    std::fs::write(host.clone_dir().join("LOCAL"), "a host-only commit\n").unwrap();
    git_in(&host.clone_dir(), &["add", "-A"]);
    git_in(&host.clone_dir(), &["commit", "-q", "-m", "local"]);
    let (h0, r0) = (head(&host), record_bytes(&host));
    let out = exec_on(&host)(&update_of(&host, "t")).unwrap();
    assert_eq!(update_result(&out), Some(UpdateResult::NotFf), "{out}");
    assert_untouched(&host, &h0, &r0);
}

#[test]
fn a_clone_without_an_upstream_and_a_vanished_record_are_refused() {
    let (host, _repo) = managed_host();
    git_in(&host.clone_dir(), &["branch", "--unset-upstream"]);
    let (h0, r0) = (head(&host), record_bytes(&host));
    let out = exec_on(&host)(&update_of(&host, "t")).unwrap();
    assert_eq!(update_result(&out), Some(UpdateResult::NoUpstream), "{out}");
    assert_untouched(&host, &h0, &r0);

    let (host, repo) = managed_host();
    advance_origin(repo.path());
    let h0 = head(&host);
    let script = update_of(&host, "t");
    std::fs::remove_file(host.record()).unwrap();
    let out = exec_on(&host)(&script).unwrap();
    assert_eq!(update_result(&out), Some(UpdateResult::NotManaged), "{out}");
    assert_eq!(head(&host), h0);
    assert!(!host.record().exists(), "no record is resurrected");
    assert_eq!(blocks(&host), 1);
}

#[test]
fn a_failed_install_sh_after_the_merge_keeps_the_old_record() {
    let (host, repo) = managed_host();
    let newer = advance_origin(repo.path());
    let r0 = record_bytes(&host);
    let out = exec_on(&host)(&format!("export FIXTURE_FAIL=3\n{}", update_of(&host, "t"))).unwrap();
    assert_eq!(
        update_result(&out),
        Some(UpdateResult::InstallFailed(3)),
        "{out}"
    );
    assert_eq!(head(&host), newer, "the merge happened");
    assert_eq!(
        record_bytes(&host),
        r0,
        "no updated_at for an update that did not install"
    );
    let f = resolve_update(
        "h",
        update_result(&out).as_ref(),
        0,
        false,
        Some(&host.reprobe()),
    );
    assert!(!f.ok && f.message.unwrap().contains("Update can be retried"));
}

/// Cancel during the fetch: the group TERM ends the run before the merge (no result), and the
/// clone and the record are as they were. The fetch is replaced by a sleep, as the install's
/// clone-arm test replaces its clone.
#[test]
fn a_cancel_during_the_fetch_stops_the_run_and_changes_nothing() {
    let (host, repo) = managed_host();
    advance_origin(repo.path());
    let (h0, r0) = (head(&host), record_bytes(&host));
    let script = update_of(&host, "t");
    let fetch = "GIT_TERMINAL_PROMPT=0 \"$d/usr/bin/git\" -C \"$target\" -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=30 fetch --quiet </dev/null 2>&1";
    assert!(script.contains(fetch), "{script}");
    let script = script.replace(fetch, "sleep 30");
    let started = std::time::Instant::now();
    let (lines, _) = run_and_group_kill_at(&host, &script, "CLAUDESK-RUN:phase:fetch", "");
    assert!(
        started.elapsed() < std::time::Duration::from_secs(10),
        "stopped promptly"
    );
    let out = lines.join("\n");
    assert_eq!(update_result(&out), None, "killed before reporting: {out}");
    assert_untouched(&host, &h0, &r0);
    let f = resolve_update("h", None, -1, true, Some(&host.reprobe()));
    assert!(!f.ok && f.cancelled);
    assert_eq!(
        f.message.as_deref(),
        Some("Cancelled. Nothing was updated.")
    );
}

/// A TERM that arrives once the window opened (here `KILL_DELAY` into `phase:install`, while a
/// slowed install.sh runs) is ignored: the update finishes and is recorded.
#[test]
fn a_group_kill_inside_the_update_window_cannot_split_it() {
    let (host, repo) = managed_host();
    let newer = advance_origin(repo.path());
    let (lines, _) = run_and_group_kill_at(
        &host,
        &update_of(&host, "2026-11-21T00:00:00+00:00"),
        "CLAUDESK-RUN:phase:install",
        "FIXTURE_SLEEP=1; export FIXTURE_SLEEP",
    );
    let out = lines.join("\n");
    assert_eq!(update_result(&out), Some(UpdateResult::Ok), "{out}");
    assert_eq!(head(&host), newer);
    let rec: InstallRecord = serde_json::from_slice(&record_bytes(&host)).unwrap();
    assert_eq!(rec.updated_at.as_deref(), Some("2026-11-21T00:00:00+00:00"));
}

#[test]
fn update_lines_parse_and_every_update_message_is_plain() {
    for (line, want) in [
        ("CLAUDESK-RUN:result:ok", Some(UpdateResult::Ok)),
        (
            "CLAUDESK-RUN:result:no-devtools",
            Some(UpdateResult::NoDevTools),
        ),
        (
            "CLAUDESK-RUN:result:not-managed",
            Some(UpdateResult::NotManaged),
        ),
        (
            "CLAUDESK-RUN:result:git-failed",
            Some(UpdateResult::GitFailed),
        ),
        ("CLAUDESK-RUN:result:dirty", Some(UpdateResult::Dirty)),
        (
            "CLAUDESK-RUN:result:no-upstream",
            Some(UpdateResult::NoUpstream),
        ),
        ("CLAUDESK-RUN:result:not-ff", Some(UpdateResult::NotFf)),
        (
            "CLAUDESK-RUN:result:record-failed",
            Some(UpdateResult::RecordWriteFailed),
        ),
        (
            "CLAUDESK-RUN:result:fetch-failed:128",
            Some(UpdateResult::FetchFailed(128)),
        ),
        (
            "CLAUDESK-RUN:result:install-failed:2",
            Some(UpdateResult::InstallFailed(2)),
        ),
        ("CLAUDESK-RUN:result:install-failed:x", None),
        ("CLAUDESK-RUN:phase:fetch", None),
        ("Already up to date.", None),
    ] {
        assert_eq!(parse_update_line(line), want, "{line}");
    }
    let managed = HostSubstrate::Managed {
        root: None,
        head: None,
        record: crate::workflow_install::remote_runner::remote_record("/Users/me", "t"),
    };
    for r in [
        None,
        Some(UpdateResult::Ok),
        Some(UpdateResult::NoDevTools),
        Some(UpdateResult::NotManaged),
        Some(UpdateResult::GitFailed),
        Some(UpdateResult::Dirty),
        Some(UpdateResult::NoUpstream),
        Some(UpdateResult::FetchFailed(1)),
        Some(UpdateResult::NotFf),
        Some(UpdateResult::InstallFailed(1)),
        Some(UpdateResult::RecordWriteFailed),
    ] {
        for cancel in [false, true] {
            for after in [None, Some(HostSubstrate::Absent), Some(managed.clone())] {
                let f = resolve_update("h", r.as_ref(), 1, cancel, after.as_ref());
                assert_eq!(f.op, RemoteOp::Update);
                let clean =
                    r == Some(UpdateResult::Ok) && !cancel && after == Some(managed.clone());
                assert_eq!(f.message.is_none(), clean, "{r:?} {cancel} {after:?}");
                if let Some(m) = f.message {
                    assert!(!m.contains("  "), "{m:?}");
                }
            }
        }
    }
}
