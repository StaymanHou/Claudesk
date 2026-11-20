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

/// M18 WP2.5 — the conf as probed and ruled (Probe evidence Q1/Q1b/Q3/Q4).
#[test]
fn the_tmux_conf_lets_in_pane_osc52_through_and_is_safe_to_re_source() {
    let lines: Vec<&str> = TMUX_CONF.lines().collect();
    assert!(lines.contains(&"set -g set-clipboard on"), "{TMUX_CONF}");
    assert!(lines.contains(&"set -g mouse on"), "{TMUX_CONF}");
    // Fixed index, never an append: a re-source must not stack a duplicate RGB entry.
    assert!(
        lines.contains(&"set -s terminal-features[100] 'xterm*:RGB'"),
        "{TMUX_CONF}"
    );
    assert!(!TMUX_CONF.contains(" -as "), "{TMUX_CONF}");
    assert!(!TMUX_CONF.contains("-ga ") && !TMUX_CONF.contains(" -a "));
    // No drag-end rebinding: `copy-pipe-no-clear` swallows the next typed keys (R-b).
    assert!(!TMUX_CONF.contains("MouseDragEnd"), "{TMUX_CONF}");
    assert!(!TMUX_CONF.contains("no-clear"), "{TMUX_CONF}");
}

/// A stub `tmux` that logs its argv and answers `has-session` / `source-file` with the given exit
/// codes. Like `tmux` on the mini, it is reachable ONLY from the LOGIN shell: its dir is added to
/// PATH by `$HOME/.zprofile` (which also prints noise to stdout, as a real profile may), never by
/// the outer PATH the pre-connect script runs with. No local tmux is installed on the dev Mac.
fn tmux_on_login_path_only(home: &Path, has: i32, src: i32) {
    let bin = home.join("bin");
    std::fs::create_dir_all(&bin).unwrap();
    let log = home.join("tmux.log");
    let stub = bin.join("tmux");
    std::fs::write(
        &stub,
        format!(
            "#!/bin/sh\necho \"$@\" >> '{}'\ncase \"$3\" in has-session) exit {has};; \
             source-file) exit {src};; esac\nexit 0\n",
            log.display()
        ),
    )
    .unwrap();
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(&stub, std::fs::Permissions::from_mode(0o755)).unwrap();
    std::fs::write(
        home.join(".zprofile"),
        format!(
            "export PATH='{}':\"$PATH\"\necho profile-noise\n",
            bin.display()
        ),
    )
    .unwrap();
}

/// The pre-connect run with an outer PATH that has NO tmux (the mini's non-login PATH).
fn run_pre_connect_without_tmux_on_path(
    shell: &str,
    home: &Path,
    identifier: &str,
) -> std::process::Output {
    Command::new(shell)
        .arg("-c")
        .arg(pre_connect_script(identifier))
        .env("HOME", home)
        .env("PATH", "/usr/bin:/bin")
        .env_remove("ZDOTDIR")
        .output()
        .expect("shell runs")
}

fn tmux_log(home: &Path) -> String {
    std::fs::read_to_string(home.join("tmux.log")).unwrap_or_default()
}

/// M18 WP2.5 (R-c): a running server never re-reads `-f`, so the pre-connect sources the fresh conf
/// into THIS build's `-L` server when one is up, and does nothing when none is. ⚠️ `tmux` is reachable
/// only from the login shell here, exactly as on the mini: the first version checked the OUTER
/// PATH and skipped silently on the real host (P2.vs.1). This test fails on that version.
#[test]
fn the_pre_connect_sources_the_conf_into_a_running_server_only() {
    for shell in ["/bin/sh", "/bin/zsh"] {
        // Server up: one has-session, then a source-file of the just-written conf.
        let home = TempDir::new().unwrap();
        tmux_on_login_path_only(home.path(), 0, 0);
        let out = run_pre_connect_without_tmux_on_path(shell, home.path(), DEV);
        assert!(
            out.status.success(),
            "{shell}: {}",
            String::from_utf8_lossy(&out.stderr)
        );
        let conf = home.path().join(".claudesk").join(DEV).join("tmux.conf");
        assert_eq!(
            tmux_log(home.path()),
            format!(
                "-L claudesk-dev has-session\n-L claudesk-dev source-file {}\n",
                conf.display()
            ),
            "{shell}"
        );
        assert_eq!(std::fs::read_to_string(&conf).unwrap(), TMUX_CONF);
        // The login profile's own output never reaches the stdout the HOME sentinel is read from.
        let stdout = String::from_utf8_lossy(&out.stdout);
        assert!(!stdout.contains("profile-noise"), "{shell}: {stdout}");
        assert!(parse_home(&stdout).is_ok(), "{shell}");

        // No server: has-session fails, so nothing is sourced (and the connect still succeeds).
        let home = TempDir::new().unwrap();
        tmux_on_login_path_only(home.path(), 1, 0);
        let out = run_pre_connect_without_tmux_on_path(shell, home.path(), DEV);
        assert!(out.status.success(), "{shell}");
        assert_eq!(
            tmux_log(home.path()),
            "-L claudesk-dev has-session\n",
            "{shell}"
        );

        // A failing source never fails the connect, and the sentinel is still printed.
        let home = TempDir::new().unwrap();
        tmux_on_login_path_only(home.path(), 0, 1);
        let out = run_pre_connect_without_tmux_on_path(shell, home.path(), DEV);
        assert!(out.status.success(), "{shell}");
        assert!(parse_home(&String::from_utf8_lossy(&out.stdout)).is_ok());

        // No tmux anywhere.
        let home = TempDir::new().unwrap();
        let out = run_pre_connect_without_tmux_on_path(shell, home.path(), DEV);
        assert!(out.status.success(), "{shell}");
        assert!(parse_home(&String::from_utf8_lossy(&out.stdout)).is_ok());
        assert_eq!(tmux_log(home.path()), "");
    }
    // The prod build sources into the prod server, never the dev one.
    let home = TempDir::new().unwrap();
    tmux_on_login_path_only(home.path(), 0, 0);
    let out = run_pre_connect_without_tmux_on_path("/bin/sh", home.path(), "com.claudesk.app");
    assert!(out.status.success());
    let log = tmux_log(home.path());
    assert_eq!(log.lines().count(), 2, "{log}");
    assert!(log.lines().all(|l| l.starts_with("-L claudesk ")), "{log}");
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

/// M18 WP2 — `claude` only in `~/.local/bin` (the native installer's place) and NOT on PATH, as on
/// an account whose PATH line lives only in `~/.zshrc`: the launcher still finds it. And a `claude`
/// that IS on PATH wins (the fallback runs only when the PATH has none).
#[test]
fn the_launcher_falls_back_to_local_bin_only_when_claude_is_not_on_path() {
    use std::os::unix::fs::PermissionsExt;
    let home = TempDir::new().unwrap();
    let local_bin = home.path().join(".local/bin");
    std::fs::create_dir_all(&local_bin).unwrap();
    let write_fake = |path: &Path, who: &str| {
        std::fs::write(path, format!("#!/bin/sh\nprintf 'WHO={who}\\n'\n")).unwrap();
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755)).unwrap();
    };
    write_fake(&local_bin.join("claude"), "local-bin");
    let launcher = home.path().join("cc-launch");
    std::fs::write(&launcher, cc_launcher()).unwrap();
    std::fs::set_permissions(&launcher, std::fs::Permissions::from_mode(0o700)).unwrap();
    std::fs::create_dir_all(home.path().join(".claudesk")).unwrap();
    std::fs::write(home.path().join(".claudesk/cc-oauth-token"), "tok").unwrap();
    let run = |path: &str| {
        let out = Command::new(&launcher)
            .env("HOME", home.path())
            .env("PATH", path)
            .output()
            .unwrap();
        (
            out.status.success(),
            String::from_utf8_lossy(&out.stdout).into_owned(),
        )
    };
    // Not on PATH: found in ~/.local/bin.
    assert_eq!(run("/usr/bin:/bin"), (true, "WHO=local-bin\n".to_string()));
    // On PATH: the PATH one runs, not the fallback.
    let on_path = home.path().join("bin");
    std::fs::create_dir_all(&on_path).unwrap();
    write_fake(&on_path.join("claude"), "path");
    assert_eq!(
        run(&format!("{}:/usr/bin:/bin", on_path.display())),
        (true, "WHO=path\n".to_string())
    );
    // Neither: the exec fails (the preflight is what names the fix).
    std::fs::remove_file(local_bin.join("claude")).unwrap();
    assert!(!run("/usr/bin:/bin").0);
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
    /// Every side-channel exec: (the remote command, its stdin).
    execs: Mutex<Vec<(String, String)>>,
    /// M17 WP4: when set, an exec runs its remote command in a REAL `/bin/sh` with `HOME` here, so
    /// the hook install reads and writes real files. When unset, the host has no settings file
    /// and every write succeeds.
    shell_home: Mutex<Option<PathBuf>>,
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

    fn exec(&self, argv: &[String], stdin: &str) -> Result<String, String> {
        let remote = argv
            .last()
            .expect("an exec argv ends with its command")
            .clone();
        self.execs
            .lock()
            .unwrap()
            .push((remote.clone(), stdin.to_string()));
        let home = self.shell_home.lock().unwrap().clone();
        match home {
            None if remote == READ_SETTINGS => Ok(format!("{SETTINGS_SENTINEL}absent\n")),
            None => Ok(String::new()),
            Some(home) => run_in_shell(&home, &remote, stdin),
        }
    }
}

/// Run `script` in `/bin/sh` with `HOME=home` and `stdin`: the remote side of an exec, locally.
fn run_in_shell(home: &Path, script: &str, stdin: &str) -> Result<String, String> {
    use std::io::Write;
    let mut child = Command::new("/bin/sh")
        .arg("-c")
        .arg(script)
        .env("HOME", home)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    child
        .stdin
        .take()
        .unwrap()
        .write_all(stdin.as_bytes())
        .unwrap();
    let out = child.wait_with_output().map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).into_owned())
    } else {
        Err(format!(
            "exited {:?} ({})",
            out.status.code(),
            String::from_utf8_lossy(&out.stderr).trim()
        ))
    }
}

struct Harness {
    reg: Arc<LinkRegistry>,
    t: Arc<FakeTransport>,
    events: Arc<(Mutex<Vec<LinkEvent>>, Condvar)>,
    _dir: TempDir,
}

fn harness() -> Harness {
    harness_with(|r| r)
}

/// A harness whose registry is adjusted (timings, test seams) before it is shared.
fn harness_with(tweak: impl FnOnce(LinkRegistry) -> LinkRegistry) -> Harness {
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
    let reg = Arc::new(tweak(reg));
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

/// `ensure_and_hold`'s error, for a call expected to fail (`LinkHold` has no `Debug`).
fn up_err(reg: &Arc<LinkRegistry>, t: &ValidTarget) -> String {
    match reg.ensure_and_hold(t) {
        Ok(_) => panic!("expected the link not to come up"),
        Err(e) => e,
    }
}

/// `ensure_and_hold`'s hold, for a call expected to succeed.
fn up(reg: &Arc<LinkRegistry>, t: &ValidTarget) -> (LinkInfo, LinkHold) {
    match reg.ensure_and_hold(t) {
        Ok(v) => v,
        Err(e) => panic!("link did not come up: {e}"),
    }
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
    let (info, _hold) = up(&h.reg, &target());
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
    let err = up_err(&h.reg, &target());
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
    let _hold = up(&h.reg, &target());
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
    let (_, _, _, _hold) = h.reg.start_and_hold("me@mini-host").unwrap();
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
    let (_, a) = up(&h.reg, &target());
    let (_, b) = up(&h.reg, &target());
    drop(a);
    assert_eq!(h.count(&LinkState::Down), 0, "one session still holds it");
    assert_eq!(h.reg.refs("me@mini-host"), 1);
    drop(b);
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
    let err = up_err(&h.reg, &target());
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
fn ensure_and_hold_never_misses_a_first_attempt_that_fails_instantly() {
    // P2.verify-self.F1: with the baseline read after the worker started, an instant first
    // failure could be counted as "before I started", and `ensure` then waited through the
    // backoff into a SUCCESSFUL retry (the queue is empty after one Err). The pause seam puts
    // the worker's failure inside that window EVERY round, so a late-read baseline fails this
    // test deterministically (a plain 100-round loop caught it only ~1 run in 4).
    let h = harness_with(|r| {
        let mut r = r.with_timings(
            Duration::from_millis(800),
            Duration::from_millis(500),
            Duration::from_secs(30),
        );
        r.pause_after_start = Duration::from_millis(100);
        r
    });
    for i in 0..5 {
        h.t.pre
            .lock()
            .unwrap()
            .push_back(Err(format!("refused #{i}")));
        assert_eq!(
            up_err(&h.reg, &target()),
            format!("refused #{i}"),
            "round {i}"
        );
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
    let _hold = up(&h.reg, &target());
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
    let _ = h.reg.get_or_start("me@mini-host").unwrap();
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
    // Started and Up but held by nothing, so `h.reg` is the registry's only owner.
    let h = harness();
    let _ = h.reg.get_or_start("me@mini-host").unwrap();
    h.reg.wait_up("me@mini-host", &|| false).unwrap();
    assert_eq!(Arc::strong_count(&h.reg), 1);
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
    let (_, a) = up(&h.reg, &target());
    let (_, b) = up(&h.reg, &target());
    assert_eq!(h.reg.refs("me@mini-host"), 2);
    drop(a);
    assert_eq!(h.reg.refs("me@mini-host"), 1);
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
// Holds: the open check's, atomic start-and-hold, generations (M17 WP4 AC-0)
// ---------------------------------------------------------------------------------------------

const HOST: &str = "me@mini-host";

/// Wait until `host` has no link at all, or fail after `within`.
fn wait_no_link(h: &Harness, within: Duration) {
    let deadline = Instant::now() + within;
    while h.reg.state(HOST).is_some() {
        assert!(
            Instant::now() < deadline,
            "the link is still there: {:?}",
            h.states()
        );
        std::thread::sleep(Duration::from_millis(10));
    }
}

#[test]
fn a_check_that_ends_without_an_open_leaves_no_link() {
    // `SURFACE-2026-11-16-QUALITY-M17WP3-OPEN-CHECK-LEAKS-AN-UNHELD-LINK`: a check whose outcome
    // leads to no open must not leave an `ssh -M` (and, for an offline host, a retry loop) behind.
    use super::commands::{release_check_hold, OpenCheck};
    for outcome in [
        OpenCheck::FolderMissing {
            message: "gone".into(),
        },
        OpenCheck::Unreachable {
            message: "no answer".into(),
        },
        OpenCheck::Invalid {
            message: "bad row".into(),
        },
        // M17 WP5: a dialog follows, not an open; the open after it checks again.
        OpenCheck::AskEndPending {
            message: "closed offline".into(),
        },
        OpenCheck::AskUnrecorded {
            message: "unknown session".into(),
        },
    ] {
        let h = harness();
        let (_, hold) = up(&h.reg, &target());
        release_check_hold(hold, &outcome, Duration::from_secs(30));
        // Removed synchronously, not after a grace.
        assert!(h.reg.state(HOST).is_none(), "{outcome:?} left a link");
        h.wait_for("Down", 2, |e| e.iter().any(|e| e.state == LinkState::Down));
        assert!(
            h.t.masters.lock().unwrap()[0].load(Ordering::SeqCst),
            "{outcome:?}: the master was killed"
        );
    }
}

#[test]
fn a_successful_check_lingers_then_stops_when_nothing_opens() {
    use super::commands::{release_check_hold, OpenCheck};
    // Both outcomes an open follows (M17 WP5: a reconnect too).
    for outcome in [
        OpenCheck::Start(super::commands::StartSignals::default()),
        OpenCheck::Reconnect { mode: None },
    ] {
        let h = harness();
        let (_, hold) = up(&h.reg, &target());
        release_check_hold(hold, &outcome, Duration::from_millis(150));
        assert_eq!(
            h.reg.state(HOST),
            Some(LinkState::Up),
            "{outcome:?}: inside the grace"
        );
        assert_eq!(h.reg.refs(HOST), 0);
        wait_no_link(&h, Duration::from_secs(2));
        h.wait_for("Down", 2, |e| e.iter().any(|e| e.state == LinkState::Down));
    }
}

#[test]
fn a_successful_check_then_open_reuses_the_link() {
    use super::commands::{release_check_hold, OpenCheck};
    let h = harness();
    let (_, check) = up(&h.reg, &target());
    release_check_hold(
        check,
        &OpenCheck::Start(super::commands::StartSignals::default()),
        Duration::from_millis(150),
    );
    // The open's spawn, inside the grace.
    let (_, session) = up(&h.reg, &target());
    std::thread::sleep(Duration::from_millis(400));
    assert_eq!(h.reg.state(HOST), Some(LinkState::Up), "past the grace");
    assert_eq!(h.reg.refs(HOST), 1);
    assert_eq!(h.t.spawned.lock().unwrap().len(), 1, "one master, reused");
    assert_eq!(h.count(&LinkState::Down), 0);
    drop(session);
    wait_no_link(&h, Duration::from_secs(1));
}

#[test]
fn ensure_and_hold_counts_on_the_link_it_returns() {
    // `SURFACE-2026-11-16-QUALITY-M17WP3-ENSURE-THEN-HOLD-IS-NOT-ATOMIC`: a new session starts on a
    // host whose LAST other session closes at that moment. The pause seam puts the close exactly
    // between "found the link" and "waited for it Up", which is where the old two-step
    // `ensure`-then-`hold` left the new session counting nothing.
    let h = harness_with(|mut r| {
        r.pause_after_start = Duration::from_millis(200);
        r
    });
    let (_, other) = up(&h.reg, &target());
    let reg = Arc::clone(&h.reg);
    let new = std::thread::spawn(move || reg.ensure_and_hold(&target()).map(|(_, hold)| hold));
    std::thread::sleep(Duration::from_millis(50)); // inside the new session's pause
    drop(other);
    let hold = match new.join().unwrap() {
        Ok(hold) => hold,
        Err(e) => panic!("the new session lost its link to the other's close: {e}"),
    };
    assert_eq!(h.reg.refs(HOST), 1);
    assert_eq!(h.reg.state(HOST), Some(LinkState::Up));
    assert_eq!(h.t.spawned.lock().unwrap().len(), 1, "never torn down");
    drop(hold);
    wait_no_link(&h, Duration::from_secs(1));
}

#[test]
fn a_hold_from_a_stopped_link_never_releases_a_newer_one() {
    let h = harness();
    let (_, old) = up(&h.reg, &target());
    h.reg.stop(HOST);
    h.wait_for("Down", 2, |e| e.iter().any(|e| e.state == LinkState::Down));
    let (_, new) = up(&h.reg, &target());
    assert_eq!(h.reg.refs(HOST), 1);
    drop(old);
    assert_eq!(h.reg.refs(HOST), 1, "the old hold released the NEW link");
    assert_eq!(h.reg.state(HOST), Some(LinkState::Up));
    drop(new);
    wait_no_link(&h, Duration::from_secs(1));
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
    let reg = Arc::new(LinkRegistry::new(
        Arc::new(SshTransport),
        dir.path().to_path_buf(),
        local_sock.clone(),
        "com.claudesk.app.dev".into(),
        sink,
    ));
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
    let (info, hold) = up(&reg, &target);
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
    drop(hold);
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
/// - the open check (`open_check_command`) answers folder / live / mode over the master.
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
    let reg = Arc::new(LinkRegistry::new(
        Arc::new(SshTransport),
        dir.path().to_path_buf(),
        local_sock,
        "com.claudesk.app.dev".into(),
        Arc::new(|_| {}),
    ));
    let target = ValidTarget::new(&host, "/").unwrap();
    let _hold = up(&reg, &target);
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

    // M17 WP5: the open check's ONE exec over the master: the folder, the live session and its
    // stored mode, against the real tmux (the shapes the unit tests run against a fake).
    let open = |path: &str| {
        crate::remote_cmd::parse_open_facts(
            &reg.exec(
                &target,
                &crate::remote_cmd::open_check_command(srv, "cd-wp3test", path, true, None),
                EXEC_TIMEOUT_MS,
            )
            .unwrap(),
        )
        .expect("an answer")
    };
    let facts = open("/");
    assert!(facts.folder && facts.live, "{facts:?}");
    assert_eq!(facts.mode, None, "unset option: unknown");
    sh(&format!(
        "tmux -L {} set-option -t '=cd-wp3test:' @cd_mode fsd",
        quote(srv)
    ))
    .unwrap();
    assert_eq!(open("/").mode, Some(Some("fsd".into())));
    assert!(!open("/nonexistent-claudesk-wp3").folder);
    let none = crate::remote_cmd::parse_open_facts(
        &reg.exec(
            &target,
            &crate::remote_cmd::open_check_command(srv, "cd-wp3test-none", "/", false, None),
            EXEC_TIMEOUT_MS,
        )
        .unwrap(),
    )
    .unwrap();
    assert!(!none.live, "exact match: a prefix is not the session");
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
    let reg = Arc::new(LinkRegistry::new(
        Arc::new(SshTransport),
        dir.path().to_path_buf(),
        local_sock,
        "com.claudesk.app.dev".into(),
        Arc::new(|_| {}),
    ));
    let target = ValidTarget::new(&host, "/").unwrap();
    let _hold = up(&reg, &target);
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
    let _hold = up(&h.reg, &target());
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
    let (_, _, _, _hold) = h.reg.start_and_hold("me@mini-host").unwrap();
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

// ---------------------------------------------------------------------------------------------
// The close path's execs (`SURFACE-2026-11-16-QUALITY-M17WP4-QUIT-FREEZE-BOUND-UNDERSTATED`): a
// sync quit joins every remote kill on the main thread, so a link that is not Up must cost nothing
// and a stale Up must fail fast.
// ---------------------------------------------------------------------------------------------

/// An unroutable documentation address (RFC 5737): a direct connect to it waits out
/// `ConnectTimeout` instead of failing.
const UNROUTABLE: &str = "probe@192.0.2.1";

fn unroutable_target() -> ValidTarget {
    ValidTarget::new(UNROUTABLE, "/Users/probe/p").unwrap()
}

/// Both close-path execs, timed; each must refuse with `LinkNotUp` without running anything.
fn assert_close_execs_send_nothing(reg: &LinkRegistry, t: &ValidTarget, why: &str) {
    let started = Instant::now();
    let cancel = reg.cancel_copy_mode(t, "cd-x");
    let end = reg.end_session(t, "cd-x");
    let took = started.elapsed();
    assert!(
        matches!(cancel, Err(CloseExecError::LinkNotUp)),
        "{why}: cancel {cancel:?}"
    );
    assert!(
        matches!(end, Err(CloseExecError::LinkNotUp)),
        "{why}: end {end:?}"
    );
    assert!(took < Duration::from_millis(200), "{why}: took {took:?}");
}

#[test]
fn a_close_with_no_link_or_a_lost_link_sends_nothing() {
    let h = harness();
    let t = unroutable_target();
    // No link at all (a close after the link was stopped).
    assert_close_execs_send_nothing(&h.reg, &t, "no link");

    // A Lost link that stays down (every reconnect's pre-connect fails): the link-down quit.
    let (_, hold) = up(&h.reg, &t);
    assert_eq!(h.reg.state(UNROUTABLE), Some(LinkState::Up));
    h.t.pre
        .lock()
        .unwrap()
        .extend((0..64).map(|_| Err("host is down".to_string())));
    h.t.masters.lock().unwrap()[0].store(true, Ordering::SeqCst);
    h.wait_for("the link to drop", 5, |e| {
        e.iter().any(|e| matches!(e.state, LinkState::Lost { .. }))
    });
    assert_ne!(h.reg.state(UNROUTABLE), Some(LinkState::Up));
    assert_close_execs_send_nothing(&h.reg, &t, "lost link");
    drop(hold);
}

#[test]
fn a_close_exec_on_a_stale_up_link_fails_fast_instead_of_connecting_directly() {
    // The link reads Up (the fake master), but there is no control socket: the state a real
    // master's death leaves until the worker's next poll. The close exec must fail at once (255),
    // not connect directly and wait out `ConnectTimeout` (10 s).
    let h = harness();
    let t = unroutable_target();
    let (_, hold) = up(&h.reg, &t);
    assert_eq!(h.reg.state(UNROUTABLE), Some(LinkState::Up));
    let started = Instant::now();
    let end = h.reg.end_session(&t, "cd-x");
    let took = started.elapsed();
    assert!(
        matches!(
            end,
            Err(CloseExecError::Run(RunError::Failed {
                code: Some(255),
                ..
            }))
        ),
        "ran, and failed as a connection error: {end:?}"
    );
    assert!(took < Duration::from_secs(3), "fast: took {took:?}");

    // Positive control: the plain side-channel argv (with its direct fallback) to the same host is
    // still connecting, so the speed above is the option's, not the address failing on its own.
    let ctl = control_path(h._dir.path(), UNROUTABLE);
    assert_eq!(
        ssh_ends_within(
            &exec_argv(&ctl, UNROUTABLE, "true"),
            Duration::from_millis(1500)
        ),
        None,
        "the control should still be connecting directly"
    );
    drop(hold);
}

#[test]
fn the_master_only_exec_argv_is_the_exec_argv_plus_no_direct_fallback_before_the_host() {
    let ctl = Path::new("/AD/ssh/abcd1234");
    let argv = master_only_exec_argv(ctl, "me@h", "true");
    let mut expected = exec_argv(ctl, "me@h", "true");
    let dd = expected.iter().position(|a| a == "--").unwrap();
    expected.splice(dd..dd, ["-o".to_string(), NO_DIRECT_FALLBACK.to_string()]);
    assert_eq!(argv, expected);
    let at = argv.iter().position(|a| a == NO_DIRECT_FALLBACK).unwrap();
    assert!(
        at < argv.iter().position(|a| a == "--").unwrap(),
        "an option, before the host"
    );
}

// ---------------------------------------------------------------------------------------------
// M17 WP4 Phase 3 — the remote hook: deploy (AC-1.1), registration (AC-1.2–1.4)
// ---------------------------------------------------------------------------------------------

const DEV: &str = "com.claudesk.app.dev";

/// TC-4: a deployed file holding a line equal to the delimiter would end its heredoc early, and the
/// rest would RUN as shell. Every file the pre-connect script writes is checked.
#[test]
fn the_heredoc_delimiter_never_occurs_as_a_line_in_a_deployed_file() {
    let launcher = cc_launcher();
    for (name, body) in [
        ("claudesk-hook.pl", HOOK_SCRIPT),
        ("tmux.conf", TMUX_CONF),
        ("cc-launch", launcher.as_str()),
    ] {
        assert!(
            !body
                .lines()
                .any(|l| l.trim_end_matches('\r') == HEREDOC_DELIMITER),
            "{name} holds a line equal to the heredoc delimiter"
        );
    }
    let s = pre_connect_script(DEV);
    assert_eq!(
        s.matches(&format!("<<'{HEREDOC_DELIMITER}'")).count(),
        3,
        "every heredoc is quoted and uses the checked delimiter: {s}"
    );
}

/// AC-1.1: the pre-connect deploys the bundled script UNCHANGED under the remote basename, through
/// a temp file and a rename, in sh and zsh, and the deployed copy compiles.
#[test]
fn the_pre_connect_script_deploys_the_hook_script_under_its_remote_name() {
    for shell in ["/bin/sh", "/bin/zsh"] {
        let home = TempDir::new().unwrap();
        let out = run_pre_connect(shell, home.path(), DEV);
        assert!(
            out.status.success(),
            "{shell}: {}",
            String::from_utf8_lossy(&out.stderr)
        );
        let dir = home.path().join(".claudesk").join(DEV);
        let deployed = dir.join("claudesk-remote-hook-dev.pl");
        assert_eq!(
            std::fs::read_to_string(&deployed).unwrap(),
            HOOK_SCRIPT,
            "{shell}: byte-identical to the bundled script"
        );
        assert!(
            !dir.join("claudesk-remote-hook-dev.pl.tmp").exists(),
            "{shell}"
        );
        assert!(
            !dir.join("claudesk-hook-dev.pl").exists(),
            "{shell}: never under the LOCAL basename (TC-2)"
        );
        let perl_ok = Command::new("perl")
            .arg("-c")
            .arg(&deployed)
            .output()
            .map(|o| o.status.success());
        if let Ok(ok) = perl_ok {
            assert!(ok, "{shell}: the deployed script compiles");
        }
    }
}

/// AC-1.4: the exact registered command. Each value is quoted, and the origin is `hook_origin`.
#[test]
fn the_remote_hook_command_is_quoted_and_names_the_origin() {
    let cmd = remote_hook_command("/Users/me", DEV, "me@mini-host");
    assert_eq!(
        cmd,
        format!(
            "CLAUDESK_HOOK_SOCK='/Users/me/.claudesk/{DEV}/hook.sock' CLAUDESK_ORIGIN='{}' \
             /usr/bin/perl '/Users/me/.claudesk/{DEV}/claudesk-remote-hook-dev.pl'",
            crate::remote_cmd::hook_origin("me@mini-host")
        )
    );
    assert_eq!(
        crate::remote_cmd::hook_origin("me@mini-host"),
        hash8("me@mini-host"),
        "TC-3: the origin is the value that names the ControlPath"
    );
}

#[test]
fn parse_settings_read_reads_after_the_first_sentinel() {
    assert_eq!(
        parse_settings_read(&format!("rc noise\n{SETTINGS_SENTINEL}absent\n")),
        Ok(None)
    );
    let body = format!("{{\n  \"a\": 1\n}}\n{SETTINGS_SENTINEL}absent\n");
    assert_eq!(
        parse_settings_read(&format!("noise\r\n{SETTINGS_SENTINEL}present\r\n{body}")),
        Ok(Some(body.clone())),
        "a sentinel-looking line INSIDE the file is part of the file"
    );
    assert!(parse_settings_read("no sentinel at all\n").is_err());
    assert!(parse_settings_read("").is_err());
}

/// A transport that runs every exec in a real `/bin/sh` with `HOME=home`.
fn shell_transport(home: &Path) -> FakeTransport {
    let t = FakeTransport::default();
    *t.shell_home.lock().unwrap() = Some(home.to_path_buf());
    t
}

fn settings_path(home: &Path) -> PathBuf {
    home.join(".claude").join("settings.json")
}

fn install_in(t: &FakeTransport, home: &Path) -> Result<(), String> {
    install_remote_hook(
        t,
        Path::new("/AD/ssh/abcd1234"),
        "me@mini-host",
        &home.to_string_lossy(),
        DEV,
    )
}

/// The fixture of AC-1.3: keys Claudesk never wrote, a foreign hook group, and a LOCAL Claudesk's
/// own group (`claudesk-hook.pl`) on the same host.
fn fixture() -> serde_json::Value {
    serde_json::json!({
        "theme": "dark-daltonized",
        "skipDangerousModePermissionPrompt": true,
        "model": "opus",
        "hooks": {
            "Stop": [
                { "hooks": [ { "type": "command", "command": "/usr/local/bin/notify.sh stop" } ] },
                { "hooks": [ { "type": "command",
                  "command": "CLAUDESK_HOOK_SOCK='/x/hook.sock' /usr/bin/perl '/x/claudesk-hook.pl'" } ] }
            ],
            "PreCompact": [
                { "matcher": "auto", "hooks": [ { "type": "command", "command": "echo hi" } ] }
            ]
        }
    })
}

/// AC-1.3: the install path, end to end in a real shell, on the fixture. Every key and group
/// Claudesk did not write survives as a JSON value, the local Claudesk's group included, and our
/// group is registered once for all 10 events with the exact remote command.
#[test]
fn the_remote_install_preserves_every_key_and_group_it_did_not_write() {
    let home = TempDir::new().unwrap();
    let path = settings_path(home.path());
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    let before = fixture();
    std::fs::write(&path, serde_json::to_string_pretty(&before).unwrap()).unwrap();

    let t = shell_transport(home.path());
    install_in(&t, home.path()).expect("installs");
    let after: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();

    for key in ["theme", "skipDangerousModePermissionPrompt", "model"] {
        assert_eq!(after[key], before[key], "{key} survives");
    }
    assert_eq!(
        after["hooks"]["PreCompact"], before["hooks"]["PreCompact"],
        "an event Claudesk never registers is untouched"
    );
    let stop = after["hooks"]["Stop"].as_array().unwrap();
    for g in before["hooks"]["Stop"].as_array().unwrap() {
        assert!(
            stop.contains(g),
            "a group Claudesk did not write survives: {g}"
        );
    }
    let ours = remote_hook_command(&home.path().to_string_lossy(), DEV, "me@mini-host");
    for event in crate::hook_install::CLAUDESK_EVENTS {
        let groups = after["hooks"][event].as_array().unwrap();
        let mine: Vec<_> = groups
            .iter()
            .filter(|g| g["hooks"][0]["command"].as_str() == Some(ours.as_str()))
            .collect();
        assert_eq!(mine.len(), 1, "{event}: exactly one remote Claudesk group");
    }
    assert!(!home
        .path()
        .join(".claude/settings.json.claudesk.tmp")
        .exists());
}

/// AC-1.4: re-running the install with the same command writes nothing (only the read happens),
/// and the file is byte-identical.
#[test]
fn a_repeated_remote_install_is_a_no_op_write_skip() {
    let home = TempDir::new().unwrap();
    let t = shell_transport(home.path());
    install_in(&t, home.path()).expect("first install");
    let path = settings_path(home.path());
    let first = std::fs::read(&path).unwrap();
    let writes_after_first = t
        .execs
        .lock()
        .unwrap()
        .iter()
        .filter(|(c, _)| c == WRITE_SETTINGS)
        .count();
    assert_eq!(writes_after_first, 1);

    install_in(&t, home.path()).expect("second install");
    let execs = t.execs.lock().unwrap();
    assert_eq!(
        execs.iter().filter(|(c, _)| c == WRITE_SETTINGS).count(),
        1,
        "the second install wrote nothing"
    );
    assert_eq!(execs.last().unwrap().0, READ_SETTINGS);
    assert_eq!(std::fs::read(&path).unwrap(), first, "byte-identical");
}

/// AC-1.2: an absent file is created holding just the hooks block.
#[test]
fn an_absent_remote_settings_file_is_created_with_just_the_hooks() {
    let home = TempDir::new().unwrap();
    let t = shell_transport(home.path());
    install_in(&t, home.path()).expect("installs");
    let v: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(settings_path(home.path())).unwrap())
            .unwrap();
    let keys: Vec<_> = v.as_object().unwrap().keys().cloned().collect();
    assert_eq!(keys, ["hooks"]);
}

/// AC-1.2: a malformed file is NEVER written, and the reason comes back in plain words.
#[test]
fn a_malformed_remote_settings_file_is_never_written() {
    for bad in ["{ \"theme\": ", "", "[1, 2]", "{\"hooks\": 3}"] {
        let home = TempDir::new().unwrap();
        let path = settings_path(home.path());
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, bad).unwrap();
        let t = shell_transport(home.path());
        let err = install_in(&t, home.path()).expect_err("refused");
        assert!(err.contains("left untouched"), "{bad:?}: {err}");
        assert_eq!(std::fs::read_to_string(&path).unwrap(), bad, "{bad:?}");
        assert!(
            t.execs
                .lock()
                .unwrap()
                .iter()
                .all(|(c, _)| c != WRITE_SETTINGS),
            "{bad:?}: no write was even attempted"
        );
    }
}

/// The write keeps the file's mode (a `0600` settings file must not become world-readable).
#[test]
fn the_remote_settings_write_keeps_the_file_mode() {
    use std::os::unix::fs::PermissionsExt;
    let home = TempDir::new().unwrap();
    let path = settings_path(home.path());
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(&path, "{}").unwrap();
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).unwrap();
    install_in(&shell_transport(home.path()), home.path()).expect("installs");
    let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
    assert_eq!(mode, 0o600);
}

/// AC-1.2, in the worker: the install runs BEFORE the link is reported Up, a failure leaves the
/// link Up with the plain-words warning on it, and a later good connect clears it.
#[test]
fn a_failed_remote_install_leaves_the_link_up_with_a_warning() {
    let h = harness();
    let home = TempDir::new().unwrap();
    let path = settings_path(home.path());
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(&path, "{ broken").unwrap();
    *h.t.shell_home.lock().unwrap() = Some(home.path().to_path_buf());

    let t = target();
    let (_info, hold) = up(&h.reg, &t);
    let warning = h
        .reg
        .hook_warning(t.host())
        .expect("a warning, readable as soon as Up");
    assert!(warning.contains("me@mini-host"), "{warning}");
    assert!(warning.contains("not valid JSON"), "{warning}");
    assert_eq!(
        h.reg.state(t.host()),
        Some(LinkState::Up),
        "the link is still up"
    );
    assert_eq!(
        std::fs::read_to_string(&path).unwrap(),
        "{ broken",
        "never written"
    );
    drop(hold);

    // The host is fixed; the next connect's install works and clears the warning.
    std::fs::write(&path, "{}").unwrap();
    let (_info, _hold) = up(&h.reg, &t);
    assert_eq!(h.reg.hook_warning(t.host()), None);
}

/// AC-1.2 pins the ORDER: a caller that returns from `ensure_and_hold` has already seen the
/// install's read (it ran before Up was reported).
#[test]
fn the_remote_install_runs_before_the_link_reports_up() {
    let h = harness();
    let (_info, _hold) = up(&h.reg, &target());
    let execs = h.t.execs.lock().unwrap();
    assert!(
        execs.iter().any(|(c, _)| c == READ_SETTINGS),
        "the settings were read before Up: {execs:?}"
    );
    assert!(
        execs.iter().any(|(c, _)| c == WRITE_SETTINGS),
        "and our hook was written (the fake host has no settings file)"
    );
}

// ---------------------------------------------------------------------------------------------
// M17 WP4 — a respawn waits for Claudesk's own close of the same tmux session
// ---------------------------------------------------------------------------------------------

#[test]
fn wait_not_closing_returns_at_once_when_nothing_closes() {
    let h = harness();
    let t0 = Instant::now();
    assert!(h.reg.wait_not_closing("cd-x", Duration::from_secs(5)));
    assert!(t0.elapsed() < Duration::from_millis(100));
}

#[test]
fn wait_not_closing_waits_for_the_close_to_end() {
    let h = harness();
    let guard = h.reg.begin_close("cd-x");
    let t0 = Instant::now();
    let dropper = std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(300));
        drop(guard);
    });
    assert!(h.reg.wait_not_closing("cd-x", Duration::from_secs(5)));
    assert!(
        t0.elapsed() >= Duration::from_millis(250),
        "it waited for the close: {:?}",
        t0.elapsed()
    );
    assert!(
        t0.elapsed() < Duration::from_secs(2),
        "and woke when it ended, not at the timeout: {:?}",
        t0.elapsed()
    );
    dropper.join().unwrap();
}

#[test]
fn wait_not_closing_times_out_and_only_watches_its_own_session() {
    let h = harness();
    let _a = h.reg.begin_close("cd-a");
    assert!(
        !h.reg.wait_not_closing("cd-a", Duration::from_millis(150)),
        "a close that does not end times out"
    );
    assert!(
        h.reg.wait_not_closing("cd-b", Duration::from_millis(150)),
        "another session's close does not hold this spawn"
    );
}

#[test]
fn two_closes_of_one_session_hold_until_both_end() {
    let h = harness();
    let first = h.reg.begin_close("cd-x");
    let second = h.reg.begin_close("cd-x");
    drop(first);
    assert!(!h.reg.wait_not_closing("cd-x", Duration::from_millis(100)));
    drop(second);
    assert!(h.reg.wait_not_closing("cd-x", Duration::from_millis(100)));
}

/// M17 WP5 Phase 2 (P2.verify-self.1 GAP 1) — the FIRE-TIME trust read of a remote row: what
/// `folder_trusted` answers is the LAST open check's answer for that key, and every gap is
/// untrusted. ⚠️ This answer withholds the auto-fired `/session-restore` in an untrusted folder.
#[test]
fn the_fire_time_trust_read_answers_a_remote_row_from_its_last_open_check() {
    use super::commands::{settle_open_decision, OpenCheck, OpenDecision, StartSignals};
    use crate::folder_trust::commands::remote_trust;
    let h = harness();
    let data = TempDir::new().unwrap();
    let key = "ssh://me@mini-host/Users/me/p";
    let other = "ssh://me@mini-host/Users/me/q";
    let start = |trusted: bool| OpenDecision {
        check: OpenCheck::Start(StartSignals {
            unclean_flag: false,
            session_md: true,
            trusted,
            bypass_accepted: false,
        }),
        clear_end_pending: false,
        notice: None,
        substrate: None,
    };
    let settle = |d: OpenDecision| settle_open_decision(data.path(), &h.reg, key, d);

    // A local path is not this read's to answer; a remote one with no registry, or no check yet,
    // is untrusted.
    assert_eq!(remote_trust("/Users/me/p", Some(&h.reg)), None);
    assert_eq!(remote_trust(key, None), Some(false));
    assert_eq!(remote_trust(key, Some(&h.reg)), Some(false));

    settle(start(true));
    assert_eq!(remote_trust(key, Some(&h.reg)), Some(true));
    assert_eq!(remote_trust(other, Some(&h.reg)), Some(false), "per key");
    assert_eq!(
        remote_trust(key, None),
        Some(false),
        "no registry: untrusted"
    );

    settle(start(false));
    assert_eq!(remote_trust(key, Some(&h.reg)), Some(false));

    // EVERY other outcome overwrites an earlier `true`: no stale trust survives a later check.
    // (`remote_open_check` routes its early returns, Invalid and Unreachable, through the same
    // settle; its caller guard pins that.) Exhaustive by construction: a new `OpenCheck` variant
    // fails to compile here until it is listed.
    let every_other = |c: &OpenCheck| match c {
        OpenCheck::Start(_) => false,
        OpenCheck::Reconnect { .. }
        | OpenCheck::AskEndPending { .. }
        | OpenCheck::AskUnrecorded { .. }
        | OpenCheck::FolderMissing { .. }
        | OpenCheck::Unreachable { .. }
        | OpenCheck::Invalid { .. } => true,
    };
    let m = || "x".to_string();
    let others = [
        OpenCheck::Reconnect { mode: None },
        OpenCheck::AskEndPending { message: m() },
        OpenCheck::AskUnrecorded { message: m() },
        OpenCheck::FolderMissing { message: m() },
        OpenCheck::Unreachable { message: m() },
        OpenCheck::Invalid { message: m() },
    ];
    assert!(others.iter().all(every_other));
    for check in others {
        settle(start(true));
        settle(OpenDecision {
            check: check.clone(),
            clear_end_pending: false,
            notice: None,
            substrate: None,
        });
        assert_eq!(remote_trust(key, Some(&h.reg)), Some(false), "{check:?}");
    }
}

/// M18 WP2 — the fire-time BYPASS read answers a remote row from its last open check, through the
/// same settle as trust: a start carries the remote account's answer, every other outcome
/// overwrites an earlier `true` (no stale acceptance survives a later check).
#[test]
fn the_fire_time_bypass_read_answers_a_remote_row_from_its_last_open_check() {
    use super::commands::{settle_open_decision, OpenCheck, OpenDecision, StartSignals};
    use crate::bypass_prompt::commands::remote_cleared;
    use crate::cc_session::{CcPermissionMode, SpawnPermission};
    let h = harness();
    let data = TempDir::new().unwrap();
    let key = "ssh://me@mini-host/Users/me/p";
    let other = "ssh://me@mini-host/Users/me/q";
    let bypass = Some(SpawnPermission::Flag(CcPermissionMode::BypassPermissions));
    let start = |bypass_accepted: bool| OpenDecision {
        check: OpenCheck::Start(StartSignals {
            unclean_flag: false,
            session_md: true,
            trusted: true,
            bypass_accepted,
        }),
        clear_end_pending: false,
        notice: None,
        substrate: None,
    };
    let settle = |d: OpenDecision| settle_open_decision(data.path(), &h.reg, key, d);

    assert_eq!(
        remote_cleared(key, bypass, Some(&h.reg)),
        Some(false),
        "no check yet"
    );
    settle(start(true));
    assert_eq!(remote_cleared(key, bypass, Some(&h.reg)), Some(true));
    assert_eq!(
        remote_cleared(other, bypass, Some(&h.reg)),
        Some(false),
        "per key"
    );
    // The trust answer and the bypass answer are separate maps.
    settle(start(false));
    assert_eq!(remote_cleared(key, bypass, Some(&h.reg)), Some(false));
    assert!(
        h.reg.open_trust(key),
        "trust is untouched by the bypass answer"
    );

    let m = || "x".to_string();
    for check in [
        OpenCheck::Reconnect { mode: None },
        OpenCheck::AskEndPending { message: m() },
        OpenCheck::AskUnrecorded { message: m() },
        OpenCheck::FolderMissing { message: m() },
        OpenCheck::Unreachable { message: m() },
        OpenCheck::Invalid { message: m() },
    ] {
        settle(start(true));
        settle(OpenDecision {
            check: check.clone(),
            clear_end_pending: false,
            notice: None,
            substrate: None,
        });
        assert!(!h.reg.open_bypass(key), "{check:?}");
    }
}

/// M17 WP5 — the open check's other local writes, through the same function: a stale end-intent
/// is cleared only when the decision says so, and the notice is left for the workspace (once).
#[test]
fn settling_an_open_decision_clears_a_stale_end_intent_and_leaves_the_notice() {
    use super::commands::{settle_open_decision, OpenCheck, OpenDecision, StartSignals};
    use crate::remote_record::{get, record_state, SessionRecordState};
    let h = harness();
    let data = TempDir::new().unwrap();
    let key = "ssh://me@mini-host/Users/me/p";
    let decision = |clear: bool, notice: Option<&str>| OpenDecision {
        check: OpenCheck::Start(StartSignals::default()),
        clear_end_pending: clear,
        notice: notice.map(str::to_string),
        substrate: None,
    };
    assert!(record_state(
        data.path(),
        key,
        SessionRecordState::EndPending
    ));
    let check = settle_open_decision(data.path(), &h.reg, key, decision(false, None));
    assert_eq!(check, OpenCheck::Start(StartSignals::default()));
    assert_eq!(
        get(data.path(), key).map(|r| r.state),
        Some(SessionRecordState::EndPending),
        "not cleared unless the decision says so"
    );
    assert_eq!(h.reg.take_open_notice(key), None);

    settle_open_decision(
        data.path(),
        &h.reg,
        key,
        decision(true, Some("it had ended")),
    );
    assert_eq!(
        get(data.path(), key).map(|r| r.state),
        Some(SessionRecordState::Ended)
    );
    assert_eq!(h.reg.take_open_notice(key).as_deref(), Some("it had ended"));
    assert_eq!(h.reg.take_open_notice(key), None, "taken once");
}

/// M18 WP4 (§R.2, D5) — the per-HOST substrate cache: a change is reported once, an identical
/// write is silent, hosts are independent, and an unprobed host reads Unknown.
#[test]
fn the_substrate_cache_reports_each_change_once_per_host() {
    use crate::remote_substrate::{HostSubstrate, SubstrateEvent};
    let h = harness();
    let seen: Arc<Mutex<Vec<SubstrateEvent>>> = Arc::default();
    let sink_seen = Arc::clone(&seen);
    h.reg
        .set_substrate_sink(Arc::new(move |e| sink_seen.lock().unwrap().push(e)));
    let dev = || HostSubstrate::Developer {
        root: Some("/r".into()),
        head: None,
    };
    assert_eq!(
        h.reg.substrate("me@a"),
        HostSubstrate::Unknown,
        "never probed"
    );
    assert!(h.reg.set_substrate("me@a", dev()));
    assert!(!h.reg.set_substrate("me@a", dev()), "identical: no change");
    assert!(h.reg.set_substrate("me@b", HostSubstrate::Absent));
    assert!(
        h.reg.set_substrate("me@a", HostSubstrate::Unknown),
        "Unknown is a real value"
    );
    assert_eq!(h.reg.substrate("me@a"), HostSubstrate::Unknown);
    assert_eq!(h.reg.substrate("me@b"), HostSubstrate::Absent, "per host");
    let hosts: Vec<(String, HostSubstrate)> = seen
        .lock()
        .unwrap()
        .iter()
        .map(|e| (e.host.clone(), e.substrate.clone()))
        .collect();
    assert_eq!(
        hosts,
        vec![
            ("me@a".to_string(), dev()),
            ("me@b".to_string(), HostSubstrate::Absent),
            ("me@a".to_string(), HostSubstrate::Unknown),
        ],
        "exactly one event per change"
    );
    assert_eq!(h.reg.substrates().len(), 2);
}

/// M18 WP4 (D5) — the open check writes the substrate through `settle_open_decision`, under the
/// row's HOST; a decision with no substrate (unreachable, invalid, gate OFF) leaves it alone.
#[test]
fn settling_an_open_check_writes_the_hosts_substrate_only_when_it_probed() {
    use super::commands::{settle_open_decision, OpenCheck, OpenDecision};
    use crate::remote_substrate::HostSubstrate;
    let h = harness();
    let data = TempDir::new().unwrap();
    let key = "ssh://me@mini-host/Users/me/p";
    let decision = |substrate: Option<HostSubstrate>| OpenDecision {
        check: OpenCheck::Unreachable {
            message: "x".into(),
        },
        clear_end_pending: false,
        notice: None,
        substrate,
    };
    settle_open_decision(
        data.path(),
        &h.reg,
        key,
        decision(Some(HostSubstrate::Absent)),
    );
    assert_eq!(h.reg.substrate("me@mini-host"), HostSubstrate::Absent);
    settle_open_decision(data.path(), &h.reg, key, decision(None));
    assert_eq!(
        h.reg.substrate("me@mini-host"),
        HostSubstrate::Absent,
        "no probe: the last known value stays"
    );
}

/// M18 WP4 — `decide_open` carries the probed substrate on EVERY decision an answered check
/// makes (start, reconnect, ask, folder-missing), and none on an unanswered one.
#[test]
fn every_answered_open_decision_carries_the_probed_substrate() {
    use super::commands::decide_open;
    use crate::remote_cmd::{ValidTarget, OPEN_SENTINEL as S};
    use crate::remote_record::SessionRecordState;
    use crate::remote_substrate::HostSubstrate;
    let target = ValidTarget::new("me@mini-host", "/Users/me/p").unwrap();
    let probed = format!("{S}substrate-probed\n{S}substrate:no\n");
    for (out, record) in [
        (format!("{S}dir:yes\n{S}live:no\n{probed}"), None),
        (format!("{S}dir:no\n{S}live:no\n{probed}"), None),
        (
            format!("{S}dir:yes\n{S}live:yes\n{probed}"),
            Some(SessionRecordState::Running),
        ),
        (format!("{S}dir:yes\n{S}live:yes\n{probed}"), None),
    ] {
        let d = decide_open(Ok(out.clone()), record, false, &target);
        assert_eq!(d.substrate, Some(HostSubstrate::Absent), "{out:?}");
    }
    let unprobed = decide_open(
        Ok(format!("{S}dir:yes\n{S}live:no\n")),
        None,
        false,
        &target,
    );
    assert_eq!(unprobed.substrate, None, "gate OFF: nothing to write");
    let dead = decide_open(Ok("noise".into()), None, false, &target);
    assert_eq!(dead.substrate, None, "no answer: nothing to write");
}
