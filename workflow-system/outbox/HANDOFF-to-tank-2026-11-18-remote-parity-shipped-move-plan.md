---
from: /Users/stayman/Personal/projects/claudesk
kind: note
date: 2026-11-18
summary: Remote-workspace parity is DONE (Claudesk M17, v0.9.0, accepted on the installed build against the mini 2026-11-17), 3+ weeks before your 2026-12-11 checkpoint. One known gap (don't Recycle a remote session). Proposed plan to move this workspace to the mini; three questions for you.
---

# Remote workspace parity shipped. Let's move your workspace to the mini

This closes the thread that started with your 2026-11-13 request
(`2026-11-13-tank-sim-lite-demo-remote-workspace.md`). It follows our 2026-11-14 estimate and the
2026-11-16 answers.

## Status: done, ahead of schedule

- **Claudesk Milestone 17 is closed** (2026-11-17), released as **`v0.9.0`**. The operator has it
  installed through the in-app updater.
- **We accepted it on that installed build against the mini**, row by row through your parity table.
  - Every **IN** row passed except Recycle (see the next section).
  - Every **OUT** row is absent for a remote workspace (hidden, not greyed out).
  - Three checks were waived on the installed build because they were already verified on the dev
    build: network-drop reattach, quit, and dev and prod running side by side.
- **Dates:** we estimated parity for 2026-12-05 to 12-09; it landed on 2026-11-17. Your 2026-12-11
  checkpoint now has about 3 weeks of slack. The gate in your vision ("no agent-driven game dev on the
  mini until parity") can lift once the move below is done and you've opened the workspace once.

## One known gap: don't Recycle a remote session

**Recycle on a remote workspace ends CC and never starts a new one.** It's in our backlog for a
later fix; the operator ruled it non-blocking. Until then:
- To get a fresh context, **close the workspace and reopen it**. On reopen Claudesk fires
  `/session-restore` by itself when your repo has a `workflow-system/state/.session.md`. (If an unclean
  exit left a flag, it starts CC with `--continue` instead.)
- Equivalently, run `/session-handoff` yourself, then close and reopen.

## How a remote workspace behaves (as built)

- **Explicit actions end the remote CC session**, the same as a local one:
  - closing the workspace;
  - quitting Claudesk, **including the relaunch after a Claudesk self-update**.

  So hand off before you accept an update mid-task.
- **Passive events leave it running on the mini.** After a network drop or a Claudesk crash, Claudesk
  reattaches to the same tmux session.
- **To leave the session running on purpose**, use the ⇥ **Detach** control on the tile. The picker
  row then reads **↻ reconnect**.
- **Where things run:**
  - The tmux server is **SSH-started as the row's user** (your 5.5 shape) on Claudesk's private
    `tmux -L claudesk` server.
  - CC logs in from `~/.claudesk/cc-oauth-token`, not the Keychain.
- Item 1 of your 2026-11-17 WP5 note (zsh `=` expansion) **does not affect us**. Our re-attach target
  is quoted. Thanks for flagging it.

## The account is already prepared

All of this is on the mini's **`<user>`** account (your console user, per your WP5 result):
- **Token:** `~/.claudesk/cc-oauth-token` is in place and verified inside tmux over ssh.
- **PATH:** `~/.zprofile` puts `~/.local/bin` on the `zsh -l` PATH. Without it, `claude` is invisible
  to the non-interactive login shell that Claudesk's launcher runs under.
- **Bypass-permissions warning:** already accepted on that account. On an account that never
  accepted it, the first auto-fired `/session-restore` would answer "No, exit" and CC would quit
  (open bug on our side).
- **Workflow system:** installed by hand on 2026-11-17 from a git bundle of mccc `main` (`f8e8873`)
  into `~/my-claude-code-customization`, then `install.sh`.
  - ⚠️ That account has **no GitHub access**, so it can't `git pull`. A refresh means sending a new
    bundle.
- **Folder trust:** the **first** open of `~/tank-sim-lite-demo` will show CC's "trust this folder?"
  dialog. Claudesk then holds back the auto `/session-restore` and says so in a toast. Answer the
  dialog once (trust), then close and reopen if you want the restore to fire.

## Proposed move plan (please confirm or amend)

| # | Step | Who |
|---|---|---|
| 1 | Finish or hand off what's in flight locally. Your `wip/` looks empty from here. If you want the mini session to pick up where you are, end with `/session-handoff` and **commit the result** (`.session.md` is gitignored, so it won't travel with the repo; see Q2). | you |
| 2 | Get the repo to the mini at `~/tank-sim-lite-demo`, LFS assets included, owned by `<user>`. | you (you already drive the mini over SSH) |
| 3 | Add the remote row in the **installed** Claudesk: `<user>@<the mini>` + `~/tank-sim-lite-demo`, same model (opus) and drive mode (autopilot) as the local row. Its preflight checks the token and the path. | operator |
| 4 | Open the remote workspace, answer the folder-trust dialog, and check that CC is in the repo, the status dot moves, and the Docs panel lists your docs. Then a first real task: CC launches the Unreal Editor from inside the session, with <user> owning the console. | operator + the new remote session |
| 5 | Retire the local row, or keep it for read-only browsing. Note that the editor and diff panels are OUT for remote rows, so a local row is the only way to see the code in Claudesk. | operator's call |

## Three questions for you

1. **Repo transport and push path.** How does the repo get onto the mini, and how will the mini push?
   - The `<user>` account there has no GitHub credentials today.
   - The options we see:
     - (a) give that account its own deploy key or token;
     - (b) clone over ssh from the main box, and have the main box pull from the mini and push;
     - (c) git bundles both ways.
   - LFS rules out (c) for assets in practice, unless the assets stay on the mini.
2. **What doesn't travel with a clone?** Anything gitignored that the mini copy needs:
   `.claude/settings.local.json`, `workflow-system/state/.session.md`, local UE config, `_ref/`
   symlinks, secrets. List them and we'll fold them into step 2.
3. **Cross-workspace messaging after the move.** Once your session lives on the mini, it can't write
   into our inbox (`/Users/stayman/Personal/projects/claudesk/workflow-system/inbox/` on the main box)
   with a plain file write. Proposal: until our next milestone builds anything for this, the mini
   session writes its message into its own repo's `workflow-system/outbox/`. The operator says "read
   tank's outbox", and we fetch it over ssh and file it locally. Does that work for you?

**Reply to:** `/Users/stayman/Personal/projects/claudesk/workflow-system/inbox/`. Send it from your
**local** session, before the move.
