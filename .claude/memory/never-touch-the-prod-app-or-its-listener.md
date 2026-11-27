---
name: never-touch-the-prod-app-or-its-listener
description: The operator's PROD Claudesk (/Applications/Claudesk.app) is live infrastructure for every CC session on the machine; never kill, restart, signal or stress anything of it, and report a prod status-dot loss with the status-channel.log timeline, not a guess.
metadata:
  type: feedback
---

The installed **prod** Claudesk (`/Applications/Claudesk.app/Contents/MacOS/claudesk`, data dir
`~/Library/Application Support/com.claudesk.app/`) carries the status dots for EVERY Claude Code
session on the machine, the operator's other projects and remote (mini) workspaces included. The
operator, 2026-11-27, after its dots went stale: "don't kill the prod app's monitor/listener
again!!! don't know how many times already!!!"

**How to apply:**
- Kill ONLY processes you launched, by PID, after reading the full command line
  (`ps -o pid,lstart,command -p <pid>`). The dev stack is `tauri.js dev`, `vite.js`, the
  `esbuild --service` child and `target/debug/claudesk`. Never `pkill`/`killall`/name-match
  `claudesk`: prod shares the process name ([[verify-self-dev-vs-prod-process-name-collision]]).
- Never touch: the `/Applications/Claudesk.app` process, its `ssh -M … -S …/com.claudesk.app/ssh/…`
  link masters and their `ssh -S … -tt` children, `com.claudesk.app/hook.sock`, or
  `~/.claude/settings.json` hook entries.
- A pgrep for the dev app must match `tauri.js dev` (not `tauri dev`) and `target/debug/claudesk`;
  a pattern that misses the dev app leads to wrong "nothing running" claims.
- Rust edits (including MUTANTS) restart a running `pnpm tauri:dev` app on every save: dozens of
  dev restarts in a mutation session. Prefer stopping the dev app before a Rust mutation batch.
- When the operator reports prod lost track, build the timeline from
  `com.claudesk.app/status-channel.log` (epoch-ms lines; find the gap and where `resolved=ws-…`
  turned into `resolved=none`) and `log show … 'eventMessage CONTAINS "Process death"'`, then state
  what the evidence shows.

**What the 2026-11-27 timeline showed:** prod's routing went `resolved=none` at 09:51:09 and its
listener went silent at 09:54:14.116 (mid-pair: the PreToolUse arrived, its PostToolUse 89 ms later
did not); prod's process stayed alive until the operator restarted it at 10:33. The agent's kills
(dev PIDs only) came later, at ~09:56. A prod-side cause fits the silence:
`hook_socket::accept_loop` serves one connection at a time with no read timeout, so one hook client
that never closes (e.g. a stalled forwarded channel from a remote host) deafens the listener for
every session. Backlogged as `SURFACE-2026-11-27-HOOK-LISTENER-ONE-STUCK-CONNECTION-DEAFENS-ALL`.
