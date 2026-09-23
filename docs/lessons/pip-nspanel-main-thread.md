# PiP / NSPanel window ops MUST run on the main thread

**M5 WP5, commit `f6e3929`.**

Any `std::thread` / timer / spawned path that calls a PiP window operation
(`pip::commands::pip_set_visible` → `PanelBuilder::build` / `order_front_regardless` / `hide`, or any
NSPanel mutation) **MUST** hop back to the main (UI) thread:

```rust
app.run_on_main_thread(move || { /* … window op here … */ });
```

## Why this is worth a whole doc

⚠️ **Off-main-thread AppKit window ops abort the whole process with a native exception and NO Rust
panic.** That means:

- **Invisible to `cargo test`.**
- At runtime it presents as **clean-launch-then-silently-die**.

In M5 WP5 the app self-exited ~3 s after launch — exactly when the auto-summon debounce timer fired.
It was diagnosed **empirically via per-second alive-tracking, not by static reading**. There is no
stack, no error, and nothing in the logs to grep for.

## What is already safe

Tauri `#[command]` fns **and** the `on_window_event` closure already run on the main thread. So
command-driven paths (`pip_set_mode`, the focus handler's synchronous hide) are safe as written.

## ⚠️ The same fact cuts the other way: a sync command must never BLOCK

A synchronous `#[tauri::command]` runs on the main thread, so anything it waits on (a
`thread::sleep`, a `join`, a child process's `wait`/`output`) freezes the whole UI for that long.
This is not hypothetical:
- The P1 of 2026-08-25 was `cc_kill` → `PtyCcSession::kill` → `poll_reaped` → `thread::sleep`, three
  calls below a body that looked harmless.
- Paydown 2026-09-23 WP9 found two more: `supervisor_adjudicate`, which waited on `claude -p`, and
  `workflow_uninstall_dry_run`, which waited on `uninstall.sh` with no timeout.

**The guard is `src-tauri/tests/sync_commands_do_not_block.rs`.** It parses the crate with `syn`
and follows calls transitively, so it fails on the pre-fix `cc_kill`. A flagged command has two
fixes:
- move the wait to a worker (`SessionRegistry::take` + `thread::spawn`), or
- make the command `async` (`async fn` + `tauri::async_runtime::spawn_blocking` for long waits, or
  `#[tauri::command(async)]` for short ones).

The guard's `LEDGER` holds the accepted exceptions, each with a reason. ⚠️ **What it cannot see:**
- **a lock held across a main-thread marshal** (the incident's other fault, `tray::reconcile`);
- calls inside macros, and fns passed as values.

Those still need review. ⚠️ `run_on_main_thread` from a sync command is NOT an escape hatch: the
closure runs on the main thread too, and the guard walks it.

## What bites

**Only code that hops onto a background thread.** The auto-summon debounce is the canonical example:
sleeping off-thread is fine; the *show* must be marshaled back — and the cancel-token plus a
freshly-read mode must be **re-checked inside the main-thread closure**, to close the
off-thread→main-thread race.

## Where it will recur

M6's menu-bar work and any future PiP/NSPanel timer or async path hit the same seam.

## Related

- Memory: `[[tauri-nspanel-pip-gotchas]]` — four AppKit gotchas for PiP, each found via a live crash
  at verify-human.
- `workflow-system/product/arch/status-channel-and-surfaces.md` — the surrounding as-built architecture.
