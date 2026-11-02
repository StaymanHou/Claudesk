//! Project-wide content search — the ripgrep-style "Find in Files" backend (WP7).
//!
//! Backs the Milestone-2 ⌘⇧F overlay. The finder (WP6) matches file *names*; this
//! module matches file *contents* across the whole workspace project dir. It is
//! **app-layer** infrastructure, not an editor feature — `@codemirror/search` is
//! single-document only (the load-bearing `research.md` correction); multi-file
//! search has to be a backend that produces results the React overlay renders.
//!
//! ## Layout (mirrors [`crate::fs_index`] / [`crate::editor_fs`])
//! - **Pure core** ([`search_core`]) takes an injected `root: &Path` + a
//!   [`SearchQuery`], so it is unit-testable against a `TempDir` with no Tauri
//!   runtime.
//! - **Tauri command wrapper** ([`commands`]) is the only IPC surface; it maps
//!   [`ProjectSearchError`] to a `String`.
//!
//! ## Shared walker contract (no forked walk)
//! The walk goes through [`crate::fs_index`]'s `walk_project` / `check_root` /
//! `rel_posix` helpers — the SAME exclusion set the Cmd+P finder and the file tree
//! use. M6 WP6 re-based that set from "gitignore honored" to **"heavy generated dirs
//! pruned"** (gitignore NOT honored; `node_modules/`/`target/`/detected-big dirs listed
//! but not descended; `.git/` excluded; dotfiles shown). So search, Cmd+P, and the tree
//! provably agree about what is "in the project" — there is deliberately no second walk
//! here. NOTE the consequence: a gitignored file (e.g. `.env`) IS now searched/replaced;
//! this is intended (single-user tool, the operator wants reach over their own files).
//!
//! ## In-process, line-oriented matching
//! Matching uses the `regex` crate (ripgrep's own engine), per line. The four search
//! modes compose into one regex: substring escapes the pattern, regex passes it
//! through, case-sensitivity toggles the `(?i)` flag, whole-word wraps in `\b…\b`.
//! Non-UTF-8 (binary) files are skipped — they have no meaningful line text to show.
//!
//! ## Errors are surfaced, never swallowed
//! A bad root or an invalid regex returns a typed [`ProjectSearchError`] the command
//! maps to a `String`; the overlay shows it rather than a silently-empty list (the
//! WP6 picker IPC error-surfacing lesson). A *no-match* search is a legitimate empty
//! result, distinct from an error.

pub mod commands;

use std::path::Path;

use regex::Regex;
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::fs_index::{check_root, rel_posix, walk_project};

/// Errors from a project search. IPC-facing wrappers map this to a `String`.
#[derive(Debug, Error)]
pub enum ProjectSearchError {
    /// The workspace root does not exist or is not a directory.
    #[error("workspace root {root} is not a readable directory: {reason}")]
    BadRoot { root: String, reason: String },

    /// The query is regex mode and the pattern did not compile (or whole-word/case
    /// wrapping produced an invalid pattern). The overlay surfaces this inline so the
    /// operator can fix the pattern, rather than seeing an empty result list.
    #[error("invalid search pattern: {0}")]
    BadPattern(String),

    /// A project-wide replace failed to write one or more files. Carries the
    /// project-relative path of the first file that failed + the underlying reason, so
    /// the overlay surfaces an actionable message rather than silently leaving a
    /// partial replace. Replace is best-effort across files: files written before the
    /// failure stay written (mirrors the search walk's partial-result posture); the
    /// error names where it stopped.
    #[error("could not write {file} during replace: {reason}")]
    WriteFailed { file: String, reason: String },

    /// A scoped replace (one file, or one match) could not read its target file: it is
    /// outside the root, gone, binary, or over the read cap. Writes nothing.
    #[error("could not read {file} for replace: {reason}")]
    ReadFailed { file: String, reason: String },

    /// The result a scoped replace was aimed at is no longer on disk as the search saw
    /// it (M16.5 WP6): the targeted line's text changed, the match moved off its
    /// recorded offset, or the file no longer has any match. Writes nothing — the
    /// operator re-runs the search rather than replacing something they never saw.
    #[error("{file} changed since the search; search again")]
    StaleResult { file: String },
}

/// The search request: the pattern plus the four mode toggles. Deserialized from the
/// IPC call (the overlay's query field + regex / case / whole-word checkboxes).
#[derive(Debug, Clone, Deserialize)]
pub struct SearchQuery {
    /// The raw text the operator typed.
    pub pattern: String,
    /// Treat `pattern` as a regular expression. When false it is matched literally
    /// (the pattern is regex-escaped before compiling).
    pub regex: bool,
    /// Case-sensitive match. When false, the `(?i)` flag is added.
    pub case_sensitive: bool,
    /// Whole-word match — wrap the (escaped or raw) pattern in `\b…\b`.
    pub whole_word: bool,
}

/// One match within a file: its 1-based line number, the byte range of the match
/// within that line (`[start, end)`, suitable for the frontend to mark the span and
/// to seed the editor's selection on open), and the full text of the line.
#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct LineMatch {
    /// 1-based line number (editors and humans count from 1).
    pub line: u32,
    /// Byte offset of the match start within `line_text` (0-based).
    pub start: usize,
    /// Byte offset one past the match end within `line_text`.
    pub end: usize,
    /// The full text of the matched line (no trailing newline).
    pub line_text: String,
}

/// All matches in a single file, grouped under its project-relative POSIX path. Files
/// with no matches are omitted from results entirely.
#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct FileMatches {
    /// Project-relative POSIX path (same shape `fs_index` returns).
    pub file: String,
    /// Every match in this file, in document order.
    pub matches: Vec<LineMatch>,
}

/// Compile a [`SearchQuery`] into a [`Regex`], composing the four modes.
///
/// Order matters: escape-or-not first (substring vs regex), then whole-word wrapping
/// (`\b` around the unit), then the case flag as a prefix. An empty pattern is treated
/// as a bad pattern so we never return a match on every line.
fn build_regex(query: &SearchQuery) -> Result<Regex, ProjectSearchError> {
    if query.pattern.is_empty() {
        return Err(ProjectSearchError::BadPattern(
            "pattern is empty".to_string(),
        ));
    }

    let base = if query.regex {
        query.pattern.clone()
    } else {
        regex::escape(&query.pattern)
    };

    // Whole-word: wrap in a non-capturing group so `\b` binds to the whole unit even
    // when the pattern is an alternation (e.g. `foo|bar` → `\b(?:foo|bar)\b`).
    let bounded = if query.whole_word {
        format!(r"\b(?:{base})\b")
    } else {
        base
    };

    let pattern = if query.case_sensitive {
        bounded
    } else {
        format!("(?i){bounded}")
    };

    Regex::new(&pattern).map_err(|e| ProjectSearchError::BadPattern(e.to_string()))
}

/// Search `root` for `query` and return per-file matches.
///
/// Walks the project via the shared [`walk_project`] (heavy dirs pruned, gitignore NOT
/// honored, `.git/` excluded — identical to the finder/tree), reads each file as UTF-8,
/// and records every line containing a match. Non-UTF-8 (binary) files and unreadable
/// entries are skipped. Results are sorted by file path for a deterministic order;
/// matches within a file are in document order. Files with zero matches are omitted.
///
/// # Errors
/// - [`ProjectSearchError::BadRoot`] if `root` does not exist or is not a directory.
/// - [`ProjectSearchError::BadPattern`] if the (composed) pattern is empty or, in
///   regex mode, does not compile.
pub fn search_core(
    root: &Path,
    query: &SearchQuery,
) -> Result<Vec<FileMatches>, ProjectSearchError> {
    check_root(root).map_err(|e| match e {
        crate::fs_index::FsIndexError::BadRoot { root, reason } => {
            ProjectSearchError::BadRoot { root, reason }
        }
    })?;

    let re = build_regex(query)?;

    let mut results: Vec<FileMatches> = Vec::new();
    for entry in walk_project(root) {
        // Files only — heavy-dir rows + every other directory carry no content. Files
        // under a pruned heavy dir were never descended into (mirrors fs_index/tree).
        if entry.is_dir {
            continue;
        }
        let path = entry.abs.as_path();

        // Non-UTF-8 (binary) files are skipped: there is no meaningful line text to
        // show, and ripgrep-style search is a text-search tool. Read errors (e.g.
        // a file deleted mid-walk) are likewise skipped rather than failing the run.
        let Ok(contents) = std::fs::read_to_string(path) else {
            continue;
        };

        let mut matches: Vec<LineMatch> = Vec::new();
        for (idx, line_text) in contents.lines().enumerate() {
            for m in re.find_iter(line_text) {
                matches.push(LineMatch {
                    line: (idx as u32) + 1,
                    start: m.start(),
                    end: m.end(),
                    line_text: line_text.to_string(),
                });
            }
        }

        if matches.is_empty() {
            continue;
        }
        if let Some(file) = rel_posix(root, path) {
            results.push(FileMatches { file, matches });
        }
    }

    results.sort_by(|a, b| a.file.cmp(&b.file));
    Ok(results)
}

/// The outcome of a project-wide replace: how many files were rewritten and how many
/// individual matches were replaced. Serialized to the overlay for a post-replace
/// summary ("Replaced N matches in M files").
#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct ReplaceSummary {
    /// Number of files whose contents changed (a file with matches but whose replaced
    /// text equals the original — e.g. replacing `x` with `x` — does not count).
    pub files_changed: u32,
    /// Total number of matches replaced across all files.
    pub matches_replaced: u32,
}

/// Replace every match of `query` with `replacement` across the project, in place.
///
/// Reuses the SAME composed regex and shared walk as [`search_core`], so "what gets
/// replaced" is exactly "what a search with this query would have found" — no second
/// match definition. For each file with ≥1 match, the new contents are computed with
/// [`Regex::replace_all`] and written via [`crate::editor_fs::write_file_core`] (the
/// atomic tmp-then-rename write, root-confined). Capture-group references (`$1`,
/// `${name}`) in `replacement` expand in **regex** mode; in **substring** mode the
/// replacement is inserted literally (a `$` in it is not a group reference) via
/// [`regex::NoExpand`].
///
/// Replace is best-effort across files (mirrors the search walk): a per-file write
/// failure stops the run and returns [`ProjectSearchError::WriteFailed`] naming that
/// file; files already written stay written. Gitignored / `.git/` / binary / unreadable
/// files are skipped, identical to search.
///
/// # Errors
/// - [`ProjectSearchError::BadRoot`] / [`ProjectSearchError::BadPattern`] — same as search.
/// - [`ProjectSearchError::WriteFailed`] — a matching file could not be written.
pub fn replace_core(
    root: &Path,
    query: &SearchQuery,
    replacement: &str,
) -> Result<ReplaceSummary, ProjectSearchError> {
    check_root(root).map_err(|e| match e {
        crate::fs_index::FsIndexError::BadRoot { root, reason } => {
            ProjectSearchError::BadRoot { root, reason }
        }
    })?;

    let re = build_regex(query)?;

    let mut files_changed: u32 = 0;
    let mut matches_replaced: u32 = 0;

    for entry in walk_project(root) {
        // Files only (same heavy-dir-pruned, gitignore-not-honored walk as search).
        if entry.is_dir {
            continue;
        }
        let path = entry.abs.as_path();

        // Skip non-UTF-8 (binary) + unreadable files, same as search.
        let Ok(contents) = std::fs::read_to_string(path) else {
            continue;
        };

        // Count over the WHOLE file string — the same span `replace_all` mutates below
        // — so `matches_replaced` equals what replace actually changes, even if a future
        // regex matches across line boundaries (`(?s)…`, explicit `\n`). For a line-
        // oriented pattern this equals the per-line sum (a `.`-default regex never
        // crosses `\n`), so it agrees with search's per-line count for today's queries
        // while staying exact under a multiline pattern (count-vs-effect can't diverge).
        let count = re.find_iter(&contents).count();
        if count == 0 {
            continue;
        }

        // Whole-file, deliberately (see `replace_count_matches_whole_file_effect_under_
        // multiline_regex`); the scoped replaces below are per-line instead.
        let new_contents = replace_all_in(&re, &contents, query.regex, replacement);

        // A no-op replacement (e.g. `x` → `x`) leaves contents identical — don't rewrite
        // the file or count it as changed, but the matches were still "replaced".
        matches_replaced += count as u32;
        if new_contents == contents {
            continue;
        }

        // Write through the editor_fs atomic, root-confined writer. `path` is absolute
        // inside `root`; write_file_core re-resolves it within root (defense in depth).
        crate::editor_fs::write_file_core(root, path, &new_contents).map_err(|e| {
            ProjectSearchError::WriteFailed {
                file: rel_posix(root, path).unwrap_or_else(|| path.display().to_string()),
                reason: e.to_string(),
            }
        })?;
        files_changed += 1;
    }

    Ok(ReplaceSummary {
        files_changed,
        matches_replaced,
    })
}

/// Which results a replace acts on (M16.5 WP6). Deserialized from the IPC call as a
/// `kind`-tagged object; an absent scope on the command means [`ReplaceScope::All`], so
/// the Replace All caller is unchanged.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ReplaceScope {
    /// Every match across the project — today's Replace All ([`replace_core`]).
    All,
    /// Every match in one file. `path` is project-relative POSIX, as search returns it.
    File { path: String },
    /// Exactly one match: the search result row it came from, carried back verbatim so
    /// the replace can refuse if the file changed since ([`ProjectSearchError::StaleResult`]).
    Match {
        path: String,
        /// 1-based line number.
        line: u32,
        /// Byte range of the match within `line_text`.
        start: usize,
        end: usize,
        /// The full line as the search saw it (no line terminator).
        line_text: String,
    },
}

/// Replace within `scope`. [`ReplaceScope::All`] is exactly [`replace_core`]; the other
/// two read and rewrite ONE file, resolved root-confined through `editor_fs` (no walk),
/// with the same composed regex and the same literal-vs-expand rule.
///
/// # Errors
/// - [`ProjectSearchError::BadRoot`] / [`ProjectSearchError::BadPattern`] — as for search.
/// - [`ProjectSearchError::ReadFailed`] / [`ProjectSearchError::WriteFailed`] — the file.
/// - [`ProjectSearchError::StaleResult`] — the target no longer matches as searched.
pub fn replace_in_scope(
    root: &Path,
    query: &SearchQuery,
    replacement: &str,
    scope: &ReplaceScope,
) -> Result<ReplaceSummary, ProjectSearchError> {
    let (path, target) = match scope {
        ReplaceScope::All => return replace_core(root, query, replacement),
        ReplaceScope::File { path } => (path, None),
        ReplaceScope::Match {
            path,
            line,
            start,
            end,
            line_text,
        } => (
            path,
            Some(MatchTarget {
                line: *line,
                start: *start,
                end: *end,
                line_text,
            }),
        ),
    };

    check_root(root).map_err(|e| match e {
        crate::fs_index::FsIndexError::BadRoot { root, reason } => {
            ProjectSearchError::BadRoot { root, reason }
        }
    })?;
    let re = build_regex(query)?;

    let rel = Path::new(path);
    let contents = crate::editor_fs::read_file_core(root, rel).map_err(|e| {
        ProjectSearchError::ReadFailed {
            file: path.clone(),
            reason: e.to_string(),
        }
    })?;
    let stale = || ProjectSearchError::StaleResult { file: path.clone() };

    let (new_contents, count) = match target {
        None => {
            let (replaced, count) =
                replace_every_match_per_line(&contents, &re, query.regex, replacement);
            if count == 0 {
                return Err(stale());
            }
            (replaced, count)
        }
        Some(target) => (
            replace_one_match(&contents, &re, query.regex, replacement, target)
                .ok_or_else(stale)?,
            1,
        ),
    };

    let changed = new_contents != contents;
    if changed {
        crate::editor_fs::write_file_core(root, rel, &new_contents).map_err(|e| {
            ProjectSearchError::WriteFailed {
                file: path.clone(),
                reason: e.to_string(),
            }
        })?;
    }
    Ok(ReplaceSummary {
        files_changed: u32::from(changed),
        matches_replaced: count as u32,
    })
}

/// One search result row, as carried back by [`ReplaceScope::Match`].
struct MatchTarget<'a> {
    /// 1-based line number.
    line: u32,
    /// Byte range of the match within `line_text`.
    start: usize,
    end: usize,
    line_text: &'a str,
}

/// THE literal-vs-expand rule, in one place: in substring mode the replacement is
/// inserted literally (a `$` the user typed is not a group reference, via
/// [`regex::NoExpand`]); in regex mode `$1` / `${name}` expand.
fn replace_all_in(re: &Regex, text: &str, expand: bool, replacement: &str) -> String {
    if expand {
        re.replace_all(text, replacement).into_owned()
    } else {
        re.replace_all(text, regex::NoExpand(replacement))
            .into_owned()
    }
}

/// The lines of `contents` EXACTLY as [`str::lines`] (what [`search_core`] matches) yields
/// them, each paired with its byte offset and its terminator (`"\n"`, `"\r\n"` or `""`), so
/// a per-line rewrite can be reassembled byte for byte. A `\r` is a terminator only when a
/// `\n` follows it, as in `str::lines`.
fn lines_with_terminators(contents: &str) -> impl Iterator<Item = (usize, &str, &str)> {
    let mut offset = 0usize;
    contents.split_inclusive('\n').map(move |raw| {
        let start = offset;
        offset += raw.len();
        let cut = if raw.ends_with("\r\n") {
            2
        } else if raw.ends_with('\n') {
            1
        } else {
            0
        };
        let (text, term) = raw.split_at(raw.len() - cut);
        (start, text, term)
    })
}

/// Replace every match of `re`, matching PER LINE the way [`search_core`] found them, so a
/// `^` / `$` anchor means here what it meant in the Find Results the operator clicked.
/// Returns the new contents and the number of matches replaced.
fn replace_every_match_per_line(
    contents: &str,
    re: &Regex,
    expand: bool,
    replacement: &str,
) -> (String, usize) {
    let mut out = String::with_capacity(contents.len());
    let mut count = 0usize;
    for (_, text, term) in lines_with_terminators(contents) {
        let n = re.find_iter(text).count();
        if n == 0 {
            out.push_str(text);
        } else {
            count += n;
            out.push_str(&replace_all_in(re, text, expand, replacement));
        }
        out.push_str(term);
    }
    (out, count)
}

/// Rewrite the single match `target` points at, or `None` if that line's text is no longer
/// `target.line_text` or no match of `re` spans exactly `[start, end)` on it.
///
/// Matching is per LINE, the way [`search_core`] found the row, so an anchor such as `^`
/// means what it meant in the result. Everything outside the span (other matches, other
/// lines, `\r\n` terminators) is kept byte for byte.
fn replace_one_match(
    contents: &str,
    re: &Regex,
    expand: bool,
    replacement: &str,
    target: MatchTarget<'_>,
) -> Option<String> {
    let idx = (target.line as usize).checked_sub(1)?;
    let (offset, text, _) = lines_with_terminators(contents).nth(idx)?;
    if text != target.line_text {
        return None;
    }
    let caps = re.captures_iter(text).find(|c| {
        c.get(0)
            .is_some_and(|m| m.start() == target.start && m.end() == target.end)
    })?;

    let mut with = String::new();
    if expand {
        caps.expand(replacement, &mut with);
    } else {
        with.push_str(replacement);
    }
    let mut out = String::with_capacity(contents.len() + with.len());
    out.push_str(&contents[..offset + target.start]);
    out.push_str(&with);
    out.push_str(&contents[offset + target.end..]);
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    /// A query in the most common mode: substring, case-insensitive, not whole-word.
    fn substring(pattern: &str) -> SearchQuery {
        SearchQuery {
            pattern: pattern.to_string(),
            regex: false,
            case_sensitive: false,
            whole_word: false,
        }
    }

    /// Build a small project tree with known content matches.
    /// Layout:
    ///   src/main.rs        contains "let foo = 1;" and "foo(bar)"
    ///   src/lib.rs         contains "pub fn foobar() {}"
    ///   README.md          contains "Foo Bar Baz"
    ///   ignored.txt        contains "foo" (gitignored)
    ///   .git/config        (always excluded; also makes `ignore` treat the dir as a
    ///                       git repo so `.gitignore` rules apply — mirrors the
    ///                       fs_index fixture)
    ///   .gitignore         lists ignored.txt
    fn fixture() -> TempDir {
        let dir = TempDir::new().unwrap();
        let root = dir.path();
        fs::create_dir(root.join("src")).unwrap();
        fs::write(root.join("src/main.rs"), "let foo = 1;\nfoo(bar)\n").unwrap();
        fs::write(root.join("src/lib.rs"), "pub fn foobar() {}\n").unwrap();
        fs::write(root.join("README.md"), "Foo Bar Baz\n").unwrap();
        fs::write(root.join("ignored.txt"), "foo here\n").unwrap();
        // M6 WP6: the walk no longer honors gitignore, so `ignored.txt` IS searched now.
        // A heavy dir (by name) IS still excluded — its contents are never walked.
        fs::create_dir(root.join("node_modules")).unwrap();
        fs::write(root.join("node_modules/dep.js"), "foo in dep\n").unwrap();
        fs::create_dir(root.join(".git")).unwrap();
        fs::write(root.join(".git/config"), "[core]").unwrap();
        fs::write(root.join(".gitignore"), "ignored.txt\nnode_modules/\n").unwrap();
        dir
    }

    /// Total match count across all files.
    fn total(results: &[FileMatches]) -> usize {
        results.iter().map(|f| f.matches.len()).sum()
    }

    #[test]
    fn substring_matches_across_files_case_insensitive() {
        let dir = fixture();
        let results = search_core(dir.path(), &substring("foo")).unwrap();
        // src/main.rs: "let foo = 1;" (1) + "foo(bar)" (1) = 2
        // src/lib.rs:  "foobar" (1)
        // README.md:   "Foo Bar Baz" → "Foo" (1, case-insensitive)
        // ignored.txt: "foo here" (1) — gitignored but NOW searched (M6 WP6)
        // node_modules/dep.js: heavy-dir → never walked → 0
        assert_eq!(total(&results), 5, "{results:?}");
        let files: Vec<&str> = results.iter().map(|f| f.file.as_str()).collect();
        assert_eq!(
            files,
            vec!["README.md", "ignored.txt", "src/lib.rs", "src/main.rs"]
        );
    }

    #[test]
    fn case_sensitive_excludes_differing_case() {
        let dir = fixture();
        let q = SearchQuery {
            pattern: "Foo".to_string(),
            regex: false,
            case_sensitive: true,
            whole_word: false,
        };
        let results = search_core(dir.path(), &q).unwrap();
        // Only README.md's "Foo" matches; lowercase "foo" in src/ does not.
        assert_eq!(total(&results), 1, "{results:?}");
        assert_eq!(results[0].file, "README.md");
    }

    #[test]
    fn whole_word_excludes_substring_hits() {
        let dir = fixture();
        let q = SearchQuery {
            pattern: "foo".to_string(),
            regex: false,
            case_sensitive: false,
            whole_word: true,
        };
        let results = search_core(dir.path(), &q).unwrap();
        // Whole-word "foo": matches "let foo = 1;" and "foo(bar)" (foo is its own
        // word there), "Foo" in README, and "foo here" in the now-searched ignored.txt;
        // does NOT match "foobar" in lib.rs.
        assert!(
            !results.iter().any(|f| f.file == "src/lib.rs"),
            "foobar must not match whole-word foo: {results:?}"
        );
        assert_eq!(total(&results), 4, "{results:?}");
    }

    #[test]
    fn regex_mode_matches_pattern() {
        let dir = fixture();
        let q = SearchQuery {
            pattern: r"foo\w+".to_string(),
            regex: true,
            case_sensitive: false,
            whole_word: false,
        };
        let results = search_core(dir.path(), &q).unwrap();
        // foo\w+ matches "foobar" (lib.rs) and "foo" followed by word chars? "foo(bar)"
        // → 'foo' then '(' is non-word, so foo\w+ needs ≥1 word char after foo:
        // "foobar" matches; "let foo = 1;" → "foo" then space, no match; "Foo Bar"
        // → "Foo" then space, no match. So exactly 1 match in lib.rs.
        assert_eq!(total(&results), 1, "{results:?}");
        assert_eq!(results[0].file, "src/lib.rs");
    }

    #[test]
    fn match_range_and_line_number_are_recorded() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("a.txt"), "zero\nhas needle here\n").unwrap();
        let results = search_core(dir.path(), &substring("needle")).unwrap();
        assert_eq!(results.len(), 1);
        let m = &results[0].matches[0];
        assert_eq!(m.line, 2, "1-based line number");
        assert_eq!(m.line_text, "has needle here");
        assert_eq!(&m.line_text[m.start..m.end], "needle");
    }

    #[test]
    fn multiple_matches_on_one_line_are_all_recorded() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("a.txt"), "x x x\n").unwrap();
        let results = search_core(dir.path(), &substring("x")).unwrap();
        assert_eq!(total(&results), 3, "{results:?}");
    }

    #[test]
    fn gitignored_files_are_now_searched_but_heavy_dirs_excluded() {
        // M6 WP6 re-base: gitignore no longer governs the walk, so a gitignored file
        // (`ignored.txt`) IS searched. Heavy dirs (`node_modules/`) are still excluded.
        let dir = fixture();
        let results = search_core(dir.path(), &substring("foo")).unwrap();
        assert!(
            results.iter().any(|f| f.file == "ignored.txt"),
            "gitignored file is now searched: {results:?}"
        );
        assert!(
            !results.iter().any(|f| f.file.starts_with("node_modules/")),
            "heavy-dir contents must not be searched: {results:?}"
        );
    }

    #[test]
    fn binary_file_is_skipped() {
        let dir = TempDir::new().unwrap();
        // A NUL byte makes this invalid UTF-8 → read_to_string fails → skipped.
        fs::write(dir.path().join("bin.dat"), [0xff, 0xfe, 0x00, 0x66]).unwrap();
        fs::write(dir.path().join("text.txt"), "foo\n").unwrap();
        let results = search_core(dir.path(), &substring("foo")).unwrap();
        // Only the text file is searched; the binary file is silently skipped.
        assert_eq!(results.len(), 1, "{results:?}");
        assert_eq!(results[0].file, "text.txt");
    }

    #[test]
    fn no_match_is_empty_result_not_error() {
        let dir = fixture();
        let results = search_core(dir.path(), &substring("zzz-not-present")).unwrap();
        assert!(results.is_empty(), "{results:?}");
    }

    #[test]
    fn invalid_regex_is_typed_error() {
        let dir = fixture();
        let q = SearchQuery {
            pattern: "(unterminated".to_string(),
            regex: true,
            case_sensitive: false,
            whole_word: false,
        };
        let result = search_core(dir.path(), &q);
        assert!(
            matches!(result, Err(ProjectSearchError::BadPattern(_))),
            "an invalid regex must surface as an error, not an empty list: {result:?}"
        );
    }

    #[test]
    fn empty_pattern_is_typed_error() {
        let dir = fixture();
        let result = search_core(dir.path(), &substring(""));
        assert!(
            matches!(result, Err(ProjectSearchError::BadPattern(_))),
            "an empty pattern must not match every line: {result:?}"
        );
    }

    #[test]
    fn nonexistent_root_is_typed_error() {
        let dir = TempDir::new().unwrap();
        let missing = dir.path().join("no-such-subdir");
        let result = search_core(&missing, &substring("foo"));
        assert!(
            matches!(result, Err(ProjectSearchError::BadRoot { .. })),
            "a missing root must surface as an error: {result:?}"
        );
    }

    #[test]
    fn file_as_root_is_bad_root_error() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("notadir.txt");
        fs::write(&file, "foo").unwrap();
        let result = search_core(&file, &substring("foo"));
        assert!(
            matches!(result, Err(ProjectSearchError::BadRoot { .. })),
            "{result:?}"
        );
    }

    #[test]
    fn substring_pattern_with_regex_metachars_is_literal() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("a.txt"), "a.b\naXb\n").unwrap();
        // In substring mode, "a.b" is literal — the '.' must NOT match 'X'.
        let results = search_core(dir.path(), &substring("a.b")).unwrap();
        assert_eq!(total(&results), 1, "{results:?}");
        assert_eq!(results[0].matches[0].line_text, "a.b");
    }

    #[test]
    fn results_sorted_by_file_path() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("zebra.txt"), "foo\n").unwrap();
        fs::write(dir.path().join("alpha.txt"), "foo\n").unwrap();
        let results = search_core(dir.path(), &substring("foo")).unwrap();
        let files: Vec<&str> = results.iter().map(|f| f.file.as_str()).collect();
        assert_eq!(files, vec!["alpha.txt", "zebra.txt"]);
    }

    // ── Error Display contract (what commands.rs surfaces to the overlay) ────────
    // The command wrapper maps these errors to a `String` via `to_string()` (the WP6
    // IPC-error-surfacing lesson — the overlay shows the message, never an empty list).
    // These pin the human-meaningful content of that string for both variants.

    #[test]
    fn bad_pattern_display_names_the_pattern_problem() {
        let dir = fixture();
        let q = SearchQuery {
            pattern: "(unterminated".to_string(),
            regex: true,
            case_sensitive: false,
            whole_word: false,
        };
        let msg = search_core(dir.path(), &q).unwrap_err().to_string();
        assert!(
            msg.contains("invalid search pattern"),
            "the overlay-facing string must explain the pattern is bad: {msg:?}"
        );
        assert!(!msg.is_empty());
    }

    #[test]
    fn bad_root_display_names_the_root_and_reason() {
        let dir = TempDir::new().unwrap();
        let missing = dir.path().join("no-such-subdir");
        let msg = search_core(&missing, &substring("foo"))
            .unwrap_err()
            .to_string();
        // The string carries the offending root path + a reason so the overlay shows
        // something actionable rather than a silently-empty result list.
        assert!(msg.contains("no-such-subdir"), "{msg:?}");
        assert!(msg.contains("does not exist"), "{msg:?}");
    }

    // ── replace_core (WP7 Phase 3 — project-wide Replace All) ────────────────────

    #[test]
    fn replace_rewrites_matching_files_and_counts() {
        let dir = fixture();
        // "foo" appears: main.rs ×2, lib.rs ×1 (foobar), README ×1 (Foo, case-insens),
        // ignored.txt ×1 (NOW searched, M6 WP6); node_modules excluded (heavy dir).
        // Replace-all should rewrite 4 files, 5 matches.
        let summary = replace_core(dir.path(), &substring("foo"), "BAR").unwrap();
        assert_eq!(summary.matches_replaced, 5, "{summary:?}");
        assert_eq!(summary.files_changed, 4, "{summary:?}");
        // The replaced text is actually on disk + the old text is gone.
        let main = fs::read_to_string(dir.path().join("src/main.rs")).unwrap();
        assert_eq!(main, "let BAR = 1;\nBAR(bar)\n");
        // Case-insensitive search replaced "Foo" too.
        let readme = fs::read_to_string(dir.path().join("README.md")).unwrap();
        assert_eq!(readme, "BAR Bar Baz\n");
    }

    #[test]
    fn replace_now_touches_gitignored_files_but_not_heavy_dirs() {
        // M6 WP6: replace mirrors search — a gitignored file IS rewritten (the operator
        // wants reach over their own files); a heavy-dir file is NOT (never walked).
        let dir = fixture();
        replace_core(dir.path(), &substring("foo"), "BAR").unwrap();
        let ignored = fs::read_to_string(dir.path().join("ignored.txt")).unwrap();
        assert_eq!(ignored, "BAR here\n", "gitignored file is now rewritten");
        // The heavy-dir file is untouched (its contents were never walked).
        let dep = fs::read_to_string(dir.path().join("node_modules/dep.js")).unwrap();
        assert_eq!(dep, "foo in dep\n", "heavy-dir file must be untouched");
    }

    #[test]
    fn replace_regex_mode_expands_capture_groups() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("a.txt"), "call foo(1) and foo(2)\n").unwrap();
        let q = SearchQuery {
            pattern: r"foo\((\d)\)".to_string(),
            regex: true,
            case_sensitive: false,
            whole_word: false,
        };
        let summary = replace_core(dir.path(), &q, "bar[$1]").unwrap();
        assert_eq!(summary.matches_replaced, 2, "{summary:?}");
        let out = fs::read_to_string(dir.path().join("a.txt")).unwrap();
        assert_eq!(out, "call bar[1] and bar[2]\n");
    }

    #[test]
    fn replace_substring_mode_treats_replacement_literally() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("a.txt"), "price is X here\n").unwrap();
        // Substring mode: a `$1` in the replacement must be inserted LITERALLY, not
        // treated as a (nonexistent) capture-group reference.
        let summary = replace_core(dir.path(), &substring("X"), "$1.99").unwrap();
        assert_eq!(summary.matches_replaced, 1, "{summary:?}");
        let out = fs::read_to_string(dir.path().join("a.txt")).unwrap();
        assert_eq!(out, "price is $1.99 here\n");
    }

    #[test]
    fn replace_with_no_matches_changes_nothing() {
        let dir = fixture();
        let summary = replace_core(dir.path(), &substring("zzz-absent"), "X").unwrap();
        assert_eq!(summary.files_changed, 0);
        assert_eq!(summary.matches_replaced, 0);
    }

    #[test]
    fn replace_noop_replacement_counts_matches_but_changes_no_file() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("a.txt"), "foo foo\n").unwrap();
        // Replacing "foo" with "foo" matches twice but leaves the file byte-identical:
        // matches_replaced counts the hits, files_changed stays 0 (no needless rewrite).
        let summary = replace_core(dir.path(), &substring("foo"), "foo").unwrap();
        assert_eq!(summary.matches_replaced, 2, "{summary:?}");
        assert_eq!(summary.files_changed, 0, "{summary:?}");
    }

    #[test]
    fn replace_invalid_regex_is_typed_error() {
        let dir = fixture();
        let q = SearchQuery {
            pattern: "(unterminated".to_string(),
            regex: true,
            case_sensitive: false,
            whole_word: false,
        };
        let result = replace_core(dir.path(), &q, "X");
        assert!(
            matches!(result, Err(ProjectSearchError::BadPattern(_))),
            "{result:?}"
        );
    }

    #[test]
    fn replace_bad_root_is_typed_error() {
        let dir = TempDir::new().unwrap();
        let missing = dir.path().join("no-such-subdir");
        let result = replace_core(&missing, &substring("foo"), "X");
        assert!(
            matches!(result, Err(ProjectSearchError::BadRoot { .. })),
            "{result:?}"
        );
    }

    #[test]
    fn replace_count_matches_whole_file_effect_under_multiline_regex() {
        // A cross-line regex (the `s` flag lets `.` match `\n`) replaces a span the OLD
        // per-line counter never counted. The whole-file find_iter count must equal the
        // number of spans replace_all actually mutates — no count-vs-effect divergence.
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("a.txt"), "foo\nbar\nfoo\nbar\n").unwrap();
        // The `(?s)` flag lets `.` match `\n`, so `foo.bar` spans the foo\nbar boundary.
        let q = SearchQuery {
            pattern: r"(?s)foo.bar".to_string(),
            regex: true,
            case_sensitive: false,
            whole_word: false,
        };
        let summary = replace_core(dir.path(), &q, "X").unwrap();
        // "foo\nbar" appears twice (lines 1-2 and 3-4). replace_all mutates both spans.
        assert_eq!(summary.matches_replaced, 2, "{summary:?}");
        assert_eq!(summary.files_changed, 1);
        let out = fs::read_to_string(dir.path().join("a.txt")).unwrap();
        assert_eq!(out, "X\nX\n");
    }

    #[test]
    fn replace_count_equals_search_count_for_same_query() {
        // The replace match count must equal what a search would have found — same
        // composed regex, same walk. Pins the "no second match definition" invariant.
        let dir = fixture();
        let q = substring("foo");
        let search_total = total(&search_core(dir.path(), &q).unwrap());
        let replace_total = replace_core(dir.path(), &q, "foo")
            .unwrap()
            .matches_replaced;
        assert_eq!(replace_total as usize, search_total);
    }
    // ── replace_in_scope (M16.5 WP6 — per-file and per-result replace) ───────────

    /// A `Match` scope built from a REAL search result, the way the Find Results tab
    /// carries it back (so the tests exercise the search→replace round trip).
    fn match_scope(m: &FileMatches, i: usize) -> ReplaceScope {
        let r = &m.matches[i];
        ReplaceScope::Match {
            path: m.file.clone(),
            line: r.line,
            start: r.start,
            end: r.end,
            line_text: r.line_text.clone(),
        }
    }

    fn file_in<'a>(results: &'a [FileMatches], file: &str) -> &'a FileMatches {
        results.iter().find(|f| f.file == file).unwrap()
    }

    #[test]
    fn scope_all_is_replace_all() {
        let a = fixture();
        let b = fixture();
        let via_scope =
            replace_in_scope(a.path(), &substring("foo"), "BAR", &ReplaceScope::All).unwrap();
        let direct = replace_core(b.path(), &substring("foo"), "BAR").unwrap();
        assert_eq!(via_scope, direct);
        for f in ["src/main.rs", "src/lib.rs", "README.md", "ignored.txt"] {
            assert_eq!(
                fs::read_to_string(a.path().join(f)).unwrap(),
                fs::read_to_string(b.path().join(f)).unwrap(),
                "{f}"
            );
        }
    }

    #[test]
    fn scope_file_touches_only_that_file() {
        let dir = fixture();
        let scope = ReplaceScope::File {
            path: "src/main.rs".to_string(),
        };
        let summary = replace_in_scope(dir.path(), &substring("foo"), "BAR", &scope).unwrap();
        assert_eq!(
            summary,
            ReplaceSummary {
                files_changed: 1,
                matches_replaced: 2
            }
        );
        let root = dir.path();
        assert_eq!(
            fs::read_to_string(root.join("src/main.rs")).unwrap(),
            "let BAR = 1;\nBAR(bar)\n"
        );
        // Every other matching file is untouched.
        assert_eq!(
            fs::read_to_string(root.join("src/lib.rs")).unwrap(),
            "pub fn foobar() {}\n"
        );
        assert_eq!(
            fs::read_to_string(root.join("README.md")).unwrap(),
            "Foo Bar Baz\n"
        );
        assert_eq!(
            fs::read_to_string(root.join("ignored.txt")).unwrap(),
            "foo here\n"
        );
    }

    #[test]
    fn scope_match_rewrites_exactly_one_of_two_on_a_line() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("a.txt"), "x\nfoo and foo\nfoo\n").unwrap();
        let results = search_core(dir.path(), &substring("foo")).unwrap();
        let a = file_in(&results, "a.txt");
        assert_eq!(a.matches.len(), 3);
        // The SECOND hit on line 2.
        assert_eq!((a.matches[1].line, a.matches[1].start), (2, 8));
        let summary =
            replace_in_scope(dir.path(), &substring("foo"), "BAR", &match_scope(a, 1)).unwrap();
        assert_eq!(
            summary,
            ReplaceSummary {
                files_changed: 1,
                matches_replaced: 1
            }
        );
        assert_eq!(
            fs::read_to_string(dir.path().join("a.txt")).unwrap(),
            "x\nfoo and BAR\nfoo\n"
        );
    }

    #[test]
    fn scope_match_keeps_crlf_line_endings() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("w.txt"), "one\r\nfoo two\r\nthree\r\n").unwrap();
        let results = search_core(dir.path(), &substring("foo")).unwrap();
        let w = file_in(&results, "w.txt");
        replace_in_scope(dir.path(), &substring("foo"), "BAR", &match_scope(w, 0)).unwrap();
        assert_eq!(
            fs::read_to_string(dir.path().join("w.txt")).unwrap(),
            "one\r\nBAR two\r\nthree\r\n"
        );
    }

    #[test]
    fn scope_match_regex_expands_that_matchs_own_captures() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("c.txt"), "id(1) id(2)\n").unwrap();
        let q = SearchQuery {
            pattern: r"id\((\d)\)".to_string(),
            regex: true,
            case_sensitive: true,
            whole_word: false,
        };
        let results = search_core(dir.path(), &q).unwrap();
        let c = file_in(&results, "c.txt");
        replace_in_scope(dir.path(), &q, "key[$1]", &match_scope(c, 1)).unwrap();
        // The SECOND match's capture (2), not the first's (1).
        assert_eq!(
            fs::read_to_string(dir.path().join("c.txt")).unwrap(),
            "id(1) key[2]\n"
        );
    }

    #[test]
    fn scope_match_substring_inserts_dollar_literally() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("p.txt"), "price X\n").unwrap();
        let results = search_core(dir.path(), &substring("X")).unwrap();
        let p = file_in(&results, "p.txt");
        replace_in_scope(dir.path(), &substring("X"), "$1.99", &match_scope(p, 0)).unwrap();
        assert_eq!(
            fs::read_to_string(dir.path().join("p.txt")).unwrap(),
            "price $1.99\n"
        );
    }

    #[test]
    fn scope_match_refuses_when_the_line_text_changed() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("s.txt");
        fs::write(&file, "keep\nfoo here\n").unwrap();
        let results = search_core(dir.path(), &substring("foo")).unwrap();
        let scope = match_scope(file_in(&results, "s.txt"), 0);
        // Edited after the search: same line number, different text.
        fs::write(&file, "keep\nfoo there\n").unwrap();
        let err = replace_in_scope(dir.path(), &substring("foo"), "BAR", &scope).unwrap_err();
        assert!(matches!(err, ProjectSearchError::StaleResult { ref file } if file == "s.txt"));
        assert!(
            err.to_string().contains("changed since the search"),
            "{err}"
        );
        assert_eq!(fs::read_to_string(&file).unwrap(), "keep\nfoo there\n");
    }

    #[test]
    fn scope_match_refuses_an_offset_that_is_no_longer_a_match() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("o.txt");
        fs::write(&file, "foo foo\n").unwrap();
        let results = search_core(dir.path(), &substring("foo")).unwrap();
        let mut scope = match_scope(file_in(&results, "o.txt"), 0);
        // Same line text, but a range no match spans (shifted by one byte).
        if let ReplaceScope::Match { start, end, .. } = &mut scope {
            *start += 1;
            *end += 1;
        }
        let err = replace_in_scope(dir.path(), &substring("foo"), "BAR", &scope).unwrap_err();
        assert!(
            matches!(err, ProjectSearchError::StaleResult { .. }),
            "{err:?}"
        );
        assert_eq!(fs::read_to_string(&file).unwrap(), "foo foo\n");
    }

    #[test]
    fn scope_match_refuses_a_line_past_the_end() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("e.txt");
        fs::write(&file, "foo\n").unwrap();
        let scope = ReplaceScope::Match {
            path: "e.txt".to_string(),
            line: 5,
            start: 0,
            end: 3,
            line_text: "foo".to_string(),
        };
        let err = replace_in_scope(dir.path(), &substring("foo"), "BAR", &scope).unwrap_err();
        assert!(
            matches!(err, ProjectSearchError::StaleResult { .. }),
            "{err:?}"
        );
        assert_eq!(fs::read_to_string(&file).unwrap(), "foo\n");
    }

    #[test]
    fn scope_file_with_no_match_left_is_stale_not_success() {
        let dir = fixture();
        let scope = ReplaceScope::File {
            path: "README.md".to_string(),
        };
        let q = SearchQuery {
            pattern: "foo".to_string(),
            regex: false,
            case_sensitive: true, // README only has "Foo"
            whole_word: false,
        };
        let err = replace_in_scope(dir.path(), &q, "BAR", &scope).unwrap_err();
        assert!(matches!(err, ProjectSearchError::StaleResult { ref file } if file == "README.md"));
        assert_eq!(
            fs::read_to_string(dir.path().join("README.md")).unwrap(),
            "Foo Bar Baz\n"
        );
    }

    #[test]
    fn scope_path_outside_the_root_is_refused() {
        let outer = TempDir::new().unwrap();
        let root = outer.path().join("proj");
        fs::create_dir(&root).unwrap();
        let victim = outer.path().join("victim.txt");
        fs::write(&victim, "foo\n").unwrap();
        for scope in [
            ReplaceScope::File {
                path: "../victim.txt".to_string(),
            },
            ReplaceScope::Match {
                path: "../victim.txt".to_string(),
                line: 1,
                start: 0,
                end: 3,
                line_text: "foo".to_string(),
            },
        ] {
            let err = replace_in_scope(&root, &substring("foo"), "BAR", &scope).unwrap_err();
            assert!(
                matches!(err, ProjectSearchError::ReadFailed { .. }),
                "{err:?}"
            );
        }
        assert_eq!(fs::read_to_string(&victim).unwrap(), "foo\n");
    }

    #[test]
    fn scope_deserializes_from_the_kind_tagged_ipc_shape() {
        let all: ReplaceScope = serde_json::from_str(r#"{"kind":"all"}"#).unwrap();
        assert_eq!(all, ReplaceScope::All);
        let file: ReplaceScope =
            serde_json::from_str(r#"{"kind":"file","path":"src/a.rs"}"#).unwrap();
        assert_eq!(
            file,
            ReplaceScope::File {
                path: "src/a.rs".to_string()
            }
        );
        let m: ReplaceScope = serde_json::from_str(
            r#"{"kind":"match","path":"a","line":2,"start":1,"end":4,"line_text":"xfoo"}"#,
        )
        .unwrap();
        assert_eq!(
            m,
            ReplaceScope::Match {
                path: "a".to_string(),
                line: 2,
                start: 1,
                end: 4,
                line_text: "xfoo".to_string()
            }
        );
    }

    // ── review-quality CRITICAL (M16.5 WP6): File scope matches PER LINE, like search ───

    #[test]
    fn scope_file_honours_anchors_per_line_like_search() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("a.txt");
        fs::write(&file, "foo x\nbar\nfoo y\nend foo\n").unwrap();
        for (pattern, want) in [
            ("^foo", "Z x\nbar\nZ y\nend foo\n"),
            ("foo$", "foo x\nbar\nfoo y\nend Z\n"),
        ] {
            fs::write(&file, "foo x\nbar\nfoo y\nend foo\n").unwrap();
            let q = SearchQuery {
                pattern: pattern.to_string(),
                regex: true,
                case_sensitive: true,
                whole_word: false,
            };
            // What the operator saw in Find Results …
            let shown = total(&search_core(dir.path(), &q).unwrap());
            let scope = ReplaceScope::File {
                path: "a.txt".to_string(),
            };
            let s = replace_in_scope(dir.path(), &q, "Z", &scope).unwrap();
            // … is exactly what "Replace in file" replaced. (Whole-file matching replaced 1
            // of 2 for `^foo` and refused `foo$` as stale.)
            assert_eq!(s.matches_replaced as usize, shown, "{pattern}");
            assert_eq!(fs::read_to_string(&file).unwrap(), want, "{pattern}");
        }
    }

    #[test]
    fn scope_file_keeps_crlf_and_untouched_lines_byte_for_byte() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("w.txt");
        fs::write(&file, "foo\r\nkeep\r\n\r\nfoo foo").unwrap();
        let scope = ReplaceScope::File {
            path: "w.txt".to_string(),
        };
        let s = replace_in_scope(dir.path(), &substring("foo"), "B", &scope).unwrap();
        assert_eq!(s.matches_replaced, 3);
        assert_eq!(fs::read_to_string(&file).unwrap(), "B\r\nkeep\r\n\r\nB B");
    }

    #[test]
    fn line_split_is_exactly_str_lines() {
        for contents in [
            "",
            "a",
            "a\n",
            "a\nb",
            "a\r\nb\r\n",
            "a\r",
            "a\rb\n",
            "\n\n",
            "x\r\n\r\ny",
        ] {
            let ours: Vec<&str> = lines_with_terminators(contents)
                .map(|(_, t, _)| t)
                .collect();
            let std: Vec<&str> = contents.lines().collect();
            assert_eq!(ours, std, "{contents:?}");
            // And the pieces reassemble to the original, byte for byte.
            let whole: String = lines_with_terminators(contents)
                .map(|(_, t, term)| format!("{t}{term}"))
                .collect();
            assert_eq!(whole, contents, "{contents:?}");
        }
    }
}
