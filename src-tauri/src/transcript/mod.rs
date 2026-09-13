//! M15 WP3 Phase 2 — the transcript reader's **file-IO half**.
//!
//! ═══════════════════════════════════════════════════════════════════════════════
//! ⚠️ THIS MODULE DOES FILE IO AND NOTHING ELSE. THE VERDICT LIVES IN TYPESCRIPT.
//!
//! Operator ruling **R-4** (2026-09-07) settled the design fork for WP3 and WP4 together:
//! Rust reads the transcript; TypeScript owns the parse, the policy lookup, the verdict, and
//! both actions. So this module deliberately does **not** parse JSONL, does not look for
//! `TRANSITION:` tokens, and does not decide anything. It answers exactly two questions:
//!
//!   1. *Where is a project's transcript directory?* ([`transcript_dir_for`])
//!   2. *What are the last N lines of a session's `.jsonl`?* ([`read_tail`])
//!
//! ⚠️ The reason that boundary is worth holding: it keeps the policy graph **single-sided**,
//! so *"funnel every policy read through ONE function"* stays structurally easy. A second
//! copy of the derivation in Rust is exactly the defect shape M15 exists to remove — and it
//! would need a new backend→frontend IPC direction that does not exist today.
//!
//! ⚠️ **ACCEPTED COST (recorded, not a gap):** the supervisor stops when the webview is gone.
//! A workspace with no webview has no PTY to inject into, so there is nothing to supervise.
//!
//! ## The slug footgun
//!
//! Claude Code stores transcripts at `~/.claude/projects/<slug>/<session-uuid>.jsonl`, where
//! `<slug>` is the project directory's **physical (symlink-resolved) absolute path** with
//! every `/` and `.` replaced by `-`. ⚠️ **Resolving the realpath first is mandatory, not
//! defensive.** On macOS `/tmp` is a symlink to `/private/tmp`, so a project at `/tmp/foo`
//! has the slug `-private-tmp-foo` and a `$PWD`-derived `-tmp-foo` finds nothing — a silent
//! empty read, not an error.

pub mod commands;

use std::path::{Path, PathBuf};

/// How many bytes from the end of a transcript [`read_tail`] will look at.
///
/// ⚠️ A bound is required, not an optimization. The corpus is **live and unbounded**: this
/// project alone holds 242 transcripts, and the supervising session's own file grows while
/// being read (the WP1 probe watched a scanned total drift 2282 → 2284 → 2286 within one
/// session). Reading whole files per turn-end, across every open workspace, would scale with
/// history rather than with the thing being decided — which is always the *last* turn.
///
/// 512 KiB is sized off the measured shape of a turn, not guessed: an assistant turn with
/// tool calls runs to a few KiB of JSONL, so this holds hundreds of lines — far more than the
/// chain-detection window needs, while staying a bounded read.
pub const TAIL_BYTES: u64 = 512 * 1024;

/// Derive Claude Code's project-slug for a project directory.
///
/// ⚠️ **Resolves the physical path first.** See the module docs — a `$PWD`-derived slug is
/// wrong wherever a symlink is in play, and fails by finding *nothing* rather than erroring.
/// When the path cannot be canonicalized (it does not exist yet, or permissions), the input
/// is used as-is: a best-effort slug beats refusing to answer, and the caller's directory
/// probe is what actually decides.
pub fn slug_for(project_path: &Path) -> String {
    let physical = project_path
        .canonicalize()
        .unwrap_or_else(|_| project_path.to_path_buf());
    physical
        .to_string_lossy()
        .chars()
        .map(|c| if c == '/' || c == '.' { '-' } else { c })
        .collect()
}

/// The directory Claude Code writes this project's transcripts into.
///
/// `home` is injected rather than read from the environment so the whole module is testable
/// without touching the operator's real `~` (see `docs/lessons/sandboxed-home-verification.md`
/// — the sandboxed-`$HOME` discipline this repo already follows).
pub fn transcript_dir_for(home: &Path, project_path: &Path) -> PathBuf {
    home.join(".claude")
        .join("projects")
        .join(slug_for(project_path))
}

/// Read the last [`TAIL_BYTES`] of a transcript, returned as whole lines.
///
/// ⚠️ **The first line of the window is dropped when the file is larger than the window**,
/// because a byte-offset seek lands mid-line and half a JSON object is not a parseable record.
/// Returning it would hand the TS parser a line that fails `JSON.parse` on every call — an
/// error the caller cannot distinguish from a genuinely corrupt transcript.
///
/// Returns `Ok(vec![])` for a missing file: a workspace whose CC session has not yet written
/// anything is a normal state (a fresh session, or one whose transcript saving is off), not an
/// error the supervisor should surface.
pub fn read_tail(path: &Path) -> std::io::Result<Vec<String>> {
    use std::io::{Read, Seek, SeekFrom};

    let mut file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(e),
    };

    let len = file.metadata()?.len();
    let truncated = len > TAIL_BYTES;
    if truncated {
        file.seek(SeekFrom::Start(len - TAIL_BYTES))?;
    }

    let mut buf = Vec::new();
    file.read_to_end(&mut buf)?;
    // ⚠️ Lossy rather than strict UTF-8: a transcript carries arbitrary tool output, and one
    // bad byte must not blank the whole read. The TS side re-parses each line and skips what
    // it cannot read, so a mangled line degrades to one skipped record.
    let text = String::from_utf8_lossy(&buf);

    let mut lines: Vec<String> = text.lines().map(|l| l.to_string()).collect();
    if truncated && !lines.is_empty() {
        lines.remove(0);
    }
    Ok(lines)
}

/// Every transcript file in a project's transcript dir, newest-modified first.
///
/// Exposed because the supervisor cannot always name its own session file: the CC `session_id`
/// now reaches the frontend (Phase 1), but a workspace whose session predates that wiring — or
/// one that has not emitted a hook event yet — has no id to address, and "the most recently
/// written transcript in this project" is the honest fallback.
///
/// ⚠️ Returns an empty vec (not an error) when the directory does not exist, which is the
/// normal state for a project Claude Code has never run in.
pub fn list_transcripts(dir: &Path) -> Vec<PathBuf> {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return Vec::new(),
    };
    let mut files: Vec<(std::time::SystemTime, PathBuf)> = entries
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|x| x == "jsonl"))
        .filter_map(|p| {
            let mtime = std::fs::metadata(&p).ok()?.modified().ok()?;
            Some((mtime, p))
        })
        .collect();
    // Newest-modified first. `Reverse` rather than a flipped comparator, per clippy.
    files.sort_by_key(|f| std::cmp::Reverse(f.0));
    files.into_iter().map(|(_, p)| p).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn tmpdir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("claudesk-transcript-test-{name}"));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn slug_replaces_separators_and_dots() {
        // The documented transform: every `/` and `.` becomes `-`.
        let s = slug_for(Path::new("/Users/x/Personal/projects/my.app"));
        assert_eq!(s, "-Users-x-Personal-projects-my-app");
    }

    #[test]
    fn slug_resolves_the_physical_path_first() {
        // ⚠️ THE FOOTGUN THIS TEST EXISTS FOR. On macOS `/tmp` is a symlink to `/private/tmp`,
        // so a `$PWD`-derived slug ("-tmp-…") points at a directory that does not exist and
        // the read comes back EMPTY rather than failing — indistinguishable from "this
        // project has no transcripts".
        let dir = tmpdir("realpath");
        let slug = slug_for(&dir);
        let physical = dir.canonicalize().unwrap();
        let expected: String = physical
            .to_string_lossy()
            .chars()
            .map(|c| if c == '/' || c == '.' { '-' } else { c })
            .collect();
        assert_eq!(slug, expected);

        // On macOS specifically, assert the symlink was actually followed rather than
        // trusting the transform to agree with itself.
        if physical.to_string_lossy().starts_with("/private/") {
            assert!(
                slug.starts_with("-private-"),
                "realpath must be resolved BEFORE slugging; got {slug}"
            );
        }
    }

    #[test]
    fn slug_of_a_nonexistent_path_falls_back_to_the_input() {
        // Best-effort rather than a refusal — the directory probe is what actually decides.
        let s = slug_for(Path::new("/no/such/dir/anywhere"));
        assert_eq!(s, "-no-such-dir-anywhere");
    }

    #[test]
    fn transcript_dir_is_under_dot_claude_projects() {
        let d = transcript_dir_for(Path::new("/home/u"), Path::new("/p/q"));
        assert_eq!(d, PathBuf::from("/home/u/.claude/projects/-p-q"));
    }

    #[test]
    fn read_tail_of_a_missing_file_is_empty_not_an_error() {
        // A fresh session (or one with transcript saving off) is a NORMAL state.
        let out = read_tail(Path::new("/no/such/file.jsonl")).unwrap();
        assert!(out.is_empty());
    }

    #[test]
    fn read_tail_returns_all_lines_for_a_small_file() {
        let dir = tmpdir("small");
        let f = dir.join("s.jsonl");
        std::fs::write(&f, "{\"a\":1}\n{\"b\":2}\n{\"c\":3}\n").unwrap();
        let out = read_tail(&f).unwrap();
        assert_eq!(out, vec!["{\"a\":1}", "{\"b\":2}", "{\"c\":3}"]);
    }

    #[test]
    fn read_tail_drops_only_the_partial_first_line_when_truncating() {
        // ⚠️ Writes MORE than TAIL_BYTES so the seek genuinely lands mid-line. The assertion
        // that matters is not "fewer lines came back" but that every returned line is WHOLE:
        // a half-line would fail JSON.parse on the TS side for every call, and the caller
        // could not tell that from a corrupt transcript.
        let dir = tmpdir("big");
        let f = dir.join("b.jsonl");
        let mut fh = std::fs::File::create(&f).unwrap();
        // Each record ~1 KiB; 700 of them comfortably exceeds the 512 KiB window.
        for i in 0..700 {
            writeln!(fh, "{{\"i\":{i},\"pad\":\"{}\"}}", "x".repeat(1000)).unwrap();
        }
        fh.flush().unwrap();
        drop(fh);

        let out = read_tail(&f).unwrap();
        assert!(!out.is_empty(), "a truncated read must still return lines");
        assert!(
            out.len() < 700,
            "the read must be BOUNDED — got all {} lines back, so the window did nothing",
            out.len()
        );
        for line in &out {
            assert!(
                serde_json::from_str::<serde_json::Value>(line).is_ok(),
                "every returned line must be whole/parseable; got: {line:.60}"
            );
        }
        // The LAST line is the one the supervisor actually cares about, and it must survive.
        assert!(out.last().unwrap().contains("\"i\":699"));
    }

    #[test]
    fn list_transcripts_is_newest_first_and_ignores_non_jsonl() {
        let dir = tmpdir("list");
        std::fs::write(dir.join("old.jsonl"), "{}\n").unwrap();
        // Ensure a distinct mtime rather than relying on filesystem timestamp granularity.
        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::write(dir.join("new.jsonl"), "{}\n").unwrap();
        std::fs::write(dir.join("notes.txt"), "ignore me").unwrap();

        let out = list_transcripts(&dir);
        assert_eq!(out.len(), 2, "only .jsonl files count");
        assert!(
            out[0].ends_with("new.jsonl"),
            "newest-modified must be first"
        );
        assert!(out[1].ends_with("old.jsonl"));
    }

    #[test]
    fn list_transcripts_of_a_missing_dir_is_empty_not_an_error() {
        assert!(list_transcripts(Path::new("/no/such/dir")).is_empty());
    }
}
