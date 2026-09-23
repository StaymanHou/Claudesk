---
workflow: task
state: close (complete)
completed: 2026-09-23
created: 2026-09-23
docs-only: false
drive_mode: autopilot
---

# Task: Paydown WP10 — mark a staged prompt as dictated

**Workflow:** task
**State:** Completed 2026-09-23
**Created:** 2026-09-23

## Problem Statement
A staged prompt sent from the Prompt panel reaches CC with nothing saying it was dictated, so CC reads an ASR mishearing as the operator's intent. The fix wraps the body in open and close notes, at send time, behind a panel toggle that defaults to ON.

## Context
- Source of the ask and the rulings: `workflow-system/product/backlog-paydown-wbs.md` §WP10. Rulings were taken at restore on 2026-09-23:
  - Q1 **wrap**, with open and close notes.
  - Q2 **toggle in the panel, default ON**.
  - Q3 wording, exactly: `[Dictated via speech recognition — may contain transcription errors.]` … `[End dictated section.]`
- The byte builder is `src/components/workspace/stagedPayload.ts` → `stagedPayload(body, { submit })`. Wrap the **body** before the `\n → \r` normalization and the `ESC[201~` neutralization, so both still apply to the notes.
- The send plan is `src/components/workspace/prompt/sendStagedDraft.ts` → `planSend(body, mode)`. `plan.body` stays **raw**, because it is what gets archived to history, so a recover-and-resend does not double-wrap.
- The caller is `src/components/workspace/prompt/PromptPanel.tsx` → `send` (`useCallback` + latest-refs; it reads current values through refs).
- The persistence precedent is `prompt/promptFontZoom.ts`: a global `claudesk.prompt.*` localStorage key through `safeStorage()` from `../fontZoomCore`.
- Tests:
  - `__tests__/stagedPayload.test.ts`, `prompt/__tests__/sendStagedDraft.test.ts`.
  - `prompt/__tests__/promptSendWiring.test.tsx`, the real mounted panel with `invoke` mocked. ⚠️ Its existing byte expectations assume no wrap, so it needs updating.
- ⚠️ Do **not** touch `slashCommandPayload`. The `stagedPayload.test.ts` guard pins that it is unaffected.
- `App.css` has no design-token layer (`[[no-css-custom-property-layer]]`). Copy hex values from sibling `.prompt-*` rules.

## Defaults taken (not asked)
- **The toggle is a single global setting, persisted in localStorage** (`claudesk.prompt.dictatedWrap`, absent → ON). This follows the font-zoom precedent. I read "per-panel" as "lives in the panel, not in Settings". A per-workspace value would mean re-disabling it in every project.
- **The option is REQUIRED** (`dictated: boolean`) on both `StagedPayloadOptions` and `planSend`, not optional. This makes `tsc` flag every caller, per `[[ts-arity-flexible-assignability-hides-a-widened-param]]`.
- **The notes are joined to the body with `\n`, before normalization:** `${OPEN}\n${body}\n${CLOSE}`. The body itself stays verbatim.
- **The control is a labelled checkbox in `.prompt-actions`**, placed left of Stage/Send (`data-testid="prompt-dictated-toggle"`). Its tooltip names the effect.

## Work Tree

- [x] T1 Builder: add `DICTATED_OPEN` / `DICTATED_CLOSE` constants and a required `dictated` option to `stagedPayload`; wrap before normalization
- [x] T2 Plan: thread `{ dictated }` through `planSend` into `buildPayload`. `plan.body` stays raw.
- [x] T3 Persistence: add a small `prompt/promptDictatedWrap.ts` with load/save over `safeStorage()` (default true; unparseable → true; never throws)
- [x] T4 Panel: add toggle state + ref, read at send time; checkbox in the actions row; CSS
- [x] T5 Tests + mutation proof
  - [x] T5.1 `stagedPayload` value tests: exact decoded bytes for ON×{submit, stage}, OFF×{submit, stage}, plus `ESC[201~` in a wrapped body still neutralized (identity, not length)
  - [x] T5.2 `planSend`: `buildPayload` output differs by `dictated`, and `plan.body` is raw either way
  - [x] T5.3 Persistence module: absent → true, "false" → false, round-trip, and a throwing storage falls back to true
  - [x] T5.4 Wiring (mounted panel): default send is wrapped; unticking the checkbox → unwrapped bytes cross `invoke`; archived history is raw in both cases; existing expectations updated
  - [x] T5.5 Mutation-prove each individually and confirm each landed: (a) drop the close note; (b) wrap AFTER normalization; (c) panel ignores the toggle (hardcode `dictated: true`)
- [x] T6 `pnpm verify:auto` green (timeout from `runtimes.md`)

## Current Node
- **Path:** Task > closed
- **Active scope:** none (archived)
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** none

## Act evidence (2026-09-23)
- Mutation proof, each mutant run individually and confirmed landed (`sed -n`/`grep` on the mutated line), then restored from a `cp` copy with shasum verified:
  - (a) Close note dropped → **7 failed**.
  - (b) Wrap moved after normalization → **8 failed**.
  - (c) Panel hardcodes `dictated: true` → **2 failed** (the wiring OFF cases).
- `pnpm verify:auto` EXIT=0 in 31s. Frontend: 223 files / 3000 tests (was 222 / 2985). Rust: 921 + 19 + 1 + 10. The only lint warning is the known `XtermPane.tsx:895`.
- Not yet observed: the live render of the checkbox in the running app (its left-aligned placement and dark styling). That is task-verify's job.

## Verification Observable

**Observable:** In the running dev app (`pnpm tauri:dev`, `scratch-a` workspace, live `claude` v2.1.280), a Stage send with Dictated ticked puts the body into CC's prompt between the two notes, each on its own line. With Dictated unticked, the body arrives with no notes. Neither send submits.
**Verification command:** Drive the real panel over the `tauri` MCP bridge:
1. Set the draft via a CM6 transaction.
2. Click `prompt-send-stage`.
3. Read the live xterm `Terminal.buffer.active` (reached via the React fiber, NOT `.xterm-rows`, caveat (i)).
4. Untick `prompt-dictated-toggle` and repeat.
**Expected result:** The buffer shows the verbatim `[Dictated via speech recognition — may contain transcription errors.]` / body / `[End dictated section.]` on consecutive rows for ON. For OFF, the raw body with no note. Everything stays inside CC's `❯` prompt with no turn started.

## Verification Result

**Status:** PASS
**Date:** 2026-09-23
**Evidence:** the live xterm buffer, after three sends (ON "verify wp ten", ON "wp ten check\nline two", OFF " OFFARM plain"):
```
6: ❯ [Dictated via speech recognition — may contain transcription errors.]
7:   verify wp ten
8:   [End dictated section.][Pasted text #1 +3 lines] OFFARM plain
```
- `[Pasted text #1 +3 lines]` is CC's own collapse of the second wrapped send: 4 lines = open note + 2 body lines + close note. An unwrapped 2-line body would read `+1 lines`.
- All three sat in the prompt, unsubmitted (stage-only).
- The `console.warn` tap (self-tested) recorded no failure.
- History archived the RAW bodies (`"verify wp ten"`, `"wp ten check\nline two"`), so there is no double-wrap on recover.
- Toggle: rendered checked with nothing stored. Unticking wrote `"false"`.
- Geometry: the checkbox is at x=971 in a row starting at x=961; Stage/Send are at x=1787/1854. Label color is #9b9b9b, accent #6ea8ff.

**Notes:** PASS. Two instrument artifacts, recorded so they are not mistaken for defects:
1. **The editor appeared not to clear after a send.** `@uiw/react-codemirror` 4.25.10 defers an external `value` update for 200 ticks of a 1 ms `setInterval` after any edit (its typing latch). The agent-launched window was `visibilityState: hidden`, so WKWebView throttled that interval, and the clear landed seconds later (confirmed: view doc `""` afterwards).
2. **The CC pane looked empty or stale.** A hidden window pauses xterm's rAF paint, but the buffer was correct. Also, `ipc_monitor` captured nothing: the bridge cannot hook `invoke` (caveat (l)). It is not evidence of no IPC.
- Teardown: the dev instance was killed by its own PID (34561). The dev profile's `claudesk.prompt.dictatedWrap` was removed, back to default.
- **Operator confirmed 2026-09-23** in a fresh `pnpm tauri:dev` instance: "looking all good". (Real macOS dictation is still unexercised; it needs a released build.)

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

## Retrospect
- **What changed in our understanding:** None of the three things that looked wrong mid-verify were real:
  - **Editor not clearing:** `@uiw/react-codemirror` 4.25.10 holds an external `value` update behind a 200-tick typing latch.
  - **CC pane blank or stale:** an agent-launched, hidden window throttles that latch's `setInterval` and pauses xterm's rAF paint.
  - **Nothing captured by `ipc_monitor`:** it cannot hook `invoke`.

  The load-bearing instrument turned out to be the xterm `Terminal.buffer.active`, reached through the React fiber.
- **Assumptions that held:**
  - The one seam (`stagedPayload`), wrapping before normalization, keeping `plan.body` raw, and making the option required (so `tsc` enumerated every caller).
  - CC also independently confirmed the line count: `[Pasted text #1 +3 lines]` for a 2-line body with the wrap.
- **Assumptions that were wrong:** A `Promise`/`setTimeout` script through `webview_execute_js` times out on this bridge; fire-then-poll in separate calls is required (already in the handoff notes). `execCommand('insertText')` desyncs CM6. Drive the editor with a real `view.dispatch`.
- **Approach delta:** None in the code; it matched the plan. The only delta was in verification: I had to switch instruments twice before the observation could be trusted.
