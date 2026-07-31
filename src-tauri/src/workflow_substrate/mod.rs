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

/// Where `install.sh` puts its per-skill symlinks, relative to the user's home directory.
///
/// **The directory's existence is NOT the signal** — that was the original design, and it was
/// wrong in both directions (see [`skills_dir_exists`], which supersedes it): an empty leftover
/// read as installed after any uninstall, and a user's own skills read as installed on a
/// machine that never had the substrate. This constant now names only *where to look*; what
/// counts as an install is decided by the marker check below.
///
/// Still deliberately NOT a check for specific skill names: the skill set evolves in the
/// companion repo on its own schedule, and per the return contract's §4c anti-brittleness
/// clause a hardcoded roster of skill filenames would be exactly the brittle coupling that
/// clause forbids.
const SKILLS_SUBPATH: [&str; 2] = [".claude", "skills"];

/// The installer script at a candidate repo's root.
const INSTALLER_FILENAME: &str = "install.sh";

/// The companion workflow system's own namespace marker, looked for INSIDE that installer.
///
/// A filename is not identity — `install.sh` is generic enough that another skill system could
/// ship one, and matching on the name alone would let an unrelated repo's skills read as this
/// substrate (the operator's objection to the first version of this check). This string is the
/// marker the companion repo wraps its `~/.claude/CLAUDE.md` block in, and it appears in **both**
/// `install.sh` and `uninstall.sh` — the two scripts must agree on it or their own block
/// injection/excision breaks, which is what makes it stable rather than incidental.
///
/// Deliberately NOT a skill name: the roster churns and §4c forbids coupling to it. If this
/// marker ever changes upstream, detection degrades to "not installed" — the safe direction,
/// and a one-line edit here.
const WORKFLOW_MARKER: &str = "claude-workflow-system";

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
///
/// ## The question is "is THE WORKFLOW SYSTEM installed?", not "is anything in skills/?"
///
/// This predicate went through three versions, and the first two were both wrong in the same
/// direction — they answered a question about the *directory* instead of about the *substrate*:
///
/// 1. **Bare `is_dir()`** (WP3 → v0.2.9). An empty `~/.claude/skills/` read as installed.
///    `uninstall.sh` removes the per-skill symlinks but correctly leaves the directory (Claude
///    Code owns it; `install.sh` never created it), so any hand-uninstall left Claudesk
///    claiming "installed ✓". Worse after WP3.5a: with no provenance record,
///    `resolve_state(true, None)` lands on `Developer` — an affirmative "installed outside
///    Claudesk, so Claudesk won't modify or remove it" about a substrate that is gone.
/// 2. **Non-empty** (my first fix). Correct for the empty case, still wrong for the case the
///    operator immediately identified: a user who had **their own skills before installing**.
///    `uninstall.sh` deliberately leaves those, so the directory is non-empty and the same
///    false claim returns. It also mis-reads a user who has *never* installed the workflow
///    system but keeps their own skills — they read as installed, so the invite never appears.
///
/// ## The signal that actually distinguishes it
/// `install.sh` installs each skill as a **symlink into its own repo**, and that repo carries
/// an `install.sh` at its root. A user's own skill is a real directory (or a symlink pointing
/// somewhere with no installer). So: *does any entry resolve into a directory whose repo root
/// contains an `install.sh` that is recognizably THIS workflow system's?*
///
/// The second half of that is the operator's requirement, and it matters: `install.sh` is a
/// generic filename another skill system could ship. The content check looks for
/// [`WORKFLOW_MARKER`] — the companion repo's own namespace string, which appears in **both**
/// its `install.sh` and `uninstall.sh` and is load-bearing to the `~/.claude/CLAUDE.md` block
/// those two scripts pair on. It cannot be dropped upstream without breaking their own
/// install/uninstall symmetry, which is what makes it a safer coupling than a filename.
///
/// **Why this is not a §4c violation.** The return contract forbids coupling to the tour's
/// flow, steps, or skill roster — the things that legitimately churn. This couples to none of
/// them: no skill name is hardcoded, so the roster can change freely. If the marker ever does
/// change, detection degrades to "not installed" (the safe direction: Claudesk offers to
/// install rather than claiming to own something), and it is a one-constant edit here.
///
/// Every failure mode — unreadable dir, unreadable script, dangling symlink, no matching entry
/// — reads `false`, for the same reason: we cannot see the substrate, so we must not claim it.
pub fn skills_dir_exists(home: &Path) -> bool {
    let mut path = home.to_path_buf();
    for segment in SKILLS_SUBPATH {
        path.push(segment);
    }
    let Ok(entries) = std::fs::read_dir(&path) else {
        return false;
    };
    entries
        .filter_map(Result::ok)
        .any(|entry| entry_is_workflow_system_skill(&entry.path()))
}

/// Does this `~/.claude/skills/<name>` entry belong to the companion workflow system?
///
/// Takes the path as a parameter (no ambient roots, per the module header). Returns `false`
/// for anything it cannot positively confirm — a real directory the user created, a symlink
/// into an unrelated tree, a dangling link, an unreadable installer.
fn entry_is_workflow_system_skill(entry: &Path) -> bool {
    // Only a symlink can be an install artifact: `install.sh` creates symlinks, and a real
    // directory here is the user's own skill.
    if !entry.is_symlink() {
        return false;
    }
    // Resolve it. A dangling link fails here, which is correct — the skill is unusable.
    let Ok(target) = entry.canonicalize() else {
        return false;
    };
    // `<repo>/skills/<name>` → the repo root is two levels up.
    let Some(repo_root) = target.parent().and_then(Path::parent) else {
        return false;
    };
    let installer = repo_root.join(INSTALLER_FILENAME);
    // Filename alone is not enough (the operator's point: another skill system could ship an
    // `install.sh`), so confirm the content carries this workflow system's own marker.
    std::fs::read_to_string(installer)
        .map(|body| body.contains(WORKFLOW_MARKER))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    /// Build a fake companion-workflow-system repo whose `install.sh` carries the marker,
    /// and return its `skills/` dir — the source a real install symlinks into.
    fn fake_workflow_repo(at: &Path) -> std::path::PathBuf {
        let skills = at.join("skills");
        fs::create_dir_all(skills.join("feature-build")).unwrap();
        fs::write(
            at.join("install.sh"),
            "#!/usr/bin/env bash\nBEGIN_MARKER=\"<!-- BEGIN claude-workflow-system -->\"\n",
        )
        .unwrap();
        skills
    }

    /// Symlink one skill from `repo_skills` into `~/.claude/skills/` — what `install.sh` does.
    fn link_skill(home: &Path, repo_skills: &Path, name: &str) {
        let dest = home.join(".claude").join("skills");
        fs::create_dir_all(&dest).unwrap();
        std::os::unix::fs::symlink(repo_skills.join(name), dest.join(name)).unwrap();
    }

    #[test]
    fn reports_installed_when_a_skill_symlinks_into_the_workflow_system_repo() {
        let home = TempDir::new().unwrap();
        let repo = TempDir::new().unwrap();
        let repo_skills = fake_workflow_repo(repo.path());
        link_skill(home.path(), &repo_skills, "feature-build");

        assert!(skills_dir_exists(home.path()));
    }

    #[test]
    fn a_users_own_skills_are_not_the_workflow_system() {
        // ═══════════════════════════════════════════════════════════════════════════
        // THE case the operator identified, and the hole in the previous "non-empty"
        // predicate. `uninstall.sh` deliberately leaves skills it did not create — so a
        // user who had their own skills BEFORE installing is left with a non-empty
        // directory afterwards, and "non-empty" would call that installed.
        //
        // Same shape covers the never-installed user: someone with their own skills and
        // no workflow system must read absent, or the invite never reaches them.
        // ═══════════════════════════════════════════════════════════════════════════
        let home = TempDir::new().unwrap();
        let skills = home.path().join(".claude").join("skills");
        fs::create_dir_all(skills.join("my-own-skill")).unwrap();
        fs::write(skills.join("notes.md"), b"mine").unwrap();

        assert!(
            !skills_dir_exists(home.path()),
            "a user's own skills are not the workflow system — claiming otherwise hides \
             the invite from them and makes a completed uninstall read as installed"
        );
    }

    #[test]
    fn the_users_own_skills_do_not_mask_a_real_install() {
        // The inverse: both present must read installed. A predicate that only looked at
        // the FIRST entry (or required all entries to match) would fail here.
        let home = TempDir::new().unwrap();
        let repo = TempDir::new().unwrap();
        let repo_skills = fake_workflow_repo(repo.path());
        let skills = home.path().join(".claude").join("skills");
        fs::create_dir_all(skills.join("aaa-my-own-skill")).unwrap();
        link_skill(home.path(), &repo_skills, "feature-build");

        assert!(skills_dir_exists(home.path()));
    }

    #[test]
    fn a_symlink_into_an_unrelated_repo_is_not_the_workflow_system() {
        // The operator's specific objection: `install.sh` is a generic filename, so another
        // skill system could ship one. Filename alone must not be enough — the marker is
        // what identifies THIS substrate.
        let home = TempDir::new().unwrap();
        let other = TempDir::new().unwrap();
        let other_skills = other.path().join("skills");
        fs::create_dir_all(other_skills.join("their-skill")).unwrap();
        fs::write(
            other.path().join("install.sh"),
            "#!/usr/bin/env bash\n# some other skill system entirely\n",
        )
        .unwrap();
        link_skill(home.path(), &other_skills, "their-skill");

        assert!(
            !skills_dir_exists(home.path()),
            "an unrelated repo that happens to ship install.sh must not read as this \
             workflow system"
        );
    }

    #[test]
    fn a_symlink_into_a_repo_with_no_installer_is_not_the_workflow_system() {
        let home = TempDir::new().unwrap();
        let other = TempDir::new().unwrap();
        let other_skills = other.path().join("skills");
        fs::create_dir_all(other_skills.join("loose-skill")).unwrap();
        link_skill(home.path(), &other_skills, "loose-skill");

        assert!(!skills_dir_exists(home.path()));
    }

    #[test]
    fn a_dangling_symlink_is_not_an_install() {
        // The target repo was deleted by hand. The skill is unusable, so it is not an
        // install — and canonicalize() failing is what makes that fall the safe way.
        let home = TempDir::new().unwrap();
        let dest = home.path().join(".claude").join("skills");
        fs::create_dir_all(&dest).unwrap();
        std::os::unix::fs::symlink(
            home.path().join("gone").join("skills").join("x"),
            dest.join("x"),
        )
        .unwrap();

        assert!(!skills_dir_exists(home.path()));
    }

    #[test]
    fn reports_absent_when_the_skills_directory_is_empty() {
        // ═══════════════════════════════════════════════════════════════════════════
        // THE post-uninstall shape, and a BLOCKING bug found by driving the real flow
        // (WP3.5b Phase 3 verify-self). `uninstall.sh` removes the per-skill symlinks
        // but leaves `~/.claude/skills/` itself — correctly, since it never created it.
        //
        // Under the old bare `is_dir()` this answered `true`, and with the provenance
        // record deleted `resolve_state(true, None)` lands on `Developer` — so a fully
        // successful uninstall left the panel claiming "installed ✓ … Claudesk won't
        // modify or remove it" about a substrate that was gone.
        //
        // This test was previously written the OTHER way round (`create_dir_all` then
        // assert installed), which is how the behavior shipped: the test asserted the
        // bug. Its predecessor's own comment even warned that an empty skills dir "reads
        // as INSTALLED to every later check" — the hazard was documented and unenforced.
        // ═══════════════════════════════════════════════════════════════════════════
        let home = TempDir::new().unwrap();
        fs::create_dir_all(home.path().join(".claude").join("skills")).unwrap();

        assert!(
            !skills_dir_exists(home.path()),
            "an empty skills/ dir is a leftover shell, not an install — claiming otherwise \
             makes a completed uninstall read as a developer install"
        );
    }

    // `a_single_leftover_entry_still_reads_as_installed` was DELETED here (2026-07-31).
    //
    // It asserted that any leftover entry — explicitly "someone-elses-skill" — keeps the
    // substrate reading as installed, and its comment rationalized that as a feature ("must
    // not read as absent"). That is precisely the bug the operator caught: a user's own skill
    // is not this workflow system, and `uninstall.sh` deliberately leaves such entries behind.
    // The test was written in the same pass as the non-empty predicate it defended, so it read
    // as coverage while pinning the wrong behavior — the failure class this WP has paid for
    // repeatedly. `a_users_own_skills_are_not_the_workflow_system` above is its replacement,
    // asserting the opposite.

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

    // `a_symlink_to_a_real_directory_reads_as_installed` and
    // `a_symlink_to_an_empty_directory_reads_as_absent` were DELETED here (2026-07-31).
    //
    // Both symlinked the WHOLE `~/.claude/skills` directory at an arbitrary target — a shape
    // `install.sh` never produces (it creates one symlink per skill INSIDE that directory).
    // Under the marker-based predicate an arbitrary target has no workflow-system repo behind
    // it, so both now read absent, and keeping them would pin a fabricated shape. The real
    // scenario they stood for (the operator's own machine: per-skill symlinks into the
    // companion repo) is covered by `reports_installed_when_a_skill_symlinks_into_the_workflow_system_repo`
    // and `the_users_own_skills_do_not_mask_a_real_install`.
}
