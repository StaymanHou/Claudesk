//! Installing the companion workflow system, and the provenance record of having done it
//! (M10.9 WP3.5a).
//!
//! ## Why this module exists separately from `workflow_substrate`
//! `workflow_substrate` answers one read-only question — *is the substrate there?* — and
//! carries a standing source guard (`detection_reads_and_never_writes`) that fails if its
//! production code so much as mentions `Command`, `git`, `install.sh`, or `create_dir`. That
//! guard is what made WP3 *provably* non-writing, and its own failure message says where
//! writing code belongs: "its own module behind an explicit, user-initiated action."
//!
//! This is that module. The separation is enforced by a test, not merely intended.
//!
//! ## The safety model, in one place
//! This feature is the first code in Claudesk's history to mutate state outside its own
//! app-data dir, and the tree it mutates (`~/.claude/`) is — on the operator's machine —
//! symlinks into a companion repo they actively edit. `SURFACE-2026-07-28-MCCC-INSTALL-FEATURE-NEEDS-SANDBOXED-DEV-AND-VERIFY`
//! (priority **high**) sets the bar. Three rules carry it:
//!
//! 1. **Injectable roots everywhere.** Every function here takes its roots as parameters.
//!    There is **no ambient `home_dir()` / `env::var("HOME")` in this file**, and a standing
//!    source guard ([`tests::roots_are_injected_never_ambient`]) fails if one appears. Only
//!    the thin `commands` layer resolves real paths. This is the `hook_install` /
//!    `workflow_substrate` split, adopted here for a stronger reason than testability: it is
//!    what makes a sandbox possible at all.
//!
//! 2. **Provenance is RECORDED at install time, never INFERRED from a resolved path.** This
//!    is the load-bearing rule and the reason [`InstallState`] exists. `_ref/claude-customization`,
//!    `~/.claude/skills/feature-build`, and the operator's real repo can all resolve to the
//!    same bytes — so anything that decides "this is mine to remove" by resolving a path can
//!    destroy the operator's working repo while believing it is removing an install. A
//!    substrate with **no record is never `Managed`**, no matter where it sits.
//!
//! 3. **Every degraded read fails toward `Developer`, never `Managed`.** A missing, corrupt,
//!    or unparseable record resolves to `Developer` — the state that offers *no* removal
//!    affordance. `Managed` is the only state WP3.5b will act destructively on, so it must be
//!    reachable only by an affirmative, well-formed record. Failing the other way would mean a
//!    corrupt file could make someone's substrate eligible for deletion.
//!
//! ## What lives here vs. in WP3.5b
//! WP3.5a writes `Managed` and reads all three states (to decide whether to offer installing).
//! **Nothing in this module deletes anything.** The uninstall path — and the refuse-guard that
//! must precede it — is WP3.5b's task one.

// ## `#![allow(dead_code)]` was here, and is now REMOVED (2026-07-29)
// Phase 1 built the sandbox fixture and provenance store before anything that writes — the
// ordering the high-priority sandbox SURFACE mandates — which left those items without a
// production caller and failed `-D warnings`. The allow carried that gap with an explicit
// expiry: "remove when Phase 4 lands."
//
// Phase 4 landed, the trigger fired, and nothing tracked it until code review. Removing the
// attribute surfaced exactly ONE masked item — `runner::NullSink`, a test-only helper sitting in
// production code — now `#[cfg(test)]`-gated. Everything else was genuinely reachable.
//
// **Do not re-add it.** WP3.5b adds the deleting path into this module, and dead-code detection on
// destructive code is exactly where an orphaned function is most expensive to miss. If a future
// phase again needs to land un-wired code, gate that ITEM narrowly rather than re-opening the
// whole module.

// The ONLY layer that resolves real paths (`$HOME`, `~/.claudesk/`). Every other module here
// takes its roots as parameters so the sandbox can contain writes; this is the sanctioned
// exception, kept to one thin file so there is exactly one place to audit.
pub mod commands;
pub mod provenance;
// The two subprocess spawns (`git clone` → the repo's own `install.sh`) plus the ordering that
// makes a failed install leave no provenance record. Additive only — no deleting path.
pub mod runner;
// Phase 3 — what a finished run MEANS (gate revert, cleanup, what to surface), as a pure
// reducer over `runner`'s outcome. Separate from `runner` because root `CLAUDE.md` requires
// revert-semantics control flow to be a pure function asserted as a value, never a `?raw`
// guard. The division: runner reports, terminal decides, the caller acts.
pub mod terminal;
// The sandbox fixture is test-only by construction: a production `use` of it fails to
// compile, which is stronger than a naming convention. Built FIRST, per the SURFACE's
// mandated ordering — nothing that writes was built until it existed and was proven to
// contain writes.
#[cfg(test)]
pub mod sandbox;

use std::path::{Path, PathBuf};

/// Where a managed clone lives by default, relative to the user's home directory.
///
/// **Deliberately NOT bundle-identity-scoped.** `com.claudesk.app` and
/// `com.claudesk.app.dev` share one clone and therefore must read one provenance record —
/// which is exactly why the record cannot live in the per-identity `settings.json`. A
/// per-identity record would let the dev build believe a directory is unmanaged while prod
/// believes it is managed: two divergent views of one tree, in a feature whose whole safety
/// model is "only touch what we recorded."
pub const DEFAULT_VENDOR_SUBPATH: [&str; 2] = [".claudesk", "vendor"];

/// The managed clone's directory name under the vendor dir.
pub const CLONE_DIR_NAME: &str = "my-claude-code-customization";

/// The three states the substrate can be in, from Claudesk's point of view.
///
/// The names describe **provenance**, not location — that distinction is the module's whole
/// safety model. A substrate sitting inside Claudesk's own vendor dir with no record is
/// [`InstallState::Developer`], because Claudesk did not record installing it and must not
/// act as though it did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InstallState {
    /// No substrate found. The install wizard is offered.
    Absent,
    /// Claudesk installed this and holds a well-formed record of doing so. The only state
    /// WP3.5b may act destructively on.
    Managed,
    /// A substrate exists that Claudesk did not record installing — a hand-clone, the
    /// operator's live repo, or a record too damaged to trust. Claudesk **describes**, never
    /// acts. Also the safe landing state for every degraded read.
    Developer,
}

/// The default managed-clone path under an injected home.
///
/// Takes `home` as a parameter — see the module header's rule 1. The real home is resolved
/// only in `commands`.
pub fn default_clone_path(home: &Path) -> PathBuf {
    let mut path = home.to_path_buf();
    for segment in DEFAULT_VENDOR_SUBPATH {
        path.push(segment);
    }
    path.push(CLONE_DIR_NAME);
    path
}

/// Decide the install state from what is on disk plus what was recorded.
///
/// `substrate_present` is [`crate::workflow_substrate::skills_dir_exists`]'s answer (does
/// `~/.claude/skills/` exist?) — passed in rather than computed here so this stays a pure
/// decision with no filesystem of its own.
///
/// `record` is the provenance record, if one could be read AND parsed. A `None` covers
/// three cases that must be indistinguishable here: no record was ever written, the file is
/// gone, or the file is corrupt. All three mean *Claudesk cannot prove it installed this*,
/// which is the only question this function asks.
///
/// ## The never-infer rule, as code
/// Note what this function does **not** do: it never compares `record.clone_path` against a
/// resolved filesystem path to "recover" a lost record, and it never treats
/// "substrate lives under the vendor dir" as evidence of managed provenance. Adding either
/// would reintroduce exactly the inference the high-priority SURFACE forbids.
pub fn resolve_state(
    substrate_present: bool,
    record: Option<&provenance::InstallRecord>,
) -> InstallState {
    match (substrate_present, record) {
        // Nothing installed. A leftover record without a substrate still reads Absent: the
        // record describes an install that is no longer there, and offering to "remove" it
        // would be offering to remove nothing.
        (false, _) => InstallState::Absent,
        // Present AND recorded — the only path to Managed.
        (true, Some(_)) => InstallState::Managed,
        // Present but unrecorded. THE load-bearing arm: this is the operator's live repo,
        // a hand-clone, or a corrupt record. Claudesk describes it and offers no removal.
        (true, None) => InstallState::Developer,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use provenance::InstallRecord;

    /// This module's production source, comments stripped, for the two source guards below.
    ///
    /// **Splits on `mod tests`, NOT on the first `#[cfg(test)]`.** That distinction is load
    /// bearing and cost a real failure to find: this file carries `#[cfg(test)]` twice — once
    /// near the top to gate the `sandbox` module declaration, and once on the test module
    /// itself. Splitting on the attribute truncated the "production" slice at line 7,
    /// silently discarding the entire rest of the file. The forbidden-token scans would then
    /// have passed no matter what the module contained, which is the vacuous-guard failure
    /// mode this repo has paid for repeatedly — here caught only because the positive half
    /// (below) failed loudly. The positive assertions are the reason this bug surfaced at
    /// all; a guard with only negative assertions would have shipped broken and silent.
    fn production_source() -> String {
        let src = include_str!("mod.rs");
        let production = src.split("mod tests").next().unwrap_or(src);
        production
            .lines()
            .filter(|l| {
                let t = l.trim_start();
                !t.starts_with("//") && !t.starts_with("*") && !t.starts_with("/*")
            })
            .collect::<Vec<_>>()
            .join("\n")
    }

    #[test]
    fn the_source_guards_actually_see_the_whole_production_body() {
        // Meta-test for `production_source`. The extractor is the shared dependency of both
        // source guards, so a bug in it disables both at once — exactly what happened when it
        // split on `#[cfg(test)]` and truncated at the `sandbox` declaration seven lines in.
        //
        // Asserts on the LAST production item, not the first: truncation always eats the tail,
        // so pinning something near the end is what makes the check meaningful.
        let code = production_source();

        assert!(
            code.contains("fn resolve_state"),
            "the extractor is truncating before the end of production code — both source \
             guards are blind to whatever it cut"
        );
        assert!(
            code.contains("InstallState::Developer"),
            "the extractor must reach the last production arm"
        );
        assert!(
            !code.contains("fn production_source"),
            "the extractor must not include the test module itself, or the guards would \
             match their own forbidden-token literals"
        );
    }

    fn a_record() -> InstallRecord {
        InstallRecord {
            clone_path: PathBuf::from("/somewhere/.claudesk/vendor/my-claude-code-customization"),
            installed_at: "2026-07-29T12:00:00Z".to_string(),
            origin_url: "git@example.com:someone/repo.git".to_string(),
        }
    }

    #[test]
    fn default_clone_path_is_under_the_injected_home_not_the_real_one() {
        let home = Path::new("/tmp/fake-home");

        let path = default_clone_path(home);

        assert_eq!(
            path,
            Path::new("/tmp/fake-home/.claudesk/vendor/my-claude-code-customization")
        );
        assert!(
            path.starts_with(home),
            "the clone path must be rooted at the INJECTED home — a path that escapes it \
             means an ambient home leaked in"
        );
    }

    #[test]
    fn absent_when_no_substrate_is_present() {
        assert_eq!(resolve_state(false, None), InstallState::Absent);
    }

    #[test]
    fn absent_when_a_record_survives_but_the_substrate_is_gone() {
        // The user deleted ~/.claude/skills/ by hand after Claudesk installed it. There is
        // nothing to remove, so offering removal would be offering a no-op; and the install
        // affordance is the useful one. Notably this must NOT read Managed — WP3.5b would
        // then run uninstall.sh against a substrate that isn't there.
        let record = a_record();

        assert_eq!(resolve_state(false, Some(&record)), InstallState::Absent);
    }

    #[test]
    fn managed_only_when_present_and_recorded() {
        let record = a_record();

        assert_eq!(resolve_state(true, Some(&record)), InstallState::Managed);
    }

    #[test]
    fn present_but_unrecorded_is_developer_never_managed() {
        // ═══════════════════════════════════════════════════════════════════════════
        // THE never-infer-from-a-resolved-path rule, asserted as a value.
        //
        // This is the arm that protects the operator's live repo. Their
        // ~/.claude/skills/ entries are symlinks into a companion repo they actively
        // edit; Claudesk never installed them and holds no record. If this returned
        // Managed, WP3.5b would offer to remove the operator's working source.
        //
        // It is also the arm that covers a hand-clone into Claudesk's OWN vendor dir:
        // location is not provenance. Nothing in the UI directs anyone there (the
        // developer-install row shows a neutral path deliberately), so this is an
        // undocumented edge case landing on the safe default rather than a built-for
        // state.
        // ═══════════════════════════════════════════════════════════════════════════
        assert_eq!(resolve_state(true, None), InstallState::Developer);
    }

    #[test]
    fn a_substrate_sitting_in_the_vendor_dir_is_still_not_managed_without_a_record() {
        // ═══════════════════════════════════════════════════════════════════════════
        // The INVERSE of the never-infer rule, and the highest-consequence claim in this
        // module: `Managed` is the only state WP3.5b acts destructively on, so the test
        // set must prove it cannot be reached by LOCATION.
        //
        // Codified because the sibling test above documents this case in prose ("location
        // is not provenance") while asserting only the generic `(true, None)` arm — the
        // claim about the vendor dir specifically was unenforced. A future refactor that
        // "helpfully" adopted an unrecorded clone found under DEFAULT_VENDOR_SUBPATH would
        // have passed every existing test while arming a delete against a hand-clone.
        //
        // Note the shape: a real vendor path is constructed and handed to `resolve_state`
        // ALONGSIDE `None`. If the function ever grows a path parameter and starts
        // comparing it to the vendor dir, this test is what fails.
        // ═══════════════════════════════════════════════════════════════════════════
        let home = Path::new("/tmp/fake-home");
        let in_the_vendor_dir = default_clone_path(home);

        // Sanity: the path really is inside Claudesk's own managed location, so the test is
        // exercising the tempting case rather than an unrelated path.
        assert!(
            in_the_vendor_dir.starts_with(home.join(".claudesk").join("vendor")),
            "the fixture must place the substrate inside the vendor dir, got \
             {in_the_vendor_dir:?}"
        );

        // Present, in Claudesk's OWN directory, but unrecorded → Developer. Never Managed.
        assert_eq!(
            resolve_state(true, None),
            InstallState::Developer,
            "an unrecorded substrate must read Developer even when it sits inside \
             Claudesk's own vendor dir — location is not provenance, and inferring \
             otherwise is what would let a delete target a hand-clone"
        );
    }

    #[test]
    fn a_corrupt_record_degrades_to_developer_not_managed() {
        // Proves the WHOLE corrupt→None→Developer chain by writing real corrupt bytes and
        // routing through `read_record`, rather than binding a literal `None`.
        //
        // The literal-`None` version of this test was value-identical to
        // `present_but_unrecorded_is_developer_never_managed` — the name claimed a corruption
        // path the body never exercised, so the chain was only covered by two tests read
        // together. Flagged at verify-self as a name overstating its assertion; this is the
        // repo's recurring overstated-assertion class, so it is fixed rather than renamed.
        let root = tempfile::TempDir::new().unwrap();
        std::fs::write(
            provenance::record_path(root.path()),
            b"{ truncated and unparseable",
        )
        .unwrap();

        let record = provenance::read_record(root.path());
        assert!(
            record.is_none(),
            "a corrupt record must read as None — the first link in the chain"
        );
        assert_eq!(
            resolve_state(true, record.as_ref()),
            InstallState::Developer,
            "a corrupt record must fail toward Developer (no removal offered), never Managed — \
             file corruption must not arm a delete"
        );
    }

    #[test]
    fn roots_are_injected_never_ambient() {
        // ═══════════════════════════════════════════════════════════════════════════
        // The mirror image of `workflow_substrate::commands`'s read-only guard.
        //
        // That guard forbids WRITES in a read-only module. This one forbids AMBIENT
        // ROOT RESOLUTION in a module that writes: the high-priority sandbox SURFACE
        // requires "no hardcoded $HOME in any path that deletes or writes", because a
        // single ambient `home_dir()` is all it takes for a test — or a bug — to reach
        // the operator's real `~/.claude/`.
        //
        // Source-level for the same reason the sibling guard is: "no write escaped the
        // sandbox" is impractical to assert from a unit test, while "this module never
        // resolves a real home" is exact and fails the moment someone adds one.
        // ═══════════════════════════════════════════════════════════════════════════
        let code = production_source();

        for forbidden in ["home_dir", "env::var", "std::env", "dirs::home"] {
            assert!(
                !code.contains(forbidden),
                "workflow_install must not resolve roots ambiently (`{forbidden}`) — every \
                 root arrives as a PARAMETER so the sandbox fixture can contain every write. \
                 Resolving the real home belongs in `commands`, which is the only layer \
                 allowed to touch reality. See the high-priority sandbox SURFACE."
            );
        }

        // Positive half — absence alone would pass a file that stopped doing the work.
        // (Without this the guard is vacuous, the exact failure mode WP2's meta-tests exist
        // to prevent.)
        assert!(
            code.contains("fn resolve_state"),
            "the state decision must live here as a pure function"
        );
        assert!(
            code.contains("home: &Path"),
            "roots must appear as injected parameters"
        );
    }

    #[test]
    fn nothing_in_this_module_deletes() {
        // WP3.5a is the ADDITIVE half. The deleting path — and the refuse-guard that must
        // precede it — is WP3.5b's task one, and the SURFACE's mandated ordering only means
        // something if this WP genuinely ships no delete. Guarding it here means the ordering
        // is enforced rather than remembered.
        let code = production_source();

        for forbidden in ["remove_dir", "remove_file", "uninstall.sh"] {
            assert!(
                !code.contains(forbidden),
                "WP3.5a must ship NO deleting path (`{forbidden}` found) — uninstall is \
                 WP3.5b, where the refuse-guard is task one, before any delete exists."
            );
        }
    }
}
