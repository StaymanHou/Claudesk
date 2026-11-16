//! Guard: the app-quit teardown (`perform_quit_teardown`, the body of `quit_now`) stops every
//! remote host link, and does it AFTER `kill_all`.
//!
//! ## Why
//!
//! `remote_link`'s ssh masters run in their own process groups, so they survive the app's exit
//! unless something kills them first: `app.exit(0)` ends the process without running the
//! destructors of managed state, so `LinkRegistry`'s `Drop` is no help at quit (M17 WP3 Phase 2,
//! verified live: with `stop_all` in place the master dies on `quit_now`).
//!
//! The ORDER matters too: from WP3 Phase 3 on, a remote workspace's close path cancels tmux
//! copy-mode OVER THE MASTER before typing `/exit`. Stopping the links first would leave every
//! remote session running (R-1).
//!
//! ## What this checks, and what it cannot
//!
//! A SOURCE question (which calls the teardown makes, in which order), so it is answered from the
//! source, with `syn` rather than text: comments and strings cannot satisfy it. It does not prove
//! the master dies; `remote_link`'s `stop_kills_the_master_process_even_while_the_worker_is_busy`
//! does, and the live `quit_now` check in the WP3 Phase 2 WIP did.

use syn::visit::Visit;

/// Every method-call and path-call name in `body`, in source order.
struct Calls(Vec<String>);

impl<'ast> Visit<'ast> for Calls {
    fn visit_expr_method_call(&mut self, m: &'ast syn::ExprMethodCall) {
        // Receiver first: `a.b().c()` evaluates `b` before `c`.
        self.visit_expr(&m.receiver);
        self.0.push(m.method.to_string());
        for a in &m.args {
            self.visit_expr(a);
        }
    }

    fn visit_expr_call(&mut self, c: &'ast syn::ExprCall) {
        if let syn::Expr::Path(p) = &*c.func {
            if let Some(seg) = p.path.segments.last() {
                self.0.push(seg.ident.to_string());
            }
        }
        syn::visit::visit_expr_call(self, c);
    }
}

fn teardown_calls(src: &str) -> Vec<String> {
    let file = syn::parse_file(src).expect("lib.rs parses");
    let f = file
        .items
        .iter()
        .find_map(|i| match i {
            syn::Item::Fn(f) if f.sig.ident == "perform_quit_teardown" => Some(f),
            _ => None,
        })
        .expect("perform_quit_teardown exists in lib.rs");
    let mut calls = Calls(Vec::new());
    calls.visit_block(&f.block);
    calls.0
}

/// `Ok(())` if `calls` contains both, `kill_all` first.
fn check(calls: &[String]) -> Result<(), String> {
    let pos = |n: &str| calls.iter().position(|c| c == n);
    match (pos("kill_all"), pos("stop_all")) {
        (Some(k), Some(s)) if k < s => Ok(()),
        (Some(_), Some(_)) => Err("stop_all runs BEFORE kill_all".into()),
        (_, None) => Err("stop_all is not called: remote masters would outlive the app".into()),
        (None, _) => Err("kill_all is not called".into()),
    }
}

#[test]
fn the_quit_teardown_stops_remote_links_after_killing_sessions() {
    let src = include_str!("../src/lib.rs");
    let calls = teardown_calls(src);
    if let Err(e) = check(&calls) {
        panic!("perform_quit_teardown: {e}. Calls in order: {calls:?}");
    }
}

#[test]
fn the_check_fails_on_a_missing_or_reordered_stop() {
    // The predicate itself, on hand-written bodies, so a guard that could never fail is caught.
    let ok = "fn perform_quit_teardown(app: &A) { reg.kill_all(); links.stop_all(); }";
    assert_eq!(check(&teardown_calls(ok)), Ok(()));
    let missing = "fn perform_quit_teardown(app: &A) { reg.kill_all(); /* links.stop_all(); */ }";
    assert!(check(&teardown_calls(missing)).is_err());
    let reordered = "fn perform_quit_teardown(app: &A) { links.stop_all(); reg.kill_all(); }";
    assert!(check(&teardown_calls(reordered)).is_err());
    let in_string = r#"fn perform_quit_teardown(app: &A) { reg.kill_all(); log("stop_all()"); }"#;
    assert!(
        check(&teardown_calls(in_string)).is_err(),
        "a string must not satisfy it"
    );
}
