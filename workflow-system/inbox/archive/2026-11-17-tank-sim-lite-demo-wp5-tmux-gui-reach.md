---
from: /Users/stayman/Personal/tank-sim-lite-demo
kind: note
date: 2026-11-17
summary: WP5 result. Launched from inside an SSH-started tmux running as <console-user>, the Unreal Editor reaches <console-user>'s GUI with MCP up (attached, re-attached after a drop, no client, and via claude -p: 4/4 PASS, 4 full runs). Plus one zsh gotcha for your re-attach: `attach -t =name` inside `zsh -lc` fails.
closed: 2026-11-17
outcome: accepted
resolution: noted; item 1 (zsh `=` expansion) does not affect Claudesk, whose re-attach target is quoted (`remote_cmd::tmux_attach_command`); item 2 is box ops on their side; item 3 (add their row as the console user) is an operator action; no reply needed per sender
---

# WP5 result: editor launch from inside your tmux shape works, as <console-user>

This is the 5.5 result you asked for in your 2026-11-16 reply ("Your WP5 results (5.5–5.7)
are welcome in our inbox, especially 5.5 run as <console-user>"). 5.7 (Screen Recording) was
dropped on our side; you don't need it either (terminal-only thumbnails).

## Verdict

**Pass.** From inside a tmux pane whose server was SSH-started in your shape, as <console-user>, our
canonical editor launch reaches <console-user>'s GUI session with the Unreal MCP server up. It works
while the starting link is attached, after that link is dropped and a new client re-attaches,
with no client at all, and when Claude Code itself runs the launch. **Nothing is needed from
Claudesk for this.** The only precondition is on our side: <console-user> must own the mini's console.

## What we ran

- **tmux start (your shape, our own socket):**
  `ssh -tt <console-user>@<mini-host> zsh -lc 'exec tmux -L tank5 new -A -s tank-probe -c ~/tank-smoke'`
  (an attached client, kept open from the main box). We never touched `-L claudesk`.
- **Launch:** a small launcher script, typed into the pane (so it runs as a child of the tmux server), runs:
  `open -a ~/UE_5.8/Engine/Binaries/Mac/UnrealEditor.app --args ~/tank-smoke/TankSmoke.uproject /Game/Maps/SmokeMap -ModelContextProtocolStartServer`
- **"Reaches the GUI" means all of these held:**
  - `open` exited 0.
  - The editor process is owned by <console-user> and its parent is launchd.
  - `lsappinfo` lists it as "(in front)".
  - Our project's editor driver logged ready.
  - MCP `initialize` on `127.0.0.1:8000` returned `serverInfo`.
  - A Play-In-Editor screenshot is a real rendered scene.

  The editor was quit between cases.

| Case | Context | Result | Evidence |
|---|---|---|---|
| A | starting `ssh -tt` client attached | PASS | ancestry `zsh → -zsh → tmux (ppid 1)`; ready 11–12 s; MCP +12 s |
| B | detached, starting link dropped (its two `sshd-session` processes gone, 0 clients), then a **new** `ssh -tt … tmux -L tank5 attach -t \=tank-probe` | PASS | same tmux server pid; `session_created` unchanged (attach, not new); ready 11–12 s |
| C | no client and no link; keys sent from a plain `ssh` command | PASS | 0 clients at launch; ready 11–12 s |
| D | as C, but `claude -p` in a new pane window runs the launch via its Bash tool (token from `~/.claudesk/cc-oauth-token`, exported inside the session) | PASS | ancestry `zsh → zsh → claude → zsh → tmux`; ready 12–15 s |

Repeated in 4 full runs (16/16 case results PASS; ready and MCP times above are from the two fully logged runs). Re-runnable on our side:
`Tools/Box/tmux-gui-reach.sh` plus its regression test `Tools/Box/tmux-gui-reach-test.sh`.

## Two things worth knowing

1. **⚠️ zsh `=` expansion vs `tmux attach -t =<name>`. Please check your re-attach command.**
   zsh rewrites a bare word starting with `=` into the path of the command named after it
   (the `EQUALS` option, on by default). So
   `zsh -lc 'exec tmux -L x attach -t =cd-1234abcd'` dies with
   `zsh:1: cd-1234abcd not found` **before tmux runs**. Our first run hit this exactly. Your
   2026-11-16 note gives the re-attach as `tmux attach -t =cd-<8hex>`. If that string reaches
   the mini through `zsh -lc '…'` (as your spawn command does), re-attach would fail that way.
   Note that <console-user>'s login shell is zsh too, so even a plain `ssh … tmux attach -t =x` passes
   through zsh. Fix: escape or quote it (`\=cd-…` or `'=cd-…'`), or drop the `=`. If your
   re-attach is already verified on the mini, ignore this.
2. **`launchctl managername` says `Background` in every case,** yet the editor opens in the GUI
   in front. It's not a useful signal for "will GUI apps launch". What decides it is whether the
   row's user owns the console. On the mini, the console sometimes ends up at the login window or
   with <admin-user> (we hit both today), and the launch then fails until the operator switches back to
   <console-user>. That's on our side to fix (box ops), but it can surface during an M3 session as
   "the editor won't launch".

## Reminder

Our project's row still needs to be added as **`<console-user>@<mini-host>`** (not <admin-user>) when
you're ready. No reply needed unless item 1 turns out to affect you.
