<!-- Part of the Claudesk architecture set. Index + load-bearing constraints: ../arch.md -->
# Process, PTY & session lifecycle

How Claudesk spawns, drives, and tears down the `claude` CLI and its shell siblings. The `CcSession`
trait is the stable seam — **every "drive CC" path goes through it**; `PtyCcSession` is the only impl,
and an `SdkCcSession` is the documented future swap.

## Spawn

`PtyCcSession` spawns `claude --dangerously-skip-permissions` (yolo by default — vision-explicit; a
setting opts out) with cwd = the project dir, via `portable-pty` in the Rust core.

A generic **`spawn_argv`** core backs both **`cc_spawn`** (claude) and **`term_spawn`** (a login shell,
M6 WP11 made it *N* per workspace), sharing `cc_input` / `cc_resize` / `cc_kill` commands and
`cc-output-<sid>` / `cc-exit-<sid>` events. The frontend `XtermPane` is parameterized by `spawnCommand`,
with a thin `TerminalPane` wrapper for the shell. No second process-spawning abstraction exists.

**Spawn environment.** `color_tty_env()` (`cc_session/mod.rs`) is shared by BOTH the CC spawn and the
shell spawn: `TERM`, `COLORTERM`, and — as of M10.5 WP4 — `LANG` + `LC_ALL=en_US.UTF-8`. ⚠️ A
Finder/Dock-launched `.app` inherits the minimal launchd env where **`LANG` is unset**, so the spawned
`claude`/shell defaults to `LC_CTYPE=C` (ASCII) and mangles UTF-8 output. Installed-`.app`-only —
`pnpm tauri:dev` inherits the login shell's UTF-8 `LANG` and never reproduces it.

⚠️ **`color_tty_env()` returns a FIXED-SIZE array**, so widening it to carry a new variable would leak
that variable into the raw login shell. A CC-only variable needs a **separate `cc_spawn_env`** — this is
why `CLAUDESK_DRIVE_MODE` is composed there and not in the shared env. See
[session resumption](session-resumption.md).

## ⚠️ The PTY prompt-flush invariant (load-bearing — incident-terminal-blank-cursor, 2026-06-22)

A **one-shot-emitting** PTY process — a login shell prints its prompt exactly once at startup; `claude`
does not, it streams continuously — needs **BOTH** halves of the prompt-race fix:

1. The backend **buffers output until `cc_ready`** then flushes (`PtyCcSession::mark_ready`,
   `OutputBacklog` Some→None) — *necessary*; **and**
2. the frontend `cc-output-<sid>` listener must **survive for the session's lifetime** — it must NOT be
   torn down by a transient React re-render.

**The buffer-and-flush alone is NOT sufficient:** if the listener is unlistened when the flush emits,
the one-shot prompt is lost and the pane stays blank-but-cursor. The deferred-spawn terminal path hit
this when `XtermPane`'s spawn effect keyed on `bridge.phase` and re-ran on `spawning→live`.

The contract is encoded in **`src/cc/spawnTrigger.ts`** (the spawn effect's re-run trigger set must
exclude the bridge phase) and locked by **`spawnTrigger.test.ts`**. Future terminal/PTY work touching the
spawn-effect lifecycle must preserve it: **re-spawn only on a genuine signal** (relaunch nonce /
`active` / `projectPath` / `spawnCommand`), never on a phase transition.

⚠️ **`cc_ready` names FRONTEND readiness, not CC's** — the name invites misreading
(`SURFACE-2026-08-04-CC-READY-NAME-INVITES-MISREADING-AS-CC-READINESS`).

## Input encoding

**`encodeBase64`** (`src/cc/bridge.ts`) encodes the string's real **UTF-8 bytes** (`TextEncoder`) before
base64. The earlier `charCodeAt(i) & 0xff` truncated any code unit > 0xFF or surrogate pair, so pasted
multi-byte glyphs (emoji, accented characters, arrows) reached CC as `�`.

## ⚠️ Slash-command injection — `slash_command_bytes`

**All programmatic slash-command injection goes through `slash_command_bytes`** (`cc_session/mod.rs`):
it trims trailing CR/LF and appends **exactly one `\r`**.

⚠️ **CR (0x0d), not `\n`.** Raw mode disables CR→NL translation, so an input line must end in `\r`; a
bare `\n` only triggers CC's autocomplete typeahead instead of executing the command. This applies to
every PTY-driven subprocess, not just CC.

⚠️ **Claudesk composing input on its own initiative is a DISTINCT ACT from relaying the user.** The
"byte-injection is legitimate because Claudesk *is* the terminal" argument is about **relaying
keystrokes**. `cc_input`'s callers are real xterm keystrokes (`XtermPane.tsx`) plus the auto-resume
inject; adding a third is a deliberate decision, not free reuse. (This is why WP4 cut auto-starting the
tutorial tour — see [the workflow gate](workflow-gate.md).)

## Shutdown / teardown

**As-built (M10.5 WP3).** A brief clean-exit attempt (`exit_command\r` — `/exit` for CC, `exit` for a
shell — polled 500 ms), then a **SIGHUP-first, process-GROUP** teardown:

```
killpg(pgid, SIGHUP)  →  ~300 ms grace  →  killpg(pgid, SIGKILL)  →  reap
```

The child is a `setsid` group leader (portable-pty), so `pgid == child PID` and the **group** signal
reaps CC/shell **and any subagent or child process**.

⚠️ **SIGHUP, not SIGTERM, is deliberate:** it lets an interactive login shell run its on-exit history
save (`~/.zsh_history`). SIGTERM/SIGKILL lose it (verified M10.5 WP3), so closing a workspace without
typing `exit` would silently drop the terminal's command history. *(This supersedes the earlier "sends
SIGTERM then SIGKILL" plan, which was neither as-built nor correct for history preservation.)*

**Close confirmation (M10.5 WP2).** Closing a workspace with an active session confirms first (the
QoL-WP1 gate extended with `isActiveState`); app-quit **FRONTEND-DECIDES** via a `quit-requested`
round-trip. Terminal-active is scoped CC-status-only per
`[PRIOR: explicit-selectable-mode-over-inferred-mode]`.

**On app quit:** each workspace's `CcSession::kill()` runs, `projects.json` is persisted, and the
unclean-exit flag is cleared **only** on a recognized clean-exit route — see
[session resumption](session-resumption.md).
