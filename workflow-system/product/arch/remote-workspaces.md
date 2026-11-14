---
updated: 2026-11-14  # M17 /product-arch: PLANNED design, not yet as-built. Resync at M17's /product-finalize.
---

# Remote workspaces (M17)

⚠️ **PLANNED, NOT AS-BUILT.** This is M17's design (`/product-arch`, 2026-11-14). It becomes the as-built
record when M17 closes. Until then, where it disagrees with code, the code is the truth and this file is
the intent. Inputs: `roadmap.md` → "### Milestone 17" (scope, lifecycle rulings R-1–R-4),
`research.md` (live probes against the mini, 2026-11-14), `vision.md` → "The direction from here".

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

## C. Spawn: answering the seam questions (inbox Q2, vision Q5)

**The seam is `SessionRegistry::spawn`'s target, below `CcSession`, not a new trait impl.**
`PtyCcSession` already owns everything a remote terminal needs: a PTY, `send_input`, and `resize`
(SIGWINCH crosses ssh and tmux; probed 100×29 → 140×39). What differs is only *what the PTY runs*.

- **`SpawnTarget::{Local { cwd }, Remote { target }}`.** `build_cc_argv` is unchanged and becomes the
  **inner** argv.
  - **Local** behaves exactly as today. The existing env-composition tests pin that it stays byte-identical.
  - **Remote** spawns `/usr/bin/ssh -S <ctl> -tt <host> -- <remote command>`, with a local cwd of
    `$HOME`. The remote command is:

    ```
    zsh -lc 'exec tmux -L <srv> new -A -s <name> -c <path> \
      "env CLAUDESK_DRIVE_MODE=<mode> ~/.local/bin/claude <argv…>" \; set status off'
    ```

    `zsh -lc` is required because tmux isn't on the mini's non-login PATH (probed). `CLAUDESK_DRIVE_MODE`
    is omitted when the gate is off or no mode is set, exactly as locally. The value travels in the
    command line because **an arbitrary env var doesn't cross ssh**. Only `LANG`/`LC_*` do, through
    the client's default `SendEnv LANG LC_*` (probed WP1; §C.1). `CLAUDESK_DRIVE_MODE` is not one of them.
- ⚠️ **One shell-quoting function (`remote_cmd::quote`) builds every remote command string**,
  covering spawn, execs and reads. It is unit-tested against hostile inputs (spaces, quotes, `$`,
  backticks, newlines). It is the only defense against a path or mode string becoming remote code
  execution on a shared host. **Never build a remote command with `format!` outside it.**
- **`new -A` means attach-if-exists.** When the tmux session is live, the inner command and its env are
  ignored, which is the reconnect (R-2). When CC exits, its tmux session ends, so a later `new -A`
  starts fresh with the argv the resume rule chose.
- **The `CcSession` trait gains one method, `detach()`.** Its default impl returns `Unsupported`, so the local
  impl is unchanged. On remote it SIGHUPs the local ssh **without** typing `/exit`. `kill()` is
  unchanged (§E, R-1).
- **Profiles stay local-only** (`CLAUDE_CONFIG_DIR` names a local directory). A remote workspace runs
  under the remote's default `~/.claude`.

### C.1 Terminal facts from the WP1 probe (PROBED 2026-11-14, Phase 1; mini tmux 3.8)

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
  **before CC is up** (a multi-line send would split into several submits). WP3/WP5: a multi-line
  injection must wait for CC to be ready (the existing `cc_ready` gate covers the local pane;
  confirm it covers the remote one).
- **Latency:** to tmux-ready, cold **1.0 s** / warm master **0.26 s**; **to CC's prompt, cold 1.30 s /
  warm master 0.55 s** (3 runs each, host-side PTY, trusted folder). That is vision Metric 7's
  open-time input, well inside Metric 1's <10 s.
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
- **WP3's remote inner command, as probed end to end (2026-11-14):** before `exec claude <argv>`, it
  runs `export CLAUDE_CODE_OAUTH_TOKEN="$(cat ~/.claudesk/cc-oauth-token)"` (auth),
  `export CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1` (inline, operator decision, §I) and `unset TMUX`
  (truecolor). All three are built through `remote_cmd::quote` like the rest of the command (§C).

## D. Hook channel and drive mode (vision Q3)

- **The same Perl script, deployed unchanged** to `~/.claudesk/<identifier>/claudesk-hook[-dev].pl` on
  the remote. The mini has `/usr/bin/perl`. The script already exits 0 on every degraded path (no socket,
  bad stdin), so a down link or a dev/prod twin never blocks CC there either.
- **Registration in the remote `~/.claude/settings.json`** reuses `hook_install`'s merge logic. The file
  is read with `cat`, the merge runs **locally**, and the result is written back atomically (`cat > tmp && mv`).
  On the mini the file doesn't exist yet (probed), so this creates it. The registered command is
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
- **Drive mode** arrives on the remote CC as `CLAUDESK_DRIVE_MODE` in the spawn command line, and the
  script prints the same `additionalContext` line it prints locally. It is fixed at spawn, as locally. A
  picker change takes effect at the next spawn. A **reconnect keeps the session's original mode**, and
  the picker row has to say so rather than imply the new mode is live.

## E. Lifecycle: R-1–R-4 mapped onto the machine

⚠️ **Reconnect ≠ resume** (operator vocabulary, 2026-11-14; `roadmap.md` → M17). **Reconnect** = the
session is alive on the remote, so attach to it and fire nothing. **Resume** = the session already
`/exit`ed, so connect and run the two-signal rule (`--continue` / `/session-restore`) against the
remote. Code, UI copy and tests use these two words for these two cases only.

| Event | Kind | What happens | Rule |
|---|---|---|---|
| Close workspace (link up) | explicit | the existing `kill()` types `/exit` → CC ends → tmux session ends → the clean-exit route clears the unclean flag | R-1 |
| Quit / self-update relaunch (link up) | explicit | the same `kill()` for every remote workspace, then the quit continues | R-1 |
| ⏸ "Close, resume later" (`onPauseClose`, link up) | explicit | the same `kill()` (`/exit` → CC and tmux end), but the unclean flag is **left set**, as it is locally, so the next open **resumes** with `--continue` on the remote | R-1 |
| Recycle | explicit | the existing flow: handoff → composite marker (remote poll + `Stop` hook) → `kill()` → respawn → `/session-restore` | R-1 |
| Claudesk crash, link lost, host unreachable | passive | the local ssh dies; tmux and CC keep running; the link retries with backoff and reconnects every workspace on that host | R-2 |
| Detach button | deliberate | `detach()`; the tile stays open in a **Detached** state with a Reconnect button; the unclean flag is left untouched | R-3 |
| Reconnect button / reopen from the picker | — | `tmux has-session` over the master: **live → attach (beats both resume signals)**; dead → the two-signal rule, with its file checks done remotely (§F) | R-2 |
| Close a **detached** workspace | unclear | dialog: "End the remote session" / "Leave it running" | R-4 |
| Quit or close **while the link is down** | unclear at the next open | `/exit` can't be delivered. Record an *end-intent* for that key. At the next open, a live session plus an end-intent → dialog: "You closed this while disconnected — end it, or reconnect?" | R-4 |
| Host unreachable at open | unclear | dialog: Retry / Cancel. Never silently fall back to anything | R-4 |
| A live `cd-*` session with no Claudesk record (e.g. after its row was removed) | unclear | dialog at open: Reconnect / End it and start fresh | R-4 |

- **The unclean flag is unchanged.** It is set on open and cleared only by an explicit clean route. A passive
  drop leaves it set, which is correct: if the remote session later dies too (the remote reboots),
  reopening falls to `--continue`.
- **Status while the link isn't Up is a display overlay, not a fifth state.** This is the same pattern as
  `attention`. While the link is `Lost` or the workspace is `Detached`, `display_state` reads a
  **link overlay**: the last state's hue, dimmed, plus a link glyph on the tile, PiP row and tray
  menu row. `state` keeps the underlying value, and the close/quit and respawn guards keep reading
  `state`. After a reconnect the state is `Unknown` until the next hook event: events missed while the
  link was down are not replayed or guessed (`Unknown` is honest).

## F. Remote reads and watches (vision Q4)

- **New module `remote_fs`**: async, read-only, over the host's master. `remote_stat`, `remote_read`,
  `remote_exists`, and `remote_list_dir`. Every path is resolved under `RemoteTarget.path` and rejects
  `..` and absolute escapes **before** quoting. This is the remote equivalent of `validate_root`.
  Claudesk still never writes into `workflow-system/`; the only remote writes are the hook script and
  the hook registration under `~/.claudesk` and `~/.claude/settings.json`.
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
  - `docs::discover` / `docs_read`
  - Recycle's mtime baseline

## G. Surface applicability (vision Q6, inbox Q3)

- **New single funnel `workspaceSurfaces(project)`**, in TS with a Rust twin for anything the backend
  must refuse. It returns which surfaces a workspace may show. For remote:
  - **absent:** editor, diff, second terminal, file tree, ⌘P finder, project search, Sublime Text and
    Merge, Finder reveal, media viewer, supervisor.
  - **present:** prompt, docs (still through the gate), skill row, Recycle, Session-Start, drive mode,
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
  - **E is retired** (operator, 2026-11-14). Phase 2 measures C on real CC, not E. E returns only if
    Phase 2 shows C failing on real CC output.
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
