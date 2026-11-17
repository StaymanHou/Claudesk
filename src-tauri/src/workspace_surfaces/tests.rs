//! Behavioral half of the refusal pin. Every command that can be called WITHOUT an `AppHandle`
//! is called here with a remote key and must return exactly [`REMOTE_REFUSAL`]. Commands that need
//! an `AppHandle` / `State` (editor_fs, docs, sublime, finder, fs_watch, term_spawn, transcript) are
//! pinned by `tests/remote_refusal_is_first.rs` instead (the call is their first statement).
//!
//! ⚠️ Each assertion is EQUALITY with the refusal text, not "is an error": without the refusal these
//! commands still fail on an `ssh://` key (not a git repo, not a directory), so an `is_err()` check
//! would pass with the refusal deleted.

use super::*;
use crate::fs_index::commands::{fs_index, fs_tree};
use crate::git_diff::commands::{
    git_changed_files, git_commit_diff, git_file_hunks, git_recent_commits,
};
use crate::git_status::commands::git_file_statuses;
use crate::project_search::commands::{project_replace, project_search};
use crate::project_search::SearchQuery;

const KEY: &str = "ssh://u@mini.example/Users/u/proj";

fn q() -> SearchQuery {
    SearchQuery {
        pattern: "x".to_string(),
        regex: false,
        case_sensitive: true,
        whole_word: false,
    }
}

#[test]
fn refuse_remote_refuses_only_a_remote_key() {
    assert_eq!(refuse_remote(KEY), Err(RemoteRefused));
    assert_eq!(refuse_remote("/Users/u/proj"), Ok(()));
    // A relative or empty string is not remote either: the existing validators own those.
    assert_eq!(refuse_remote(""), Ok(()));
    assert_eq!(refuse_remote("proj/ssh://x"), Ok(()));
}

#[test]
fn refusal_text_is_plain_words() {
    let s: String = RemoteRefused.into();
    assert_eq!(s, REMOTE_REFUSAL);
    for raw in ["os error", "No such file", "ssh://", "I/O"] {
        assert!(!s.contains(raw), "{s:?} contains {raw:?}");
    }
}

#[test]
fn git_changed_files_refuses_remote() {
    assert_eq!(git_changed_files(KEY.into()).unwrap_err(), REMOTE_REFUSAL);
}

#[test]
fn git_file_hunks_refuses_remote() {
    assert_eq!(
        git_file_hunks(KEY.into(), "a.txt".into(), false).unwrap_err(),
        REMOTE_REFUSAL
    );
}

#[test]
fn git_recent_commits_refuses_remote() {
    assert_eq!(
        git_recent_commits(KEY.into(), 0, 10).unwrap_err(),
        REMOTE_REFUSAL
    );
}

#[test]
fn git_commit_diff_refuses_remote() {
    assert_eq!(
        git_commit_diff(KEY.into(), "abc".into()).unwrap_err(),
        REMOTE_REFUSAL
    );
}

#[test]
fn git_file_statuses_refuses_remote() {
    assert_eq!(git_file_statuses(KEY.into()).unwrap_err(), REMOTE_REFUSAL);
}

#[test]
fn fs_index_refuses_remote() {
    assert_eq!(fs_index(KEY.into()).unwrap_err(), REMOTE_REFUSAL);
}

#[test]
fn fs_tree_refuses_remote() {
    assert_eq!(fs_tree(KEY.into()).unwrap_err(), REMOTE_REFUSAL);
}

#[test]
fn project_search_refuses_remote() {
    assert_eq!(project_search(KEY.into(), q()).unwrap_err(), REMOTE_REFUSAL);
}

#[test]
fn project_replace_refuses_remote() {
    assert_eq!(
        project_replace(KEY.into(), q(), "y".into(), None).unwrap_err(),
        REMOTE_REFUSAL
    );
}

#[test]
fn wip_read_withholds_for_remote() {
    // No error channel by design (the supervisor's failure direction is WITHHOLDING), so a remote
    // key reads as "no WIP". Paired with the source pin, which checks the refusal is the first
    // statement: this alone could pass by accident (no local `ssh:/…` dir exists).
    let r = crate::wip::commands::wip_read(KEY.into());
    assert_eq!(r.path, None);
    assert!(r.text.is_empty());
}
