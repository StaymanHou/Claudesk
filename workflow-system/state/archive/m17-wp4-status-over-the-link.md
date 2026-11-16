---
drive_mode: autopilot
---

# Feature: M17 WP4 — status over the link (hook install, origin, drive mode, link overlay)

**Workflow:** feature
**State:** Completed 2026-11-16 (finalize)
**Created:** 2026-11-16
**Entry:** spec (complex feature)
**Sources:** `workflow-system/product/wbs.md` → WP4 (4.1–4.6); `arch/remote-workspaces.md` §B, §D, §E;
WP3 handoff carry-ins (the two link-lifecycle MAJORs; keys dropped while Reconnecting).

## Problem Statement

A remote workspace (WP3) opens a live CC pane on the mini, but its status dot never moves: the
remote CC has no Claudesk hook registered, so no event reaches the forwarded socket. Even once
events flow, the local `WorkspaceRegistry` resolves by `cwd` alone. A remote cwd such as
`/Users/<user>/proj` could then light a LOCAL tile at the same path, or the reverse, and every CC
session on the shared host would feed the local time analytics. While the link is down, the tile
keeps showing its last state as if it were live. And the keys the operator types during
Reconnecting are dropped with nothing on screen to say so.

WP4 makes the remote workspace's status **first-class and honest** (prior
`a-workspace-is-its-cc-session`: status on every surface is the irreducible core):
- live on the filmstrip, PiP and tray;
- never confused with a local workspace;
- excluded from time analytics;
- carrying the drive mode;
- visibly "not connected" while the link is down.

Problem statement unchanged (P4 F9b re-entry, 2026-11-16): the overlay's purpose is the same. Only the definition of "attached" was wrong: a re-attach attempt that dies at once is not an attach, so it must not clear the overlay (P4.verify-self.F1).

## User Stories

- As the operator, I want a remote workspace's dot to go orange / blue / grey / purple exactly as a
  local one does, so I can watch a remote session from the filmstrip, PiP and tray without opening it.
- As the operator, I want a remote session's events never to land on a local tile (and the reverse),
  so a dot is never lying about which session needs me.
- As the operator, I want a remote tile to show that its link is down (last colour dimmed, plus a link
  glyph) rather than a confident stale colour, so I know the dot can't be trusted right now.
- As the operator, I want the pane to tell me while it is reconnecting that my keystrokes are not being
  sent, so I don't type a reply into nothing.
- As the operator, I want the remote CC to receive my drive mode the same way a local one does, so the
  workflow skills behave the same wherever the session runs.
- As the operator, I want my remote `~/.claude/settings.json` left intact apart from Claudesk's own
  hook entries. In particular, my yolo acceptance (`skipDangerousModePermissionPrompt`) and `theme`
  must survive.

## Acceptance Criteria

### AC-0 — link lifecycle fixes (carry-in from the WP3 review; Phase 1)
- **AC-0.1** `remote_open_check` takes a temporary hold for its own duration. A check that ends
  without an open leaves no link running: there is no `ssh -M` for that host afterwards, whether
  the outcome was FolderMissing, Unreachable or OK-but-never-opened.
  - `remote_link_ensure` is removed, or gets the same hold. Today the frontend does not use it.
  - Closes `SURFACE-2026-11-16-QUALITY-M17WP3-OPEN-CHECK-LEAKS-AN-UNHELD-LINK`.
- **AC-0.2** A single `ensure_and_hold` starts the link if absent and takes the hold in one step,
  under one `links` lock. `cc_spawn_remote` uses it. A test interleaves a close of the host's last
  other session between the old two steps and shows that the new session's hold counts on the link
  it uses.
  - Closes `SURFACE-2026-11-16-QUALITY-M17WP3-ENSURE-THEN-HOLD-IS-NOT-ATOMIC`.

### AC-1 — hook deploy + registration on the remote (WBS 4.1)
- **AC-1.1** On every link connect (the pre-connect step, so it self-heals like the local
  install-on-launch), the bundled hook script is deployed to `<remote home>/.claudesk/<identifier>/`
  under a **remote-specific basename**, distinct for dev and prod (see Technical Constraints → TC-2).
  It is written through the same quoted-heredoc + temp-and-rename discipline as `tmux.conf` /
  `cc-launch`.
- **AC-1.2** Claudesk's hook is registered for all 10 `CLAUDESK_EVENTS` in the remote
  `~/.claude/settings.json`:
  - The file is fetched over the master, merged **locally** with the existing
    `hook_install::merge_claudesk_hooks`, and written back atomically (temp + `mv`) **only when the
    merge changed something**.
  - An absent file is created holding just the hooks block.
  - A malformed file is **never overwritten**. The failure is reported to the operator in plain words
    (`couldn't register the Claudesk hook on <host>: …`), and the link still comes up. Status simply
    stays dark.
- **AC-1.3** **Every key Claudesk didn't write is preserved.** A fixture test runs the remote
  install path on a fixture holding `theme`, `skipDangerousModePermissionPrompt: true` and a foreign
  hook group. Every key and the foreign group must survive byte-for-byte as JSON values.
  - **Provenance:** a group whose script basename is not exactly Claudesk's remote basename is never
    modified or removed. This includes a *local* Claudesk installed on that host (`claudesk-hook.pl`).
- **AC-1.4** The registered command is
  `CLAUDESK_HOOK_SOCK=<remote>/hook.sock CLAUDESK_ORIGIN=<origin> /usr/bin/perl <script>`, built
  through `remote_cmd::quote` / the existing `sh_quote` (no variable value outside quoting). Re-running
  the merge with the same command is a no-op write-skip; a test pins this.
- **AC-1.5 (live)** On the mini, after opening a remote workspace, a prompt in the remote CC turns
  that tile orange, and its `Stop` turns it grey. An `AskUserQuestion` turns it blue, and the answer
  turns it back to orange. All three surfaces agree: filmstrip, PiP and the tray alarm.

### AC-2 — the `origin` field (WBS 4.2)
- **AC-2.1** The hook script emits `"origin": "<value>"` on the socket line **only** when
  `CLAUDESK_ORIGIN` is set and non-empty. `tests/hook_pl_output.rs` keeps every existing local case
  **byte-identical** (no `origin` key) and gains a remote case asserting the field.
- **AC-2.2** A remote invocation (origin set) with no live forward does **not** append the
  `HOOK write-failed` trace to the remote log. The remote host is machine-global and usually
  disconnected, so that log would grow without bound with lines no local diagnosis ever reads.
  Locally the trace is unchanged. Exit 0 and empty-or-one-object stdout still hold on every path:
  `never_blocks_cc_on_degraded_inputs` gains origin-set cases.
- **AC-2.3** `HookEvent` gains `origin: Option<String>`. Empty is treated as absent, the same rule
  as `session_id`.

### AC-3 — `WorkspaceRegistry` resolves on (origin, cwd) (WBS 4.3)
- **AC-3.1** An event with **no origin** resolves only among **local** workspaces. An event **with**
  an origin resolves only among remote workspaces on the host whose origin matches. Within that set,
  matching is the existing longest-path-ancestor match against the remote path.
- **AC-3.2** Tests, each mutation-proven:
  - (a) a remote event whose cwd equals a registered **local** workspace's path does not light the
    local tile;
  - (b) a local event whose cwd equals a remote workspace's path does not light the remote tile;
  - (c) an origin-tagged event from a CC session Claudesk didn't start on that host (cwd outside
    every remote workspace on it) is dropped;
  - (d) an event from host A never lights host B's workspace at the same path.
- **AC-3.3** A remote workspace whose stored path reaches the folder through a symlink still
  resolves. At open, the remote **realpath** of the row's path is resolved over the master and
  registered alongside it; if it can't be resolved, the stored path is used. The cwd CC reports is
  physical.
- **AC-3.4** A remote key never goes through local canonicalization (the existing
  `canonical_key` pass-through holds); a test pins the registry's remote path.

### AC-4 — `time_store` refuses origin-tagged events (WBS 4.4)
- **AC-4.1** The `time_store` drain refuses any event carrying an origin, **at ingestion**, before
  any write, with a test that fails if the filter is deleted. Local events are recorded exactly as
  before, so time analytics stays machine-global for the local machine only.

### AC-5 — drive mode over the link (WBS 4.5)
- **AC-5.1** (Already built in WP3: `remote_terminal_argv` carries `CLAUDESK_DRIVE_MODE` through
  `quote`; the four closed values come from the `DriveMode` enum.) WP4 adds the live proof. With the
  gate ON and a mode set, the remote CC's context shows
  `Claudesk reports the drive mode for this workspace as <mode>.` on a `UserPromptSubmit`. With the
  gate OFF, or no mode, nothing is shown.
- **AC-5.2** The remote workspace's drive-mode readout behaves exactly as a local one:
  - Across a WP3 link-drop reconnect, `cc_drive_mode` still returns the spawn-time mode, and a test
    pins that a reattach doesn't change it.
  - If the operator changes the row's mode while the session runs, the header readout marks itself
    stale, the same as locally.
  - The stale readout's apply-now (turn-level respawn with `--continue`) respawns **on the remote**
    and never spawns a local CC. Verified live.

### AC-6 — the link overlay (WBS 4.6)
- **AC-6.1** While a remote workspace's terminal is **not attached**, its status DTO carries a
  **link overlay**. That covers two cases: its host link is `Lost`, or its re-attach is pending.
  - Like `attention`, the overlay is a display field, not a fifth state. It is set and cleared by
    the backend and fanned out on the one `workspace-status` stream, so the filmstrip, PiP and tray
    agree.
  - `state` is unchanged, and the close/quit and respawn guards keep reading `state`. A test asserts
    each guard's input is unchanged by the overlay.
- **AC-6.2** The filmstrip tile and PiP row show the **last state's hue, dimmed**, plus a
  **broken-link glyph**, with a tooltip in plain words (`Not connected to <host>: reconnecting`).
  The tray alarm folds the **underlying** state, so a remote session last seen awaiting input keeps
  the alarm lit. It still needs the operator, who has to reconnect to answer it.
- **AC-6.3** Once the session is re-attached, the overlay clears and the workspace reads **Unknown**
  (the existing grey "Unknown" presentation) until its next hook event. Events missed while the
  link was down are not replayed or guessed.
- **AC-6.4** A **Detached** overlay arm exists in the type but no WP4 path sets it; WP5's Detach
  (5.3) is its producer. The OFF-invariant pin stays at 6 arms / 10 subjects. The link overlay is
  not a workflow-gated surface: it shows with the gate OFF too, because remote status is core.

### AC-7 — say that typed keys are not sent while Reconnecting (carry-in from WP3 Phase 5)
- **AC-7.1** While a remote pane is reconnecting, the pane shows a persistent, non-modal strip:
  `Not connected to <host>. Keys you type are not sent; reconnecting…`. It goes away on re-attach.
  - The existing one-line dim notice per drop is unchanged.
  - Keys stay dropped: buffering and replaying them later could submit a stale reply into a CC
    that has moved on.
  - ⚠️ The strip is Claudesk's own DOM. It is never written into the PTY stream and never parsed
    back.

## Out of Scope

- **Removing the remote hook registration**: on row removal, on gate changes, or as an uninstall
  command. A registered remote hook with no live forward is inert, and AC-2.2 keeps it silent.
  Backlogged as a follow-up, not built.
- **Reading a live session's drive mode after an app restart** (attaching on open to a session spawned
  by an earlier run). That attach is WP5 5.1, and the mode readout for it goes with it. Moved to WP5
  in the WBS at plan time. WP4 covers only the in-run reconnect.
- **Detach / Reconnect controls and the Detached tile state:** WP5 (5.3). WP4 only reserves the
  overlay arm.
- **Time analytics for remote workspaces:** explicitly OUT (arch §D).
- **Two host spellings for one machine** (an `~/.ssh/config` alias plus `user@host`). This already
  collides on the forwarded socket path (arch §B), so it is not made to work here.
- **The third WP3 MAJOR** (`RECONNECT-LOOP-HAS-NO-BEHAVIOURAL-SEAM`) is pulled in **only if** WP4
  adds an emit inside `RemoteShared`, for AC-6.1's re-attach-pending edge or AC-7's strip. If it
  does, the emitter seam lands first, in the same phase, so the new emit is driven by a test.
  Otherwise it stays with WP5.
- The remaining WP3 MINORs (stale master pid, dispatch location, host stored twice, …) stay
  backlogged.

## Technical Constraints

- **TC-1 — no ssh I/O in a sync `#[command]`.** The remote install runs on the link worker during
  pre-connect, and the realpath resolve runs in an `async` command or on the blocking worker. Both
  are pinned by `sync_commands_do_not_block.rs`.
- **TC-2 — the remote basename differs from the local one.** `merge_claudesk_hooks` identifies
  "ours" by **exact script basename across the whole settings file**. If the remote basename were
  `claudesk-hook.pl` (as arch §D first wrote), a host that also runs its own Claudesk would have its
  local group **adopted and rewritten** by the remote install. The two installs would then flip-flop
  on each launch, which violates "never touch a hook Claudesk didn't install".
  - The remote script is therefore `claudesk-remote-hook.pl` (prod) / `claudesk-remote-hook-dev.pl`
    (dev), derived from the identifier through one function next to `script_basename`.
  - arch §D is corrected at plan time.
  - The mini does not run Claudesk today (checked 2026-11-16), so this protects the general case,
    not a live collision.
- **TC-3 — `origin` = `hash8(host)`**, the same value that already names the ControlPath. The
  registry derives `(origin, remote path)` from the `ssh://host/path` key it is given, so the
  register/deregister IPC is unchanged apart from the realpath alias (AC-3.3).
- **TC-4 — the heredoc delimiter must not occur in the deployed script.** A test asserts the bundled
  `claudesk-hook.pl` contains no line equal to the delimiter. The script is the same file as local,
  deployed unchanged except for its name. That holds AC-2's single-script rule.
- **TC-5 — every remote command string goes through `remote_cmd`.** No variable value appears
  outside `quote`.
- **TC-6 — the settings read-merge-write is not atomic against CC writing the same file.** A CC
  write between our read and our `mv` is lost. Locally the same race is accepted; remotely the
  window is one exec round trip (~0.15 s). Accepted, and recorded in arch §D.
- **Existing seams reused:** `merge_claudesk_hooks`, `remote_link::Sink`, `display_state` /
  `displayStateFor`, `WorkspaceRegistry::record_emitted` / overlay re-emit.
- **3rd-party probe check:** no new third-party dependency (ssh, tmux and CC were probed in WP1).
- **Verification:** live checks on the mini follow `remote-verify-hygiene`: fire real commands only
  in a scratch remote folder, and check for the operator's open remote workspaces before stopping
  the dev app. The live-test env vars are in the WP3 handoff notes.

## Open Questions

None blocking. Every unknown above was settled by reading the code or by one read-only check on
the mini. The judgment calls are listed under **Assumed** below for review.

## Elicitation record

**Asked:** none. The WBS, arch §D/§E and the WP3 as-built notes define the problem. Each remaining
default either fails the "expensive to reverse" test or follows from a prior.

**Assumed** (each is reversible at plan or verify-human; flag any that are wrong):
1. **The WP3 link-lifecycle MAJORs are fixed as WP4's Phase 1** (AC-0). They are not a separate
   task first, and they are not deferred to WP5. WP4 changes `remote_link`'s pre-connect and hold
   paths anyway, and a link that outlives its sessions would keep re-registering hooks on a host
   nobody is using.
2. **Remote basename `claudesk-remote-hook[-dev].pl`**, not arch §D's `claudesk-hook[-dev].pl`.
   This is TC-2's provenance reason.
3. **The tray alarm folds the underlying state under the link overlay** (AC-6.2). A lost-link
   remote session that is awaiting input keeps the alarm lit. [PRIOR: semantic-distance-not-just-
   visual-distance-for-status-colour] was considered: this is not a false alarm, because the
   session really does need the operator (to reconnect). Leaning lit — flag if wrong.
4. **The overlay keys on "terminal not attached"** (link Lost, **or** re-attach pending), not on
   link Lost alone. A re-attach that is backing off over an Up link is just as untrustworthy.
5. **The dropped-keys signal is a persistent pane strip** (AC-7), not a toast per keystroke. Keys
   stay dropped and are never replayed. [PRIOR: a-session-behaves-the-same-wherever-it-runs] is
   overridden here: this state does not exist locally. The prior's own rule says the difference is
   "stated where the operator meets it, never discovered", and the strip is that statement.
6. **No remote hook uninstall in WP4.** It is inert without a forward, and AC-2.2 keeps it silent.
7. **Reading the drive mode after an app restart moves to WP5**, which owns the open-time attach
   that would consume it. A mode recorded now with no reader would be an extracted machine with no
   caller.
8. **The overlay shows with the workflow gate OFF.** Remote status is the core session surface, not
   part of the workflow layer.
9. **Hook install runs on every link connect** (self-healing, like launch), not once per row.

## Work Tree

> **Session scope (operator, 2026-11-16):** "only do AC-0 this session". This session runs Phase 1's
> build → verify loop and then STOPS. Phases 2–4 start in a later session.

- [x] Phase 1: Link lifecycle: the open check holds, `ensure_and_hold` is atomic (AC-0)
  **Design:**
  - **`Link` gains a `gen: u64`** (a registry counter). A `LinkHold` carries the gen it counted on,
    and `release` decrements only a link of the **same gen**. A hold that outlived its link (quit's
    `stop_all`, or a stop raced in) can then never decrement a LATER link for the same host.
  - **`LinkRegistry::ensure_and_hold(self: &Arc<Self>, target) -> Result<(LinkInfo, LinkHold), String>`**
    does `get_or_start` + `refs += 1` + reads the gen under ONE `links` lock, then runs the existing
    wait-for-first-Up loop (extracted from `ensure`, unchanged). On failure it drops the hold: refs
    go to 0 and the link stops at once, which subsumes `ensure`'s `stop_if_unheld` path.
  - **Release flavours:** a session hold stops the link at refs 0 **immediately** (today's R-1
    behaviour). `LinkHold::linger(grace)` switches this hold to **linger**: at refs 0 the link is
    stopped after `OPEN_CHECK_GRACE` (20 s) by a one-shot timer thread, but only if that same-gen link
    is still unheld then. The timer re-checks under the lock.
  - **`remote_open_check`** takes `ensure_and_hold`. On `Ok` it calls `.linger(OPEN_CHECK_GRACE)`,
    because the open's spawn follows within a second and must find the link Up rather than tear it
    down and re-make it. On FolderMissing, an exec-level Unreachable or Invalid, the hold drops
    plainly, so the link stops at once.
  - **`cc_spawn_remote`** takes `ensure_and_hold`, and the hold travels in `RemoteSpawn`.
    `RemoteCcSession::spawn` no longer calls `links.hold(host)` itself.
  - **Removed:** `remote_link_ensure` (no frontend caller; `invoke` sweep done at spec), its
    `lib.rs` handler entry, its `ASYNC_COMMANDS` row in `tests/sync_commands_do_not_block.rs`, and
    the now-callerless public `ensure` / `acquire` / `hold`. Tests that used them migrate to
    `ensure_and_hold`.
  **Observable outcomes:**
  - CLI: `cargo test --lib remote_link` passes, including these new tests, each mutation-proven (the
    mutant named in brackets must turn it red):
    - (a) `a_check_that_ends_without_an_open_leaves_no_link`: FolderMissing / Unreachable drop
      plainly, so `state(host)` is `None` right after. [mutant: linger on every outcome]
    - (b) `a_successful_check_lingers_then_stops_when_nothing_opens`: the link is still present
      before the grace and `None` after a test-short grace. [mutant: delete the timer's stop]
    - (c) `a_successful_check_then_open_reuses_the_link`: a spawn hold taken inside the grace keeps
      the link past it, with refs 1 and the same gen. [mutant: the timer ignores refs]
    - (d) `ensure_and_hold_counts_on_the_link_it_returns`: the WP3 race. A close of the host's last
      other session between start and hold no longer leaves the new session's hold counting nothing.
      [mutant: split the lock back into two steps]
    - (e) `a_hold_from_a_stopped_link_never_releases_a_newer_one`: an old hold dropped after a stop
      + restart leaves the new link's refs unchanged. [mutant: release ignores gen]
  - CLI: `pnpm verify:auto` exits 0 (lint → format → tsc → check:link → vitest → cargo fmt → clippy
    `--all-targets` → cargo test). It covers `sync_commands_do_not_block` with the
    `remote_link_ensure` row removed.
  - CLI: `rg -n "remote_link_ensure" src src-tauri/src src-tauri/tests` finds no live reference.
  - CLI (live, mini, `remote-verify-hygiene`; **state-changing: the dev app's `projects.json` gains a
    scratch remote row pointing at `~/claudesk-scratch-wp4` on the mini, and that folder is created,
    then deleted**). With the dev app driven through the MCP bridge (`ipc_execute_command`):
    - `remote_open_check` on the row after its folder is deleted → `folder-missing`, then
      `pgrep -fl "ssh -M"` shows **no** master for that host within 2 s;
    - on the restored folder → `ok`, a master is present, and it is gone 20 s + 3 s later with no
      open;
    - a real open from the picker → the master persists while the workspace is open, and closing
      the workspace removes it within 2 s.
  **Alignment questions:**
  - (decision) OPEN_CHECK_GRACE = 20 s: after a successful check that you then abandon (you click a
    remote row and then do something else), the link stays up 20 s before stopping. Shorter risks
    tearing it down under a slow open; longer leaves an idle `ssh -M`. OK, or another value?
  - [x] P1.1 `Link.gen` + gen-checked `release`; `LinkHold { gen, linger }`; the linger timer
  - [x] P1.2 `ensure_and_hold` (one lock), with the wait-for-Up loop extracted from `ensure`
  - [x] P1.3 `remote_open_check` → `ensure_and_hold` + linger on Ok; `cc_spawn_remote` → `ensure_and_hold`, hold carried in `RemoteSpawn`
  - [x] P1.4 Delete `remote_link_ensure` + `ensure`/`acquire`/`hold`; update `lib.rs`, `ASYNC_COMMANDS`, migrate tests
  - [x] P1.5 Tests (a)–(e), each mutation-proven
  - [x] verify-auto
    — evidence: `pnpm verify:auto` → EXIT=0 (50 s): eslint 0 errors (1 pre-existing warning, `XtermPane.tsx:953`), format, tsc, check:link, vitest 3888/3888, cargo fmt, clippy `--all-targets -D warnings`, cargo test lib 1204 passed / 4 ignored + every integration target (incl. `sync_commands_do_not_block` without the `remote_link_ensure` row).
    — evidence: first runs failed on (1) `cargo fmt --check` over the new tests (formatting only; `cargo fmt` applied) and (2) clippy `large_enum_variant` on `SpawnTarget` once `RemoteSpawn` carried the hold, fixed by `Remote(Box<RemoteSpawn>)`.
    — evidence: `rg -n remote_link_ensure src src-tauri/src src-tauri/tests` → exit 1, no matches.
  - [x] verify-self
    - [x] CLI outcomes: tests (a)–(e) green and mutation-proven (P1.5 note); `pnpm verify:auto` EXIT=0; `rg remote_link_ensure` → none (see verify-auto evidence).
      — evidence: carried from build/verify-auto, not re-run.
    - [x] Live 1: a successful check that no open follows lingers, then stops.
      — evidence: dev app over the MCP bridge, scratch row `ssh://<host>/Users/<user>/claudesk-scratch-wp4`. `remote_open_check` → `{"kind":"ok"}` in 928 ms; 1 master for the next ~20 s; 0 masters at ≈ t0+21 s (1 s poll), i.e. ≈ 20 s after the check returned.
    - [x] Live 2: a check with the folder deleted leaves no link.
      — evidence: remote folder `rmdir`'d. `remote_open_check` → `{"kind":"folder-missing", …}`; a 100 ms poller saw the master present at −256 ms and gone at +159 ms relative to the check's return (≤ 2 s required).
    - [x] Live 3 (integration boundary: the picker's open path → `remote_open_check` → `cc_spawn_remote`): a real open reuses the check's link, persists while open, and stops on close.
      — evidence: folder restored; the picker row was clicked (`.picker-recent` button) at 14:29:28.36. ONE master (pid 69029, a child of the dev app) started 14:29:28; the tmux session `cd-a0fb13e3` was created 14:29:29, so the spawn REUSED the check's master. Same pid still alive at 14:30:00 (> the 20 s grace, held by the session). `filmstrip-close-ws-1` was clicked; masters 1 → 0 at +604 ms; the mini then reported "no server running" for `tmux -L claudesk-dev` (clean `/exit`).
    - [x] align: OPEN_CHECK_GRACE = 20 s (decision)
      — evidence: on the live open the spawn reached the link ~1 s after the click (master 14:29:28 → tmux session 14:29:29), so a 20 s grace leaves ~19 s of margin. An abandoned check keeps one idle `ssh -M` for ~20 s (Live 1). Not judged; for the operator.
    - Cleanup (declared state changes reverted): scratch row removed via `remove_project`, remote folder removed, dev `projects.json` back to its original 8 rows with no field changed; dev app stopped through `TaskStop`; no `ssh -M`, no listeners on 1420/9223, no dev tmux server on the mini.
  - [x] verify-human
    - [x] P1.verify-human.1 (decision) OPEN_CHECK_GRACE = 20 s — **operator: keep 20 s** (2026-11-16).
  - [x] verify-codify
    Test scope: full — suite not long (runtimes.md `pnpm verify:auto` Last 50 s; no CLAUDE.md long-suite declaration)
    — evidence: added `the_open_check_grace_is_the_operator_ruled_20_seconds` (pins P1.verify-human.1). Everything else verified live was already pinned: tests (a)–(e) cover the registry rules, `release_check_hold` is the open check's decision, and the type system enforces `cc_spawn_remote`'s hold (`RemoteSpawn.hold: LinkHold`, whose only production constructor is `ensure_and_hold`). `pnpm verify:auto` → EXIT=0 (53 s): vitest 3888/3888, cargo lib 1205 passed / 4 ignored, every integration target ok.

- [x] Phase 2: Origin on the wire, (origin, cwd) routing, time_store refusal (AC-2, AC-3.1/3.2/3.4, AC-4)
  **Relevance check (before Phase 2):**
  - Requester still needs this: yes — a remote tile's status is M17's core, and (origin, cwd) routing is what keeps a remote event off a local tile.
  - Requirements unchanged: yes — Phase 1 changed only the link's hold paths; AC-2/3/4 are untouched.
  - Solution still feasible: yes — `hash8` and `is_remote_key` already exist; the registry's keys already hold the `ssh://` form.
  - No superior alternative discovered: yes — nothing surfaced in Phase 1 bears on routing.
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: `cargo test --test hook_pl_output` passes. Every pre-existing case is unchanged (byte-identical
    local lines), plus new cases: `origin` emitted only when `CLAUDESK_ORIGIN` is non-empty; no
    `HOOK write-failed` line when origin is set and the socket is absent; exit 0 + stdout shape on
    origin-set degraded inputs.
  - CLI: `cargo test --lib status_broadcaster` passes the AC-3.2 (a)–(d) routing tests, each mutation-proven.
  - CLI: `cargo test --lib time_store` passes `an_origin_tagged_event_is_refused_at_ingestion`
    (mutation: delete the filter → red).
  - CLI: `pnpm verify:auto` exits 0.
  - Browser (live, integration boundary; added at verify-self): the consuming surfaces are the hook script CC runs, the broadcaster drain → `workspace-status`, and `workspace_deregister`. With the dev app on a scratch workspace, the REAL working-tree `claudesk-hook.pl` is fired at the dev `hook.sock`:
    - a local event moves the filmstrip/PiP dot;
    - an origin-tagged event at the SAME cwd is dropped (`resolved=none`) and the dot does not move;
    - closing the workspace deregisters it and empties the filmstrip and PiP.
  **Alignment questions:** none
  - [x] P2.1 `claudesk-hook.pl`: `origin` field + no failure-log when origin is set
  - [x] P2.2 `HookEvent.origin` (empty = absent)
  - [x] P2.3 `WorkspaceRegistry` keyed (origin, path), derived from the `ssh://` key; `to_update` resolves on both
  - [x] P2.4 `time_store` ingestion refuses origin-tagged events
  - [x] verify-auto
    — evidence: `pnpm verify:auto` → EXIT=0 (53 s): eslint 0 errors (the 1 pre-existing warning, `XtermPane.tsx:953`), format, tsc, check:link, vitest 3888/3888, cargo fmt, clippy `--all-targets -D warnings`, cargo test lib 1214 passed / 4 ignored, plus every integration target. `hook_pl_output` ran 24/24, including the 2 new origin tests and the doubled degraded arms.
    — evidence: `cargo doc --no-deps` → no warnings (the `resolve_cwd` → `resolve` intra-doc links resolve).
    — evidence (from build): the Phase 2 targets `cargo test --lib status_broadcaster` (84), `--lib time_store` (129) and `--lib hook_socket` (20) are green, with 10 mutants each killing its named test (P2 build note).
  - [x] verify-self
    - [x] CLI outcomes (`hook_pl_output`, `status_broadcaster` (a)–(d), `time_store` refusal, `pnpm verify:auto`)
      — evidence: carried from build/verify-auto, not re-run. `pnpm verify:auto` EXIT=0, `hook_pl_output` 24/24, and the 10 mutants each killed their named test (P2 build note).
    - [x] Live (integration boundary): local vs origin-tagged events through the real hook script and the drain
      — evidence: dev app over the MCP bridge; `scratch-b` was opened from the picker (`REGISTRY op=register id=ws-1`). Each event was fired with the working-tree `claudesk-hook.pl` → dev `hook.sock` (exit 0 every time). `status-channel.log` and the dot class, in order:
        - local `UserPromptSubmit` → `resolved=ws-1 outcome=emitted`, dot `status-dot-running`;
        - origin `a1b2c3d4` `Stop`, same cwd → `resolved=none outcome=dropped`, dot STILL running;
        - local `Stop` → `resolved=ws-1`, `status-dot-idle`;
        - origin `Notification permission_prompt` → `resolved=none outcome=dropped`, dot still idle (not blue);
        - local `Notification permission_prompt` → `resolved=ws-1`, `status-dot-awaiting` on the filmstrip AND the PiP row ("Awaiting input").
    - [x] Live (integration boundary): `workspace_deregister` (now `workspace_id_for`)
      — evidence: `filmstrip-close-ws-1` was clicked; the existing close guard asked ("still working… Close Anyway"), and "Close Anyway" was clicked. Then `REGISTRY op=deregister … scratch-b`, the filmstrip had no dots and the picker was back (8 rows), PiP read "No workspaces", and no CC was left in scratch-b.
    - [x] Tray alarm clears on that close (the `forget_workspace(workspace_id_for(..))` call). Gap accepted by the operator at P2.verify-human.1. <!-- was UNVERIFIED: no harness — the tray glyph is not exposed over IPC and `screencapture` failed this session ("could not create image from display", likely a locked screen); buildable: yes (a dev-only command returning `TrayState.applied`). Covered by the unit test `workspace_id_for_finds_local_and_remote_rows_by_key`; for a LOCAL row the old `resolve_cwd` path returned the same id. -->
    - [x] time_store live refusal: not driven live. The dev `time_tracking_enabled` is false, and turning it on is an undeclared state change. The refusal sits inside `write_gated`, the one function the drain calls, so the unit test `an_origin_tagged_event_is_refused_at_ingestion` exercises the live code path itself.
    - Cleanup: dev app stopped (`TaskStop`), bridge session stopped, no listeners on 1420/9223, no `ssh -M`. No remote workspace was opened. The dev `projects.json` rows are unchanged (scratch-b's close timestamp updates, as on any close).
  - [x] verify-human
    - [x] P2.verify-human.1 (decision) Accept the tray evidence gap: a close clearing the tray alarm is unit-tested but was not observed live (`screencapture` still fails at verify-human; the tray has no IPC readout). — **operator: accept the gap** (2026-11-16); check it live in Phase 4, which touches the tray fold.
  - [x] verify-codify
    Test scope: full — suite not long (runtimes.md `pnpm verify:auto` Last 53 s; no CLAUDE.md long-suite declaration)
    — evidence: added `status_broadcaster::tests::the_real_hook_line_routes_local_and_remote_events_apart`, the producer→consumer chain behind the live check. The REAL `claudesk-hook.pl` writes to a real socket, and its line goes through `parse_line` → `to_update` against a local AND a remote workspace at the same path. Cases: origin absent → local; `""` → local; `hook_origin(A)` → remote; `hook_origin(B)` → dropped. Mutation-proven: renaming the wire key to `host_origin` in the script turned it red, and the script was restored byte-identical. Every other verified behaviour was already pinned by P2's build tests. `pnpm verify:auto` → EXIT=0 (47 s): vitest 3888/3888, cargo lib 1215 passed / 4 ignored, every integration target ok.

- [x] Phase 3: Remote hook deploy + registration, the realpath alias, live status + drive mode (AC-1, AC-3.3, AC-5)
  **Relevance check (before Phase 3):**
  - Requester still needs this: yes — Phase 2 made remote events routable, but no remote host sends any until the hook is registered there.
  - Requirements unchanged: yes — Phase 2 added `remote_cmd::hook_origin`, which this phase's registered command uses (TC-3).
  - Solution still feasible: yes — `merge_claudesk_hooks` is pure and reusable, and the pre-connect script already deploys files through quoted heredocs with a real-shell test harness.
  - No superior alternative discovered: yes. One design point was settled at build: the plain-words failure (AC-1.2) cannot be an event the workspace listens for, because the link usually comes Up during the picker's open check, before any workspace exists, and a notice written into the pane is wiped by tmux's first redraw. It is therefore STICKY on the link (the last connect's install result), read by the remote workspace once its spawn resolves and shown in the workspace's existing toast.
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: `cargo test --lib hook_install remote_link` passes:
    - the fixture merge (`theme` + `skipDangerousModePermissionPrompt` + a foreign group + a local
      `claudesk-hook.pl` group all survive);
    - an idempotent re-merge with no write;
    - a malformed file is never written;
    - the heredoc delimiter is absent from the bundled script;
    - the remote basename is derived per identifier.
  - CLI (live, mini, read-only after the install): `ssh <host> 'jq .hooks.Stop ~/.claude/settings.json'`
    shows exactly one Claudesk group with `claudesk-remote-hook-dev.pl` and `CLAUDESK_ORIGIN`. The
    keys `theme` and `skipDangerousModePermissionPrompt` are unchanged against a pre-install capture.
  - Browser (MCP bridge, scratch remote row): submitting a prompt in the remote pane makes the
    filmstrip tile's dot class go `status-dot-running` → `status-dot-idle` at `Stop`, and an
    `AskUserQuestion` makes it `status-dot-awaiting`. The PiP row matches, and the tray alarm follows
    (via `ipc_get_backend_state` / the tray state).
  - CLI (live): with the gate ON and the mode `autopilot`, the remote CC transcript's
    `UserPromptSubmit` carries the `Claudesk reports the drive mode…` additionalContext. With the
    gate OFF it does not.
  - Browser (live): with the row's mode changed mid-session, the header readout is stale; apply-now
    respawns, the remote `tmux ls` shows the session restarted, and `pgrep -f claude` on the
    **local** machine shows no new local CC.
  **Alignment questions:**
  - Live status on a remote tile, seen for the first time: does it read the same as a local one?
  - [x] P3.1 Remote basename fn; deploy the script in pre-connect (quoted heredoc + temp-rename)
  - [x] P3.2 Remote settings fetch → local `merge_claudesk_hooks` → atomic write-back on change; plain-words failure (sticky on the link, read by the workspace into its toast)
  - [x] P3.3 Remote realpath resolved at open, registered as an alias
  - [x] P3.4 Live: status on all three surfaces; drive-mode line; apply-now respawn on the remote
    - [x] P3.4a (found live) A respawn's `new -A` attached to the session its own close was ending, and a busy CC outlived its close (R-1). Fixed: `RemoteCcSession::kill` ends the remote session (`tmux_end_session_command`), and `cc_spawn_remote` waits for the close (`begin_close` / `wait_not_closing`).
    - [x] P3.4b (operator decision: pull WP5 5.2's transcript check into WP4) The remote `--continue` guard asks the remote for a transcript (physical-path slug), so apply-now keeps the conversation.
  - [x] verify-auto
    — evidence: `pnpm verify:auto` → EXIT=0 (48 s): eslint 0 errors (the 1 pre-existing warning), format, tsc, check:link, vitest 3892/3892 (+4: `remoteHookWarningToast.test.tsx`), cargo fmt, clippy `--all-targets -D warnings`, cargo lib 1242 passed / 4 ignored, every integration target ok (incl. `sync_commands_do_not_block` with the new sync `remote_hook_warning`).
    — evidence: `cargo doc --no-deps` → no warnings.
  - [x] verify-self
    Driven by the orchestrator (the bridge is unreachable from subagents) during P3.4. Every outcome below was observed live on the mini; the full log is in the P3.4 live NOTE. Binaries: the install, status, alias, AC-5.1 gate-ON and reconnect checks ran on 15:10/15:20 builds; P3.4a/b changed only the close, spawn-wait and `--continue` paths. Apply-now, the busy close, gate-OFF and status routing (`resolved=ws-1 outcome=emitted`) were re-observed on the FINAL binary (15:30:26).
    - [x] CLI `cargo test --lib hook_install remote_link` (fixture merge, idempotent write-skip, malformed never written, TC-4 delimiter, per-identity remote basename) — evidence: verify-auto; 13 + 9 mutants (P3 build NOTE).
    - [x] CLI live: the remote `settings.json` after install — evidence: each of the 10 events has exactly one `claudesk-remote-hook-dev.pl` group with `CLAUDESK_ORIGIN='0430d011'`; `theme` + `skipDangerousModePermissionPrompt` are unchanged against the pre-install capture; mode 644 is kept. A reconnect's re-install is a write-skip (mtime unchanged).
    - [x] Browser live (integration boundary: picker open → `remote_open_check` → link install → `cc_spawn_remote` → the hook over the forward → drain → `workspace-status`): filmstrip idle → running → idle on a real prompt; `AskUserQuestion` → `status-dot-awaiting` on the filmstrip AND the PiP row; the answer → running → idle — evidence: dot-class samples + `status-channel.log` lines (P3.4 NOTE).
    - [x] Browser live (integration boundary: the workspace toast): no warning after a good install — evidence: `workspace-inject-toast` absent. The warning path was driven at the IPC edge in `remoteHookWarningToast.test.tsx` (a malformed remote settings file was not staged on the operator's host).
    - [x] AC-3.3 live: the row stored at the SYMLINK path; CC reported the physical cwd; every event resolved to it — evidence: `cwd=/Users/<user>/claudesk-scratch-wp4 … resolved=ws-1`.
    - [x] CLI live AC-5.1: gate ON + autopilot → the remote transcript holds `Claudesk reports the drive mode for this workspace as autopilot.`; gate OFF → no `CLAUDESK_DRIVE_MODE` on the spawn, and the newest transcript has the prompt with 0 such lines.
    - [x] Browser live AC-5.2: mid-session change → `fsd ⚠` stale with `cc_drive_mode`=`autopilot`. A link drop + re-attach → still `autopilot`. Apply-now → a NEW remote tmux session running `claude … --continue` with the new mode; the dev app's local children are only the ssh master + terminal (no local CC); `cc_drive_mode` = the new mode.
    - [x] (P3.4a) R-1 busy close: CC mid-`sleep 40`, Close Anyway → the remote session was gone at +4 s, the master stopped.
    - [x] Tray alarm follows the remote status. The same gap as P2, accepted there (P2.verify-human.1); Phase 4 carries the live check. <!-- was UNVERIFIED: no harness — `screencapture` fails ("could not create image from display") and the tray has no IPC readout; buildable: yes (a dev-only `TrayState.applied` readout). It folds the same `workspace-status` stream the filmstrip/PiP showed; the operator accepted the same gap at P2.verify-human.1, and Phase 4 carries the live tray check. -->
    - [x] align: "Live status on a remote tile, seen for the first time: does it read the same as a local one?" — evidence (CAPTURED, not judged): the remote tile and PiP row use the SAME classes as a local tile (`status-dot-idle` / `-running` / `-awaiting`, PiP label "Awaiting input"); no remote-specific styling exists yet (Phase 4 adds the link overlay). Transitions landed ~1 s after the remote event.
    - Cleanup: see the P3.4 NOTE (scratch row removed, gate restored ON, remote scratch removed, no `ssh -M`, no dev tmux, dev app stopped). The mini's `settings.json` keeps the dev hook registration.
  - [x] verify-human
    - [x] P3.verify-human.1 (align) A remote tile reads the same as a local one (same dot classes, no remote styling until Phase 4) — **operator: yes, same as local** (2026-11-16).
    - [x] P3.verify-human.2 (decision) The dev hook registration the live test left in the mini's `~/.claude/settings.json` — **operator: keep it** (2026-11-16): inert without a dev link, and re-installed by any dev open anyway.
  - [x] verify-codify
    Test scope: full — suite not long (runtimes.md `pnpm verify:auto` Last 48 s; no CLAUDE.md long-suite declaration)
    — evidence: the one live-verified behaviour without a pin was the spawn RECORDING the realpath alias (the registry test proves the alias resolves; nothing pinned the caller). `a_remote_close_ends_its_session_and_a_respawn_waits_for_it` now asserts `reg.set_remote_realpath(&project_path, real.clone())` in `cc_spawn_remote`, from the same resolve, before `physical`. Mutation-proven: dropping the call turned it red; the file was restored byte-identical. Everything else verified live was already pinned by P3's build tests (P3 build NOTE). The consuming surfaces are covered by the Phase-2 chain test (real hook → `parse_line` → `to_update`) and the live-mount `remoteHookWarningToast.test.tsx`. `pnpm verify:auto` → EXIT=0 (46 s): vitest 3892/3892, cargo lib 1242 passed / 4 ignored, every integration target ok.

- [x] Phase 4: The link overlay + the dropped-keys strip (AC-6, AC-7)
  **Relevance check (before Phase 4):**
  - Requester still needs this: yes — Phase 3 made remote status live, so a stale dot during a drop is now a real lie.
  - Requirements unchanged: yes — the operator confirmed at P3.verify-human.1 that a remote tile reads the same as local, so the overlay is the only remote-specific styling.
  - Solution still feasible: yes — the attach/detach edges are `on_inner_exit`'s Reconnect arm and `reconnect`'s successful spawn, and `display_state` already lets the tray fold the underlying state.
  - No superior alternative discovered: yes. Per the spec's Out-of-Scope rule, the overlay's emits inside `RemoteShared` go through an injected seam driven by a test. The WP3 MAJOR's remaining part (a fake PTY spawner that drives the reconnect loop) stays for WP5.
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: `cargo test --lib status_broadcaster` passes:
    - the overlay re-emit;
    - `display_state` under the overlay;
    - the close/quit and respawn guards reading `state` unchanged (mutation: make a guard read the
      overlay → red);
    - Unknown after re-attach;
    - the OFF-invariant pin still at 6 arms / 10 subjects.
  - CLI: `vitest` passes `displayStateFor` / the tile-presentation tests for the dimmed + glyph case.
  - Browser (live, MCP bridge, scratch remote row; **state-changing: the agent kills its own dev
    `ssh -M` master**). Within 2 s:
    - the tile and PiP row carry the dimmed class + the link glyph, with the last hue preserved;
    - the pane shows the "keys you type are not sent" strip.
    After the reconnect, the strip is gone and the dot reads Unknown until the next prompt.
  **Alignment questions:**
  - The dimmed-hue + broken-link glyph in action: does it read as "not connected" at a glance?
  - The tray staying lit for a lost-link session that was awaiting input: still what you want? (spec Assumed #3)
  - (carried from P2.verify-human.1) Observe live that closing an awaiting workspace clears the tray alarm. It was not observable in P2; Phase 4 drives the tray fold anyway.
  - The pane strip's wording and placement while reconnecting (spec Assumed #5)?
  - [x] P4.1 The overlay field on the DTO, set and cleared from the remote session's attached/not-attached edges (emitter seam first if this adds an emit inside `RemoteShared`)
  - [x] P4.2 Filmstrip + PiP presentation (dimmed + glyph + tooltip); tray folds the underlying state
  - [x] P4.3 The reconnecting strip in the pane
  - [x] verify-auto
    — evidence: `pnpm verify:auto` → EXIT=0 (50 s): eslint 0 errors (the pre-existing warning), format, tsc, check:link, vitest 3905/3905 (incl. the OFF-invariant pin, unchanged, and the 13 new link-overlay/strip tests), cargo fmt, clippy `--all-targets -D warnings`, cargo lib 1252 passed / 4 ignored, every integration target ok. `cargo doc --no-deps` → no warnings.
    — evidence (re-run after the F9b fix): `pnpm verify:auto` → EXIT=0 (49 s): vitest 3905/3905, cargo lib 1253 passed / 4 ignored (+1: `attach_still_held_requires_the_same_live_terminal`), every integration target ok (incl. `sync_commands_do_not_block` with the new `confirm_attached` thread).
    — evidence: the first runs failed on (1) prettier over the 2 new test files (format only; `prettier --write`) and (2) `pipFanoutWiring.test.ts`'s exact-prop guard, an obsolete test superseded by `link={link}` (see `## Test Triage`; regex updated, count of 3 kept).
  - [x] verify-self
    Re-run after F9b. Orchestrator-driven (bridge). Live evidence from the two runs on the mini (15:49 pre-fix, 15:53 post-fix on the final code: the binary was built after every source edit).
    - [x] CLI `cargo test --lib status_broadcaster` (overlay re-emit, `display_state` ignores it, Unknown after re-attach, sink emits outside the lock) + the OFF-invariant pin unchanged — evidence: verify-auto (re-run), 1253 lib / 3905 vitest.
    - [x] vitest `displayStateFor`/tile tests for the dimmed + glyph case — evidence: `linkOverlay.test.ts`, `linkOverlayRender.test.tsx` (filmstrip both forms, PiP every layout), `reconnectStrip.test.tsx`.
    - [x] Browser live (state-changing, declared: the agent kills its own dev `ssh -M`): within 2 s the tile and PiP row carry `status-link-lost` + the glyph with the LAST hue kept (`LOST:status-dot-awaiting+glyph` at +0.0 s on both), and the pane shows the strip — evidence: the P4.verify-self.F1 re-verify samples. After the re-attach held, the strip is gone and the dot reads `status-dot-unknown` until the next event (+3.6 s).
    - [x] (integration boundary: the remote session's reconnect → the sink → `workspace-status` → filmstrip/PiP/header) — the same live run; the backend's emit is the one stream all three surfaces read.
    - [x] align: "The dimmed-hue + broken-link glyph in action: does it read as 'not connected' at a glance?" — CAPTURED: screenshots `p4-overlay-main-2.png` and `p4-overlay-pip-2.png` in the session scratchpad (the dimmed-Unknown variant, glyph amber `#d29922`, tooltip "Not connected to <host>: reconnecting"); the awaiting-blue variant is in the 50 ms samples. Not judged.
    - [x] align: "The tray staying lit for a lost-link session that was awaiting input" (spec Assumed #3) — CAPTURED: `display_state` ignores the overlay (`display_state_ignores_the_link_overlay`, mutation B4), so the tray folds the underlying awaiting state. Not observed on the menu bar (see below).
    - [x] align: "The pane strip's wording and placement while reconnecting" (spec Assumed #5) — CAPTURED: "Not connected to <host>. Keys you type are not sent; reconnecting…", amber on dark amber, pinned over the top of the CC pane (screenshot `p4-overlay-main-2.png`). Not judged.
    - [x] Tray, live: lit for a lost awaiting session; cleared when an awaiting workspace closes (carried from P2.verify-human.1). Gap accepted at P4.verify-human.4; readout backlogged (`SURFACE-2026-11-16-TRAY-HAS-NO-READOUT-FOR-LIVE-VERIFY`). <!-- was UNVERIFIED: no harness — `screencapture` still fails ("could not create image from display") and the tray has no IPC readout; buildable: yes (a dev-only `TrayState.applied` readout command). -->
    - Cleanup: scratch row removed (`projects.json` back to 8 rows), remote folder + transcripts removed, no dev tmux server, no `ssh -M`, dev app stopped.
    - [x] P4.verify-self.F1 (BLOCKING) The overlay drops the last hue on the first re-attach attempt — FIXED (F9b)
      — evidence (live, mini, scratch row `…/claudesk-scratch-wp4p4`, the remote CC awaiting an `AskUserQuestion`): killing the dev master → main-window samples went `status-dot-awaiting` → **`status-dot-unknown` with NO overlay** (49:42.167) → 153 ms later `LOST:status-dot-unknown+glyph` + the strip. Expected: `LOST:status-dot-awaiting+glyph` (AC-6.2, the LAST state's hue dimmed).
      — cause (read from the code + timeline): after a drop, `reconnect` reads a STALE Up (the link worker polls every 200 ms), spawns an attach terminal that dies at once (exit 255, `NO_DIRECT_FALLBACK`), and reports `Attached` when the process SPAWNS, not when the attach holds. So Attached (→ Unknown) then Lost again. The overlay flickers off and the hue is lost.
      — fix (build, F9b): `reconnect` no longer reports Attached. It hands the attach to `confirm_attached`, which reports it only after `ATTACH_CONFIRM` (1.5 s), and only if `attach_still_held` (workspace open, a terminal in place, the SAME re-attach's `attached_at`). Tested: `attach_still_held_requires_the_same_live_terminal` plus the updated caller guard. Mutation-proven: G1 Attached at spawn again, G2 any re-attach counts, G3 the confirmation skips the check; each killed its test.
      — re-verify (live, same setup, the remote CC awaiting a fresh `AskUserQuestion`, one master kill at 15:53:10): main samples at 50 ms went `status-dot-awaiting` → `LOST:status-dot-awaiting+glyph` + STRIP (53:10.903), with NO unknown in between → `status-dot-unknown`, strip gone (53:14.490). The PiP showed the same sequence (53:10.887 / 53:14.475). A further 10 s kill loop held the overlay and strip; after it ended, overlay off, strip gone, Unknown. PASS.
    - Observed correct in the same run: the strip showed with the overlay ("Not connected to <host>. Keys you type are not sent; reconnecting…", over the top of the pane); the glyph + plain-words tooltip were on the filmstrip tile, header and PiP row; the overlay held through 15 s of repeated master kills; ~2 s after the kills stopped the overlay and strip cleared and the dot read Unknown (AC-6.3); the PiP agreed throughout. Screenshots in the session scratchpad (`p4-overlay-main.png`, `p4-overlay-pip.png`).
    - [SURFACED] the right panel of a REMOTE workspace shows the Docs/Editor/Diff/Terminal tabs and a Docs error reading the `ssh://` key as a local path ("Could not read this project's docs: … root "ssh://…": No such file or directory"). Pre-existing since WP3 (arch §G: the IDE half is absent on a remote row); not WP4's surface → backlog.
  - [x] verify-human
    - [x] P4.verify-human.1 (align) The dimmed hue + amber broken-link glyph + tooltip reads as "not connected" — **operator: yes, reads right** (2026-11-16).
    - [x] P4.verify-human.2 (align, spec Assumed #3) The tray stays lit for a lost session that was awaiting input — **operator: yes, keep it lit**.
    - [x] P4.verify-human.3 (align, spec Assumed #5) The strip's wording and over-the-pane placement — **operator: yes, as built**.
    - [x] P4.verify-human.4 (decision) The tray is still unobservable live — **operator: accept; backlog a dev readout**.
  - [x] verify-codify
    Test scope: full — last phase
    — evidence: no new test was needed. Every live-verified behaviour is already pinned:
      - the overlay ON/OFF/Unknown rules, the hook-event stamp and the sink's emit-outside-the-lock: `status_broadcaster` tests (B1–B5);
      - F1's composition: the `reconnect` / `confirm_attached` caller guard plus `attach_still_held` (G1–G3);
      - the guard inputs and hue: `linkOverlay.test.ts` (F5/F6);
      - the consuming surfaces: the filmstrip (both forms) and PiP (every layout) render test (F1–F3) and the live-mount strip test (F4).
      The tray stays on its unit tests by the operator's decision (P4.verify-human.4).
    — evidence: `pnpm verify:auto` → EXIT=0 (44 s): vitest 3905/3905, cargo lib 1253 passed / 4 ignored, every integration target ok, clippy/fmt clean.

## Code-Quality Review: m17-wp4-status-over-the-link
Reviewed `de02657^..82fc64f` (2026-11-16, `code-quality-reviewer`). **0 CRITICAL, 1 MAJOR, 6 MINOR**, all auto-backlogged (drive_mode=autopilot) → `backlog-quality-findings.md` → `# m17-wp4-status-over-the-link — 2026-11-16`.

### Strengths
- **AC-0 lifecycle:** `ensure_and_hold` counts the hold under one `links` lock; `Link.gen` stops a stale hold from releasing a newer link; the linger timer checks again under the lock. The API left without callers was deleted along with its `ASYNC_COMMANDS` row.
- **Routing:** a typed `Route` derived from the registry key; `resolve(origin, cwd)` filters by scope first and never canonicalizes a remote path locally; `origin` comes in through `empty_as_none`. The AC-3.2 tests cover all four cross-scope cases.
- **Link overlay:** follows the `attention` pattern. It is display-only and omitted when absent, `display_state` ignores it on purpose, a TS test asserts the guards' inputs are unchanged, and the logic is split into testable parts (`drain_step`, `apply_link_edge`, `attach_still_held`).
- **Remote install:** reuses `merge_claudesk_hooks`; constant read/write commands with the content on stdin; noise-tolerant sentinels; a malformed file is never written; the TC-2 basename and the TC-4 delimiter test hold.
- **Frontend tests:** they render real components (both filmstrip forms, all four PiP layouts, a live `Workspace` mount) rather than matching source text.

### Issues
**CRITICAL**
- (none)

**MAJOR**
- [`cc_session/mod.rs` `RemoteCcSession::kill`; `tests/sync_commands_do_not_block.rs` `quit_now` LEDGER] `end_session` (up to ~15 s) now follows the copy-mode cancel (10 s) and the reap in every remote kill. `quit_now` (sync, main thread) joins those kills, so with an unreachable host the UI can freeze for ~27 s at quit. The ledger still says one 10 s exec. With no master, `exec_argv` (no `NO_DIRECT_FALLBACK`) tries a direct connect and waits out `ConnectTimeout`. — *The ledger understates an accepted main-thread block, and the link-down quit pays the most. Skipping `end_session` when the link is not Up (or adding the no-direct proxy to these execs) would restore the bound, and the ledger text needs updating.*

**MINOR**
- [`cc_session/mod.rs` `RemoteCcSession::spawn`] The overlay sink rebuilds the row key with `remote_key(host, path)`, while `cc_spawn_remote` keys the alias and the close-wait on the caller's `project_path`. A mismatch would mean no overlay, silently. — *Pass `project_path` through `RemoteSpawn`.*
- [`status_broadcaster/mod.rs` `remote_realpaths`] Never cleared: `deregister` keeps it, and a later spawn whose realpath equals the stored path (symlink removed) or whose exec fails keeps the old alias routing old-folder events. — *Remove the entry when the realpath equals the stored path, or on deregister.*
- [`Workspace.tsx` `onSessionId`] The hook warning reuses the `injectFailure` toast state and is re-read on every respawn (Recycle, apply-now). — *One channel with two meanings: they can overwrite each other, and a known warning comes back on every respawn.*
- [`status_broadcaster` `drain_step` vs `apply_link_edge`] `drain_step` stamps the overlay under the lock but the drain emits after releasing it. A hook update emitted after `Attached`'s Unknown keeps a stale overlay until the next event. — *A narrow window, but an idle remote CC may send nothing more.*
- [`cc_session/commands.rs` `cc_spawn_remote`] Two more sequential ssh round trips per remote spawn (realpath, then transcript). — *One exec printing both sentinels would do the same job.*
- [`cc_session/mod.rs` `a_remote_session_reports_its_link_edges_through_the_sink`; `status_broadcaster/mod.rs` module doc + the `to_update` doc] The test pins the whole `emit_exit` body as one whitespace-free `starts_with`, which is brittle and adds to the `RECONNECT-LOOP-HAS-NO-BEHAVIOURAL-SEAM` debt. The module doc's "canonicalizes both" is now true only for local scope, and the inserted `time_store` sentence is an unwrapped run-on line. — *Brittle pin plus stale and cosmetic docs.*

### Assessment
The feature is well built and leaves the code in better shape. It extends existing patterns (`attention`, `merge_claudesk_hooks`, the drain's compare-and-set) instead of adding new ones, and the AC-0 rework closes two real races with a small, readable mechanism. Test discipline is high. The main debt is at the edges of the scope that grew during the build: P3.4a's close-ends-session work extended the quit path's main-thread block without updating its ledger. A few small sources of truth are kept by hand (the key derived twice, the uncleared alias map, the shared toast state), and the source-guard surface over the untested reconnect loop grew again.

### If you disagree
Mark a finding `[DISMISSED]` here before `feature-finalize` archives the WIP.

## Current Node
- **Path:** Feature > done (archived)
- **Active scope:** none (completed 2026-11-16)
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** design-priors.md size guard; arch §E "tray menu row"; `remote-link` has no frontend consumer. At the feature's close: delete-on-resolve the two WP3 MAJORs Phase 1 resolved (`…-OPEN-CHECK-LEAKS-AN-UNHELD-LINK`, `…-ENSURE-THEN-HOLD-IS-NOT-ATOMIC`) from `backlog-quality-findings.md` + their stubs, with CHANGELOG lines.

## Discoveries
[NOTE-2026-11-16] P1 verify-self — driven by the orchestrator, not a `feature-verify-self-runner`: every live outcome needs the Tauri bridge, which subagents can't reach (memory `mcp-bridge-tools-not-exposed-to-subagents`). The CLI outcomes were already run in build/verify-auto. Instrument trap hit: in a BACKGROUNDED poll loop, `pgrep -f 'ssh -M'` intermittently counts the loop's own shell (its argv contains the pattern), so it read 1 master before any existed. Fixed by matching argv exactly (`ps -axo command | awk '$1=="/usr/bin/ssh" && $2=="-M"'`) and cross-checked with `ps lstart` on the one real pid.
[NOTE-2026-11-16] P1.5 build — tests (a)–(e) were mutation-proven one at a time from a `cp` aside, with the shasum checked before and after. Each mutant landed (`grep -c` of the new text = 1) and turned its own test red: (a) linger on every outcome, (b) the linger timer never stops, (c) `stop_if_unheld` ignores refs, (d) the hold counted only after the wait (the old two-step shape), (e) `release` ignores gen. Both files were restored byte-identical. As built: `refs` and `stop` became `#[cfg(test)]` (no production caller since AC-0). The harness registry is now `Arc` (`harness_with` for tweaks). `remote_open_check`'s hold decision is the extracted `release_check_hold`.
[SURFACED-2026-11-16] feature-spec — design-priors.md exceeds size guard (326 lines), truncated to first 100 + headings, then the M17-relevant priors read in full (lines 150–205, 283–326). Consider summarizing.
[SURFACED-2026-11-16] feature-spec — arch §E's overlay names a "tray menu row", but the tray has no per-workspace rows (it is a 2-state alarm plus an actuator menu, M7). AC-6.2 specifies the alarm fold instead. Correct arch §E at plan time.
[SURFACED-2026-11-16] feature-spec — the `remote-link` event is emitted by `remote_link::commands` but has **no frontend consumer** today. AC-6's overlay is its first one, or the backend folds it into `workspace-status` and the event stays diagnostic.
[NOTE-2026-11-16] P2 build — as built:
  - The hook adds `origin` only when `CLAUDESK_ORIGIN` is non-empty, and skips the write-failed trace when origin is set.
  - `HookEvent.origin` maps `""` to `None` through `empty_as_none`.
  - `WorkspaceRegistry` stores a `Route` per key: `Local(path)`, `Remote { origin: hook_origin(host), path }` (split from the `ssh://` key by the new `config_store::split_remote_key`), or `Unroutable`.
  - `resolve_cwd(cwd)` became `resolve(origin, cwd)`. A remote cwd is matched raw, never canonicalized locally.
  - The close path now uses the exact-key `workspace_id_for`, because an event resolve can no longer reach a remote key without an origin. Before this change it worked only because `Path::new("ssh://…").starts_with` itself.
  - `time_store::write_gated` refuses `origin.is_some()` before mapping.
  - `remote_cmd::hook_origin(host)` = `hash8(host)` (TC-3). Phase 3 uses it for the registered command.
  - Mutation-proven one at a time from a `cp` aside, each restored byte-identical (shasum). Each mutant was confirmed landed and killed exactly its named test:
    - Perl: never emit origin; trace on remote; emit origin when empty.
    - Registry: (a) Local arm ignores origin; (b) Remote arm takes no-origin; (c) Remote arm matches every path; (d) Remote arm ignores the origin value; (3.4) canonicalize the remote cwd.
    - time_store: delete the filter.
    - hook_socket: keep `""`.
[NOTE-2026-11-16] P2 verify-self — driven by the orchestrator (the MCP bridge is unreachable from subagents, as in P1). The phase's outcomes cited no consuming surface, so one live boundary outcome was added at verify-self and driven, rather than back-looping to build for a plan-only change. Firing the REAL hook script at the dev socket with a chosen payload is a cheap, deterministic way to drive the status channel without a CC turn; it is reusable for Phase 3/4 checks.
[NOTE-2026-11-16] P3 build — as built:
  - **Deploy:** the pre-connect deploys `HOOK_SCRIPT` (`include_str!`) as `claudesk-remote-hook[-dev].pl` (`hook_install::commands::remote_script_basename`, TC-2) through a third quoted heredoc. TC-4 is pinned for all three deployed files.
  - **Install:** `install_remote_hook` runs on the link worker BEFORE Up. Its sticky result is `LinkRegistry::hook_warning`, read by the remote workspace (`remote_hook_warning`, `remoteHookWarning.ts`) into the existing toast. `Transport` gained `exec(argv, stdin)`; the test fake can run a real `/bin/sh` against a temp `$HOME`.
  - **Realpath alias:** at each remote spawn, `cc_spawn_remote` resolves the physical path (`realpath_command`) and records it as a `WorkspaceRegistry::set_remote_realpath` alias.
  - **AC-5.2 reattach:** pinned by a source guard (`a_reattach_never_touches_the_retained_drive_mode`, whole-identifier match incl. `SessionRegistry`), plus live.
  - **Mutation-proven** one at a time, each landed, each restored byte-identical:
    - M1–M11: deploy basename, origin in the command, write-skip, malformed→{}, `cp -p`, the dropped warning, alias-equal, alias ignored, alias on local rows, reattach→SessionRegistry.
    - Frontend: the remote-only gate, the toast set.
    - The fix: F1 kill skips the end, F2 no wait (the guard first PASSED this mutant, a text-satisfied guard, then was tightened to the `if !… { return Err(` shape), F2b wait after the link, F3 the script never kills, F4 wait ignores the close, F5 no wake (the upper bound was added for it).
    - 5.2: T1 the guard ignores the answer, T2 slug from the stored path, T3 any answer reads yes.
  - **One equivalent mutant (T4):** a glob inside the `if` behaves like `find` in sh and zsh. The comment's claim that it "would be an error in zsh" was corrected to robustness.
[NOTE-2026-11-16] P3.4 live (mini, dev build, scratch row `ssh://<host>/Users/<user>/claudesk-scratch-wp4-link`, a symlink to `…-wp4`). Pre-install the mini's `settings.json` held `theme`, `skipDangerousModePermissionPrompt`, no hooks (a backup was kept in the session scratchpad).
  - **Install:** after open, both keys were unchanged, and each of the 10 events had exactly one `claudesk-remote-hook-dev.pl` group with `CLAUDESK_ORIGIN='0430d011'`; the mode stayed 644. The reconnect's re-install was a live write-skip: the mtime was unchanged after a master kill + reconnect. The toast was absent (the install worked).
  - **Alias:** CC reported the PHYSICAL cwd `…/claudesk-scratch-wp4`, and every event resolved to the row stored at `…-link` (`resolved=ws-1`).
  - **Status:** filmstrip idle → running (+1.06 s) → idle (+2.12 s). `AskUserQuestion` → `status-dot-awaiting` on the filmstrip AND PiP ("Awaiting input"). The answer → running (+0.15 s) → idle (+0.9 s). The tray is unobservable (`screencapture` fails), as at P2.
  - **AC-5.1:** gate ON + autopilot: the remote transcript holds `…as autopilot.`. Gate OFF: the spawn has no `CLAUDESK_DRIVE_MODE`, and the newest transcript has the prompt and 0 drive-mode lines.
  - **AC-5.2:**
    - Mid-session mode change → the readout showed `fsd ⚠` (stale), and `cc_drive_mode` = `autopilot`. Killing the master → a new master in 2 s and the same tmux session re-attached → `cc_drive_mode` still `autopilot`.
    - Apply-now → a NEW remote tmux session (15:20:42, replacing :27) running `claude … --continue` with the new mode. The dev app's only local children were the ssh master + terminal: no local CC.
  - **R-1 busy close:** with CC mid-`sleep 40`, Close Anyway → the remote session was gone at +4 s (no tmux server, no `sleep`), and the master stopped.
  - **Instrument traps:**
    - A new remote folder gets CC's "trust this folder?" dialog, which defaults to "No, exit", so the first injected `\r` exited CC. It was answered with ↓ + Enter.
    - `tauri:dev` rebuilds and RESTARTS the app on every `src-tauri` save, which orphaned the master twice; each time the orphan was killed and the scratch tmux session cleaned. The dev app was stopped before the mutation runs.
  - **Cleanup:** scratch row removed (`projects.json` back to 8 rows), gate restored ON, remote folder + symlink + scratch transcripts removed, no dev tmux server, no `ssh -M`, dev app stopped. ⚠️ The mini's `~/.claude/settings.json` KEEPS the dev hook registration (the install itself; inert without a forward, AC-2.2).
[SURFACED-2026-11-16] P3.4 — the remote respawn race + R-1 busy-close leak existed since WP3 (Recycle on a remote row was exposed to the same `new -A` attach). Fixed in-phase (P3.4a); arch §D records it.
[NOTE-2026-11-16] P4 build — as built:
  - **Backend:**
    - `WorkspaceStatusUpdate::link: Option<LinkOverlay { status: Reconnecting | Detached, host }>` (omitted when None, so local and attached DTOs are byte-identical).
    - `LastEmitted.link` survives hook events; `drain_step` (extracted from the drain loop) stamps it on.
    - `set_link_overlay`: ON re-emits the last state with the overlay and markers cleared; OFF emits Unknown and drops `attention`.
    - `display_state` ignores the overlay (the tray folds the underlying state).
  - **Emitter seam (the spec's Out-of-Scope rule):** `RemoteShared.link_sink: LinkEdgeSink` is injected, built by `commands::link_edge_sink` around the testable `apply_link_edge` (emits with the registry lock released). Edges: Lost in `on_inner_exit`'s Reconnect arm, Attached in `reconnect` after `drop(g)`, Ended in `emit_exit`'s latch, all pinned by a caller guard. ⚠️ The WP3 MAJOR's remaining part (a fake PTY spawner driving the reconnect loop for real, retiring the source guards) is NOT done; it stays for WP5 and is rewritten slimmer at WP4's close.
  - **Frontend:**
    - `WireLinkOverlay` + `linkFor` + `linkOverlayTitle`; `useWorkspaceStatus().linkFor`.
    - `WorkspaceStatusIndicator`'s `link` prop: `.status-link-lost` dims the dot (opacity 0.4, no pulse) and keeps its hue class, adds an inline-SVG broken-link glyph, and sets the plain-words title.
    - Wired to the filmstrip (both tile forms), the PiP (every layout; `PipTile` exported for its render test), and the workspace header.
    - The AC-7 strip is `.workspace-reconnect-strip`, `role=status`, pinned over the top of the pane (absolute, pointer-events none: a block above it would push the terminal's last rows out with no refit). It shows only for `reconnecting`.
  - **Mutation-proven** one at a time, each landed and restored byte-identical:
    - Backend: B1 a hook event clears the overlay, B2 no stamp, B3 re-attach keeps the old state, B4 `display_state` honours it, B5 emit under the lock, B6 a drop unreported, B7 Attached under the inner lock.
    - Frontend: F1 the indicator ignores it, F2 the pill drops it, F3 PiP compact drops it, F4 the strip for detached too, F5 the fold drops it, F6 the hue changes under it.
  - **arch §E** corrected: there is no "tray menu row"; the tray folds the underlying state.

## Test Triage — pipFanoutWiring.test.ts › every dot in the PiP is the shared WorkspaceStatusIndicator
Classification: Obsolete test — the new feature (M17 WP4 AC-6.2, the link overlay on the PiP row) intentionally supersedes the exact prop set the guard pinned.
Confidence: high
Evidence: the guard's regex matched `<WorkspaceStatusIndicator state={state} snippet={snippet} />` exactly; P4.2 added `link={link}` to all three PiP branches, so it counted 0 instead of 3.
Action: updated the regex to the new prop set (`state` + `snippet` + `link`), keeping the count of 3 and the no-hand-rolled-dot assertion; the PiP's link reaching every layout is rendered by `linkOverlayRender.test.tsx`.
[NOTE-2026-11-16] ship — Phases 2–4 committed on `main` as `feat(m17-wp4): remote status over the link …` (40 files). Full suite reused from the last-phase codify run (`Test scope: full — last phase`, EXIT=0, nothing changed since). Every staged blob was scanned for the real host/account identifiers: 0 hits. NOT pushed: `main` is 3 ahead of origin (`0244a44`, `de02657`, and the ship commit); push is the operator's call (public repo).

## Retrospect
- **What changed in our understanding:**
  - A remote close never ENDED the remote session. It relied on `/exit` landing within 0.5 s, so a busy CC outlived the close (R-1).
  - A respawn's `tmux new -A` attached to the session its own close was still ending.
  - Neither was visible until apply-now was driven live (P3.4a).
  - "Attached" is not "the terminal process spawned": an attach over a stale Up dies in milliseconds, so the overlay must wait for the attach to hold (P4.verify-self.F1).
  - The hook-install failure cannot be pushed as an event: the link comes Up during the picker's open check, before any workspace listens, so it is sticky on the link and read.
- **Assumptions that held:**
  - `(origin, cwd)` routing from the `ssh://` key with no IPC change.
  - The local `merge_claudesk_hooks` is reusable as-is for the remote file, and TC-2's distinct basename.
  - The tray folding the underlying state.
  - The overlay as a display field beside `attention`.
  - The live mini setup (scratch rows, the trust dialog aside) was a reliable verification surface.
- **Assumptions that were wrong:**
  - That apply-now could keep the conversation remotely without WP5 5.2: WP3 drops `--continue` for every remote spawn, and the transcript check was pulled into WP4 (operator decision).
  - That the screen could be captured for the tray: it never could this session.
  - That a single source guard over a prop set (`pipFanoutWiring`) would survive an added prop.
- **Approach delta:**
  - Phase 3 grew three in-phase pieces:
    - the R-1 close end + respawn wait;
    - WP5 5.2's transcript check;
    - a caller guard for the alias.
  - Phase 4 needed one F9b back-loop (attach confirmation).
  - The spec's emitter-seam rule was met only for the new link-edge emits; a fake PTY spawner driving the reconnect loop stays with WP5.
  - The review found 1 MAJOR (the quit-path freeze bound) introduced by the in-phase R-1 fix; backlogged.

**Feature complete:** M17 WP4 (status over the link) has shipped. A remote workspace's status dot now moves exactly like a local one on the filmstrip, PiP and tray, never confused with a local or another host's session, carrying the drive mode, and visibly "not connected" (dimmed + broken-link glyph + a "keys are not sent" strip) while its link is down. See it by opening a remote row in a build containing `82fc64f`. Requester = operator — closure notice for self-record.

**Tech debt (finalize §4):** the only debt is the review's 1 MAJOR + 6 MINOR, auto-backlogged under drive_mode=autopilot (`# m17-wp4-status-over-the-link` in `backlog-quality-findings.md`, routed to WP5 / a small task before it). No further debt was found, so the exit is F19 (the WBS still has WP5+ open). The MAJOR (the quit-path freeze bound) is the recommended next task.
