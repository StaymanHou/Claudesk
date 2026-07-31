//! Shared source-guard machinery (M10.9 WP3.5b, absorbing
//! `SURFACE-2026-07-29-QUALITY-WP3.5A-SOURCE-GUARD-CONSOLIDATION`).
//!
//! **Test-only by construction** — declared `#[cfg(test)]` in `mod.rs`, so a production
//! `use` fails to compile, same as `sandbox.rs`.
//!
//! ## Why this exists
//! WP3.5a shipped SIX source-text guards across four files, each re-implementing the same
//! "production slice + comment strip" extractor by copy-paste. The extractor is the shared
//! dependency of every guard, so a bug in it blinds them all at once — and that bug class is
//! real: the `#[cfg(test)]`-split form silently truncated `mod.rs`'s production slice seven
//! lines in (`SURFACE-2026-07-29-CFG-TEST-SPLIT-BLINDS-SOURCE-GUARDS`). One extractor means
//! one place for that risk, one set of meta-tests over it.
//!
//! ## What lives here
//! - [`production_code`]: the extractor every per-module guard consumes.
//! - The **module-level delete guard** (`only_the_sanctioned_paths_may_call_deletion_apis`):
//!   WP3.5a's three per-module "ships no delete" guards, collapsed and re-scoped now that a
//!   deleting WP is in flight. The rule is no longer "no deletes exist" (that expires the
//!   moment WP3.5b Phase 2 lands) but **"deletion APIs appear only where the allowlist
//!   says, in the counts it says"** — and the allowlist is a table a Phase-2 edit must
//!   consciously extend, the same forced-decision shape as `terminal.rs`'s per-arm match.
//!
//! ## What deliberately does NOT live here
//! The per-module ambient-root guards stay in their own modules: each one pins a property
//! *of that file* ("this module takes roots as parameters"), and keeping the assertion next
//! to the code it constrains is what keeps it read. They all consume [`production_code`].
//!
//! ## The honest limits (unchanged from WP3.5a, now written once)
//! Source scans are TRIPWIRES, not proofs. A module alias (`use std::fs as f;`) walks past
//! a token scan; behavior is secured by behavioral tests against the sandbox, and every
//! safety-critical guard must additionally be mutation-proven (break the production code,
//! watch the guard fail, restore). Comment-stripping below is line-based: full-line `//`
//! comments, doc comments, and `/* … */` blocks are removed; a trailing comment sharing a
//! line with code is NOT — do not park prose about forbidden tokens at the end of a code
//! line.

/// The production slice of a source file: everything before its test module, with comments
/// stripped.
///
/// **Splits on `mod tests`, never on `#[cfg(test)]`** — the attribute legitimately appears
/// on non-test items (the `sandbox`/`source_guard` module declarations in `mod.rs`), and
/// splitting on it truncated a production slice to seven lines while both guards over it
/// stayed green. The failure is invisible when it happens, so no caller gets to choose the
/// attribute form.
pub fn production_code(src: &str) -> String {
    let production = src.split("mod tests").next().unwrap_or(src);
    strip_comments(production)
}

/// Remove comment lines: full-line `//` / `///` / `//!` comments, `* …` doc-block
/// continuation lines, and `/* … */` blocks (including multi-line ones).
///
/// Multi-line block tracking exists because WP3's guards matched their own prose twice —
/// once via a JSX comment's continuation lines, once via a doc comment naming the very call
/// a mutation had deleted ("a guard reading raw source matches its own prose").
fn strip_comments(src: &str) -> String {
    let mut kept: Vec<&str> = Vec::new();
    let mut in_block = false;
    for line in src.lines() {
        let t = line.trim_start();
        if in_block {
            if t.contains("*/") {
                in_block = false;
            }
            continue;
        }
        if t.starts_with("/*") {
            if !t.contains("*/") {
                in_block = true;
            }
            continue;
        }
        if t.starts_with("//") || t.starts_with('*') {
            continue;
        }
        kept.push(line);
    }
    kept.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Every production file of this module, with the tail anchor its extraction must
    /// reach. The anchors are the LAST production item per file because truncation always
    /// eats the tail — an extractor bug that cuts a file short fails here loudly instead of
    /// silently blinding that file's guards.
    ///
    /// `sandbox.rs` and `source_guard.rs` are deliberately absent: both are
    /// `#[cfg(test)]`-only (a production `use` fails to compile), so they are not
    /// production surfaces — and their meta-tests legitimately mention deletion APIs.
    const MODULE_FILES: &[(&str, &str, &str)] = &[
        ("mod.rs", include_str!("mod.rs"), "fn resolve_state"),
        (
            "provenance.rs",
            include_str!("provenance.rs"),
            "fn delete_record",
        ),
        (
            "runner.rs",
            include_str!("runner.rs"),
            "fn run_uninstall_guarded",
        ),
        (
            "terminal.rs",
            include_str!("terminal.rs"),
            "fn resolve_uninstall_terminal_state",
        ),
        ("commands.rs", include_str!("commands.rs"), "fn now_rfc3339"),
        ("guard.rs", include_str!("guard.rs"), "fn refuse_guard"),
    ];

    #[test]
    fn the_extractor_reaches_every_files_tail() {
        // The meta-test that made the original truncation bug visible at all, now over
        // every file at once. A guard with only negative assertions ships broken and
        // silent; this is the positive half they all share.
        for (name, src, tail_anchor) in MODULE_FILES {
            let code = production_code(src);
            assert!(
                code.contains(tail_anchor),
                "{name}: the extractor truncated before `{tail_anchor}` — every source \
                 guard over this file is blind to whatever it cut"
            );
        }
    }

    #[test]
    fn the_extractor_excludes_every_test_module() {
        for (name, src, _) in MODULE_FILES {
            let code = production_code(src);
            assert!(
                !code.contains("#[test]"),
                "{name}: the production slice must not include test code, or guards would \
                 match their own test fixtures"
            );
        }
    }

    #[test]
    fn only_the_sanctioned_paths_may_call_deletion_apis() {
        // ═══════════════════════════════════════════════════════════════════════════
        // THE module-level delete guard — the consolidated successor of WP3.5a's three
        // per-module "ships no delete" guards, re-scoped for a WP that ships a delete.
        //
        // The allowlist is (file, token) → permitted count. Phase 2 sanctioned exactly
        // TWO deletion calls, and nothing else:
        //   - runner.rs: ONE `remove_dir` (the `remove_dir_all` on the guard-approved
        //     clone dir inside `run_uninstall` — its target is an `UninstallTarget`,
        //     only constructible through `refuse_guard`, so "only via the guard" is
        //     enforced by the type system; this scan pins WHERE the call may sit).
        //   - provenance.rs: ONE `remove_file` (`delete_record`, sequenced LAST in the
        //     uninstall run, callable only from `run_uninstall` in production).
        // A new deleting call must extend this table in the same change that adds it —
        // a conscious, reviewable act, not a guard quietly going stale.
        // ═══════════════════════════════════════════════════════════════════════════
        const DELETION_TOKENS: &[&str] = &["remove_dir", "remove_file"];
        const ALLOWED: &[(&str, &str, usize)] = &[
            ("runner.rs", "remove_dir", 1),
            ("provenance.rs", "remove_file", 1),
        ];

        for (name, src, _) in MODULE_FILES {
            let code = production_code(src);
            for token in DELETION_TOKENS {
                let found = code.matches(token).count();
                let permitted = ALLOWED
                    .iter()
                    .find(|(f, t, _)| f == name && t == token)
                    .map(|(_, _, n)| *n)
                    .unwrap_or(0);
                assert_eq!(
                    found, permitted,
                    "{name}: found {found} `{token}` occurrence(s), {permitted} permitted. \
                     A new deleting call must be sanctioned HERE, in the same change that \
                     adds it — and it must consume a `guard::UninstallTarget` so the \
                     refuse-guard is structurally in front of it."
                );
            }
        }
    }

    #[test]
    fn strip_comments_removes_line_doc_and_block_comments() {
        let src = "\
// line comment naming remove_dir\n\
/// doc comment naming remove_dir\n\
//! module doc naming remove_dir\n\
/* single-line block naming remove_dir */\n\
/*\n\
 * multi-line block naming remove_dir\n\
 continuation line without star still inside block remove_dir\n\
*/\n\
fn real_code() {}\n";

        let stripped = strip_comments(src);

        assert!(
            !stripped.contains("remove_dir"),
            "every comment form must be stripped, got: {stripped}"
        );
        assert!(
            stripped.contains("fn real_code"),
            "code must survive the strip"
        );
    }

    #[test]
    fn strip_comments_keeps_code_after_a_block_closes() {
        let src = "/* block */\nfn after() {}\n/*\nmulti\n*/\nfn also_after() {}\n";

        let stripped = strip_comments(src);

        assert!(stripped.contains("fn after"));
        assert!(stripped.contains("fn also_after"));
    }
}
