use super::*;
use std::cell::RefCell;
use std::path::Path;
use tempfile::TempDir;

/// A double that records every command it is asked to run and answers with `reply`.
pub(crate) struct Recording {
    pub(crate) calls: RefCell<Vec<String>>,
    reply: Result<String, ()>,
}

impl Recording {
    pub(crate) fn answering(reply: &str) -> Self {
        Self {
            calls: RefCell::new(Vec::new()),
            reply: Ok(reply.to_string()),
        }
    }
    fn link_down() -> Self {
        Self {
            calls: RefCell::new(Vec::new()),
            reply: Err(()),
        }
    }
}

impl RemoteExec for Recording {
    fn run(&self, _t: &ValidTarget, cmd: &str, _ms: u64) -> Result<String, ExecFailure> {
        self.calls.borrow_mut().push(cmd.to_string());
        self.reply.clone().map_err(|_| ExecFailure::LinkDown)
    }
}

/// Runs the REAL remote command string under the local `/bin/sh` (macOS ships the same `perl` the
/// remote Mac runs), so the scripts themselves are exercised, not a model of them.
pub(crate) struct LocalShell;

impl RemoteExec for LocalShell {
    fn run(&self, _t: &ValidTarget, cmd: &str, _ms: u64) -> Result<String, ExecFailure> {
        let out = std::process::Command::new("/bin/sh")
            .arg("-c")
            .arg(cmd)
            .output()
            .map_err(|e| ExecFailure::Failed(e.to_string()))?;
        if !out.status.success() {
            return Err(ExecFailure::Failed(
                String::from_utf8_lossy(&out.stderr).into_owned(),
            ));
        }
        Ok(String::from_utf8_lossy(&out.stdout).into_owned())
    }
}

fn target(path: &str) -> ValidTarget {
    ValidTarget::new("me@mini-host", path).unwrap()
}

/// A project tree under a TempDir, plus a target pointing at it (canonical, so it is normalized).
fn project() -> (TempDir, ValidTarget) {
    let dir = TempDir::new().unwrap();
    let root = dir.path().canonicalize().unwrap().join("proj");
    std::fs::create_dir_all(&root).unwrap();
    let t = target(root.to_str().unwrap());
    (dir, t)
}

fn write(root: &str, rel: &str, body: &[u8]) {
    let p = Path::new(root).join(rel);
    std::fs::create_dir_all(p.parent().unwrap()).unwrap();
    std::fs::write(p, body).unwrap();
}

// ── validate_rel ────────────────────────────────────────────────────────────────────────────────

#[test]
fn validate_rel_rejects_every_escape_before_any_command_is_built() {
    for bad in [
        "",
        "/",
        ".",
        "./",
        "..",
        "../x",
        "a/../../b",
        "a/..",
        "/etc/passwd",
        "a\nb",
        "a\rb",
        "a\0b",
    ] {
        assert!(
            matches!(
                validate_rel(bad, "/r"),
                Err(EditorFsError::OutsideWorkspace { .. })
            ),
            "{bad:?} must be refused"
        );
        // And no exec is ever reached for it.
        let exec = Recording::answering("");
        let t = target("/Users/me/p");
        assert!(read_doc(&exec, &t, bad).is_err());
        assert!(stat_doc(&exec, &t, bad).is_err());
        assert!(exec.calls.borrow().is_empty(), "{bad:?} reached an exec");
    }
}

#[test]
fn validate_rel_normalizes_harmless_forms_and_keeps_odd_names() {
    assert_eq!(validate_rel("a//b/./c.md", "/r").unwrap(), "a/b/c.md");
    // A leading `-`, quotes, `$` and spaces are just names: they reach the command only quoted.
    assert_eq!(
        validate_rel("-x/it's $HOME.md", "/r").unwrap(),
        "-x/it's $HOME.md"
    );
}

// ── parse_listing / parse_answer ───────────────────────────────────────────────────────────────

#[test]
fn parse_listing_needs_its_frame_and_skips_noise_and_bad_lines() {
    let out = "rc noise\nCLAUDESK-FS:begin\n\
        CLAUDESK-FS:e\t0\t0\tvision.md\tf\t12\t1700000000123\n\
        CLAUDESK-FS:e\t0\t2\ta.md\tl\t3\t5\n\
        CLAUDESK-FS:e\t0\t9\tbad-dir.md\tf\t1\t1\n\
        CLAUDESK-FS:e\t0\t0\tbad-kind.md\td\t1\t1\n\
        CLAUDESK-FS:e\t0\t0\ttoo\tfew\n\
        CLAUDESK-FS:end\n";
    let g = parse_listing(out, 1, 3).unwrap();
    assert_eq!(g[0][0].len(), 1);
    assert_eq!(g[0][0][0].name, "vision.md");
    assert!(g[0][0][0].regular);
    assert_eq!(g[0][0][0].mtime_ms, 1_700_000_000_123.0);
    assert!(!g[0][2][0].regular);
    // Unframed (a failed or cut run) is None, never an empty project.
    assert_eq!(parse_listing("CLAUDESK-FS:begin\n", 1, 3), None);
    assert_eq!(parse_listing("", 1, 3), None);
}

#[test]
fn parse_answer_maps_each_status_to_the_local_words() {
    let p = |s: &str, m| parse_answer(s, m, "x.md", "/r");
    let read = DocReadMode::Read;
    assert!(p("CLAUDESK-FS:read:outside\n", read)
        .unwrap_err()
        .to_string()
        .contains("outside the workspace root"));
    assert!(p("CLAUDESK-FS:read:notutf8\n", read)
        .unwrap_err()
        .to_string()
        .starts_with("file is not valid UTF-8 text"));
    assert!(p("CLAUDESK-FS:read:toolarge:99\n", read)
        .unwrap_err()
        .to_string()
        .starts_with("file is too large to open as text"));
    let missing = p("CLAUDESK-FS:read:missing\n", read)
        .unwrap_err()
        .to_string();
    assert!(missing.contains("no such file: x.md") && !missing.contains("os error"));
    // Noise before the status line; the text may itself contain the sentinel.
    assert_eq!(
        p(
            "noise\nCLAUDESK-FS:read:ok:25\nCLAUDESK-FS:read:ok:1\nhé",
            read
        )
        .unwrap(),
        Answer::Text("CLAUDESK-FS:read:ok:1\nhé".into())
    );
    // A cut reply is a failure.
    assert!(matches!(
        p("CLAUDESK-FS:read:ok:10\nshort", read),
        Err(RemoteFsError::Failed(_))
    ));
    assert_eq!(
        p("CLAUDESK-FS:stat:ok:7:1234\n", DocReadMode::Stat).unwrap(),
        Answer::Marker(FileMarker {
            mtime_ms: 1234.0,
            size: 7
        })
    );
    assert!(matches!(p("", read), Err(RemoteFsError::Failed(_))));
}

#[test]
fn a_down_link_reads_as_the_plain_words() {
    let exec = Recording::link_down();
    let t = target("/Users/me/p");
    let e = list_docs(&exec, &t).unwrap_err().to_string();
    assert_eq!(e, LINK_DOWN);
    assert_eq!(
        read_doc(&exec, &t, "a.md").unwrap_err().to_string(),
        LINK_DOWN
    );
}

#[test]
fn a_dead_master_or_a_timeout_is_link_down_and_other_failures_keep_their_text() {
    let dead = classify_exec_error(CloseExecError::Run(RunError::Failed {
        code: Some(255),
        stderr: "Connection closed by UNKNOWN port 65535".into(),
    }));
    assert!(matches!(dead, ExecFailure::LinkDown));
    assert!(matches!(
        classify_exec_error(CloseExecError::Run(RunError::TimedOut(10))),
        ExecFailure::LinkDown
    ));
    assert!(matches!(
        classify_exec_error(CloseExecError::LinkNotUp),
        ExecFailure::LinkDown
    ));
    let other = classify_exec_error(CloseExecError::Run(RunError::Failed {
        code: Some(2),
        stderr: "perl: boom".into(),
    }));
    assert!(matches!(other, ExecFailure::Failed(s) if s.contains("boom")));
}

// ── the real scripts, run locally ──────────────────────────────────────────────────────────────

#[test]
fn the_listing_script_feeds_the_same_rules_as_local_discover() {
    let (dir, t) = project();
    let root = t.path();
    for rel in [
        "workflow-system/product/vision.md",
        "workflow-system/product/wbs.md",
        "workflow-system/product/archive/m1/wbs.md",
        "workflow-system/state/backlog.md",
        "workflow-system/state/.session.md",
        "workflow-system/state/wip/demo.md",
        "workflow-system/state/wip/notes.txt",
        "CHANGELOG.md",
    ] {
        write(root, rel, b"x");
    }
    std::os::unix::fs::symlink(
        "/etc/hosts",
        Path::new(root).join("workflow-system/product/leak.md"),
    )
    .unwrap();
    let remote = list_docs(&LocalShell, &t).unwrap();
    let local = crate::docs::discover(Path::new(root));
    assert_eq!(remote, local);
    let rels: Vec<&str> = remote.iter().map(|e| e.rel_path.as_str()).collect();
    assert!(rels.contains(&"workflow-system/state/wip/demo.md"));
    assert!(!rels
        .iter()
        .any(|r| r.contains("archive") || r.contains("CHANGELOG")));
    drop(dir);
}

#[test]
fn the_listing_script_batches_roots_and_frames_an_empty_project() {
    let (_d1, a) = project();
    let (_d2, b) = project();
    write(b.path(), "workflow-system/product/vision.md", b"v");
    let out = LocalShell
        .run(
            &a,
            &remote_cmd::doc_list_command(&DOC_DIRS, &[a.path(), b.path()]),
            1000,
        )
        .unwrap();
    let g = parse_listing(&out, 2, 3).unwrap();
    assert!(
        g[0].iter().all(|d| d.is_empty()),
        "an empty project is framed, not failed"
    );
    assert_eq!(g[1][0][0].name, "vision.md");
}

#[test]
fn the_read_script_reads_text_and_refuses_what_the_local_read_refuses() {
    let (_d, t) = project();
    let root = t.path();
    let body = "# Remote vision\n\nCLAUDESK-FS:read:ok:1\nh\u{e9} it's $HOME `x`\n";
    write(root, "workflow-system/product/vision.md", body.as_bytes());
    assert_eq!(
        read_doc(&LocalShell, &t, "workflow-system/product/vision.md").unwrap(),
        body
    );

    // A symlink inside the project that resolves outside it is refused (realpath on the remote).
    std::os::unix::fs::symlink("/etc/hosts", Path::new(root).join("leak.md")).unwrap();
    let e = read_doc(&LocalShell, &t, "leak.md")
        .unwrap_err()
        .to_string();
    assert!(e.contains("outside the workspace root"), "{e}");
    // So is a symlinked DIRECTORY component pointing out.
    std::os::unix::fs::symlink("/etc", Path::new(root).join("etcdir")).unwrap();
    assert!(read_doc(&LocalShell, &t, "etcdir/hosts")
        .unwrap_err()
        .to_string()
        .contains("outside the workspace root"));

    write(root, "bin.md", &[0xff, 0xfe, 0x00]);
    assert!(read_doc(&LocalShell, &t, "bin.md")
        .unwrap_err()
        .to_string()
        .starts_with("file is not valid UTF-8 text"));
    assert!(read_doc(&LocalShell, &t, "nope.md")
        .unwrap_err()
        .to_string()
        .contains("no such file"));
    std::fs::create_dir_all(Path::new(root).join("adir")).unwrap();
    assert!(read_doc(&LocalShell, &t, "adir")
        .unwrap_err()
        .to_string()
        .contains("is a directory, not a file"));
}

#[test]
fn the_read_script_refuses_a_file_over_the_cap() {
    let (_d, t) = project();
    write(t.path(), "big.md", &[b'a'; 64]);
    let out = LocalShell
        .run(
            &t,
            &remote_cmd::doc_read_command(DocReadMode::Read, t.path(), "big.md", 10),
            1000,
        )
        .unwrap();
    assert!(parse_answer(&out, DocReadMode::Read, "big.md", t.path())
        .unwrap_err()
        .to_string()
        .starts_with("file is too large to open as text"));
}

#[test]
fn the_stat_script_matches_the_local_marker() {
    let (_d, t) = project();
    write(t.path(), "workflow-system/state/.session.md", b"hello");
    let remote = stat_doc(&LocalShell, &t, "workflow-system/state/.session.md").unwrap();
    let local = crate::editor_fs::stat_file_core(
        Path::new(t.path()),
        Path::new("workflow-system/state/.session.md"),
    )
    .unwrap();
    assert_eq!(remote.size, 5);
    assert!(
        (remote.mtime_ms - local.mtime_ms).abs() <= 1.0,
        "remote {} vs local {}",
        remote.mtime_ms,
        local.mtime_ms
    );
}

#[test]
fn a_hostile_file_name_round_trips_through_the_quoting() {
    let (_d, t) = project();
    let name = "-it's $HOME `id` \"q\" ;x.md";
    write(t.path(), name, b"ok");
    assert_eq!(read_doc(&LocalShell, &t, name).unwrap(), "ok");
    assert_eq!(stat_doc(&LocalShell, &t, name).unwrap().size, 2);
}

/// Every remote-read command string, pinned WHOLE for all three modes (the `remote_cmd` convention:
/// the spawn and open-check strings are pinned the same way). The program text is a compile-time
/// constant quoted ONCE as a whole; its behaviour is pinned by running it (the `LocalShell` tests
/// above), so here it enters through `quote(PROG)` and everything after it is spelled out literally.
#[test]
fn the_command_strings_are_pinned_whole() {
    let read_prog = remote_cmd::quote(remote_cmd::DOC_READ_PROG);
    let list_prog = remote_cmd::quote(remote_cmd::DOC_LIST_PROG);
    assert_eq!(
        remote_cmd::doc_read_command(DocReadMode::Read, "/r o", "a'b", 5),
        format!("perl -e {read_prog} -- read '/r o' 'a'\\''b' 5")
    );
    assert_eq!(
        remote_cmd::doc_read_command(DocReadMode::Stat, "/r", "w/.session.md", 0),
        format!("perl -e {read_prog} -- stat '/r' 'w/.session.md' 0")
    );
    assert_eq!(
        remote_cmd::doc_list_command(&DOC_DIRS, &["/a b", "/c'd"]),
        format!(
            "perl -e {list_prog} -- 3 'workflow-system/product' 'workflow-system/state' \
             'workflow-system/state/wip' '/a b' '/c'\\''d'"
        )
    );
    // The programs are constants with NO variable data: every value arrives via `@ARGV`.
    for prog in [remote_cmd::DOC_READ_PROG, remote_cmd::DOC_LIST_PROG] {
        assert!(prog.contains("@ARGV"), "{prog}");
        assert!(
            !prog.contains("{}"),
            "a format slot in a constant program: {prog}"
        );
    }
}

#[test]
fn the_command_strings_carry_every_variable_value_only_quoted() {
    let read = remote_cmd::doc_read_command(DocReadMode::Read, "/r o", "a'b", 5);
    assert!(read.starts_with("perl -e '"), "{read}");
    assert!(
        read.ends_with(" -- read '/r o' 'a'\\''b' 5"),
        "the values follow `--`, each quoted once: {read}"
    );
    let list = remote_cmd::doc_list_command(&DOC_DIRS, &["/a b", "/c'd"]);
    assert!(
        list.ends_with(
            " -- 3 'workflow-system/product' 'workflow-system/state' \
             'workflow-system/state/wip' '/a b' '/c'\\''d'"
        ),
        "{list}"
    );
}
