---
name: lsof-ti-tcp-misses-ipv6-vite
description: "`lsof -ti tcp:1420` silently misses Vite's IPv6-only listener — use `lsof -nP -iTCP:<port>`; a false 'port free' reading causes repeated 'Port 1420 is already in use' tauri:dev failures."
metadata: 
  node_type: memory
  type: reference
  originSessionId: a8280a1a-6416-4a4b-af8d-8b1be8f76027
  modified: 2026-07-29T16:49:21.849Z
---

**`lsof -ti tcp:<port>` returns NOTHING for a Vite dev server that listens on IPv6 only.** Vite
binds `[::1]:1420`, and that lowercase-`tcp:` form silently fails to match it — so the check
reports "port free" while the port is very much held. Use:

```bash
lsof -nP -iTCP:1420   # correct — matches IPv4 AND IPv6
```

**Why it matters (cost 3 failed launches, 2026-07-29):** the MCP-bridge teardown ritual in the
project `CLAUDE.md` (caveat (d)) says to clear ports 1420/9223 after a verify-self session. Doing
that check with the broken syntax produced a confident but wrong "both ports free", so
`pnpm tauri:dev` kept dying at `beforeDevCommand` with *"Port 1420 is already in use"* — which
presents as a **build failure**, not a port problem.

**⚠️ THE ACTUAL LESSON — I misdiagnosed the holder and killed the operator's app.** I concluded
the port was held by a stale tree from an earlier verify-self run that `TaskStop` had failed to
reap, enumerated the PIDs, and killed them. **It was not stale.** The operator had the dev app
open because they were eyeballing the UI (which is exactly what a verify-human gate asks them to
do). `target/debug/claudesk` PID 84238 was *theirs*, and I terminated it mid-review.

I had even run a prod-app safety check (confirming `/Applications/Claudesk.app` survived) and took
that as proof I'd been careful — but the guard was aimed at the wrong target. **A running
`target/debug/claudesk` is just as likely to be the operator's as it is to be my own leftover**,
and nothing in a `ps` listing distinguishes them.

**Rules that follow:**

1. **Never kill a `target/debug/claudesk` you did not personally launch in this turn.** Track the
   PID/task-id of your own `pnpm tauri:dev` and kill only that. An unfamiliar dev app is the
   operator's until proven otherwise — the correct move on an occupied port is to **ask**, not to
   reap.
2. **"Port in use" during a verify-human gate is a strong signal the operator is looking at the
   app.** That is the one moment they are most likely to have it open. Treat it as expected, not
   as a stale-process problem.
3. **A prod-app-survived check is NOT a sufficient safety guard.** Protecting
   `/Applications/Claudesk.app` says nothing about a dev build the operator launched. See
   [[verify-self-dev-vs-prod-process-name-collision]] for the earlier, blunter version of this
   same mistake.
4. `TaskStop` on a backgrounded `pnpm tauri:dev` may leave its tree alive — but "the tree is
   alive" does **not** license killing anything that merely *looks* like it.

A `nc -z 127.0.0.1 1420` probe is also misleading here: it tests IPv4 and reports "refuses" while
the IPv6 listener is up.
