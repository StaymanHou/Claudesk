//! M12 WP3 — the batched auto-resume announcement (`picker_announce_actions`).
//!
//! One call per picker open returns the predicted action for **every** project, so the
//! picker row can state what a click will fire before you click it.
//!
//! ```jsonc
//! { "/Users/…/foo": "continue", "/Users/…/bar": "restore" }
//! // absent key = no prediction (the "neither" arm); {} when the gate is OFF
//! ```
//!
//! ## Why a sibling command and NOT a widening of `list_projects` (WP1 Verdict (b))
//!
//! The plan expected to copy the `default_model` precedent — widen the payload
//! `list_projects` already returns. That is the right precedent for a per-project value
//! **already being read and parsed**; typing it on the wire is free. The announce is
//! different in kind: it needs a **filesystem stat per project dir**, work `list_projects`
//! does not do today.
//!
//! The disqualifying evidence is the consumer set. `list_projects` has three call sites and
//! **two of them use only `projects.length`** (`App.tsx`, for the M10.9 invite count) — one
//! on a path the code itself comments as *skipped once the invite resolves*. Widening would
//! make both pay N filesystem stats to learn a number. The N+1 lesson generalizes to *don't
//! make callers pay for data they didn't ask for*, and widening here would violate it in the
//! other direction. Pinned by `listProjectsConsumers.test.ts`.
//!
//! ## Round-trip count is the design; the timing is a footnote
//!
//! **Per-row IPC round-trips: zero.** The flag half is a single read of `session-state.json`
//! for all projects (a map — see [`crate::session_state`]), so only the `.session.md` half
//! scales with N at all, at one `exists()` per project.
//!
//! ⚠️ The measured cost (~0.12 ms at 100 projects) is **not** the reason for the batch shape,
//! and must not be read as "per-row would have been fine too." The N+1 that shipped in M11.5
//! was expensive because each round-trip **re-read, re-parsed and re-sorted the whole
//! `projects.json`** — the stat was never the cost. The batch is chosen for the *count*.
//!
//! ## ⚠️ The gate is PER ARM, and one arm is deliberately UNGATED (2026-08-05)
//!
//! **This section was rewritten when arm 1 was decoupled. The previous text — "returns an
//! empty map without statting anything when it is off" — is no longer true, and a reader
//! who trusts it will "restore" an early return that suppresses a working feature.**
//!
//! | arm | reads | gated by `workflow_features_enabled`? |
//! |---|---|---|
//! | [`ACTION_CONTINUE`] | `session-state.json` → spawn argv `--continue` | **NO** |
//! | [`ACTION_RESTORE`] | `workflow-system/state/.session.md` → `/session-restore` | **YES** |
//!
//! The rule is **applicability**, not audience size — which is what
//! `gate-substrate-dependent-feature-class-behind-default-off-opt-in` actually keys on. Arm
//! 1 reads Claudesk's own store, written by Claudesk's own workspace lifecycle, and fires a
//! stock Claude Code CLI flag: nothing in it touches `~/.claude/skills/` or
//! `workflow-system/`, so it applies to **every** Claude Code user and gating it was a
//! mis-application of the prior. Arm 2 promises something about files a non-workflow user
//! does not have, which is precisely what the gate is for. Precedent: `hook_install` is
//! likewise universal and keeps running with the gate OFF.
//!
//! **The OFF path still does ZERO project-dir IO** — the property the old early return
//! bought. It is now enforced at the point of use: `has_session_md` sits behind
//! `gate_enabled && …`, so short-circuit evaluation skips the stat. See [`arm_available`]
//! and the comments in [`announce_actions`].
//!
//! The frontend seam (`useWorkflowFeaturesEnabled`) governs *rendering* with the same
//! per-arm split (`rowAffordances`), so both sides agree arm by arm rather than wholesale.
//!
//! ## ⚠️ The announcement is a PREDICTION, never the input to the action
//!
//! `.session.md` can vanish while the picker is open — `/session-restore` deletes it at its
//! own step 7, which was observed live *during WP1's probe phase*. So a row can announce
//! `/session-restore` after the pointer is already gone.
//!
//! That window is **display-only and self-correcting**, because the click path re-derives the
//! decision at click time rather than reading the rendered label. Worst case is a label that
//! promised an action and nothing firing — **never a wrong action**. A re-read on window
//! focus is explicitly DEFERRED (WP1 Verdict (b)), not overlooked: it narrows a window that
//! already cannot cause a wrong action.
//!
//! ## Where the precedence lives — deliberately NOT here
//!
//! This module returns the **resolved** action per project. The precedence rule itself
//! (the unclean flag beats `.session.md`, reversing the roadmap) lives in the frontend's
//! pure `predictAction` (`src/state/predictAction.ts`), which is what mutation-proves it.
//! A resolved payload **cannot** be mutation-tested for precedence — both inputs are already
//! collapsed into one value, so you can no longer vary them independently. WP1's Verdict (b)
//! names this explicitly: *do not let the batch command become the only place precedence is
//! expressed.*
//!
//! [`resolve`] below therefore mirrors that ordering rather than owning it, and
//! `announce_precedence_mirrors_the_frontend_decision_function` is the test that says so.

pub mod commands;

use std::collections::BTreeMap;
use std::path::Path;

use crate::config_store;
use crate::session_state;

/// The `.session.md` pointer, relative to a project root.
///
/// ⚠️ Kept in sync with `docs::STATE_DIR` + its `STATE_DOCS` entry by convention, not by a
/// shared constant: `docs` owns *discovery for display*, this owns *a presence check for a
/// decision*. They agree today and a divergence would be a real bug, so
/// `session_md_path_matches_the_docs_module_convention` asserts the string.
///
/// **Pre-migration layouts are deliberately unsupported** — `workflow-system/state/` only.
/// M11 built legacy-path tolerance and then REMOVED it by operator decision: an unmigrated
/// project shows no docs rather than a partial list, and the same rule holds here.
pub const SESSION_MD_REL: &str = "workflow-system/state/.session.md";

/// The wire vocabulary. Kebab-free, lowercase, and deliberately **not** the command text —
/// the frontend maps these to labels and actions via `predictAction`'s kinds.
///
/// `"continue"` (not `"resume"`) because Phase 1's probe established that arm 1 is a spawn
/// argv flag (`--continue`), not an injected `/resume`: a bare `/resume` opens an
/// interactive session picker rather than resuming anything.
pub const ACTION_CONTINUE: &str = "continue";
/// Arm 2 — inject `/session-restore` after the settle delay.
pub const ACTION_RESTORE: &str = "restore";

/// project path → predicted action. An **absent key means no prediction** (the "neither"
/// arm), mirroring `session-state.json`'s absent-means-clean convention rather than
/// inventing a second way to say "nothing".
pub type AnnounceMap = BTreeMap<String, String>;

/// Resolve one project's action from its two signals.
///
/// ⚠️ Mirrors `predictAction`'s ordering; it does not own it. See the module header.
fn resolve(unclean: bool, session_md_present: bool) -> Option<&'static str> {
    if unclean {
        Some(ACTION_CONTINUE)
    } else if session_md_present {
        Some(ACTION_RESTORE)
    } else {
        None
    }
}

/// Whether an arm is available given the workflow-features gate.
///
/// ⚠️ **THE GATE IS PER-ARM, NOT PER-FEATURE** (operator decision 2026-08-05). Extracted as
/// a named predicate so the asymmetry is a *stated rule* with one home, rather than an
/// `if` at each call site that a later edit can silently make symmetric again.
///
/// | arm | reads | gated? |
/// |---|---|---|
/// | [`ACTION_CONTINUE`] | `session-state.json` (Claudesk's own store) → `claude --continue` | **NO** |
/// | [`ACTION_RESTORE`] | `workflow-system/state/.session.md` → `/session-restore` | **YES** |
///
/// The discriminator is **applicability**, which is what
/// `gate-substrate-dependent-feature-class-behind-default-off-opt-in` actually keys on —
/// never audience size. Arm 1 touches nothing outside Claudesk: the flag is written by
/// Claudesk's own workspace lifecycle (M12 WP2) and `--continue` is a stock Claude Code CLI
/// flag. Every Claude Code user can use it, so gating it was a mis-application of the prior.
/// Arm 2 promises something about `workflow-system/` files a non-workflow user does not
/// have, which is exactly what the gate exists to hide.
fn arm_available(action: &'static str, gate_enabled: bool) -> bool {
    match action {
        // Universal — same posture as `hook_install`, which runs with the gate OFF because
        // it serves any Claude Code user.
        ACTION_CONTINUE => true,
        ACTION_RESTORE => gate_enabled,
        // A future third arm must make this decision deliberately rather than inherit
        // whichever default a wildcard happened to pick. Gating is the safe direction: it
        // fails toward "no promise about files the user may not have."
        _ => gate_enabled,
    }
}

/// Whether `project_root` has a `.session.md` handoff pointer.
///
/// A bare existence check: this decides whether to *offer* a restore, and reading or
/// parsing the pointer here would duplicate what `/session-restore` itself does.
fn has_session_md(project_root: &Path) -> bool {
    project_root.join(SESSION_MD_REL).is_file()
}

/// Build the announce map for every known project.
///
/// `gate_enabled` is passed in rather than read here so the decision is testable without a
/// settings file; [`commands::picker_announce_actions`] supplies it from
/// `read_workflow_features_enabled`.
///
/// ⚠️ **The OFF gate suppresses only the `.session.md` arm — it does NOT empty the map.**
/// The unclean-flag (`--continue`) arm is **ungated**, because it reads Claudesk's own store
/// and serves every Claude Code user; only the `/session-restore` arm reads
/// `workflow-system/` and is gated. So an OFF gate returns *fewer* entries, not zero.
///
/// What survives from the pre-2026-08-05 whole-feature gate is the property it existed to
/// guarantee: **an OFF gate does no project-dir IO** — now enforced at the point of use
/// (see the `&&` in the body) rather than by an early return.
///
/// This comment previously claimed the early-return behavior and contradicted the code four
/// lines below it, which states the opposite in capitals.
/// (`SURFACE-2026-08-05-QUALITY-WP3-STALE-WHOLE-FEATURE-GATE-DOCS`.)
///
/// Every degraded read (unreadable `projects.json`, missing `session-state.json`) yields
/// *fewer* predictions rather than an error: the failure direction is "no auto-fire", which
/// costs a click, versus a spurious fire that acts on the user's session unasked.
pub fn announce_actions(data_dir: &Path, gate_enabled: bool) -> AnnounceMap {
    // ⚠️ NO EARLY RETURN ON `!gate_enabled` — deliberately removed 2026-08-05, and this is
    // the single most likely thing here to be "fixed" back. The unclean-flag arm is
    // UNGATED (see [`arm_available`]), so returning early would suppress an arm that is
    // supposed to work for every Claude Code user.
    //
    // What survives from the early-return version is the property it existed to guarantee:
    // **an OFF gate does no project-dir IO.** That is now enforced at the point of use
    // rather than at the top — `has_session_md` sits behind a `&&` whose left side is the
    // gate, so Rust's short-circuit evaluation is what skips the stat.
    let flags = session_state::read(data_dir);
    let projects = config_store::read_projects(data_dir).unwrap_or_default();

    let mut out = AnnounceMap::new();
    for project in projects {
        let path_str = project.path.to_string_lossy().to_string();
        // ⚠️ The flag lookup MUST go through the canonical key form. `session_state`'s
        // `is_unclean_on_disk` re-reads the file per call, so this uses the map-level
        // reader with the same `key_for` canonicalization applied inside.
        let unclean = session_state::is_unclean_keyed(&flags, &path_str);
        // ⚠️ THE STAT IS SKIPPED AS A *CONSEQUENCE* OF THE ARM BEING UNAVAILABLE — not by a
        // second, independent gate check. That distinction was found by mutation testing
        // and it matters:
        //
        // The first version read `let session_md = gate_enabled && has_session_md(...)`,
        // with `arm_available` applied afterwards. Both controls were correct, and
        // *because* both were correct, `arm_available`'s `ACTION_RESTORE => gate_enabled`
        // branch became **unreachable in production**: with the gate off, `session_md` was
        // already false, so `resolve` never returned `ACTION_RESTORE`. Mutating that branch
        // to `true` left the suite 19/19 GREEN — the suite could not tell "decoupled" from
        // "gate deleted", which is precisely the property this phase exists to establish.
        //
        // That is the redundant-controls masking pattern, now hit for the THIRD time in
        // this repo (M11's rehype-raw/rehype-sanitize; Phase 1's autocomplete veto masking
        // the marker regression). The fix is structural rather than another assertion:
        // ONE control decides, and the IO saving falls out of it. `arm_available` is that
        // control, so its branches are now genuinely load-bearing.
        let session_md =
            arm_available(ACTION_RESTORE, gate_enabled) && has_session_md(&project.path);
        if let Some(action) = resolve(unclean, session_md) {
            // Still checked after resolution — `resolve` answers *which* arm the signals
            // select, `arm_available` answers *whether that arm may be shown*. Keeping them
            // separate is what stops the gate leaking into the precedence rule, which lives
            // in the frontend's `predictAction` and is mutation-proven there.
            //
            // For the RESTORE arm this is now belt-and-braces with the line above (its
            // signal cannot be true when the arm is unavailable). For CONTINUE it is the
            // only check, since that arm's signal is read unconditionally.
            if arm_available(action, gate_enabled) {
                out.insert(path_str, action.to_string());
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    // M13 WP3 — the recycle round-trip test parses the wire string the frontend sends.
    use crate::session_state::CleanExitRoute;
    use std::fs;
    use tempfile::TempDir;

    /// A data dir holding `projects.json` for the given roots.
    fn data_dir_with(projects: &[&Path]) -> TempDir {
        let dir = TempDir::new().unwrap();
        for (i, p) in projects.iter().enumerate() {
            // `now_ms` only drives recency ordering, which this module does not read;
            // distinct values keep the records distinguishable if a future test cares.
            config_store::add_or_touch(dir.path(), p.to_path_buf(), 1_000 + i as i64).unwrap();
        }
        dir
    }

    fn project_with_session_md() -> TempDir {
        let d = TempDir::new().unwrap();
        let f = d.path().join(SESSION_MD_REL);
        fs::create_dir_all(f.parent().unwrap()).unwrap();
        fs::write(&f, "---\nworkflow: feature\n---\n").unwrap();
        d
    }

    // ── The gate ─────────────────────────────────────────────────────────────────

    #[test]
    fn gate_off_suppresses_the_restore_arm() {
        // ⚠️ RENAMED + message corrected at Phase 3.5 (2026-08-05). This test PASSED
        // unchanged through the decoupling, which made it the dangerous one: its old name
        // (`gate_off_returns_an_empty_map`) and old message ("gate OFF must announce
        // nothing, even for a project that would predict") assert a **whole-feature** gate
        // that no longer exists. The assertion is sound only because this fixture carries
        // ONLY `.session.md` — the arm that is still gated.
        //
        // A green test whose name overstates its scope is how a future reader concludes the
        // feature is fully gated and "restores" the early return. Same failure shape as the
        // three CSS comments that outlived their truth in P3.9.
        let proj = project_with_session_md();
        let data = data_dir_with(&[proj.path()]);
        assert!(
            announce_actions(data.path(), false).is_empty(),
            "gate OFF must suppress the RESTORE arm (this project has only .session.md); \
             the CONTINUE arm is deliberately ungated — see arm_available"
        );
    }

    #[test]
    fn a_corrupt_project_store_yields_no_predictions_with_the_gate_off() {
        // ⚠️ RENAMED + rewritten at Phase 3.5. Its old name was
        // `gate_off_does_not_stat_project_dirs` and its comment claimed "the OFF path must
        // return before touching projects.json at all" — which is now **FALSE**: the OFF
        // path DOES read the project list, because the ungated CONTINUE arm needs it.
        //
        // It kept passing anyway, for the wrong reason: a corrupt store degrades to zero
        // projects, so the map is empty either way. That is the third green-but-misleading
        // test this phase surfaced, and the pattern is worth naming — **a test whose
        // assertion survives a design change is not thereby validating the new design.**
        // Only its name and rationale had to change; what it genuinely checks is the
        // degraded-read direction.
        let data = TempDir::new().unwrap();
        fs::write(data.path().join("projects.json"), b"{ not json").unwrap();
        assert!(
            announce_actions(data.path(), false).is_empty(),
            "a corrupt store must fail toward 'no auto-fire' on the OFF path too"
        );
    }

    #[test]
    fn gate_off_keeps_the_continue_arm_and_drops_the_restore_arm() {
        // ⚠️ THE PHASE 3.5 CONTRACT, and both halves are asserted in ONE test on purpose.
        //
        // Split across two tests, a regression that re-gates EVERYTHING would fail only the
        // first, and a regression that un-gates everything only the second — each failure
        // readable as "one test is wrong" rather than "the split is gone". Together in one
        // test, the pair states the *asymmetry*, which is the actual property. This is the
        // same lesson as P3.9's mutation matrix, where two properties sharing one assertion
        // hid which control was holding — here the property IS the relationship, so it
        // belongs in one assertion.
        let flagged = TempDir::new().unwrap(); // unclean flag, no .session.md
        let pointered = project_with_session_md(); // .session.md, no flag
        let data = data_dir_with(&[flagged.path(), pointered.path()]);
        session_state::set_and_persist(data.path(), &flagged.path().to_string_lossy());

        // Setup check FIRST: with the gate ON both arms fire, so proving the OFF behavior
        // below is not vacuous (a broken fixture would otherwise "pass" by predicting
        // nothing at all).
        assert_eq!(
            announce_actions(data.path(), true).len(),
            2,
            "setup: both projects must predict with the gate ON, else the OFF assertions \
             below prove nothing"
        );

        let off = announce_actions(data.path(), false);
        assert_eq!(
            off.get(&flagged.path().to_string_lossy().to_string())
                .map(String::as_str),
            Some(ACTION_CONTINUE),
            "the unclean-flag arm is UNGATED (operator decision 2026-08-05): it reads \
             Claudesk's own session-state.json and fires the stock `claude --continue` \
             flag, so it applies to every Claude Code user"
        );
        assert!(
            !off.contains_key(&pointered.path().to_string_lossy().to_string()),
            "the .session.md arm STAYS gated — it promises something about \
             workflow-system/ files a non-workflow user does not have"
        );
        assert_eq!(
            off.len(),
            1,
            "exactly one arm survives an OFF gate: {off:?}"
        );
    }

    #[test]
    fn gate_off_still_does_no_project_dir_io_for_the_gated_arm() {
        // The property the removed early return used to buy, re-established at the point
        // of use. It is now OBSERVABLE rather than merely reasoned about, which the old
        // version conceded it could not manage ("a panicking filesystem is not available
        // here" — a comment explaining why a test cannot check the thing is a tell that it
        // is not checking the thing).
        //
        // The observable: a project root that does NOT EXIST. With the gate ON,
        // `has_session_md` joins the pointer path onto it and stats — returning false, so
        // the project is absent from the map. With the gate OFF the stat never happens at
        // all. Both yield "absent", so absence alone cannot distinguish them...
        //
        // ...which is why the discriminator is a project that is BOTH flagged AND
        // nonexistent. Gate OFF must still announce `continue` for it — proving the flag
        // arm ran WITHOUT any filesystem access to the project directory, since there is no
        // directory to access. A gate that stats first would behave identically here, but a
        // flag arm that depended on the project dir existing would not.
        let gone = std::path::Path::new("/nonexistent/gate-off/project");
        let data = data_dir_with(&[gone]);
        session_state::set_and_persist(data.path(), &gone.to_string_lossy());

        let off = announce_actions(data.path(), false);
        assert_eq!(
            off.get(&gone.to_string_lossy().to_string())
                .map(String::as_str),
            Some(ACTION_CONTINUE),
            "the flag arm must resolve from session-state.json alone — no project-dir IO"
        );
    }

    #[test]
    fn the_gate_guards_every_session_md_stat() {
        // ⚠️ REWRITTEN at Phase 3.5, NOT deleted. Its predecessor
        // (`gate_check_is_the_first_statement_in_announce_actions`) asserted that
        // `if !gate_enabled` preceded both reads — a shape the per-arm gate deliberately
        // removed, since an early return would suppress the ungated CONTINUE arm.
        //
        // The PROPERTY it guarded survives intact: **an OFF gate does no project-dir IO.**
        // Deleting the test along with the obsolete shape would have dropped the only thing
        // pinning that, because it is not behaviorally observable in-process — a failed read
        // degrades silently by design, so both paths look alike from the outside.
        //
        // What changed is where the property lives: not "the gate is first" but "the gate
        // short-circuits every stat". Each `has_session_md(` call must be preceded on its
        // own line by `gate_enabled &&`, so Rust never evaluates it with the gate off.
        //
        // CLAUDE.md is explicit that source-position guards verify STRUCTURE and never
        // RUNTIME, and this repo has shipped one that passed while the behavior was broken.
        // Used here narrowly and honestly: it is a tripwire against the short-circuit being
        // refactored into an eager `let`, not a proof. The real instrument would be an
        // injected filesystem trait — a larger change than this property warrants.
        let src = include_str!("mod.rs");
        let body = src
            .split("pub fn announce_actions(")
            .nth(1)
            .expect("announce_actions must exist");
        // Stop at the end of the function so the test module's own text cannot satisfy the
        // assertions on the production code's behalf — the comment-satisfies-the-guard hole
        // (`[[raw-guard-identifier-satisfied-by-own-comments]]`), which bit this very
        // feature once already.
        let body = &body[..body.find("\n}\n").expect("function must terminate")];
        let code: String = body
            .lines()
            .filter(|l| !l.trim_start().starts_with("//"))
            .collect::<Vec<_>>()
            .join("\n");

        assert!(
            !code.contains("if !gate_enabled"),
            "the whole-feature early return is GONE by design — restoring it would suppress \
             the ungated CONTINUE arm (Phase 3.5). If you are re-adding it, read arm_available."
        );
        // ⚠️ The guarded spelling is `arm_available(...) && has_session_md(...)`, NOT a bare
        // `gate_enabled &&`. Mutation testing showed why: a second, independent gate check
        // here made `arm_available`'s RESTORE branch unreachable in production, so mutating
        // that branch left the suite green. Routing the short-circuit THROUGH
        // `arm_available` keeps one decision with one home — and keeps its branches
        // load-bearing.
        let stats: Vec<&str> = code
            .lines()
            .filter(|l| l.contains("has_session_md("))
            // The definition line is not a call site.
            .filter(|l| !l.contains("fn has_session_md"))
            .collect();
        assert!(
            !stats.is_empty(),
            "non-vacuity: the stat call must exist to be guarded"
        );
        for line in stats {
            assert!(
                line.contains("arm_available("),
                "every has_session_md call must short-circuit behind arm_available(), or \
                 an OFF gate stats N project dirs AND arm_available's RESTORE branch goes \
                 unreachable (mutation-proven 2026-08-05); offending line: {line}"
            );
        }
    }

    #[test]
    fn gate_on_with_no_projects_is_empty_not_an_error() {
        let data = TempDir::new().unwrap();
        assert!(announce_actions(data.path(), true).is_empty());
    }

    // ── The three arms, end to end through the real store ────────────────────────

    #[test]
    fn a_project_with_only_session_md_announces_restore() {
        let proj = project_with_session_md();
        let data = data_dir_with(&[proj.path()]);
        let map = announce_actions(data.path(), true);
        assert_eq!(
            map.get(&proj.path().to_string_lossy().to_string())
                .map(String::as_str),
            Some(ACTION_RESTORE)
        );
    }

    /// M13 WP3 Phase 4 verify-codify — the RECYCLE ROUND TRIP, end to end in one test.
    ///
    /// ⚠️ This is the composition Phase 4 verified LIVE and that nothing else pins. The two
    /// halves each had coverage — `from_wire` round-trips every route
    /// (`session_state::commands`), and a flagged project announces `continue` (the test
    /// below) — but **no test joined them**, so a break anywhere in the chain
    /// *wire name → parse → clear → announce goes quiet* would have passed everything.
    ///
    /// That chain is exactly what makes Recycle safe to fire: without the clear, every
    /// recycle leaves a false unclean mark and the NEXT open fires a spurious `--continue`,
    /// resuming a conversation the operator deliberately handed off.
    ///
    /// ⚠️ Both directions are asserted. The positive alone would pass on a `clear_and_persist`
    /// that wiped the whole map, so the test also pins that a SIBLING project's flag survives —
    /// the "targeted, not a wipe" property observed live (scratch-c and verify-041 were
    /// untouched while scratch-a cleared).
    #[test]
    fn the_recycle_session_route_clears_the_flag_and_silences_the_continue_announcement() {
        let recycled = TempDir::new().unwrap(); // no .session.md — the continue arm only
        let sibling = TempDir::new().unwrap(); // must be UNAFFECTED by the clear
        let data = data_dir_with(&[recycled.path(), sibling.path()]);
        let recycled_key = recycled.path().to_string_lossy().to_string();
        let sibling_key = sibling.path().to_string_lossy().to_string();

        session_state::set_and_persist(data.path(), &recycled_key);
        session_state::set_and_persist(data.path(), &sibling_key);

        // Precondition — without this the "silenced" assertion below could pass vacuously
        // (a project that never announced cannot stop announcing).
        let before = announce_actions(data.path(), true);
        assert_eq!(
            before.get(&recycled_key).map(String::as_str),
            Some(ACTION_CONTINUE),
            "precondition: a flagged project must announce `continue`, or the post-clear \
             assertion proves nothing"
        );

        // The route arrives from the frontend as a WIRE STRING; parse it the way the command
        // does rather than using the enum directly, so a wire-name drift fails here too.
        let route = CleanExitRoute::from_wire("recycle-session")
            .expect("`recycle-session` must parse — it is the string the frontend sends");
        assert_eq!(route, CleanExitRoute::RecycleSession);
        assert!(session_state::clear_and_persist(
            data.path(),
            &recycled_key
        ));

        let after = announce_actions(data.path(), true);
        assert_eq!(
            after.get(&recycled_key),
            None,
            "after a recycle-session clear the project must announce NOTHING — an announced \
             `continue` here is a spurious --continue on the next open, resuming a \
             conversation the operator deliberately handed off"
        );
        assert_eq!(
            after.get(&sibling_key).map(String::as_str),
            Some(ACTION_CONTINUE),
            "the clear must be TARGETED: a sibling project's flag must survive. Without this \
             the test above would also pass on a clear that wiped the entire map"
        );
    }

    #[test]
    fn a_project_with_only_the_unclean_flag_announces_continue() {
        let proj = TempDir::new().unwrap(); // no .session.md
        let data = data_dir_with(&[proj.path()]);
        session_state::set_and_persist(data.path(), &proj.path().to_string_lossy());

        let map = announce_actions(data.path(), true);
        assert_eq!(
            map.get(&proj.path().to_string_lossy().to_string())
                .map(String::as_str),
            Some(ACTION_CONTINUE),
            "the flag arm is `continue` (spawn argv), NOT an injected /resume — a bare \
             /resume opens an interactive picker (Phase 1 verdict 2)"
        );
    }

    #[test]
    fn a_project_with_neither_signal_is_absent_from_the_map() {
        let proj = TempDir::new().unwrap();
        let data = data_dir_with(&[proj.path()]);
        let map = announce_actions(data.path(), true);
        assert!(
            !map.contains_key(&proj.path().to_string_lossy().to_string()),
            "absent key means 'no prediction' — do not invent a third sentinel value"
        );
    }

    // ── Precedence: mirrored, and asserted to stay mirrored ──────────────────────

    #[test]
    fn announce_precedence_mirrors_the_frontend_decision_function() {
        // BOTH signals present → the unclean flag wins, matching `predictAction`.
        //
        // ⚠️ This test guards a MIRROR, not the rule itself. The rule's home is
        // `src/state/predictAction.ts`, where it is mutation-proven against inputs that can
        // still be varied independently. Here both inputs are already collapsed into one
        // string, which is exactly why WP1's Verdict (b) forbade making this the only home.
        let proj = project_with_session_md();
        let data = data_dir_with(&[proj.path()]);
        session_state::set_and_persist(data.path(), &proj.path().to_string_lossy());

        let map = announce_actions(data.path(), true);
        assert_eq!(
            map.get(&proj.path().to_string_lossy().to_string())
                .map(String::as_str),
            Some(ACTION_CONTINUE),
            "unclean flag must beat .session.md — reversing this reverts to the roadmap's \
             wrong ordering (see predictAction.ts for why the flag is the explicit signal)"
        );
    }

    #[test]
    fn resolve_covers_all_four_input_combinations() {
        assert_eq!(resolve(true, true), Some(ACTION_CONTINUE));
        assert_eq!(resolve(true, false), Some(ACTION_CONTINUE));
        assert_eq!(resolve(false, true), Some(ACTION_RESTORE));
        assert_eq!(resolve(false, false), None);
    }

    // ── Multi-project: the batch really is per-project ───────────────────────────

    #[test]
    fn each_project_gets_its_own_independent_prediction() {
        let restore_proj = project_with_session_md();
        let continue_proj = TempDir::new().unwrap();
        let silent_proj = TempDir::new().unwrap();
        let data = data_dir_with(&[
            restore_proj.path(),
            continue_proj.path(),
            silent_proj.path(),
        ]);
        session_state::set_and_persist(data.path(), &continue_proj.path().to_string_lossy());

        let map = announce_actions(data.path(), true);
        assert_eq!(
            map.len(),
            2,
            "the no-signal project must be absent: {map:?}"
        );
        assert_eq!(
            map.get(&restore_proj.path().to_string_lossy().to_string())
                .map(String::as_str),
            Some(ACTION_RESTORE)
        );
        assert_eq!(
            map.get(&continue_proj.path().to_string_lossy().to_string())
                .map(String::as_str),
            Some(ACTION_CONTINUE)
        );
    }

    // ── Degraded reads fail toward "no auto-fire" ────────────────────────────────

    #[test]
    fn an_unreadable_projects_file_yields_no_predictions_rather_than_an_error() {
        let data = TempDir::new().unwrap();
        fs::write(data.path().join("projects.json"), b"{ not json").unwrap();
        assert!(
            announce_actions(data.path(), true).is_empty(),
            "a corrupt store must degrade to 'no auto-fire', the safe direction"
        );
    }

    #[test]
    fn a_project_whose_directory_is_gone_announces_nothing() {
        // `prune_missing_projects` normally removes these, but the window exists.
        let data = data_dir_with(&[Path::new("/nonexistent/gone/project")]);
        let map = announce_actions(data.path(), true);
        assert!(
            map.is_empty(),
            "a vanished project dir has no .session.md to find"
        );
    }

    // ── The PRODUCER → CONSUMER round trip (verify-codify, Phase 3.5) ────────────
    //
    // ⚠️ WHY THIS EXISTS, and it is not redundancy with the tests above.
    //
    // Every other test in this module sets up flag state DIRECTLY and asks what the
    // announcement is. That verifies the CONSUMER only. Phase 3.5's live verify-self did the
    // same thing — it staged the flag straight into `session-state.json` — and the
    // consequence was that a real defect (the ⏸ that produces the flag was still gated, so
    // a non-workflow user could consume a flag they had no way to produce) survived a 6/6
    // PASS and was caught by the OPERATOR at verify-human.
    //
    // The durable rule: *when a feature is a producer/consumer pair, a fixture that injects
    // the intermediate state verifies the consumer only — and will report the pair as
    // working while the producer is unreachable.*
    //
    // So these drive the REAL lifecycle functions (`set_and_persist` / `clear_and_persist`,
    // what the spawn path and `session_state_mark_clean` actually call) through to
    // `announce_actions`, with the gate OFF. No hand-built map, no injected state.

    #[test]
    fn the_unclean_route_makes_a_project_announce_continue_with_the_gate_off() {
        // The ⏸ path, end to end: the flag is persisted by the real writer, and the
        // announcement is then produced by the real reader — with the gate OFF, which is the
        // configuration the whole of Phase 3.5 is about.
        let proj = TempDir::new().unwrap();
        let data = data_dir_with(&[proj.path()]);
        let key = proj.path().to_string_lossy().to_string();

        // Non-vacuity: nothing announces before the producer runs.
        assert!(
            announce_actions(data.path(), false).is_empty(),
            "setup: a clean project must announce nothing, or the assertion below is vacuous"
        );

        // PRODUCE via the real function the spawn path calls.
        session_state::set_and_persist(data.path(), &key);

        // CONSUME via the real reader.
        assert_eq!(
            announce_actions(data.path(), false)
                .get(&key)
                .map(String::as_str),
            Some(ACTION_CONTINUE),
            "an unclean project must announce `continue` with the gate OFF — this is the \
             round trip whose absence hid the gated-⏸ defect through a 6/6 verify-self"
        );
    }

    #[test]
    fn the_clean_exit_route_silences_the_announcement_with_the_gate_off() {
        // The × path — the other half of the pair. Without this, a regression that made
        // `clear_and_persist` a no-op would leave every project permanently announcing, and
        // the sibling test above would still pass.
        let proj = TempDir::new().unwrap();
        let data = data_dir_with(&[proj.path()]);
        let key = proj.path().to_string_lossy().to_string();

        session_state::set_and_persist(data.path(), &key);
        assert!(
            !announce_actions(data.path(), false).is_empty(),
            "setup: the project must be announcing before the clean exit clears it"
        );

        session_state::clear_and_persist(data.path(), &key);

        assert!(
            announce_actions(data.path(), false).is_empty(),
            "a clean exit must silence the announcement — × clears, ⏸ declines to clear"
        );
    }

    #[test]
    fn every_clean_exit_route_is_reachable_and_clears_the_flag() {
        // ⚠️ WP2's lesson, applied to the routes: `CleanExitRoute::CcExitCommand` was declared
        // in the Rust enum, the TS union, and round-tripped in two test suites while NOTHING
        // CALLED IT — and the exhaustiveness test's green read as coverage. So this asserts
        // each route's wire name round-trips AND that clearing actually changes observable
        // announce state, rather than only that the set is complete.
        //
        // ⚠️ THE COUNT IS ASSERTED AS A VALUE, and mutation testing is why. The first version
        // of this test only iterated `ALL` — so deleting a member from `ALL` gave it fewer
        // iterations and it passed 23/23. **It could not detect a MISSING route**, which is
        // precisely the WP2 shape it was written to guard against. Iterating a set can never
        // prove the set is complete; only pinning its size can. Three routes shipped in WP2
        // (filmstrip ×, app quit, M13 Recycle) after a fourth was removed as a dead variant —
        // if that number changes, this test must be updated deliberately.
        assert_eq!(
            session_state::CleanExitRoute::ALL.len(),
            3,
            "WP2 shipped exactly THREE clean-exit routes. A change here is a product decision \
             (see SURFACE-2026-08-03-TYPED-EXIT-LEAVES-THE-UNCLEAN-FLAG-SET), not a refactor."
        );
        for route in session_state::CleanExitRoute::ALL {
            let wire = route.as_wire();
            assert_eq!(
                session_state::CleanExitRoute::from_wire(wire),
                Some(route),
                "{wire} must round-trip"
            );

            let proj = TempDir::new().unwrap();
            let data = data_dir_with(&[proj.path()]);
            let key = proj.path().to_string_lossy().to_string();
            session_state::set_and_persist(data.path(), &key);
            assert!(
                !announce_actions(data.path(), false).is_empty(),
                "{wire}: setup"
            );
            session_state::clear_and_persist(data.path(), &key);
            assert!(
                announce_actions(data.path(), false).is_empty(),
                "{wire}: clearing must silence the announcement"
            );
        }
    }

    #[test]
    fn the_ungated_arm_survives_the_round_trip_while_the_gated_arm_does_not() {
        // The asymmetry, asserted after a REAL produce rather than an injected map — the
        // single property Phase 3.5 exists to establish, exercised through the producer.
        let flagged = TempDir::new().unwrap();
        let pointered = project_with_session_md();
        let data = data_dir_with(&[flagged.path(), pointered.path()]);
        session_state::set_and_persist(data.path(), &flagged.path().to_string_lossy());

        let off = announce_actions(data.path(), false);
        assert_eq!(
            off.get(&flagged.path().to_string_lossy().to_string())
                .map(String::as_str),
            Some(ACTION_CONTINUE),
            "the produced flag announces with the gate OFF"
        );
        assert!(
            !off.contains_key(&pointered.path().to_string_lossy().to_string()),
            "the .session.md arm stays gated — decoupled, not ungated"
        );
    }

    // ── The path convention ─────────────────────────────────────────────────────

    // ── The wire shape (P2.4) ───────────────────────────────────────────────────

    #[test]
    fn the_wire_shape_is_a_flat_path_to_string_object() {
        // ⚠️ Tauri does NOT camelCase return values, and the frontend indexes this map by
        // raw project path. A change to `AnnounceMap`'s type (a struct wrapper, a Vec of
        // pairs, an enum with a tag) would compile fine here and silently break every
        // lookup on the other side of the IPC boundary — so the serialized form is pinned
        // as a literal, the same discipline `DocEntry` uses.
        let mut map = AnnounceMap::new();
        map.insert("/Users/x/foo".to_string(), ACTION_CONTINUE.to_string());
        map.insert("/Users/x/bar".to_string(), ACTION_RESTORE.to_string());

        let json = serde_json::to_string(&map).unwrap();
        // BTreeMap → keys serialize sorted, which is also why the type is a BTreeMap.
        assert_eq!(
            json, r#"{"/Users/x/bar":"restore","/Users/x/foo":"continue"}"#,
            "the announce payload must stay a flat path→action object"
        );
    }

    #[test]
    fn an_empty_map_serializes_to_an_empty_object_not_null() {
        // The OFF-gate and no-prediction cases both return this. `null` would force the
        // frontend to handle a second "nothing" representation.
        assert_eq!(serde_json::to_string(&AnnounceMap::new()).unwrap(), "{}");
    }

    #[test]
    fn the_action_vocabulary_is_exactly_continue_and_restore() {
        // Guards against a third value appearing without the frontend's `predictAction`
        // kinds learning about it. If a third arm is ever added, this test is the place
        // that makes you go update the other side.
        assert_eq!(ACTION_CONTINUE, "continue");
        assert_eq!(ACTION_RESTORE, "restore");
        // And neither is the raw flag or a slash command — the wire vocabulary is
        // deliberately neither of those (see the constants' docs).
        for v in [ACTION_CONTINUE, ACTION_RESTORE] {
            assert!(!v.starts_with('-'), "{v} must not be a raw CLI flag");
            assert!(!v.starts_with('/'), "{v} must not be a slash command");
        }
    }

    #[test]
    fn session_md_path_matches_the_docs_module_convention() {
        // `docs` composes this from `STATE_DIR` + a `STATE_DOCS` entry for display; this
        // module joins it directly for a decision. They must not drift.
        assert_eq!(SESSION_MD_REL, "workflow-system/state/.session.md");
    }

    #[test]
    fn a_session_md_directory_is_not_mistaken_for_the_pointer() {
        // `is_file()` not `exists()` — a directory at that path is not a handoff pointer.
        let d = TempDir::new().unwrap();
        fs::create_dir_all(d.path().join(SESSION_MD_REL)).unwrap();
        assert!(!has_session_md(d.path()));
    }
}
