---
updated: 2026-11-17  # M17 CLOSED (/product-finalize): AS-BUILT record. WP8 acceptance on installed v0.9.0 folded in: the remote-Recycle respawn gap (§E), the picker label is a local-record prediction (§E), no per-host workflow-skills check (§G → M18), auto-resume confirmed live (§E).
---

# Remote workspaces (M17)

✅ **AS-BUILT (M17 closed 2026-11-17).** Designed at `/product-arch` (2026-11-14), built WP1–WP7, and accepted
on the installed v0.9.0 against the mini at WP8. Each section carries its WP's as-built notes; where a note
says "planned", the as-built note beside it wins. Evidence of record: `archive/milestone-17-remote-workspaces/`
(`wbs.md` incl. probe outcomes, `research.md`) and the WP archives in `workflow-system/state/archive/m17-*`.
**Known gaps at close:** remote Recycle never respawns CC (§E; fixed in M18 WP1); no per-host check that the workflow skills
exist (§G, → Milestone 18); remote profiles stay out (§C, → decided in M18).

A **remote workspace** is a picker row whose CC session runs on another Mac over SSH, inside a
tmux session that outlives Claudesk's connection. The left half is the same xterm pane, showing the
**remote** CC through tmux: its PTY runs `ssh` in place of `claude`, so **a remote workspace runs no
local CC at all** (operator, WP1 verify-human 2026-11-14). The right half carries only the **Prompt**
and (gated) **Docs** panels, with no terminal and no CC; every surface that needs a local working tree
is **absent** (vision Core Principle 7; prior `a-workspace-is-its-cc-session`). ⚠️ The WP1 probe's
screenshots show a *local* workspace with the remote command in its second terminal; that was the
probe's vehicle before WP3, not this layout.

## A. Data model and identity

- **`config_store::Project` gains `remote: Option<RemoteTarget>`**, where `RemoteTarget { host, path }`.
  - `host` is an ssh destination as the operator types it (`user@host` or a `~/.ssh/config` alias).
  - `path` is an absolute remote path.
  - **No separate `kind` field**: `remote.is_some()` *is* the kind, which keeps one source of truth.
  - `remote` and a non-default `profile` are **mutually exclusive**. The store rejects both on write, and the
    picker never offers it.
- ⚠️ **`prune_missing_projects` must exempt remote rows.** Today it deletes any row whose path doesn't
  exist locally, so a remote row would be **silently deleted on the next launch** (research Risk 1, the
  highest-severity item). The exemption goes in the pruner itself, not its caller, with a test that
  fails if the exemption is deleted.
- ✅ **AS-BUILT (WP2, 2026-11-16): a remote row's `project_path` IS its `remote_key`.** `remote` sits beside it, and `add_remote` (the only creator) enforces `path == remote_key(remote)`. Every path-keyed IPC (`remove_project`, `record_open`, the model / drive-mode setters, `touch_closed`, the unclean flag) therefore works for remote rows unchanged. The `remote_key` pass-through lives in `status_broadcaster::canonical_key` (the root `key_for` and `WorkspaceRegistry` delegate to), before any disk access: `Path::new("ssh://h/p")` is cwd-RELATIVE, so `canonicalize` could otherwise resolve it to a local `./ssh:/h/p`.
- **Identity key = `ssh://<host><path>`**, built by one function (`remote_key`). Every keyed store uses
  it: `WorkspaceRegistry` registration, the unclean-exit flag (it goes through `key_for()`, which must
  pass a remote key through unchanged rather than trying to canonicalize it locally), and the
  announce map. ⚠️ **Never key a remote workspace by its bare path.** `canonical_key` falls back to the
  raw string, so a bare `~/…` would collide with a local project at the same path.
- **Derived names** (all derived, none stored):
  - **tmux server:** `tmux -L claudesk` (prod) / `-L claudesk-dev` (dev), which isolates dev from prod and both
    from the operator's own tmux.
  - **tmux session name:** `cd-<first 8 hex of sha256(remote_key)>`.
  - **remote state dir:** `~/.claudesk/<identifier>/` (`identifier` = the running app's bundle id, the same
    single source of truth as `hook_install::commands::script_basename`).

## B. The host link: one SSH master per host

The probes showed that reverse forwards collide on reconnect, and that two workspaces forwarding the
same remote socket would collide *with each other*. So the forward belongs to the **host**, not to a
workspace.

- **New Rust module `remote_link`** owns one **ControlMaster** connection per host:
  `ssh -M -N -o ControlPersist=no -o BatchMode=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=3
  -o ExitOnForwardFailure=yes -S <ctl> -R <remote>/hook.sock:<local hook.sock> <host>`.
  - It runs on a **worker thread** with reconnect backoff. ⚠️ No ssh I/O ever runs in a sync
    `#[command]` (`sync_commands_do_not_block.rs`; P1 2026-08-25). Every remote exec is an `async`
    command or worker work.
  - **Before every connect, it runs `rm -f <remote>/hook.sock` over a one-shot exec.** This is the
    probed fix for the stale socket. It works even while a hung old connection still holds the
    listener, and needs **no sshd change**. Don't add a `StreamLocalBindUnlink` dependency: the
    client option is ignored (bug 2601, reproduced), and the server option would be a requirement on
    every host.
  - Link states: `Connecting → Up → Lost(retrying) → Up …`, or `Down` after the operator stops it.
    The state is broadcast to the frontend as a `remote-link` event.
- ⚠️ **ControlPath must fit macOS's 104-byte `sun_path`.** `<app_data>/ssh/<8-hex>` is about 75 bytes.
  ⚠️ `%C` (40 hex) in the app-data dir overflows at about 107 bytes, and ssh then rejects the spec as
  "Bad … specification" (probed). The local end of `-R` must contain a `/`, or ssh parses it as a host.
- **Terminals ride the master** (`ssh -S <ctl> -tt …`), and so do side-channel execs (0.14 s each, probed).
  A master drop kills all of them together, and the reconnect brings them back together. The mini
  allows `MaxSessions 10` per connection, which caps concurrent remote workspaces per host at about 8.
  The picker refuses a ninth with a clear message rather than failing in ssh.
- ✅ **WP3 as-built (2026-11-16, `7f96ce3`):** `remote_link` (`{mod,commands,tests}.rs`) exists as
  designed: a worker per host behind injectable `Transport`/`Master`/`Sink`, pre-connect deploying
  `tmux.conf` + the `cc-launch` launcher (option (b)) and printing `$HOME` behind a sentinel,
  `LinkHold` ref-counting (the last session's drop stops the link), `stop_all` in quit teardown
  (pinned by `tests/quit_teardown_stops_remote_links.rs`), `Drop` + `killpg` so no `ssh -M` outlives
  the app. A hard kill (SIGTERM, SIGKILL, a crash) runs none of that, so since paydown-2026-11-27 WP10
  the NEXT launch of the same app reaps the orphan: `reap_orphaned_masters`, called from
  `commands::init` before the registry exists, kills only `ppid == 1`, group-leading
  `/usr/bin/ssh -M` processes whose `-S` is under THIS app's `<app_data>/ssh/` (so dev and prod never
  reap each other's, and a master with a live parent is never touched). `run_worker` unpublishes
  `master_pid` (`forget_master`) once a master exits, times out or drops, so `halt` does not `killpg`
  a stale pid through the back-off.
  ⚠️ **`ssh -S <ctl> -o ControlMaster=no` silently connects DIRECTLY when the master socket is stale
  or gone** (Phase 5 verify-self: a reconnect raced the worker's 200 ms poll, read a stale Up, and
  re-attached over its own connection). So **terminals** carry `-o ProxyCommand=/usr/bin/false`
  (`NO_DIRECT_FALLBACK`): inert while the master lives (ProxyCommand only runs for a NEW connection),
  a fast 255 when it does not. **Side-channel execs keep the direct fallback on purpose** (short,
  `ConnectTimeout`-bounded). `LinkRegistry::wait_up` waits THROUGH failed attempts on the link's
  condvar (a session must ride out a drop), cancellable by a close. Known gaps (backlogged at
  review-quality): the open check's `ensure` takes no hold; `ensure` then `hold` is not atomic.

## C. Spawn: answering the seam questions (inbox Q2, vision Q5)

**The seam is `SessionRegistry::spawn`'s target, below `CcSession`, not a new trait impl.**
`PtyCcSession` already owns everything a remote terminal needs: a PTY, `send_input`, and `resize`
(SIGWINCH crosses ssh and tmux; probed 100×29 → 140×39). What differs is only *what the PTY runs*.

- **`SpawnTarget::{Local { cwd }, Remote { target }}`.** `build_cc_argv` is unchanged and becomes the
  **inner** argv.
  - **As built (paydown-2026-11-27 WP9):** `SessionRegistry::spawn` builds ONE `cc_argv` and dispatches
    on the target itself: `Local` → `PtyCcSession::spawn`, `Remote` → `RemoteCcSession::spawn_cc`. A remote
    open is one value, `RemoteOpen::{Start, Attach(SessionMode)}`, where `remote_cmd::SessionMode::{Unknown,
    NoMode, Mode(DriveMode)}` is the live session's stored spawn mode. A registered session's host is
    `RemoteExit::host`, stored once.
  - **Local** behaves exactly as today. The existing env-composition tests pin that it stays byte-identical.
  - **Remote** spawns `/usr/bin/ssh -S <ctl> -tt <host> -- <remote command>`, with a local cwd of
    `$HOME`. The remote command is (schematic; WP1 probed **each element** on the mini: the token in
    auth-2, the inline TUI in P2.2 (B), `unset TMUX` in P2.4, together inside a launcher script, but
    never as this one composed string; the exact quoting is WP2.4/WP3's, see the ⚠️ OPEN point below):

    ```
    zsh -lc 'exec tmux -L <srv> -f ~/.claudesk/<identifier>/tmux.conf \
      new -A -s <name> -c <path> "<inner command>"'

    <inner command> =
      export CLAUDE_CODE_OAUTH_TOKEN="$(cat ~/.claudesk/cc-oauth-token)";   # auth (§C.1)
      export CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1;                       # inline TUI (§I decision)
      unset TMUX;                                                          # truecolor (§C.1)
      exec env CLAUDESK_DRIVE_MODE=<mode> claude <argv…>                   # build_cc_argv's argv
    ```

    The conf (`status off`, `mouse on`, RGB; §C.1) replaces the old `\; set status off` suffix. `claude`
    is the binary the §H preflight resolved under `zsh -lc` (`~/.local/bin/claude` on the mini).
    `zsh -lc` is required because tmux isn't on the mini's non-login PATH (probed). `CLAUDESK_DRIVE_MODE`
    is omitted when the gate is off or no mode is set, exactly as locally. The value travels in the
    command line because **an arbitrary env var doesn't cross ssh**. Only `LANG`/`LC_*` do, through
    the client's default `SendEnv LANG LC_*` (probed WP1; §C.1). `CLAUDESK_DRIVE_MODE` is not one of them.
- ⚠️ **One shell-quoting function (`remote_cmd::quote`) builds every remote command string**,
  covering spawn, execs and reads. It is unit-tested against hostile inputs (spaces, quotes, `$`,
  backticks, newlines). It is the only defense against a path or mode string becoming remote code
  execution on a shared host. **Never build a remote command with `format!` outside it.**
- ⚠️ **OPEN for WP2.4 / WP3 spec: the quoting layers, and the one expansion that must survive.** The
  command crosses four interpreters: Claudesk's argv to `ssh` (no shell) → the remote login shell
  running `zsh -lc '…'` → tmux, which hands `<inner command>` to its default shell → that shell. Every
  **variable** value (path, session name, drive mode, argv) is quoted by `remote_cmd::quote` for each
  layer it crosses. But the token export's `$(cat …)` must **expand**, in the innermost shell, so it
  cannot pass through a `$`-neutralising `quote` unchanged. That contradicts the rule above as
  written. WP3 resolves it at spec with one of:
  - **(a)** the auth/inline/`TMUX` lines are a **compile-time constant** fragment inside `remote_cmd`
    (no variable data in it), escaped for the **outer** layers only (`zsh -lc '…'`, tmux's `"…"`) so
    that its `$(…)` survives to the innermost shell, while every variable value still goes through
    `quote`. The rule is then restated as "no *variable* value enters a remote command outside
    `quote`"; or
  - **(b)** a **deployed launcher script**, `~/.claudesk/<identifier>/cc-launch` (WP4 already deploys
    the hook script to that directory), does the exports and `unset TMUX` and then
    `exec claude "$@"`. The tmux command then contains no expansion at all, and every part of it is
    quoted. The probe's runs used such a launcher (`~/.claudesk-probe/cc.sh`; its contents are in the
    WIP's Phase 2 raw readings). That is evidence the mechanism works, not a ruling between (a) and (b).

  Either way a test pins it: a hostile path or mode string never executes, and the token is never
  present in the command string.

  ✅ **WP2 as-built (2026-11-16):** `remote_cmd` exists. Its module doc restates the rule as **"no *variable* value enters a remote command outside `quote`"**, which makes option (a)'s constant fragments legal. The preflight already uses one (`AUTH_CHECK`, whose `$(cat …)` expands only remotely). **WP2's recommendation for WP3 is (b), a deployed launcher**, because 3.7 already deploys `tmux.conf` to the same directory. That leaves no expansion in the spawn string, and the "token never in the command string" test becomes trivial. The (a)/(b) choice stays WP3's.
- **`new -A` means attach-if-exists.** When the tmux session is live, the inner command and its env are
  ignored, which is the reconnect (R-2). When CC exits, its tmux session ends, so a later `new -A`
  starts fresh with the argv the resume rule chose.
- **The `CcSession` trait gains one method, `detach()`.** Its default impl returns `Unsupported`, so the local
  impl is unchanged. On remote it SIGHUPs the local ssh **without** typing `/exit`. `kill()` keeps its
  local behaviour, but **the remote close path first runs `send-keys -X cancel` over the master**, so
  the `/exit\r` it types is never swallowed by tmux copy-mode (§C.1, §E, R-1).
- **Profiles stay local-only** (`CLAUDE_CONFIG_DIR` names a local directory). A remote workspace runs
  under the remote's default `~/.claude`.

### C.1 Terminal facts from the WP1 probe (PROBED 2026-11-14, Phases 1–2; mini tmux 3.8, CC 2.1.325)

Measured in a real Claudesk xterm.js pane (the second terminal, same `XtermPane` and
`color_tty_env` as the CC spawn) running the planned remote command. Raw readings:
`workflow-system/state/wip/m17-wp1-remote-terminal-probe.md` → "Probe evidence".

- ⚠️ **`-L claudesk` isolates the socket, NOT the config.** The tmux server still reads
  `~/.tmux.conf` (absent on the mini today). **WP3 passes `-f <claudesk conf>`** so an operator's
  future `~/.tmux.conf` can't change Claudesk's sessions. The conf is deployed next to the hook
  script (`~/.claudesk/<identifier>/tmux.conf`, §D), so dev and prod stay distinct.
- ⚠️ **This tmux defaults `mouse on`** (no conf file, `show -g mouse` → on). Don't assume tmux's
  documented default; the conf sets it explicitly either way.
- **Truecolor needs `set -as terminal-features ',xterm*:RGB'`.** Without it tmux down-converts
  `38;2;255;100;0` to palette 202 (measured from the xterm cell); with it the cell is RGB `ff6400`.
  `TERM` inside the pane is `tmux-256color`. ⚠️ `COLORTERM=truecolor` inside the pane is **set by
  tmux itself** (present even with `-f /dev/null` and no client `COLORTERM`), so it is **no evidence**
  that truecolor renders: only the RGB feature makes it render. `LANG`/`LC_ALL` (UTF-8) cross ssh
  through the main box's default `SendEnv LANG LC_*`. CC's glyphs (`⏺ ✻ ⎿ ─ │ ❯`) round-trip
  byte-exact.
- **`status off`** in the conf: the tmux pane is exactly the xterm size (62×141 = 62×141).
- **Bracketed paste survives tmux only when the pane app has enabled `?2004h`.** With it, the
  `stagedPayload.ts` envelope reaches the app intact. Without it, tmux **strips the envelope** and
  each interior `\r` becomes an Enter. CC enables it at startup, so this bites only an injection sent
  **before CC is up** (a multi-line send would split into several submits).
  ⚠️ **`cc_ready` does NOT solve this; do not lean on it.** `cc_ready` is Claudesk's own
  frontend-listener handshake, not a CC-readiness signal: firing an injection at `cc_ready` was
  measured NOT-EXECUTED 5/5 (`autoResumeFire.ts` header; SURFACE-2026-08-04-CC-READY-NAME-INVITES-
  MISREADING-AS-CC-READINESS). **Nothing in Claudesk today holds a Prompt-panel send until CC has
  enabled `?2004h`.** Locally that is harmless (the raw envelope reaches CC either way); on a remote
  pane it splits the send. **WP3 must pick a real readiness signal** for remote multi-line
  injections (candidates to probe: the session's first hook event over the link, or an observed
  `?2004h` in the output stream, which is a mode toggle, not text parsing for state) and test it: a
  multi-line send during startup arrives as one turn.
- **Latency (RE-MEASURED 2026-11-16, M17 WP3 Phase 4, the real inner command: launcher, token,
  inline, yolo; trusted folder; Mac↔mini clock offset measured ≈0 ±10 ms):**
  - **Cold** (no master, no tmux server; picker click in the dev app → the pane's
    `#{bracket_paste_flag}` = 1, i.e. CC ready for a multi-line send): **1.24 / 1.22 / 1.20 s**. Of
    that, click → tmux session exists is **0.77 / 0.78 / 0.76 s** (open check + master connect +
    deploy + spawn); tmux → CC ready is ~0.45 s.
  - **Warm master** (the app's live master; the same inner command under a throwaway session name →
    flag = 1; poll granularity ≈ one master exec): **0.33 / 0.47 / 0.54 s**.
  - Vision Metric 7's open-time input (operator-accepted), well inside Metric 1's <10 s.
  - *Superseded:* WP1's default-mode figures (to CC's prompt, cold 1.30 s / warm 0.55 s; to
    tmux-ready, cold 1.0 s / warm 0.26 s), measured before the token export,
    `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN` and `unset TMUX` joined the inner command.
- ✅ **R-1 mechanism PROBED (Phase 2): `/exit\r` ends it all.** Typed into the pane, `/exit\r` ended CC
  (no remote `claude` left), the tmux session (`has-session` → 1) and server, and the outer `ssh`
  returned the local prompt. That is exactly what `PtyCcSession::kill()` types. `/exit\n` alone does
  **not** submit (it lands in the input box), as `cc-tui-cr-not-lf` says.
  ⚠️ **But NOT when the pane is scrolled up (inline mode):** `/exit\r` typed while tmux is in
  copy-mode is **swallowed** (verify-self re-run on real CC: the session and CC stayed up, and nothing
  reached the transcript). `kill()` would then SIGHUP the local group, which drops only the ssh and
  **leaves the remote session running**, breaking R-1. **The remote close path must run
  `send-keys -X cancel` over the master before typing `/exit\r`**, the same mandatory step §I sets for
  every Claudesk injection. In fullscreen mode (§I (A)) tmux never enters copy-mode, so the trap
  doesn't arise there. WP3/WP5 test: close a remote workspace while it is scrolled up → the remote
  session is gone.
- ✅ **A multi-line Prompt-panel send is ONE turn on real CC.** The real `stagedPayload` bytes
  (envelope + `\r`) produced exactly one user message in the remote transcript, containing all three
  lines joined by `\n`.
- ⚠️ **CC emits only 256 colours while `TMUX` is set.** Even with `COLORTERM=truecolor` and tmux
  advertising RGB, CC sent `38;5;…`. `FORCE_COLOR=3`, `TERM=xterm-256color` and unsetting
  `TERM_PROGRAM` changed nothing; **`unset TMUX` alone** gave `38;2;…` and RGB xterm cells. **The
  remote inner command unsets `TMUX` before `exec claude`.** That is safe because tmux itself
  advertises RGB under the conf. Side effect: CC's own commands can't see they're inside tmux,
  which is harmless here.
- ⚠️ **A fresh host boots CC's fullscreen TUI** (no `tui` key in the host's `~/.claude/settings.json`;
  CC 2.1.325 then enters the alternate screen even outside tmux). The operator's local CC is inline
  (`"tui": "default"`). This decides where history lives; see §I's scrollback note and the decision
  recorded there.
- **First open on a fresh host shows two CC dialogs:** folder trust, then (with Claudesk's yolo
  argv) the Bypass Permissions warning. They are WP5 inputs (remote `folder_trusted`; accepting the
  yolo warning is the operator's act on a shared host, never Claudesk's). ✅ **The operator accepted it
  on the mini (2026-11-14); it persists per account as `"skipDangerousModePermissionPrompt": true` in
  the host's `~/.claude/settings.json`** (not `~/.claude.json`). A yolo start in a trusted folder then
  goes straight to the prompt (status line `⏵⏵ bypass permissions on (shift+tab to cycle)`). ⚠️ **WP4's
  hook-install merge writes that same file and must preserve this key** (and `theme`). The folder-trust
  dialog still appears once per untrusted folder (`~` is untrusted on the mini). §H preflight / WP5
  must say so in plain words, or answer it as part of adding the project.
  ✅ **M18 WP2 as-built (2026-11-18):** on an account that has NOT accepted it, the auto-resume and Recycle
  withhold `/session-restore` instead of answering the warning "No, exit". The open check reads the remote
  `~/.claude/settings.json` key (`remote_cmd::BYPASS_ACCEPTED`), and the workspace toast says so with the fix
  (`session-resumption.md` → "The inject arm withholds…").
- **Scrollback: no candidate gives full local parity.** §I has the measured trade-off. The **chosen**
  config is C + RGB (`mouse on`, alt-screen) with a mandatory `send-keys -X cancel` before every
  Claudesk injection. E is retired (operator, 2026-11-14).
- ⚠️ **Remote CC auth: the macOS Keychain is unreadable over ssh, so the remote spawn loads a token
  (PROBED + operator decision, 2026-11-14).** CC keeps its OAuth login in the login Keychain. After a
  login over `ssh -t` the `Claude Code-credentials` item exists, but `claude auth status` reports
  `loggedIn: false` from a plain exec, from `ssh -tt`, and inside `tmux -L claudesk` (the Keychain is
  locked to ssh sessions: "User interaction is not allowed"). **Decision (operator): a long-lived
  `claude setup-token` OAuth token in `~/.claudesk/cc-oauth-token` on the host (0600, owner-only),
  one per host, shared by dev and prod.** The tmux inner command exports it on the remote side,
  `export CLAUDE_CODE_OAUTH_TOKEN="$(cat ~/.claudesk/cc-oauth-token)"`, before `exec claude …`.
  Measured: `authMethod: oauth_token`, and a real `-p` turn answered both under `ssh -tt` and inside
  tmux. ⚠️ The token is read **on the remote**: it never appears in Claudesk's argv, a local `ps`, the
  spawn command string (which carries only the literal `$(cat …)`), or a log. Claudesk never reads,
  writes or transports it. Rotating it is the operator re-running `setup-token` (~1-year validity).
  Missing or expired → §H preflight and the open path say so in plain words.
- **WP3's conf (ratified 2026-11-14):** `set -g status off`, `set -g mouse on`,
  `set -as terminal-features ',xterm*:RGB'` (the probe's `d.conf`), loaded with `-f`.
  ✅ **M18 WP2.5 as-built (2026-11-18):** the conf is now `status off`, `mouse on`,
  `set -s terminal-features[100] 'xterm*:RGB'` (a FIXED index, so it is safe to re-source) and
  `set -g set-clipboard on`. The pre-connect script sources the fresh conf into this build's running
  `-L` server, because a running server never re-reads `-f`. ⚠️ It does so under `login_shell` (`zsh -lc`), because tmux is
  not on the non-login PATH a plain ssh exec gets. The first version checked that PATH and skipped silently (P2.vs.1). Why each line is there: §I → "Copying from a remote pane".
- **WP3's remote inner command** is the one in §C's code block (token export, inline TUI,
  `unset TMUX`, then `exec claude`), each element probed (auth-2, P2.2 B, P2.4). How the token's `$(cat …)` coexists with
  `remote_cmd::quote` is §C's ⚠️ OPEN point.

## D. Hook channel and drive mode (vision Q3)

- **The same Perl script, deployed unchanged** to `~/.claudesk/<identifier>/claudesk-remote-hook[-dev].pl`
  on the remote (⚠️ corrected at WP4 from `claudesk-hook[-dev].pl`: the merge adopts any group whose
  basename matches EXACTLY, so the local name would rewrite a local Claudesk's own group on a host that
  runs one, and the two installs would flip-flop each launch; `hook_install::commands::remote_script_basename`). The mini has `/usr/bin/perl`. The script already exits 0 on every degraded path (no socket,
  bad stdin), so a down link or a dev/prod twin never blocks CC there either.
- **Registration in the remote `~/.claude/settings.json`** reuses `hook_install`'s merge logic. The file
  is read with `cat`, the merge runs **locally**, and the result is written back atomically (`cat > tmp && mv`).
  ⚠️ **The mini's file EXISTS** (it was absent at research; CC created it at the operator's login, and
  it now holds `theme` and `skipDangerousModePermissionPrompt: true`, §C.1). The merge **must preserve
  every key it didn't write**; never a create-or-overwrite path, which would silently undo the
  operator's yolo acceptance on a shared host. Test: a fixture holding both keys survives the merge
  unchanged except for Claudesk's hook entries. The registered command is
  `CLAUDESK_HOOK_SOCK=<remote>/hook.sock CLAUDESK_ORIGIN=<8-hex host key> /usr/bin/perl <script>`.
  ⚠️ **Provenance holds remotely too:** only remove a hook Claudesk recorded installing, matched by exact
  basename. Never delete one it didn't install.
- **One wire-format addition: an optional `origin` field**, emitted only when `CLAUDESK_ORIGIN` is set.
  Local output stays **byte-identical**, and `tests/hook_pl_output.rs` keeps pinning the local form
  while gaining a remote case. `WorkspaceRegistry::resolve` matches on **(origin, cwd)**. Local events
  have no origin and match only local workspaces, so a remote cwd can never land on a local tile, or
  the reverse.
- **The remote hook is machine-global on a shared host.** Events from CC sessions Claudesk didn't start
  arrive with an origin but no matching workspace, and status drops them. ⚠️ **`time_store` must refuse
  any event that carries an origin** (time analytics for remote is OUT). The filter goes at the
  ingestion point, with a test.
- **As built (M17 WP4, Phases 2–3):**
  - **Wire:** the hook adds `origin` only when `CLAUDESK_ORIGIN` is non-empty, and a remote invocation never
    appends the `HOOK write-failed` trace (a machine-global host with no forward would grow that log
    without bound). `HookEvent.origin` reads `""` as absent.
  - **Origin:** `remote_cmd::hook_origin(host)` = `hash8(host)`, the ControlPath's value.
  - **Routing:** `WorkspaceRegistry` derives a `Route` per key (`Local`, `Remote { origin, path }` from
    `config_store::split_remote_key`) and `resolve(origin, cwd)` matches only within the event's scope. A
    remote cwd is never canonicalized locally. The close path looks a row up by its exact key
    (`workspace_id_for`).
  - **Symlinked rows:** a stored path that reaches the folder through a symlink gets its physical path
    (`cd -P && pwd -P` over the master, at each remote spawn) recorded as an alias, which the registry
    matches too. Each spawn's answer REPLACES the alias: no answer (no symlink, or a failed exec)
    removes it, and `deregister` drops it (paydown-2026-11-27 WP10).
  - **The install runs on the link worker**, after the master answers and BEFORE the link reports Up, so
    any `ensure_and_hold` caller sees its result. It fetches over the master (`READ_SETTINGS`), merges
    locally, and writes back only on change (`WRITE_SETTINGS`: the content on stdin, `cp -p` so the mode
    survives, then `mv`).
  - **A failed install never fails the link.** A malformed or wrong-shaped file is never written, and
    the plain-words reason stays on the link (`LinkRegistry::hook_warning`). The remote workspace reads
    it (`remote_hook_warning`) once its spawn resolves and shows it as an ERROR row in its notices (paydown-2026-11-27 WP8: its own row, never joined with the open notice; deduped across respawns, and a dismissed warning stays dismissed for the workspace's life). ⚠️ It is READ, not
    pushed: the link usually comes Up during the picker's open check, before any workspace exists to
    listen, and a notice written into the pane is wiped by tmux's first redraw.
  - Like the local install, the rewrite re-serializes the file: values are preserved, but key ORDER
    follows `serde_json`'s map (sorted).
  - The read-merge-write is not atomic against CC writing the same file within that one round trip;
    accepted (TC-6).
  - **`--continue` on a remote spawn** (pulled from WP5 5.2 at WP4): before the session-registry lock,
    `cc_spawn_remote` asks the remote whether `~/.claude/projects/<slug of the PHYSICAL path>/` holds a
    `*.jsonl` (`find`, one exec). `RemoteSpawn::has_transcript` is the guard's answer. A turn-level
    respawn (drive-mode apply, Recycle) and an unclean-flag reopen now resume remotely, as they do
    locally. A failed exec reads as "no": a fresh session is the safe side.
- **An explicit close ENDS the remote session (R-1, made true at WP4).** After the terminal's `/exit`,
  `RemoteCcSession::kill` runs `remote_cmd::tmux_end_session_command`: wait up to 5 s for CC to exit,
  then `kill-session`. Before this, a CC busy past the 0.5 s `/exit` window kept running in tmux after
  the close. While a close is in flight, its tmux session name is marked on the link registry
  (`begin_close`), and `cc_spawn_remote` waits for it (`wait_not_closing`, 20 s). Without that, a
  respawn (`cc_kill` is fire-and-forget) ran `new -A` and ATTACHED to the dying session. Both were
  found live at WP4 P3.4.
  - ⚠️ **The close's remote calls run only on an Up link, and only over its master** (post-WP4
    task, 2026-11-16). The copy-mode cancel and the end go through `LinkRegistry::close_exec`. With
    the link Lost/Connecting/absent it sends NOTHING and returns `CloseExecError::LinkNotUp` at once,
    and the remote session keeps running (the end-intent is WP5's R-4). With a stale Up it rides
    `master_only_exec_argv` (`NO_DIRECT_FALLBACK`) and fails fast, never connecting directly. Why:
    the sync `quit_now` joins every kill on the main thread, and a link-down quit had frozen the UI
    for up to ~27 s. The remaining bound (master alive, network gone, until keep-alive) is in the
    `quit_now` LEDGER.
- **Drive mode** arrives on the remote CC as `CLAUDESK_DRIVE_MODE` in the spawn command line, and the
  script prints the same `additionalContext` line it prints locally. It is fixed at spawn, as locally. A
  picker change takes effect at the next spawn. A **reconnect keeps the session's original mode**, and
  the picker row has to say so rather than imply the new mode is live.

## E. Lifecycle: R-1–R-4 mapped onto the machine

✅ **WP3 as-built (2026-11-16, `7f96ce3`) — reconnect:** a remote CC session is a `RemoteCcSession`
(one session id, output event, last size and `LinkHold`) over a replaceable `ssh -tt` terminal. When
the terminal's ssh ends, `classify_inner_exit(killed, code, link_up)` decides: a close → Ended; exit
255 or a link not Up → **Reconnect**; anything else (CC `/exit`ed, or the session was gone at
attach) → Ended (`cc-exit-<id>`, once-latched). Reconnect re-attaches with **`tmux attach -t =<name>`,
never `new -A`** (a session that died while disconnected is never silently restarted), in the SAME
xterm with CC's state intact (live: an unsubmitted word survived a master SIGKILL). Back-off: a NEW
drop retries at once; a re-attach that dies within 10 s backs off 2→30 s. The pane shows one dim
`[Claudesk: connection to <host> lost, reconnecting…]` line per drop (operator decision A,
2026-11-16), as Claudesk's own bytes, never parsed back. A close during Reconnecting cancels the wait
and touches nothing remote (the session keeps running: its end-intent is WP5's). Typed keys during
Reconnecting are dropped (WP4's overlay should say so); Claudesk's own injections refuse with a toast.
⚠️ **Injections (Phase 4):** every Claudesk-originated injection goes through `cc_inject`, which for
a remote pane runs ONE exec: cancel copy-mode, poll the pane's `#{bracket_paste_flag}` (≤ 15 s; the
client-side `?2004h` is NOT a readiness signal, tmux sends it on every attach), cancel again. A
refusal shows the operator a plain-words toast (operator decision A): Prompt panel, skill buttons,
and Recycle (a refused handoff stops at once, nothing changed; a refused restore says to run it).

⚠️ **Reconnect ≠ resume** (operator vocabulary, 2026-11-14; `roadmap.md` → M17). **Reconnect** = the
session is alive on the remote, so attach to it and fire nothing. **Resume** = the session already
`/exit`ed, so connect and run the two-signal rule (`--continue` / `/session-restore`) against the
remote. Code, UI copy and tests use these two words for these two cases only.

| Event | Kind | What happens | Rule |
|---|---|---|---|
| Close workspace (link up) | explicit | **`send-keys -X cancel` over the master first** (a scrolled-up pane would swallow `/exit`; §C.1), then the existing `kill()` types `/exit` → CC ends → tmux session ends → the clean-exit route clears the unclean flag | R-1 |
| Quit / self-update relaunch (link up) | explicit | the same cancel-then-`kill()` for every remote workspace, then the quit continues | R-1 |
| ⏸ "Close, resume later" (`onPauseClose`, link up) | explicit | the same cancel-then-`kill()` (`/exit` → CC and tmux end), but the unclean flag is **left set**, as it is locally, so the next open **resumes** with `--continue` on the remote | R-1 |
| Recycle | explicit | the existing flow: handoff → composite marker (remote poll + `Stop` hook) → cancel-then-`kill()` → respawn → `/session-restore`; every injection in it (the handoff command, `/session-restore`) also goes through the cancel-before-inject funnel | R-1 |
|  |  | ✅ **FIXED (M18 WP1, 2026-11-18).** The WP8 failure was a RECONNECT-door workspace: `open_intent` lives as long as the workspace, the relaunch re-sent `reconnect`, and `cc_spawn_remote` turned that into `tmux attach` to the session Recycle's own `/exit` had just ended, so no CC started (the prod status log showed ws-4 registered with no `SessionStart`, i.e. a reattach). **Rule:** the door is spent by the pane's first committed spawn (`XtermPane`'s `doorUsedRef`, never cleared by a relaunch). Every later spawn sends `relaunchIntent(door)` (`reconnect` → `fire`), so Recycle's respawn and the Relaunch / Retry button get a plain `new -A`. ⚠️ The backend rule `Reconnect → attach, never new -A` is unchanged and correct. Pinned by `remoteRelaunchIntentLive.test.tsx` (the real pane) + `spawnArgs.test.ts`. |  |
| Claudesk crash, link lost, host unreachable | passive | the local ssh dies; tmux and CC keep running; the link retries with backoff and reconnects every workspace on that host | R-2 |
| Detach (⇥ on the remote tile) | deliberate | **as built (WP5):** `cc_detach` → `RemoteCcSession::detach` hangs up the local `ssh` WITHOUT `/exit` (no copy-mode cancel, no end, no record write), then the tile closes (unclean: the flag stays). No Detached tile (operator ruling); the record stays `running`, so the next open labels **Reconnect** and attaches. Works with the link down | R-3 |
| Reopen from the picker | — | **as built (WP5):** ONE open-check exec over the master (folder, live, its `@cd_mode`, physical path, gated remote `.session.md`, the remote CC's trusted keys) + Claudesk's LOCAL session record (`remote_record`: running / ended / end-pending) decide: live + `running` → **attach** (beats both resume signals; registers the session's original mode); live + `end-pending` → dialog A; live + no/ended record → dialog B; dead → the two-signal rule from the remote signals (an untrusted folder, or since M18 WP2 a bypass-mode spawn on an account that never accepted CC's bypass warning, withholds `/session-restore` with a workspace toast) | R-2 |
|  |  | ⚠️ **The picker label is a LOCAL prediction** (seen live at WP8): listing the picker does not probe the host, so a remote row's label comes from `remote_record`. After a crash while detached it still reads **↻ reconnect**; the open check then decides (`--continue`) and says so in the AC-2.3 notice, an INFO row (neutral, `role="status"`) since paydown-2026-11-27 WP8, because nothing failed. The auto-resume withheld notices are INFO too. |  |
| ~~Close a detached workspace~~ | — | **dropped at WP5:** there is no detached tile | — |
| Quit or close **while the link is down** | unclear at the next open | **as built (WP5):** the end can't be delivered → the record goes `end-pending` (writes serialized: the quit's parallel kills must not lose one) and a close tells the app (`remote-close-not-ended` → app toast, naming the project and the cause: `reason` is `unreachable` (link not Up) or `failed` (the end ran and failed); paydown-2026-11-27 WP8). At the next open, live + `end-pending` → **dialog A** (End it and open [default] / Reconnect / Cancel); dead → the stale intent is cleared and the open resumes without asking | R-4 |
| Host unreachable at open | unclear | **as built (WP5):** a toast in plain words with **Retry** (re-runs the same check and door); never Remove, never a fallback | R-4 |
| A live `cd-*` session with no Claudesk record (e.g. after its row was removed) | unclear | **dialog B** at open: Reconnect [default] / End it and start fresh / Cancel (End = `remote_end_session`, then the normal open decision) | R-4 |

- ⚠️ **Every Claudesk-originated injection on a remote workspace goes through ONE funnel that runs
  `send-keys -X cancel` first**: skill buttons, the Prompt panel, auto-resume's `/session-restore`,
  Recycle's commands, and the close path's `/exit`. It is a single function, like `remote_cmd::quote`,
  so a new injection site can't forget it (WP3 owns it; a guard asserts every remote `cc_input` path
  goes through it). ⚠️ **Only the scrolled-up case was probed.** In the normal case (not in copy-mode)
  tmux likely rejects `send-keys -X cancel` with "not in a mode" and a non-zero exit (unprobed). The
  funnel must not treat that as failure: cancel only when `#{pane_in_mode}` is 1 (e.g.
  `if -F '#{pane_in_mode}' 'send -X cancel'`), or tolerate that exit. WP3 probes both cases.
- ⚠️ **Auto-resume's fixed settle delay needs re-measuring for remote.** `/session-restore` fires
  `INJECT_SETTLE_MS` (1500 ms) after `cc_ready` (`autoResumeFire.ts`), about 4× the local flake point.
  Remote cold CC-ready re-measured at WP3 Phase 4 with the real inner command: **1.20–1.24 s from
  the picker click** (§C.1), so the fixed delay alone has little margin. ⚠️ **Partly superseded by
  WP3 Phase 4 (as built, not yet re-verified for this path):** auto-resume injects through
  `injectCommand` → `cc_inject`, which for a remote session waits (≤ 15 s) for the pane's
  `#{bracket_paste_flag}` before writing, so a cold remote `/session-restore` should no longer land
  before CC listens. WP5 confirms this live on the auto-resume path, then decides whether the
  settle delay is still needed for remote. ✅ **Confirmed live at WP8 (installed v0.9.0):** a real `/session-restore` auto-fired on two
  remote reopens, landed, and consumed `.session.md` both times.
- **The unclean flag is unchanged.** It is set on open and cleared only by an explicit clean route. A passive
  drop leaves it set, which is correct: if the remote session later dies too (the remote reboots),
  reopening falls to `--continue`.
- **Status while the terminal isn't attached is a display overlay, not a fifth state** (as built at M17 WP4).
  This is the same pattern as `attention`, but a separate field: `WorkspaceStatusUpdate::link`
  (`LinkOverlay { status: reconnecting, host }`; WP4's reserved `detached` was removed at WP5: a Detach closes the tile, so there is no detached tile to mark).
  - **When it is set:** while a remote session's terminal is NOT ATTACHED, i.e. its link is `Lost` OR a
    re-attach is pending over an Up link.
  - **Producer:** the session's own edges, reported through an injected `LinkEdgeSink`
    (`apply_link_edge` → `WorkspaceRegistry::set_link_overlay`), on the one `workspace-status` stream:
    Lost in `on_inner_exit`'s Reconnect arm, Attached in `reconnect`, Ended in `emit_exit`. A hook
    event during a pending re-attach keeps it (the drain stamps it, `drain_step`). Every emit goes through
    `emit_settled` (paydown-2026-11-27 WP10), so a drain update and an edge emitted in the opposite order
    to the one they decided in still END on the registry's current view: no stale dimmed tile after
    `Attached`, no Unknown after a newer hook event.
  - **Surfaces:** the filmstrip tile and PiP row show the last state's hue, dimmed, plus a
    broken-link glyph and the tooltip "Not connected to <host>: reconnecting"
    (`WorkspaceStatusIndicator`'s `link`). The pane shows a strip, "Keys you type are not sent".
  - **Tray:** ⚠️ corrected from "tray menu row": the tray has no per-workspace rows (a 2-state alarm,
    M7). `display_state` IGNORES the overlay, so the tray folds the UNDERLYING state, and a lost
    session awaiting input keeps the alarm lit.
  - **Guards:** `state` keeps the underlying value, and the close/quit and respawn guards keep reading
    `state`. It shows with the workflow gate OFF too (remote status is core).
  - **After a re-attach** the workspace reads `Unknown` until the next hook event: events missed while
    unattached are not replayed or guessed (`Unknown` is honest).

## F. Remote reads and watches (vision Q4)

- **New module `remote_fs`**: async, read-only, over the host's master. `remote_stat`, `remote_read`,
  `remote_exists`, and `remote_list_dir`. Every path is resolved under `RemoteTarget.path` and rejects
  `..` and absolute escapes **before** quoting. This is the remote equivalent of `validate_root`.
  Claudesk still never writes into `workflow-system/`. The complete list of remote writes: under
  `~/.claudesk/<identifier>/`, the hook script, the tmux conf (WBS 3.7) and, if §C's option (b) is
  chosen, the `cc-launch` script; plus the hook registration merged into `~/.claude/settings.json`.
  The token file `~/.claudesk/cc-oauth-token` is the operator's, and Claudesk never writes it.
- **A poller replaces `notify` for remote workspaces.** It polls `stat` on a fixed set every 1.5 s: the docs set,
  `workflow-system/state/.session.md`, and the WIP dir listing. Changes go out as the **same
  `fs-change` event shape**, so the docs reload and Recycle's `.session.md` wait work unchanged.
  It runs no remote process and needs no `fswatch` (absent on the mini) and no FUSE on the main box.
- **Every local-filesystem decision the seam map found is routed by target** (research Finding 5). Each
  is a single dispatch at the function that decides, never at its callers:
  - `announce::has_session_md`
  - `transcript::has_any_transcript`, used by `guard_continue_against_transcripts`. ⚠️ Read locally, it would
    **silently drop `--continue`**. The remote transcript slug follows the same rule against the
    *remote* realpath, resolved with a remote `cd -P && pwd`.
  - `folder_trusted` (the remote `~/.claude.json`)
  - `bypass_dialog_cleared` (the remote `~/.claude/settings.json`; M18 WP2, read in the same open-check exec)
  - `docs::discover` / `docs_read`
  - Recycle's mtime baseline

**As built (WP7, 2026-11-17, `4b0a532` + review fix `5eede6a`).** Where this differs from the plan above, this wins:
- **`remote_fs`** (`src-tauri/src/remote_fs/`): `list_docs` / `read_doc` / `stat_doc`, no general `exists` / `list_dir`. `validate_rel` rejects `..`, absolute, empty and unframeable (NUL, newline) paths LOCALLY, before any command string; the remote Perl script (`remote_cmd::DOC_LIST_PROG` / `DOC_READ_PROG`, `Time::HiRes` for ms mtimes) then `realpath`s root and target ON THE REMOTE and refuses anything outside, so an in-project symlink pointing out is refused as locally. The read cap is `REMOTE_READ_MAX_BYTES` = 3 MiB (stdout is capped at 4 MiB), with the local error words. Every exec is `LinkRegistry::master_exec`: Up-only, master-only (`NO_DIRECT_FALLBACK`), and a dead master (255) or a timeout reads as `LINK_DOWN` = "The remote host isn't reachable right now."
- **Routing:** `docs_list` / `docs_read` / the new `docs_stat` are async and dispatch by root kind in ONE function, `docs::commands::serve` (they are `ROUTED` in `tests/remote_refusal_is_first.rs`). The remote list feeds the same curated rules as local `discover` through `docs::filter_listing`, tied to `discover` by `filter_listing_agrees_with_discover`. Recycle's baseline uses `docs_stat` for both kinds (local = `stat_file_core`, pinned by `local_docs_stat_is_stat_files_answer_with_no_exec`); `stat_file` stays an editor command, refused on remote. `workspaceSurfaces` lost its `docsRead` flag.
- **The poller** (`remote_fs/poller.rs`): ⚠️ **5 s, not 1.5 s** (operator, spec review), and ⚠️ **ACTIVE ONLY** (operator, P3.verify-human.2; prior `background-work-only-for-what-is-on-screen`): a workspace is polled only while it is centre stage AND its Docs tab is fronted. One worker per host; each tick reads the gate and the link first, then runs ONE batched `doc_list_command` over every ACTIVE root (so ≤1 in-flight exec per host), diffs each workspace's curated docs set (mtime + size) and emits the existing `fs-change`. A paused workspace keeps its snapshot. `remote_poll_start` / `remote_poll_stop` (from `useWorkspaceStatus`, where a local workspace calls the watcher) subscribe PAUSED and unsubscribe; `remote_poll_catch_up` (async) / `remote_poll_pause` come from `DocsPanel` going on / off screen (`docs/remoteDocsCatchUp.ts`). A catch-up wakes the worker and answers that workspace's tick outcome; a RETURN (not the opening show) is announced in the workspace toast: "Checking the remote docs for changes…" → "Remote docs checked: no changes / N docs changed." (clears after 4 s) or "Couldn't check the remote docs: …" (stays). ⚠️ `subscribe` is idempotent for the same (workspace, target): the panel's catch-up can land before `remote_poll_start` (review CRITICAL, fixed). ⚠️ `pause` DROPS the workspace's waiting catch-ups, and the panel treats a catch-up whose Docs left the screen before it answered as stale (no result toast; its "checking…" is cleared). The workspace's notices are a LIST since paydown-2026-11-27 WP8 (`workspaceToasts.ts`, one reducer; each row has its own kind and ×). A docs notice owns only its own row: a new one replaces that row (with a fresh id, so its auto-dismiss restarts), and its `null` clears only that row (review MAJORs, fixed; rows from other writers are never touched). The worker waits before each tick. The quit drops every subscription before `links.stop_all()`; workers are detached, never joined.
- **Recycle on remote:** the poller may be paused, so a remote `Stop` first forces ONE `docs_stat` of `.session.md` and feeds any write BEFORE the `Stop` (`recycleSession.awaitCompletion`); local feeds the `Stop` directly. Verified end to end on the mini with Docs fronted and with Prompt fronted (0 poll execs). ⚠️ Only this detection half is verified: the respawn half fails on remote (see §E's Recycle row).
- ⚠️ **Not built here, open:** the remote ACCOUNT may lack the workflow skills (the mini's dev account has none), and nothing checks it: `SURFACE-2026-11-17-REMOTE-HOST-WITHOUT-WORKFLOW-SKILLS-MAKES-WORKFLOW-BUTTONS-DEAD`. The other seam-map items above (`announce::has_session_md`, the transcript guard, `folder_trusted`) were routed at WP4/WP5.

## G. Surface applicability (vision Q6, inbox Q3)

- **New single funnel `workspaceSurfaces(project)`**, in TS with a Rust twin for anything the backend
  must refuse. It returns which surfaces a workspace may show. For remote:
  - **absent:** editor, diff, second terminal, file tree, ⌘P finder, project search, Sublime Text and
    Merge, Finder reveal, media viewer, supervisor, and the **turn-marker jump** (prev/next turn). It
    reads xterm.js's own scrollback, which stays empty under tmux (WP1, §I), so on a remote pane it
    would jump nowhere. ⚠️ **Agent's lean, for the WP6 spec / operator to confirm**: the operator
    accepted at WP1 verify-human that the jump won't work on remote panes, but whether to **hide**
    it or **rebuild** it (e.g. jump via tmux's history, which config C keeps complete) was not
    decided. The prior `a-session-behaves-the-same-wherever-it-runs` says "reproducible at bounded
    cost → match local", so the rebuild cost has to be assessed before choosing absent.
  - **present:** prompt, docs (still through the gate), skill row, Recycle, Session-Start, drive mode,
    ⚠️ The skill row, Recycle and Session-Start assume the workflow skills exist on the REMOTE account; nothing checks it (found at WP8: the mini's personal account had none, so the buttons were dead until a manual install). Detect + install on a host is **Milestone 18** (📐 planned: [claude-substrate](claude-substrate.md) → "Remote hosts (M18)"; the host becomes `workflow_applicable`'s third input, so these surfaces go absent on a skill-less host).
    resume announce.
  - **remote-only:** Detach / Reconnect.

  `availablePanels` takes it as an input, and so does every OUT surface's mount site. The backend refuses
  `editor_fs` / `git_*` / `fs_index` / `sublime_*` / `finder` / `project_search` calls for a remote
  workspace with a typed error. That's defense in depth, so a missed frontend site errors loudly in
  dev rather than reading the wrong machine.
- **It sits beside the workflow gate, not inside it.** OUT rows are hidden because of the kind, not
  because of the workflow system, so they **don't** go through `isWorkflowApplicable`, and the
  **OFF-invariant guard's arms stay at 6 and its subjects at 10**. Detach / Reconnect is core-tier and
  ungated, so it **does not** claim a seventh arm. The surfaces that are both IN and gated (docs, skill
  row, drive mode, announce) keep their existing gate path unchanged. A remote workspace with the gate
  OFF is byte-identical to a gate-OFF local workspace minus the OUT rows.
- **New guard, built the way the existing ones are:** `workspaceSurfacesGuard` fails if any OUT surface's
  mount site doesn't consult the funnel. It is **mutation-proven per site** ("probe each arm
  INDIVIDUALLY"). Its subject list is a **floor**: it starts from the seam map's list and is grepped
  repo-wide before being trusted.
- **Existing guards this milestone touches deliberately** (inbox Q3):
  - `offInvariantGuard` and `workflowApplicableGuard`: must stay green **unchanged**. That is the evidence the
    kind funnel didn't leak into the gate.
  - `workflowApplicable.test.ts` ↔ Rust `profiles::workflow_applicable`: unchanged. Remote isn't a profile.
  - `sync_commands_do_not_block.rs`: every new ssh path must be async or worker-based; new async commands
    go into its `ASYNC_COMMANDS` table with reasons.
  - `tests/hook_pl_output.rs`: the local output stays pinned byte-identical, and a remote/origin case is added.
  - `invokedCommandsAreRegistered.test.ts`: covers the new commands automatically.
  - The `cc_session` env tests: the local env composition is unchanged and the remote command-line
    composition gets its own pin.
  - **Standing rulings that bind:** never infer state from PTY output (still hooks-only across the
    link); never write into `workflow-system/`; provenance for every `~/.claude` hook write; drive-mode
    values are the closed four, with no free strings into the remote command.

- ✅ **As built (WP6, 2026-11-17, `991307e`; WP9 folded in).** Where this differs from the plan above, this wins:
  - **The funnel keys on the project KEY, not a `remote` field** (no component carries the row): `src/state/workspaceSurfaces.ts` → `isRemoteKey` / `remoteAuthority` / `workspaceSurfaces(projectPath)`, 14 boolean surfaces (the OUT list + `fsWatch` + `docsRead`). It is the ONLY frontend remote test: `REMOTE_KEY_PREFIX` moved there and a source scan rejects a second one.
  - **The turn-marker jump is ABSENT on remote panes, PERMANENTLY** (operator ruling at the WP6 spec; no tmux-history rebuild planned). This overrides the prior `a-session-behaves-the-same-wherever-it-runs` for this surface, by ruling.
  - **The panel functions take the kind as a second input** (`availablePanels(enabled, surfaces = LOCAL_SURFACES)` etc.): remote = Prompt (gate OFF) or Docs + Prompt (gate ON), opening on Prompt / Docs; a one-tab row stays (operator decision A). ⚠️ The default fails OPEN; render-time `reconcilePanel(…, surfaces)` is the backstop (review MINOR, backlogged).
  - **Docs on remote shows a plain note** ("Docs aren't available on a remote workspace yet.") rendered by `RightPanelHost` in place of `DocsPanel`, so no `docs_list` runs. WP7.3 replaces the note with remote reads.
  - **Triggers that cannot be absent** (the app-global native menu, chords): a chord or menu item for an absent surface invokes nothing and shows ONE neutral info notice (`is-info`, `role="status"`; operator decision B: not the red error toast). ⌘W / ⌘1–9 are consumed silently. App's launcher items reach the focused workspace through the per-workspace `notice` channel (now with a `kind`).
  - **Backend refusal:** `src-tauri/src/workspace_surfaces` → `refuse_remote(root)` as the FIRST statement of 26 local-only commands, returning exactly "Not available on a remote workspace." (`REMOTE_REFUSAL`; errors cross IPC as `String`, so there is no per-module enum variant). `wip_read` / `transcript_tail` have no error channel and return empty. Pinned by `tests/remote_refusal_is_first.rs` (`syn`, first statement + a two-way set pin; `workspace_watch_stop` exempt).
  - **`workspaceSurfacesGuard`** (`src/state/__tests__/`): a re-scanned FLOOR (every production file whose code names a refused command or mounts/launches an OUT surface is listed in `SITES` with its gate reason; the command list mirrors Rust `REFUSED`) + 24 gate pins (nearest `surfaces.<flag>` before the token). ⚠️ The pins check proximity, not containment; the DOM tests (`remoteRightPanelLive`, `remoteWorkspaceHeaderLive`, `remoteMenuLaunchers`, `remoteWatcherSkip`) are the containment instrument. All 30 gate sites mutation-proven.
  - `offInvariantGuard` (6 arms / 10 subjects) and `workflowApplicableGuard` passed **unedited**; a local workspace renders byte-identical to HEAD (gate OFF + ON).

## H. Adding a remote project

- **A picker action, "Add remote project…"** with two fields (host and path). It is not a settings screen
  (anti-goal) and adds nothing to the repo (Core Principle 5). **Preflight**, every step async with an
  error naming what failed:
  - `ssh -o BatchMode=yes <host> true` (the key works);
  - `zsh -lc 'command -v tmux claude perl'`;
  - `test -d <path>`;
  - **CC is authenticated headless:** `test -s ~/.claudesk/cc-oauth-token` and, with it exported,
    `claude auth status` → `loggedIn: true` (§C.1). On failure, name the fix: run
    `claude setup-token` over `ssh -t` and save it to that file;
  - deploy and register the hook (§D).

  The row is written only after all of them pass.

  ✅ **WP2 as-built (2026-11-16):**
  - The checks run as **two** one-shot `ssh -o BatchMode=yes -o ConnectTimeout=10 -- <host>` execs, with no ControlMaster (WP3 owns the master). The first proves the key and supplies `$HOME`. The second is one constant check script under `zsh -lc` that prints `ok:<check>` / `fail:<check>` lines and always exits 0, so a non-zero exit means ssh or zsh failed, never a check.
  - A path typed as `~/…` is expanded with the **remote** `$HOME` and stored absolute (operator ruling).
  - The host is validated against an allow-list before any spawn.
  - The checks run inside the async `add_remote_project`, so the UI cannot skip them.
  - The hook deploy/register step is WP4's and is not in this preflight.
  - ✅ **M18 WP2 (2026-11-18): `claude` only in `~/.local/bin`.** Both the preflight and the deployed `cc-launch`
    prepend `$HOME/.local/bin` to PATH when `command -v claude` fails (`remote_cmd::CLAUDE_PATH_FALLBACK`). The usual
    cause is a PATH line that lives only in `~/.zshrc`, which `zsh -lc` never reads. If `claude` is in neither place, the
    `tools` check says so and names the `~/.zprofile` fix.
  - ✅ **paydown-2026-11-27 WP6: the connect exec shares the link's `$HOME` line.** The first exec is
    `remote_link::print_home_command` (it prints `remote_link::HOME_SENTINEL` + `$HOME`, the same command the link's
    `pre_connect_script` ends with), and its stdout is read by the link's own `remote_link::parse_home` (the LAST
    sentinel line). One writer, one parser: rc-file noise from the remote's `.zshenv` can no longer fail connect.
    ⚠️ It inherits `parse_home`'s rule (operator-accepted): a remote `$HOME` that is not absolute or holds whitespace
    or `:` fails here, at "Add remote project…", instead of at the first open (it could never carry the `-R` forward).
  - **Check names** (`CheckResult.name`): `host` · `connect` · `path-format` · `script` · `tools` · `path` · `token` ·
    `auth`. `script` = the check script's exec failed as a transport (dropped, timed out), so none of its checks ran;
    a zsh exit 127 stays `tools` (zsh is a missing tool). A script that stopped early is named for the FIRST check it
    did not report (`tools` → `path` → `token` → `auth`), never for whichever comes last.
- Hosts are ordinary `ssh` destinations, so the operator's `~/.ssh/config`, agent and Tailscale
  MagicDNS all apply. ⚠️ **A stopped Tailscale on the main box presents as "could not resolve hostname"**
  (hit during research). The preflight and the link's `Lost` state say so in plain words.

## I. Windows-later and things deliberately not built

- **Windows isn't foreclosed:** the remote side is POSIX shell + tmux + Perl; the local side is an OpenSSH
  client and a PTY, both of which exist on Windows. Nothing here depends on AppKit.
- **Not built in M17:** more than one host in the UI (the data model allows it); a remote editor, diff
  or file reach; remote time analytics; a remote supervisor; HTTP hooks (research: a listener and TCP
  forward for no gain over reusing the Perl script); `dtach` / `abduco`; FUSE.
- ⚠️ **Scrollback under tmux: PROBED (WP1 Phase 1, 2026-11-14) — no candidate gives full parity.**
  Measured from the xterm buffer and tmux's own state:

  | Config | Earlier output reachable by wheel? | Where it lives | Cost |
  |---|---|---|---|
  | **alt-screen, `mouse off`** | ❌ wheel becomes arrow keys **typed into the app** (zsh recalled history; in CC it would walk prompt history) | tmux only | ruled out |
  | **C: alt-screen, `mouse on`** (tmux's default here) | ✅ **complete** (400/400 lines) via tmux copy-mode | tmux history; xterm's normal buffer stays empty | ⚠️ **keystrokes sent while scrolled up are SWALLOWED by copy-mode** (an injected command was eaten; the emacs keys moved the cursor). The turn-marker jump (`turnMarkers.ts`) reads xterm's buffer and gets nothing. |
  | **B/E: `smcup@:rmcup@`, `mouse off`** | ✅ natively in xterm.js (wheel moves the viewport, no keys sent) **for streamed output** (150/150 at 30 ms/line) | xterm's normal buffer, like a local pane | ⚠️ **a burst is lost**: `seq 1 400` in one go left only the last screen (61/400) in xterm. When output outruns it, tmux scrolls the client with `CSI n S` plus a redraw, so only ~200–250 of 400 lines are ever sent to the client at all (re-measured at the raw byte stream). Streamed output goes line by line. |

  - **C's swallow trap has a clean mitigation for Claudesk's own injections:** `send-keys -X cancel`
    over the master before any skill-button / Prompt / auto-resume injection (measured: the command
    then lands). For the operator's own typing, `bind -T copy-mode Any 'send -X cancel'` exits
    copy-mode but **eats that first key** (`echo` → `cho`).
  - ✅ **RATIFIED by the operator at WP1 verify-human (2026-11-14). CHOSEN (by the rule pre-registered in the WP1 plan: "earlier output reachable by wheel AND
    the buffer not corrupted"): C, `mouse on` + alt-screen, with the RGB feature (probe conf `d.conf`)
    — plus the MANDATORY mitigation `send-keys -X cancel` over the master before every
    Claudesk-originated injection** (skill buttons, Prompt panel, auto-resume, Recycle, `/exit` on
    close). C is the only config with complete history. E fails the rule for a burst on
    both halves: lines never sent to the client are neither reachable nor intact. **Accepted costs of C:** the turn-marker jump has no xterm buffer
    to read on a remote pane (a remote-only gap, not a regression of local panes), and the operator's
    own typing while scrolled up goes to copy-mode (leave with `q`/`Esc`). The `Any` binding (exits
    copy-mode on typing but eats one key) is **NOT added** (operator, 2026-11-14): copy-mode keeps tmux's
    standard `q`/`Esc`.
  - **E is retired** (operator, 2026-11-14). Phase 2 then measured C on real CC: it held (with CC
    inline, the history is complete in tmux, and cancel-before-inject makes a scrolled-up injection
    land), so E stays retired.
  - ✅ **Copying from a remote pane (M18 WP2.5, PROBED 2026-11-18 on tmux 3.8; evidence in the archived
    `m18-wp2-5-remote-copy-to-mac-clipboard` WIP).** Under `mouse on`, a drag is tmux's copy-mode selection,
    not xterm's. On mouse-up, the default `copy-pipe-and-cancel` copies it, and **tmux already sends it to
    its client as OSC 52** (`ESC ] 52 ; ; <b64> BEL`, an EMPTY Pc) under its default `set-clipboard external`
    and `xterm*:clipboard` feature. The gap was only that xterm.js has no OSC 52 handler. As built:
    - Every pane registers a **write-only** OSC 52 handler (`osc52.ts` → `clipboard_write` → `pbcopy`).
      `navigator.clipboard` was ruled out: WKWebView rejects it with no live user activation.
      Write-only rule: `security-posture.md` → "Terminal clipboard".
    - `set -g set-clipboard on` lets an in-pane app's OSC 52 (remote CC's `/copy`) through. Under
      `external`, it was dropped.
    - **No drag-end rebinding** (operator, 2026-11-18): `copy-pipe-no-clear` would keep the highlight, but it
      leaves the pane in copy-mode, and the next keys typed were swallowed (measured). The highlight
      clears on mouse-up.
    - **Option+drag** (`macOptionClickForcesSelection`) gives a native xterm selection on a remote pane,
      copied with Edit → Copy as on a local pane. It covers only what is on screen. A plain drag copies via tmux.
    - ⚠️ **Instrument trap:** entering copy-mode and copying in ONE tmux command batch emits no OSC 52 (tmux
      skips a client with a redraw pending). A probe must select, then copy in a later command.
  - ⚠️ **On real CC (WP1 Phase 2), CC's own TUI mode decides where history lives, not tmux.** A fresh
    host boots CC 2.1.325's **fullscreen** TUI (alternate screen, even outside tmux); the operator's
    local CC is **inline** (`"tui": "default"`). Measured under C (`d.conf`) with a 200-line CC turn:

    | CC mode on the remote | History | Wheel | Copy-mode swallow trap |
    |---|---|---|---|
    | **(A) fullscreen** (the host's default) | ❌ not in tmux (`history_size=0`; only the last screen exists in tmux) — ✅ but **CC keeps it**: the wheel scrolled CC's own transcript back to line 1 | goes to CC (`mouse_any_flag=1`, tmux never enters copy-mode) | **does not arise** (tmux passes the wheel to CC) |
    | **(B) inline**, `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1` in the spawn (matches the operator's local mode) | ✅ **complete in tmux** (`history_size=175`, lines 1–200, none missing) | tmux copy-mode, as Phase 1 measured | applies; the ratified cancel-before-inject covers Claudesk's injections |

    ✅ **DECIDED (operator, WP1 Phase 2 verify-human, 2026-11-14): (B) inline — "match what my local
    panes do".** The remote inner command exports `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1` before
    `exec claude`. It is set per Claudesk spawn, so other CC sessions on a shared host keep their own
    mode. Consequences WP3 owns: tmux config C as ratified; **`send-keys -X cancel` before EVERY
    Claudesk injection AND before the close path's `/exit\r`** (§C.1: otherwise input is swallowed
    silently or a closed workspace leaves CC running); the operator's own typing while scrolled up
    goes to copy-mode (`q`/`Esc`). (A) fullscreen was the agent's recommendation (no swallow trap);
    the operator chose parity with local panes.
