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
