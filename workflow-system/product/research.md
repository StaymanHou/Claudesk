---
stage: research
state: complete
updated: 2026-11-14
---

# Research

**Milestone focus:** M17, remote workspaces with one SSH host first (`roadmap.md` → "### Milestone 17"; `vision.md` → "The direction from here").

**Method:** a web pass (OpenSSH, Claude Code hooks, tmux), a code seam map of this repo, and **live throwaway probes against the target host** (2026-11-14). The probes were cleaned up afterwards: no tmux session or socket was left on the mini, and its `~/.claude` and sshd config were not touched. Probe scripts are in the session scratchpad and are not committed.

Confidence labels: **PROBED** = observed live on the mini; **CODE** = read from this repo; **DOC** = official docs; **WEB** = third-party, lower confidence.

## The target host, as measured (PROBED)

| Fact | Value | Consequence |
|---|---|---|
| OS / OpenSSH | macOS 26.6, OpenSSH 10.3p1 (main box: 10.5p1) | modern; stream-local forwarding is available |
| `tmux` | 3.8, `/opt/homebrew/bin` | **not on the non-login PATH**; always call it through `zsh -lc` or by absolute path |
| `claude` | 2.1.323 at `~/.local/bin/claude` (main box 2.1.325) | HTTP hooks and `onFailure` are available if ever wanted |
| `perl`, `python3`, `jq` | system `/usr/bin` | the existing Perl hook script runs **unchanged** on the mini |
| `fswatch` | **absent** | remote watching would mean a new install; use polling instead (below) |
| sshd `AllowStreamLocalForwarding` / `AllowTcpForwarding` | yes / yes | both reverse-forward kinds are allowed |
| sshd `StreamLocalBindUnlink` | **no** | a stale socket blocks re-binding (see Finding 3) |
| sshd `ClientAliveInterval` | **0** | the server never reaps a dead client; a hung connection holds its forwards indefinitely |
| sshd `MaxSessions` | 10 | channels per multiplexed connection: terminal + forward + transient execs fit comfortably |
| `~/.claude/settings.json` | **does not exist** | no hooks are registered on the mini yet; Claudesk's install creates the file |
| Sleep (`pmset`) | `sleep 0` (prevented) | the "mini sleeps" case is effectively a **network-drop** case |
| Repo at `~/tank-sim-lite-demo` | absent (moves there when M17 lands) | probes ran without the real repo |

## Findings

### 1. Terminal: `ssh -tt host "zsh -lc 'tmux new -A -s <ws>'"` in the existing PTY works (PROBED)
- Spawning the command in a local PTY attached in **~3 s** at the requested size.
- **Resize propagates.** Changing the local PTY's size and sending SIGWINCH resized the tmux window from 100×29 to 140×39 (one row is tmux's status line).
- **Keystroke injection works.** Bytes written to the PTY reached the remote shell. Skill buttons, the Prompt panel and auto-resume all type this way (CODE: `cc_input` → `CcSession::send_input`).
- **The session survives a client kill, and reconnect is the same session.** After SIGKILL of the local `ssh`, `tmux ls` still listed the session, and `new -A` reconnected to it (a marker written before the kill was still there).
- **Latency:** a fresh connection takes 0.81 s; an exec over an existing ControlMaster takes **0.14 s**; reconnecting takes ~2.9 s. Metric 1's <10 s budget is not at risk.

### 2. Hook channel: reverse-forward the remote socket straight into the existing `hook.sock` (PROBED + CODE)
- `ssh -R <remote.sock>:<local hook.sock>` delivered a line written on the mini into a local listener. The existing Perl script (`resources/claudesk-hook.pl`) writes one JSON line to `$CLAUDESK_HOOK_SOCK`, so on the mini it needs only `CLAUDESK_HOOK_SOCK=<remote.sock>`. **No new local listener and no new wire format are needed.**
- Workspace mapping is by `cwd` (CODE: `WorkspaceRegistry::resolve_cwd`). A remote cwd string such as `~/tank-sim-lite-demo` matches when the workspace registers that same string. `canonical_key` falls back to the raw string when the path doesn't exist locally. ⚠️ It collides if the same path string exists locally or belongs to another workspace, so **key remote workspaces as host + path**.
- The drive-mode `additionalContext` line is printed by the script from `$CLAUDESK_DRIVE_MODE` (CODE). **An arbitrary env var doesn't cross ssh** (no SendEnv/AcceptEnv for it; only `LANG`/`LC_*` cross, via the client's default `SendEnv LANG LC_*`, corrected by the WP1 probe), so the value has to go into the remote command line (`env CLAUDESK_DRIVE_MODE=… claude …`).
- **The remote hook fires for every CC session on the mini**, including sessions not started by Claudesk. That matches local behaviour (machine-global hook). Events with unmatched cwds are ignored by status, but `time_store` records every event, so **remote events must be kept out of time analytics** (that row is OUT).
- Alternative considered: Claude Code **HTTP hooks** (`"type": "http"`; non-2xx, connection-refused and timeout are all non-blocking by default; the response body can carry `hookSpecificOutput.additionalContext`) (DOC). These would let Claudesk answer `UserPromptSubmit` with the drive-mode line itself, but they need an HTTP listener and a TCP forward. That's more new surface for no gain over reusing the Perl script, so **not recommended for M17**.

### 3. ⚠️ A dead connection blocks the reconnect; fix it client-side, not with sshd changes (PROBED)

| Forward kind | Old connection hung (SIGSTOP: no FIN, like a dead network) | Old connection killed cleanly |
|---|---|---|
| Unix socket `-R` | reconnect **fails** ("remote port forwarding failed for listen path") | reconnect **still fails**: the socket file is left behind |
| Unix socket `-R` with client `-o StreamLocalBindUnlink=yes` | **fails**; the client option isn't sent to the server (OpenSSH bug 2601, reproduced on 10.3/10.5) | — |
| TCP `-R` | **fails**; the hung sshd child holds the port (`ClientAliveInterval 0`) | reconnect works |
| **Unix socket, after `rm -f <remote.sock>` over a fresh exec** | **reconnect WORKS and delivers**, even with the old connection still hung | works |

**Recommendation:** use a unix-socket forward, and **before each connect, `rm -f` the remote socket path over a separate exec**. This needs **no sshd change on the mini** (the request offered `StreamLocalBindUnlink yes` via sudo; it isn't necessary). On the client, set `ServerAliveInterval` (~15 s) × `ServerAliveCountMax` (3) so Claudesk notices a dead link in ~45 s and starts reconnecting. The orphaned server-side session from a hung connection lingers harmlessly, holding only an unlinked socket inode.

### 4. ⚠️ macOS unix-socket paths are capped at 104 bytes, and ssh's forward syntax needs a `/` (PROBED)
- A local socket path of about 126 bytes made ssh reject the forward as a **"Bad remote forwarding specification"**. A bare relative name (`h.sock`) was also rejected; `./h.sock` worked, because a field is treated as a socket path only if it contains `/`.
- Claudesk's paths:
  - The hook socket, `~/Library/Application Support/com.claudesk.app.dev/hook.sock`, is about 72 bytes, which is fine. It contains a space, which is fine as one argv element (no shell).
  - **A ControlMaster path in the same directory using `%C` (40 hex chars) is about 107 bytes and overflows.** Use a short name such as `cm-<8-hex>` or a short directory.
  - On the mini, use a short socket path such as `~/.claudesk/<identifier>/hook.sock` (about 50 bytes), which also keeps the dev/prod split.

### 5. Remote reads and watches: ssh exec over ControlMaster, with polling (PROBED latency + CODE)
- With 0.14 s per exec, polling `stat` on a handful of known paths (`.session.md`, the docs set, the transcript-presence check) every 1–2 s is cheap and adds **no remote process**. That satisfies "nothing long-running beyond CC, tmux and the hook path", and needs no FUSE on the main box.
- **Every local-filesystem read below has to become remote-aware for a remote workspace** (CODE):
  - `announce::has_session_md` (resume announce)
  - `transcript::has_any_transcript` via `guard_continue_against_transcripts`, which would otherwise **silently drop `--continue`**
  - `folder_trusted` (reads `~/.claude.json`)
  - `docs::discover` / `docs_read` (both through `validate_root`, which **canonicalizes and fails** on a remote path)
  - Recycle's `.session.md` mtime baseline and `fs-change` wait (`recycleSession.ts`)
  - `fs_watch` (local `notify`)

### 6. What already works unchanged (CODE)
- **Filmstrip thumbnails** serialize the local xterm buffer (`terminalMirror.ts`).
- **Skill buttons, the Prompt panel and the `/session-restore` injection** type through the PTY.
- **The status broadcaster and its three surfaces** don't care where events come from.
- **Resize**: `PtyCcSession::resize` → SIGWINCH → ssh → tmux (also PROBED).

### 7. Lifecycle mapping onto R-1–R-4 (CODE + PROBED)
- **R-1, explicit close/quit = end.** `PtyCcSession::kill` already **types `/exit\r` first**, then SIGHUP/SIGKILL the local group. If the tmux session's command is `claude` itself, `/exit` ends CC, and the tmux session ends with it. **The existing kill path implements R-1 as-is.**
- **R-2, a passive event leaves it running.** A Claudesk crash or network drop kills only the local `ssh`; tmux keeps CC alive (PROBED). **R-2's "reconnect beats both signals"** is one check on open: `tmux has-session -t <ws>` over the ControlMaster (0.14 s). If live, attach; if not, run the existing two-signal rule, with its file checks done remotely (Finding 5).
- **R-3, Detach** is a new route: kill the local `ssh` **without** typing `/exit`, and don't mark the unclean flag as a crash. Reconnect is the same `new -A`.
- **R-4, unclear → dialog.** Candidate cases for arch to enumerate: the host is unreachable at open; a live tmux session exists that Claudesk has no record of opening; reconnect retries are exhausted.

## Recommended stack

- **Transport:** system OpenSSH (`/usr/bin/ssh`), spawned as the PTY child **in place of `claude`**, through the `CcSession` seam. Today `build_cc_argv` always starts with `CC_CMD` and `compose_command` sets a local `cwd`. A remote spawn needs a different program (`ssh`), a local cwd, and the remote path and CC argv passed inside the remote command. Key-based auth only (`BatchMode=yes`), using the operator's existing `~/.ssh` config and agent. No SSH library in Rust.
- **Session host on the remote:** **tmux on a dedicated socket** (`tmux -L claudesk`), so Claudesk's sessions are isolated from the operator's own tmux use and config. Per session: `status off`, so tmux's status bar doesn't eat a row or show in the pane.
- **Hook path:** the existing Perl script deployed to the mini, plus a unix-socket `-R` straight into the existing local `hook.sock`, with **`rm -f` before each connect** (Finding 3).
- **Remote I/O:** `ssh` exec over a **ControlMaster** (`ControlPersist`, a short ControlPath), polling known paths. No mount, no `fswatch`, no remote daemon.
- **Liveness:** client `ServerAliveInterval 15` / `ServerAliveCountMax 3`, and auto-reconnect with backoff when the terminal's `ssh` exits without an explicit close.

## Trade-offs

- **tmux vs. a minimal detach tool** (`dtach` / `abduco`). tmux is installed and battle-tested, but it **re-renders the screen**, so CC's scrollback lives in tmux's history rather than xterm.js's buffer: wheel-scrolling the pane may not show earlier CC output. A detach-only tool keeps native scrollback but is a new install on a shared machine. **Lean: tmux, with scrollback mitigated** (`terminal-overrides` `smcup@:rmcup@`, or tmux mouse/copy mode). ⚠️ **UNPROBED**: the first build spike must check scrollback on a real CC session.
- **Unix-socket vs. TCP reverse forward.** Unix plus pre-connect `rm` survives a hung connection (PROBED); TCP can't free a port held by a hung sshd child without server-side `ClientAliveInterval`. **Unix.**
- **Perl command hook vs. HTTP hook.** HTTP (DOC) would let Claudesk answer with `additionalContext` directly, but needs a listener and TCP forward. **Reuse Perl.**
- **Separate terminal connection vs. everything on one master.** One ssh process per workspace as the PTY child is the simplest model to reason about. Side-channel execs ride a ControlMaster. If the terminal connection is itself the master, a drop kills both together, which is acceptable because both reconnect. **Leave the choice to arch.**
- **Polling vs. a remote watcher.** Polling costs about 1–2 s of latency on doc and `.session.md` changes but adds no remote process. **Polling** for M17.

## Risks

1. **Data loss: `config_store::prune_missing_projects` deletes any project row whose path doesn't exist locally** (CODE). A remote row would be deleted on the next launch. A workspace **kind** (or remote fields) must exempt it. This is the highest-severity item.
2. **There is no notion of workspace kind.** `availablePanels(enabled)` and `isWorkflowApplicable(gate, profile)` are the only surface funnels (CODE). Hiding the OUT rows means adding a kind input to that funnel, which **trips the OFF-invariant guard (6 arms / 10 subjects) and `workflowApplicableGuard`**. That's intended: their lists must be updated deliberately, and the Rust and TS `workflow_applicable` truth tables must change together.
3. **`sync_commands_do_not_block`**: every ssh exec (has-session, `rm`, `stat`, `cat`) is blocking I/O. These must live in `async` commands or on worker threads, never in a sync `#[command]`. (A main-thread block hung the app once, P1 2026-08-25.)
4. **A silent `--continue` drop.** If the transcript guard keeps reading locally, a dead remote session respawns fresh instead of continuing, with no visible error.
5. **The status of a disconnected workspace is undefined.** While the link is down, no hooks arrive and the dot freezes on its last state. Arch must define how "connection lost / reconnecting" reads on the filmstrip, menu bar and PiP. The CLAUDE.md precedent says a **display overlay, not a fifth state**.
6. **Scrollback under tmux** (see Trade-offs). UNPROBED, and possibly a visible regression from local.
7. **The remote hook is machine-global** on a shared machine. Events from other CC sessions on the mini reach `hook.sock`. They're harmless for status (unmatched cwd), but must be excluded from `time_store`.
8. **Dev and prod Claudesk against the same mini** each register a hook. The script must fail fast and silently when its socket is absent. It does locally today; the build must confirm that on the remote.

## For the tank side (facts only)

From these probes, M17 needs **no sshd change on the mini** (Finding 3) and no `fswatch` install. Whether the tank side runs its own spikes is its call.

## References
- OpenSSH bug 2601, "StreamLocalBindUnlink not working" (the client option isn't sent to the server): https://lists.mindrot.org/pipermail/openssh-bugs/2019-December/020970.html
- Stale reverse-tunnel socket blocks reconnect: https://lists.mindrot.org/pipermail/openssh-unix-dev/2018-March/036731.html
- StreamLocal forwarding discussion: https://lists.mindrot.org/pipermail/openssh-unix-dev/2016-April/035062.html
- Cleaning up a reverse-tunnel socket after the connection closes: https://backiee.wasmer.app/http_unix_stackexchange_com/questions/427189/how-to-cleanup-ssh-reverse-tunnel-socket-after-connection-closed
- ControlPersist and stale control sockets: https://lists.mindrot.org/pipermail/openssh-unix-dev/2022-November/040463.html
- OpenSSH multiplexing cookbook: https://en.wikibooks.org/wiki/OpenSSH/Cookbook/Multiplexing
- SSH multiplexing / ControlMaster overview: https://linuxize.com/post/ssh-multiplexing/
- Claude Code hooks reference (HTTP hooks, response handling, common input fields): https://code.claude.com/docs/en/hooks
- Claude Code desktop, SSH environments (DOC; not used, and macOS-host support is reported unclear): https://code.claude.com/docs/en/desktop and https://claude.com/docs/third-party/claude-desktop/ssh-remote-sessions
- macOS SSH-remote-host feature request ("Unsupported remote platform: darwin") (WEB): https://claudeissues.com/issue/26694-feature-request-support-macos-darwin-as-ssh-remote-host
- Community ssh + tmux + Claude Code pattern (WEB): https://jacktan.bearblog.dev/remote-claude-code/ and https://agentsroom.dev/hi/blog/keep-a-coding-agent-running-on-a-server-after-ssh-disconnects
- tmux `window-size` / resize semantics (source): https://sources.debian.org/src/tmux/3.5a-3/resize.c
