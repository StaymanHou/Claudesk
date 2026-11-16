//! M17 WP3 — **the host link**: one ssh ControlMaster per remote host (`arch/remote-workspaces.md`
//! §B).
//!
//! Every remote terminal (`ssh -S <ctl> -tt …`) and every side-channel exec (`ssh -S <ctl> …`)
//! rides one master per host, and the master carries the `-R` forward of the hook socket. The
//! forward belongs to the HOST, not to a workspace: two workspaces forwarding the same remote
//! socket would collide with each other, and a reconnect would collide with its own stale bind
//! (both probed in research).
//!
//! ## The worker
//!
//! Each link is one thread looping `Connecting → Up → Lost(reason) → Connecting …` until it is
//! stopped (`Down`). Every transition is reported through the registry's event sink (the app
//! emits it as `remote-link`). Before EVERY master connect it runs the **pre-connect exec**
//! ([`pre_connect_script`]): `mkdir -p` the state dir, `rm -f` the remote hook socket (the probed
//! fix for a stale bind; it needs no sshd change, so `StreamLocalBindUnlink` is deliberately NOT
//! used), write `tmux.conf` and the `cc-launch` launcher, and print the remote `$HOME`.
//!
//! ⚠️ **Blocking, always off the main thread.** Every function here that touches ssh waits on a
//! process. The worker is its own thread, and the commands are `async` on a blocking worker
//! (`commands.rs`; `tests/sync_commands_do_not_block.rs`).
//!
//! ## The launcher (arch §C's (a)/(b) ruling: **(b)**, WP3 plan)
//!
//! `~/.claudesk/<identifier>/cc-launch` exports the token, sets the inline TUI, unsets `TMUX`,
//! then `exec claude "$@"`. The spawn's tmux command therefore contains no shell expansion at
//! all: every part of it is a constant or goes through `remote_cmd::quote`, and the token's
//! `$(cat …)` lives only in this file on the remote.

pub mod commands;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::remote_cmd::preflight::{
    connect_failure, ExecResult, RemoteExec, SshExec, CONNECT_TIMEOUT_S,
};
use crate::remote_cmd::{quote, ValidTarget, TOKEN_FILE};
use crate::subprocess::{in_own_group, kill_and_reap, kill_group, run_captured, RunError};

/// How long [`LinkRegistry::ensure`] waits for a link to come Up.
pub const LINK_UP_TIMEOUT: Duration = Duration::from_secs(15);
/// The reconnect backoff: doubles from [`BACKOFF_MIN`] after each failed attempt, capped here.
pub const BACKOFF_MAX: Duration = Duration::from_secs(30);
/// The first retry delay, and the delay after a link that WAS up drops.
pub const BACKOFF_MIN: Duration = Duration::from_secs(1);
/// `ServerAliveInterval` (seconds) × [`SERVER_ALIVE_COUNT`]: a dead network is noticed in ~45 s.
pub const SERVER_ALIVE_INTERVAL: u32 = 15;
pub const SERVER_ALIVE_COUNT: u32 = 3;
/// How often the worker polls `-O check` while connecting, and the master's exit while Up.
const POLL: Duration = Duration::from_millis(200);
/// How often [`LinkRegistry::wait_up`] re-checks its cancel flag between link-state changes.
const WAIT_UP_SLICE: Duration = Duration::from_millis(250);
/// A side-channel exec's default deadline (a `test -d`, a `send-keys`): 0.14 s measured warm.
pub const EXEC_TIMEOUT_MS: u64 = 10_000;

/// macOS `sun_path` is 104 bytes INCLUDING the terminating NUL, so a socket path may be at most
/// 103 bytes. ssh refuses a longer ControlPath as "Bad … specification" (probed: `%C` in the
/// app-data dir overflowed at ~107).
pub const SUN_PATH_MAX_LEN: usize = 103;

/// The first line of the pre-connect script's own output, so rc-file noise from the remote's
/// `.zshenv` can never be mistaken for `$HOME` (the WP2 review's `…-PRINT-HOME-INTOLERANT-OF-RC-NOISE`).
pub const HOME_SENTINEL: &str = "CLAUDESK-REMOTE-HOME:";

/// The tmux config every Claudesk session starts with (arch §C.1, ratified 2026-11-14), loaded
/// with `-f` because `-L` isolates the socket but NOT `~/.tmux.conf`.
pub const TMUX_CONF: &str = "set -g status off\n\
set -g mouse on\n\
set -as terminal-features ',xterm*:RGB'\n";

/// One link's state, as broadcast on `remote-link`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "lowercase")]
pub enum LinkState {
    Connecting,
    Up,
    /// The last attempt failed, or an Up link dropped; the worker is retrying. `reason` is in
    /// plain words.
    Lost {
        reason: String,
    },
    /// Stopped on purpose (no sessions left, or the app is quitting).
    Down,
}

/// The `remote-link` event payload.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct LinkEvent {
    pub host: String,
    #[serde(flatten)]
    pub state: LinkState,
}

/// What a caller needs from an Up link.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LinkInfo {
    /// The local ControlPath every `ssh -S` uses.
    pub control_path: PathBuf,
    /// The remote `$HOME`, absolute (from the pre-connect exec).
    pub home: String,
}

pub use crate::remote_cmd::hash8;

/// `<app_data>/ssh/<hash8(host)>`. Short on purpose: see [`SUN_PATH_MAX_LEN`].
pub fn control_path(app_data: &Path, host: &str) -> PathBuf {
    app_data.join("ssh").join(hash8(host))
}

/// `<home>/.claudesk/<identifier>`, the remote state dir (dev and prod stay distinct).
pub fn remote_state_dir(home: &str, identifier: &str) -> String {
    format!("{}/.claudesk/{identifier}", home.trim_end_matches('/'))
}

/// The remote end of the hook-socket forward.
pub fn remote_socket(home: &str, identifier: &str) -> String {
    format!("{}/hook.sock", remote_state_dir(home, identifier))
}

/// The deployed `cc-launch` (option (b)). Constant data: no variable value enters it. The token
/// path is [`TOKEN_FILE`] with its `~/` written as `$HOME/` (a `#!/bin/sh` script).
pub fn cc_launcher() -> String {
    let token = TOKEN_FILE.replacen("~/", "$HOME/", 1);
    format!(
        "#!/bin/sh\n\
# Deployed by Claudesk and rewritten on every link connect. Do not edit.\n\
CLAUDE_CODE_OAUTH_TOKEN=\"$(cat \"{token}\")\" || exit 1\n\
export CLAUDE_CODE_OAUTH_TOKEN\n\
export CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1\n\
unset TMUX\n\
exec claude \"$@\"\n"
    )
}

/// The pre-connect exec, run (by the remote login shell) before every master connect. The
/// identifier is the only variable value and enters through [`quote`]; the file contents are
/// written through QUOTED heredocs (`<<'EOF'`), so nothing in them is expanded by this script.
/// Each file is written to a temp name and renamed, so a concurrent spawn never reads half of
/// one. Prints [`HOME_SENTINEL`]`$HOME` last.
pub fn pre_connect_script(identifier: &str) -> String {
    format!(
        "set -e\n\
umask 077\n\
d=\"$HOME/.claudesk/\"{id}\n\
mkdir -p \"$d\"\n\
rm -f \"$d/hook.sock\"\n\
cat > \"$d/tmux.conf.tmp\" <<'CLAUDESK_EOF'\n\
{conf}CLAUDESK_EOF\n\
mv -f \"$d/tmux.conf.tmp\" \"$d/tmux.conf\"\n\
cat > \"$d/cc-launch.tmp\" <<'CLAUDESK_EOF'\n\
{launcher}CLAUDESK_EOF\n\
chmod 700 \"$d/cc-launch.tmp\"\n\
mv -f \"$d/cc-launch.tmp\" \"$d/cc-launch\"\n\
printf '%s%s\\n' '{sentinel}' \"$HOME\"\n",
        id = quote(identifier),
        conf = TMUX_CONF,
        launcher = cc_launcher(),
        sentinel = HOME_SENTINEL,
    )
}

/// Read `$HOME` from the pre-connect output: the LAST line starting with [`HOME_SENTINEL`].
/// Refused unless absolute and free of whitespace, `:` and control characters, because it
/// becomes part of the `-R <remote>:<local>` argument (ssh splits on `:`).
pub fn parse_home(out: &str) -> Result<String, String> {
    let home = out
        .lines()
        .rev()
        .find_map(|l| l.strip_prefix(HOME_SENTINEL))
        .ok_or_else(|| "the host did not report its home folder".to_string())?
        .trim_end_matches('\r');
    if !home.starts_with('/')
        || home
            .chars()
            .any(|c| c == ':' || c.is_whitespace() || c.is_control())
    {
        return Err(format!(
            "the host's home folder {home:?} can't carry a socket forward (it must be absolute, \
             with no spaces or ':')"
        ));
    }
    Ok(home.trim_end_matches('/').to_string())
}

/// The master's argv (arch §B). `--` ends ssh's options, so even a host that slipped past
/// validation cannot become one.
pub fn master_argv(ctl: &Path, remote_sock: &str, local_sock: &Path, host: &str) -> Vec<String> {
    let mut v: Vec<String> = [
        "/usr/bin/ssh",
        "-M",
        "-N",
        "-o",
        "ControlPersist=no",
        "-o",
        "BatchMode=yes",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect();
    v.extend([
        "-o".into(),
        format!("ConnectTimeout={CONNECT_TIMEOUT_S}"),
        "-o".into(),
        format!("ServerAliveInterval={SERVER_ALIVE_INTERVAL}"),
        "-o".into(),
        format!("ServerAliveCountMax={SERVER_ALIVE_COUNT}"),
        "-o".into(),
        "ExitOnForwardFailure=yes".into(),
        "-S".into(),
        ctl.display().to_string(),
        "-R".into(),
        format!("{remote_sock}:{}", local_sock.display()),
        "--".into(),
        host.to_string(),
    ]);
    v
}

/// `ssh -S <ctl> -O check -- <host>`: exit 0 iff the master is up and answering.
pub fn check_argv(ctl: &Path, host: &str) -> Vec<String> {
    vec![
        "/usr/bin/ssh".into(),
        "-S".into(),
        ctl.display().to_string(),
        "-O".into(),
        "check".into(),
        "--".into(),
        host.to_string(),
    ]
}

/// A side-channel exec over the master. `ControlMaster=no` so it never tries to become a master
/// itself; if the master is gone it connects directly (BatchMode, bounded by ConnectTimeout).
pub fn exec_argv(ctl: &Path, host: &str, remote_command: &str) -> Vec<String> {
    vec![
        "/usr/bin/ssh".into(),
        "-S".into(),
        ctl.display().to_string(),
        "-o".into(),
        "ControlMaster=no".into(),
        "-o".into(),
        "BatchMode=yes".into(),
        "-o".into(),
        format!("ConnectTimeout={CONNECT_TIMEOUT_S}"),
        "--".into(),
        host.to_string(),
        remote_command.to_string(),
    ]
}

fn command_from(argv: &[String]) -> Command {
    let mut cmd = Command::new(&argv[0]);
    cmd.args(&argv[1..]);
    cmd
}

/// A running master process.
pub trait Master: Send {
    /// `Some(reason)` once it has exited (in plain words), `None` while it runs.
    fn try_exit(&mut self) -> Option<String>;
    /// Kill its process group and reap it.
    fn kill(&mut self);
    /// Its pid (= its process group, [`in_own_group`]), so [`LinkRegistry::stop`] can kill it
    /// without waiting for the worker.
    fn pid(&self) -> Option<u32>;
}

/// Everything the worker does to the outside world. Injectable so the state machine is tested
/// without a network.
pub trait Transport: Send + Sync {
    /// Run the pre-connect script on `host`; stdout, or the failure in plain words.
    fn pre_connect(&self, host: &str, script: &str) -> Result<String, String>;
    fn spawn_master(&self, host: &str, argv: &[String]) -> Result<Box<dyn Master>, String>;
    /// Whether `-O check` answers.
    fn check(&self, argv: &[String]) -> bool;
}

/// The real transport: `/usr/bin/ssh`.
pub struct SshTransport;

struct SshMaster {
    host: String,
    child: Child,
    stderr: Arc<Mutex<String>>,
}

impl Master for SshMaster {
    fn try_exit(&mut self) -> Option<String> {
        match self.child.try_wait() {
            Ok(None) => None,
            Ok(Some(status)) => {
                // Give the stderr reader a moment to take the last line.
                std::thread::sleep(Duration::from_millis(50));
                let stderr = self.stderr.lock().map(|s| s.clone()).unwrap_or_default();
                // A master killed by a signal, or a network that went quiet, often leaves no
                // stderr at all; "ssh … was killed: " would then end on nothing.
                if stderr.trim().is_empty() {
                    return Some(format!("the link to {} dropped", self.host));
                }
                Some(connect_failure(
                    &self.host,
                    &ExecResult::Failed {
                        code: status.code(),
                        stderr,
                    },
                ))
            }
            Err(e) => Some(format!("lost track of the ssh link: {e}")),
        }
    }

    fn kill(&mut self) {
        kill_and_reap(&mut self.child);
    }

    fn pid(&self) -> Option<u32> {
        Some(self.child.id())
    }
}

impl Transport for SshTransport {
    fn pre_connect(&self, host: &str, script: &str) -> Result<String, String> {
        match SshExec.exec(host, script) {
            ExecResult::Ok(out) => Ok(out),
            other => Err(connect_failure(host, &other)),
        }
    }

    fn spawn_master(&self, host: &str, argv: &[String]) -> Result<Box<dyn Master>, String> {
        let mut cmd = command_from(argv);
        in_own_group(&mut cmd)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::piped());
        let mut child = cmd.spawn().map_err(|e| format!("could not run ssh: {e}"))?;
        let stderr = Arc::new(Mutex::new(String::new()));
        if let Some(mut pipe) = child.stderr.take() {
            let sink = Arc::clone(&stderr);
            // Keeps only the tail: ssh's last words are the reason a link died.
            let spawned = std::thread::Builder::new().spawn(move || {
                use std::io::Read;
                let mut buf = [0u8; 4096];
                while let Ok(n) = pipe.read(&mut buf) {
                    if n == 0 {
                        break;
                    }
                    if let Ok(mut s) = sink.lock() {
                        s.push_str(&String::from_utf8_lossy(&buf[..n]));
                        if s.len() > 8192 {
                            let cut = s.len() - 4096;
                            let cut = (cut..s.len()).find(|i| s.is_char_boundary(*i)).unwrap_or(0);
                            s.drain(..cut);
                        }
                    }
                }
            });
            if let Err(e) = spawned {
                kill_and_reap(&mut child);
                return Err(format!("could not watch the ssh link: {e}"));
            }
        }
        Ok(Box::new(SshMaster {
            host: host.to_string(),
            child,
            stderr,
        }))
    }

    fn check(&self, argv: &[String]) -> bool {
        run_captured(command_from(argv), "", 5_000).is_ok()
    }
}

/// State shared between a link's worker and its callers.
struct Shared {
    inner: Mutex<SharedInner>,
    cv: Condvar,
    stop: AtomicBool,
}

struct SharedInner {
    state: LinkState,
    home: Option<String>,
    /// Bumped on every `Lost`, so a waiter can tell "an attempt failed since I started".
    failures: u64,
    /// The live master's pid, while one runs.
    master_pid: Option<u32>,
}

impl Shared {
    fn new() -> Self {
        Self {
            inner: Mutex::new(SharedInner {
                state: LinkState::Connecting,
                home: None,
                failures: 0,
                master_pid: None,
            }),
            cv: Condvar::new(),
            stop: AtomicBool::new(false),
        }
    }

    fn stopped(&self) -> bool {
        self.stop.load(Ordering::SeqCst)
    }

    /// Sleep up to `d`, waking early if the link is stopped.
    fn nap(&self, d: Duration) {
        let deadline = Instant::now() + d;
        let mut guard = match self.inner.lock() {
            Ok(g) => g,
            Err(_) => return,
        };
        while !self.stopped() {
            let now = Instant::now();
            if now >= deadline {
                break;
            }
            guard = match self.cv.wait_timeout(guard, deadline - now) {
                Ok((g, _)) => g,
                Err(_) => return,
            };
        }
    }
}

type Sink = Arc<dyn Fn(LinkEvent) + Send + Sync>;

/// Everything a link worker needs, fixed at start.
struct WorkerCfg {
    host: String,
    control_path: PathBuf,
    local_socket: PathBuf,
    identifier: String,
    transport: Arc<dyn Transport>,
    sink: Sink,
    up_timeout: Duration,
    backoff_min: Duration,
    backoff_max: Duration,
}

fn set_state(cfg: &WorkerCfg, shared: &Shared, state: LinkState, home: Option<String>) {
    if let Ok(mut g) = shared.inner.lock() {
        if matches!(state, LinkState::Lost { .. }) {
            g.failures += 1;
        }
        if home.is_some() || !matches!(state, LinkState::Up) {
            g.home = home;
        }
        g.state = state.clone();
    }
    shared.cv.notify_all();
    (cfg.sink)(LinkEvent {
        host: cfg.host.clone(),
        state,
    });
}

/// The link worker: connect, hold, reconnect, until stopped.
fn run_worker(cfg: WorkerCfg, shared: Arc<Shared>) {
    let mut backoff = cfg.backoff_min;
    let script = pre_connect_script(&cfg.identifier);
    'outer: while !shared.stopped() {
        set_state(&cfg, &shared, LinkState::Connecting, None);
        let attempt = (|| -> Result<(Box<dyn Master>, String), String> {
            let home = parse_home(&cfg.transport.pre_connect(&cfg.host, &script)?)?;
            let rsock = remote_socket(&home, &cfg.identifier);
            if rsock.len() > SUN_PATH_MAX_LEN {
                return Err(format!(
                    "the remote socket path is too long for macOS ({} bytes): {rsock}",
                    rsock.len()
                ));
            }
            // A master killed hard leaves its ControlPath behind, and ssh then refuses to
            // create one ("ControlSocket … already exists").
            let _ = std::fs::remove_file(&cfg.control_path);
            let argv = master_argv(&cfg.control_path, &rsock, &cfg.local_socket, &cfg.host);
            // ⚠️ Re-checked HERE: the pre-connect exec can take seconds, and a link stopped
            // meanwhile must not start a master nobody will kill.
            if shared.stopped() {
                return Err(String::new());
            }
            let master = cfg.transport.spawn_master(&cfg.host, &argv)?;
            if let Ok(mut g) = shared.inner.lock() {
                g.master_pid = master.pid();
            }
            Ok((master, home))
        })();
        let (mut master, home) = match attempt {
            Ok(m) => m,
            Err(_) if shared.stopped() => break 'outer,
            Err(reason) => {
                set_state(&cfg, &shared, LinkState::Lost { reason }, None);
                shared.nap(backoff);
                backoff = (backoff * 2).min(cfg.backoff_max);
                continue;
            }
        };

        // Wait for the master to answer `-O check`, to die, or to be stopped.
        let check = check_argv(&cfg.control_path, &cfg.host);
        let started = Instant::now();
        let up = loop {
            if shared.stopped() {
                master.kill();
                break 'outer;
            }
            if let Some(reason) = master.try_exit() {
                break Err(reason);
            }
            if cfg.transport.check(&check) {
                break Ok(());
            }
            if started.elapsed() >= cfg.up_timeout {
                master.kill();
                break Err(format!(
                    "the link to {} did not come up within {}s",
                    cfg.host,
                    cfg.up_timeout.as_secs()
                ));
            }
            shared.nap(POLL);
        };
        if let Err(reason) = up {
            if shared.stopped() {
                break 'outer;
            }
            set_state(&cfg, &shared, LinkState::Lost { reason }, None);
            shared.nap(backoff);
            backoff = (backoff * 2).min(cfg.backoff_max);
            continue;
        }
        set_state(&cfg, &shared, LinkState::Up, Some(home));
        backoff = cfg.backoff_min;

        // Hold until the master dies or the link is stopped.
        loop {
            if shared.stopped() {
                master.kill();
                break 'outer;
            }
            if let Some(reason) = master.try_exit() {
                set_state(&cfg, &shared, LinkState::Lost { reason }, None);
                break;
            }
            shared.nap(POLL);
        }
        shared.nap(backoff);
    }
    // ⚠️ The ControlPath is NOT removed here: a new link for the same host may already own it
    // (stop does not wait for this worker). The next connect removes a stale one itself.
    if let Ok(mut g) = shared.inner.lock() {
        g.master_pid = None;
    }
    set_state(&cfg, &shared, LinkState::Down, None);
}

struct Link {
    shared: Arc<Shared>,
    control_path: PathBuf,
    /// How many [`LinkHold`]s count on this link.
    refs: usize,
    /// Which link this is: unique per registry, so a hold taken on a link that was later stopped
    /// can never release a NEWER link for the same host (M17 WP4 AC-0).
    gen: u64,
}

/// Flag the worker to stop, wake it, and kill its master's process group if one runs.
fn halt(l: &Link) {
    l.shared.stop.store(true, Ordering::SeqCst);
    let pid = l.shared.inner.lock().ok().and_then(|g| g.master_pid);
    l.shared.cv.notify_all();
    if let Some(pid) = pid {
        kill_group(pid);
    }
}

/// One link per host. Owned by the app as managed state (`commands::init`).
pub struct LinkRegistry {
    links: Mutex<HashMap<String, Link>>,
    /// The next [`Link::gen`].
    next_gen: AtomicU64,
    transport: Arc<dyn Transport>,
    app_data: PathBuf,
    local_socket: PathBuf,
    identifier: String,
    sink: Sink,
    up_timeout: Duration,
    backoff_min: Duration,
    backoff_max: Duration,
    /// Test seam: how long [`Self::ensure`] pauses between starting a link and reading its
    /// state, so a test can make the worker's first failure land in exactly that window (the F1
    /// race) every time instead of ~1 run in 4.
    #[cfg(test)]
    pause_after_start: Duration,
}

impl LinkRegistry {
    pub fn new(
        transport: Arc<dyn Transport>,
        app_data: PathBuf,
        local_socket: PathBuf,
        identifier: String,
        sink: Sink,
    ) -> Self {
        Self {
            links: Mutex::new(HashMap::new()),
            next_gen: AtomicU64::new(1),
            transport,
            app_data,
            local_socket,
            identifier,
            sink,
            up_timeout: LINK_UP_TIMEOUT,
            backoff_min: BACKOFF_MIN,
            backoff_max: BACKOFF_MAX,
            #[cfg(test)]
            pause_after_start: Duration::ZERO,
        }
    }

    #[cfg(test)]
    fn with_timings(mut self, up: Duration, min: Duration, max: Duration) -> Self {
        self.up_timeout = up;
        self.backoff_min = min;
        self.backoff_max = max;
        self
    }

    /// The link for `host`, started if absent. Returns its shared state, its ControlPath, and
    /// the failure count AT THIS MOMENT.
    ///
    /// ⚠️ The baseline is read here, under the registry lock and BEFORE a new worker exists
    /// (so 0 for a new link). Read after the worker started, it could already include that
    /// worker's first failure, and [`Self::ensure`] would then miss it and wait through the next
    /// attempt (a verify-self flake, WP3 P2.verify-self.F1).
    ///
    /// ⚠️ Takes the caller's `links` guard: [`Self::start_and_hold`] must find-or-start AND count
    /// its hold under ONE lock (`SURFACE-2026-11-16-QUALITY-M17WP3-ENSURE-THEN-HOLD-IS-NOT-ATOMIC`).
    fn get_or_start_locked(
        &self,
        links: &mut HashMap<String, Link>,
        host: &str,
    ) -> Result<(Arc<Shared>, PathBuf, u64), String> {
        if let Some(l) = links.get(host) {
            let failures = l
                .shared
                .inner
                .lock()
                .map_err(|_| "link state poisoned")?
                .failures;
            return Ok((Arc::clone(&l.shared), l.control_path.clone(), failures));
        }
        let ctl = control_path(&self.app_data, host);
        if ctl.as_os_str().len() > SUN_PATH_MAX_LEN {
            return Err(format!(
                "the local control socket path is too long for macOS: {}",
                ctl.display()
            ));
        }
        if let Some(dir) = ctl.parent() {
            std::fs::create_dir_all(dir)
                .map_err(|e| format!("could not create {}: {e}", dir.display()))?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700));
            }
        }
        let shared = Arc::new(Shared::new());
        let cfg = WorkerCfg {
            host: host.to_string(),
            control_path: ctl.clone(),
            local_socket: self.local_socket.clone(),
            identifier: self.identifier.clone(),
            transport: Arc::clone(&self.transport),
            sink: Arc::clone(&self.sink),
            up_timeout: self.up_timeout,
            backoff_min: self.backoff_min,
            backoff_max: self.backoff_max,
        };
        let worker_shared = Arc::clone(&shared);
        std::thread::Builder::new()
            .name(format!("remote-link-{}", hash8(host)))
            .spawn(move || run_worker(cfg, worker_shared))
            .map_err(|e| format!("could not start the link worker: {e}"))?;
        links.insert(
            host.to_string(),
            Link {
                shared: Arc::clone(&shared),
                control_path: ctl.clone(),
                refs: 0,
                gen: self.next_gen.fetch_add(1, Ordering::SeqCst),
            },
        );
        Ok((shared, ctl, 0))
    }

    /// [`Self::get_or_start_locked`] under its own lock, holding nothing. Tests only: production
    /// code always holds what it starts ([`Self::start_and_hold`]).
    #[cfg(test)]
    fn get_or_start(&self, host: &str) -> Result<(Arc<Shared>, PathBuf, u64), String> {
        let mut links = self.links.lock().map_err(|_| "link registry poisoned")?;
        self.get_or_start_locked(&mut links, host)
    }

    /// The link for `host`, started if absent, with one more hold counted on it: found-or-started
    /// and counted under ONE `links` lock, so no stop can land between the two. Returns the
    /// link's shared state, ControlPath, the failure baseline (see [`Self::get_or_start_locked`])
    /// and the hold.
    fn start_and_hold(
        self: &Arc<Self>,
        host: &str,
    ) -> Result<(Arc<Shared>, PathBuf, u64, LinkHold), String> {
        let mut links = self.links.lock().map_err(|_| "link registry poisoned")?;
        let (shared, ctl, failures) = self.get_or_start_locked(&mut links, host)?;
        let link = links
            .get_mut(host)
            .ok_or("the link vanished while it was being started")?;
        link.refs += 1;
        let hold = LinkHold {
            links: Arc::clone(self),
            host: host.to_string(),
            gen: link.gen,
            linger: None,
        };
        Ok((shared, ctl, failures, hold))
    }

    /// Start the link for `target`'s host if needed, take a hold on it, and wait (up to the Up
    /// timeout) until it is Up. ⚠️ Blocks: call from a worker, never a sync command.
    ///
    /// The hold is counted BEFORE the wait, under the same lock that found or started the link
    /// (M17 WP4 AC-0). The old `ensure`-then-`hold` pair left a window in which the host's last
    /// other session could stop the link, so the new session's hold counted nothing and its later
    /// drop decremented a different link.
    ///
    /// The first FAILED attempt after the call returns `Err(reason)` in plain words rather than
    /// waiting through the backoff, so the picker can say "could not resolve hostname" at once.
    /// The hold is dropped on every `Err`: if nothing else holds the link, it stops, so a failed
    /// open leaves nothing retrying in the background.
    pub fn ensure_and_hold(
        self: &Arc<Self>,
        target: &ValidTarget,
    ) -> Result<(LinkInfo, LinkHold), String> {
        let host = target.host();
        let (shared, ctl, failures_at_start, hold) = self.start_and_hold(host)?;
        #[cfg(test)]
        std::thread::sleep(self.pause_after_start);
        // On `Err` the hold drops here, after the state lock inside is released.
        let info = self.wait_first_up(host, &shared, ctl, failures_at_start)?;
        Ok((info, hold))
    }

    /// Wait until `shared` is Up, or until an attempt fails AFTER `failures_at_start`, or the Up
    /// timeout passes.
    fn wait_first_up(
        &self,
        host: &str,
        shared: &Shared,
        ctl: PathBuf,
        failures_at_start: u64,
    ) -> Result<LinkInfo, String> {
        let deadline =
            Instant::now() + self.up_timeout + Duration::from_secs(CONNECT_TIMEOUT_S as u64);
        let mut g = shared.inner.lock().map_err(|_| "link state poisoned")?;
        loop {
            match &g.state {
                LinkState::Up => {
                    if let Some(home) = &g.home {
                        return Ok(LinkInfo {
                            control_path: ctl,
                            home: home.clone(),
                        });
                    }
                }
                LinkState::Lost { reason } if g.failures > failures_at_start => {
                    return Err(reason.clone());
                }
                LinkState::Down => return Err(format!("the link to {host} was stopped")),
                _ => {}
            }
            let now = Instant::now();
            if now >= deadline {
                return Err(format!("the link to {host} did not come up in time"));
            }
            g = shared
                .cv
                .wait_timeout(g, deadline - now)
                .map_err(|_| "link state poisoned")?
                .0;
        }
    }

    /// One hold on `host`'s link `gen` ended. When it was the last, the link is stopped: at once,
    /// or, for a lingering hold, after `linger` if nothing has taken a new hold by then.
    ///
    /// ⚠️ A hold whose link is gone, or was replaced by a newer one (another `gen`), releases
    /// NOTHING. The count and the stop are decided under one lock, so a hold taken meanwhile on
    /// the same link always keeps it.
    fn release(self: &Arc<Self>, host: &str, gen: u64, linger: Option<Duration>) {
        let last = match self.links.lock() {
            Ok(mut links) => match links.get_mut(host) {
                Some(l) if l.gen == gen => {
                    l.refs = l.refs.saturating_sub(1);
                    l.refs == 0
                }
                _ => false,
            },
            Err(_) => false,
        };
        if !last {
            return;
        }
        match linger {
            None => self.stop_if_unheld(host, gen),
            Some(after) => {
                let weak = Arc::downgrade(self);
                let owned = host.to_string();
                let spawned = std::thread::Builder::new()
                    .name(format!("remote-link-linger-{}", hash8(host)))
                    .spawn(move || {
                        std::thread::sleep(after);
                        if let Some(reg) = weak.upgrade() {
                            reg.stop_if_unheld(&owned, gen);
                        }
                    });
                if spawned.is_err() {
                    // No timer thread: stop now rather than leave an unheld link running.
                    self.stop_if_unheld(host, gen);
                }
            }
        }
    }

    /// How many holds count on `host`'s link. Tests only.
    #[cfg(test)]
    pub fn refs(&self, host: &str) -> usize {
        self.links
            .lock()
            .ok()
            .and_then(|l| l.get(host).map(|l| l.refs))
            .unwrap_or(0)
    }

    /// `host`'s current link state, if a link exists.
    pub fn state(&self, host: &str) -> Option<LinkState> {
        let links = self.links.lock().ok()?;
        let l = links.get(host)?;
        let state = l.shared.inner.lock().ok()?.state.clone();
        Some(state)
    }

    /// Block until `host`'s link is Up again, for a remote session that lost its terminal (M17
    /// WP3 Phase 5). Unlike [`Self::ensure`] this waits THROUGH failed attempts: the worker keeps
    /// retrying with backoff while a session holds the link, and a passive drop must reconnect
    /// (R-2). Returns `Err` when the link is stopped (no link, or Down) or `cancelled()` turns
    /// true (the workspace was closed meanwhile).
    ///
    /// ⚠️ Waits on the link's own condvar (every state change notifies it); the slice only bounds
    /// how late a cancel is noticed. ⚠️ Blocks: call from a worker thread.
    pub fn wait_up(&self, host: &str, cancelled: &dyn Fn() -> bool) -> Result<LinkInfo, String> {
        let stopped = || format!("the link to {host} was stopped");
        let (shared, ctl) = {
            let links = self.links.lock().map_err(|_| "link registry poisoned")?;
            let l = links.get(host).ok_or_else(stopped)?;
            (Arc::clone(&l.shared), l.control_path.clone())
        };
        let mut g = shared.inner.lock().map_err(|_| "link state poisoned")?;
        loop {
            match &g.state {
                LinkState::Up => {
                    if let Some(home) = &g.home {
                        return Ok(LinkInfo {
                            control_path: ctl,
                            home: home.clone(),
                        });
                    }
                }
                LinkState::Down => return Err(stopped()),
                _ => {}
            }
            if cancelled() || shared.stopped() {
                return Err(stopped());
            }
            g = shared
                .cv
                .wait_timeout(g, WAIT_UP_SLICE)
                .map_err(|_| "link state poisoned")?
                .0;
        }
    }

    /// Stop `host`'s link `gen` if no hold counts on it. Decided and removed under one lock.
    fn stop_if_unheld(&self, host: &str, gen: u64) {
        let link = match self.links.lock() {
            Ok(mut links) => match links.get(host) {
                Some(l) if l.gen == gen && l.refs == 0 => links.remove(host),
                _ => None,
            },
            Err(_) => None,
        };
        if let Some(l) = link {
            halt(&l);
        }
    }

    /// Stop `host`'s link: its master is killed NOW (by process group), and the worker winds
    /// down on its own and reports Down.
    ///
    /// ⚠️ Does not join the worker. The worker may be inside a pre-connect exec (up to its 30 s
    /// deadline), and a join would hold the caller, at quit the whole teardown, that long. Killing
    /// the master's group here is what guarantees nothing outlives the app.
    ///
    /// Tests only since WP4 AC-0: production stops a link through its last hold
    /// ([`Self::stop_if_unheld`]) or at quit ([`Self::stop_all`]), never regardless of holds.
    #[cfg(test)]
    pub fn stop(&self, host: &str) {
        let link = self.links.lock().ok().and_then(|mut l| l.remove(host));
        if let Some(l) = link {
            halt(&l);
        }
    }

    /// Stop every link (app quit).
    pub fn stop_all(&self) {
        let all: Vec<Link> = match self.links.lock() {
            Ok(mut l) => l.drain().map(|(_, v)| v).collect(),
            Err(_) => return,
        };
        for l in &all {
            halt(l);
        }
    }

    /// Run `remote_command` (shell text for the remote login shell, built by `remote_cmd`) over
    /// `target`'s master. ⚠️ Blocks for up to `timeout_ms`.
    pub fn exec(
        &self,
        target: &ValidTarget,
        remote_command: &str,
        timeout_ms: u64,
    ) -> Result<String, RunError> {
        let ctl = control_path(&self.app_data, target.host());
        run_captured(
            command_from(&exec_argv(&ctl, target.host(), remote_command)),
            "",
            timeout_ms,
        )
    }
}

/// `ssh`'s answer to "connect without the master": a proxy that exits at once. ssh only runs a
/// ProxyCommand for a NEW connection, never for a mux session, so with a live master this is
/// inert and with a dead one the terminal fails fast (255) instead of connecting directly.
pub const NO_DIRECT_FALLBACK: &str = "ProxyCommand=/usr/bin/false";

/// The local argv of a remote TERMINAL: `ssh -tt` over the host's master, running
/// `remote_command` (built by `remote_cmd::tmux_new_command` or, on a reconnect,
/// `tmux_attach_command`). The PTY runs this in place of `claude`, so a remote workspace runs no
/// local CC at all.
///
/// ⚠️ Terminals ONLY ride the master ([`NO_DIRECT_FALLBACK`]). With `ControlMaster=no` alone, ssh
/// silently connects DIRECTLY when the master's socket is stale or gone (WP3 Phase 5 verify-self:
/// a reconnect raced the link worker's 200 ms poll, read a stale Up and re-attached over its own
/// connection, outside the link and with no keep-alive). Failing instead lets the reconnect wait
/// for the link like everything else. Side-channel execs ([`exec_argv`]) keep the fallback on
/// purpose: they are short and bounded by `ConnectTimeout`.
pub fn terminal_argv(ctl: &Path, host: &str, remote_command: &str) -> Vec<String> {
    vec![
        "/usr/bin/ssh".into(),
        "-S".into(),
        ctl.display().to_string(),
        "-o".into(),
        "ControlMaster=no".into(),
        "-o".into(),
        NO_DIRECT_FALLBACK.into(),
        "-o".into(),
        "BatchMode=yes".into(),
        "-tt".into(),
        "--".into(),
        host.to_string(),
        remote_command.to_string(),
    ]
}

/// A hold on a host's link: a remote session's (taken at spawn), or the open check's (for its own
/// duration). Taken only through [`LinkRegistry::ensure_and_hold`], released when dropped, so the
/// last hold to go stops the link without any caller remembering to.
pub struct LinkHold {
    links: Arc<LinkRegistry>,
    host: String,
    /// The link this hold counted on ([`Link::gen`]).
    gen: u64,
    /// `None`: when this is the last hold, the link stops at once (a session's close, R-1).
    /// `Some(d)`: it stops `d` later unless a new hold arrived meanwhile (a successful open check,
    /// whose open follows within a second; see [`Self::linger`]).
    linger: Option<Duration>,
}

impl LinkHold {
    /// When this hold is the last to go, keep the link up for `after` before stopping it, so a
    /// hold taken in that window (the open that follows a successful open check) finds it Up
    /// instead of tearing it down and connecting again.
    pub fn linger(mut self, after: Duration) -> Self {
        self.linger = Some(after);
        self
    }
}

impl Drop for LinkHold {
    fn drop(&mut self) {
        self.links.release(&self.host, self.gen, self.linger);
    }
}

impl LinkRegistry {
    /// Take `session`'s pane out of tmux copy-mode over the master (arch §C.1/§E), so the next
    /// keys Claudesk types reach CC. ⚠️ Blocks up to [`EXEC_TIMEOUT_MS`].
    pub fn cancel_copy_mode(&self, target: &ValidTarget, session: &str) -> Result<(), RunError> {
        let cmd = crate::remote_cmd::tmux_cancel_copy_mode_command(
            crate::remote_cmd::tmux_server(&self.identifier),
            session,
        );
        self.exec(target, &cmd, EXEC_TIMEOUT_MS).map(|_| ())
    }

    /// Before an injection into `session`'s pane (P4.2): wait for the pane's bracketed-paste mode,
    /// then leave copy-mode, in one exec. `Err` in plain words when the pane never got ready or
    /// the exec failed; the caller then sends NOTHING (a split send or a swallowed command would
    /// be worse than a refusal). ⚠️ Blocks up to `max_polls` × 0.2 s + [`EXEC_TIMEOUT_MS`].
    pub fn prepare_inject(
        &self,
        target: &ValidTarget,
        session: &str,
        max_polls: u32,
    ) -> Result<(), String> {
        let cmd = crate::remote_cmd::tmux_prepare_inject_command(
            crate::remote_cmd::tmux_server(&self.identifier),
            session,
            max_polls,
        );
        let wait_ms = u64::from(max_polls) * 200;
        match self.exec(target, &cmd, wait_ms + EXEC_TIMEOUT_MS) {
            Ok(out) => match crate::remote_cmd::parse_ready(&out) {
                Some(true) => Ok(()),
                Some(false) => Err(format!(
                    "Claude Code on {} isn't ready for input yet (waited {}s)",
                    target.host(),
                    wait_ms / 1000
                )),
                None => Err(format!("{} gave no readiness answer", target.host())),
            },
            Err(e) => Err(format!("could not reach {}: {e}", target.host())),
        }
    }

    /// The identifier this registry deploys under (`~/.claudesk/<identifier>/`).
    pub fn identifier(&self) -> &str {
        &self.identifier
    }
}

/// Dropping the registry stops every link, so a master never outlives its owner: at app exit
/// (belt to `perform_quit_teardown`), and in a test that panics mid-way (a failing live test once
/// left an `ssh -M` running, WP3 P2.verify-self.F4).
impl Drop for LinkRegistry {
    fn drop(&mut self) {
        self.stop_all();
    }
}

#[cfg(test)]
mod tests;
