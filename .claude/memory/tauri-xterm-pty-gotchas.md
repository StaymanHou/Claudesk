---
name: tauri-xterm-pty-gotchas
description: Embedding xterm.js + a PTY in a Tauri WKWebView needs explicit TERM, term.focus(), and rAF-deferred fit() — none are automatic.
metadata:
  type: reference
---

Three non-obvious gotchas hit in WP7 (PtyCcSession) when wiring a real
`portable-pty` child into an xterm.js pane inside Claudesk's Tauri WKWebView.
All three were invisible to unit tests and the browser-stubbed verify-self;
they surfaced only at the live verify-human pass against real `claude` (caused
the round-1 rejection). See [[verify-self-stub-cannot-cross-subprocess-boundary]].

1. **`TERM` is not inherited under a Tauri parent.** WP2's probe ran from a
   normal terminal (inherited `TERM=xterm-256color`) so color "just worked";
   a Tauri app has no `TERM`, so the spawned child renders monochrome /
   misdetects the TTY. Set it explicitly on the `CommandBuilder`:
   `cmd.env("TERM", "xterm-256color"); cmd.env("COLORTERM", "truecolor");`
   (This was the open question WP2 flagged at `wp2-cc-pty-probe.md:67,176` —
   now confirmed real.) Related: [[cc-tui-cr-not-lf]].

2. **xterm.js does NOT auto-focus in a WKWebView.** A freshly-mounted/spawned
   pane silently drops all keystrokes — `onData` never fires — until you call
   `term.focus()`. Call it on mount (after `open`), again after the session
   spawns, and on the pane's `onMouseDown` (click-to-focus). Symptom: "the
   terminal renders but won't take any input."

3. **`fit()` in the synchronous mount effect reads a pre-layout width.** The
   container's final grid/flex width isn't settled during the synchronous
   React effect, so `FitAddon.fit()` computes a too-narrow size (e.g. ~half
   width), and pushing that size as a `cc_resize` mid-first-render makes the
   child TUI overprint/garble its banner. Defer the fit with
   `requestAnimationFrame(() => { fit.fit(); ... })`, and route every size
   sync (mount, ResizeObserver, post-spawn) through one helper so the PTY
   always gets the true fitted cols/rows. Symptom: "narrow/garbled banner,
   window resize doesn't reflow."

The fixes live in `src/components/workspace/XtermPane.tsx` and the spawn env in
`src-tauri/src/cc_session/mod.rs::PtyCcSession::spawn`.
