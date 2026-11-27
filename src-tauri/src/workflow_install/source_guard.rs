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

/// Remove every comment — `//` / `///` / `//!` (full-line or trailing) and `/* … */` blocks
/// (multi-line and nested) — and keep everything else, string contents included, with every
/// newline kept so line structure survives.
///
/// A small Rust lexer, not a line filter (WP7 Phase 1,
/// `SURFACE-2026-11-20-QUALITY-DELETE-GUARD-MISSES-SHELL-SPELLINGS-AND-STAR-LINES`): the old
/// line filter dropped every line whose trimmed text started with `*`, meant for doc-block
/// continuation lines, and so also dropped a `*) rm -rf -- "$x" ;;` case arm inside a raw-string
/// shell template, before the delete scan ever saw it. Here a `*` line is dropped only when it IS
/// inside a block comment, and `//` / `/*` inside a string (a URL, a glob) start nothing.
///
/// Comment stripping exists because WP3's guards matched their own prose twice — once via a JSX
/// comment's continuation lines, once via a doc comment naming the very call a mutation had
/// deleted ("a guard reading raw source matches its own prose").
fn strip_comments(src: &str) -> String {
    #[derive(PartialEq)]
    enum St {
        Code,
        Line,
        Block(u32),
        Str,
        Raw(usize),
    }
    let b = src.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut st = St::Code;
    let mut i = 0;
    while i < b.len() {
        let c = b[i];
        let next = b.get(i + 1).copied();
        match st {
            St::Code => {
                if c == b'/' && next == Some(b'/') {
                    st = St::Line;
                    i += 2;
                    continue;
                }
                if c == b'/' && next == Some(b'*') {
                    st = St::Block(1);
                    i += 2;
                    continue;
                }
                if c == b'"' {
                    st = St::Str;
                } else if c == b'r' && {
                    let ident = |k: usize| b[k].is_ascii_alphanumeric() || b[k] == b'_';
                    i == 0 || !ident(i - 1) || (b[i - 1] == b'b' && (i == 1 || !ident(i - 2)))
                } {
                    // `r"…"` / `r#"…"#`, and `br…` (whose `b` was copied as code).
                    let hashes = b[i + 1..].iter().take_while(|&&h| h == b'#').count();
                    if b.get(i + 1 + hashes) == Some(&b'"') {
                        out.extend_from_slice(&b[i..i + 2 + hashes]);
                        i += 2 + hashes;
                        st = St::Raw(hashes);
                        continue;
                    }
                } else if c == b'\'' {
                    // A char literal (`'"'`, `'\''`) is copied whole so its quote starts no
                    // string; anything else (`'a` lifetimes) is plain code.
                    // An escape's own char (`'\''`) is skipped before looking for the close.
                    let len = if next == Some(b'\\') {
                        b.get(i + 3..)
                            .and_then(|rest| rest.iter().position(|&x| x == b'\''))
                            .map(|p| p + 4)
                    } else if b.get(i + 2) == Some(&b'\'') {
                        Some(3)
                    } else {
                        None
                    };
                    if let Some(len) = len {
                        out.extend_from_slice(&b[i..(i + len).min(b.len())]);
                        i += len;
                        continue;
                    }
                }
                out.push(c);
            }
            St::Line => {
                if c == b'\n' {
                    out.push(c);
                    st = St::Code;
                }
            }
            St::Block(depth) => {
                if c == b'/' && next == Some(b'*') {
                    st = St::Block(depth + 1);
                    i += 2;
                    continue;
                }
                if c == b'*' && next == Some(b'/') {
                    st = if depth == 1 {
                        St::Code
                    } else {
                        St::Block(depth - 1)
                    };
                    i += 2;
                    continue;
                }
                if c == b'\n' {
                    out.push(c);
                }
            }
            St::Str => {
                out.push(c);
                if c == b'\\' {
                    if let Some(n) = next {
                        out.push(n);
                    }
                    i += 2;
                    continue;
                }
                if c == b'"' {
                    st = St::Code;
                }
            }
            St::Raw(hashes) => {
                if c == b'"'
                    && b[i + 1..]
                        .iter()
                        .take(hashes)
                        .filter(|&&h| h == b'#')
                        .count()
                        == hashes
                {
                    out.extend_from_slice(&b[i..i + 1 + hashes]);
                    i += 1 + hashes;
                    st = St::Code;
                    continue;
                }
                out.push(c);
            }
        }
        i += 1;
    }
    // Comments are dropped whole and strings copied whole, so the bytes kept are UTF-8 still.
    let kept = String::from_utf8_lossy(&out).into_owned();
    // Lines left blank by a stripped comment carry no code.
    kept.lines()
        .filter(|l| !l.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

/// A kind of deletion the delete guard counts. Each is a pattern over the production slice
/// ([`production_code`]: comments gone, string contents kept, so a shell template's commands
/// are scanned).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Deletion {
    /// `std::fs::remove_dir` / `remove_dir_all`.
    RemoveDir,
    /// `std::fs::remove_file`.
    RemoveFile,
    /// A shell `rm` with a recursive flag in ANY spelling: `-r`, `-R`, `-rf`, `-fr`, `-Rf`,
    /// `-f -r`, `--recursive`.
    RmRecursive,
    /// A shell `rm` with no recursive flag (a file).
    Rm,
    /// `find … -delete`.
    FindDelete,
    /// `rmdir`.
    Rmdir,
    /// `unlink`.
    Unlink,
    /// `rm` named as a program in a string literal: `Command::new("rm")`, `"/bin/rm"`,
    /// `"/usr/bin/rm"` (WP8 P2.2, `SURFACE-2026-11-20-QUALITY-DELETE-CLASSIFIER-MISSES-COMMAND-FORMS`:
    /// the shell patterns need whitespace after `rm`, so a quoted program name counted as nothing).
    RmProgram,
    /// `git clean` (any options before the subcommand: `-C <dir>`, `-c k=v`, `--flag`), which
    /// deletes untracked files in a tree. Also the Rust `Command` form: a quoted `"clean"`
    /// argument in the same statement as a git program (`Command::new("git")` / `GIT_BIN`), the
    /// way `runner.rs` calls git.
    GitClean,
}

/// Every [`Deletion`] in `code`, with its count. ⚠️ A pattern per kind, not a token list: the
/// WP6 list (`"rm -rf"`, `"rm -r "`) passed `rm -fr`, `rm -Rf`, `rm -R`, `find -delete` and
/// `rmdir`. The kinds cover the spellings listed on [`Deletion`], not every conceivable delete.
pub fn deletions(code: &str) -> Vec<(Deletion, usize)> {
    use regex::Regex;
    // `rm`, then any flags, at least one of them recursive. `\b` keeps `rm` a word of its own
    // (`perm`, `rm_x`, `rmdir` do not match).
    let rm_recursive = Regex::new(
        r"\brm\b(?:\s+-{1,2}[A-Za-z-]+)*?\s+(?:-[A-Za-z]*[rR][A-Za-z]*\b|--recursive\b)",
    )
    .expect("pattern");
    let rm_any = Regex::new(r"\brm\b(?:\s|$)").expect("pattern");
    let count = |p: &str| Regex::new(p).expect("pattern").find_iter(code).count();
    let recursive = rm_recursive.find_iter(code).count();
    vec![
        (Deletion::RemoveDir, count(r"\bremove_dir(?:_all)?\b")),
        (Deletion::RemoveFile, count(r"\bremove_file\b")),
        (Deletion::RmRecursive, recursive),
        (
            Deletion::Rm,
            rm_any.find_iter(code).count().saturating_sub(recursive),
        ),
        (Deletion::FindDelete, count(r"(?:^|\s)-delete\b")),
        (Deletion::Rmdir, count(r"\brmdir\b")),
        (Deletion::Unlink, count(r"\bunlink\b")),
        (Deletion::RmProgram, count(r#""(?:/usr)?(?:/bin/)?rm""#)),
        (
            Deletion::GitClean,
            count(r#"\bgit"?(?:\s+(?:-[Cc]\s+\S+|--\S+))*\s+clean\b"#)
                // The `Command` form: no `;` between the git program and its `"clean"` argument,
                // so a `"clean"` in a later statement is not attributed to it.
                + count(r#"(?:Command::new\(\s*"git"\s*\)|\bGIT_BIN\b)[^;]*?"clean""#),
        ),
    ]
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
            "remote_runner.rs",
            include_str!("remote_runner.rs"),
            "pub fn resolve(",
        ),
        (
            "terminal.rs",
            include_str!("terminal.rs"),
            "fn resolve_uninstall_terminal_state",
        ),
        (
            "remote_guard.rs",
            include_str!("remote_guard.rs"),
            "pub fn remote_refuse_guard(",
        ),
        (
            "remote_ops.rs",
            include_str!("remote_ops.rs"),
            "pub fn resolve_update(",
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

    /// The name a production item declares, for the anchor check below. An `impl` block is
    /// named by its last fn (an anchor names a fn, never the impl). `None`: an item with no name
    /// an anchor could cite (`use`, a macro call), which the check steps over.
    fn last_name(item: &syn::Item) -> Option<String> {
        use syn::Item;
        Some(match item {
            Item::Fn(f) => f.sig.ident.to_string(),
            Item::Const(c) => c.ident.to_string(),
            Item::Static(s) => s.ident.to_string(),
            Item::Struct(s) => s.ident.to_string(),
            Item::Enum(e) => e.ident.to_string(),
            Item::Type(t) => t.ident.to_string(),
            Item::Trait(t) => t.ident.to_string(),
            Item::Mod(m) => m.ident.to_string(),
            Item::Impl(i) => i.items.iter().rev().find_map(|ii| match ii {
                syn::ImplItem::Fn(f) => Some(f.sig.ident.to_string()),
                _ => None,
            })?,
            _ => return None,
        })
    }

    #[test]
    fn every_tail_anchor_names_its_files_last_production_item() {
        // WP8 P1.1 (`SURFACE-2026-11-20-QUALITY-REMOTE-OPS-TAIL-ANCHOR-STALE`): an anchor is
        // only a tail check while it IS the tail. WP7 appended five items after
        // `remote_ops.rs`'s `resolve_uninstall` and the anchor stayed put, so an extractor
        // cutting there would have hidden the Update script from the delete scan with
        // `the_extractor_reaches_every_files_tail` still green. This derives the tail from the
        // parsed file, so an append that outruns its anchor fails here.
        for (name, src, tail_anchor) in MODULE_FILES {
            let file = syn::parse_file(src).unwrap_or_else(|e| panic!("{name}: {e}"));
            let last = file
                .items
                .iter()
                .rev()
                .filter(|i| !crate::test_support::is_cfg_test(crate::test_support::item_attrs(i)))
                .find_map(last_name)
                .unwrap_or_else(|| panic!("{name}: no production item"));
            // The anchor's identifier: its last word, minus a trailing `(`.
            let ident = tail_anchor
                .trim_end_matches('(')
                .split_whitespace()
                .next_back()
                .unwrap_or_default();
            assert_eq!(
                ident,
                last.as_str(),
                "{name}: the tail anchor `{tail_anchor}` is not the file's last production \
                 item (`{last}`); point the anchor at the tail, or the extractor check stops \
                 covering whatever was appended after it"
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
        // M18 WP6 adds the REMOTE delete: a shell `rm -rf` inside the run script's text, so the
        // token is the shell command, not a Rust API. ONE is sanctioned: the leftover-clone
        // removal in `remote_runner.rs`'s template, which runs on the host only after the host
        // re-checked there is no record, the probe reads `no`, and the folder's physical path is
        // exactly `<root>/.claudesk/vendor/<name>`. WP7's Uninstall removal will be a second,
        // behind a `RemoteUninstallTarget`.
        // WP7 Phase 1: the scan is per KIND of deletion (`deletions`, a pattern per kind), not a
        // token list: WP6's `"rm -rf"` / `"rm -r "` passed every other spelling.
        const ALLOWED: &[(&str, Deletion, usize)] = &[
            ("runner.rs", Deletion::RemoveDir, 1),
            ("provenance.rs", Deletion::RemoveFile, 1),
            ("remote_runner.rs", Deletion::RmRecursive, 1),
            // M18 WP7: the remote Uninstall, inside `remote_ops.rs`'s UNINSTALL_TEMPLATE, which only
            // `uninstall_script(&RemoteUninstallTarget)` fills (the type's one constructor is
            // `remote_refuse_guard`): the `rm -rf` of the guard-approved clone, then the record's
            // `rm -f`, LAST. The host re-checks the approval before either runs (D6).
            ("remote_ops.rs", Deletion::RmRecursive, 1),
            ("remote_ops.rs", Deletion::Rm, 1),
        ];

        for (name, src, _) in MODULE_FILES {
            let code = production_code(src);
            for (kind, found) in deletions(&code) {
                let permitted = ALLOWED
                    .iter()
                    .find(|(f, k, _)| f == name && *k == kind)
                    .map(|(_, _, n)| *n)
                    .unwrap_or(0);
                assert_eq!(
                    found, permitted,
                    "{name}: found {found} {kind:?} deletion(s), {permitted} permitted. \
                     A new deleting call must be sanctioned HERE, in the same change that \
                     adds it — and it must consume a `guard::UninstallTarget` so the \
                     refuse-guard is structurally in front of it."
                );
            }
        }
    }

    /// The classifier, one spelling at a time: each must count as a deletion of its kind, inside a
    /// raw-string shell template run through the real extractor (as a template in a module is).
    /// ⚠️ One spelling per case, so a pattern that misses one fails on that one alone.
    #[test]
    fn every_deletion_spelling_is_counted_inside_a_template() {
        let cases: &[(&str, Deletion)] = &[
            (r#"rm -rf -- "$x""#, Deletion::RmRecursive),
            (r#"rm -fr -- "$x""#, Deletion::RmRecursive),
            (r#"rm -Rf -- "$x""#, Deletion::RmRecursive),
            (r#"rm -fR -- "$x""#, Deletion::RmRecursive),
            (r#"rm -R -- "$x""#, Deletion::RmRecursive),
            (r#"rm -r "$x""#, Deletion::RmRecursive),
            (r#"rm -f -r -- "$x""#, Deletion::RmRecursive),
            (r#"rm --recursive --force "$x""#, Deletion::RmRecursive),
            (r#"rm -f -- "$x""#, Deletion::Rm),
            (r#"rm "$x""#, Deletion::Rm),
            (r#"find "$x" -delete"#, Deletion::FindDelete),
            (r#"rmdir -- "$x""#, Deletion::Rmdir),
            (r#"unlink "$x""#, Deletion::Unlink),
            (r#"  *) rm -rf -- "$x" ;;"#, Deletion::RmRecursive),
            ("std::fs::remove_dir_all(&p)?;", Deletion::RemoveDir),
            ("std::fs::remove_dir(&p)?;", Deletion::RemoveDir),
            ("std::fs::remove_file(&p)?;", Deletion::RemoveFile),
            // WP8 P2.2: rm as a quoted program, and git clean.
            (r#"Command::new("rm").arg(&p);"#, Deletion::RmProgram),
            (r#"Command::new("/bin/rm").arg(&p);"#, Deletion::RmProgram),
            (
                r#"Command::new("/usr/bin/rm").arg(&p);"#,
                Deletion::RmProgram,
            ),
            (r#"git clean -fdx"#, Deletion::GitClean),
            (
                r#""$d/usr/bin/git" -C "$target" clean -fd"#,
                Deletion::GitClean,
            ),
            (r#"git -c core.x=1 --no-pager clean -n"#, Deletion::GitClean),
            // The Rust `Command` forms (each spelling alone).
            (
                r#"Command::new("git").args(["clean", "-fd"]);"#,
                Deletion::GitClean,
            ),
            (
                r#"Command::new(GIT_BIN).arg("-C").arg(&d).arg("clean");"#,
                Deletion::GitClean,
            ),
        ];
        for (line, kind) in cases {
            let src = format!(
                "const T: &str = r#\"case \"$p\" in\n  ok) ;;\n{line}\nesac\"#;\nfn tail() {{}}\n"
            );
            let src = if line.starts_with("std::") || line.starts_with("Command::") {
                format!("fn f() {{\n    {line}\n}}\n")
            } else {
                src
            };
            let found = deletions(&production_code(&src));
            for (k, n) in found {
                let want = usize::from(k == *kind);
                assert_eq!(n, want, "{line:?}: {k:?} counted {n}, want {want}");
            }
        }
    }

    /// Words that merely contain the letters are not deletions.
    #[test]
    fn near_misses_are_not_deletions() {
        for line in [
            "let perm = 1;",
            "let rm_x = 2;",
            r#"echo "form -r""#,
            "fn remove_directory_listing() {}",
            r#"let s = "unlinked";"#,
            r#"let s = "a -deleted flag";"#,
            r#"let s = "the git tree is clean";"#,
            r#"git status --porcelain # clean"#,
            // A `"clean"` after the git statement ended is not its argument.
            r#"Command::new("git").arg("status"); let s = "clean";"#,
            r#"let mode = "clean";"#,
            r#"let s = "farm";"#,
            r#"let s = "rmx";"#,
        ] {
            let found: usize = deletions(&production_code(line))
                .iter()
                .map(|(_, n)| n)
                .sum();
            assert_eq!(found, 0, "{line:?} is not a deletion");
        }
    }

    /// WP7 Phase 1: a `*` line inside a raw string is template text, not a comment continuation,
    /// and survives the strip; `//` and `/*` inside strings start nothing.
    #[test]
    fn strip_comments_keeps_string_contents() {
        let src = "const T: &str = r#\"case $x in\n  *) echo star ;;\nesac // not a comment\n/* nor this */\"#;\nlet u = \"https://example.com/*\"; // gone\nlet c = '\"'; let q = '\\''; fn after() {}\n";
        let kept = strip_comments(src);
        assert!(kept.contains("  *) echo star ;;"), "{kept}");
        assert!(kept.contains("esac // not a comment"), "{kept}");
        assert!(kept.contains("/* nor this */"), "{kept}");
        assert!(kept.contains("https://example.com/*\";"), "{kept}");
        assert!(!kept.contains("gone"), "{kept}");
        assert!(kept.contains("fn after"), "{kept}");
    }

    #[test]
    fn strip_comments_handles_trailing_and_nested_comments() {
        let src = "fn a() {} // remove_dir in a trailing comment\n/* outer /* inner remove_dir */ still remove_dir */\nfn b() {}\n";
        let kept = strip_comments(src);
        assert!(!kept.contains("remove_dir"), "{kept}");
        assert!(kept.contains("fn a") && kept.contains("fn b"), "{kept}");
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
