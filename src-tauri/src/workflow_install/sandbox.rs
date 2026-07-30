//! The sandbox fixture (M10.9 WP3.5a task 3.5.1) — **test-only**, and built FIRST.
//!
//! `SURFACE-2026-07-28-MCCC-INSTALL-FEATURE-NEEDS-SANDBOXED-DEV-AND-VERIFY` (priority
//! **high**) requires that this exist, and be *proven to contain writes*, before any writing
//! code is built. That ordering is the point: the destructive code of WP3.5b arrives into a
//! shape that is already sandbox-testable instead of being retrofitted after the fact, when
//! retrofitting means pointing a delete at something real to check it works.
//!
//! ## What it provides
//! Three roots, all under one `TempDir`, mirroring the real layout:
//!
//! ```text
//! <temp>/
//!   home/                  ← the injected `$HOME`
//!     .claude/             ← the tree install.sh writes into
//!     .claudesk/           ← where the provenance record lives
//!       vendor/            ← where the managed clone goes
//! ```
//!
//! Every test in this feature takes its roots from here rather than constructing its own, so
//! there is exactly one definition of "inside the sandbox" to reason about — and
//! [`Sandbox::assert_contains_all_writes`] is what turns that definition into a proof.
//!
//! ## Why `#[cfg(test)]` and not a `dev-dependencies` helper crate
//! It is used only by this module's tests and must never be reachable from production code.
//! Gating it at the module declaration means a production `use` of it fails to compile —
//! stronger than a naming convention, and consistent with how the rest of this repo keeps
//! test scaffolding out of shipped binaries.

use std::fs;
use std::path::{Path, PathBuf};

use tempfile::TempDir;

/// Resolve a path for prefix comparison, following symlinks where it exists.
///
/// ## Why every containment comparison needs this
/// On macOS a `TempDir` lives under `/var/folders/…`, and `/var` is itself a symlink to
/// `/private/var`. So the sandbox's own boundary is the *non*-canonical form while anything
/// production observed via `canonicalize()` is the `/private/var` form — and
/// `Path::starts_with` is a literal component comparison, so a genuinely-contained path
/// compares as an escape. That produced a false BLOCKING failure the first time a production
/// path (rather than a test literal) was fed to these asserts.
///
/// Canonicalizing **both sides** is what makes the comparison sound. It does not weaken the
/// check: resolving symlinks is precisely what closes the escape where a contained-looking
/// link points outside the sandbox, which is the attack this fixture exists to catch.
///
/// A non-existent path cannot be canonicalized, so it falls back to its literal form. That is
/// the right failure direction: an unresolvable path keeps its original components and will
/// still be caught if those components sit outside the boundary.
fn canonical(path: &Path) -> PathBuf {
    path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
}

/// A contained filesystem for exercising install paths.
///
/// Holds the `TempDir` alive: dropping the `Sandbox` removes everything it created, so a test
/// that panics mid-install leaves nothing behind.
pub struct Sandbox {
    root: TempDir,
}

impl Sandbox {
    /// Build a sandbox with the real directory layout pre-created.
    ///
    /// `.claude/` is created because a realistic target machine already has it — Claude Code
    /// itself creates it — and the interesting cases are about what happens *inside* an
    /// existing tree (append-vs-create on `CLAUDE.md`, merge-vs-overwrite on symlinks), not
    /// about a pristine machine that no user actually has.
    pub fn new() -> Self {
        let root = TempDir::new().expect("sandbox tempdir");
        let home = root.path().join("home");
        fs::create_dir_all(home.join(".claude")).expect("sandbox .claude");
        fs::create_dir_all(home.join(".claudesk").join("vendor")).expect("sandbox vendor");
        Self { root }
    }

    /// The injected `$HOME`. Pass this wherever production code takes a `home: &Path`.
    pub fn home(&self) -> PathBuf {
        self.root.path().join("home")
    }

    /// The injected `~/.claude/` — the tree `install.sh` mutates.
    pub fn claude_dir(&self) -> PathBuf {
        self.home().join(".claude")
    }

    /// The injected `~/.claudesk/` — where the provenance record lives.
    pub fn claudesk_root(&self) -> PathBuf {
        self.home().join(".claudesk")
    }

    /// The injected vendor dir — where a managed clone lands.
    pub fn vendor_dir(&self) -> PathBuf {
        self.claudesk_root().join("vendor")
    }

    /// The outermost boundary. Nothing this feature writes may land outside it.
    pub fn boundary(&self) -> &Path {
        self.root.path()
    }

    /// Assert that every path in `written` is inside the sandbox boundary.
    ///
    /// **This is the containment proof the SURFACE asks for.** It is deliberately a positive
    /// assertion about where writes *went*, not a negative one about the real `~/.claude/`
    /// being untouched: the negative version passes trivially on any machine where the real
    /// path happens not to exist, or where the test simply never ran the code — the vacuous
    /// failure mode this repo has already paid for twice (WP2's `?raw` guards).
    pub fn assert_contains_all_writes(&self, written: &[PathBuf]) {
        assert!(
            !written.is_empty(),
            "containment is meaningless with zero writes to check — pass the paths the code \
             under test actually created, or the assertion passes vacuously"
        );
        let boundary = canonical(self.boundary());
        for path in written {
            assert!(
                canonical(path).starts_with(&boundary),
                "a write escaped the sandbox: {path:?} is not under {:?}. Every root must be \
                 injected — an ambient home_dir() is the usual cause.",
                self.boundary()
            );
        }
    }

    /// Assert every path in `written` is under `expected_root` specifically — a tighter check
    /// than [`Self::assert_contains_all_writes`].
    ///
    /// **Why both exist.** `boundary()` is the OUTER sandbox dir, so a write that escapes its
    /// intended root but stays inside the sandbox (e.g. `claudesk_root/../../leaked`) satisfies
    /// the boundary check while still being wrong. Verify-self surfaced exactly that gap: a
    /// two-level escape from `claudesk_root` passed the boundary assertion. Use this when the
    /// code under test was handed one specific root and must respect it; use the boundary
    /// version for the outer "nothing reached the real filesystem" claim.
    pub fn assert_writes_stay_under(&self, expected_root: &Path, written: &[PathBuf]) {
        self.assert_contains_all_writes(written);
        let expected = canonical(expected_root);
        for path in written {
            assert!(
                canonical(path).starts_with(&expected),
                "a write stayed inside the sandbox but escaped its intended root: {path:?} is \
                 not under {expected_root:?} — the boundary check alone would have passed this"
            );
        }
    }
}

impl Default for Sandbox {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workflow_install::{provenance, resolve_state, InstallState};

    #[test]
    fn the_layout_mirrors_the_real_one() {
        let sandbox = Sandbox::new();

        assert!(sandbox.claude_dir().is_dir(), "~/.claude/ must exist");
        assert!(sandbox.vendor_dir().is_dir(), "vendor dir must exist");
        assert!(sandbox.claudesk_root().is_dir());
        for path in [
            sandbox.home(),
            sandbox.claude_dir(),
            sandbox.claudesk_root(),
            sandbox.vendor_dir(),
        ] {
            assert!(
                path.starts_with(sandbox.boundary()),
                "{path:?} must be inside the boundary"
            );
        }
    }

    #[test]
    fn a_real_write_through_the_fixture_stays_contained() {
        // The end-to-end containment proof: exercise the ONLY writing path WP3.5a ships
        // (the provenance write) against the fixture, then assert where it landed.
        let sandbox = Sandbox::new();
        let record = provenance::InstallRecord {
            clone_path: sandbox.vendor_dir().join("my-claude-code-customization"),
            installed_at: "2026-07-29T12:00:00Z".to_string(),
            origin_url: "git@example.com:someone/repo.git".to_string(),
        };

        provenance::write_record(&sandbox.claudesk_root(), &record).unwrap();

        let written = provenance::record_path(&sandbox.claudesk_root());
        assert!(written.is_file(), "the record must actually exist");
        // The TIGHTER assert: under `claudesk_root` specifically, not merely somewhere in the
        // sandbox. The boundary-only version passed a two-level escape (found at verify-self).
        sandbox.assert_writes_stay_under(&sandbox.claudesk_root(), &[written]);
    }

    #[test]
    fn the_tighter_assert_catches_an_escape_the_boundary_check_misses() {
        // Meta-test for the gap verify-self found. A path that leaves its intended root but
        // stays inside the sandbox must be caught by `assert_writes_stay_under` while
        // `assert_contains_all_writes` accepts it — if both behaved the same, the tighter
        // assert would be redundant and the gap would still be open.
        let sandbox = Sandbox::new();
        let escaped_but_inside = sandbox.home().join("leaked-beside-claudesk");
        // Must EXIST on disk: both asserts canonicalize their inputs (see `canonical` — the
        // macOS /var→/private/var symlink makes that mandatory), and canonicalization of a
        // non-existent path falls back to its literal form, which would then compare against a
        // resolved boundary and fail for the wrong reason.
        fs::create_dir_all(&escaped_but_inside).unwrap();

        // The boundary check accepts it — this is the gap, asserted rather than described.
        sandbox.assert_contains_all_writes(std::slice::from_ref(&escaped_but_inside));

        // The tighter check rejects it.
        let result = std::panic::catch_unwind(|| {
            sandbox.assert_writes_stay_under(&sandbox.claudesk_root(), &[escaped_but_inside]);
        });
        assert!(
            result.is_err(),
            "assert_writes_stay_under must reject a path that escaped its intended root even \
             though it stayed inside the sandbox"
        );
    }

    #[test]
    fn the_fixture_composes_with_the_state_decision() {
        // Proves the fixture is usable for the decision path too, not just IO — the shape
        // Phase 2 and WP3.5b will both build on.
        let sandbox = Sandbox::new();

        // Nothing recorded yet, substrate present → the load-bearing Developer arm.
        let record = provenance::read_record(&sandbox.claudesk_root());
        assert_eq!(
            resolve_state(true, record.as_ref()),
            InstallState::Developer
        );

        // Record it, and only then does it read Managed.
        provenance::write_record(
            &sandbox.claudesk_root(),
            &provenance::InstallRecord {
                clone_path: sandbox.vendor_dir().join("mccc"),
                installed_at: "2026-07-29T12:00:00Z".to_string(),
                origin_url: "u".to_string(),
            },
        )
        .unwrap();
        let record = provenance::read_record(&sandbox.claudesk_root());
        assert_eq!(resolve_state(true, record.as_ref()), InstallState::Managed);
    }

    #[test]
    fn dropping_the_sandbox_removes_everything_it_created() {
        // A test that panics mid-install must leave nothing behind, or repeated runs
        // accumulate half-installed trees on the developer's disk.
        let boundary = {
            let sandbox = Sandbox::new();
            provenance::write_record(
                &sandbox.claudesk_root(),
                &provenance::InstallRecord {
                    clone_path: sandbox.vendor_dir(),
                    installed_at: "t".to_string(),
                    origin_url: "u".to_string(),
                },
            )
            .unwrap();
            sandbox.boundary().to_path_buf()
        };

        assert!(
            !boundary.exists(),
            "the sandbox must clean itself up on drop, left {boundary:?}"
        );
    }

    #[test]
    fn containment_assert_rejects_an_escaping_path() {
        // Meta-test: a guard that cannot fail is decoration. Proves the containment
        // assertion actually bites on the exact shape it exists to catch — a path under a
        // real home rather than the injected one.
        let sandbox = Sandbox::new();
        let escaped = PathBuf::from("/Users/someone/.claude/skills");

        let result = std::panic::catch_unwind(|| {
            sandbox.assert_contains_all_writes(&[escaped]);
        });

        assert!(
            result.is_err(),
            "assert_contains_all_writes must FAIL on a path outside the sandbox"
        );
    }

    #[test]
    fn containment_assert_rejects_an_empty_write_list() {
        // The other vacuity guard: passing zero paths must not read as "contained".
        let sandbox = Sandbox::new();

        let result = std::panic::catch_unwind(|| {
            sandbox.assert_contains_all_writes(&[]);
        });

        assert!(
            result.is_err(),
            "an empty write list must FAIL rather than pass vacuously"
        );
    }
}
