//! M15 WP4 Phase 2 — reading the active WIP file's text.
//!
//! ⚠️ **FILE IO ONLY. THE PARSE LIVES IN TYPESCRIPT (ruling R-4).** This module answers exactly
//! one question — *what are the bytes of this project's active WIP file?* — and deliberately
//! does not answer *how many phases are done*. The phase parse, the workflow gate, and the
//! boundary decision are all TS-side, next to the `resolvePolicy` funnel, so the policy graph
//! stays single-sided. A future edit tempted to add "…and tell me whether a later phase exists"
//! here is reopening the fork R-4 closed.
//!
//! ⚠️ Mirrors `super::transcript`'s posture throughout: a missing file is `None`, not an error.
//! A project that does not use the workflow system has no `wip/` directory at all, and that is
//! an ordinary state for most of the 20+ projects this app opens — not something to surface.

pub mod commands;

use std::path::{Path, PathBuf};

/// Where a project's active WIP items live, project-relative.
///
/// ⚠️ Mirrors `announce::SESSION_MD_REL`'s sibling path. The layout was migrated 2026-07-28
/// (`docs/product/*` + a top-level `workflow/` → the unified `workflow-system/` root), so a
/// pre-migration path here would find nothing and report every project as "no WIP" — a silent
/// wrong answer, which is why this is a named constant rather than an inline literal.
pub const WIP_DIR_REL: &str = "workflow-system/state/wip";

/// How many bytes of a WIP file to read.
///
/// ⚠️ A bound for the same reason `transcript::TAIL_BYTES` is one, but the shape of the risk is
/// different: a WIP file is hand-written prose and stays in the low tens of KiB, so this is not
/// expected to truncate in practice. It exists so a pathological file (a paste of a whole
/// transcript into a Discoveries block) cannot make a per-turn read unbounded.
///
/// ⚠️ Unlike the transcript tail this reads from the **START** of the file, because the parts
/// the parser needs — the `**Workflow:**` frontmatter and the `## Work Tree` phase list — are at
/// the top. Reading the tail would reliably miss both.
pub const WIP_MAX_BYTES: usize = 256 * 1024;

/// Every `.md` file in a project's WIP directory, newest-modified first.
///
/// ⚠️ **Newest-modified, NOT alphabetical.** `docs::glob_dir` sorts by name, which is right for
/// a docs panel listing but wrong here: with several WIP items open, the one being worked on is
/// the one most recently written, and an alphabetical pick would read a stale sibling. That is
/// a silent wrong answer — the supervisor would gate its recycle on another feature's phases.
pub fn list_wip_files(dir: &Path) -> Vec<PathBuf> {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return Vec::new(),
    };
    let mut files: Vec<(std::time::SystemTime, PathBuf)> = entries
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.is_file())
        .filter(|p| p.extension().is_some_and(|x| x == "md"))
        .filter_map(|p| {
            let mtime = std::fs::metadata(&p).ok()?.modified().ok()?;
            Some((mtime, p))
        })
        .collect();
    // Newest-modified first. `Reverse` rather than a flipped comparator, per clippy.
    files.sort_by_key(|f| std::cmp::Reverse(f.0));
    files.into_iter().map(|(_, p)| p).collect()
}

/// The WIP directory for a project root.
pub fn wip_dir_for(project_path: &Path) -> PathBuf {
    project_path.join(WIP_DIR_REL)
}

/// Read up to [`WIP_MAX_BYTES`] from the start of a file.
///
/// ⚠️ Lossy UTF-8, matching `transcript::read_tail`: a WIP file carries pasted tool output and
/// one bad byte must not blank the read.
///
/// Returns `Ok(None)` for a missing file rather than an error — see the module docs.
pub fn read_head(path: &Path) -> std::io::Result<Option<String>> {
    use std::io::Read;

    let mut file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e),
    };

    let mut buf = Vec::new();
    file.by_ref()
        .take(WIP_MAX_BYTES as u64)
        .read_to_end(&mut buf)?;
    Ok(Some(String::from_utf8_lossy(&buf).into_owned()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmpdir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("claudesk-wip-{name}"));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn wip_dir_rel_matches_the_post_migration_layout() {
        // ⚠️ Pinned: the 2026-07-28 migration moved this path. A stale value finds nothing and
        // reports every project as "no WIP" — silently, which is why it is asserted.
        assert_eq!(WIP_DIR_REL, "workflow-system/state/wip");
    }

    #[test]
    fn list_wip_files_is_newest_first_and_ignores_non_markdown() {
        let dir = tmpdir("list");
        std::fs::write(dir.join("old.md"), "# old").unwrap();
        // Ensure a distinct mtime rather than relying on filesystem timestamp granularity.
        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::write(dir.join("new.md"), "# new").unwrap();
        std::fs::write(dir.join("notes.txt"), "ignore me").unwrap();

        let out = list_wip_files(&dir);
        assert_eq!(out.len(), 2, "only .md files count");
        assert!(
            out[0].ends_with("new.md"),
            "newest-modified must come first, got {out:?}"
        );
    }

    #[test]
    fn list_wip_files_on_a_missing_dir_is_empty_not_an_error() {
        // The ordinary case for a project that does not use the workflow system.
        let out = list_wip_files(Path::new("/nonexistent/claudesk/wip"));
        assert!(out.is_empty());
    }

    #[test]
    fn read_head_returns_none_for_a_missing_file() {
        let got = read_head(Path::new("/nonexistent/claudesk/wip/x.md")).unwrap();
        assert!(got.is_none(), "a missing WIP file is None, not an error");
    }

    #[test]
    fn read_head_reads_from_the_start_not_the_end() {
        // ⚠️ The discriminating test: the parser's inputs (`**Workflow:**`, `## Work Tree`) are
        // at the TOP. A tail-read implementation passes a naive "did it return text?" check and
        // fails this one.
        let dir = tmpdir("head");
        let p = dir.join("f.md");
        let body = format!("**Workflow:** feature\n{}\nTAIL_MARKER\n", "x".repeat(4096));
        std::fs::write(&p, &body).unwrap();

        let got = read_head(&p).unwrap().unwrap();
        assert!(
            got.starts_with("**Workflow:** feature"),
            "must read from the start of the file"
        );
    }

    #[test]
    fn read_head_truncates_at_the_byte_cap() {
        let dir = tmpdir("cap");
        let p = dir.join("big.md");
        std::fs::write(&p, "y".repeat(WIP_MAX_BYTES + 5_000)).unwrap();

        let got = read_head(&p).unwrap().unwrap();
        assert!(
            got.len() <= WIP_MAX_BYTES,
            "read must be bounded, got {} bytes",
            got.len()
        );
    }

    #[test]
    fn wip_dir_for_joins_the_relative_path() {
        let got = wip_dir_for(Path::new("/tmp/proj"));
        assert!(got.ends_with("workflow-system/state/wip"), "got {got:?}");
    }
}
