//! Read-only detection of the companion workflow system's install (M10.9 WP3).
//!
//! Claudesk's workflow-orchestration features depend on a substrate it does not ship: the
//! companion workflow system, installed as symlinks under `~/.claude/skills/`. This module
//! answers one question — **is it there?** — so the Settings panel can show the user
//! either install instructions or the `/tutorial-getting-started` pointer.
//!
//! ## Why this is its own module and not part of `workflow_gate`
//! `workflow_gate::commands` carries a standing guard test that fails if its production
//! code so much as mentions `.claude`, `home_dir`, `HOME`, `skills`, or `install.sh`. That
//! guard protects the milestone's load-bearing invariant: flipping the gate is a pure
//! Claudesk UI-state flip that writes nothing into the user's `~/.claude/` tree. This
//! module necessarily names those paths, and the guard's own failure message says where
//! such code belongs — "its own module behind an explicit, user-initiated action". So this
//! is that module, and the separation is enforced rather than merely intended.
//!
//! ## Read-only, and deliberately so
//! Every function here only ever `stat`s. Nothing creates, writes, moves, or deletes. A
//! missing `~/.claude/skills/` is a perfectly ordinary answer (`false`), never an error and
//! never something to "helpfully" fix by creating the directory — an empty `skills/` dir
//! would be worse than none, since it looks installed to any later check.
//!
//! ## Injectable roots (this is load-bearing for the NEXT work package)
//! [`skills_dir_exists`] takes the home directory as a **parameter**; only the thin
//! `commands` layer resolves the real one. That split is the `hook_install` pattern
//! (`mod.rs` pure + path-arg'd, `commands.rs` side-effecting) and it exists here for a
//! reason beyond testability: **WP3.5 adds install/uninstall wizards that delete files**,
//! and its sandbox requirement (`SURFACE-2026-07-28-MCCC-INSTALL-FEATURE-NEEDS-SANDBOXED-DEV-AND-VERIFY`,
//! priority high) mandates injectable roots with no ambient `home_dir()` anywhere in the
//! feature. Building the seam now — while the only operation is a harmless `stat` — means
//! the destructive code arrives into a shape that is already sandbox-testable, instead of
//! being retrofitted after the fact.
//!
//! Anything added here later MUST keep taking its roots as arguments.

pub mod commands;

use std::path::Path;

/// The substrate's install marker, relative to the user's home directory.
///
/// `install.sh` creates per-skill symlinks under `~/.claude/skills/`, so the directory's
/// existence is the cheapest honest signal that the system is installed. Deliberately NOT
/// a check for specific skill names: the skill set evolves in the companion repo on its own
/// schedule, and per the return contract's §4c anti-brittleness clause the only stable
/// coupling Claudesk may depend on is the command name `/tutorial-getting-started` — a
/// hardcoded roster of skill filenames would be exactly the brittle coupling that clause
/// forbids.
const SKILLS_SUBPATH: [&str; 2] = [".claude", "skills"];

/// Does the workflow system appear to be installed under `home`?
///
/// Returns a plain `bool` — **never** a `Result`. The caller renders either install
/// instructions or a tutorial pointer; there is no third UI state for "couldn't tell", and
/// an `Err` here would only tempt a caller into `?`-ing it and failing a Settings panel
/// over a `stat`. Unreadable, missing, and not-a-directory all mean the same thing to the
/// user: not installed.
///
/// A symlink to a real directory counts as installed — `install.sh` produces symlinks, and
/// `Path::is_dir` follows them, which is the behavior we want. A DANGLING symlink correctly
/// reads `false`: the target is gone, so the skills are not usable.
pub fn skills_dir_exists(home: &Path) -> bool {
    let mut path = home.to_path_buf();
    for segment in SKILLS_SUBPATH {
        path.push(segment);
    }
    path.is_dir()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn reports_installed_when_the_skills_directory_is_present() {
        let home = TempDir::new().unwrap();
        fs::create_dir_all(home.path().join(".claude").join("skills")).unwrap();

        assert!(skills_dir_exists(home.path()));
    }

    #[test]
    fn reports_absent_when_there_is_no_claude_directory_at_all() {
        let home = TempDir::new().unwrap();

        assert!(!skills_dir_exists(home.path()));
    }

    #[test]
    fn reports_absent_when_claude_exists_but_skills_does_not() {
        // The realistic "plain Claude Code user" shape: they have ~/.claude/ (CC itself
        // creates it) but have never installed the workflow system. This is the exact case
        // the invite exists to reach, so getting it wrong would mis-target the whole
        // feature.
        let home = TempDir::new().unwrap();
        fs::create_dir_all(home.path().join(".claude")).unwrap();

        assert!(!skills_dir_exists(home.path()));
    }

    #[test]
    fn reports_absent_when_skills_is_a_file_rather_than_a_directory() {
        let home = TempDir::new().unwrap();
        fs::create_dir_all(home.path().join(".claude")).unwrap();
        fs::write(home.path().join(".claude").join("skills"), b"not a dir").unwrap();

        assert!(!skills_dir_exists(home.path()));
    }

    #[test]
    fn the_check_creates_nothing() {
        // ═══════════════════════════════════════════════════════════════════════════
        // WP3 is READ-ONLY. This test is the standing proof.
        //
        // The tempting "fix" for an absent skills dir is to create it — and it would be
        // actively harmful: an empty `~/.claude/skills/` reads as INSTALLED to every
        // later check (including this module's own), so the user would be shown the
        // tutorial pointer for a system that isn't there, with no path back.
        //
        // It also guards the milestone's boundary. Writing anything under `~/.claude/`
        // is WP3.5's business, behind an explicit user-initiated wizard and its sandbox
        // discipline — never a side effect of asking a question.
        // ═══════════════════════════════════════════════════════════════════════════
        let home = TempDir::new().unwrap();

        let before = fs::read_dir(home.path()).unwrap().count();
        assert!(!skills_dir_exists(home.path()));
        assert!(!skills_dir_exists(home.path())); // repeat — a lazy-init bug needs two calls
        let after = fs::read_dir(home.path()).unwrap().count();

        assert_eq!(
            before, after,
            "the presence check must not create anything — an auto-created empty \
             skills/ dir would read as INSTALLED to every later check"
        );
        assert!(
            !home.path().join(".claude").exists(),
            "the presence check must not create ~/.claude/"
        );
    }

    #[test]
    fn a_dangling_symlink_reads_as_absent() {
        // install.sh makes symlinks, so this module must be right about them. A link whose
        // target has been deleted (the user removed the companion repo without running
        // uninstall.sh) is NOT a usable install, and reporting it as installed would show
        // the tutorial pointer for skills that cannot load.
        let home = TempDir::new().unwrap();
        let claude = home.path().join(".claude");
        fs::create_dir_all(&claude).unwrap();
        std::os::unix::fs::symlink(home.path().join("gone"), claude.join("skills")).unwrap();

        assert!(!skills_dir_exists(home.path()));
    }

    #[test]
    fn a_symlink_to_a_real_directory_reads_as_installed() {
        // The operator's own shape: ~/.claude/skills/ entries are symlinks into the
        // companion repo. `is_dir` follows links, which is the behavior we want.
        let home = TempDir::new().unwrap();
        let claude = home.path().join(".claude");
        fs::create_dir_all(&claude).unwrap();
        let real = home.path().join("elsewhere");
        fs::create_dir_all(&real).unwrap();
        std::os::unix::fs::symlink(&real, claude.join("skills")).unwrap();

        assert!(skills_dir_exists(home.path()));
    }
}
