# Incident: Workspace close hangs the app after a subagent arrow-toggle

**Workflow:** incident
**State:** resolved (terminal)
**Created:** 2026-08-25 11:14
**Severity:** **P1**
**Status:** **Resolved** (2026-08-25)
**Source SURFACE:** `SURFACE-2026-08-24-WORKSPACE-CLOSE-HANGS-AFTER-SUBAGENT-ARROW-TOGGLE` (high)
**Drive mode:** autopilot

## Summary

Closing a workspace **hangs the app**. Operator-reported 2026-08-24 during live dogfooding.

⚠️ **This is a REPRODUCTION of a previously-closed report.** It was first reported after
v0.3.2/v0.3.3 and **closed as could-not-reproduce**. The operator now believes they have the missing
trigger condition — an agent UI **entered and backed out of**, which the obvious repro (actually
starting a subagent) never produces.

**Suspected repro recipe (operator's, verbatim in substance):**

1. In the CC pane, press **← (left arrow)** to begin starting a multi-agent / parallel-agent session.
2. Press **→ (right arrow)** to return to the main agent — **without ever starting the second
   parallel agent.**
3. Let the **main agent finish** its turn.
4. Attempt to **close the workspace** → the app hangs.

⚠️ **The operator's hypothesis is that step 2 is the key condition.** That would explain the original
could-not-reproduce.

⚠️ **The two arrow keys are a Claude Code TUI gesture, not a Claudesk binding.** So the state left
behind may be CC-side, Claudesk-side, or an interaction of the two. Establishing *which* is the first
job of investigation — do not assume Claudesk owns the residue.

## Impact assessment (triage, 2026-08-25)

**Severity: P1** — major feature broken, no non-destructive workaround.

Assessed from the report's own facts rather than by re-asking the operator; each line below is
checkable, and the two that were assumptions are marked as such.

- **User-facing impact:** the app **hangs** on a routine, user-initiated action. ⚠️ **Claudesk is
  single-window by architecture** (N workspaces inside one window — a hard scope rule), so a hang is
  not scoped to the workspace being closed: it takes **every other open workspace with it**, along
  with their live CC sessions. That is the difference between "one feature is broken" and P1.
- **Frequency / reach:** single-user desktop app, so "how many users" is one — but the *gesture* is
  ordinary (open a multi-agent UI, back out, finish the turn, close), and the operator hit it
  **twice across separate reports**, on the **installed** build. Not an exotic path.
- **Workaround: force-quit — and it is DESTRUCTIVE, which is what forecloses P2.** A force-quit
  skips the only route that clears the unclean-exit flag (`markSessionClean(…, "workspace-close")`,
  `App.tsx:486`), so the next open of that project **auto-fires `--continue`**. It also skips the
  SIGHUP-first teardown, so an interactive shell's `~/.zsh_history` save is lost
  (`arch/process-and-pty.md` — SIGHUP over SIGTERM is deliberate for exactly this). So the available
  workaround silently corrupts resumption state and loses terminal history.
- **Not a duplicate — a REPRODUCTION.** Same defect as the v0.3.2/v0.3.3 report that was closed
  could-not-reproduce. ⚠️ This *raises* severity rather than lowering it: the class has already
  survived one close, so a second under-call risks a third escape.
- **Data loss:** no persistent user data is destroyed (no P0), but in-flight CC conversation state
  and shell history are lost on the forced path.

**Why not P0:** no data loss, no security exposure, and the app is recoverable by force-quit.
**Why not P2:** the workaround is destructive (above), and the blast radius is every open workspace,
not the one being closed.

## Initial Observations

What is obviously off, from the report alone:

- **A routine, user-initiated action hangs the whole app** — not a slow close, a hang. Close is
  supposed to be bounded (see the timing facts below), so an unbounded outcome contradicts the
  as-built design rather than merely exceeding a budget.
- **The trigger is a *non-action*** — a UI entered and abandoned. That is the shape of residual
  state, not of work in flight.
- **It survived a close-as-unreproducible**, which means the naive repro does not hit it. The recipe
  is the valuable artifact here and should be exercised before any code reading.
- **Step 3 matters and is easy to overlook:** the main agent is allowed to *finish*. So at close
  time the session is plausibly **idle**, not busy — which cuts against the simplest "close guard
  sees an active state" story (see H1).

## Orientation — what the as-built design says close should do

Read from `workflow-system/product/arch/process-and-pty.md` (§Shutdown / teardown) and the code
paths named below. Recorded here because each fact **bounds** a hypothesis; none of it is a finding.

- **Teardown is bounded to ~800ms worst case.** `PtyCcSession::kill` walks
  `kill_steps(DEFAULT_KILL_TIMING)`: `CleanExitAttempt(500ms)` → `HupGroupThenGrace(300ms)` →
  `KillGroup` (SIGKILL) → `ReapLeader`, short-circuiting the moment the child is reaped
  (`src-tauri/src/cc_session/mod.rs:966`). Every step polls with a deadline.
- **The signal goes to the process GROUP**, precisely so a **subagent** is reaped
  (`killpg(pgid, …)`; the child is a `setsid` group leader, so `pgid == child PID`).
- **`poll_reaped` waits on the LEADER only** (`child.try_wait()`,
  `src-tauri/src/cc_session/mod.rs:744`) — it does not wait on other group members.
- **`kill_all` (app quit) is parallelized and joined**, so N sessions cost ~one window, not N×.
- **The frontend does NOT await the kill.** `XtermPane`'s unmount cleanup fires
  `void invoke("cc_kill", …).catch(…)` (`XtermPane.tsx:619`) — fire-and-forget, error logged.
- **`cc_kill` is a SYNCHRONOUS `#[tauri::command]`** that holds the registry `Mutex` across the
  whole kill sequence (`src-tauri/src/cc_session/commands.rs:168`).
- **The close guard is `isActiveState`**, keying on `running` / `awaiting_input` /
  `background_work` (`src/components/workspace/editor/confirmDialog.ts`, called from
  `App.tsx:514`). Teardown "rides `closeWorkspace` removing the id from the list" — the actual PTY
  kill happens on **XtermPane unmount**, not inside the close handler.

⚠️ **The tension worth carrying into triage:** every documented path here is *bounded*, and the
frontend does not block on the kill. A true hang therefore implies something **outside** this
described design — a lock held by a third party, a thread that never reaches its deadline, or a
frontend block unrelated to the kill. **Do not let the boundedness of the design argue the hang
away**; the operator observed it twice.

## Hypotheses

All unverified. Ordered by how cheaply they can be discriminated, not by likelihood.

- **H1 — The close-confirm guard stalls on a stuck active state.** An abandoned subagent UI leaves
  the workspace reading `running` / `awaiting_input` / `background_work` forever, so the × opens a
  confirm (or the guard mis-evaluates) and the close never proceeds. ⚠️ **Step 3 argues against the
  simple form** (the main agent finished, so a `Stop` should have landed) — but a *missed* terminal
  event is exactly what would leave a stale active state, so the hypothesis survives in its
  event-loss form. **Discriminator:** read the workspace's last `workspace-status` state at close
  time; a confirm dialog is *visible*, so "did a dialog appear?" separates the two arms immediately.
- **H2 — A missed terminal event, same CLASS as the M13.5 WP2 shipped CRITICAL.** That defect hung
  Recycle to a 180s timeout by deriving "a `Stop` arrived" from a **state literal** when the status
  map collapses consecutive events. ⚠️ **A hang with a *timeout-shaped* feel should be checked
  against this class FIRST.** The arrow-toggle plausibly produces an unusual event sequence (e.g. a
  `SubagentStop`-adjacent or `agent_completed`-adjacent event — note M13.5 WP2 found an **unlisted
  `notification_type` falls back to AwaitingInput**, which is wrong for completion-shaped types).
  ⚠️ **Do NOT assume the same ROOT CAUSE** — that one is fixed and regression-tested. This is a
  **shape** match to investigate. Relevant: `[[derived-state-is-not-a-proxy-for-its-event]]`,
  `[[workspace-status-map-collapses-consecutive-events]]`.
  **Discriminator:** is the hang finite (~180s or another timeout) or truly unbounded? Wait it out
  once. A hang that *ends* is a timeout and names its owner.
- **H3 — The abandoned subagent is a process that ignores/outlives SIGHUP and blocks reaping.**
  The group signal is designed to reach subagents, but `poll_reaped` waits on the **leader**. If the
  abandoned agent leaves a child holding the PTY slave open, the leader may not reap within the
  window — and while SIGKILL should still force it, a process wedged in an uninterruptible state
  would not die. **Discriminator:** `pgrep`/`ps` for surviving `claude` processes and their PPIDs
  during the hang; check for zombies and for who holds the pty fd (`lsof`).
- **H4 — Registry-mutex contention, not the kill itself.** `cc_kill` holds the registry `Mutex`
  for up to ~800ms. If another path takes that lock and does not release (a poisoned lock returns
  `CcError::Lock`, but a *held* one blocks), every later session command blocks behind it. A status
  event or a second close arriving in that window could pile up. **Discriminator:** does the UI
  stay responsive (frontend alive, backend blocked) or freeze entirely? Sample the process.
- **H5 — Frontend-side block unrelated to teardown.** The kill is fire-and-forget, so a frozen UI
  points at the webview: a React render loop, or an unresolved promise gating the close. **⚠️ Note
  `[[read-logs-console-captures-nothing]]` — an empty console read for this app is a FALSE GREEN,
  not evidence of no JS error.** Use a self-tested tap.

## Evidence to capture on first reproduction

⚠️ **Capture BEFORE killing the hung app** — the live state is the whole value, and the original
report died for want of it.

1. **Is the UI or the backend blocked?** Does the window redraw / respond to hover at all?
2. **`ps -ef | grep claude`** — are CC processes still alive? Note PIDs, PPIDs, and any `<defunct>`.
3. **Sample the hung process:** `sample <pid> 5 -file /tmp/claudesk-hang.txt` (or Activity Monitor →
   Sample Process) — a native stack says immediately whether a thread sits in `poll_reaped`, a mutex,
   or AppKit.
4. **The workspace's last `workspace-status` state at close time** — `status-channel.log`.
5. **Did a confirm dialog appear?** (Separates H1's two arms in one observation.)
6. **Does the hang END?** If it releases after ~180s or another interval, it is a timeout, and the
   interval names its owner (H2).
7. **Which build?** ⚠️ Installed `.app` vs `pnpm tauri:dev` — the operator's report is from the
   **installed** app; `verify-self-dev-vs-prod-process-name-collision` and the GUI-PATH class both
   make this distinction load-bearing.

## Reproduction Attempt

**Surface chosen:** manual recipe (agent-driven, via the MCP tauri bridge + native keyboard)
**Outcome:** ⚠️ **BLOCKED — NOT "could not reproduce".** The recipe was never actually executed: the
instrument could not deliver a keystroke to the CC pane. **This says nothing about whether the bug
exists.** Do NOT record this as a could-not-reproduce (that is what closed the report the first
time).
**Determinism:** n/a — the trigger gesture was never delivered.
**Artifact:** none. Two instrument failures, both caught by positive controls (below).

### What was set up (all fine)

Dev build launched (`com.claudesk.app.dev`, isolated from the operator's prod app), MCP bridge
connected, `scratch-b` workspace opened, CC v2.1.245 confirmed live at a fresh prompt (PID 83283,
child of the dev binary 82540). Operator's prod app (PID 1456) untouched throughout; teardown was
PID-scoped.

### Why it was blocked — two instrument failures, and how each was caught

⚠️ **Both failures initially looked like "the ← key does nothing", i.e. like a NEGATIVE FINDING.
Both were pure instrument error.** Each was caught only because a positive control was run — which
is the transferable lesson here.

1. **Synthetic `KeyboardEvent` does not reach the PTY.** Dispatching `keydown` on
   `textarea.xterm-helper-textarea` produced no change. **Positive control:** dispatched a plain
   `"X"` the same way → **it never appeared at the prompt**, proving the *channel* was dead, not the
   gesture inert. xterm reads real input/composition events; a synthetic `keydown` is not enough.
   (`webview_keyboard`'s `type` action also failed outright — `window.__MCP__.resolveRef` undefined,
   the known bridge-caveat.)
2. **⚠️ Native keystrokes went to THE WRONG APP.** Switched to `osascript` key codes after
   activating the dev process by PID (title-scoped per
   `[[verify-self-dev-vs-prod-process-name-collision]]`). Still no change. **Positive control:**
   native `keystroke "Z"` → also absent from the prompt. Checking the frontmost process revealed
   **Google Chrome** had reclaimed focus, and re-activating the dev app **did not stick** (Chrome
   took it back within 2s). ⚠️ **So every keystroke — including the `←` and `→` — was being typed
   blind into the operator's Chrome window.** Stopped immediately rather than continuing to fire
   keystrokes at an unknown target.

### ⚠️ What this attempt establishes (and what it does not)

- **Does NOT establish:** anything about the bug. The trigger was never delivered.
- **DOES establish:** ⚠️ **this incident is not agent-reproducible by keyboard injection.** The
  trigger is a **Claude Code TUI keyboard gesture**, and neither available keyboard channel reaches
  the CC pane: synthetic events are ignored by xterm, and native events require reliable OS focus
  that could not be held. This is a **capability limit to record**, not a transient failure to retry
  the same way.
- **Latent hazard worth its own note:** an agent driving `osascript` keystrokes is typing into
  *whatever* holds focus. Without a positive control the keystrokes are unverifiable AND
  potentially destructive to an unrelated app. ⚠️ **Never send a native keystroke without first
  confirming the intended window holds focus, and re-confirming after each activation.**

### Recommended next step — an OPERATOR-driven repro

This needs a human at the keyboard (~2 minutes), because the gesture is a real TUI interaction:

1. Open any project in Claudesk (**the installed `.app`** — the original report is from there).
2. In the CC pane: press **←**, then **→**, without starting the second agent.
3. Give the main agent a trivial prompt and let it **finish**.
4. Click the workspace **×**.
5. ⚠️ **If it hangs, capture BEFORE force-quitting** — the `## Evidence to capture` list below is
   the whole value, and the first report died for want of it. Most valuable single artifact:
   `sample <pid> 5 -file /tmp/claudesk-hang.txt` (a native stack immediately separates
   `poll_reaped` / mutex / AppKit), plus `ps -ef | grep claude` and whether a confirm dialog
   appeared.

⚠️ **Also worth capturing even if it does NOT hang:** what the ← → toggle leaves on screen, and the
workspace's status dot afterwards. A *non*-hang plus a stale dot would still confirm the residual
state H1/H2 predict, and would narrow the recipe rather than closing it.

## ✅ REPRODUCED + ROOT-CAUSED (operator capture, 2026-08-25 11:39:35)

**Artifacts:** `tmp/claudesk-hang-113935/` (gitignored). Healthy baseline for diff:
`/tmp/claudesk-BASELINE-healthy`. App v0.3.4, installed `.app`, macOS 26.6.2.
**Determinism:** 2 of 2 operator attempts hung (plus the 2 original pre-incident reports).

### ⚠️ ROOT CAUSE: the PTY teardown runs its `thread::sleep` polling loop ON THE MAIN THREAD

Complete call chain from `sample`, all on `DispatchQueue_1: com.apple.main-thread`:

```
tauri::ipc::protocol::get::{closure}          737 samples
  → tauri::webview::Webview::on_message       737
    → claudesk_lib::run::{closure}::{closure} 734
      → cc_session::commands::cc_kill         733
        → SessionRegistry::kill               733
          → PtyCcSession::kill                409 + 243 + 80
            → PtyCcSession::poll_reaped       409 + 243 + 80   ← thread::sleep(100ms) loop
```

Plus **654 samples** in `_pthread_mutex_firstfit_lock_wait` → `__psynch_mutexwait` — the **same main
thread** blocked on the registry `Mutex`.

**The mechanism:** `cc_kill` is a **synchronous** `#[tauri::command]`
(`src-tauri/src/cc_session/commands.rs:168` — no `async`), so Tauri dispatches it on the **main
thread**. `PtyCcSession::kill` then walks `kill_steps` with a `poll_reaped` loop that
`thread::sleep(100ms)`s between `try_wait` calls (`mod.rs:744`). **A sleeping teardown therefore owns
the UI thread**, which is why the *entire window* freezes rather than just the closing workspace —
matching the P1 blast-radius assessment for a different reason than assumed.

### ⚠️ THIS OVERTURNS A CLAIM RECORDED ABOVE — do not trust the old line

The `## Orientation` section states *"The frontend does NOT await the kill"* (`XtermPane.tsx:619`
fires `void invoke(...)` fire-and-forget) and concludes a hang must therefore be **outside** the
described design. ⚠️ **That inference was wrong.** The JS side indeed does not await — but the
**Rust command handler** blocks, and it blocks *the thread that draws the UI*. Fire-and-forget on the
caller says nothing about where the callee runs. The design's "~800ms bounded" property is real and
still **not** a safety property: 800ms of main-thread sleep is a frozen UI, and the bound only holds
when the leader reaps promptly.

### Hypothesis disposition

| | Verdict | Evidence |
|---|---|---|
| **H1** close-guard stalls on stale active state | ❌ **DEAD** | no dialog involved; close went straight into teardown |
| **H2** missed terminal event (WP2 CRITICAL class) | ❌ **not the cause** | the hang is a main-thread block, not a timeout waiting on an event |
| **H3** subagent survives/blocks reaping | ❌ **DEAD** | 2nd workspace `GONE (reaped)`, group empty, **0 defunct** |
| **H4** registry-mutex contention | ⚠️ **PARTIALLY RIGHT, understated** | 654 samples in `__psynch_mutexwait` — but the *primary* defect is the sleeping teardown owning the main thread, not contention between paths |
| **H5** frontend-side block | ❌ **DEAD** | main thread is in Rust `poll_reaped`, not JS/React |

### ⚠️ What the arrow-toggle actually contributes (still open, and now narrower)

The teardown is *supposed* to short-circuit the moment the leader reaps. The clean second workspace
proves the fast path works:

```
PID 89390  cwd=/Users/stayman/Tmp/yitang-copy  →  GONE (reaped), group empty
```

So the arrow-toggle's role is **to make the leader slow-or-never to reap**, forcing `kill` to walk
every step (500ms exit-poll + 300ms SIGHUP grace + reap window) — each sleeping on the main thread.
⚠️ **Why an abandoned multi-agent UI delays the leader's exit is NOT yet established** and is the
one open question. Note the affected workspace's group also held **Playwright MCP +
tauri-mcp-server + 2× node + caffeinate** (see baseline) — SIGHUP-ignoring children are a plausible
amplifier, but that is untested.

### Fix direction (for mitigate — NOT applied)

The main-thread block is the defect and is fixable independently of the arrow-toggle trigger:
make `cc_kill` `async` (or move the kill onto a worker via `tauri::async_runtime::spawn_blocking` /
a dedicated thread), so `poll_reaped`'s sleeps never occupy the UI thread. ⚠️ **That converts every
close — including the pathological one — from "frozen app" to "workspace closes when the PTY dies",
without changing the kill policy at all.** Whatever the arrow-toggle does to CC's exit then becomes
a latency question, not a hang.

⚠️ **Note `kill_all` (app-quit) is already threaded + joined** — so the *quit* path was protected and
the *single-close* path was not. The asymmetry is the tell, and it is why quit never showed this.

## Investigation — 2026-08-25 11:45

Read-only throughout. No system state changed.

### Observed Facts (each provable from `tmp/claudesk-hang-113935/`)

1. **The sleeping teardown runs on the main thread.** ⚠️ Not an inference — the `sample` call graph
   places the whole chain literally under `DispatchQueue_1: com.apple.main-thread`:
   `tauri::ipc::protocol::get` → `Webview::on_message` → `run::{closure}` → `cc_kill` →
   `SessionRegistry::kill` → `PtyCcSession::kill` → `poll_reaped`.
2. **All THREE kill steps ran, and the last two overran their budgets.** The three distinct return
   offsets in `PtyCcSession::kill` map to its three `poll_reaped` call sites. At 5s/3748 samples
   ≈ **1.33ms per sample**:

   | Step | `kill+off` | Samples | ≈ elapsed | Design budget |
   |---|---|---|---|---|
   | `CleanExitAttempt` | +360 | 80 | **~107ms** | 500ms (exited early ✓) |
   | `HupGroupThenGrace` | +668 | 243 | **~324ms** | 300ms (**overran**) |
   | `ReapLeader` | +920 | 409 | **~546ms** | 300ms (**overran ~1.8×**) |

   ⚠️ **`CleanExitAttempt` returning in ~107ms of a 500ms budget did NOT mean success** — it fell
   through to the signals, so the `/exit` write did not reap the leader. And `ReapLeader` burning
   **546ms** means the leader was *still* not reaped after `SIGKILL` to the group. **~977ms of
   main-thread sleep in this one window**, with the process still not torn down.
3. **A SECOND main-thread blocker exists, and it is a distinct defect.** 654 samples (~870ms) sit in
   `__psynch_mutexwait` on a *different* chain — also main thread:
   `workspace_deregister` → `tray::commands::reconcile` → `std::sync::Mutex::lock`.
   `reconcile` (`tray/commands.rs:221`) takes `state.states` then `state.applied`.
   ⚠️ **So the close does main-thread lock-waiting in `workspace_deregister` ON TOP OF the
   main-thread sleeping in `cc_kill`.** The two together are the freeze.
4. **Nothing leaked.** The other workspace (`89390`, `~/Tmp/yitang-copy`) was `GONE (reaped)`, its
   group empty, and **0 defunct** process-wide. The teardown is *correct*; it is merely on the wrong
   thread.
5. **The codebase already knows sync commands are main-thread.**
   `status_broadcaster/commands.rs:211` comments *"This command body runs on the main thread, so the
   AppKit hide inside is safe."* ⚠️ **The same fact that makes an AppKit call safe there makes a
   `thread::sleep` loop catastrophic in `cc_kill`** — one property, two opposite consequences, and
   only the benign one was written down.
6. **All 8 `cc_session` commands are synchronous.** Only `cc_kill` sleeps, so it is the only one that
   freezes — but the pattern is repo-wide, not a one-off slip.

### Hypotheses

- **Main-thread block via sync `#[tauri::command]`** — ✅ **CONFIRMED** (fact 1, 2).
- **Registry/tray mutex contention on the close path** — ✅ **CONFIRMED as a second, independent
  contributor** (fact 3). Was filed as H4 and *understated*: it is not contention *with* the kill,
  it is a separate main-thread stall in `workspace_deregister`.
- **H1 stale-active-state guard** — ❌ **REJECTED** (no dialog; close entered teardown directly).
- **H2 missed-terminal-event (M13.5 WP2 class)** — ❌ **REJECTED as the cause.** The hang is a
  main-thread block, not a timeout awaiting an event. ⚠️ Worth noting the shape-match reasoning was
  reasonable and still wrong — the discriminator that settled it was the native stack, not more
  code reading.
- **H3 subagent survives / blocks reaping** — ❌ **REJECTED** (fact 4).
- **H5 frontend-side block** — ❌ **REJECTED** (fact 1 — the blocked thread is in Rust).
- **⚠️ OPEN: why the arrow-toggle makes the leader unreapable.** Facts 2's overruns prove the leader
  resisted `/exit` AND survived `killpg(SIGKILL)` past a 546ms reap window. **Not established.**
  Candidate: the affected workspace's group held **Playwright MCP + tauri-mcp-server + 2× node +
  caffeinate** (healthy baseline, `/tmp/claudesk-BASELINE-healthy`); a child holding the PTY slave
  open can keep the leader from being reaped even after SIGKILL. ⚠️ **Untested — and deliberately
  NOT required for the fix** (see below).

### Root Cause

**Claudesk runs a blocking, sleeping process-teardown on the UI thread.** `cc_kill` is a synchronous
`#[tauri::command]` (`cc_session/commands.rs:168`), which Tauri dispatches on the main thread;
`PtyCcSession::kill` → `poll_reaped` (`cc_session/mod.rs:744`) then `thread::sleep(100ms)`s in a loop
between `try_wait` calls. A close that cannot reap its leader promptly therefore freezes the entire
single-window app. `workspace_deregister`'s main-thread `Mutex::lock` into `tray::reconcile` adds a
second stall on the same path.

⚠️ **The arrow-toggle is the TRIGGER, not the cause.** It makes the leader slow-or-never to reap;
the *defect* is that a slow reap freezes the UI at all. This is why the original report could not be
reproduced: without a slow-reaping session the same code path completes in ~100ms and looks fine.

### Resolution Plan (for `/incident-mitigate` — NOT APPLIED HERE)

1. **Get the teardown off the main thread** (fixes the hang class, independent of the trigger).
   Make `cc_kill` `async` or move the kill body onto a worker (`tauri::async_runtime::spawn_blocking`
   or a dedicated thread), so `poll_reaped`'s sleeps never occupy the UI thread. ⚠️ **Precedent
   already in-tree: `kill_all` (app-quit) is ALREADY threaded + joined** (`mod.rs:1252`) precisely to
   avoid serial grace windows — so the quit path was protected and the single-close path was not.
   **That asymmetry is the tell, and it is why app-quit never showed this bug.**
2. **Bound `ReapLeader` honestly.** It overran ~1.8× its window while the leader still refused to
   die. Post-SIGKILL an unreapable leader should be *detached and logged*, not waited on — the
   `cc-exit` event should not gate the UI.
3. **Take `workspace_deregister`'s tray reconcile off the blocking path** (fact 3) — a separate
   ~870ms main-thread stall that survives fix #1.
4. **Then, and only then, investigate the trigger** (the open question). With #1 in place a
   pathological close degrades to "the workspace disappears, the PTY dies a beat later" instead of a
   frozen app — turning a P1 hang into a latency curiosity.

⚠️ **Do NOT make the fix conditional on understanding the arrow-toggle.** The hang is a threading
defect that any slow-reaping session can trigger; the toggle is one way in, and there will be others
(a wedged MCP child, a network-blocked tool call, an NFS-stalled cwd).

## Mitigation — 2026-08-25 11:56  (Status: Monitoring)

### Changes applied (3 files, all in `src-tauri/`)

⚠️ **Cleanly separable from the uncommitted M13.5 WP3 work** — verified before touching anything:
`cc_session/` is untouched by WP3, and WP3's only edit to `status_broadcaster/commands.rs` is
test-only (inside `mod tests`). No overlap with any file changed here.

**1. `cc_session/commands.rs` — `cc_kill` moves the teardown off the main thread.** Take the session
out of the registry under a short lock (O(1), still fails fast on an unknown id — the commit point
is unchanged), then run `session.kill()` on a `std::thread::spawn` worker. `CcSession: Send`, the
same ownership move `kill_all` already makes. **Detached, deliberately not joined** — joining would
re-block the main thread and reintroduce the freeze. Failure is logged to `eprintln!` rather than
dropped (an unreapable child must not be invisible).

**2. `cc_session/mod.rs` — `SessionRegistry::kill` DELETED; `take()` added.** `kill()`'s only caller
was `cc_kill`. ⚠️ It was **removed rather than kept-with-a-warning**: a one-line convenience that
hides a multi-hundred-ms sleep is precisely how this defect was written, and a `#[warn(dead_code)]`
would have failed the `-D warnings` gate anyway. `take()` removes + hands back ownership and does
NOT kill, so the caller owns the where-to-run decision. A prominent comment at the old site says
do not re-add it.

**3. `tray/commands.rs` — `reconcile` no longer holds `state.icon` across the AppKit marshal.**
⚠️ **THIS IS A SECOND, INDEPENDENT DEADLOCK and the investigation's record of it was too shallow.**
The 654 main-thread `__psynch_mutexwait` samples were **not** ordinary contention — they were half of
a genuine lock-ordering cycle:

| Thread | Holds | Waits for |
|---|---|---|
| `claudesk-status-broadcaster` | **`state.icon`** | the **main thread** (`set_icon_with_as_template` → `Thread::park` → `semaphore_wait`, **1362 samples ≈ 1.8s**) |
| main thread | — | **`state.icon`** (`workspace_deregister` → `forget_workspace` → `reconcile`) |

Fixed by cloning the cheap `TrayIcon` handle out and dropping the guard **before** the marshal.
⚠️ Fix #1 alone would have masked this (the main thread stops sleeping, so the window shrinks) — the
ordering flaw itself is now gone, not merely made unlikely.

### ⚠️ Resolution-plan step 2 was WITHDRAWN — it rested on my own misreading

The plan called for "bounding `ReapLeader` honestly" because it appeared to overrun ~1.8×. **On
reading the code, it is already bounded** (`poll_reaped(DEFAULT_KILL_TIMING.hup_grace)`, 300ms) **and
its result is already discarded** (`let _ =`), so an unreapable leader is tolerated, not awaited.
The apparent overrun is `poll_reaped` sleeping in 100ms chunks (so it can overshoot a 300ms deadline
by up to one sleep) plus sample attribution across the step. **No change made** — changing working
code on a misread measurement would have been the worse error.

### Verification — the SAME instrument that caught the bug

Live dev build, `scratch-c` workspace, real × click, `sample` armed across the close:

| Signature | Before (hang) | After (fix) |
|---|---|---|
| `poll_reaped` / `nanosleep` | **`com.apple.main-thread`** — 409 + 243 + 80 samples | **`Thread_401449`** (worker) — 251 samples |
| main-thread `__psynch_mutexwait` | **654 samples (~870ms)** | **1 sample** (noise) |
| CC child | leader unreaped, app frozen | **reaped ✓**, close completed |

⚠️ **The `nanosleep` is still present — that is correct, not a partial fix.** The kill policy is
unchanged by design; only the *thread it runs on* changed. Evidence: `tmp/fix-verify-2026-08-25/`.

**Gate:** `pnpm verify:auto` **exit 0** — Rust **877** (one test replaced by one test, count
unchanged), frontend **2184** unchanged.

### Regression risk

- **The close no longer waits for the reap.** Nothing downstream did: the pane teardown is
  unmount-driven and `cc-exit-<id>` still fires from the reader thread hitting EOF. Telemetry
  (`record_workspace_close`) now records on **removal** rather than reap — deliberate, and the
  session is gone from the registry either way.
- **Detached thread on app-quit:** a worker mid-teardown at quit is harmless — `kill_all` reaps the
  remaining sessions on its own (already-threaded) path, and the OS reaps the group at exit.
- **⚠️ NOT covered by a regression test yet** — a main-thread-blocking property is not expressible in
  the current unit suite. `/incident-codify` owns this; see the note it will need below.

### ⚠️ Still open (NOT fix-blocking, carried to resolve)

**Why the arrow-toggle makes the CC leader slow to reap.** Untested. The fix is deliberately
independent of it: any slow-reaping session triggered the old hang (a wedged MCP child, a
network-blocked tool call, an NFS-stalled cwd), so the threading defect was the thing worth fixing.
With it fixed, a pathological close degrades to "the workspace disappears, the PTY dies a beat
later" instead of a frozen app.

## Codify — 2026-08-25 12:04

**Path:** **B** (new coverage from scratch). ⚠️ The `## Reproduction Attempt` artifact was a
**manual `sample`-based capture**, not a test, so it cannot serve as CI coverage — it is recorded as
supporting evidence only (`tmp/claudesk-hang-113935/`).

**Integration boundary:** ⚠️ **Yes — and it is deliberately NOT covered by an end-to-end test.** The
consuming surface is the `cc_kill` Tauri command reached from `XtermPane`'s unmount. The incident's
defining property — *which thread the work runs on* — is not observable from `cargo test` (there is
no main thread, and Tauri's dispatch is out of scope) and a deadlock **hangs** rather than fails, so
a test asserting it cannot exist. The consuming-surface behaviour was instead verified **live** with
the same `sample` instrument that caught the bug (see § Mitigation → Verification:
`poll_reaped` moved off `com.apple.main-thread` to `Thread_401449`; main-thread `mutexwait`
654 → 1 sample). The two tests below cover the *structural* properties whose violation reintroduces
the bug.

### Test 1 — `cc_session::tests::take_does_not_pay_the_teardown_cost_so_a_slow_kill_cannot_block_the_caller`

`src-tauri/src/cc_session/mod.rs`. Uses the existing `reg_with_delayed_fakes` harness (an 800ms fake
teardown — the real worst case) and asserts `take()` is O(1), does not kill, and that the taken
session still tears down for its new owner. Modelled on the in-tree precedent
`kill_all_runs_grace_windows_in_parallel_not_serially`, including its two-sided timing shape.

⚠️ **What it proves and what it does not** — stated in the test itself so a later reader does not
over-trust it: it cannot assert "the main thread is not blocked"; it proves *removal does not pay the
teardown's cost*, which is the property the fix rests on and whose absence caused the incident.

**Mutation-proven twice, INDIVIDUALLY** (per `docs/lessons/source-text-guards.md` — a composite
probe hides gaps):
- Mutant A — `take` kills inline (`let _ = s.kill();`) → **FAILS** on the kill-count assertion.
- Mutant B — `take` sleeps 800ms **without** touching the counter → **FAILS** on the *timing*
  assertion (`took 805.103708ms`). ⚠️ Run separately on purpose: mutant A alone would have left the
  timing assertion unproven, and it is the one that catches a subtler regression.

### Test 2 — `tray::commands::tests::reconcile_does_not_hold_the_icon_lock_across_the_appkit_marshal`

`src-tauri/src/tray/commands.rs`. A **source guard**, because `reconcile` needs a live `TrayIcon`
(AppKit + AppHandle) — this module's own header already records the runtime path as verify-self
territory — and because a lock-ordering deadlock cannot be asserted by a passing test. Asserts the
icon handle is cloned out and the guard released **before** `set_icon_with_as_template`, that the
clone precedes the marshal, and that no `.lock()` is re-acquired between them.

⚠️ Uses the shared `workflow_install::source_guard::production_code` helper, which **strips
comments** — mandatory here: both the fix site and the test's own prose mention
`state.icon.lock()`, and a naive substring scan would be satisfied by its own explanation (the
`?raw`-guard trap).

**Mutation-proven** on the exact shipped violation (restore `let icon = state.icon.lock()…;` with
`set_icon` inside that scope) → **FAILS** with the intended diagnostic. ⚠️ **Re-proven AFTER
`cargo fmt` reflowed the file** — a formatter reflow has broken a source-text guard in this repo
before, so the mutation was re-run against the formatted text rather than assumed to still hold.

### Test-suite result

**`pnpm verify:auto` exit 0** — Rust **879** (877 + 2 new), frontend **2184** unchanged, 168 files.

**One triaged failure on the first run**, resolved without touching test logic:
- **`cargo fmt --check`** flagged my hand-wrapped lines in both new tests.
  **Classification: obsolete/mechanical, high confidence** — one plausible explanation (line
  wrapping), no test asserted anything different, every test passed. Per §5b this is the auto-fix
  case: ran `cargo fmt`, re-ran the gate green, then re-proved guard 2 still bites (above).
  ⚠️ **Not** a mitigation regression and **not** a root-cause misdiagnosis — no back-loop warranted.

### ⚠️ Coverage gap left OPEN on purpose (not deferred debt)

Neither test would catch a **new** blocking call added to a *different* synchronous
`#[tauri::command]`. The repo has 8 sync commands in `cc_session/commands.rs` alone, and the
main-thread-dispatch property is repo-wide. A general guard ("no sync command may sleep or take a
lock across a marshal") is a real coverage idea but is **broader than this incident** — §3's
speed-aware rule says log it, not build it now. Logged as
`SURFACE-2026-08-25-SYNC-TAURI-COMMANDS-MAY-BLOCK-THE-MAIN-THREAD`.

## Resolution — 2026-08-25 12:10

**Outcome:** the hang mechanism is eliminated and covered by two mutation-proven regression tests.

### ⚠️ WHAT WAS VERIFIED, AND WHAT WAS NOT — read this before trusting the close

- ✅ **Verified:** the *mechanism* is gone. Live dev build, real × click, `sample` across the close:
  the teardown moved off `com.apple.main-thread` to a worker (`Thread_401449`), main-thread
  `__psynch_mutexwait` fell **654 → 1** sample, and the CC child was **reaped**. Evidence:
  `tmp/fix-verify-2026-08-25/`.
- ⚠️ **NOT verified: the operator's original recipe against the fixed build.** The arrow-toggle is a
  Claude Code **TUI keyboard gesture**, and the agent could not deliver a keystroke to the CC pane
  (see `## Reproduction Attempt` — two instrument failures, both caught by positive controls). So
  the close rests on *"the mechanism that produced the hang no longer exists"*, **not** on
  *"the repro was re-run and did not hang."*
- **Why that is acceptable here:** the defect was a threading fault reachable by **any** slow-reaping
  session — the toggle was one entry point, not the cause. The fix removes the blocking from the UI
  thread regardless of *why* a leader is slow. ⚠️ **If a close ever hangs again, do NOT assume this
  incident regressed** — re-`sample` first: the signature to look for is `poll_reaped` back on
  `com.apple.main-thread`, which the two regression tests now make hard to reintroduce silently.

### Data correction

None needed — no persistent data was corrupted. ⚠️ **But note the incident's own cost:** each
force-quit skipped `markSessionClean(…, "workspace-close")`, so affected projects may carry a **set
unclean-exit flag** and will auto-fire `--continue` on their next open. That is expected behaviour
given a force-quit, self-corrects on the next clean close, and needs no repair — recorded so a later
reader does not mistake it for a second defect.

### ⚠️ Note on the delete-on-resolve paper trail

`SURFACE-2026-08-24-WORKSPACE-CLOSE-HANGS-AFTER-SUBAGENT-ARROW-TOGGLE` was **never committed** — it
was filed into `backlog.md` during the still-uncommitted M13.5 WP3 session and lived only in the
working tree. So its removal at this resolve shows in `git diff` as **no deletion at all**, and a
future `git log -S'SURFACE-2026-08-24-WORKSPACE-CLOSE-HANGS'` will find the CHANGELOG line but no
corresponding backlog entry ever added or removed. ⚠️ **This is not a broken invariant** — the
CHANGELOG record (written first, as required) *is* the durable paper trail, which is exactly what
delete-on-resolve exists to guarantee. Recorded because the missing diff would otherwise look like a
skipped step to anyone auditing the commit.

### Follow-up work surfaced

- `SURFACE-2026-08-25-SYNC-TAURI-COMMANDS-MAY-BLOCK-THE-MAIN-THREAD` (**medium-high**, filed at
  codify) — the class this incident belongs to. **8 sync commands in `cc_session/commands.rs` alone**
  and nothing enforces the property; the two new tests pin only the two sites that broke.
- ⚠️ **Open, deliberately not blocking:** why the arrow-toggle makes the CC leader resist `/exit`
  **and survive `killpg(SIGKILL)`** past a 546ms reap window. Candidate (untested): a group child
  holding the PTY slave open — the affected workspace's group held Playwright MCP,
  tauri-mcp-server, 2× node and `caffeinate`. **Not re-filed as its own SURFACE**: with the hang
  fixed it is a latency curiosity, and the covering class item above is the one worth acting on.

## Timeline

- 2026-08-24 — Incident originally reported by operator after v0.3.2/v0.3.3; **closed as
  could-not-reproduce** (no recipe).
- 2026-08-24 — Operator **reproduces** it during live dogfooding and identifies the suspected
  missing trigger (the ← → toggle without starting the second agent). Filed as
  `SURFACE-2026-08-24-WORKSPACE-CLOSE-HANGS-AFTER-SUBAGENT-ARROW-TOGGLE` (high), deliberately not
  started so M13.5 WP3 in flight was not interrupted.
- 2026-08-25 11:14 — Incident report filed (this file), operator-directed to be picked up
  immediately after WP3 closed. No investigation performed.
- 2026-08-25 12:10 — **RESOLVED.** Mechanism verified eliminated; original TUI recipe NOT re-run
  (agent cannot drive the gesture) — the distinction is recorded in § Resolution rather than blurred.
  Backlog lead item resolved and deleted; one class-level SURFACE carries the remaining debt.
- 2026-08-25 12:04 — **CODIFIED** (Path B). Two regression tests added, each mutation-proven
  individually (the timing assertion proven separately from the kill-count one; the source guard
  re-proven after a `cargo fmt` reflow). Gate exit 0, Rust 877 → **879**. One `cargo fmt --check`
  failure triaged as mechanical and auto-fixed. Adjacent repo-wide gap logged as a SURFACE rather
  than built.
- 2026-08-25 11:56 — **MITIGATED + VERIFIED** (Status: Monitoring). 3 changes: `cc_kill` teardown
  to a worker thread; `SessionRegistry::kill` deleted in favour of `take()`; `tray::reconcile` no
  longer holds `state.icon` across the AppKit marshal (a second, genuine lock-ordering deadlock the
  investigation under-recorded). Plan step 2 withdrawn as based on a misreading. Verified with the
  same `sample` instrument: teardown now on a worker, main-thread mutexwait 654 → 1 sample.
- 2026-08-25 11:45 — **Investigated.** Root cause CONFIRMED (sync command → main-thread sleep) +
  a SECOND main-thread stall found in `workspace_deregister` → `tray::reconcile` (654 samples).
  Step-level timing shows `ReapLeader` overran ~1.8× with the leader still unreaped. Resolution plan
  written; nothing applied. Trigger mechanism remains open and is explicitly not fix-blocking.
- 2026-08-25 11:39 — ✅ **REPRODUCED by operator** (2/2 attempts). `sample` caught `cc_kill` →
  `poll_reaped` on the **main thread** + 654 samples in `__psynch_mutexwait`. Root cause: a
  synchronous `#[tauri::command]` runs the sleeping PTY teardown on the UI thread. H1/H3/H5 dead,
  H4 partially right. Artifacts: `tmp/claudesk-hang-113935/`.
- 2026-08-25 — Agent reproduction attempt **BLOCKED** (not could-not-reproduce): no keyboard channel
  reaches the CC pane; two instrument failures, each caught by a positive control. Recorded as a
  capability limit. Needs an operator-driven repro.
- 2026-08-25 — **Triaged P1** (blast radius = every open workspace in the single window; the only
  workaround is destructive). Routed to **I13 reproduce**, not I3: the operator supplied a
  deterministic local recipe, and this class already escaped once for want of a captured repro.

## Discoveries

<!-- Format: [SURFACED-<date>] <target node> — <summary> -->

- [SURFACED-2026-08-25] triage — ⚠️ **The repro recipe is the scarce asset.** This class already
  escaped one close-as-unreproducible. If the recipe does not reproduce on the first attempt, resist
  re-closing it: vary the *build* (installed vs dev) and whether the main agent fully finished
  before treating it as unreproducible.
