//! M17 WP7 Phase 3 — the **remote poller** (`arch/remote-workspaces.md` §F): the change signal for a
//! remote project's workflow docs, delivered as the SAME `fs-change` event the local `notify`
//! watcher emits, so `DocsPanel`'s live reload is unchanged.
//!
//! ## Shape
//! - **One worker thread per host**, alive while ≥1 workspace on that host is subscribed. It ticks
//!   every [`REMOTE_POLL_INTERVAL`], and at once when a workspace asks for a catch-up.
//! - **Only ACTIVE subscriptions are polled** (P3.verify-human.2, design prior
//!   `background-work-only-for-what-is-on-screen`): a workspace is active while it is centre stage
//!   AND its Docs tab is fronted. A paused subscription is left out of the exec and keeps its last
//!   snapshot; a host with no active workspace runs no exec at all.
//! - **A return is a catch-up** ([`RemotePoller::catch_up`]): it activates the workspace, wakes the
//!   worker, and hands back a receiver for that workspace's [`CatchUp`] from the next tick, which
//!   diffs against the snapshot kept while paused. The panel announces it in a toast.
//! - **Each tick is one short exec** ([`remote_cmd::doc_list_command`] over every active root), so a
//!   host never has more than ONE poll exec in flight, whatever the number of workspaces on it (the
//!   `MaxSessions` budget), and no long-running remote process is ever started.
//! - **Gate and link are read on every tick, before any exec** ([`PollEnv`]): gate OFF or link not
//!   Up → the tick does nothing (spec AC-7: a live toggle takes effect without a reopen). The exec
//!   itself is [`crate::remote_link::LinkRegistry::master_exec`], so even a stale Up never connects
//!   directly.
//! - **The diff is per workspace, over the curated docs set** ([`snapshot`] = the entries
//!   `docs::filter_listing` returns, keyed on mtime + size). A subscription's first answered tick
//!   only records its baseline. A skipped tick (gate OFF, link down, a failed exec) keeps the last
//!   snapshot, so the first answered tick after a drop emits what changed meanwhile.
//!
//! ## Never blocks the main thread
//! `subscribe` / `pause` / `unsubscribe` / `unsubscribe_all` only touch the registry and a channel
//! (their commands are sync); `catch_up` returns a receiver that its ASYNC command waits on. The
//! registry lock is NEVER held across an exec: a tick copies its active subscriptions out, runs, then
//! writes the new snapshots back (and answers the catch-up waiters) under the worker's generation (a
//! host whose worker was replaced meanwhile is not written to). Stopping a worker drops its channel
//! sender and detaches it: it exits at its next wake, never joined from a command or from the quit.

use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use super::ExecFailure;
use super::{doc_dirs, parse_listing, RemoteExec, LIST_TIMEOUT_MS};
use crate::docs::{filter_listing, DocDirs, DOC_DIRS};
use crate::fs_watch::{FsChange, FsKind};
use crate::remote_cmd::{self, ValidTarget};
use serde::Serialize;

/// How often a host's docs are polled. Operator, spec review 2026-11-17: 5 s (arch §F said 1.5 s).
/// It only sets Docs freshness while Docs is fronted: Recycle forces its own re-stat on `Stop` (AC-5).
pub const REMOTE_POLL_INTERVAL: Duration = Duration::from_secs(5);

/// A project's docs, `rel_path → (mtime_ms, size)`.
pub type Snapshot = BTreeMap<String, (i64, u64)>;

/// The curated docs set of one project's listing (exactly the entries the Docs panel would list),
/// keyed for change detection on mtime + size.
pub fn snapshot(dirs: &DocDirs) -> Snapshot {
    let listed: HashMap<String, (i64, u64)> = [
        (DOC_DIRS[0], &dirs.product),
        (DOC_DIRS[1], &dirs.state),
        (DOC_DIRS[2], &dirs.wip),
    ]
    .into_iter()
    .flat_map(|(dir, files)| {
        files
            .iter()
            .map(move |f| (format!("{dir}/{}", f.name), (f.mtime_ms as i64, f.size)))
    })
    .collect();
    filter_listing(dirs)
        .into_iter()
        .filter_map(|e| listed.get(&e.rel_path).map(|k| (e.rel_path, *k)))
        .collect()
}

/// What changed from `prev` to `next`, as one `fs-change` for `workspace_id`: every created,
/// modified and removed path, sorted. `kind` is the single kind when all changes share it, else
/// [`FsKind::Other`] (the consumers treat `kind` as a hint; `paths` is the signal). `None` when
/// nothing changed.
pub fn diff(workspace_id: &str, prev: &Snapshot, next: &Snapshot) -> Option<FsChange> {
    let mut paths: BTreeSet<String> = BTreeSet::new();
    let mut kinds: BTreeSet<u8> = BTreeSet::new();
    for (p, k) in next {
        match prev.get(p) {
            None => {
                paths.insert(p.clone());
                kinds.insert(0);
            }
            Some(old) if old != k => {
                paths.insert(p.clone());
                kinds.insert(1);
            }
            Some(_) => {}
        }
    }
    for p in prev.keys().filter(|p| !next.contains_key(*p)) {
        paths.insert(p.clone());
        kinds.insert(2);
    }
    if paths.is_empty() {
        return None;
    }
    let kind = match kinds.into_iter().collect::<Vec<_>>()[..] {
        [0] => FsKind::Created,
        [1] => FsKind::Modified,
        [2] => FsKind::Removed,
        _ => FsKind::Other,
    };
    Some(FsChange {
        workspace_id: workspace_id.to_string(),
        paths: paths.into_iter().collect(),
        kind,
        git_meta: false,
    })
}

/// What a tick reads before it may exec. Production: the workflow gate from `settings.json` and the
/// host link's state; tests: a double.
pub trait PollEnv: Send + Sync {
    /// The workflow-features gate (read fresh, every tick).
    fn gate_on(&self) -> bool;
    /// `host`'s link is Up right now.
    fn link_up(&self, host: &str) -> bool;
}

/// One subscribed workspace, as a tick sees it.
#[derive(Debug, Clone)]
pub struct Sub {
    pub workspace_id: String,
    pub target: ValidTarget,
    /// `None` until the first answered tick records the baseline.
    pub last: Option<Snapshot>,
    /// Polled only while active (centre stage + Docs fronted). A paused sub keeps `last`.
    pub active: bool,
}

/// What one tick meant for one workspace: the answer a catch-up waits for (and the panel's toast).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CatchUp {
    /// The first answered tick: there was nothing to compare with.
    Baseline,
    /// Nothing changed since the last snapshot.
    Unchanged,
    /// These docs changed (and went out as an `fs-change`).
    Changed { paths: Vec<String> },
    /// The workflow gate is OFF: nothing was read.
    GateOff,
    /// The host's link is not Up (or the master died under the exec): nothing was read.
    LinkDown,
    /// The exec ran but gave no usable answer.
    Failed { reason: String },
}

/// One tick for one host's subscriptions (the caller passes the ACTIVE ones): gate → link → ONE exec
/// over every root → a diff per workspace. Emits through `emit`, updates each `last`, and returns one
/// [`CatchUp`] per sub, in order (empty for no subs, and then no exec).
pub fn poll_tick(
    env: &dyn PollEnv,
    exec: &dyn RemoteExec,
    host: &str,
    subs: &mut [Sub],
    emit: &dyn Fn(FsChange),
) -> Vec<CatchUp> {
    let Some(target) = subs.first().map(|s| s.target.clone()) else {
        return Vec::new();
    };
    let all = |c: CatchUp| vec![c; subs.len()];
    if !env.gate_on() {
        return all(CatchUp::GateOff);
    }
    if !env.link_up(host) {
        return all(CatchUp::LinkDown);
    }
    let roots: Vec<&str> = subs.iter().map(|s| s.target.path()).collect();
    let cmd = remote_cmd::doc_list_command(&DOC_DIRS, &roots);
    let out = match exec.run(&target, &cmd, LIST_TIMEOUT_MS) {
        Ok(out) => out,
        Err(ExecFailure::LinkDown) => return all(CatchUp::LinkDown),
        Err(ExecFailure::Failed(reason)) => return all(CatchUp::Failed { reason }),
    };
    let Some(grid) = parse_listing(&out, subs.len(), DOC_DIRS.len()) else {
        return all(CatchUp::Failed {
            reason: "the listing was incomplete".into(),
        });
    };
    subs.iter_mut()
        .zip(grid)
        .map(|(sub, dirs)| {
            let next = snapshot(&doc_dirs(dirs));
            let outcome = match &sub.last {
                None => CatchUp::Baseline,
                Some(prev) => match diff(&sub.workspace_id, prev, &next) {
                    None => CatchUp::Unchanged,
                    Some(change) => {
                        let paths = change.paths.clone();
                        emit(change);
                        CatchUp::Changed { paths }
                    }
                },
            };
            sub.last = Some(next);
            outcome
        })
        .collect()
}

/// A host's subscriptions and the channel that wakes (or, dropped, stops) its worker.
struct HostState {
    /// Bumped per worker, so a tick that outlived its worker's replacement writes nothing back.
    generation: u64,
    subs: Vec<Sub>,
    /// Catch-ups waiting for their workspace's next tick, by workspace id.
    waiters: HashMap<String, Vec<Sender<CatchUp>>>,
    wake: Sender<()>,
}

#[derive(Default)]
struct Hosts {
    by_host: HashMap<String, HostState>,
    next_generation: u64,
}

/// The managed poller: the subscription registry plus what its workers need.
pub struct RemotePoller {
    hosts: Arc<Mutex<Hosts>>,
    env: Arc<dyn PollEnv>,
    exec: Arc<dyn RemoteExec + Send + Sync>,
    emit: Arc<dyn Fn(FsChange) + Send + Sync>,
    interval: Duration,
    /// Live worker threads (observability; the tests' "the last unsubscribe ends the worker").
    live: Arc<AtomicUsize>,
}

impl RemotePoller {
    pub fn new(
        env: Arc<dyn PollEnv>,
        exec: Arc<dyn RemoteExec + Send + Sync>,
        emit: Arc<dyn Fn(FsChange) + Send + Sync>,
        interval: Duration,
    ) -> Self {
        Self {
            hosts: Arc::default(),
            env,
            exec,
            emit,
            interval,
            live: Arc::default(),
        }
    }

    /// Live worker threads.
    #[cfg(test)]
    pub fn live_workers(&self) -> usize {
        self.live.load(Ordering::SeqCst)
    }

    /// Subscribe `workspace_id`, PAUSED (replacing any earlier subscription of it), starting the
    /// host's worker if it has none. Nothing is polled until a [`Self::catch_up`] activates it.
    /// Never blocks.
    pub fn subscribe(&self, workspace_id: &str, target: ValidTarget) {
        let Ok(mut hosts) = self.hosts.lock() else {
            return;
        };
        remove_sub(&mut hosts, workspace_id);
        self.insert_sub(hosts, workspace_id, target);
    }

    /// Activate `workspace_id` and ask for its next tick's answer: the return to a workspace (centre
    /// stage with Docs fronted, or Docs fronted again). Subscribes it first when it is not (the panel
    /// can front before `remote_poll_start` lands), keeping an existing snapshot. Wakes the worker, so
    /// the tick runs now, not up to an interval later. The receiver yields that workspace's
    /// [`CatchUp`]; it disconnects if the workspace is unsubscribed first. Never blocks.
    pub fn catch_up(&self, workspace_id: &str, target: ValidTarget) -> Receiver<CatchUp> {
        let (tx, rx) = mpsc::channel();
        let Ok(mut hosts) = self.hosts.lock() else {
            return rx;
        };
        let subscribed = hosts.by_host.values().any(|st| {
            st.subs
                .iter()
                .any(|s| s.workspace_id == workspace_id && s.target == target)
        });
        if !subscribed {
            remove_sub(&mut hosts, workspace_id);
            self.insert_sub(hosts, workspace_id, target);
            let Ok(h) = self.hosts.lock() else {
                return rx;
            };
            hosts = h;
        }
        for state in hosts.by_host.values_mut() {
            if let Some(s) = state
                .subs
                .iter_mut()
                .find(|s| s.workspace_id == workspace_id)
            {
                s.active = true;
                state
                    .waiters
                    .entry(workspace_id.to_string())
                    .or_default()
                    .push(tx);
                let _ = state.wake.send(());
                break;
            }
        }
        rx
    }

    /// Pause `workspace_id` (it left centre stage, or its Docs tab was un-fronted): it is left out of
    /// every tick from now on and keeps its snapshot. Absent id = no-op. Never blocks.
    pub fn pause(&self, workspace_id: &str) {
        if let Ok(mut hosts) = self.hosts.lock() {
            for state in hosts.by_host.values_mut() {
                for s in state
                    .subs
                    .iter_mut()
                    .filter(|s| s.workspace_id == workspace_id)
                {
                    s.active = false;
                }
            }
        }
    }

    /// Add a paused sub under the held lock, starting the host's worker (after releasing the lock)
    /// when the host has none.
    fn insert_sub(
        &self,
        mut hosts: std::sync::MutexGuard<'_, Hosts>,
        workspace_id: &str,
        target: ValidTarget,
    ) {
        let host = target.host().to_string();
        let sub = Sub {
            workspace_id: workspace_id.to_string(),
            target,
            last: None,
            active: false,
        };
        if let Some(state) = hosts.by_host.get_mut(&host) {
            state.subs.push(sub);
            return;
        }
        hosts.next_generation += 1;
        let generation = hosts.next_generation;
        let (wake, rx) = mpsc::channel::<()>();
        hosts.by_host.insert(
            host.clone(),
            HostState {
                generation,
                subs: vec![sub],
                waiters: HashMap::new(),
                wake,
            },
        );
        drop(hosts);
        let worker = Worker {
            host,
            generation,
            hosts: Arc::clone(&self.hosts),
            env: Arc::clone(&self.env),
            exec: Arc::clone(&self.exec),
            emit: Arc::clone(&self.emit),
            interval: self.interval,
        };
        self.live.fetch_add(1, Ordering::SeqCst);
        let live = Arc::clone(&self.live);
        let spawned = std::thread::Builder::new()
            .name("claudesk-remote-poll".into())
            .spawn(move || {
                worker.run(rx);
                live.fetch_sub(1, Ordering::SeqCst);
            });
        if let Err(e) = spawned {
            self.live.fetch_sub(1, Ordering::SeqCst);
            eprintln!("[claudesk] remote poller: could not start a worker: {e}");
        }
    }

    /// Unsubscribe `workspace_id`. The host's last subscription leaving stops its worker. Absent id
    /// = no-op. Never blocks.
    pub fn unsubscribe(&self, workspace_id: &str) {
        if let Ok(mut hosts) = self.hosts.lock() {
            remove_sub(&mut hosts, workspace_id);
        }
    }

    /// Drop every subscription (the quit). Every worker exits at its next wake; none is joined.
    pub fn unsubscribe_all(&self) {
        if let Ok(mut hosts) = self.hosts.lock() {
            hosts.by_host.clear();
        }
    }
}

/// Remove `workspace_id` from whichever host holds it, dropping the host (and so its worker's wake
/// sender) when it was the last.
fn remove_sub(hosts: &mut Hosts, workspace_id: &str) {
    let emptied: Vec<String> = hosts
        .by_host
        .iter_mut()
        .filter_map(|(host, state)| {
            state.subs.retain(|s| s.workspace_id != workspace_id);
            state.waiters.remove(workspace_id);
            state.subs.is_empty().then(|| host.clone())
        })
        .collect();
    for host in emptied {
        hosts.by_host.remove(&host);
    }
}

/// One host's worker thread.
struct Worker {
    host: String,
    generation: u64,
    hosts: Arc<Mutex<Hosts>>,
    env: Arc<dyn PollEnv>,
    exec: Arc<dyn RemoteExec + Send + Sync>,
    emit: Arc<dyn Fn(FsChange) + Send + Sync>,
    interval: Duration,
}

impl Worker {
    /// Tick at once, then on every interval or wake, until the host's sender is dropped (its last
    /// subscription left, or the quit). A tick with no active subscription runs no exec.
    fn run(&self, wake: mpsc::Receiver<()>) {
        loop {
            let Some(mut subs) = self.active_subs() else {
                return;
            };
            if !subs.is_empty() {
                let outcomes = poll_tick(&*self.env, &*self.exec, &self.host, &mut subs, &|c| {
                    (self.emit)(c)
                });
                self.write_back(subs, outcomes);
            }
            match wake.recv_timeout(self.interval) {
                Ok(()) => while wake.try_recv().is_ok() {},
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => return,
            }
        }
    }

    /// This worker's ACTIVE subscriptions, copied out (the lock is never held across an exec).
    /// `None` when the host is gone or now belongs to a newer worker.
    fn active_subs(&self) -> Option<Vec<Sub>> {
        let hosts = self.hosts.lock().ok()?;
        let state = hosts.by_host.get(&self.host)?;
        (state.generation == self.generation)
            .then(|| state.subs.iter().filter(|s| s.active).cloned().collect())
    }

    /// Store each still-subscribed workspace's new snapshot and answer its waiting catch-ups with
    /// this tick's outcome. A workspace that left (or re-joined with another target) during the tick
    /// is not touched; a catch-up registered for a workspace this tick did NOT include stays waiting
    /// for the next tick (its wake is already queued).
    fn write_back(&self, ticked: Vec<Sub>, outcomes: Vec<CatchUp>) {
        let Ok(mut hosts) = self.hosts.lock() else {
            return;
        };
        let Some(state) = hosts.by_host.get_mut(&self.host) else {
            return;
        };
        if state.generation != self.generation {
            return;
        }
        for (t, outcome) in ticked.into_iter().zip(outcomes) {
            let Some(s) = state
                .subs
                .iter_mut()
                .find(|s| s.workspace_id == t.workspace_id && s.target == t.target)
            else {
                continue;
            };
            s.last = t.last;
            for tx in state.waiters.remove(&t.workspace_id).unwrap_or_default() {
                let _ = tx.send(outcome.clone());
            }
        }
    }
}

pub mod commands;

#[cfg(test)]
mod tests;
