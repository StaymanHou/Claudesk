---
workflow: feature
state: ship (complete)
created: 2026-09-28
drive_mode: autopilot
entry: reproduce (bug-fix feature)
---

# Feature: Silent supervisor — make the workflow supervisor fire again

**Workflow:** feature
**State:** ship (complete)
**Created:** 2026-09-28
**Entry:** reproduce (bug-fix feature)
**Backlog:** `SURFACE-2026-09-14-SUPERVISOR-NEVER-OBSERVED-FIRING-IN-A-LIVE-SESSION` (high)

## Problem Statement

The M15 workflow supervisor has not fired in a live session since v0.5.1 (2026-09-17). Since then at least six plain `TRANSITION: F8` AUTO-edge breaks on supervised, Claudesk-hosted projects went unfired, and the operator restarted each one by hand. The `Stop` event reaches the webview for these turns (`status-channel.log`: `outcome=emitted`, `resolved=ws-N`), so the silence is downstream in TypeScript.

- **Expected:** at the end of a turn whose final verdict is an AUTO edge in the stored drive mode, with no operator input pending, the supervisor injects the next skill's slash command within a few seconds and records `fired`.
- **Observed:** it records a withhold (or nothing), and CC waits for the operator.

Two causes are confirmed by mechanism (activity-record Phase 1, 2026-09-25). A third symptom is known but not reproduced:
1. **The transcript read races `Stop`.** CC has not always flushed the final assistant line when the supervisor reads the tail.
2. **Terminal-generated reports raise the unsent-input watermark.** Focus-in/out, DA replies and cursor-position reports arrive through `term.onData` as if typed.
3. **A turn end can be evaluated twice** (a second `workspace-status` listener appears mid-session). The ledger masked it as `already-fired-for-this-turn`.

## Reproduction Attempt

**Surface chosen:** failing test (causes 1 and 2); not reproduced (symptom 3)
**Outcome:** reproduced (causes 1 and 2) · could-not-reproduce (symptom 3)
**Determinism:** every-run (both tests are deterministic: pure fold, and a call-counted stub under fake timers)

### Cause 2 — terminal reports raise the watermark

**Artifact:** `src/state/supervisor/__tests__/unsentInput.test.ts` → `describe("foldInput — terminal-generated reports are not operator input")`. It takes four report shapes (`ESC[I`, `ESC[O`, `ESC[?1;2c`, `ESC[24;80R`), each checked two ways:
- **"does not RAISE a clear watermark": FAILS 4/4** (`expected true to be false`). Each report ends on a non-clearing byte, so the last-byte fold sets `unsentInput`.
- **"does not CLEAR a set watermark": PASSES 4/4.** This is the anti-vacuity half: a fix that treated any ESC-leading chunk as a clear would fire over a typed line.

**Mechanism:** `foldInput` walks the chunk's bytes and lets the last one decide. The chokepoint is `Workspace.tsx` (`unsentInputRef.current?.push(chunk)`), reached from `XtermPane`'s `term.onData` via `ccInputRouting`'s `toWatermark`. That chokepoint carries xterm's generated reports as well as keystrokes.

### Cause 1 — transcript read races `Stop`

**Artifact:** `src/state/supervisor/__tests__/transcriptFlushRace.test.ts`. The stub `readTail` returns the tail WITHOUT the final assistant line on its first call and WITH it on later calls, under fake timers:
- **"still fires when the only verdict line is not yet flushed": FAILS** (`expected 'no-verdict' to be undefined`). This matches the live 2026-09-25 record.
- **"still fires when a stale read would see an EARLIER, already-chained verdict": FAILS** (`expected 'F33' to be 'F8'`). ⚠️ **New finding:** in the common autopilot shape (one turn chains several skills and breaks on the last), the stale read lands on the PREVIOUS skill's verdict, which chained, so the withhold reason is NOT `no-verdict`. It also claims the ledger under that wrong verdict's key. So the race is under-counted if one only greps the activity log for `no-verdict`.
- **"a turn with no verdict at all still withholds `no-verdict`, and stops re-reading": PASSES.** This is the anti-vacuity half: any re-read must be bounded (`calls < 10`) and must still end `no-verdict` without injecting.

**Mechanism:** `fireOne` calls `deps.readTail` exactly once. `readTurn` scans backward for the last assistant line carrying `TRANSITION:`, with no notion of which turn it belongs to.

### Symptom 3 — duplicate turn-end evaluation (NOT reproduced)

- **What was checked:** `useTauriListen` handles the torn-down-before-resolve race (`cancelled` guard) and unlistens on cleanup. `useTurnEnd` subscribes once per `useSupervisor`, and `useSupervisor` has ONE production caller (`Workspace.tsx`). No static path to a second listener was found.
- **Evidence it rests on:** the activity-record Phase 1 verify-human observation: 1 record per event on a fresh load, 2 after the operator's session actions (suspect: a drive-mode change or respawn on an open workspace). That was a DEV build, so an HMR remount of an edited module (`[[hmr-stale-across-file-rename]]`, `[[vite-hmr-stamped-url-is-a-separate-module-instance]]`) is a live alternative explanation.
- **Disposition:** carried into the Phase 1 research spike, to be reproduced on a build with no HMR edits during the session (or ruled a dev-only artifact) before any fix is planned.

**Notes for spec/plan:**
- The reproduction tests are the verify-codify anchor: fixed means they no longer fail. Their current failures are the intended red.
- ⚠️ `pnpm verify:auto` is RED while these tests fail, by design. The spec should decide whether to land the red tests with the fixes (the usual path) or mark them `it.fails` until each fix phase.
- The fixes are NOT decided here. The candidate fixes recorded in the backlog entry are a bounded re-read after `Stop` (or until the newest assistant line postdates the turn's prompt), and filtering complete terminal-report sequences before folding.
- Operator's agreed shape (2026-09-28): reproduce → **Phase 1 live research spike** (do the now-trustworthy activity log's withhold reasons account for every miss?) → one fix phase per cause, plus the duplicate listener if reproduced → **verify-human: a real AUTO-edge break fires and its `⚙` shows** (the deferred `supervisor-activity-record` P3.verify-human.2 check).
- The backlog entry's "What closes this item" list (live fire, gate OFF → no fire, negative arm, context-pressure recycle, Esc interrupts a wrong fire, installed-`.app` smoke) belongs in the spec's acceptance criteria. Each was voided because a no-fire check passes vacuously.

## User Stories

- As the operator running several autopilot workspaces, I want an AUTO-edge break to be chained by the supervisor within seconds, so a workspace I am not watching does not sit idle waiting for me to type "next".
- As the operator switching between windows, I want looking away from a workspace (a focus change) to have no effect on whether the supervisor acts, so it stays active precisely when I am not there.
- As the operator (and the agent) reading `supervisor-activity.log`, I want exactly one truthful record per turn end, naming the verdict the turn actually ended on, so a miss can be diagnosed from the record rather than by reasoning about timing.

## Acceptance Criteria

**Mechanism (automated, anchored on the reproduction):**
1. **AC-1 — the red tests go green.** All six failing cases in `unsentInput.test.ts` ("terminal-generated reports") and `transcriptFlushRace.test.ts` pass. The five anti-vacuity cases alongside them still pass: a report does not clear a typed line, and a no-verdict turn still ends `no-verdict`, re-reads a bounded number of times and never injects.
2. **AC-2 — reports are classified once, for both consumers.** A single classifier decides which bytes of an `onData` chunk are terminal-generated reports. Both the unsent-input watermark AND the turn-attribution origin cancel (`cancelOrigin`) ignore them. A chunk that mixes typed input and a report still counts as typed input. The bytes written to the PTY are unchanged: CC must still receive its focus and DA reports.
3. **AC-3 — a stale tail is never decided on.** `fireOne` decides only on a tail it can recognize as COMPLETE for this turn. That covers both stale shapes: no verdict yet, and an earlier, already-chained verdict. It waits a bounded time for completion and never claims the `FireLedger` for a verdict read from an incomplete tail. If the bound expires, it records the DISTINCT reason `transcript-incomplete`, not `no-verdict` or `already-chained`, so the race stays countable in the activity log.
3b. **AC-3b — only the current turn's verdict counts** *(added at research, 2026-09-28)*. A `TRANSITION:` that precedes the last real user prose line is not this turn's verdict: the decision is `no-verdict` and nothing fires, whatever the ledger holds. This covers an operator reply after a break, a `--continue`-resumed transcript, and a transcript past 512 KiB where `verdictIndex` drifts.
4. **AC-4 — one decision per `Stop`** *(revised at research)*. The turn-end funnel dedupes on the event key `(workspace_id, last_event_at)`, held module-level. A repeat of the same event writes one record with the distinct reason `duplicate-turn-end` and makes no second decision. `arch/workflow-supervisor.md` §F's "one turn end can appear twice" caveat is rewritten to match.
5. **AC-5 — `pnpm verify:auto` is green** at each phase's close.

**Live (verify-self where the agent can drive it; verify-human where only the operator can):**
6. **AC-6 — a real AUTO-edge break fires.** In a dev build with at least two open workspaces, a real CC turn ending on an AUTO edge in autopilot is chained. The activity record reads `outcome: fired`, and the workspace's turn readout shows `⚙` on the turn it started (the deferred `supervisor-activity-record` P3.verify-human.2).
7. **AC-7 — looking away does not suppress.** The same fire happens when the Claudesk window loses focus mid-turn (the exact case cause 2 silenced).
8. **AC-8 — the negative arm still holds.** A verify-human PAUSE edge, an ESCALATE, a project with no stored mode, and gate OFF each produce no fire. Gate OFF also writes no record.
9. **AC-9 — Esc interrupts a wrong fire.** R-1's accepted cost rests on this, and it has never been confirmed.

## Out of Scope

- **Changing the fire policy, the policy graph or the adjudicator.** No changes to `verdict.ts` rules, `edges.ts`, or the `claude -p` adjudicator's prompt or model. This feature makes the existing decision see the right input at the right time.
- **The remaining supervisor-activity-record quality findings** (1 MAJOR + 8 MINOR). One exception: MINOR #8 (popover Esc may reach CC) is taken only if AC-9's live check shows an Esc leaking.
- **Model-side over-pausing at F4** ("say go" tails). That is a separate question, recorded in the backlog entry.
- **The transcript-root-reads-stored-profile MAJOR** (`SURFACE-2026-09-24-QUALITY-TRANSCRIPT-ROOT-READS-STORED-PROFILE-NOT-LIVE`). It is adjacent code but a profile-switch trigger, and every miss in the evidence used the default profile.
- **Backspace-to-empty and the watermark's other recorded accepted costs** (the Esc-dismisses-a-menu window, no idle timeout). Those are operator rulings, not defects.
- **A new IPC direction or a Rust-side verdict.** R-4 holds: the verdict stays in TypeScript, and Rust does file IO only.

## Technical Constraints

- **No 3rd-party dependency** (the probe check does not apply).
- **Never parse PTY output** (`CLAUDE.md`, absolute). The terminal-report classifier reads what Claudesk forwards IN (`onData` chunks), which is the existing watermark's premise. The completeness check reads the transcript file, never the xterm buffer.
- **The watermark stays a state, with no timer** (M14 WP0 operator ruling, restated at the top of `unsentInput.ts`). The report filter changes WHICH bytes fold, not WHEN the watermark clears. A time-based "ignore input for N ms after focus" is the shape that ruling rejects.
- **The bounded re-read is not a watchdog.** It runs once per turn end, inside `fireOne`, with a hard cap on attempts and total delay. The arch doc's rejected PID-polling watchdog is a different thing (waiting for `BackgroundWork` completion). Keep the two distinct in the code and the doc.
- **`FireLedger` is claimed before adjudication** (arch §D). The completeness wait must happen BEFORE the claim, or a stale key gets claimed, which is AC-3's second clause.
- **`injectCommand` has no retry and no pre-send cancel window** (by design), so the added latency sits before the decision, never between the decision and the inject. `hasUnsentInput` is still read immediately before injecting (M14 WP0).
- **Add the new reason to the closed union.** A new withhold reason (AC-3) goes into `FanOutReason` → `SupervisorReason`, and `activityRecord.ts` is the schema's single home. The `archDocEnumeration` guard and the §F docs must name it.
- **Verification environment:** a dev build launched with the full Claude-marker `env -u` strip (`[[agent-launched-app-cannot-verify-continue]]`). Then real turns are driven via `cc_input` through the MCP bridge, and results are parked on `window` (this session found that `webview_execute_js` times out on scripts that call `invoke`). Use scratch workspaces (`tmp/scratch/scratch-{a,b,c}`).
- **Installed-`.app` checks are deferred to the `/release` gate** (`[[installed-build-verify-deferred-to-release]]`).

## Open Questions

Resolved by the research spike (F3), each against a live dev build and real transcripts:

- [x] **RQ-1 — Is the cause list complete?** Over a live session with real AUTO-edge breaks, do the activity log's non-fire reasons consist ONLY of the two reproduced causes (plus legitimate withholds)? Any other reason at a real break becomes its own phase.
- [x] **RQ-2 — What does "the tail is complete" look like, and how late is the final line?** What CC writes at a turn's end (the final assistant line's shape, `stop_reason`, and any trailing `system` / bookkeeping lines), which discriminator reliably separates a complete tail from both stale shapes, and the observed delay distribution between `Stop` and the final line's arrival. That delay sets AC-3's bound.
- [x] **RQ-3 — Which report shapes actually arrive?** Capture the real `onData` chunks in WKWebView around focus changes, window switches and CC startup (does CC enable focus reporting, `ESC[?1004h`? which DA/CPR replies does xterm send?), so the classifier covers what occurs, not only the four replayed shapes.
- [x] **RQ-4 — Is the duplicate listener real outside HMR?** Reproduce it on a dev build with no source edits during the session, trying the suspected triggers (drive-mode change, respawn, Recycle on an open workspace). If it does not recur, rule it an HMR artifact (AC-4).

## Elicitation

**Asked** (at this spec pause):
- **Q1 — Which live checks are in this feature's acceptance, and which stay deferred?** The backlog's closing list also includes a **context-pressure recycle over 400,000 tokens at a non-final phase boundary** and an **installed-`.app` GUI-PATH smoke**. *Recommendation:* keep AC-6 to AC-9 in scope. Leave the 400k recycle to dogfooding, confirmed from the activity log's `recycle-started` records (building 400k of context on purpose is slow and not what broke), and keep the installed-`.app` smoke at `/release`, per the standing deferral. **Answer (operator, 2026-09-28): "go ahead", recommendation accepted.** AC-6 to AC-9 are in scope. The 400k recycle is deferred to dogfooding (confirmed from `recycle-started` records), and the installed-`.app` smoke stays at `/release`.

**Assumed** (defaults taken without asking; say if any is wrong):
- The fixes land in THIS feature, one phase per cause, rather than as separate tasks (the agreed shape).
- The red reproduction tests are committed with the fix phase that turns them green. *(Refined at plan:* Phase 1 fixes the transcript race first, so while it runs the terminal-report cases (fixed in Phase 2) are marked `it.fails`. `it.fails` still FAILS the gate if a case unexpectedly passes, so it is a live red marker, not a skip. Phase 2 flips them to plain `it`.*)*
- A mixed chunk (typed text + a report) counts as typed input.
- Report bytes still reach the PTY unchanged. Only the supervisor's reading of them changes.
- The re-read's added latency (bounded by RQ-2's measurement, expected to be well under the ~3s the adjudicator already costs) is acceptable before a fire.
- An expired completeness wait is recorded as a new, distinct reason rather than reusing `no-verdict`.
- The backlog entry `SURFACE-2026-09-14-SUPERVISOR-NEVER-OBSERVED-FIRING-IN-A-LIVE-SESSION` is resolved by this feature only when AC-6 is observed live, not on green tests.

## Research

*(2026-09-28, feature-research. Live dev build `pnpm tauri:dev` with the Claude-marker strip, scratch-c in autopilot. Real CC turns were driven through the xterm `onData` path (text typed into `.xterm-helper-textarea`, Enter/Esc dispatched as a keydown with a `keyCode`). A 5 ms poller timestamped every `Stop` in the dev `status-channel.log` and every new transcript line. The corpus is 135 transcripts from the last 14 days, CC 2.1.272–2.1.283.)*

### RQ-2 — the race is NOT intermittent: the supervisor never sees the turn's final line

**The final line lands on disk AFTER `Stop`, every time.** In 6 of 6 live turns, the final assistant line (`stop_reason: end_turn`) reached disk **+74, +82, +89, +89, +90, +109 ms** after the `Stop` status line. It was flushed in the same write as `system:stop_hook_summary` and `system:turn_duration`, so CC writes the turn's close only after its Stop hooks have run. The supervisor records its decision within ~1–2 ms of `Stop` (record `ts` = `Stop` ts + 2 ms), so its transcript read **always** precedes the flush.

**So `fireOne` has always decided on the PREVIOUS turn's tail.** This corrects the backlog entry's *"timing-dependent (some turns win the race, e.g. the 09-15 fires)"*. The 2026-09-15 "fires" were fires on STALE verdicts, which is why they arrived as six arg-less `/feature-build`s in a row: the misfire run that produced the WP0 hotfix. The supervisor has never fired on a verdict read from the turn that emitted it.

**The completion discriminator (corpus-validated):**
- The last main-chain assistant line before `turn_duration` has `stop_reason` `end_turn` in **926/929** turn ends and `stop_sequence` in **2/929**. **1/929** is `tool_use`: an `AskUserQuestion` turn, which must never fire.
- Of 1,145 main-chain `end_turn`/`stop_sequence` lines, **1,137 (99.3%)** are followed within 3 lines by `stop_hook_summary` or `turn_duration`.
- A verdict line that goes on to chain is `stop_reason: tool_use`: all 29,325 `tool_use` lines are mid-turn. Its `TRANSITION` text block and its `Skill` call arrive as separate `tool_use`-reason lines.
- `stop_reason: null` (14 lines) occurs only on interrupted turns.
- **Rule:** a tail is COMPLETE for the current turn iff, after the last real user prose line (`isUserProseTurn`), there is EITHER a main-chain assistant line whose `stop_reason` is terminal (anything other than `tool_use` and `null`) OR a `system` line with subtype `stop_hook_summary` / `turn_duration`. Both stale shapes fail it: (a) nothing after the prompt, and (b) the last post-prompt assistant line is `tool_use`. The `AskUserQuestion` shape passes via `turn_duration` and then withholds as it does today.
- **Bound:** re-read every ~100 ms for up to ~2 s. The worst observed lag is 109 ms; the bound covers slow or multiple Stop hooks and costs less than the adjudicator's ~3 s. Tune from the new reason's count in the activity log.

### ⚠️ NEW — the verdict is not scoped to the current turn, and that produced a WRONG FIRE live

`readTurn` scans backward for the last `TRANSITION:` anywhere in the 512 KiB tail, with no notion of the current turn. Combined with the race, that is a **wrong-fire** defect, not just a missed fire:
- **Live, turn 2:** it ended on `TRANSITION: F8`. The stale read found turn 1's `T2`, and the supervisor **fired `/task-act`**. The record reads `fired · T2 · /task-act`. `/feature-verify-auto` was correct.
- **Live, turn 1:** it ended on `T2`. The stale read found `F5` from the resumed (`--continue`) conversation, and the only thing that stopped a wrong `/feature-plan` was the startup-report watermark (cause 2).
- **Unit probe:** an AUTO verdict, then the operator's message ("wait, what does F8 mean?"), then an ordinary reply. `fireOne` fires `/feature-verify-auto` on a verdict from BEFORE the operator's latest message.
- **Why the ledger does not stop it:** the key is `{workspaceId, transcriptPath, edgeId, verdictIndex}`, and `verdictIndex` is an index into the byte-bounded tail window (`TAIL_BYTES` = 512 KiB). Once a transcript passes 512 KiB, the same old verdict gets a new index on every read. The ledger is also in-memory, so an app restart or remount (or a `--continue` resume) forgets every claim. The dev record's run of consecutive `already-fired-for-this-turn · F5` entries was the same old verdict re-read while the file was still small.
- **Fix (spec amendment AC-3b):** a verdict counts only if it comes AFTER the last real user prose line. Otherwise the decision is `no-verdict`: that turn emitted none. This also retires the index-drift exposure for old verdicts. The completeness wait already needs the "last user prose" boundary, so the two share one scan.

### RQ-3 — the report shapes that actually arrive (live WKWebView capture, `UnsentInputWatermark.prototype.push` tapped)

| When | Chunk (hex) | Sequence | Watermark |
|---|---|---|---|
| Workspace open, CC spawning, no operator input | `1b 5b 49` | focus-in `ESC[I` | false → **true** |
| same, 260 ms later | `1b 5b 3f 31 3b 32 63` | DA reply `ESC[?1;2c` | stays true |
| Switching to the picker | `1b 5b 4f` | focus-out `ESC[O` | false → **true** |
| Focusing the pane textarea | `1b 5b 49` | focus-in | (set) |

- **A freshly opened workspace is suppressed (`⏸`) before the operator has typed anything.** CC enables focus reporting at startup, and xterm answers DA, so every workspace starts withheld until the operator's first Enter in that pane. Then every focus change re-raises the watermark.
- Cursor-position reports were not observed. They stay in the classifier (xterm emits them on a CPR query), with the replay test already covering them.
- **Classifier:** strip complete terminal-report sequences from a chunk before it reaches the watermark and `cancelOrigin`: `ESC[I`, `ESC[O`, `ESC[?…c` (DA1/DA2 replies, `ESC[>…c`), and `ESC[<row>;<col>R` (CPR). Then fold what remains. An empty remainder is a no-op. Keystroke escape sequences (arrows `ESC[A`–`D`, Home/End, function keys) are NOT reports and still count as input.
- **Adjacent, recorded:** a long prompt written to `cc_input` in one write is taken by CC as a paste, so its trailing `\r` inserts a newline rather than submitting. `injectCommand`'s short `/<skill>\r` submitted fine (the live `/task-act` fire), so this affects only a probe's injected prose, not the supervisor.

### RQ-1 — the two causes are sufficient to explain the recorded misses

- The six recorded real misses (09-18 ops-data-hub; 09-22 ops-data-hub, mbt-copilot ×3, claudesk) were fed, each as a complete tail, through the REAL pipeline: `fireOne` with a PROCEED stub, then the real `adjudicate` + `supervisor_adjudicate` (`sonnet`) in the dev webview. **6/6 fire `/feature-verify-auto`** mechanically (the bold `**TRANSITION: F8**` parses), and **6/6 adjudicate `PROCEED`** (`basis: model`).
- So no third mechanism is needed. At those turn ends, the supervisor saw a stale tail (cause 1: `no-verdict`, `already-chained`, or `already-fired` on an older verdict) and/or a report-raised watermark (cause 2: `unsent-input-present`).
- Live withhold reasons observed this session: `unsent-input-present` (cause 2, at a real `T2` break), a stale-verdict `fired` (cause 1 + the scoping defect), and `supervisor-toggled-off` (deliberate, for counting). No other reason appeared.

### RQ-4 — duplicate turn-end handling: not reproduced; guard it at the funnel instead of chasing it

- **Tried, 1 record per `Stop` every time:** autopilot → orchestrated → autopilot; none → autopilot (the transition that preceded the 09-25 duplicates); a hot reload of `useSupervisor.ts` (`?t=` confirmed loaded); a hot reload of `Workspace.tsx`; and a full `location.reload()` plus reopen, with the pre-reload CC PTY still alive in the backend.
- **The 09-25 evidence, re-read:** at `…098074` exactly ONE `Stop` was emitted (`outcome=emitted`, `resolved=ws-1`) and TWO records were written, so the duplication was webview-side. The other duplicate pair (`…239913`) has NO `Stop` near it, so it was a synthetic event from that session's verify-self. PiP is ruled out: `pip.html` runs `pip/main.tsx`, which never mounts `useSupervisor`/`useTurnEnd`.
- **Fix (spec amendment AC-4, revised):** dedupe at the funnel, keyed on the event itself: `(workspace_id, last_event_at)` on an `is_turn_end` update, held module-level so a second consumer in any instance is caught. A repeat writes ONE record with a distinct reason (`duplicate-turn-end`) and makes no second decision. That keeps "one decision per `Stop`" true by construction, and keeps any future duplication countable rather than masked as `already-fired-for-this-turn`. If `last_event_at` is absent (the hook sent no ts), there is no dedupe, so behavior is unchanged.

### Spec amendments (folded in; strictly narrowing, no scope reversal)

- **AC-3b (new):** only a verdict emitted AFTER the last real user prose line is decided on. An earlier verdict yields `no-verdict` and never fires. Regression tests: the operator-question probe above, and a `--continue`-resumed transcript whose newest verdict predates the prompt.
- **AC-4 (revised):** the event-keyed funnel dedupe replaces "pin it at the layer that duplicated", since that layer could not be reproduced. The §F caveat is rewritten to say duplicates are now detected and recorded as `duplicate-turn-end`.
- **AC-3 detail:** the completion rule and bound are as above, and the new expiry reason is `transcript-incomplete`.

### Verification cautions for later phases (learned here)

- ⚠️ **The agent's own CC session must NOT have its cwd inside a scratch workspace.** This session's Bash cwd drifted into `tmp/scratch/scratch-c`, and its tool-call hooks resolved to that workspace (`WorkspaceRegistry` keys on path alone), polluting the status dot and potentially sending the agent's own `Stop`s to the supervisor. Keep the agent's cwd at the repo root.
- Text typed into the pane with `webview_keyboard type` reaches `onData`, but `press Enter` does NOT. Dispatch a `KeyboardEvent('keydown', {keyCode: 13})` on the CC pane's textarea (the one NOT inside `[data-session-id]`) instead.
- After a `location.reload()`, reconnect the MCP driver session (its `window.__MCP__` helper is gone).
- A wrong fire can be interrupted with Esc through the same keydown path. This was observed once (turn 2's `/task-act`, interrupted mid-tool: `[Request interrupted by user]`), and counts as preliminary AC-9 evidence.

## Plan

**Phase order is safety-first.** Phase 1 (transcript) removes the wrong-fire path found at research. Phase 2 (reports) removes the suppression that currently HIDES that path: turn 1 at research was saved from a wrong `/feature-plan` only by the watermark. Un-suppressing first would make the dev build more dangerous during Phase 2's own live checks.

**Live-verification setup (all phases):** as recorded under Research → "Verification cautions".
- The agent's cwd stays at the repo root.
- Text is typed with `webview_keyboard type`, and Enter/Esc are sent as a `keydown` with a `keyCode` on the CC pane's textarea.
- Results are parked on `window`.
- scratch-c (autopilot, default profile) is the primary workspace. For AC-6's second workspace, the dev `projects.json` row for scratch-b is set to profile `default` + `autopilot` (dev app-data only, restored at close). Its stored `test-test` profile would turn the workflow layer off.

## Work Tree

- [x] Phase 1: Decide only on the current turn's complete tail
  **Observable outcomes:**
  - CLI: `./node_modules/.bin/vitest run src/state/supervisor/__tests__/transcriptFlushRace.test.ts` exits 0 with 3/3 passing. `src/state/supervisor/__tests__/transcript.test.ts` and `fanOut.test.ts` exit 0, including new cases for: a verdict before the last user prose → `no-verdict` + no inject; a `--continue`-shaped tail (old AUTO verdict, then a new prompt) → no fire; an `AskUserQuestion`-shaped end (`tool_use` + `turn_duration`) → counted as complete; the bound expiring → `transcript-incomplete`, the ledger NOT claimed, and `readTail` called at most the bound's attempt count.
  - CLI: `pnpm verify:auto` exits 0 (the Phase 2 report cases are `it.fails`).
  - Browser (live dev build via MCP bridge): in scratch-c with the supervisor ON, a CC turn typed through xterm and ending on `TRANSITION: T2` produces ONE new `supervisor-activity.log` record with `outcome: "fired"`, `edgeId: "T2"`, `command: "/task-act"`. The next turn, typed as `Use no tools. Reply with only the word ok.` (no verdict), produces a record with `reason: "no-verdict"` and `outcome: "withheld"`, and no `UserPromptSubmit` appears in `status-channel.log` within 10 s of that record. Both records carry `edgeId` equal to the turn's own emitted edge, or `null`, never an earlier turn's.
  - [x] P1.1 `transcript.ts`: add `lastUserProseIndex(lines)` and `isTurnComplete(lines)`. Complete means that after the last real user prose line there is a main-chain assistant line with a terminal `stop_reason` (neither `tool_use` nor absent/null) OR a `system` line of subtype `stop_hook_summary`/`turn_duration`. Model `stop_reason` and `subtype` on `TranscriptLine`.
  - [x] P1.2 `transcript.ts`: scope `readTurn`'s backward scan to lines AFTER `lastUserProseIndex` (AC-3b). A token before it is not this turn's verdict. Document why at the scan, citing the live wrong `/task-act` fire and the `verdictIndex` drift past 512 KiB.
  - [x] P1.3 `fanOut.ts` `fireOne`: before parsing a verdict, re-read the tail until `isTurnComplete`, with injectable `sleep` and attempt budget on `FanOutDeps` (defaults 100 ms × 20 ≈ 2 s). This happens BEFORE the ledger claim. On expiry, return `transcript-incomplete` without claiming. The first read is immediate (no initial delay).
  - [x] P1.4 Add `transcript-incomplete` to `FanOutReason`. Check `outcomeForReason` maps it to `withheld` (it is not an error), and that `SupervisorReason`'s exhaustiveness users (activity popover labels, if any, and `activityRecord.test.ts`) accept it.
  - [x] P1.5 Tests: extend `transcript.test.ts` (`isTurnComplete` over the four shapes from research, `readTurn` scoping) and `fanOut.test.ts` (the three new fire/withhold cases above + bound + no-claim-on-expiry). Mark the four "does not RAISE" report cases in `unsentInput.test.ts` as `it.fails` with a pointer to Phase 2.
  **Build notes (2026-09-28):**
  - `transcript.ts`: `lastUserProseIndex`, `isTurnComplete`, and `stop_reason` / `subtype` / `isSidechain` on `TranscriptLine`. `readTurn`'s backward scan now stops at the last user prose line. The forward scan's user-prose stop became unreachable (no prose can follow the boundary), so it was removed and a note records why.
  - `fanOut.ts`: the completion loop sits before the ledger claim. It takes an injectable `completion` budget and `sleep` (`TAIL_COMPLETION_BUDGET` = 20 × 100 ms), and the new reason `transcript-incomplete` records as `withheld`.
  - ⚠️ **Fixtures changed to the measured shapes, and that was forced, not cosmetic.** Every synthetic tail in `fanOut.test.ts`, `activityFunnel.test.tsx` and the reproduction file lacked `stop_reason`, which a real turn end never does, so the completion rule read all of them as open turns (53 failures, all `transcript-incomplete`). They now carry `end_turn` (or `tool_use` for a chaining line). The real captured fixture ended mid-chain, before CC wrote the turn's close, so a `turn_duration` line is appended in the test, with a comment.
  - `transcript.test.ts`: the old "closes the window on a real user prose turn — THIS is a break" case asserted the corpus detector's view (`F8` after the operator replied). It is rewritten as AC-3b's "not this turn's verdict", plus a positive case.
  - **Red re-proven after the fixture change:** the reproduction file run against HEAD's `fanOut.ts` + `transcript.ts` gives **5 failed, 1 passed** (the passing one is the anti-vacuity case). Source restored, shasums matched.
  - The four report cases are `it.fails` until Phase 2. Supervisor + workspace suites: 146 files, 2100 passed + 4 expected-fail.
  - [x] verify-auto — `pnpm verify:auto` EXIT=0 (44s): frontend 241 files, 3174 passed + 4 expected-fail (the Phase 2 report cases); Rust 988 lib; lint 1 pre-existing warning (`XtermPane.tsx:932`). The first run failed `format:check` on the three files touched; `prettier --write` on exactly those three, then green.
  - [x] verify-self — all 3 outcomes PASS (driven by the orchestrator via the MCP bridge; see Discoveries for why no subagent). Integration boundary: yes (the live supervisor path); the live outcome cites its consuming surfaces, `supervisor-activity.log` + `status-channel.log`.
    - [x] CLI tests: `transcriptFlushRace` + `transcript` + `fanOut` → 3 files, 73/73.
    - [x] CLI `pnpm verify:auto` EXIT=0 (verify-auto above).
    - [x] Live, dev build, scratch-c (autopilot, supervisor ON, the `--continue`d transcript full of older verdicts):
      - A `TRANSITION: T2` turn typed through xterm → record `fired · T2 · /task-act`. `Stop` at `…355.90`, final line on disk at `+84 ms` (the wait caught it), injected `UserPromptSubmit` at `+4.6 s` (adjudication included). The `/task-act` run was then interrupted with Esc (`[Request interrupted by user]`), and it wrote no record.
      - The next turn, `Use no tools. Reply with only the word ok.` → record `withheld · no-verdict · edge null`. For 12 s after it the status log shows only `Stop` and a `SubagentStop`: **no `UserPromptSubmit`, so nothing was injected.**
      - Both records name the turn's OWN verdict (or none). Neither reached back to an earlier turn's, which the research run did twice before the fix.
  - [x] verify-human — operator approved 2026-09-28 ("approve")
    - [x] P1.verify-human.1 Review the agent-captured `supervisor-activity.log` records from the live dev run (a `T2` turn → `fired · T2 · /task-act`; the next no-verdict turn → `withheld · no-verdict`, nothing injected) and confirm they are the behavior you want
    - [x] P1.verify-human.2 Judgment: the supervisor now waits up to ~2 s (20 × 100 ms) for the turn's close before deciding, and records `transcript-incomplete` if it never lands. Measured lag was 74–109 ms. Acceptable? → yes
  - [x] verify-codify — integration boundary: yes. The consuming surface is `useSupervisor` → `decideTurn` → `fireOne`, driven end to end in `activityFunnel.test.tsx` with the real `transcript_tail` IPC shape and the real (unmocked) re-read sleep. Two new cases: "waits for the turn's final line, then fires THIS turn's verdict" (3 reads, fired F8) and "never fires a verdict from before the operator's latest message". Six mutants were run individually, each confirmed landed, each killed: no turn scoping (4 tests); no completion wait (4); `tool_use` counted terminal (3); close lines ignored (5); sidechain not skipped (1); budget ignored (1). `pnpm verify:auto` EXIT=0 (40s): 3176 passed + 4 expected-fail, Rust 988.

- [x] Phase 2: Terminal-generated reports are not operator input
  **Relevance check (before Phase 2):**
  - Requester still needs this: yes. Phase 1 made fires correct, but every new workspace still starts suppressed and every focus change re-suppresses (seen again at P1 verify-self: "held back" on a fresh open).
  - Requirements unchanged: yes. AC-2 and AC-7 as written.
  - Solution still feasible: yes. The research capture pins the four shapes, and the fold is already byte-level.
  - No superior alternative discovered: yes. Disabling focus reporting in xterm would hide CC's own focus events from CC, which CC requested.
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: `./node_modules/.bin/vitest run src/state/supervisor/__tests__/unsentInput.test.ts src/components/workspace/__tests__/ccInputRouting.test.ts` exits 0. The four report cases are plain `it` (no `it.fails` left: `grep -c "it.fails" src/state/supervisor/__tests__/unsentInput.test.ts` → 0). New cases pass: a mixed chunk (`"a\x1b[I"`) sets the watermark; an arrow key (`"\x1b[A"`) still sets it; a report-only chunk forwards the UNCHANGED bytes to the PTY; a report-only chunk does not `cancelOrigin`.
  - CLI: `pnpm verify:auto` exits 0.
  - Browser (live dev build via MCP bridge): after opening scratch-c from the picker with NO operator input, its supervisor badge's `aria-label` does not contain `held back` once CC has started (the startup `ESC[I` + DA reply arrived; the capture tap shows both chunks). After switching to the picker and back (focus-out/in), the `aria-label` still does not contain `held back`. After typing `abc` into the pane, it DOES contain `held back`. After Ctrl+U it no longer does.
  - Browser: a CC turn typed through xterm and ending on `TRANSITION: T2`, during which the pane textarea is blurred and re-focused (`document.activeElement.blur()` → focus), produces a record with `outcome: "fired"`, `edgeId: "T2"` (AC-7's mechanism).
  - [x] P2.1 New pure module `src/state/supervisor/terminalReports.ts`: `stripTerminalReports(chunk)` removes complete report sequences (`ESC[I`, `ESC[O`, `ESC[?…c`, `ESC[>…c`, `ESC[<n>;<n>R`) and returns the rest. Document the live capture table and why keystroke sequences are excluded.
  - [x] P2.2 `unsentInput.ts` `foldInput`: fold `stripTerminalReports(chunk)`, so an empty remainder is a no-op. Update the header's `term.onData` chokepoint paragraph: the chokepoint carries reports too.
  - [x] P2.3 `ccInputRouting.ts` `routeCcInput`: `toWatermark` becomes the stripped chunk (the same classifier, AC-2), and `toPty` still encodes the RAW chunk. `XtermPane` skips `onInputForwarded` when `toWatermark` is empty, so `cancelOrigin` is not called for a report. Keep the ordering property (watermark before the session guard).
  - [x] P2.4 Flip the four `it.fails` to `it`. Add the mixed/arrow/routing/no-cancel cases. Update `arch/workflow-supervisor.md` §F "Cancellation is conservative" to say the misclassification is fixed.
  **Build notes (2026-09-28):**
  - `terminalReports.ts` (new, pure): `stripTerminalReports` removes `CSI I`, `CSI O`, `CSI ?…c`, `CSI >…c` and `CSI n;n R`. The pattern is built from an `ESC` constant, not a regex literal. The one recorded overlap: modified F1–F4 keys share CPR's shape (Shift+F3 = `ESC[1;2R`) and are dropped too, which is harmless because they type nothing into CC's input line.
  - `foldInput` folds only the stripped remainder. `routeCcInput.toWatermark` is the stripped chunk (the pty still gets the raw chunk, encoded).
  - ⚠️ **Plan deviation, deliberate:** P2.3 put the empty-chunk skip in `XtermPane`. It went into `Workspace`'s `onInputForwarded` instead (`if (chunk.length === 0) return;`), and `XtermPane.tsx` is unchanged from HEAD. The reason: the live-workspace harness replaces `XtermPane` with a double, so a skip there is untestable, while the guard in `Workspace` is driven by `forwardInput` through the real component. The chain is linear (the pane forwards exactly `routing.toWatermark`), so it is one guard either way.
  - The AC-7 structural guard in `fanOut.test.ts` pinned "the push is the callback's first statement". It is widened to allow exactly the one empty-chunk return before it.
  - Tests: 4 report cases flipped from `it.fails` to `it`; mixed chunk / arrow / DA2 / submit-with-report cases; `terminalReports.test.ts` (5 report shapes removed, 6 keystroke sequences kept); routing report-only and mixed cases; `supervisorTurnOriginLive` "a terminal report between the fire and the turn start does NOT cancel the tag", through the real `routeCcInput` → `Workspace`. `arch/workflow-supervisor.md` §F cancellation note rewritten. Supervisor + workspace suites: 147 files, 2126/2126.
  - [x] verify-auto — `pnpm verify:auto` EXIT=0 (36s): frontend 242 files, 3200/3200 (no expected-fail left); Rust 988; lint 1 pre-existing warning.
  - [x] verify-self — all outcomes PASS (orchestrator-driven via the MCP bridge; a raw `term.onData` tap was attached to the CC pane's xterm instance before CC started). Integration boundary: yes (the `onData` → watermark → supervisor path); outcomes cite the supervisor badge's `aria-label` and `supervisor-activity.log`.
    - [x] CLI: the 4 Phase 2 test files → 69/69; `grep -c "it.fails"` → 0.
    - [x] CLI: `pnpm verify:auto` EXIT=0 (verify-auto above).
    - [x] Fresh open, no operator input: the raw tap caught `1b 5b 49` (focus-in) at `…568105` and `1b 5b 3f 31 3b 32 63` (DA1) at `…568478`. Once CC had started, the badge read `on`, not "held back". Before the fix this moment showed `⏸`.
    - [x] Focus change: blurring and refocusing the pane produced `1b 5b 4f` then `1b 5b 49`, and the badge still read `on`. (A JS-driven picker round trip moved no DOM focus this time and so sent no report, which is why the blur/focus was forced directly.)
    - [x] Positive control: typing `abc` → the badge reads "held back by unsent input"; Ctrl+U (`0x15`) → `on`.
    - [x] AC-7 mechanism: a `TRANSITION: T2` turn with the pane blurred (`…613103`, `ESC[O`) and refocused (`…613705`, `ESC[I`) BEFORE its `Stop` (`…616397`) → record `fired · T2 · /task-act`.
    - [x] Unplanned bonus: the chain continued correctly on its own. `/task-act` in scratch-c (no plan) ended on `T6`, and the supervisor fired `/task-plan` (`fired · T6`). `/task-plan` ended asking what to plan, and the supervisor did nothing (`withheld · no-verdict`). scratch-c is untouched (`git status` clean, no WIP created). The Esc sent after the first fire landed between turns and interrupted nothing, so it is NOT AC-9 evidence.
  - [x] verify-human — operator approved 2026-09-28 ("approve")
    - [x] P2.verify-human.1 Review the agent-captured live evidence (raw report chunks with the badge staying `on`; a fire through a mid-turn blur/refocus) and confirm it is the behavior you want
    - [x] P2.verify-human.2 Judgment: modified F1–F4 keys (e.g. Shift+F3 = `ESC[1;2R`) share a cursor-position report's shape and are also ignored by the watermark. Acceptable? → yes
  - [x] verify-codify — integration boundary: yes. The consuming surface is `Workspace`'s supervisor header, fed by the real `routeCcInput` → `onInputForwarded`: new `supervisorReportsLive.test.tsx` (3 report shapes leave the `⏸` marker absent; positive control: typing raises it, a report does not clear it, Ctrl+U does). The pre-existing marker test could only server-render the gate-OFF shape, so the ON shape had previously been verified live only. Five mutants were run individually, each landed and each killed: classifier strips nothing (18); `Workspace` empty guard removed (1: the origin test); routing passes the raw chunk to the watermark side (3), which proves the two readers share one classifier; `foldInput` does not strip (6); DA branch dropped (7). `pnpm verify:auto` EXIT=0 (43s): 243 files, 3204/3204, Rust 988.

- [x] Phase 3: One decision per `Stop`, the docs, and live acceptance  <!-- live acceptance AC-6/7/9 DEFERRED-to-release (operator, 2026-09-28) -->
  **Relevance check (before Phase 3):**
  - Requester still needs this: yes. AC-4 (one decision per `Stop`) and the live acceptance (AC-6/7/9) are what close the backlog item.
  - Requirements unchanged: yes.
  - Solution still feasible: yes. `last_event_at` is on every `WorkspaceStatusUpdate` from a hook that sends `ts`.
  - No superior alternative discovered: yes. The duplicate was not reproduced (RQ-4), so an event-keyed funnel dedupe remains the only guard that does not depend on knowing its source.
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: `./node_modules/.bin/vitest run src/state/supervisor/__tests__/useSupervisor.test.ts src/state/supervisor/__tests__/activityFunnel.test.tsx` exits 0, with new cases: the same `(workspace_id, last_event_at)` turn-end delivered twice → exactly 2 records, the second with `reason: "duplicate-turn-end"`, and `readTail` called once in total; two DIFFERENT `last_event_at` values → two full decisions; an event without `last_event_at` → no dedupe.
  - CLI: `pnpm verify:auto` exits 0. `grep -c "transcript-incomplete\|duplicate-turn-end" workflow-system/product/arch/workflow-supervisor.md` ≥ 2.
  - Browser (live, two supervised workspaces, scratch-c + scratch-b): each workspace's turn ending on an AUTO edge produces a `fired` record naming ITS OWN `projectPath` and edge. The turn the fire started shows `⚙` in that workspace's `workspace-turn-readout` (AC-6).
  - Browser: gate OFF (`workflow_features_enabled: false` via ⌘, Settings), then an AUTO-edge turn → NO new line in `supervisor-activity.log` and no `UserPromptSubmit` within 10 s (AC-8, gate arm). With the gate ON, a turn ending on a verify-human PAUSE edge (`TRANSITION: F10`) → a record with `outcome: "withheld"`, `reason: "policy-not-auto"`, and no inject (AC-8, PAUSE arm).
  - [x] P3.1 `useSupervisor.ts` `onTurnEnd`: module-level `handledTurnEnds` keyed `(workspace_id, last_event_at)` (bounded, e.g. the last 64). A repeat records `{outcome: "withheld", reason: "duplicate-turn-end"}` and returns before `decideTurn`. Add `duplicate-turn-end` to the early-exit reasons.
  - [x] P3.2 Tests for P3.1 (above). Mutation-prove the dedupe key (drop `last_event_at` from the key → the two-different-events case fails).
  - [x] P3.3 Docs: `arch/workflow-supervisor.md`: §D (the flush race, completion rule, turn scoping, bound), §F (the new reasons; rewrite the "one turn end can appear twice" caveat; correct "some turns win the race"). The backlog entry's hypothesis section and CLAUDE.md's execution-order line are left to finalize.
  **Build notes (2026-09-28):**
  - The dedupe lives in its own module, `turnEndDedupe.ts` (`claimTurnEnd` / `resetTurnEnds`, the same shape as `turnOrigin.ts`), rather than inline in `useSupervisor.ts`, so it can be unit-tested and reset between tests. The last 64 claims are remembered. The gate-OFF early return still comes first, so a duplicate with the gate OFF writes nothing.
  - `duplicate-turn-end` was added to `EarlyExitReason`. `onTurnEnd`'s event type gains `last_event_at`, which `WorkspaceStatusUpdate` already carries.
  - Tests: 4 funnel cases (same event twice → one decision + a `duplicate-turn-end` record, `transcript_tail` read once; two different events → two decisions; no `last_event_at` → no dedupe; gate OFF → nothing) and 4 `turnEndDedupe` unit cases. Mutants: key without `last_event_at` → 3 fail; claim disabled → 3 fail. Both restored, shasum matched.
  - `arch/workflow-supervisor.md`: a new §D subsection, "Reading the turn — the flush race and turn scoping", and §F's "appear twice" caveat rewritten as "One decision per `Stop`", plus the two new reasons.
  - [x] verify-auto — `pnpm verify:auto` EXIT=0 (35s): 244 files, 3212/3212; Rust 988; the arch doc names both new reasons 4×.
  - [x] verify-self — every PLANNED outcome passes; two new findings are surfaced (below). Driven by the orchestrator via the MCP bridge, with two supervised default-profile workspaces (scratch-c `ws-1`; scratch-b `ws-3`, set to default profile + autopilot in the dev `projects.json` only, restored afterwards). Integration boundary: yes; the outcomes cite `supervisor-activity.log`, `status-channel.log` and each workspace's `workspace-turn-readout`.
    - [x] CLI: the funnel + dedupe tests and `pnpm verify:auto` (above).
    - [x] Two workspaces, each fires under its OWN `projectPath`: scratch-b `fired · T2 · /task-act` (`ws-3`); scratch-c `fired · F8 · /feature-verify-auto` (`ws-1`).
    - [x] `⚙` on a turn a real fire started (the deferred `supervisor-activity-record` P3.verify-human.2): in `ws-3` the readout showed `⚙ 2/2`, titled "The workflow supervisor started this turn (it ran /task-act)". ⚠️ In `ws-1` NO `⚙` appeared on either supervisor-started turn (readout `3/3` and `2/3`, no origin). `<!-- status: FAILED-cosmetic: ⚙ missing in ws-1, correlated with the duplicate consumer below -->`
    - [x] AC-8 gate arm: `workflow_set_features_enabled(false)` → the badge disappeared. A `T2` turn in `ws-3`: `Stop` at `…788.96`, records 36 → 36 (none written), no `UserPromptSubmit` for 12 s. The gate was then restored ON.
    - [x] AC-8 PAUSE arm: a `TRANSITION: F22` turn (build → research REDIRECT, PAUSE in autopilot) → `withheld · policy-not-auto`, detail `policy is "pause" in autopilot`, no injection. ⚠️ The plan's outcome named `F10`, which is the plan's own error: `F10` is verify-auto → verify-self (AUTO), and `F10b` also fires, correctly, because the verify-human pause belongs to the state, not the edge. A probe of `decideVerdict` in autopilot confirmed `F22`/`F26`/`F34`/`F35`/`F36` all withhold `policy-not-auto`.
    - [x] ⭐ AC-4 exercised for real: **the duplicate consumer REPRODUCED in `ws-1`**. Each of its two `Stop`s (`…585973`, `…597590`, one `emitted` line each) reached `onTurnEnd` twice, and the dedupe turned each pair into `fired` + `duplicate-turn-end`. Without it, the second invocation would have been decided too. `ws-3` never duplicated, including after a third workspace (scratch-a) was opened.
    - **Finding 1 (new, surfaced):** a verdict QUOTED in prose fires. scratch-c's `/feature-verify-auto` turn ended with no token of its own, but its final message quoted `"Built / TRANSITION: F8"` mid-sentence, and the supervisor fired `/feature-verify-auto` a second time. `readTurn` takes the last `TRANSITION:` anywhere in the final assistant text. Corpus (21 days, 138 turn-ending messages with a token): 119 at line start, 19 mid-line, and the mid-line ones include real verdicts as well as quotes, so no placement rule separates them cleanly. → `SURFACE-2026-09-28-SUPERVISOR-FIRES-ON-A-TRANSITION-TOKEN-QUOTED-IN-PROSE`.
    - **Finding 2 (new, surfaced):** the duplicate consumer is real and also steals turn attribution. In `ws-1`, the first workspace opened in that app run and then joined by a second, every turn end was handled twice, and neither supervisor-started turn got `⚙`. Candidate explanation (unconfirmed): a leftover, still-subscribed earlier instance of `ws-1`'s subtree, whose supervisor makes the duplicate call and whose pane consumes the origin claim first. Only one `Workspace` fiber and one React root were live. → `SURFACE-2026-09-28-A-LEAKED-WORKSPACE-SUBSCRIPTION-DUPLICATES-TURN-ENDS-AND-STEALS-THE-GEAR`.
  - [x] verify-human — operator approved 2026-09-28 ("skip. I'll verify it when the whole thing is shipped in a new release. And I'll just dogfood it")
    - [x] P3.verify-human.1 AC-6: in a dev build you drive, an AUTO-edge break is chained within a few seconds and the `⚙` shows on the turn it started  <!-- status: DEFERRED-to-release: operator will verify in the installed release build + dogfooding; verify-self observed it live in ws-3 -->
    - [x] P3.verify-human.2 AC-7: the same, with another app focused when the turn ends  <!-- status: DEFERRED-to-release: operator dogfooding -->
    - [x] P3.verify-human.3 AC-9: Esc interrupts the injected turn  <!-- status: DEFERRED-to-release: operator dogfooding -->
    - [x] P3.verify-human.4 Low-priority note: no `⚙` in `ws-1` (the workspace that had the duplicate consumer). → accepted, finding backlogged (default taken)
    - [x] P3.verify-human.5 Decision: the quoted-token wrong fire. → backlog (recommended default taken; `SURFACE-2026-09-28-SUPERVISOR-FIRES-ON-A-TRANSITION-TOKEN-QUOTED-IN-PROSE`)
    - [x] P3.verify-human.6 Decision: the leaked subscription. → backlog (recommended default taken; `SURFACE-2026-09-28-A-LEAKED-WORKSPACE-SUBSCRIPTION-DUPLICATES-TURN-ENDS-AND-STEALS-THE-GEAR`)
    ⚠️ **AC-6/7/9 are DEFERRED, not passed.** At finalize, the backlog item `SURFACE-2026-09-14-SUPERVISOR-NEVER-OBSERVED-FIRING-IN-A-LIVE-SESSION` must carry that: resolving it needs a positive observable (a `fired` record + `⚙`) from the installed release, not "no complaints".
  - [x] verify-codify — 2 funnel cases added to `activityFunnel.test.tsx` for the two live-observed shapes with no prior coverage: (a) TWO live `useSupervisor` instances for one workspace receive ONE broadcast `Stop` → one decision, one fire, one `duplicate-turn-end` (the leaked-subscription shape; only the module-level claim sees both); (b) two supervised workspaces with the SAME `last_event_at` are each decided and record their OWN `workspaceId`/`projectPath`. Mutants run individually: claim disabled → (a) fails; key without workspace → (b) fails; shasum-restored. `pnpm verify:auto` EXIT=0 (46s): 3214/3214, Rust 988.

## Current Node
- **Path:** Feature > finalize
- **Active scope:** finalize (review-quality done: 0 CRITICAL / 1 MAJOR / 5 MINOR, auto-backlogged; AC-6/7/9 deferred to the release + dogfooding)
- **Blocked:** none
- **Unvisited:** (none after finalize)
- **Open discoveries:** quoted-token fire; leaked subscription (both surfaced to backlog)

## Code-Quality Review — silent-supervisor

*(ship commit `778fe72`, window `778fe72^..778fe72`; drive_mode=autopilot → the MAJOR + MINORs auto-backlogged to `backlog-quality-findings.md` → `# silent-supervisor — 2026-09-28`.)*

### Strengths
- Each of the three causes is fixed at its own seam (the completion wait in `fireOne`, report stripping in `terminalReports.ts`, the per-`Stop` claim in `turnEndDedupe.ts`), each a small pure function with direct tests.
- The completion wait sits deliberately before the ledger claim, so a stale read never spends a turn's key; sleep and budget are injected, so `transcriptFlushRace.test.ts` drives the real re-read loop under fake timers.
- Every new failure path withholds rather than fires, with its own named reason (`transcript-incomplete`, `duplicate-turn-end`); a repeat `Stop` is recorded, not dropped, so the leak stays visible.
- The `readTurn` floor fixes a real wrong-fire by scoping the backward scan, and the old trap-2 loop is removed rather than left alongside it.
- The two unpinned root causes (leaked subscription, quoted token) were filed with a detector and repro instead of being folded silently into this commit.

### Issues
**CRITICAL**
- (none)

**MAJOR**
- [`transcript.ts` `isTurnComplete`, `fanOut.ts` completion wait] Every decision is gated on undocumented CC transcript fields (`stop_reason` values, `system` subtypes `stop_hook_summary` / `turn_duration`). A CC format change would make every turn withhold `transcript-incomplete`, the same silent-supervisor symptom, with no alarm. — Needs a positive alarm (N consecutive `transcript-incomplete` → badge/console warning, or a pinned fixture refreshed at each CC bump). → `SURFACE-2026-09-28-QUALITY-TRANSCRIPT-COMPLETION-WAIT-HAS-NO-ALARM-FOR-A-CC-FORMAT-CHANGE`

**MINOR** (→ `SURFACE-2026-09-28-QUALITY-SILENT-SUPERVISOR-MINOR-BATCH`)
- [`ccInputRouting.ts`, `unsentInput.ts`] "stripped once, for BOTH readers" but `foldInput` strips again; two docs disagree on the owner.
- [`transcript.ts` `lastUserProseIndex` / `isUserProseTurn`] also counts `isMeta` skill bodies, so the "user prose" floor can sit mid-turn; the name and the `readTurn` doc overstate it.
- [`useSupervisor.ts` `decideTurn`] "read at the last possible moment" is overstated now that a ≤2 s wait sits between the toggle read and the inject; the reason list lacks `transcript-incomplete` and `duplicate-turn-end`.
- [`turnEndDedupe.ts`] module-level store reset only by `activityFunnel.test.tsx`; other `onTurnEnd` tests are safe only because they pass no `last_event_at`.
- [`useSupervisor.ts` `onTurnEnd`] ad-hoc widened param instead of adding `last_event_at` to `TurnEndSignal`.

### Assessment
Well built and moves the codebase forward: each cause gets a narrow, measured fix that fails in the withhold direction with a distinct observable reason, and the tests drive the real loop and routing. The main debt is the new dependency on CC's undocumented transcript format, whose all-withhold failure mode is indistinguishable from the bug being fixed and deserves a positive alarm. The remaining risks are comment-level. Adds capability without structural debt.

### If you disagree
Edit this section and mark a finding `[DISMISSED]` before `feature-finalize` archives the WIP.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
- [SURFACED-2026-09-28] reproduce — The transcript race also produces WRONG-VERDICT withholds (a stale read lands on an earlier, already-chained verdict), not only `no-verdict`. Any activity-log tally of the race must count both. (Recorded here for the spec; it is part of this feature's scope, not a separate backlog item.)
- [SURFACED-2026-09-28] research — The verdict is not scoped to the current turn (`readTurn` scans the whole 512 KiB tail), and `verdictIndex` drifts once a transcript passes 512 KiB, so an old AUTO verdict can fire after the operator has replied. This was observed live as a wrong `/task-act` fire. Folded into this feature as AC-3b rather than filed separately, because it shares the fix site and scan with AC-3.
- [SURFACED-2026-09-28] Phase 1 verify-self — ran by the orchestrator, not the `feature-verify-self-runner` subagent, because the outcome is observable only through the `mcp__tauri__*` bridge and subagents are not given those tools (`[[mcp-bridge-tools-not-exposed-to-subagents]]`: they silently fall back to a bare Vite page). This is a standing project constraint, not a one-off bootstrap-skip.
- [SURFACED-2026-09-28] Phase 3 verify-self — A `TRANSITION:` token quoted mid-sentence in a turn's final message is read as that turn's verdict and fired (observed live: a second `/feature-verify-auto`). → backlog `SURFACE-2026-09-28-SUPERVISOR-FIRES-ON-A-TRANSITION-TOKEN-QUOTED-IN-PROSE`.
- [SURFACED-2026-09-28] Phase 3 verify-self — The duplicate turn-end consumer reproduced in one workspace (`ws-1`); the dedupe contained it, but that workspace's supervisor-started turns got no `⚙`. → backlog `SURFACE-2026-09-28-A-LEAKED-WORKSPACE-SUBSCRIPTION-DUPLICATES-TURN-ENDS-AND-STEALS-THE-GEAR`.
