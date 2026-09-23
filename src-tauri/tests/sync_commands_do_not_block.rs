//! Guard: no SYNCHRONOUS `#[tauri::command]` may reach a blocking call.
//!
//! ## Why
//!
//! Tauri 2 dispatches a sync command on the **main thread**, so any blocking work reached from
//! one freezes the whole UI. The P1 of 2026-08-25 was exactly this. Before the fix at `f998fd5`,
//! `cc_kill` → `SessionRegistry::kill` → `PtyCcSession::kill` → `poll_reaped` → `thread::sleep`,
//! and a slow reap froze the app. Nothing else in the gate could see the class. The incident's
//! own regression tests pin only the two sites that broke.
//!
//! ## Why it is TRANSITIVE
//!
//! ⚠️ The pre-fix `cc_kill` BODY contains no blocking token; the sleep is three calls down. A
//! body-scoped scan would pass the incident that motivated this guard. So every fn and method in
//! the crate is parsed into `name → called names`, and a fn is blocking if it calls a SEED or a
//! crate fn that is itself blocking.
//!
//! ## How names resolve, and which way it errs
//!
//! Calls are matched by their final name only (`reg.kill()` and `session.kill()` both mean "any
//! crate fn named `kill`"). That is deliberately an OVER-approximation: a collision produces a
//! false POSITIVE, which lands in [`LEDGER`] with a stated reason, never a silent pass. `syn`
//! parses call EXPRESSIONS, so a comment or string that names `thread::sleep` is invisible here
//! (the call-vs-mention failure `stale_dead_code_allows.rs` records for greps).
//!
//! ## What is cut
//!
//! The arguments of the spawn calls in [`SPAWN_BOUNDARIES`] (in practice, their closures) are not
//! walked. Blocking work handed to a WORKER thread is the fix, so today's `cc_kill` must not flag.
//!
//! ⚠️ `run_on_main_thread` is deliberately NOT a boundary. A sync command already runs on the
//! main thread, so a closure it marshals there runs on the main thread too and freezes the UI
//! just the same. Cutting it would exempt a real freeze (found at WP9 verify-self, where a
//! `run_on_main_thread(|| thread::sleep(..))` mutant passed).
//!
//! ## What this does NOT cover (stated so it is not assumed)
//!
//! - **A lock held across a main-thread marshal**: the incident's second fault, `tray::reconcile`
//!   holding `state.icon` across `set_icon_with_as_template`. Contention and marshalling are not
//!   calls a name graph can see, so that shape still needs review.
//! - **Calls inside macro invocations**, such as a seed written inside `format!(..)` args. `syn`
//!   does not expand macros.
//! - **Bounded local IO** (`std::fs`, `git2`) is not a seed. That is a deliberate scope choice,
//!   recorded with its measurement in the paydown-2026-09-23 WP9 archive, not an oversight.
//! - **Trait-object and generic dispatch** resolve by method name like everything else, which
//!   over-approximates. They are never "unknown, therefore safe".
//! - **A fn passed as a VALUE** and called through a local name
//!   (`let pause: fn(Duration) = thread::sleep; pause(..)`) is NOT seen. The call resolves to the
//!   local name, not to the fn it holds.

use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet, VecDeque};
use std::path::{Path, PathBuf};

use syn::visit::Visit;

/// Sync commands the guard flags that a human looked at and ACCEPTED, each with its reason.
///
/// ⚠️ Two guards over this table (the one-directional-guard trap, `CLAUDE.md` entry 13):
/// - an unledgered blocking command fails, and
/// - an entry that no longer flags, or names no command, ALSO fails.
///
/// So the table cannot outlive the reason it records.
const LEDGER: &[(&str, &str)] = &[
    // False positives: `status` here is git2's `StatusEntry::status()` / `DiffDelta::status()`
    // accessor, not `Command::status()`. The git2 work itself is bounded local IO (~10ms for
    // `git status` on this 1006-file repo, measured at paydown WP9), which is not a seed.
    (
        "git_changed_files",
        "false positive: git2 `.status()` accessor",
    ),
    (
        "git_commit_diff",
        "false positive: git2 `.status()` accessor",
    ),
    (
        "git_file_hunks",
        "false positive: git2 `.status()` accessor",
    ),
    (
        "git_file_statuses",
        "false positive: git2 `.status()` accessor",
    ),
    // Real, and accepted: the confirmed quit joins one kill thread per session. The joins run
    // in PARALLEL, so the wait is bounded by one `DEFAULT_KILL_TIMING` window (~800ms), and the
    // window is about to close anyway. Waiting is the point: an un-joined kill could be cut
    // short by `app.exit(0)`.
    (
        "quit_now",
        "accepted: bounded, parallel kill joins on the terminal quit path",
    ),
];

/// A call whose final segment is one of these, at one of these arities, is blocking.
/// `None` means any arity. The arity is what tells `handle.join()` (0 args, blocks) apart from
/// `path.join(x)` (1 arg, does not), and `child.wait()` apart from nothing else that collides.
const SEEDS: &[(&str, Option<usize>)] = &[
    ("sleep", None),
    ("join", Some(0)),
    ("wait", None),
    ("wait_with_output", Some(0)),
    ("wait_timeout", None),
    ("recv", Some(0)),
    ("recv_timeout", Some(1)),
    ("output", Some(0)),
    ("status", Some(0)),
    ("block_on", None),
];

/// Calls whose closure arguments run on a WORKER thread. Not `run_on_main_thread`; see the module
/// doc, "What is cut".
const SPAWN_BOUNDARIES: &[&str] = &["spawn", "spawn_blocking"];

#[derive(Default)]
struct FnFacts {
    /// Names this fn calls (crate-resolution happens later).
    calls: BTreeSet<String>,
    /// Seeds this fn calls directly.
    seeds: BTreeSet<String>,
}

struct CallCollector<'a> {
    facts: &'a mut FnFacts,
}

impl CallCollector<'_> {
    fn record(&mut self, name: String, arity: usize) {
        if SEEDS
            .iter()
            .any(|(s, a)| *s == name && a.is_none_or(|a| a == arity))
        {
            self.facts.seeds.insert(name.clone());
        }
        self.facts.calls.insert(name);
    }
}

impl<'ast> Visit<'ast> for CallCollector<'_> {
    fn visit_expr_call(&mut self, node: &'ast syn::ExprCall) {
        if let syn::Expr::Path(p) = &*node.func {
            if let Some(seg) = p.path.segments.last() {
                let name = seg.ident.to_string();
                self.record(name.clone(), node.args.len());
                if SPAWN_BOUNDARIES.contains(&name.as_str()) {
                    // The closure runs on another thread: do not walk it.
                    return;
                }
            }
        }
        syn::visit::visit_expr_call(self, node);
    }

    fn visit_expr_method_call(&mut self, node: &'ast syn::ExprMethodCall) {
        let name = node.method.to_string();
        self.record(name.clone(), node.args.len());
        if SPAWN_BOUNDARIES.contains(&name.as_str()) {
            self.visit_expr(&node.receiver);
            return;
        }
        syn::visit::visit_expr_method_call(self, node);
    }

    // Nested fn items are collected as fns of their own, not as calls of the parent.
    fn visit_item_fn(&mut self, _: &'ast syn::ItemFn) {}
}

fn is_cfg_test(attrs: &[syn::Attribute]) -> bool {
    attrs.iter().any(|a| {
        a.path().is_ident("cfg")
            && a.meta
                .require_list()
                .map(|l| l.tokens.to_string().split_whitespace().any(|t| t == "test"))
                .unwrap_or(false)
    })
}

struct Command {
    file: PathBuf,
    name: String,
}

#[derive(Default)]
struct Crate {
    fns: HashMap<String, Vec<FnFacts>>,
    commands: Vec<Command>,
    /// Sync commands exempted because they are `async` (counted, for the anti-vacuity total).
    async_commands: usize,
}

impl Crate {
    fn add_fn(&mut self, name: String, body: &syn::Block) -> &FnFacts {
        let mut facts = FnFacts::default();
        CallCollector { facts: &mut facts }.visit_block(body);
        let v = self.fns.entry(name).or_default();
        v.push(facts);
        v.last().expect("just pushed")
    }

    fn add_items(&mut self, file: &Path, items: &[syn::Item], skip_files: &mut HashSet<PathBuf>) {
        for item in items {
            match item {
                syn::Item::Fn(f) if !is_cfg_test(&f.attrs) => {
                    let name = f.sig.ident.to_string();
                    let command = f.attrs.iter().find(|a| {
                        a.path()
                            .segments
                            .last()
                            .is_some_and(|s| s.ident == "command")
                    });
                    self.add_fn(name.clone(), &f.block);
                    self.add_nested(file, &f.block, skip_files);
                    if let Some(attr) = command {
                        let async_attr = attr
                            .meta
                            .require_list()
                            .map(|l| l.tokens.to_string().contains("async"))
                            .unwrap_or(false);
                        if f.sig.asyncness.is_some() || async_attr {
                            self.async_commands += 1;
                        } else {
                            self.commands.push(Command {
                                file: file.to_path_buf(),
                                name,
                            });
                        }
                    }
                }
                syn::Item::Impl(i) if !is_cfg_test(&i.attrs) => {
                    for ii in &i.items {
                        if let syn::ImplItem::Fn(m) = ii {
                            if !is_cfg_test(&m.attrs) {
                                self.add_fn(m.sig.ident.to_string(), &m.block);
                            }
                        }
                    }
                }
                syn::Item::Trait(t) if !is_cfg_test(&t.attrs) => {
                    for ti in &t.items {
                        if let syn::TraitItem::Fn(m) = ti {
                            if let Some(body) = &m.default {
                                self.add_fn(m.sig.ident.to_string(), body);
                            }
                        }
                    }
                }
                syn::Item::Mod(m) => {
                    if is_cfg_test(&m.attrs) {
                        // An out-of-line `#[cfg(test)] mod x;` names a file that is test-only.
                        if m.content.is_none() {
                            let dir = module_dir(file);
                            skip_files.insert(dir.join(format!("{}.rs", m.ident)));
                            skip_files.insert(dir.join(m.ident.to_string()).join("mod.rs"));
                        }
                        continue;
                    }
                    if let Some((_, inner)) = &m.content {
                        self.add_items(file, inner, skip_files);
                    }
                }
                _ => {}
            }
        }
    }

    /// Fn items declared INSIDE a fn body are fns in their own right.
    fn add_nested(&mut self, file: &Path, block: &syn::Block, skip: &mut HashSet<PathBuf>) {
        let items: Vec<syn::Item> = block
            .stmts
            .iter()
            .filter_map(|s| match s {
                syn::Stmt::Item(i) => Some(i.clone()),
                _ => None,
            })
            .collect();
        self.add_items(file, &items, skip);
    }
}

/// The directory a file's out-of-line child modules live in.
fn module_dir(file: &Path) -> PathBuf {
    let parent = file
        .parent()
        .expect("a source file has a parent")
        .to_path_buf();
    match file.file_name().and_then(|n| n.to_str()) {
        Some("mod.rs") | Some("lib.rs") | Some("main.rs") => parent,
        _ => parent.join(file.file_stem().expect("a .rs file has a stem")),
    }
}

fn rust_files(dir: &Path, out: &mut Vec<PathBuf>) {
    for e in std::fs::read_dir(dir).expect("src/ is readable") {
        let p = e.expect("dir entry").path();
        if p.is_dir() {
            rust_files(&p, out);
        } else if p.extension().is_some_and(|x| x == "rs") {
            out.push(p);
        }
    }
}

fn parse_crate(src: &Path) -> Crate {
    let mut files = Vec::new();
    rust_files(src, &mut files);
    files.sort();
    // Parse everything first so every `#[cfg(test)] mod x;` is known before a file is admitted.
    let parsed: Vec<(PathBuf, syn::File)> = files
        .into_iter()
        .map(|p| {
            let text = std::fs::read_to_string(&p).expect("readable source");
            let ast = syn::parse_file(&text).unwrap_or_else(|e| panic!("{}: {e}", p.display()));
            (p, ast)
        })
        .collect();
    let mut skip = HashSet::new();
    let mut probe = Crate::default();
    for (p, ast) in &parsed {
        probe.add_items(p, &ast.items, &mut skip);
    }
    let mut krate = Crate::default();
    let mut unused = HashSet::new();
    for (p, ast) in &parsed {
        if !skip.contains(p) {
            krate.add_items(p, &ast.items, &mut unused);
        }
    }
    krate
}

/// Every crate fn name that transitively reaches a seed.
fn blocking_names(krate: &Crate) -> HashSet<String> {
    let mut blocking: HashSet<String> = krate
        .fns
        .iter()
        .filter(|(_, v)| v.iter().any(|f| !f.seeds.is_empty()))
        .map(|(n, _)| n.clone())
        .collect();
    loop {
        let before = blocking.len();
        for (name, v) in &krate.fns {
            if !blocking.contains(name)
                && v.iter()
                    .any(|f| f.calls.iter().any(|c| blocking.contains(c)))
            {
                blocking.insert(name.clone());
            }
        }
        if blocking.len() == before {
            return blocking;
        }
    }
}

/// A shortest call chain from `start` to a seed, for the failure message.
fn chain(krate: &Crate, blocking: &HashSet<String>, start: &str) -> Vec<String> {
    let mut prev: HashMap<String, String> = HashMap::new();
    let mut queue = VecDeque::from([start.to_string()]);
    let mut seen = HashSet::from([start.to_string()]);
    while let Some(n) = queue.pop_front() {
        for f in krate.fns.get(&n).into_iter().flatten() {
            if let Some(seed) = f.seeds.iter().next() {
                let mut path = vec![seed.clone(), n.clone()];
                let mut cur = n.clone();
                while let Some(p) = prev.get(&cur) {
                    path.push(p.clone());
                    cur = p.clone();
                }
                path.reverse();
                return path;
            }
            for c in &f.calls {
                if blocking.contains(c) && seen.insert(c.clone()) {
                    prev.insert(c.clone(), n.clone());
                    queue.push_back(c.clone());
                }
            }
        }
    }
    vec![start.to_string(), "<no chain found>".to_string()]
}

fn src_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("src")
}

/// `(flagged command name → "file: chain")` for the crate at `src`.
fn flagged(krate: &Crate, root: &Path) -> BTreeMap<String, String> {
    let blocking = blocking_names(krate);
    krate
        .commands
        .iter()
        .filter(|c| blocking.contains(&c.name))
        .map(|c| {
            let file = c.file.strip_prefix(root).unwrap_or(&c.file).display();
            let path = chain(krate, &blocking, &c.name).join(" → ");
            (c.name.clone(), format!("{file}: {path}"))
        })
        .collect()
}

/// Ledger entries that no longer flag. A name that is not a sync command never flags, so it is
/// stale by the same rule.
fn stale_entries<'a>(found: &BTreeMap<String, String>, ledger: &[(&'a str, &str)]) -> Vec<&'a str> {
    ledger
        .iter()
        .map(|(n, _)| *n)
        .filter(|n| !found.contains_key(*n))
        .collect()
}

#[test]
fn no_sync_tauri_command_reaches_a_blocking_call() {
    let krate = parse_crate(&src_dir());
    let found = flagged(&krate, &src_dir());

    // Anti-vacuity: the enumerator must see every command the source declares. A parser that
    // silently skipped a file would otherwise report "nothing blocks".
    let declared = {
        let mut files = Vec::new();
        rust_files(&src_dir(), &mut files);
        files
            .iter()
            .map(|p| {
                std::fs::read_to_string(p)
                    .expect("readable")
                    .lines()
                    .filter(|l| l.trim_start().starts_with("#[tauri::command"))
                    .count()
            })
            .sum::<usize>()
    };
    let scanned = krate.commands.len() + krate.async_commands;
    println!(
        "scanned {scanned} commands ({} sync, {} async); {} crate fns reach a seed",
        krate.commands.len(),
        krate.async_commands,
        blocking_names(&krate).len()
    );
    assert_eq!(
        scanned, declared,
        "the parser saw {scanned} commands but the source declares {declared}; a file or item \
         form is being skipped, so this guard is blind to part of the crate"
    );
    assert!(
        !blocking_names(&krate).is_empty(),
        "no crate fn reaches a seed; the seed list or the call collector is broken"
    );

    let ledgered: BTreeSet<&str> = LEDGER.iter().map(|(n, _)| *n).collect();
    let unledgered: Vec<String> = found
        .iter()
        .filter(|(n, _)| !ledgered.contains(n.as_str()))
        .map(|(n, c)| format!("  {n} ({c})"))
        .collect();
    assert!(
        unledgered.is_empty(),
        "these SYNC #[tauri::command]s run on the MAIN THREAD and reach a blocking call. Move \
         the blocking work to a worker (`thread::spawn`, or make the command `async` with \
         `spawn_blocking`); ledger it only if the chain is a false positive:\n{}",
        unledgered.join("\n")
    );

    let command_names: HashSet<&str> = krate.commands.iter().map(|c| c.name.as_str()).collect();
    let stale = stale_entries(&found, LEDGER);
    assert!(
        stale.is_empty(),
        "these LEDGER entries no longer flag (or are not sync commands: {:?}); delete them so \
         the ledger cannot outlive its reason: {stale:?}",
        stale
            .iter()
            .filter(|n| !command_names.contains(**n))
            .collect::<Vec<_>>()
    );
}

// ─── The analyzer's own tests ─────────────────────────────────────────────────────────────────
//
// Each proves one property on a fixture crate small enough to read. These are the paydown WP9
// mutation proofs made permanent: the live test above can only say "today's tree is clean",
// which a broken analyzer would also say.

/// Parse a one-file fixture crate and return what the guard would flag.
fn flag_fixture(src: &str) -> BTreeMap<String, String> {
    let dir = tempfile::TempDir::new().expect("tempdir");
    std::fs::write(dir.path().join("lib.rs"), src).expect("write fixture");
    flagged(&parse_crate(dir.path()), dir.path())
}

#[test]
fn the_pre_fix_cc_kill_shape_is_flagged_through_three_calls() {
    // The 2026-08-25 P1, reduced: no blocking token in the command body at all.
    let found = flag_fixture(
        r#"
        struct Registry; struct Session;
        impl Registry { fn kill(&mut self) { Session.kill() } }
        impl Session {
            fn kill(&self) { self.poll_reaped(); }
            fn poll_reaped(&self) { std::thread::sleep(std::time::Duration::from_millis(100)); }
        }
        #[tauri::command]
        pub fn cc_kill() { Registry.kill(); }
        "#,
    );
    assert_eq!(
        found
            .get("cc_kill")
            .map(|c| c.ends_with("kill → poll_reaped → sleep")),
        Some(true),
        "got {found:?}"
    );
}

#[test]
fn work_handed_to_a_worker_is_not_flagged_but_the_same_call_inline_is() {
    let spawned = flag_fixture(
        r#"
        fn slow() { std::thread::sleep(std::time::Duration::from_millis(1)); }
        #[tauri::command]
        pub fn cmd() { std::thread::spawn(move || slow()); }
        "#,
    );
    assert!(spawned.is_empty(), "got {spawned:?}");
    // Positive control: the identical call outside the closure.
    let inline = flag_fixture(
        r#"
        fn slow() { std::thread::sleep(std::time::Duration::from_millis(1)); }
        #[tauri::command]
        pub fn cmd() { slow(); }
        "#,
    );
    assert!(inline.contains_key("cmd"), "got {inline:?}");
}

#[test]
fn work_marshalled_to_the_main_thread_is_still_flagged() {
    // A sync command is already ON the main thread, so this freezes the UI just the same. Found
    // as a hole at WP9 verify-self, when `run_on_main_thread` was briefly treated as a boundary.
    let found = flag_fixture(
        r#"
        #[tauri::command]
        pub fn cmd(app: AppHandle) {
            app.run_on_main_thread(|| std::thread::sleep(std::time::Duration::from_millis(1)));
        }
        "#,
    );
    assert!(found.contains_key("cmd"), "got {found:?}");
}

#[test]
fn async_commands_are_exempt_in_both_spellings() {
    let found = flag_fixture(
        r#"
        fn slow() { std::thread::sleep(std::time::Duration::from_millis(1)); }
        #[tauri::command]
        pub async fn a() { slow(); }
        #[tauri::command(async)]
        pub fn b() { slow(); }
        #[tauri::command]
        pub fn c() { slow(); }
        "#,
    );
    assert_eq!(found.keys().collect::<Vec<_>>(), ["c"], "got {found:?}");
}

#[test]
fn arity_separates_a_thread_join_from_a_path_join() {
    let found = flag_fixture(
        r#"
        #[tauri::command]
        pub fn path_join(p: PathBuf) { let _ = p.join("x"); }
        #[tauri::command]
        pub fn thread_join(h: JoinHandle<()>) { let _ = h.join(); }
        "#,
    );
    assert_eq!(
        found.keys().collect::<Vec<_>>(),
        ["thread_join"],
        "got {found:?}"
    );
}

#[test]
fn a_comment_or_string_naming_a_seed_is_not_a_call() {
    let found = flag_fixture(
        r#"
        /// Calls `std::thread::sleep(d)`, allegedly.
        #[tauri::command]
        pub fn cmd() {
            // std::thread::sleep(std::time::Duration::from_secs(1));
            let _ = "std::thread::sleep(d)";
        }
        "#,
    );
    assert!(found.is_empty(), "got {found:?}");
}

#[test]
fn test_only_code_is_not_part_of_the_graph() {
    // A `#[cfg(test)]` helper named like a production fn must not make the production fn blocking.
    let found = flag_fixture(
        r#"
        fn helper() {}
        #[tauri::command]
        pub fn cmd() { helper(); }
        #[cfg(test)]
        mod tests {
            fn helper() { std::thread::sleep(std::time::Duration::from_millis(1)); }
        }
        "#,
    );
    assert!(found.is_empty(), "got {found:?}");
}

#[test]
fn the_reverse_guard_catches_an_entry_that_no_longer_flags_or_names_nothing() {
    let found = BTreeMap::from([("real".to_string(), "x: real → sleep".to_string())]);
    let ledger = [
        ("real", "kept"),
        ("fixed_since", "stale"),
        ("never_existed", "typo"),
    ];
    assert_eq!(
        stale_entries(&found, &ledger),
        ["fixed_since", "never_existed"]
    );
}

#[test]
fn a_long_chain_is_resolved_to_a_fixpoint_not_a_single_pass() {
    // A single pass over the fn map can still resolve a short chain if iteration happens to
    // visit callees first, and `HashMap` order is random per run. Eight hops make a single-pass
    // closure fail on all but ~1 in 40,320 orders, so this test catches a dropped fixpoint loop.
    let found = flag_fixture(
        r#"
        fn h8() { std::thread::sleep(std::time::Duration::from_millis(1)); }
        fn h7() { h8() } fn h6() { h7() } fn h5() { h6() } fn h4() { h5() }
        fn h3() { h4() } fn h2() { h3() } fn h1() { h2() }
        #[tauri::command]
        pub fn cmd() { h1(); }
        "#,
    );
    assert_eq!(
        found.get("cmd").map(String::as_str),
        Some("lib.rs: cmd → h1 → h2 → h3 → h4 → h5 → h6 → h7 → h8 → sleep"),
        "got {found:?}"
    );
}
