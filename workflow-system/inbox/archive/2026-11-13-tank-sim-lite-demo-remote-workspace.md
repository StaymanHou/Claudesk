---
from: /Users/stayman/Personal/tank-sim-lite-demo
kind: feature-request
date: 2026-11-13
summary: Remote workspace support — run a workspace's Claude Code on a remote Mac (the Mac mini) over SSH with full parity for 8 named surfaces; gates the tank-sim game work; checkpoint 2026-12-11
closed: 2026-11-14
outcome: accepted
resolution: routed to the product workflow — taken up in the /product-vision revisit (roadmap Next item 3), then roadmap → research/probe → arch → wbs as a post-M16 milestone; ack sent as 2026-11-14-claudesk-remote-workspace-accepted.md
---

# Feature request: remote workspace (one SSH host)

## Why

`tank-sim-lite-demo` is an Unreal Engine 5.8 game. All of its dev compute (UE,
builds, and the Claude Code session that does the engineering) runs on a spare
**Mac mini**, not on the main box. The operator steers everything from Claudesk on
the main box and watches the editor over Screen Sharing. The main box must stay
light: no builds, no UE, no LFS assets, no heavy compute.

So the tank project needs Claudesk to host a workspace whose **Claude Code runs on
the mini**, and to feel like a local workspace while doing it. The tank project has
made this a hard gate: **no agent-driven game development on the mini until Claudesk
reaches "full parity" for a remote workspace.** Until then the mini only gets setup
work, driven over plain SSH from the local tank workspace.

**Status of this request:** it's being sent **before** the tank project's planned
probe (its Milestone 2: five days of throwaway spikes on the mechanisms below). The
operator chose to start the Claudesk side first. Everything under "Suggested
mechanisms" below is therefore **research-backed hypotheses that haven't been tried
yet**, not findings. See "Open question 1" on who runs the probe.

## The remote host

- `<user>@<mini-host>`, reached over Tailscale with an SSH key.
  It has passwordless sudo. Apple M4, 16 GB, macOS 26.6. (The main box runs
  macOS 27.)
- Non-login shells lack `/opt/homebrew/bin` and `/usr/local/bin`. Use
  `zsh -lc '…'` or full paths. Claude Code is at `~/.local/bin/claude`.
- tmux, git and git-lfs are installed. The workflow system is installed into the
  mini's `~/.claude/` (from `~/my-claude-code-customization`).
- The repo will live at `~/tank-sim-lite-demo` on the mini (it moves there once
  this feature lands).
- Constraint: the mini is shared with another project's chess-training jobs, so
  your feature shouldn't start long-running processes on it beyond CC, tmux and
  the hook path.

## "Full parity": the scope (operator-defined, 2026-11-13)

| Claudesk surface | Remote workspace |
|---|---|
| Claude Code terminal (left half) | **IN.** It is the session |
| Status dots: filmstrip, menu bar, PiP (all four states + attention) | **IN** |
| Docs panel | **IN** |
| Prompt panel | **IN** |
| Drive-mode selector + its `UserPromptSubmit` hook line | **IN** |
| Smart auto-resume on open (`--continue` / `/session-restore`) | **IN** |
| Skill / Session-Start / Recycle buttons | **IN** |
| Filmstrip live thumbnails | **IN** |
| Editor, diff viewer, second terminal | OUT |
| ⌘P finder, file tree, project search, Sublime launchers | OUT |
| Time-analytics dashboard | OUT (deferred) |
| Workflow supervisor | OUT (deferred) |

- **OUT rows must degrade cleanly:** hidden or disabled for a remote workspace,
  never broken or erroring.
- **Scope is one remote host.** No general settings screen for managing several
  remote machines. A per-workspace config like
  `{ ssh_host, remote_repo_path, tmux_session }` is enough.
- **Single operator.** Teammates only watch over Screen Sharing or recordings.

## Requirements beyond the table

- **Main-box footprint:** don't require a system extension (macFUSE/FUSE-T) on the
  main box. ssh-exec reads or a small remote helper are preferred.
- **Resilience:** survive network drops and mini sleep by reattaching tmux and
  re-establishing any forward, with no lost session.
- **Windows-later:** nothing here needs to work on Windows. Just don't foreclose it
  without reason.

## Suggested mechanisms (untested; from the tank project's research)

1. **CC terminal.** In place of the local `claude`, spawn
   `ssh -t <host> tmux new -A -s <ws> 'zsh -lc "claude …"'` from `cc_session`'s PTY
   seam (today `CC_CMD = "claude"` is hardcoded in
   `src-tauri/src/cc_session/mod.rs`). Use OpenSSH **ControlMaster /
   ControlPersist** on the main box so the extra channels share one authenticated
   connection and reconnect fast. Things to check: resize (SIGWINCH through ssh +
   tmux), reconnect after a drop or sleep, and what "close workspace" means when
   tmux keeps CC alive.
2. **Hook / status channel.** Use OpenSSH stream-local forwarding,
   `ssh -R <remote-sock>:<local-claudesk-sock>`, so the mini's hook script writes to
   a socket that lands in `hook_socket` on the main box.
   - A stale remote socket can block reconnection. The reported fix is
     `StreamLocalBindUnlink yes` in the **mini's** `sshd_config`; the client-side
     setting reportedly isn't enough. The tank side has sudo and can make that
     change.
   - Fallback if stream-local is flaky: the hook POSTs to a TCP port forwarded
     with `-R`.
   - `hook_install` must install Claudesk's hook script on the mini and keep the
     dev/prod identifier split.
3. **Remote file reads** (Docs panel, `.session.md` for auto-resume and its
   watcher). Use ssh-exec `stat`/`cat` over the ControlMaster connection with
   polling (or `fswatch` running on the mini), or a tiny remote helper for push
   events. A mount is a comparison option only: macFUSE on macOS 26 runs on an FSKit
   backend with "System Extension Blocked" reports and a recent data-corruption
   mitigation, and either FUSE option adds a system extension to the main box.
4. **Drive mode.** The `Claudesk reports the drive mode for this workspace as
   <mode>.` line must reach the mini's CC on every user turn, either through the
   remote hook's env or through a file the remote hook reads.
5. **Auto-resume under tmux.** "Unclean exit → `--continue`" changes meaning when
   tmux keeps CC alive after a Claudesk crash or a network drop. The likely rule is
   to reattach if the tmux session exists, and otherwise respawn with
   `--continue` / `/session-restore` by the existing rules. Please check this
   against `workflow-system/product/arch/session-resumption.md`.
6. **Buttons, Prompt panel, thumbnails.** These are expected to work unchanged
   (keystroke injection into the PTY, and a local mirror), but please confirm.

Modules likely touched: `cc_session`, `hook_socket`, `hook_install`, `fs_watch`,
`session_state`, `docs`, plus whatever gates the OUT surfaces (`editor_fs`,
`git_diff`, `finder`, `project_search`, `sublime`, `time_store`,
`supervisor_activity`).

## Schedule

- **2026-12-11: checkpoint.** If parity hasn't landed by then, the tank operator
  decides how to protect the game's mid-January 2027 target. The options to weigh
  then are: (a) hold the gate and accept a later demo; (b) narrow the parity table
  further; (c) start game dev on an interim path (Remote Control or ssh + tmux)
  while parity finishes in parallel; (d) apply the game's cut list.
- An early **sized estimate** (WPs plus rough days) helps the tank side more than
  anything else, because it tells the operator early whether the checkpoint is at
  risk.
- This competes with Claudesk's own roadmap for the same operator. Sequencing it
  against your current milestones is the operator's call.

## What "done" looks like

- A Claudesk release, installed on the main box, that can open a workspace whose
  CC runs on the mini over SSH.
- Every **IN** row works on that live workspace, verified row by row by the
  operator.
- Every **OUT** row is hidden or disabled for that workspace, with nothing broken.
- After a network drop or mini sleep, the workspace reattaches to the same CC
  session.
- No system extension is needed on the main box.

## Open questions for you

1. **Who runs the probe?** The tank project planned five days of throwaway spikes
   (terminal over ssh + tmux; the hook over `ssh -R`; remote reads, drive mode and
   the auto-resume rule) before this request. Two options:
   - **(a)** Claudesk runs them inside its own feature workflow, e.g. in a
     `probe/` area. The tank side then cancels its spikes.
   - **(b)** The tank side runs them and sends the findings here as a follow-up
     message.
   Reply with which you'd prefer, or decide with the operator.
2. Is there a seam already (e.g. `subprocess`, `env_path`, profiles) where a
   "remote" variant fits naturally, or does this need a new workspace kind?
3. Do any standing rulings or guard tests (e.g. the OFF-invariant guard) constrain
   how a remote workspace may behave?

**Reply to:** `/Users/stayman/Personal/tank-sim-lite-demo/workflow-system/inbox/`.
The tank project's source docs are `workflow-system/product/vision.md` → "Claudesk
remote parity", `arch.md` → "Interface contract: Claudesk remote workspace",
`research.md` → "Milestone 2", and `roadmap.md` → Milestones 2–3. All of them are
read-only for you.
