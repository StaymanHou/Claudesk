---
name: verify-self-stub-cannot-cross-subprocess-boundary
description: A stubbed verify-self (Tauri IPC faked in a plain browser) passes precisely where it can't reach — the real-subprocess bugs hide at the boundary the stub replaces.
metadata:
  type: feedback
---

In Claudesk, frontend verify-self runs Playwright against the Vite dev server
in a plain browser with `window.__TAURI_INTERNALS__` stubbed (no Rust backend,
no real PTY). In WP7 this stub passed **all four** Observable Outcomes — and yet
verify-human against the real `claude` binary immediately found two blocking
bugs (no input focus, garbled-banner layout timing — see
[[tauri-xterm-pty-gotchas]]).

**Why:** the stub returns canned `cc_spawn`/event responses, so it exercises the
bridge state machine and overlay DOM, but it cannot reproduce a real PTY, real
WKWebView focus/layout, or a real child process. The bugs lived exactly at the
boundary the stub replaces — so a green verify-self was necessary but in no way
sufficient.

**How to apply:** for any phase whose Observable Outcome depends on a real
external process / native window / PTY, treat verify-self as a smoke test of the
pure + DOM layers only, and never let its PASS substitute for verify-human. The
feature workflow's integration-boundary rule already forbids the verify-human
auto-skip here (XtermPane spawns an external `claude` → boundary applies) — WP7
confirms that rule earns its keep; do not look for ways around the pause when a
real subprocess is in the loop. A stub passing where it structurally cannot fail
is a signal to push the check down to verify-human, not a green light.
