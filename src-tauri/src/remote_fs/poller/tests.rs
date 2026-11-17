use super::*;
use crate::remote_fs::tests::LocalShell;
use crate::remote_fs::ExecFailure;
use std::sync::atomic::AtomicBool;
use std::time::Instant;
use tempfile::TempDir;

const HOST: &str = "me@mini-host";

fn target(path: &str) -> ValidTarget {
    ValidTarget::new(HOST, path).unwrap()
}

fn sub(id: &str, path: &str) -> Sub {
    Sub {
        workspace_id: id.into(),
        target: target(path),
        last: None,
        active: true,
    }
}

/// A listing reply: `(root index, dir index, name, size, mtime_ms)` per entry, framed.
fn listing(entries: &[(usize, usize, &str, u64, i64)]) -> String {
    let mut s = String::from("CLAUDESK-FS:begin\n");
    for (ri, di, name, size, mtime) in entries {
        s.push_str(&format!(
            "CLAUDESK-FS:e\t{ri}\t{di}\t{name}\tf\t{size}\t{mtime}\n"
        ));
    }
    s.push_str("CLAUDESK-FS:end\n");
    s
}

/// Thread-safe exec double: records every command, answers with the current `reply`.
#[derive(Default)]
struct Scripted {
    calls: Mutex<Vec<String>>,
    reply: Mutex<Option<String>>,
}

impl Scripted {
    fn answering(reply: String) -> Arc<Self> {
        let s = Self::default();
        *s.reply.lock().unwrap() = Some(reply);
        Arc::new(s)
    }
    fn set(&self, reply: String) {
        *self.reply.lock().unwrap() = Some(reply);
    }
    fn count(&self) -> usize {
        self.calls.lock().unwrap().len()
    }
}

impl RemoteExec for Scripted {
    fn run(&self, _t: &ValidTarget, cmd: &str, _ms: u64) -> Result<String, ExecFailure> {
        self.calls.lock().unwrap().push(cmd.to_string());
        self.reply
            .lock()
            .unwrap()
            .clone()
            .ok_or(ExecFailure::LinkDown)
    }
}

struct Env {
    gate: AtomicBool,
    up: AtomicBool,
}

impl Env {
    fn new(gate: bool, up: bool) -> Arc<Self> {
        Arc::new(Self {
            gate: AtomicBool::new(gate),
            up: AtomicBool::new(up),
        })
    }
}

impl PollEnv for Env {
    fn gate_on(&self) -> bool {
        self.gate.load(Ordering::SeqCst)
    }
    fn link_up(&self, _host: &str) -> bool {
        self.up.load(Ordering::SeqCst)
    }
}

fn collect() -> (Arc<Mutex<Vec<FsChange>>>, impl Fn(FsChange)) {
    let got: Arc<Mutex<Vec<FsChange>>> = Arc::default();
    let g = Arc::clone(&got);
    (got, move |c| g.lock().unwrap().push(c))
}

// ── snapshot + diff (pure) ──────────────────────────────────────────────────────────────────────

#[test]
fn snapshot_is_the_curated_docs_set_only() {
    let grid = parse_listing(
        &listing(&[
            (0, 0, "vision.md", 10, 1),
            (0, 0, "notes.txt", 10, 1),
            (0, 0, "CHANGELOG.md", 10, 1),
            (0, 1, ".session.md", 5, 2),
            (0, 2, "a.md", 3, 3),
            (0, 2, "a.txt", 3, 3),
        ]),
        1,
        DOC_DIRS.len(),
    )
    .unwrap();
    let snap = snapshot(&doc_dirs(grid.into_iter().next().unwrap()));
    assert_eq!(
        snap.keys().cloned().collect::<Vec<_>>(),
        vec![
            "workflow-system/product/vision.md".to_string(),
            "workflow-system/state/.session.md".to_string(),
            "workflow-system/state/wip/a.md".to_string(),
        ]
    );
    assert_eq!(snap["workflow-system/state/.session.md"], (2, 5));
}

#[test]
fn diff_reports_created_modified_removed_with_project_relative_paths() {
    let snap = |v: &[(&str, i64, u64)]| -> Snapshot {
        v.iter()
            .map(|(p, m, s)| (p.to_string(), (*m, *s)))
            .collect()
    };
    let prev = snap(&[("a", 1, 1), ("b", 1, 1), ("c", 1, 1)]);
    assert!(diff("w", &prev, &prev).is_none());

    let c = diff(
        "w",
        &prev,
        &snap(&[("a", 1, 1), ("b", 1, 1), ("c", 1, 1), ("d", 1, 1)]),
    )
    .unwrap();
    assert_eq!(
        (c.paths.clone(), c.kind),
        (vec!["d".to_string()], FsKind::Created)
    );
    assert_eq!((c.workspace_id.as_str(), c.git_meta), ("w", false));

    // mtime alone, and size alone, each count as a modification.
    let c = diff("w", &prev, &snap(&[("a", 2, 1), ("b", 1, 9), ("c", 1, 1)])).unwrap();
    assert_eq!(
        (c.paths.clone(), c.kind),
        (vec!["a".into(), "b".into()], FsKind::Modified)
    );

    let c = diff("w", &prev, &snap(&[("a", 1, 1), ("b", 1, 1)])).unwrap();
    assert_eq!(
        (c.paths.clone(), c.kind),
        (vec!["c".to_string()], FsKind::Removed)
    );

    let c = diff("w", &prev, &snap(&[("a", 2, 1), ("b", 1, 1), ("d", 1, 1)])).unwrap();
    assert_eq!(
        (c.paths.clone(), c.kind),
        (vec!["a".into(), "c".into(), "d".into()], FsKind::Other)
    );
}

// ── poll_tick ───────────────────────────────────────────────────────────────────────────────────

#[test]
fn the_first_tick_records_a_baseline_and_emits_nothing_then_changes_emit() {
    let env = Env::new(true, true);
    let exec = Scripted::answering(listing(&[(0, 0, "vision.md", 10, 1)]));
    let (got, emit) = collect();
    let mut subs = vec![sub("w1", "/r/one")];

    assert_eq!(
        poll_tick(&*env, &*exec, HOST, &mut subs, &emit),
        vec![CatchUp::Baseline]
    );
    assert!(got.lock().unwrap().is_empty(), "the baseline emits nothing");

    exec.set(listing(&[
        (0, 0, "vision.md", 11, 1),
        (0, 2, "new.md", 1, 5),
    ]));
    poll_tick(&*env, &*exec, HOST, &mut subs, &emit);
    let got = got.lock().unwrap();
    assert_eq!(got.len(), 1);
    assert_eq!(
        got[0].paths,
        vec![
            "workflow-system/product/vision.md".to_string(),
            "workflow-system/state/wip/new.md".to_string()
        ]
    );
    assert_eq!(got[0].workspace_id, "w1");
}

#[test]
fn two_workspaces_on_one_host_share_one_exec_per_tick_and_get_their_own_diffs() {
    let env = Env::new(true, true);
    let exec = Scripted::answering(listing(&[
        (0, 0, "vision.md", 1, 1),
        (1, 0, "vision.md", 1, 1),
    ]));
    let (got, emit) = collect();
    let mut subs = vec![sub("w1", "/r/one"), sub("w2", "/r/two")];

    poll_tick(&*env, &*exec, HOST, &mut subs, &emit);
    assert_eq!(exec.count(), 1, "one exec for both workspaces");
    let cmd = exec.calls.lock().unwrap()[0].clone();
    assert_eq!(
        cmd,
        remote_cmd::doc_list_command(&DOC_DIRS, &["/r/one", "/r/two"]),
        "both roots in the one batched listing"
    );

    // Only the SECOND root's doc changes: only w2 hears about it.
    exec.set(listing(&[
        (0, 0, "vision.md", 1, 1),
        (1, 0, "vision.md", 2, 1),
    ]));
    poll_tick(&*env, &*exec, HOST, &mut subs, &emit);
    assert_eq!(exec.count(), 2);
    let got = got.lock().unwrap();
    assert_eq!(got.len(), 1);
    assert_eq!(got[0].workspace_id, "w2");
}

#[test]
fn gate_off_or_link_down_runs_no_exec_and_the_first_up_tick_emits_what_changed_meanwhile() {
    let env = Env::new(true, true);
    let exec = Scripted::answering(listing(&[(0, 0, "vision.md", 1, 1)]));
    let (got, emit) = collect();
    let mut subs = vec![sub("w1", "/r/one")];
    poll_tick(&*env, &*exec, HOST, &mut subs, &emit);
    assert_eq!(exec.count(), 1);

    // The doc changes while the gate is OFF, then while the link is down: no exec at all.
    exec.set(listing(&[(0, 0, "vision.md", 2, 7)]));
    env.gate.store(false, Ordering::SeqCst);
    assert_eq!(
        poll_tick(&*env, &*exec, HOST, &mut subs, &emit),
        vec![CatchUp::GateOff]
    );
    env.gate.store(true, Ordering::SeqCst);
    env.up.store(false, Ordering::SeqCst);
    assert_eq!(
        poll_tick(&*env, &*exec, HOST, &mut subs, &emit),
        vec![CatchUp::LinkDown]
    );
    assert_eq!(
        exec.count(),
        1,
        "gate OFF and link down each cost zero execs"
    );
    assert!(got.lock().unwrap().is_empty());

    // Up again: the first tick diffs against the snapshot from before the drop.
    env.up.store(true, Ordering::SeqCst);
    poll_tick(&*env, &*exec, HOST, &mut subs, &emit);
    let got = got.lock().unwrap();
    assert_eq!(got.len(), 1);
    assert_eq!(
        got[0].paths,
        vec!["workflow-system/product/vision.md".to_string()]
    );
}

#[test]
fn a_failed_or_cut_exec_keeps_the_last_snapshot() {
    let env = Env::new(true, true);
    let exec = Scripted::answering(listing(&[(0, 0, "vision.md", 1, 1)]));
    let (got, emit) = collect();
    let mut subs = vec![sub("w1", "/r/one")];
    poll_tick(&*env, &*exec, HOST, &mut subs, &emit);

    // A cut reply (no `end`) must not read as "every doc was removed".
    exec.set("CLAUDESK-FS:begin\n".into());
    assert!(matches!(
        poll_tick(&*env, &*exec, HOST, &mut subs, &emit)[..],
        [CatchUp::Failed { .. }]
    ));
    *exec.reply.lock().unwrap() = None; // the exec fails as a dead master does
    assert_eq!(
        poll_tick(&*env, &*exec, HOST, &mut subs, &emit),
        vec![CatchUp::LinkDown]
    );
    assert!(got.lock().unwrap().is_empty());

    exec.set(listing(&[(0, 0, "vision.md", 1, 1)]));
    poll_tick(&*env, &*exec, HOST, &mut subs, &emit);
    assert!(
        got.lock().unwrap().is_empty(),
        "unchanged since the baseline"
    );
}

/// The REAL listing script (run by the local `perl`) through `poll_tick`: an append, a new WIP item
/// and a removal on disk each come out as the right paths.
#[test]
fn the_real_listing_script_drives_the_diff() {
    let dir = TempDir::new().unwrap();
    let root = dir.path().canonicalize().unwrap().join("proj");
    let w = |rel: &str, body: &str| {
        let p = root.join(rel);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(p, body).unwrap();
    };
    w("workflow-system/product/vision.md", "# v\n");
    w("workflow-system/state/wip/demo.md", "x");
    w("workflow-system/product/archive/old.md", "x");
    let env = Env::new(true, true);
    let (got, emit) = collect();
    let mut subs = vec![sub("w1", root.to_str().unwrap())];
    poll_tick(&*env, &LocalShell, HOST, &mut subs, &emit);
    assert!(got.lock().unwrap().is_empty());

    w("workflow-system/product/vision.md", "# v\nmore\n");
    w("workflow-system/state/wip/new-item.md", "y");
    w(
        "workflow-system/product/archive/old.md",
        "changed, but never listed",
    );
    std::fs::remove_file(root.join("workflow-system/state/wip/demo.md")).unwrap();
    poll_tick(&*env, &LocalShell, HOST, &mut subs, &emit);
    let got = got.lock().unwrap();
    assert_eq!(got.len(), 1);
    assert_eq!(
        got[0].paths,
        vec![
            "workflow-system/product/vision.md".to_string(),
            "workflow-system/state/wip/demo.md".to_string(),
            "workflow-system/state/wip/new-item.md".to_string(),
        ]
    );
    assert_eq!(got[0].kind, FsKind::Other);
}

// ── the registry + workers ──────────────────────────────────────────────────────────────────────

fn wait_until(what: &str, f: impl Fn() -> bool) {
    let deadline = Instant::now() + Duration::from_secs(5);
    while !f() {
        assert!(Instant::now() < deadline, "timed out waiting for: {what}");
        std::thread::sleep(Duration::from_millis(10));
    }
}

fn poller(
    env: Arc<Env>,
    exec: Arc<Scripted>,
    interval: Duration,
) -> (RemotePoller, Arc<Mutex<Vec<FsChange>>>) {
    let got: Arc<Mutex<Vec<FsChange>>> = Arc::default();
    let g = Arc::clone(&got);
    let p = RemotePoller::new(
        env,
        exec,
        Arc::new(move |c| g.lock().unwrap().push(c)),
        interval,
    );
    (p, got)
}

fn answer(rx: mpsc::Receiver<CatchUp>) -> CatchUp {
    rx.recv_timeout(Duration::from_secs(5))
        .expect("the catch-up was answered")
}

#[test]
fn a_subscription_is_paused_until_its_catch_up_and_runs_no_exec_meanwhile() {
    let exec = Scripted::answering(listing(&[(0, 0, "vision.md", 1, 1)]));
    let (p, _got) = poller(
        Env::new(true, true),
        Arc::clone(&exec),
        Duration::from_millis(10),
    );
    p.subscribe("w1", target("/r/one"));
    std::thread::sleep(Duration::from_millis(100));
    assert_eq!(p.live_workers(), 1);
    assert_eq!(exec.count(), 0, "a paused subscription costs no exec");

    // The first catch-up activates it and answers at once (an interval far away would not do).
    assert_eq!(
        answer(p.catch_up("w1", target("/r/one"))),
        CatchUp::Baseline
    );
    p.unsubscribe_all();
    wait_until("the worker exits", || p.live_workers() == 0);
}

#[test]
fn a_catch_up_is_answered_now_not_an_interval_later_and_delivers_what_changed_while_paused() {
    // An interval far longer than the test: every tick here comes from a catch-up's wake.
    let exec = Scripted::answering(listing(&[(0, 0, "vision.md", 1, 1)]));
    let (p, got) = poller(
        Env::new(true, true),
        Arc::clone(&exec),
        Duration::from_secs(600),
    );
    assert_eq!(
        answer(p.catch_up("w1", target("/r/one"))),
        CatchUp::Baseline
    );

    p.pause("w1");
    exec.set(listing(&[(0, 0, "vision.md", 2, 9)])); // CC writes while the user is away
    let paths = vec!["workflow-system/product/vision.md".to_string()];
    assert_eq!(
        answer(p.catch_up("w1", target("/r/one"))),
        CatchUp::Changed {
            paths: paths.clone()
        }
    );
    assert_eq!(
        got.lock().unwrap().len(),
        1,
        "and the change went out as fs-change"
    );
    assert_eq!(got.lock().unwrap()[0].paths, paths);
    assert_eq!(
        answer(p.catch_up("w1", target("/r/one"))),
        CatchUp::Unchanged
    );
    p.unsubscribe_all();
    wait_until("the worker exits", || p.live_workers() == 0);
}

#[test]
fn a_catch_up_reports_a_link_down_or_a_gate_off() {
    let exec = Scripted::answering(listing(&[]));
    let env = Env::new(true, false);
    let (p, _got) = poller(
        Arc::clone(&env),
        Arc::clone(&exec),
        Duration::from_secs(600),
    );
    assert_eq!(
        answer(p.catch_up("w1", target("/r/one"))),
        CatchUp::LinkDown
    );
    env.gate.store(false, Ordering::SeqCst);
    assert_eq!(answer(p.catch_up("w1", target("/r/one"))), CatchUp::GateOff);
    assert_eq!(exec.count(), 0);
    p.unsubscribe_all();
    wait_until("the worker exits", || p.live_workers() == 0);
}

#[test]
fn only_active_workspaces_are_in_the_one_exec_per_host() {
    let exec = Scripted::answering(listing(&[
        (0, 0, "vision.md", 1, 1),
        (1, 0, "vision.md", 1, 1),
    ]));
    let (p, _got) = poller(
        Env::new(true, true),
        Arc::clone(&exec),
        Duration::from_secs(600),
    );
    p.subscribe("w1", target("/r/one"));
    p.subscribe("w2", target("/r/two"));
    answer(p.catch_up("w2", target("/r/two")));
    assert_eq!(
        exec.calls.lock().unwrap().last().unwrap(),
        &remote_cmd::doc_list_command(&DOC_DIRS, &["/r/two"]),
        "the paused w1 is left out"
    );
    answer(p.catch_up("w1", target("/r/one")));
    assert_eq!(
        exec.calls.lock().unwrap().last().unwrap(),
        &remote_cmd::doc_list_command(&DOC_DIRS, &["/r/one", "/r/two"]),
        "both active: one exec, both roots (in subscription order)"
    );
    assert_eq!(
        p.live_workers(),
        1,
        "one worker per host, not per workspace"
    );
    p.unsubscribe_all();
    wait_until("the worker exits", || p.live_workers() == 0);
}

#[test]
fn pausing_every_workspace_stops_the_execs_but_keeps_the_worker() {
    let exec = Scripted::answering(listing(&[]));
    let (p, _got) = poller(
        Env::new(true, true),
        Arc::clone(&exec),
        Duration::from_millis(20),
    );
    answer(p.catch_up("w1", target("/r/one")));
    wait_until("steady ticks", || exec.count() >= 3);
    p.pause("w1");
    std::thread::sleep(Duration::from_millis(60)); // a tick in flight may still finish
    let after = exec.count();
    std::thread::sleep(Duration::from_millis(150));
    assert_eq!(
        exec.count(),
        after,
        "no exec while every workspace is paused"
    );
    assert_eq!(
        p.live_workers(),
        1,
        "the subscription (and its snapshot) is kept"
    );
    p.unsubscribe_all();
    wait_until("the worker exits", || p.live_workers() == 0);
}

#[test]
fn the_last_unsubscribe_ends_the_worker_and_no_exec_follows() {
    let exec = Scripted::answering(listing(&[]));
    let (p, _got) = poller(
        Env::new(true, true),
        Arc::clone(&exec),
        Duration::from_millis(20),
    );
    answer(p.catch_up("w1", target("/r/one")));
    answer(p.catch_up("w2", target("/r/two")));
    wait_until("ticks run", || exec.count() >= 3);

    p.unsubscribe("w1");
    std::thread::sleep(Duration::from_millis(60));
    assert_eq!(p.live_workers(), 1, "w2 still holds the host");
    p.unsubscribe("w2");
    wait_until("the worker exits", || p.live_workers() == 0);
    let after = exec.count();
    std::thread::sleep(Duration::from_millis(100));
    assert_eq!(exec.count(), after, "no exec after the last unsubscribe");
}

#[test]
fn an_unsubscribe_disconnects_a_waiting_catch_up() {
    let exec = Scripted::answering(listing(&[]));
    let env = Env::new(true, true);
    // The worker may answer before the unsubscribe lands (Ok) or find the host gone (Disconnected):
    // either way the waiter ends, it never hangs the async command until its timeout.
    let (p, _got) = poller(env, exec, Duration::from_secs(600));
    p.subscribe("w1", target("/r/one"));
    let rx = p.catch_up("w1", target("/r/one"));
    p.unsubscribe("w1");
    match rx.recv_timeout(Duration::from_secs(5)) {
        Ok(_) | Err(mpsc::RecvTimeoutError::Disconnected) => {}
        Err(e) => panic!("a waiting catch-up must end, not hang: {e:?}"),
    }
    wait_until("the worker exits", || p.live_workers() == 0);
}

#[test]
fn a_ticking_worker_delivers_changes_as_fs_change() {
    let exec = Scripted::answering(listing(&[(0, 1, ".session.md", 1, 1)]));
    let (p, got) = poller(
        Env::new(true, true),
        Arc::clone(&exec),
        Duration::from_millis(20),
    );
    answer(p.catch_up("w1", target("/r/one")));
    exec.set(listing(&[(0, 1, ".session.md", 1, 2)]));
    wait_until("the change is emitted", || !got.lock().unwrap().is_empty());
    let c = &got.lock().unwrap()[0];
    assert_eq!(
        c.paths,
        vec!["workflow-system/state/.session.md".to_string()]
    );
    assert_eq!(c.kind, FsKind::Modified);
    p.unsubscribe_all();
    wait_until("the worker exits", || p.live_workers() == 0);
}

#[test]
fn gate_off_workers_run_no_exec() {
    let exec = Scripted::answering(listing(&[]));
    let env = Env::new(false, true);
    let (p, _got) = poller(
        Arc::clone(&env),
        Arc::clone(&exec),
        Duration::from_millis(10),
    );
    assert_eq!(answer(p.catch_up("w1", target("/r/one"))), CatchUp::GateOff);
    std::thread::sleep(Duration::from_millis(100));
    assert_eq!(exec.count(), 0, "gate OFF: zero execs");
    // Positive control: the same worker, gate ON, does exec.
    env.gate.store(true, Ordering::SeqCst);
    wait_until("an exec once the gate is ON", || exec.count() >= 1);
    p.unsubscribe_all();
    wait_until("the worker exits", || p.live_workers() == 0);
}

/// The WP7 review CRITICAL: the Docs panel's catch-up can land BEFORE `remote_poll_start` (React runs
/// the child's effect first, and the two commands race). The late `subscribe` must keep the active
/// subscription and its waiter, not replace it with a paused one.
#[test]
fn a_subscribe_after_a_catch_up_keeps_the_active_subscription_and_its_waiter() {
    let exec = Scripted::answering(listing(&[(0, 0, "vision.md", 1, 1)]));
    // A paused gate holds the first tick off, so the waiter is still pending when `subscribe` lands.
    let env = Env::new(false, true);
    let (p, _got) = poller(
        Arc::clone(&env),
        Arc::clone(&exec),
        Duration::from_millis(20),
    );
    let rx = p.catch_up("w1", target("/r/one"));
    p.subscribe("w1", target("/r/one")); // remote_poll_start, late
    env.gate.store(true, Ordering::SeqCst);
    // The first tick after the gate opens may answer the waiter with the gate-off result if it ran
    // before the store; either way the waiter must be ANSWERED (not disconnected), and polling must
    // carry on because the subscription is still active.
    match rx.recv_timeout(Duration::from_secs(5)) {
        Ok(_) => {}
        Err(e) => panic!("the catch-up waiter was dropped by the late subscribe: {e:?}"),
    }
    wait_until("polling continues: the sub is still active", || {
        exec.count() >= 2
    });

    // A different target for the same id still replaces it (paused again: no more execs).
    p.subscribe("w1", target("/r/other"));
    std::thread::sleep(Duration::from_millis(60));
    let after = exec.count();
    std::thread::sleep(Duration::from_millis(100));
    assert_eq!(
        exec.count(),
        after,
        "a re-targeted subscription starts paused"
    );
    p.unsubscribe_all();
    wait_until("the worker exits", || p.live_workers() == 0);
}
