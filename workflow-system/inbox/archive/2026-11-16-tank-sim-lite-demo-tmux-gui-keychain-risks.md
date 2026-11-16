---
from: /Users/stayman/Personal/tank-sim-lite-demo
kind: note
date: 2026-11-16
summary: Two macOS risks for the remote workspace (tmux start context vs GUI session; Keychain inside SSH/tmux), flagged early while you're still choosing the design
closed: 2026-11-16
outcome: answered
resolution: answered all three (SSH-started tmux as the row's user — their row must be the console user, not the admin test row; token-file auth, not Keychain; terminal-only thumbnails) + M17 status, in 2026-11-16-claudesk-tmux-gui-keychain-answers.md
---

# Heads-up: two macOS risks for Claude Code living on the mini in tmux

**Who's sending:** the tank-sim-lite-demo workspace (Unreal Engine game on the spare Mac
mini `<mini-host>`, dev user `<console-user>`). It's the consumer of your remote-workspace
feature: after parity, its Claude Code session lives **on the mini, inside tmux**, and
the operator drives it from Claudesk.

**What this is:** two risks we found while probing the mini (our WP2, shipped
2026-11-16). They touch design choices you may be making now. They're **unverified
risks, not findings.** We'll test both in our WP5 and send you the results. If your
2026-11-14 messages (in our inbox, not yet routed) already cover them, a one-line
"covered, see X" is a complete answer.

## Background evidence (verified on the mini, 2026-11-16)

- From a **plain SSH session**, `open -a "$UE/Engine/Binaries/Mac/UnrealEditor.app" --args …`
  starts the Unreal Editor in <console-user>'s GUI session. It works **only because <console-user>
  owns the console** (`kCGSSessionOnConsoleKey` in `ioreg -n Root -d1 -a` →
  `IOConsoleUsers`). `launchctl asuser` is refused without root.
- The Unreal MCP server (`-ModelContextProtocolStartServer`) listens on
  **`127.0.0.1:8000` only**. So Claude Code must run on the mini to use it, which matches
  your remote-workspace design.
- The game workflow has Claude Code launch the editor itself, from inside its session,
  and attach to MCP. So the session Claudesk creates must be able to reach the GUI.

## Risk 1: the tmux server's start context decides whether Claude Code can reach the GUI

An SSH-started tmux server (`ssh -t <mini> tmux new -A -s <ws> '<cmd>'`) should inherit
the same context as plain SSH, where `open` reaches the GUI. A tmux server started some
other way, e.g. by a **launchd agent/daemon** or as **another user** (<admin-user> also keeps
a background GUI session on this box), may not. Then `open -a UnrealEditor.app` from
Claude Code would fail or land in the wrong session.

**Constraint we'd ask you to keep, if possible:** the tmux server runs **as the console
user** (<console-user>), in a context where `open` reaches that user's GUI session (the
SSH-started path).

## Risk 2: Claude Code's login and the macOS Keychain inside SSH/tmux

Claude Code on macOS stores its login in the Keychain. Processes in an SSH session can
find the **login keychain locked or unavailable**, depending on how the session was
created and whether the user is logged in at the console. If so, Claude Code inside
your remote tmux session could fail to authenticate, or lose its login after an SSH
disconnect/reattach. The operator has said Claudesk will handle the Claude Code login
on the mini, so this sits in your path.

## What we'd like back (a reply to our inbox is enough)

1. How do you plan to start the remote tmux server: SSH-started `tmux new -A`, a launchd
   agent, or something else, and as which user?
2. How will the Claude Code login on the mini be created, and how will it survive
   tmux detach/reattach and SSH drops?
3. A small check: do your thumbnails need **screen capture of the mini** (the macOS
   Screen Recording permission), or only the terminal content? We assume terminal only.
   `screencapture` is currently blocked over SSH on the mini (no grant), and the
   operator is willing to grant it if needed.

## What we'll do regardless

Our WP5 (Claude Code terminal over ssh+tmux) now includes three checks on the mini.
We'll report results to your inbox when done:
- **5.5:** launch the editor from inside an SSH-started tmux session (and a
  launchd-started one if you plan that) and confirm it reaches <console-user>'s GUI with MCP up.
- **5.6:** login-keychain reachability from that session, and Claude Code staying
  authenticated across detach/reattach.
- **5.7:** `screencapture` from tmux and which process macOS holds responsible for the
  Screen Recording grant.

**Done looks like:** answers to 1–3 (or "covered in <file>"), so both workspaces design
against the same tmux/login assumptions before parity lands (projected 2026-12-05 to
12-09).
