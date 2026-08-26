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

⚠️ **`slash_command_bytes` is the RUST-side rule and is NOT reachable from the frontend** — it is not
a `#[tauri::command]`, and its one production caller is the shutdown `/exit`. A **button** injects via
`injectCommand`/`slashCommandPayload` (`autoResumeFire.ts`) → `invoke("cc_input", …)`.
`slashCommandPayload` is the deliberate TS **mirror** of the Rust helper, pinned byte-for-byte by
`autoResumeFire.test.ts`. ⚠️ **Two implementations of one rule is intended — keep them in step, do not
"unify" them.** (Corrected 2026-08-14: an earlier revision called `slash_command_bytes` "the
PTY-injection primitive", which would send a button implementer to a function no button can call.)

⚠️ **Claudesk composing input on its own initiative is a DISTINCT ACT from relaying the user.** The
"byte-injection is legitimate because Claudesk *is* the terminal" argument is about **relaying
keystrokes**. (This is why WP4 cut auto-starting the tutorial tour — see
[the workflow gate](workflow-gate.md).)

**The composing callers, as built (M13):**

| Caller | Label | Fires |
|---|---|---|
| `XtermPane.tsx` | — | real keystrokes (relay, not composition) |
| auto-resume (M12) | `auto-resume` | `/session-restore` at workspace open |
| skill-button row (M13 WP2) | `skill-button` | the five fixed commands, on click |
| Recycle (M13 WP3) | `recycle` | `/session-handoff`, then `/session-restore` into the fresh session |

⚠️ **The `label` argument exists because it had to.** WP2 reused the funnel and inherited a hardcoded
`auto-resume:` prefix, so every *button* failure was attributed to M12's *automatic* arm — and
`console.warn` is the only failure channel this path has (no overlay, by operator decision), so a
misattributed prefix points the one available diagnostic at the wrong feature.

⚠️ **Recycle's teardown reuses the pane's existing `handleRelaunch` — NOT Ctrl+D.** The roadmap line
says Ctrl+D; that is not what shipped. Reusing the relaunch path means kill → clear the spawn-once
latch → one nonce-bump, so **no second respawn route exists**. It also means Recycle's fresh spawn
goes through `cc_spawn` and therefore inherits `cc_spawn_env` — so the drive-mode signal is acquired
for free, with nothing built for it (WP1 Q4).

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

## Turn-output reorientation — jumping to turn starts (M13.5 WP3, `2086ae8`)

A single CC turn can run 10+ minutes and 100+ lines, so locating **where the last turn's output
began** is a real attention cost. Shipped as bidirectional position-based navigation: `↑ N/N ↓` in the
**ungated** `workspace-split-control` cluster (⚠️ **not** the skill row — that is gated wholesale, so
an ungated affordance must not live there; a "turn" is a plain Claude Code concept every user has).

**The signal:** `is_turn_start` on `WorkspaceStatusUpdate` + `event_is_turn_start` (backend), with an
end-to-end socket test proving **exactly one** turn-start per multi-tool turn. `turnMarkers.ts` owns
the walk/eviction/`inertAfter` model. Navigation primitive: xterm `registerMarker` + `scrollToLine`.

⚠️ **THREE REFUTATIONS BANKED HERE — each closed real work on a false basis. Do not re-derive them.**

1. **"CC runs in the xterm ALTERNATE buffer, so markers/decorations can't work"** — **FALSE**, and it
   voided a whole escalation. Measured on a live CC pane (v2.1.245): `buffer.active.type` is
   **`"normal"`**, `buffer.active === buffer.normal` is **`true`**, `buffer.alternate.length` is
   **`0`** (never used at all), and `onBufferChange` fired **0** times across a full turn *and* a
   `/clear`. **CC repaints the normal buffer; it never switches.** That claim was written from a
   **doc comment** instead of a one-line runtime read.
2. **The real cause of three failed attempts was a one-line config omission** —
   `registerDecoration` is xterm **proposed API** and throws without `allowProposedApi: true`, which
   is set **nowhere** in this codebase. Proven by controlled A/B. ⚠️ **The throw was SILENT in
   production** (un-caught inside a listener), presenting as "nothing renders" and sending three
   rounds of debugging at the wrong layer.
3. **The shipped defect was a VIEWPORT CLAMP, not the mechanism** — the newest turn's start sits
   inside the final screenful, so `scrollToLine` clamped and the caller read that as a successful
   jump. ⚠️ **"The click landed" is therefore not evidence of a jump**; read `viewportY` before/after.

⚠️ **Scrollback accumulates abundantly** (one 120-line turn: `buffer.length` 68→146, `baseY` 0→78),
and **`/clear` does not reset it** — it *grew* the buffer (146→151). CC's `/clear` clears its
conversation, not the terminal scrollback. The `scrollback: 10000` raise stands on its merits.

⚠️ **One question remains OPEN, and it is presentation-only:** the overview **ruler** never painted
even with terminal-level `overviewRuler.width` set — the canvas was created (14×884, correctly
positioned) but painted **0 non-zero pixels** across 4 decorations, both `position` values,
`refresh()`, scroll nudges and a real turn. Untested hypothesis: the ruler is **canvas**-based while
this app is **DOM-renderer only** by hard rule (zero `<canvas>` elements existed before one was
forced). ⚠️ **Partially resolves** `SURFACE-2026-07-14-TURN-OUTPUT-REORIENTATION` — 1 of its 4
directions; the **answer-burial** half (an inline answer buried by continued task output) remains open.

⚠️ **THE PROCESS LESSON — a REFUTATION NEEDS THE SAME EMPIRICAL BAR AS A CLAIM, arguably higher,
because a refutation CLOSES work.** This one was built from typings, earned three rounds of trust,
escalated a WP out of its milestone, and marked working code as dead. The cheap mechanical test both
times was *"does any shipped code already call this API in this context?"* — `grep` said **no**, twice.
Filed `SURFACE-2026-08-25-REFUTATION-FROM-TYPINGS-NOT-RUNTIME`.
