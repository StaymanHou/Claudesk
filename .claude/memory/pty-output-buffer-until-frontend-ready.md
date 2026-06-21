---
name: pty-output-buffer-until-frontend-ready
description: A new PTY session kind must buffer early output until the frontend attaches its listener + calls cc_ready — a quiescent shell loses its one-shot prompt otherwise.
metadata:
  type: reference
---

**A quiescent process (a shell with a one-shot prompt) is a harsher test of the PTY output path than a continuous emitter (`claude`).** This bit WP9 hard.

The race: the backend reader thread starts emitting `cc-output-<sid>` the instant the child spawns, but the frontend can only `await listen(cc-output-<sid>)` *after* `cc_spawn`/`term_spawn` returns the session id. Output emitted in that window is **lost — Tauri events are not buffered.** `claude` survives because it emits continuously (a late listener still catches subsequent frames); a shell prints its prompt **once** at startup and then waits, so a missed prompt = a permanently blank pane until you type.

**The fix (in `cc_session`):** the session holds an `OutputBacklog = Arc<Mutex<Option<Vec<String>>>>`, created `Some(empty)` at spawn (BUFFERING mode). The reader thread routes each chunk via `route_chunk`: append to the backlog while it's `Some`, emit live once it's `None`. The frontend, after attaching both `cc-output`/`cc-exit` listeners, calls the **`cc_ready(sid)`** command → `mark_ready` → `drain_backlog` flips `Some`→`None` and flushes the buffered chunks in order. `route_chunk`/`drain_backlog` are pure + lock-scoped → unit-testable without an AppHandle.

**Rule for any future PTY session kind / consumer:** after attaching your `cc-output-<sid>` listener, you MUST `invoke("cc_ready", { sessionId })`. Forget it and the backend buffers forever (the pane stays blank). The CC pane and the WP9 terminal both route through this.

Related: the *frontend* lifecycle for the same feature (spawn-effect de-dup, listener teardown) is its own minefield — keep the spawn in the proven closure-`cancelled` shape, don't tear listeners down on the spawning→live re-run, and the `cc_ready` flush happens while that run's listener is still attached so the buffered prompt lands. See [[tauri-xterm-pty-gotchas]] for the xterm-side gotchas (TERM, focus, rAF fit).
