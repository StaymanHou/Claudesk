//! Guard (M17 WP6, `arch/remote-workspaces.md` §G): every `#[tauri::command]` that reaches the
//! LOCAL filesystem, git, a local app or a local process refuses a remote workspace's `ssh://` key
//! as its FIRST statement.
//!
//! ## Why a source pin, and what pairs with it
//!
//! Most of these commands take an `AppHandle` / `State`, which a unit test cannot build without
//! Tauri's `test` feature. The commands that need neither are called for real in
//! `src/workspace_surfaces/tests.rs` (equality with the refusal text). This file covers ALL of
//! them structurally, and it is what fails when:
//!
//! 1. a refused command loses its `refuse_remote` call, or the call stops being the FIRST statement
//!    (a refusal after `validate_root` / `canonicalize` is too late: the raw `os error` wins); or
//! 2. a NEW `#[tauri::command]` is added to a refused module without being listed in [`REFUSED`]
//!    or [`EXEMPT`] (the set pin).
//!
//! `syn` parses the bodies, so a comment or string that names `refuse_remote` does not satisfy
//! it, and a call nested deeper than the first statement does not either.

use std::collections::BTreeSet;
use std::path::Path;

/// The modules whose every command is local-only, and the commands outside them that are.
const MODULE_FILES: &[&str] = &[
    "editor_fs/commands.rs",
    "docs/commands.rs",
    "git_diff/commands.rs",
    "git_status/commands.rs",
    "fs_index/commands.rs",
    "fs_watch/commands.rs",
    "project_search/commands.rs",
    "sublime/commands.rs",
    "finder/commands.rs",
    "wip/commands.rs",
    "transcript/commands.rs",
];

/// Commands that live in a mixed module (scanned by name only, not as a whole-module set).
const EXTRA: &[(&str, &str)] = &[("cc_session/commands.rs", "term_spawn")];

/// Every command that must open with the refusal.
const REFUSED: &[&str] = &[
    // editor_fs
    "read_file",
    "write_file",
    "stat_file",
    "delete_file",
    "trash_path",
    "create_dir",
    "stat_media",
    "open_in_default_app",
    // git
    "git_changed_files",
    "git_file_hunks",
    "git_recent_commits",
    "git_commit_diff",
    "git_file_statuses",
    // fs_index
    "fs_index",
    "fs_tree",
    // fs_watch
    "workspace_watch_start",
    // project_search
    "project_search",
    "project_replace",
    // local apps
    "sublime_open",
    "smerge_open",
    "finder_open",
    // supervisor reads (no error channel: they withhold, returning empty)
    "wip_read",
    "transcript_tail",
    // a LOCAL shell
    "term_spawn",
];

/// M17 WP7 — commands in a scanned module that are ROUTED by target instead of refused: they take a
/// root and decide local vs remote themselves (`arch/remote-workspaces.md` §F). Listed so a new
/// command in the module must still be classified (the set pin below), and pinned NOT to open with
/// the refusal (that would silently make the routed surface absent again).
const ROUTED: &[(&str, &str)] = &[
    (
        "docs_list",
        "Docs on a remote workspace: `remote_fs::list_docs` (WP7.3)",
    ),
    (
        "docs_read",
        "Docs on a remote workspace: `remote_fs::read_doc` (WP7.3)",
    ),
    (
        "docs_stat",
        "Recycle's `.session.md` baseline: `remote_fs::stat_doc` (WP7.4)",
    ),
];

/// Commands in a refused module that take no root, with the reason.
const EXEMPT: &[(&str, &str)] = &[(
    "workspace_watch_stop",
    "takes only a workspace id; stopping a watcher that was never started is a no-op",
)];

fn src() -> std::path::PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("src")
}

fn is_command(f: &syn::ItemFn) -> bool {
    f.attrs.iter().any(|a| {
        let p = a.path();
        p.segments.len() == 2 && p.segments[0].ident == "tauri" && p.segments[1].ident == "command"
    })
}

fn commands_in(rel: &str) -> Vec<syn::ItemFn> {
    let text = std::fs::read_to_string(src().join(rel)).expect("readable source");
    let file = syn::parse_file(&text).expect("parses");
    file.items
        .into_iter()
        .filter_map(|i| match i {
            syn::Item::Fn(f) if is_command(&f) => Some(f),
            _ => None,
        })
        .collect()
}

/// Whether `e` is (or, through `?` / `.is_err()` / `.map_err(..)`, wraps) a call to a path ending
/// in `refuse_remote`.
fn calls_refuse_remote(e: &syn::Expr) -> bool {
    match e {
        syn::Expr::Call(c) => match &*c.func {
            syn::Expr::Path(p) => p
                .path
                .segments
                .last()
                .is_some_and(|s| s.ident == "refuse_remote"),
            _ => false,
        },
        syn::Expr::Try(t) => calls_refuse_remote(&t.expr),
        syn::Expr::MethodCall(m) => calls_refuse_remote(&m.receiver),
        syn::Expr::If(i) => calls_refuse_remote(&i.cond),
        _ => false,
    }
}

fn first_stmt_refuses(f: &syn::ItemFn) -> bool {
    match f.block.stmts.first() {
        Some(syn::Stmt::Expr(e, _)) => calls_refuse_remote(e),
        _ => false,
    }
}

#[test]
fn every_refused_command_opens_with_the_refusal() {
    let mut found = BTreeSet::new();
    let mut missing = Vec::new();
    let mut refused_routed = Vec::new();
    let scan = MODULE_FILES
        .iter()
        .flat_map(|rel| commands_in(rel).into_iter().map(move |f| (*rel, f)))
        .chain(EXTRA.iter().flat_map(|(rel, name)| {
            commands_in(rel)
                .into_iter()
                .filter(move |f| f.sig.ident == *name)
                .map(move |f| (*rel, f))
        }));
    for (rel, f) in scan {
        let name = f.sig.ident.to_string();
        found.insert(name.clone());
        if REFUSED.contains(&name.as_str()) && !first_stmt_refuses(&f) {
            missing.push(format!("{rel}::{name}"));
        }
        if ROUTED.iter().any(|(r, _)| *r == name) && first_stmt_refuses(&f) {
            refused_routed.push(format!("{rel}::{name}"));
        }
    }
    assert!(
        refused_routed.is_empty(),
        "these ROUTED commands open with the refusal, which makes their surface absent on a remote \
         workspace again: {refused_routed:?}"
    );
    assert!(
        missing.is_empty(),
        "these local-only commands do not open with `workspace_surfaces::refuse_remote`: \
         {missing:?}. A remote `ssh://` key would reach the local disk / app first."
    );

    // The set pin: what the modules declare == REFUSED ∪ ROUTED ∪ EXEMPT, both ways.
    let declared: BTreeSet<String> = REFUSED
        .iter()
        .map(|s| s.to_string())
        .chain(ROUTED.iter().map(|(s, _)| s.to_string()))
        .chain(EXEMPT.iter().map(|(s, _)| s.to_string()))
        .collect();
    let unlisted: Vec<_> = found.difference(&declared).collect();
    let stale: Vec<_> = declared.difference(&found).collect();
    assert!(
        unlisted.is_empty(),
        "new #[tauri::command]s in a local-only module: {unlisted:?}. Add each to REFUSED (and open \
         it with `refuse_remote`), to ROUTED (it dispatches by target itself), or to EXEMPT with the \
         reason it takes no root."
    );
    assert!(
        stale.is_empty(),
        "listed commands no longer exist: {stale:?}. Remove them from REFUSED / ROUTED / EXEMPT."
    );
}

/// Anti-vacuity: the matcher rejects the near misses, so a green result means something.
#[test]
fn the_matcher_is_not_vacuous() {
    let f: syn::ItemFn = syn::parse_quote! {
        #[tauri::command]
        fn a(root: String) -> Result<(), String> {
            let r = validate(&root)?;
            crate::workspace_surfaces::refuse_remote(&root)?;
            Ok(())
        }
    };
    assert!(
        !first_stmt_refuses(&f),
        "a refusal AFTER other work must not count"
    );
    let g: syn::ItemFn = syn::parse_quote! {
        #[tauri::command]
        fn b(root: String) -> Result<(), String> {
            // refuse_remote(&root)?;
            let _ = "refuse_remote";
            Ok(())
        }
    };
    assert!(!first_stmt_refuses(&g), "a comment / string must not count");
    let h: syn::ItemFn = syn::parse_quote! {
        #[tauri::command]
        fn c(root: String) -> Result<(), String> {
            crate::workspace_surfaces::refuse_remote(&root)?;
            Ok(())
        }
    };
    assert!(first_stmt_refuses(&h));
}
