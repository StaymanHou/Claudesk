---
name: time-tracking-capture-is-machine-global
description: "Claudesk time-analytics capture is machine-global + gated by a live tracking-ON instance — any tracking-on Claudesk records ALL CC sessions on the machine (incl. the other app's + plain-terminal work); close it and the day silently stops logging."
metadata: 
  node_type: memory
  type: reference
  originSessionId: 383a9f53-8aaa-42b4-9b41-a572c3db4b32
---

How Claudesk's M9 time-analytics **capture** actually works (verified 2026-07-13 — surfaced when the operator asked "why do prod-app activities show in the dev dashboard?"). This is **expected, known behavior**, not a bug — but it's load-bearing for reading the dashboard, so state it proactively whenever it's relevant to what the operator is looking at.

**The topology:**
- The CC hook in `~/.claude/settings.json` is **global** — one registration, fires for EVERY CC session on the machine regardless of which app (prod / dev / plain terminal) launched it, and writes to BOTH Claudesk sockets (`com.claudesk.app/hook.sock` + `com.claudesk.app.dev/hook.sock`), `exit 0` regardless of listener. Events carry `session_id`/`cwd` — **no per-app attribution**.
- So **any Claudesk instance that is running AND has time-tracking ON records EVERY CC session on the machine** — including sessions started from the *other* Claudesk app. That's why prod-app work shows in the dev dashboard: dev (tracking on) is the listener capturing everything.
- The WP5 tracking toggle gates the **DB writer inside each app**, not the hook. An instance with tracking OFF still receives events (its `status-channel.log` — the live status-dot path — fills) but writes **no `time-analytics.sqlite`**.

**Current config (as of 2026-07-13):** prod (`com.claudesk.app`) has tracking **OFF** (no `time_tracking_enabled` in its `settings.json` → default off) → no DB. Only the **dev build** (`pnpm tauri:dev`, `com.claudesk.app.dev`) has tracking ON → it's the sole thing logging. **Net practical effect (operator's own phrasing, confirmed correct): activity only gets captured while the dev build is on, and it's the dev build logging the prod app's activity too.**

**Consequences to keep in mind:**
- Capture is coupled to keeping a tracking-on instance alive. Close/crash it and the day silently stops recording even while you keep working; a *running* tracking-off instance will NOT backfill. An empty dashboard band can therefore mean "away" OR "no tracking-on instance was alive" — the dashboard doesn't distinguish them.
- Killing the tracking-on instance mid-work destroys capture for that window — see [[verify-self-dev-vs-prod-process-name-collision]] (the teardown-PID-scoping lesson; a blanket `pkill`/port-kill did exactly this on 2026-07-13, 11:19→18:48).
- Two tracking-on instances would double-write the same events to two DBs.

**If the operator wants continuous capture independent of a dev session:** turn tracking ON in the installed prod app's picker → prod creates its own DB and captures continuously. (Whether prod-tracking-on-by-default / a single-writer guard / an untracked-vs-away indicator should ship is an M9 design call the operator has, for now, decided is NOT a concern — do not re-raise it as a defect.)
