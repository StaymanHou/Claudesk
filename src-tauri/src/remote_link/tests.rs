use super::*;
use std::collections::VecDeque;
use std::process::Command;
use std::sync::atomic::AtomicUsize;
use tempfile::TempDir;

// ---------------------------------------------------------------------------------------------
// Pure builders
// ---------------------------------------------------------------------------------------------

#[test]
fn hash8_is_the_first_8_hex_of_sha256_and_stable() {
    // sha256("abc") = ba7816bf8f01cfea… (FIPS 180-2 test vector). A session name derived from
    // this must survive an app upgrade, so it is pinned to the standard, not to an impl.
    assert_eq!(hash8("abc"), "ba7816bf");
    assert_eq!(hash8("abc").len(), 8);
}

#[test]
fn control_path_fits_sun_path() {
    // The bound: a 32-character macOS short name (the longest the account UI allows), under the
    // longer (dev) identifier.
    for identifier in ["com.claudesk.app", "com.claudesk.app.dev"] {
        let app_data = PathBuf::from(format!(
            "/Users/{}/Library/Application Support/{identifier}",
            "u".repeat(32)
        ));
        let ctl = control_path(&app_data, "someone@some-very-long-host.tail0000.ts.net");
        let len = ctl.as_os_str().len();
        assert!(len <= SUN_PATH_MAX_LEN, "{len} bytes: {}", ctl.display());
        assert!(ctl.ends_with(format!(
            "ssh/{}",
            hash8("someone@some-very-long-host.tail0000.ts.net")
        )));
    }
}

#[test]
fn the_master_argv_is_pinned() {
    let argv = master_argv(
        Path::new("/AD/ssh/abcd1234"),
        "/Users/me/.claudesk/com.claudesk.app.dev/hook.sock",
        Path::new("/Users/me/Library/Application Support/com.claudesk.app.dev/hook.sock"),
        "me@mini-host",
    );
    assert_eq!(
        argv,
        [
            "/usr/bin/ssh",
            "-M",
            "-N",
            "-o",
            "ControlPersist=no",
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=10",
            "-o",
            "ServerAliveInterval=15",
            "-o",
            "ServerAliveCountMax=3",
            "-o",
            "ExitOnForwardFailure=yes",
            "-S",
            "/AD/ssh/abcd1234",
            "-R",
            "/Users/me/.claudesk/com.claudesk.app.dev/hook.sock:/Users/me/Library/Application Support/com.claudesk.app.dev/hook.sock",
            "--",
            "me@mini-host",
        ]
    );
    // ⚠️ No StreamLocalBindUnlink: the client option is ignored (bug 2601, reproduced) and the
    // server one would be a requirement on every host. The pre-connect `rm -f` replaces it.
    assert!(!argv.iter().any(|a| a.contains("StreamLocalBindUnlink")));
}

#[test]
fn check_and_exec_argvs_end_options_before_the_host() {
    let ctl = Path::new("/AD/ssh/abcd1234");
    let check = check_argv(ctl, "me@h");
    assert_eq!(
        check,
        [
            "/usr/bin/ssh",
            "-S",
            "/AD/ssh/abcd1234",
            "-O",
            "check",
            "--",
            "me@h"
        ]
    );
    let exec = exec_argv(ctl, "me@h", "true");
    let dd = exec.iter().position(|a| a == "--").unwrap();
    assert_eq!(&exec[dd + 1..], ["me@h", "true"]);
    assert!(exec.contains(&"ControlMaster=no".to_string()));
    assert!(exec.contains(&"BatchMode=yes".to_string()));
}

#[test]
fn the_pre_connect_script_removes_the_stale_socket_before_anything_binds() {
    let s = pre_connect_script("com.claudesk.app.dev");
    assert!(s.contains("rm -f \"$d/hook.sock\""), "{s}");
    // The token is read only by the launcher, at spawn, on the remote. This script never
    // touches it, and no expansion of it is written into a file by THIS shell (quoted heredoc).
    assert!(s.contains("<<'CLAUDESK_EOF'"));
    assert!(!s.contains("<<CLAUDESK_EOF"));
}

#[test]
fn parse_home_takes_the_last_sentinel_line_and_ignores_rc_noise() {
    let out = format!("Welcome!\n{HOME_SENTINEL}/fake\nmore noise\n{HOME_SENTINEL}/Users/me\n");
    assert_eq!(parse_home(&out).as_deref(), Ok("/Users/me"));
    assert_eq!(
        parse_home(&format!("{HOME_SENTINEL}/Users/me/\r\n")).as_deref(),
        Ok("/Users/me")
    );
    for bad in [
        "",
        "/Users/me",
        &format!("{HOME_SENTINEL}relative"),
        &format!("{HOME_SENTINEL}/a b"),
        &format!("{HOME_SENTINEL}/a:b"),
    ] {
        assert!(parse_home(bad).is_err(), "{bad:?}");
    }
}

// ---------------------------------------------------------------------------------------------
// The deployed files, run in real shells
// ---------------------------------------------------------------------------------------------

fn run_pre_connect(shell: &str, home: &Path, identifier: &str) -> std::process::Output {
    Command::new(shell)
        .arg("-c")
        .arg(pre_connect_script(identifier))
        .env("HOME", home)
        .output()
        .expect("shell runs")
}

#[test]
fn the_pre_connect_script_deploys_both_files_and_reports_home_in_sh_and_zsh() {
    for shell in ["/bin/sh", "/bin/zsh"] {
        let home = TempDir::new().unwrap();
        let dir = home.path().join(".claudesk/com.claudesk.app.dev");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("hook.sock"), "stale").unwrap();

        let out = run_pre_connect(shell, home.path(), "com.claudesk.app.dev");
        assert!(
            out.status.success(),
            "{shell}: {}",
            String::from_utf8_lossy(&out.stderr)
        );
        let stdout = String::from_utf8_lossy(&out.stdout);
        assert_eq!(
            parse_home(&stdout).as_deref(),
            Ok(home.path().to_str().unwrap().trim_end_matches('/')),
            "{shell}"
        );
        assert!(
            !dir.join("hook.sock").exists(),
            "{shell}: the stale socket must be removed"
        );
        assert_eq!(
            std::fs::read_to_string(dir.join("tmux.conf")).unwrap(),
            TMUX_CONF,
            "{shell}"
        );
        assert_eq!(
            std::fs::read_to_string(dir.join("cc-launch")).unwrap(),
            cc_launcher(),
            "{shell}"
        );
        use std::os::unix::fs::PermissionsExt;
        let mode = std::fs::metadata(dir.join("cc-launch"))
            .unwrap()
            .permissions()
            .mode()
            & 0o777;
        assert_eq!(mode, 0o700, "{shell}");
        assert!(!dir.join("tmux.conf.tmp").exists() && !dir.join("cc-launch.tmp").exists());

        // Idempotent: a second connect rewrites the same files.
        let again = run_pre_connect(shell, home.path(), "com.claudesk.app.dev");
        assert!(again.status.success(), "{shell}");
        assert_eq!(
            std::fs::read_to_string(dir.join("cc-launch")).unwrap(),
            cc_launcher()
        );
    }
}

#[test]
fn a_hostile_identifier_is_data_in_the_pre_connect_script() {
    let home = TempDir::new().unwrap();
    let canary = home.path().join("pwned");
    let id = format!("x'; touch {}; echo '", canary.display());
    let out = run_pre_connect("/bin/zsh", home.path(), &id);
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    assert!(!canary.exists(), "the identifier executed");
    assert!(home
        .path()
        .join(".claudesk")
        .join(&id)
        .join("cc-launch")
        .exists());
}

/// Run the launcher with a fake `claude` that reports its env and args, one per line.
fn run_launcher(home: &Path, token: Option<&str>, args: &[&str]) -> (bool, String) {
    let bin = home.join("bin");
    std::fs::create_dir_all(&bin).unwrap();
    let fake = bin.join("claude");
    std::fs::write(
        &fake,
        "#!/bin/sh\nprintf 'TOKEN=%s\\n' \"$CLAUDE_CODE_OAUTH_TOKEN\"\n\
printf 'INLINE=%s\\n' \"$CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN\"\n\
printf 'TMUX=%s\\n' \"${TMUX-unset}\"\n\
for a in \"$@\"; do printf 'ARG=%s\\n' \"$a\"; done\n",
    )
    .unwrap();
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(&fake, std::fs::Permissions::from_mode(0o755)).unwrap();
    let launcher = home.join("cc-launch");
    std::fs::write(&launcher, cc_launcher()).unwrap();
    std::fs::set_permissions(&launcher, std::fs::Permissions::from_mode(0o700)).unwrap();
    std::fs::create_dir_all(home.join(".claudesk")).unwrap();
    let token_file = home.join(".claudesk/cc-oauth-token");
    let _ = std::fs::remove_file(&token_file);
    if let Some(t) = token {
        std::fs::write(&token_file, t).unwrap();
    }
    let out = Command::new(&launcher)
        .args(args)
        .env("HOME", home)
        .env("PATH", format!("{}:/usr/bin:/bin", bin.display()))
        .env("TMUX", "/tmp/tmux-501/claudesk,1,0")
        .output()
        .unwrap();
    (
        out.status.success(),
        String::from_utf8_lossy(&out.stdout).into_owned(),
    )
}

#[test]
fn the_launcher_exports_the_token_and_inline_mode_unsets_tmux_and_passes_args_verbatim() {
    let home = TempDir::new().unwrap();
    let args = [
        "--dangerously-skip-permissions",
        "it's $(id) `x`",
        "a b",
        "",
    ];
    let (ok, out) = run_launcher(home.path(), Some("tok-123\n"), &args);
    assert!(ok, "{out}");
    let mut want = vec![
        "TOKEN=tok-123".to_string(),
        "INLINE=1".to_string(),
        "TMUX=unset".to_string(),
    ];
    want.extend(args.iter().map(|a| format!("ARG={a}")));
    assert_eq!(out.lines().collect::<Vec<_>>(), want);
}

#[test]
fn the_launcher_refuses_to_start_claude_without_a_token_file() {
    let home = TempDir::new().unwrap();
    let (ok, out) = run_launcher(home.path(), None, &[]);
    assert!(!ok, "a missing token must not start CC logged out");
    assert!(!out.contains("TOKEN="), "claude must not have run: {out}");
}

// ---------------------------------------------------------------------------------------------
// The link worker, against a fake transport
// ---------------------------------------------------------------------------------------------

#[derive(Default)]
struct FakeTransport {
    /// Results for successive pre-connects; when empty, succeed with `/Users/me`.
    pre: Mutex<VecDeque<Result<String, String>>>,
    pre_calls: AtomicUsize,
    pre_delay: Mutex<Duration>,
    check_ok: AtomicBool,
    spawned: Mutex<Vec<Vec<String>>>,
    /// The exit flag of each spawned master, in order.
    masters: Mutex<Vec<Arc<AtomicBool>>>,
    /// For each spawn: whether the ControlPath (the argv's `-S` value) existed at that moment.
    ctl_existed_at_spawn: Mutex<Vec<bool>>,
    /// How long `check` blocks before answering (a busy worker).
    check_delay: Mutex<Duration>,
    /// When set, the next spawned master is backed by this real process (so it has a real pid).
    real_child: Mutex<Option<Arc<Mutex<std::process::Child>>>>,
}

struct FakeMaster(Arc<AtomicBool>, Option<Arc<Mutex<std::process::Child>>>);

impl Master for FakeMaster {
    fn try_exit(&mut self) -> Option<String> {
        self.0
            .load(Ordering::SeqCst)
            .then(|| "connection lost".to_string())
    }
    fn kill(&mut self) {
        self.0.store(true, Ordering::SeqCst);
    }
    fn pid(&self) -> Option<u32> {
        self.1.as_ref().map(|c| c.lock().unwrap().id())
    }
}

impl Transport for FakeTransport {
    fn pre_connect(&self, _host: &str, script: &str) -> Result<String, String> {
        assert!(script.contains("rm -f"));
        self.pre_calls.fetch_add(1, Ordering::SeqCst);
        let delay = *self.pre_delay.lock().unwrap();
        std::thread::sleep(delay);
        self.pre
            .lock()
            .unwrap()
            .pop_front()
            .unwrap_or_else(|| Ok(format!("{HOME_SENTINEL}/Users/me\n")))
    }
    fn spawn_master(&self, _host: &str, argv: &[String]) -> Result<Box<dyn Master>, String> {
        self.spawned.lock().unwrap().push(argv.to_vec());
        let s = argv.iter().position(|a| a == "-S").unwrap();
        self.ctl_existed_at_spawn
            .lock()
            .unwrap()
            .push(Path::new(&argv[s + 1]).exists());
        let flag = Arc::new(AtomicBool::new(false));
        self.masters.lock().unwrap().push(Arc::clone(&flag));
        let child = self.real_child.lock().unwrap().take();
        Ok(Box::new(FakeMaster(flag, child)))
    }
    fn check(&self, _argv: &[String]) -> bool {
        let delay = *self.check_delay.lock().unwrap();
        std::thread::sleep(delay);
        self.check_ok.load(Ordering::SeqCst)
    }
}

struct Harness {
    reg: LinkRegistry,
    t: Arc<FakeTransport>,
    events: Arc<(Mutex<Vec<LinkEvent>>, Condvar)>,
    _dir: TempDir,
}

fn harness() -> Harness {
    let dir = TempDir::new().unwrap();
    let t = Arc::new(FakeTransport::default());
    t.check_ok.store(true, Ordering::SeqCst);
    let events: Arc<(Mutex<Vec<LinkEvent>>, Condvar)> = Arc::default();
    let sink_events = Arc::clone(&events);
    let sink: Sink = Arc::new(move |e| {
        sink_events.0.lock().unwrap().push(e);
        sink_events.1.notify_all();
    });
    let reg = LinkRegistry::new(
        Arc::clone(&t) as Arc<dyn Transport>,
        dir.path().to_path_buf(),
        PathBuf::from("/local/hook.sock"),
        "com.claudesk.app.dev".into(),
        sink,
    )
    .with_timings(
        Duration::from_millis(800),
        Duration::from_millis(20),
        Duration::from_secs(30),
    );
    Harness {
        reg,
        t,
        events,
        _dir: dir,
    }
}

fn target() -> ValidTarget {
    ValidTarget::new("me@mini-host", "/Users/me/p").unwrap()
}

impl Harness {
    fn states(&self) -> Vec<LinkState> {
        self.events
            .0
            .lock()
            .unwrap()
            .iter()
            .map(|e| e.state.clone())
            .collect()
    }

    /// Wait until `pred` holds for the event list, or fail after `secs`.
    fn wait_for(&self, what: &str, secs: u64, pred: impl Fn(&[LinkEvent]) -> bool) {
        let deadline = Instant::now() + Duration::from_secs(secs);
        let mut g = self.events.0.lock().unwrap();
        while !pred(&g) {
            let now = Instant::now();
            assert!(
                now < deadline,
                "timed out waiting for {what}; events: {:?}",
                *g
            );
            g = self.events.1.wait_timeout(g, deadline - now).unwrap().0;
        }
    }

    fn count(&self, s: &LinkState) -> usize {
        self.states().iter().filter(|x| *x == s).count()
    }
}

#[test]
fn ensure_brings_the_link_up_and_reports_home_and_control_path() {
    let h = harness();
    let info = h.reg.ensure(&target()).expect("up");
    assert_eq!(info.home, "/Users/me");
    assert_eq!(
        info.control_path,
        control_path(h._dir.path(), "me@mini-host")
    );
    assert_eq!(h.states()[..2], [LinkState::Connecting, LinkState::Up]);
    let argv = h.t.spawned.lock().unwrap()[0].clone();
    assert!(argv.contains(
        &"/Users/me/.claudesk/com.claudesk.app.dev/hook.sock:/local/hook.sock".to_string()
    ));
    assert!(h
        .events
        .0
        .lock()
        .unwrap()
        .iter()
        .all(|e| e.host == "me@mini-host"));
    h.reg.stop_all();
}

#[test]
fn a_failed_first_attempt_returns_its_reason_and_stops_an_unheld_link() {
    let h = harness();
    h.t.pre.lock().unwrap().push_back(Err(
        "could not resolve hostname me@mini-host: is Tailscale running?".into(),
    ));
    let err = h.reg.ensure(&target()).unwrap_err();
    assert!(err.contains("Tailscale"), "{err}");
    h.wait_for("Down", 5, |e| e.iter().any(|e| e.state == LinkState::Down));
    assert!(h.reg.state("me@mini-host").is_none());
    assert!(
        h.t.spawned.lock().unwrap().is_empty(),
        "no master after a failed pre-connect"
    );
}

#[test]
fn a_dropped_master_reconnects_and_runs_the_pre_connect_again() {
    let h = harness();
    h.reg.ensure(&target()).unwrap();
    h.reg.acquire("me@mini-host");
    h.t.masters.lock().unwrap()[0].store(true, Ordering::SeqCst);
    h.wait_for("a second Up", 5, |e| {
        e.iter().filter(|e| e.state == LinkState::Up).count() == 2
    });
    let s = h.states();
    let lost = s
        .iter()
        .position(|x| matches!(x, LinkState::Lost { .. }))
        .unwrap();
    assert_eq!(
        s[lost],
        LinkState::Lost {
            reason: "connection lost".into()
        }
    );
    assert_eq!(s[lost + 1], LinkState::Connecting);
    assert_eq!(
        h.t.pre_calls.load(Ordering::SeqCst),
        2,
        "rm -f runs before EVERY connect"
    );
    assert_eq!(h.t.spawned.lock().unwrap().len(), 2);
    h.reg.stop_all();
}

#[test]
fn stop_is_prompt_even_in_a_long_backoff() {
    let h = harness();
    // Fail every attempt (queued BEFORE the link starts, or its first pre-connect could succeed
    // first), and hold the link so a failure does not stop it.
    for _ in 0..50 {
        h.t.pre.lock().unwrap().push_back(Err("refused".into()));
    }
    {
        let _ = h.reg.get_or_start("me@mini-host").unwrap();
    }
    h.reg.acquire("me@mini-host");
    h.wait_for("two failures", 5, |e| {
        e.iter()
            .filter(|e| matches!(e.state, LinkState::Lost { .. }))
            .count()
            >= 2
    });
    let started = Instant::now();
    h.reg.stop("me@mini-host");
    h.wait_for("Down", 2, |e| e.iter().any(|e| e.state == LinkState::Down));
    assert!(
        started.elapsed() < Duration::from_secs(1),
        "{:?}",
        started.elapsed()
    );
}

#[test]
fn releasing_the_last_session_stops_the_link() {
    let h = harness();
    h.reg.ensure(&target()).unwrap();
    h.reg.acquire("me@mini-host");
    h.reg.acquire("me@mini-host");
    h.reg.release("me@mini-host");
    assert_eq!(h.count(&LinkState::Down), 0, "one session still holds it");
    assert_eq!(h.reg.refs("me@mini-host"), 1);
    h.reg.release("me@mini-host");
    h.wait_for("Down", 2, |e| e.iter().any(|e| e.state == LinkState::Down));
    assert!(
        h.t.masters.lock().unwrap()[0].load(Ordering::SeqCst),
        "the master was killed"
    );
}

#[test]
fn a_master_that_never_answers_check_is_lost_after_the_up_timeout() {
    let h = harness();
    h.t.check_ok.store(false, Ordering::SeqCst);
    let err = h.reg.ensure(&target()).unwrap_err();
    assert!(err.contains("did not come up"), "{err}");
    assert!(
        h.t.masters.lock().unwrap()[0].load(Ordering::SeqCst),
        "the stuck master was killed"
    );
}

#[test]
fn a_link_stopped_during_its_pre_connect_never_spawns_a_master() {
    let h = harness();
    *h.t.pre_delay.lock().unwrap() = Duration::from_millis(300);
    {
        let _ = h.reg.get_or_start("me@mini-host").unwrap();
    }
    std::thread::sleep(Duration::from_millis(50));
    h.reg.stop("me@mini-host");
    h.wait_for("Down", 3, |e| e.iter().any(|e| e.state == LinkState::Down));
    assert!(h.t.spawned.lock().unwrap().is_empty());
    assert!(
        !h.states()
            .iter()
            .any(|s| matches!(s, LinkState::Lost { .. })),
        "a deliberate stop is not a lost link: {:?}",
        h.states()
    );
}

#[test]
fn ensure_never_misses_a_first_attempt_that_fails_instantly() {
    // P2.verify-self.F1: with the baseline read after the worker started, an instant first
    // failure could be counted as "before I started", and `ensure` then waited through the
    // backoff into a SUCCESSFUL retry (the queue is empty after one Err). The pause seam puts
    // the worker's failure inside that window EVERY round, so a late-read baseline fails this
    // test deterministically (a plain 100-round loop caught it only ~1 run in 4).
    let mut h = harness();
    h.reg = h.reg.with_timings(
        Duration::from_millis(800),
        Duration::from_millis(500),
        Duration::from_secs(30),
    );
    h.reg.pause_after_start = Duration::from_millis(100);
    for i in 0..5 {
        h.t.pre
            .lock()
            .unwrap()
            .push_back(Err(format!("refused #{i}")));
        let r = h.reg.ensure(&target());
        assert_eq!(r, Err(format!("refused #{i}")), "round {i}");
    }
}

#[test]
fn a_stale_control_path_is_removed_before_every_master_spawn() {
    // P2.verify-self.F3: a master killed hard leaves its ControlPath behind, and ssh then
    // refuses to create one ("ControlSocket … already exists"). Before this test only the live
    // test noticed the removal missing.
    let h = harness();
    let ctl = control_path(h._dir.path(), "me@mini-host");
    std::fs::create_dir_all(ctl.parent().unwrap()).unwrap();
    std::fs::write(&ctl, "stale").unwrap();
    h.reg.ensure(&target()).unwrap();
    h.reg.acquire("me@mini-host");
    std::fs::write(&ctl, "stale again").unwrap();
    h.t.masters.lock().unwrap()[0].store(true, Ordering::SeqCst);
    h.wait_for("a second Up", 5, |e| {
        e.iter().filter(|e| e.state == LinkState::Up).count() == 2
    });
    assert_eq!(*h.t.ctl_existed_at_spawn.lock().unwrap(), [false, false]);
    h.reg.stop_all();
}

#[test]
fn stop_kills_the_master_process_even_while_the_worker_is_busy() {
    // P2.verify-self.F2: at QUIT the process exits right after `stop_all`, before a busy worker
    // gets back to its loop, so the direct kill in `halt` is the only thing between the app and
    // an orphaned `ssh -M`. Here the worker sits in a 3 s `check` when `stop` is called.
    let h = harness();
    let mut cmd = Command::new("/bin/sleep");
    cmd.arg("30");
    let child = Arc::new(Mutex::new(in_own_group(&mut cmd).spawn().unwrap()));
    *h.t.real_child.lock().unwrap() = Some(Arc::clone(&child));
    h.t.check_ok.store(false, Ordering::SeqCst);
    *h.t.check_delay.lock().unwrap() = Duration::from_secs(3);
    {
        let _ = h.reg.get_or_start("me@mini-host").unwrap();
    }
    let deadline = Instant::now() + Duration::from_secs(2);
    while h.t.spawned.lock().unwrap().is_empty() {
        assert!(Instant::now() < deadline, "no master spawned");
        std::thread::sleep(Duration::from_millis(10));
    }
    std::thread::sleep(Duration::from_millis(100)); // now inside the 3 s check
    let started = Instant::now();
    h.reg.stop("me@mini-host");
    let deadline = Instant::now() + Duration::from_millis(500);
    loop {
        if child.lock().unwrap().try_wait().unwrap().is_some() {
            break;
        }
        assert!(
            Instant::now() < deadline,
            "the master process outlived stop() by {:?}",
            started.elapsed()
        );
        std::thread::sleep(Duration::from_millis(10));
    }
}

#[test]
fn dropping_the_registry_stops_its_links() {
    // P2.verify-self.F4: a registry dropped mid-way (a panicking test; the app at exit) must not
    // leave a master running.
    let h = harness();
    h.reg.ensure(&target()).unwrap();
    h.reg.acquire("me@mini-host");
    let master = Arc::clone(&h.t.masters.lock().unwrap()[0]);
    let events = Arc::clone(&h.events);
    drop(h.reg);
    let deadline = Instant::now() + Duration::from_secs(2);
    let mut g = events.0.lock().unwrap();
    while !g.iter().any(|e| e.state == LinkState::Down) {
        let now = Instant::now();
        assert!(now < deadline, "no Down after drop: {:?}", *g);
        g = events.1.wait_timeout(g, deadline - now).unwrap().0;
    }
    assert!(master.load(Ordering::SeqCst), "the master was killed");
}

#[test]
fn dropping_the_last_session_hold_stops_the_link() {
    // M17 WP3 — a remote session holds its host link through a `LinkHold`; when the last session
    // is dropped (closed, or quit), the link stops by itself (verified live at Phase 3: no
    // `ssh -M` left after the close).
    let h = harness();
    h.reg.ensure(&target()).unwrap();
    let reg = Arc::new(h.reg);
    let a = reg.hold("me@mini-host");
    let b = reg.hold("me@mini-host");
    assert_eq!(reg.refs("me@mini-host"), 2);
    drop(a);
    assert_eq!(reg.refs("me@mini-host"), 1);
    assert!(
        !h.events
            .0
            .lock()
            .unwrap()
            .iter()
            .any(|e| e.state == LinkState::Down),
        "one session still holds it"
    );
    drop(b);
    let deadline = Instant::now() + Duration::from_secs(2);
    let mut g = h.events.0.lock().unwrap();
    while !g.iter().any(|e| e.state == LinkState::Down) {
        let now = Instant::now();
        assert!(now < deadline, "no Down after the last hold: {:?}", *g);
        g = h.events.1.wait_timeout(g, deadline - now).unwrap().0;
    }
    assert!(
        h.t.masters.lock().unwrap()[0].load(Ordering::SeqCst),
        "the master was killed"
    );
}

// ---------------------------------------------------------------------------------------------
// Live, against a real host (ignored by default)
// ---------------------------------------------------------------------------------------------

/// The whole link against a real host: Up, the deployed files, the `-R` forward carrying a byte
/// end to end, a hard-killed master coming back on its own (the pre-connect `rm -f` letting the
/// forward rebind), and a clean stop. State-changing on the remote ONLY under
/// `~/.claudesk/com.claudesk.app.dev/` (conf, launcher, socket), which the link owns.
///
/// `CLAUDESK_TEST_REMOTE_HOST=<host> cargo test --lib live_link_up -- --ignored --nocapture`
#[test]
#[ignore = "needs a real ssh host; set CLAUDESK_TEST_REMOTE_HOST"]
fn live_link_up() {
    use std::io::Read;
    use std::os::unix::net::UnixListener;

    let host = std::env::var("CLAUDESK_TEST_REMOTE_HOST").expect("CLAUDESK_TEST_REMOTE_HOST");
    // Short paths on purpose: the ControlPath and the local socket must fit `sun_path`.
    let dir = tempfile::Builder::new()
        .prefix("cdl")
        .tempdir_in("/tmp")
        .unwrap();
    let local_sock = dir.path().join("hook.sock");
    let listener = UnixListener::bind(&local_sock).unwrap();
    listener.set_nonblocking(true).unwrap();

    let events: Arc<(Mutex<Vec<LinkEvent>>, Condvar)> = Arc::default();
    let sink_events = Arc::clone(&events);
    let sink: Sink = Arc::new(move |e| {
        eprintln!("event: {:?}", e.state);
        sink_events.0.lock().unwrap().push(e);
        sink_events.1.notify_all();
    });
    let reg = LinkRegistry::new(
        Arc::new(SshTransport),
        dir.path().to_path_buf(),
        local_sock.clone(),
        "com.claudesk.app.dev".into(),
        sink,
    );
    let target = ValidTarget::new(&host, "/").unwrap();
    let wait_ups = |n: usize, secs: u64| {
        let deadline = Instant::now() + Duration::from_secs(secs);
        let mut g = events.0.lock().unwrap();
        while g.iter().filter(|e| e.state == LinkState::Up).count() < n {
            let now = Instant::now();
            assert!(now < deadline, "no Up #{n}: {:?}", *g);
            g = events.1.wait_timeout(g, deadline - now).unwrap().0;
        }
    };

    // 1. Up.
    let t0 = Instant::now();
    let info = reg.ensure(&target).expect("link up");
    eprintln!("up in {:?}; home={}", t0.elapsed(), info.home);
    assert!(run_captured(
        command_from(&check_argv(&info.control_path, &host)),
        "",
        5_000
    )
    .is_ok());

    // 2. The deployed files, read back over the master.
    let d = remote_state_dir(&info.home, "com.claudesk.app.dev");
    let conf = reg
        .exec(
            &target,
            &format!("cat {}", quote(&format!("{d}/tmux.conf"))),
            EXEC_TIMEOUT_MS,
        )
        .unwrap();
    assert_eq!(conf, TMUX_CONF);
    let launcher = reg
        .exec(
            &target,
            &format!("cat {}", quote(&format!("{d}/cc-launch"))),
            EXEC_TIMEOUT_MS,
        )
        .unwrap();
    assert_eq!(launcher, cc_launcher());
    let mode = reg
        .exec(
            &target,
            &format!("stat -f %Lp {}", quote(&format!("{d}/cc-launch"))),
            EXEC_TIMEOUT_MS,
        )
        .unwrap();
    assert_eq!(mode.trim(), "700");
    let sock = remote_socket(&info.home, "com.claudesk.app.dev");
    assert_eq!(
        reg.exec(
            &target,
            &format!("test -S {} && echo sock", quote(&sock)),
            EXEC_TIMEOUT_MS
        )
        .unwrap()
        .trim(),
        "sock"
    );

    // 3. The forward carries a byte from the remote socket to the local listener.
    let send = format!(
        "/usr/bin/perl -MIO::Socket::UNIX -e '$s=IO::Socket::UNIX->new(Peer=>$ARGV[0]) or exit 3; print $s \"ping\\n\"' {}",
        quote(&sock)
    );
    reg.exec(&target, &send, EXEC_TIMEOUT_MS)
        .expect("remote write into the forwarded socket");
    let deadline = Instant::now() + Duration::from_secs(5);
    let mut got = String::new();
    while Instant::now() < deadline && got.is_empty() {
        if let Ok((mut s, _)) = listener.accept() {
            s.set_nonblocking(false).unwrap();
            s.read_to_string(&mut got).unwrap();
        } else {
            std::thread::sleep(Duration::from_millis(50));
        }
    }
    assert_eq!(got, "ping\n", "the -R forward did not deliver");

    // 4. Hard-kill the master: the link reports Lost, then comes back Up by itself.
    reg.acquire(&host);
    let pid = {
        let links = reg.links.lock().unwrap();
        let l = links.get(&host).unwrap();
        let pid = l
            .shared
            .inner
            .lock()
            .unwrap()
            .master_pid
            .expect("a live master pid");
        pid
    };
    crate::subprocess::kill_group(pid);
    let t1 = Instant::now();
    wait_ups(2, 60);
    eprintln!("reconnected in {:?}", t1.elapsed());
    assert!(events
        .0
        .lock()
        .unwrap()
        .iter()
        .any(|e| matches!(e.state, LinkState::Lost { .. })));
    assert_eq!(
        reg.exec(
            &target,
            &format!("test -S {} && echo sock", quote(&sock)),
            EXEC_TIMEOUT_MS
        )
        .unwrap()
        .trim(),
        "sock",
        "the forward rebound after the drop"
    );

    // 5. Stop: Down, and the master is gone.
    reg.release(&host);
    let deadline = Instant::now() + Duration::from_secs(5);
    while !events
        .0
        .lock()
        .unwrap()
        .iter()
        .any(|e| e.state == LinkState::Down)
    {
        assert!(Instant::now() < deadline, "no Down");
        std::thread::sleep(Duration::from_millis(50));
    }
    std::thread::sleep(Duration::from_millis(300));
    assert!(run_captured(
        command_from(&check_argv(&info.control_path, &host)),
        "",
        5_000
    )
    .is_err());
}

/// The two side-channel execs the remote open/close paths depend on, against a real host:
/// - `cancel_copy_mode` takes a pane OUT of copy-mode, and is a success when the pane is NOT in a
///   mode (tmux's "not in a mode" refusal must not fail the close; arch §E's unprobed case);
/// - `test_dir_command` answers yes / no over the master.
///
/// State-changing on the remote ONLY: a throwaway `cd-wp3test` session (`sleep`) on the dev tmux
/// server, killed at the end, plus the link's own `~/.claudesk/com.claudesk.app.dev/` deploy.
///
/// `CLAUDESK_TEST_REMOTE_HOST=<host> cargo test --lib live_cancel_and_folder_check -- --ignored --nocapture`
#[test]
#[ignore = "needs a real ssh host; set CLAUDESK_TEST_REMOTE_HOST"]
fn live_cancel_and_folder_check() {
    use std::os::unix::net::UnixListener;
    let host = std::env::var("CLAUDESK_TEST_REMOTE_HOST").expect("CLAUDESK_TEST_REMOTE_HOST");
    let dir = tempfile::Builder::new()
        .prefix("cdc")
        .tempdir_in("/tmp")
        .unwrap();
    let local_sock = dir.path().join("hook.sock");
    let _listener = UnixListener::bind(&local_sock).unwrap();
    let reg = LinkRegistry::new(
        Arc::new(SshTransport),
        dir.path().to_path_buf(),
        local_sock,
        "com.claudesk.app.dev".into(),
        Arc::new(|_| {}),
    );
    let target = ValidTarget::new(&host, "/").unwrap();
    reg.ensure(&target).expect("link up");
    let srv = crate::remote_cmd::tmux_server("com.claudesk.app.dev");
    let sh = |script: &str| {
        reg.exec(
            &target,
            &crate::remote_cmd::login_shell(script),
            EXEC_TIMEOUT_MS,
        )
        .map(|o| o.trim().to_string())
    };
    let in_mode = || {
        sh(&format!(
            "tmux -L {} display -p -t '=cd-wp3test:' '#{{pane_in_mode}}'",
            quote(srv)
        ))
        .unwrap()
    };
    // A throwaway session: the guard below kills it even if an assertion fails.
    sh(&format!(
        "tmux -L {} -f /dev/null new -d -s cd-wp3test 'sleep 120'",
        quote(srv)
    ))
    .expect("test session");
    struct Cleanup<'a>(&'a dyn Fn(&str) -> Result<String, RunError>, String);
    impl Drop for Cleanup<'_> {
        fn drop(&mut self) {
            let _ = (self.0)(&self.1);
        }
    }
    let _cleanup = Cleanup(
        &sh,
        format!(
            "tmux -L {} kill-session -t '=cd-wp3test' 2>/dev/null; true",
            quote(srv)
        ),
    );

    // Not in a mode: the cancel is still a success (tmux refuses with "not in a mode").
    assert_eq!(in_mode(), "0");
    reg.cancel_copy_mode(&target, "cd-wp3test")
        .expect("cancel on a pane NOT in copy-mode must succeed");
    // In copy-mode: the cancel takes it out.
    sh(&format!(
        "tmux -L {} copy-mode -t '=cd-wp3test:'",
        quote(srv)
    ))
    .unwrap();
    assert_eq!(in_mode(), "1");
    reg.cancel_copy_mode(&target, "cd-wp3test").expect("cancel");
    assert_eq!(in_mode(), "0", "the pane is still in copy-mode");

    // The folder check over the master.
    assert_eq!(
        reg.exec(
            &target,
            &crate::remote_cmd::test_dir_command("/"),
            EXEC_TIMEOUT_MS
        )
        .unwrap()
        .trim(),
        "yes"
    );
    assert_eq!(
        reg.exec(
            &target,
            &crate::remote_cmd::test_dir_command("/nonexistent-claudesk-wp3"),
            EXEC_TIMEOUT_MS
        )
        .unwrap()
        .trim(),
        "no"
    );
}

/// `prepare_inject` against a real host (P4.2): a pane whose app enables bracketed paste at +2 s
/// is ready only after it; a pane that never enables it is refused at the bound; a ready pane in
/// copy-mode leaves it. Throwaway `cd-wp3prep*` sessions on the dev tmux server, killed at the end.
///
/// `CLAUDESK_TEST_REMOTE_HOST=<host> cargo test --lib live_prepare_inject -- --ignored --nocapture`
#[test]
#[ignore = "needs a real ssh host; set CLAUDESK_TEST_REMOTE_HOST"]
fn live_prepare_inject() {
    use std::os::unix::net::UnixListener;
    let host = std::env::var("CLAUDESK_TEST_REMOTE_HOST").expect("CLAUDESK_TEST_REMOTE_HOST");
    let dir = tempfile::Builder::new()
        .prefix("cdp")
        .tempdir_in("/tmp")
        .unwrap();
    let local_sock = dir.path().join("hook.sock");
    let _listener = UnixListener::bind(&local_sock).unwrap();
    let reg = LinkRegistry::new(
        Arc::new(SshTransport),
        dir.path().to_path_buf(),
        local_sock,
        "com.claudesk.app.dev".into(),
        Arc::new(|_| {}),
    );
    let target = ValidTarget::new(&host, "/").unwrap();
    reg.ensure(&target).expect("link up");
    let srv = crate::remote_cmd::tmux_server("com.claudesk.app.dev");
    let sh = |script: &str| {
        reg.exec(
            &target,
            &crate::remote_cmd::login_shell(script),
            EXEC_TIMEOUT_MS,
        )
        .map(|o| o.trim().to_string())
    };
    struct Cleanup<'a>(&'a dyn Fn(&str) -> Result<String, RunError>, String);
    impl Drop for Cleanup<'_> {
        fn drop(&mut self) {
            let _ = (self.0)(&self.1);
        }
    }
    let _cleanup = Cleanup(
        &sh,
        format!(
            "for s in cd-wp3prep-late cd-wp3prep-never; do tmux -L {} kill-session -t \"=$s\" 2>/dev/null; done; true",
            quote(srv)
        ),
    );
    let late = "sh -c 'sleep 2; printf \"\\033[?2004h\"; sleep 60'";
    sh(&format!(
        "tmux -L {s} -f /dev/null new -d -s cd-wp3prep-late {late}; tmux -L {s} new -d -s cd-wp3prep-never 'sleep 60'",
        s = quote(srv),
        late = quote(late)
    ))
    .expect("test sessions");

    // Ready only after the app enables bracketed paste (~2 s after the session started).
    let t0 = Instant::now();
    reg.prepare_inject(&target, "cd-wp3prep-late", crate::remote_cmd::READY_POLLS)
        .expect("the pane becomes ready");
    eprintln!("late pane ready after {:?}", t0.elapsed());
    assert!(
        t0.elapsed() >= Duration::from_millis(1200),
        "{:?}",
        t0.elapsed()
    );

    // A ready pane in copy-mode leaves it, at once.
    sh(&format!(
        "tmux -L {} copy-mode -t '=cd-wp3prep-late:'",
        quote(srv)
    ))
    .unwrap();
    let t1 = Instant::now();
    reg.prepare_inject(&target, "cd-wp3prep-late", crate::remote_cmd::READY_POLLS)
        .unwrap();
    assert!(t1.elapsed() < Duration::from_secs(2), "{:?}", t1.elapsed());
    let in_mode = sh(&format!(
        "tmux -L {} display -p -t '=cd-wp3prep-late:' '#{{pane_in_mode}}'",
        quote(srv)
    ))
    .unwrap();
    assert_eq!(in_mode, "0");

    // Never ready: refused at the (shortened) bound, in plain words.
    let err = reg
        .prepare_inject(&target, "cd-wp3prep-never", 5)
        .expect_err("a pane that never enables bracketed paste is not ready");
    assert!(err.contains("isn't ready for input yet"), "{err}");
}

#[test]
fn wait_up_waits_through_failed_attempts_until_the_link_is_back() {
    // Phase 5: a held link whose master dropped keeps retrying; a session waiting to reattach
    // must ride out the failures (unlike `ensure`, which returns the first one).
    let h = harness();
    h.reg.ensure(&target()).unwrap();
    h.reg.acquire("me@mini-host");
    for _ in 0..2 {
        h.t.pre.lock().unwrap().push_back(Err("refused".into()));
    }
    h.t.masters.lock().unwrap()[0].store(true, Ordering::SeqCst);
    h.wait_for("Lost", 5, |e| {
        e.iter().any(|e| matches!(e.state, LinkState::Lost { .. }))
    });
    let info = h
        .reg
        .wait_up("me@mini-host", &|| false)
        .expect("back up after two failed attempts");
    assert_eq!(info.home, "/Users/me");
    assert_eq!(h.reg.state("me@mini-host"), Some(LinkState::Up));
    assert!(
        h.states()
            .iter()
            .filter(|s| matches!(s, LinkState::Lost { .. }))
            .count()
            >= 3,
        "it waited through the failures: {:?}",
        h.states()
    );
    h.reg.stop_all();
}

#[test]
fn wait_up_returns_err_for_a_stopped_link_and_promptly_on_cancel() {
    let h = harness();
    assert!(h.reg.wait_up("me@mini-host", &|| false).is_err(), "no link");

    // A link stuck failing, held so it keeps retrying: only the cancel can end the wait.
    for _ in 0..50 {
        h.t.pre.lock().unwrap().push_back(Err("refused".into()));
    }
    {
        let _ = h.reg.get_or_start("me@mini-host").unwrap();
    }
    h.reg.acquire("me@mini-host");
    let cancel = Arc::new(AtomicBool::new(false));
    let c = Arc::clone(&cancel);
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(150));
        c.store(true, Ordering::SeqCst);
    });
    let t0 = Instant::now();
    assert!(h
        .reg
        .wait_up("me@mini-host", &|| cancel.load(Ordering::SeqCst))
        .is_err());
    assert!(t0.elapsed() < Duration::from_secs(2), "{:?}", t0.elapsed());
    h.reg.stop_all();
}

/// Run `argv` (a real `/usr/bin/ssh`); return its exit code if it ends within `within`, else kill
/// it and return `None`.
fn ssh_ends_within(argv: &[String], within: Duration) -> Option<i32> {
    let mut child = std::process::Command::new(&argv[0])
        .args(&argv[1..])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .expect("ssh runs");
    let deadline = Instant::now() + within;
    loop {
        if let Some(status) = child.try_wait().unwrap() {
            return status.code();
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return None;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}

#[test]
fn a_remote_terminal_never_falls_back_to_a_direct_connection() {
    // WP3 Phase 5 verify-self: with the master gone, `ssh -S <ctl> -o ControlMaster=no` connects
    // DIRECTLY, outside the link. The real `terminal_argv` against a missing control socket and an
    // unroutable documentation address (192.0.2.1, RFC 5737) must fail at once instead.
    let dir = TempDir::new().unwrap();
    let ctl = dir.path().join("gone");
    let argv = terminal_argv(&ctl, "probe@192.0.2.1", "true");
    assert_eq!(
        ssh_ends_within(&argv, Duration::from_secs(5)),
        Some(255),
        "no direct connection: {argv:?}"
    );

    // Positive control: the same argv WITHOUT the option is still trying to connect, so the
    // assertion above is about the option, not about the address failing fast on its own.
    let at = argv.iter().position(|a| a == NO_DIRECT_FALLBACK).unwrap();
    let mut direct = argv.clone();
    direct.drain(at - 1..=at);
    assert_eq!(
        ssh_ends_within(&direct, Duration::from_millis(1500)),
        None,
        "the control should still be connecting directly"
    );
}
