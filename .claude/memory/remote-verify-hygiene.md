---
name: remote-verify-hygiene
description: Live remote checks: the mini's remote row is a REAL repo (fire real commands only in a scratch remote folder); before stopping an agent-launched dev app, check for the operator's open remote workspaces.
metadata:
  type: project
---

Two hazards specific to live verification of remote workspaces (M17), both hit 2026-11-16 in WP3.

**1. The mini's remote row points at a REAL repo with live workflow state.** The dev
`projects.json`'s only remote row is the operator's `~/my-claude-code-customization` on the mini. A
Phase 4 verify-self check clicked the real **restore** skill button to prove a scrolled-up inject
lands. The remote CC ran `/session-restore` for real. That repo had a live `.session.md`, so before
its drive-mode question it deleted the pointer and stripped an uncommitted footer from an archived WIP.
Both were restored from the remote transcript's own tool results.
- **How to apply:** a live check that fires a REAL command into a remote pane (a skill button,
  `/session-*`, a Prompt send that CC acts on) uses a **scratch remote folder** (add a temporary
  remote row for e.g. `~/claudesk-scratch-remote`, remove it after; restore `projects.json`'s row set).
  On the real row, inject only inert text, or a prompt like "reply with only the word ok".
  The local equivalent is the `../claudesk-scratch/` rule in `docs/lessons/verify-self-tiers.md`.

**2. An agent-launched dev app may be in the operator's use, and a kill orphans remote state.** At
P5.verify-human.1 the operator opened the remote row in the dev app the agent had started, and ran
their own test. At codify the agent stopped the app with `kill` (SIGTERM). A killed app runs no
teardown: its ssh master was left orphaned (PPID 1) and the remote tmux session kept running
(`SURFACE-2026-11-16-REMOTE-LINK-MASTER-ORPHANED-WHEN-THE-APP-IS-KILLED`).
- **How to apply:** before stopping an agent-launched dev app, run `pgrep -fl 'ssh -M'` and
  `ssh <mini> 'zsh -l -s' <<< 'tmux -L claudesk-dev ls'`. If either shows a session, close the
  workspaces through the UI (the bridge `filmstrip-close-*` button) so the close path runs, or ask the
  operator first. After any hard stop, sweep both and clean up what you caused. Related:
  [[lsof-ti-tcp-misses-ipv6-vite]] ("never kill a `target/debug/claudesk` you didn't launch").
