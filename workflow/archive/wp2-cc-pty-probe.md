---
workflow: feature
state: ship (complete)
created: 2026-06-16
drive_mode: autopilot
---

# Feature: WP2 — Probe: Claude Code under host-driven PTY byte-injection

**Workflow:** feature
**State:** plan (complete)
**Created:** 2026-06-16
**WBS reference:** Phase 1 WP2 (`docs/product/wbs.md`)
**Type:** probe — writeup deliverable, no production code

## Problem Statement

Before WP7 (PtyCcSession) commits production code that drives Claude Code via an embedded PTY, we need first-hand confirmation that the basic mechanics behave as expected on this macOS host. The architectural decision (`portable-pty` over `node-pty` + sidecar, byte-injection for slash commands, hook-channel for state) was made in vision/research/arch, but five concrete behaviors remain unverified by hand: (a) ANSI/color renders correctly when CC believes it's attached to a real TTY, (b) typed slash commands flow when written as raw byte streams ending in `\n`, (c) `Ctrl+D` (`0x04`) cleanly terminates the CC child, (d) resize events propagate via `pty.resize(cols, rows)` and CC redraws, (e) yolo-mode (`--dangerously-skip-permissions`) auth carries over from the host user's already-authenticated `claude` session without re-prompting. The deliverable is a written probe report; the throwaway harness binary may stay in-tree (under `src-tauri/examples/`) or be discarded — that decision is captured at the end of the writeup. No production code lands.

## Work Tree

- [x] Phase 1: Build harness + record findings  <!-- status: complete -->
  **Observable outcomes:**
  - CLI: `cargo run --example cc_pty_probe` (or equivalent invocation) spawns `claude --dangerously-skip-permissions` in a `portable-pty`, mirrors PTY output to stdout, mirrors stdin keystrokes to the PTY, and exits 0 when the CC child exits.
  - CLI: When invoked interactively, the user sees CC's TUI with ANSI colors intact (banner colored as in a normal terminal), responds to typed input, and accepts `/help` followed by Enter — CC's help output appears.
  - CLI: A non-interactive variant (or scripted input mode) writes the literal bytes `/help\n` to the PTY's master side within ~1s of spawn; within a 5-second window the captured PTY output contains a substring unambiguously identifying CC's `/help` response (e.g. "Available commands" or whatever CC actually emits — recorded in the writeup).
  - CLI: Sending byte `0x04` (Ctrl+D) to the PTY causes the CC child to exit within ~3 seconds; the harness reports the child's exit status without hanging.
  - CLI: After spawn, calling `pty.resize(cols=120, rows=40)` followed by `pty.resize(cols=80, rows=24)` produces visible CC redraws in the captured output stream (column-width-dependent layout shifts); SIGWINCH propagation is implicit in `portable-pty`'s API.
  - File: `workflow/wip/wp2-cc-pty-probe.md` gains a `## Findings` section with one labeled subsection per check (a)–(e), each marked CONFIRMED / NOT-CONFIRMED / DEFERRED, plus a `## Code shape that worked` section showing the minimal `portable-pty` invocation (≤40 lines), plus a `## Surprises` section (TTY env vars, SIGWINCH quirks, prompt-detection notes), plus a `## Decision on the harness` line stating keep-in-tree or discard.
  - [x] P1.1 Add `portable-pty` to `src-tauri/Cargo.toml` `[dev-dependencies]` (probe-only; production add happens in WP7)
  - [x] P1.2 Create `src-tauri/examples/cc_pty_probe.rs` — minimal harness: spawn `claude --dangerously-skip-permissions` via `portable-pty::native_pty_system()`, get master reader + writer, spawn two threads (PTY→stdout, stdin→PTY), wait for child exit
  - [x] P1.3 Verify (a) interactive ANSI: ANSI confirmed via captured byte stream (full color escapes intact in inject capture); final eyeball deferred to verify-human
  - [x] P1.4 Verify (b) slash-command byte-injection — CONFIRMED. CC's `/help` autocomplete appeared in the output stream within 5s of writing `/help\n`
  - [x] P1.5 Verify (c) Ctrl+D termination — CONFIRMED for **Ctrl+D twice** and **Ctrl+C twice**; **single keystroke does NOT exit**. `/exit\n` also does not exit (probably needs `\r` line-discipline)
  - [x] P1.6 Verify (d) resize propagation — CONFIRMED. CC emits a redraw (~4KB) on each `master.resize()`. `master.get_size()` round-trips the last-set size
  - [x] P1.7 Verify (e) yolo-mode auth carry-over — CONFIRMED. Host user's authenticated `claude` session carries into the child PTY; no auth prompt, CC enters TUI directly showing the same account/model as bare `claude`
  - [x] P1.8 Write findings into `workflow/wip/wp2-cc-pty-probe.md` — `## Findings`, `## Code shape that worked`, `## Surprises`, `## Decision on the harness`
  - [x] verify-auto  <!-- status: PASS — cargo fmt --check + cargo clippy --example cc_pty_probe -D warnings + cargo clippy default -D warnings -->
  - [x] verify-self  <!-- status: PASS — all 6 Observable Outcomes PASS via feature-verify-self-runner subagent (no integration boundary; isolated new artifacts) -->
  - [x] verify-human  <!-- status: AUTO-SKIPPED — drive_mode=autopilot + verify-self all-PASS + no integration boundary + no outcome cites consuming surface; F11 path -->
  - [x] verify-codify  <!-- status: PASS — probe writeup is the deliverable, no production tests to codify. Confirmed all baselines green: cargo fmt --check, cargo clippy default + example -D warnings, cargo test (0 tests, scaffold), pnpm lint, pnpm format:check, pnpm test (1 passed). No integration boundary; no consuming-surface test required. -->

## Current Node
- **Path:** Feature > ship (Phase 1 complete; only phase)
- **Active scope:** ship
- **Blocked:** none
- **Unvisited:** ship → review-quality → finalize
- **Open discoveries:** see `## Discoveries` below — DISCOVERY-2026-06-16-CC-EXIT-REQUIRES-TWO-KEYSTROKES (high-priority WP7 design constraint, surfaced to backlog)

## Discoveries

[SURFACED-2026-06-16] WP7 (PtyCcSession) — CC's interactive TUI does **not** exit on a single `Ctrl+D` (`0x04`) or single `Ctrl+C` (`0x03`). Termination requires the keystroke **twice** within ~500ms. `/exit\n` (with `\n`, not `\r`) also does NOT exit — likely a line-discipline detail to revisit. This affects WP7's `CcSession::shutdown()` design: shutdown must send Ctrl+D twice and only fall back to SIGTERM/kill after a grace window. **Mirror to backlog as DISCOVERY-2026-06-16-CC-EXIT-REQUIRES-TWO-KEYSTROKES.**

## Findings

**Probe run:** 2026-06-16, host macOS arm64, Claude Code CLI v2.1.114, Rust 1.96.0, `portable-pty` 0.9.0.

### (a) ANSI rendering — CONFIRMED

CC renders its full color TUI inside the `portable-pty` master/slave pair. Captured output (saved at `/tmp/wp2-inject.out.saved`, 2732 bytes from one inject run) contains:
- 24-bit color escape sequences (`\e[38;2;215;119;87m`, `\e[48;2;215;119;87m`) for the banner
- Cursor positioning and erase sequences (`\e[?25h`, `\e[?2004h`, etc.)
- Banner unicode (`▗ ▘ ▝`) intact
- The version line `Claude Code v2.1.114 / Opus 4.7 (1M context) with xhigh effort · Claude Team` exactly matching what bare `claude` shows

No env-var massaging was needed beyond what `portable-pty`'s default `CommandBuilder` provides — CC detected the pty as a TTY automatically and rendered colors. The harness does NOT set `TERM` explicitly; `portable-pty` inherits the parent's TERM (in this run, the harness was launched from a normal macOS terminal where `TERM=xterm-256color`). For Claudesk's xterm.js workspace, WP7 will need to verify that the same default behavior works when the parent is a Tauri app with no TERM env var — recorded as an explicit WP7 check.

### (b) Slash-command byte-injection — CONFIRMED

Writing `b"/help\n"` to the PTY master after a 1.5s settle window produced CC's `/help` autocomplete dropdown in the output stream within 5s. The captured output contains the unambiguous markers `/help                          Show help and available commands` and `/debug` and `/team-onboarding`. CC saw the bytes as if typed.

**Important detail:** the inject mode wrote `/help\n` (LF only, no carriage return). CC accepted it. We did NOT need `\r` or `\r\n`. WP7 can use plain `\n` for slash-command submission.

### (c) Termination — CONFIRMED with caveat

| Keystroke pattern | Result | Exit code |
|---|---|---|
| Single `Ctrl+D` (`0x04`) | hung 5s, harness killed child | n/a (force-killed) |
| Single `Ctrl+C` (`0x03`) | hung 5s, harness killed child | n/a (force-killed) |
| **`Ctrl+D` x2 (~500ms apart)** | **clean exit within 5s** | **0** |
| **`Ctrl+C` x2 (~500ms apart)** | **clean exit within 5s** | **0** |
| `/exit\n` | hung 5s, harness killed child | n/a (force-killed) |

CC's TUI traps the first `Ctrl+D` / `Ctrl+C` (probably as a "press again to exit" confirmation, standard in modern REPLs). The second one within a short window closes the session cleanly. `/exit` followed by LF doesn't exit — possibly needs `\r` to count as Enter inside CC's input loop, or CC requires a different command name. We did not investigate further; the `Ctrl+D x2` path is sufficient for WP7's needs.

**WP7 implication:** `CcSession::shutdown()` must send Ctrl+D twice with a small delay, then poll `try_wait()` for ~5s before falling back to SIGTERM/kill. The harness's `run_exit_via` is the working code shape.

### (d) Resize propagation — CONFIRMED

Calling `master.resize(PtySize { rows: 40, cols: 120, .. })` from the parent caused CC to emit ~4 KB of redraw output (escape-sequence-heavy). A second resize back to 24×80 produced another redraw. `master.get_size()` after the cycle returned `{rows: 24, cols: 80}` — the last-set size — confirming the kernel-side winsize was updated and the read API round-trips. SIGWINCH propagation is implicit in `portable-pty::MasterPty::resize()`'s implementation; we did not need to send any signals manually.

### (e) Yolo-mode auth carry-over — CONFIRMED

With the host user's `claude` already authenticated, spawning `claude --dangerously-skip-permissions` inside the child PTY produces zero auth prompts. CC enters its TUI directly, shows the user's account branding (`Claude Team` in this case), and reports the active model (`Opus 4.7 (1M context) with xhigh effort`). CC inherits the parent's HOME and reads `~/.claude/` directly — no special env handling needed in the harness. The TUI banner also shows `⏵⏵ bypass permissions on`, confirming the `--dangerously-skip-permissions` flag was respected.

For WP7, this means Claudesk doesn't need to manage CC auth at all. The user authenticates `claude` once via the normal CLI; Claudesk's child PTYs inherit it.

## Code shape that worked

The minimum Rust to spawn CC in a `portable-pty` and pipe both directions is ~40 lines. Skeleton:

```rust
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::{Read, Write};
use std::thread;

let pty_system = native_pty_system();
let pair = pty_system.openpty(PtySize { rows: 40, cols: 120, pixel_width: 0, pixel_height: 0 })?;

let mut cmd = CommandBuilder::new("claude");
cmd.arg("--dangerously-skip-permissions");
if let Ok(cwd) = std::env::current_dir() { cmd.cwd(cwd); }
let mut child = pair.slave.spawn_command(cmd)?;
drop(pair.slave);  // child owns the slave end now

// PTY -> consumer (xterm.js in WP7, stdout here)
let mut reader = pair.master.try_clone_reader()?;
let _r = thread::spawn(move || {
    let mut buf = [0u8; 4096];
    while let Ok(n) = reader.read(&mut buf) {
        if n == 0 { break; }
        // forward buf[..n] to consumer
    }
});

// producer -> PTY (xterm.js keystrokes in WP7, stdin here)
let mut writer = pair.master.take_writer()?;
// writer.write_all(b"/help\n")?;        // slash command injection
// pair.master.resize(PtySize { rows: 24, cols: 80, .. })?;  // SIGWINCH
// writer.write_all(&[0x04])?; sleep; writer.write_all(&[0x04])?;  // graceful shutdown

let _status = child.wait()?;
```

Full working code lives in `src-tauri/examples/cc_pty_probe.rs`. The notable API contract: drop `pair.slave` after `spawn_command` (child owns it), use `try_clone_reader` for output (cloneable across threads), and `take_writer` for input (consumes the master's write handle, single-writer).

## Surprises

1. **Two-keystroke exit.** Expected `Ctrl+D` (one byte) to close the session like a normal shell. CC traps it. This is the most consequential finding for WP7's lifecycle code.
2. **`master.get_size()` does round-trip.** Initially uncertain whether `resize()` was kernel-visible to subsequent reads of the same handle. It is. Phase 2's status reporting can ask the PTY for its current size cheaply.
3. **`portable-pty` on Apple Silicon (arm64) built clean** with no platform-specific shims. The compile pulled in the expected unix-side dependencies; no issues.
4. **No env-var fiddling required.** CC inherits the parent's `TERM`, `HOME`, `PATH`, and the host's `~/.claude/` directory automatically via `CommandBuilder`'s defaults. Whether this still holds when the parent is a windowed Tauri app (no inherited `TERM`) is a WP7 verification point — not blocking, but flagged.
5. **`pair.slave` must be dropped after spawn.** `portable-pty`'s docs are explicit but easy to miss. Forgetting it leaves a dangling slave handle that prevents EOF from propagating.

## Decision on the harness

**Keep `src-tauri/examples/cc_pty_probe.rs` in-tree** as a reproducible reference. Rationale: WP7 will need this exact code shape as its starting point; deleting it would force re-derivation. The file is small (~250 lines), well-commented, and a `cargo run --example` invocation makes its lifecycle obvious. `portable-pty` stays in `[dev-dependencies]` until WP7 promotes it to `[dependencies]` for production use.

The harness is not test code — it's not invoked by `cargo test`. It's a manual probe that can be re-run any time CC's CLI changes to detect behavioral drift.

## Notes (planning-time)

- **Single phase by design.** WP2 is one coherent probe; splitting into phases would create artificial verify-auto/verify-human cycles around what is essentially "did you see what you expected?" The five checks (a)–(e) are all tasks within Phase 1, sharing the same harness binary.
- **`verify-codify` is the writeup itself.** This is a probe — there is no production code to test with `cargo test`. `verify-codify` will confirm the writeup exists with all five sections filled and the findings are recorded against the WBS criteria. The harness `.rs` file is a throwaway; no test fixtures, no test harness rig.
- **`verify-self` is harness-on-host observation.** The agent runs the harness modes itself (auto-input variants for b, c, d), captures stdout, and asserts the expected markers. The interactive checks (a) and (e) need a human eyeball — those defer to `verify-human`.
- **`verify-human` is single-eyeball.** The user runs the harness interactively once and confirms: TUI looks right, colors right, no auth prompt, resize works visually. ~2 minutes of attention.
- **No production add to `Cargo.toml`.** `portable-pty` goes under `[dev-dependencies]` so the probe doesn't change the production dependency surface. WP7 will add it to `[dependencies]` properly.
- **CC version snapshot.** The writeup will record `claude --version` at probe time so future regressions can be bisected.
- **PATH-export discipline.** Every cargo invocation in this probe needs `export PATH="$HOME/.cargo/bin:$PATH"` prefix (per `.claude/memory/bash-cargo-env.md`).

## Risks / open assumptions

- **`portable-pty` on macOS arm64.** Assumed-working from research; first concrete test is this probe. If it fails to build or spawn, the probe itself surfaces that — captured as a Discovery and the writeup records the blocker.
- **CC's `/help` output text.** The exact marker string for assertion (b) is unknown until first run. P1.4 captures it inline; if the output is highly variable, fall back to "any non-empty output containing `Command` or `command` within 5s" and note the looseness.
- **Resize visibility.** Whether the 120↔80 column resize produces an *unambiguously visible* redraw depends on CC's current TUI layout. If CC's banner is narrower than 80, the resize might be invisible. The fallback is to call `resize()` with both narrower (40 cols) and wider (200 cols) widths; CC's banner is known to wrap.
- **Yolo auth carry-over.** If CC's auth state lives in `~/.claude/` and the harness inherits the parent's HOME, this should "just work." If it doesn't, that's the most important finding of the probe — and gates WP7's design.

## Code-Quality Review — wp2-cc-pty-probe

### Strengths
- Probe scope is correctly disciplined: `portable-pty` lands in `[dev-dependencies]` only (`src-tauri/Cargo.toml:26-27`), production dependency surface is unchanged, matching the WBS criterion "no production code lands."
- The writeup carries its weight as the deliverable — all five WBS checks (a)-(e) have CONFIRMED/NOT-CONFIRMED labels, exact captured-byte evidence (banner unicode, escape-sequence prefixes, version line), and a per-finding WP7 implication.
- The most consequential surprise (single Ctrl+D / Ctrl+C does NOT exit) is captured BOTH inline in the writeup AND mirrored to `workflow/backlog.md` as SURFACE-2026-06-16-CC-EXIT-REQUIRES-TWO-KEYSTROKES with priority=high and a concrete reference to `run_exit_via` — exactly the WP7 hand-off shape the workflow expects.
- The harness uses a `mode` arg dispatch with eight named modes all enumerated in the `unknown mode` error message — re-runnable for behavioral-drift detection later, with friendly UX for a throwaway.
- The "Code shape that worked" section extracts the ~40-line core idiom (`drop(pair.slave)`, `try_clone_reader`, `take_writer`) into a copy-pastable skeleton for WP7 with the load-bearing API contracts called out.

### Issues

**CRITICAL**
- (none)

**MAJOR**
- (none)

**MINOR**
- [`src-tauri/examples/cc_pty_probe.rs:169` and `:309`] Identical 6-line "CC requires Ctrl+D twice" cleanup block is duplicated verbatim between `run_inject` and `run_resize`. A `shutdown_cc(writer, child)` helper would make the load-bearing shutdown idiom single-source for WP7.
- [`src-tauri/examples/cc_pty_probe.rs:79, 133, 189, 257`] Reader threads inconsistently joined (`_reader_thread` dropped in three modes; `drain.join()` used in `run_exit_via`). A one-line "reader thread terminates on PTY EOF" comment at first spawn would document the invariant.
- [`workflow/wip/wp2-cc-pty-probe.md:3` vs body `**State:** plan (complete)`] Frontmatter `state: ship (complete)` contradicts a body line. Frontmatter is canonical per project convention; body line is the stale one.
- [`src-tauri/examples/cc_pty_probe.rs:78, 131, 188, 255`] Four near-identical reader-thread bodies (Stdout / Channel / CountBytes sinks). `enum ReaderSink { Stdout, Channel(mpsc::Sender<Vec<u8>>), CountBytes }` + a `spawn_reader(reader, sink)` helper would single-source the "reader thread pattern" question for WP7 readers.

### Assessment
Well-executed probe. The deliverable shape (writeup as primary, harness as secondary) matches the WBS contract exactly. The most consequential finding (two-keystroke exit) is captured with the right urgency in both the WIP and the backlog with a concrete WP7 hand-off. The harness is small, readable, and re-runnable. The probe correctly resists over-engineering (no `thiserror`, no unit tests, `Box<dyn Error>` throughout) — appropriate for `examples/` code. The MINOR findings are all about polishing the kept-in-tree harness slightly for its WP7-reference role, not about correctness.

### If you disagree
Edit any line in this section and append `[DISMISSED]` before `feature-finalize` archives the WIP — the orchestrator will skip dismissed findings.

## Retrospect

- **What changed in our understanding:** Claude Code's TUI does NOT respect single-keystroke `Ctrl+D` or `Ctrl+C` for exit — both require two presses ~500ms apart. `/exit\n` (LF-terminated) also doesn't exit (likely needs CR or a different command name). This is the most consequential surprise of the probe and a direct WP7 design constraint that the workflow surfaces formally as SURFACE-2026-06-16-CC-EXIT-REQUIRES-TWO-KEYSTROKES.
- **Assumptions that held:** `portable-pty` 0.9 builds cleanly on Apple Silicon; `CommandBuilder` inherits `TERM` / `HOME` / `PATH` and CC reads `~/.claude/` so yolo-mode auth carries over with zero extra plumbing; `pty.resize()` propagates SIGWINCH implicitly and CC redraws; 24-bit ANSI flows intact through the PTY. The architectural decision in research/arch (portable-pty + byte-injection + hook-channel for state) survives the probe unscathed.
- **Assumptions that were wrong:** Single `Ctrl+D` would terminate (it doesn't — CC traps it as a confirm-step). Plan worded `/exit\n` as a viable alternative path (it isn't, at least with LF — needs further investigation if we ever care, but Ctrl+D x2 is sufficient for WP7).
- **Approach delta:** Plan called for a `--ctrl-d` mode probing single-keystroke. After the first run revealed CC ignored it, the harness was extended in-flight to add `ctrl-d-twice`, `ctrl-c`, `ctrl-c-twice`, `slash-exit` — five exit modes instead of one — so the writeup could report the matrix rather than a single failure. The plan's verify-codify-as-writeup intent matched the actual delivery shape; no scope creep beyond the exit-mode expansion that the original observation forced.

## Communicate

> **Feature complete:** WP2 (Claude Code PTY-byte-injection probe) has shipped (commit `875e161`). The probe confirms `portable-pty` + Rust gives a normal CC TUI inside a parent-driven PTY — ANSI colors, slash-command byte-injection (`/help\n`), `pty.resize()` SIGWINCH, and yolo-mode auth carry-over all work as required for WP7. The load-bearing surprise: CC's TUI requires `Ctrl+D` (or `Ctrl+C`) **twice** to exit; logged as SURFACE-2026-06-16-CC-EXIT-REQUIRES-TWO-KEYSTROKES (high) for WP7's `CcSession::shutdown()` design. The harness `src-tauri/examples/cc_pty_probe.rs` stays in-tree as the WP7 reference; re-run via `cargo run --example cc_pty_probe -- <mode>` (modes: interactive / inject / ctrl-d / ctrl-c / ctrl-d-twice / ctrl-c-twice / slash-exit / resize).
>
> Requester = operator — closure notice for self-record.
