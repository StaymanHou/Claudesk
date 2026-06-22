# Incident: Terminal renders blank with only a blinking cursor on workspace activation

**Workflow:** incident
**State:** resolve
**Created:** 2026-06-22 12:45
**Resolved:** 2026-06-22 14:00
**Severity:** P1 — major feature broken
**Status:** Resolved — fix shipped + live-verified + regression-codified. The mitigation is the proper fix (no follow-up SURFACE needed).

## Summary
On opening/activating a workspace, the left-half embedded CC terminal (xterm.js) sometimes renders **blank — just a blinking cursor**, with no shell/CC prompt visible. Operator reports it as "the exact problem like a previous session," i.e. a **recurrence** of the known Phase-1/WP9 shell-prompt-flush / xterm fit-on-activate race (the `cc_ready` / rAF-deferred-fit area), not a new defect. Timing-sensitive; only reproducible against the **real PTY backend** (`pnpm tauri dev`), not in a browser harness.

This is **M2-close blocker #3 of 3** — the last item gating `/product-finalize` for Milestone 2 (operator directive 2026-06-21). Blockers #1 (WP13 ⌘W) and #2 (WP11 git-status path-keying) are already cleared.

## Initial Observations
- The terminal area is present and focused (blinking cursor), but the expected CC/shell prompt output never paints — strongly suggests a **render/fit timing** issue rather than a dead PTY: the bytes likely arrive but xterm has a zero/stale size at the moment of the initial flush, so the first prompt frame lands off-grid or in a 0-row viewport.
- **Confirmed NOT a WP11 regression:** `git diff b3bcdb0` (Phase 5 of WP11 tree-density) touched **zero** terminal code — `TerminalPane` / `XtermPane` / `cc_session` / the terminal slot's display+active gating are byte-identical (only whitespace re-indent). Source: `workflow/archive/m2-wp11-tree-density-git-indicators.md` L215 `[SURFACED-2026-06-21]`.
- arch.md (L11, WP7 as-built note) records the relevant fragility: "xterm wiring needed **rAF-deferred fit/resize + explicit `term.focus()` (mount + post-spawn + click)** for correct sizing/input under WKWebView (verify-human round-1 finding)." The blank-cursor symptom is the failure mode that wiring was meant to prevent.
- Relevant frontend surfaces: `src/components/workspace/XtermPane.tsx`, `src/components/workspace/TerminalPane.tsx`. Backend: `src-tauri/src/cc_session/` (spawn → `cc-output-<sid>` / `cc-session-ready` events).
- **Verification discipline:** browser verify-self is **blind** to the PTY — diagnosis must be against the live native app via `pnpm tauri dev` + `ps`/screencapture/stderr (memory: `verify-native-pty-via-ps-screencapture-stderr`).

## Hypotheses
- **H1 (primary): fit-on-activate race.** When a workspace is activated (`display:none`→`block`), xterm runs `fit()` against a container whose layout dimensions aren't settled yet (or were 0 while hidden), so the addon computes 0 rows/cols; the initial CC prompt flush paints into a degenerate viewport and never reflows. (unverified)
- **H2: prompt-flush ordering vs `cc_ready`/first-fit.** The first PTY output bytes (the prompt) arrive and are written to xterm *before* the rAF-deferred fit/focus has run, so they're consumed against a stale geometry and not repainted after resize. (unverified)
- **H3: rAF/focus deferral not firing on the activation path.** The mount/post-spawn/click rAF-fit triple (arch.md L11) covers spawn-time but may not cover the **switch-back / re-activation** path, leaving a previously-hidden workspace un-fit on promote-to-center-stage. (unverified)
- **H4: WKWebView-specific layout timing.** WKWebView reports container size differently/later than Chromium during the hidden→visible transition, so a single rAF is insufficient and a measured/double-rAF or ResizeObserver gate is needed. (unverified)

## Codify — 2026-06-22 13:55

**Path:** B (new coverage from scratch). The upstream reproduce artifact was a **manual recipe** + live operator observation, not a CI test (a native-PTY render race — Playwright is blind to the PTY, and the project has no RTL/jsdom; test posture is pure-logic-only). So a CI regression test had to be written.

**Test-level decision:** The honest root-cause invariant is *structural and pure* — "the spawn effect's re-trigger set must never include the session-lifecycle phase." A component-render test would require introducing RTL+jsdom (a new test stack the project deliberately omits) during incident response; an end-to-end test can't observe the native PTY. Per operator decision, extracted the trigger contract into a pure seam and unit-tested it in the existing node/vitest setup — and wired XtermPane to *consume* that seam so the test is load-bearing, not a mirror.

**Test(s):**
- New pure module `src/cc/spawnTrigger.ts` — `spawnTriggerDeps()` / `isSpawnTrigger()` encode the re-spawn trigger set (`spawnNonce`, `active`, `projectPath`, `spawnCommand`), explicitly **excluding** `bridge.phase`. XtermPane's spawn-effect dep array is now built from `spawnTriggerDeps(...)` (single source of truth).
- New test `src/cc/__tests__/spawnTrigger.test.ts` (4 tests) — the load-bearing assertion `isSpawnTrigger("bridge.phase") === false` (+ `"phase"`/`"spawning"`/`"live"`); the four legit triggers are true; the dep tuple is exactly those four in order (no phase smuggled in); and identical-trigger states produce an identical tuple (a spawning→live transition cannot re-run the effect). **Re-introducing `bridge.phase` as a trigger fails this test.**

**Would-have-failed-pre-fix:** yes — pre-fix the effect depended on `bridge.phase`; encoding that contract makes `isSpawnTrigger("bridge.phase")` true, failing test #1.

**Integration boundary:** The mitigation is inside the `XtermPane` React component (a UI surface), not an HTTP/CLI boundary. The consuming surface is XtermPane's spawn effect, which now imports + uses `spawnTriggerDeps` — so the unit-tested contract is the live dependency, not a parallel copy. The *live render* (shell prompt actually paints over the real PTY) is **not** CI-coverable here; it is the documented **manual-regression step** in the recipe below (operator-confirmed this run).

**Full suite result:** passed — **vitest 342/342 (37 files)** (was 338; +4 new). tsc clean, eslint `--max-warnings 0` clean, prettier clean. No test triage needed (no failures).

## Mitigation — 2026-06-22 13:45

**Fix (applied, single file `src/components/workspace/XtermPane.tsx`):** Stop the spawn effect from re-running on the internal `spawning→live` phase flip, so its cleanup no longer tears down the `cc-output` listener mid-spawn.

- Removed `bridge.phase` from the spawn effect's dependency array; added a `spawnNonce` (`useState<number>`) as the sole re-spawn trigger. Deps are now `[spawnNonce, projectPath, fitAndResize, spawnCommand, active]`.
- The effect guard changed from `if (bridge.phase !== "spawning" || !active) return;` to `if (!active) return;` (the deferred-`active` gate is preserved; the phase guard is no longer needed because `spawnNonce`/dep changes are the only triggers and each legitimately wants a fresh spawn).
- `handleRelaunch` now bumps the nonce (`setSpawnNonce((n) => n + 1)`) in addition to `dispatch({ type: "relaunch" })`, so Re-launch/Retry still re-spawns.
- Updated the LIFECYCLE comment + the now-stale `cc_ready` comment.

**Why this fixes it:** with `bridge.phase` out of the deps, `dispatch({ spawned })` (which flips phase `spawning→live`) no longer re-renders-then-re-runs the effect, so the cleanup (`cancelled=true` + `unlistenOutput?.()`) does NOT fire at "spawned." The `cc-output` listener stays attached for the session's lifetime — present when the fire-and-forget `cc_ready` flush of the shell's one-shot prompt arrives → the prompt paints. Torn down only on a real teardown (unmount / `active`→false / `projectPath`/`spawnCommand` change / relaunch).

**Invariants preserved:** the WP7 single-session `cancelled` closure-flag de-dup (NOT converted to a ref); the StrictMode mount→cleanup→remount behavior (run1 self-kills its orphan); the WP9 deferred-spawn-on-first-`active` gate; the backend buffer-and-flush (unchanged — necessary, and now sufficient because the listener survives).

**Verification (automated):**
- `tsc --noEmit`: clean.
- `eslint XtermPane.tsx --max-warnings 0`: 0 warnings (exhaustive-deps satisfied; the `bridge.phase` omission is intentional and documented inline).
- `vitest run` (full): **338 passed (36 files)** — incl. the pure bridge reducer tests (unchanged) and the workspace component/guard tests.

**Verification (live — REQUIRED, this is why it was an incident not a task):** automated tests cannot confirm the shell prompt actually paints against the real PTY. **CONFIRMED FIXED by operator 2026-06-22** — `pnpm tauri dev`, opened a project, clicked the Terminal tab: the shell prompt now renders (no longer blank-cursor); left CC pane unaffected. Was 10/10 broken before. Monitoring start: 2026-06-22 13:45; verified clear.

## Investigation — 2026-06-22 13:30

### Observed Facts (via `/debug-empirical-telemetry` — 6 ordered log lines across the spawn lifecycle, run live, then removed)
- For the **`term_spawn`** pane, the `cc-output-<sid>` listener handler **NEVER fired** (0 occurrences of the (d) log). For the **`cc_spawn`** pane it fired 9× (prompt + banner stream).
- The observed `term_spawn` lifecycle order on Terminal-tab activation was:
  `(a) phase=spawning active=false` ×2 (deferred) → click → `(a) phase=spawning active=true` → `(b) spawn-resolved sid=cc-3` → `(c) cc_ready invoked` → **`(z) CLEANUP cancelled→true`** → `(a) phase=live active=true` → `(e) post-spawn fit cols=78 rows=42`.
- Post-spawn fit reported **cols=78 rows=42** (a healthy, non-degenerate size).
- `ps` confirmed the shell child spawns (a `/bin/zsh -c …` under the claudesk PID) — the backend is alive and emitting.

### Root Cause (CONFIRMED)
**A lost-flush race on the right-panel Terminal's deferred-spawn path, in `src/components/workspace/XtermPane.tsx` (the spawn effect, ~:196-263).**

The spawn effect lists `bridge.phase` in its dependency array (:263). Inside the effect, `dispatch({ type: "spawned" })` (:242) flips `bridge.phase` `spawning`→`live`, which **synchronously re-renders and re-runs the effect**, firing its cleanup (:258-262) — `cancelled = true` + **`unlistenOutput?.()`** tears down the `cc-output` listener. Immediately before that dispatch, `cc_ready` is called as **fire-and-forget** (`void invoke("cc_ready", …)`, :240), which asks the backend to drain its buffered backlog and `app.emit` the shell's one-shot prompt.

These two are **unordered**: the React re-render + cleanup (synchronous / microtask-fast) consistently wins the race against the IPC round-trip (`cc_ready` command → backend `drain_backlog` → `app.emit` → webview event dispatch). So the flushed prompt bytes arrive **after** the listener is gone and are dropped. The post-`live` effect re-run does **not** re-attach a listener (it returns at :197 because `phase !== "spawning"`). Result: the shell's single prompt is lost permanently.

**Why CC is fine but the shell is not** — exactly the asymmetry the backend comment at `mod.rs:170` foresaw (*"CC happened to survive only because it emits continuously"*): CC streams output continuously, so even after the listener is torn down and (for CC) re-attached on subsequent activity, later bytes paint. The **shell emits its prompt exactly once**; lose that one flush and there is nothing else to render → permanently blank-but-cursor.

**Why resize doesn't recover it (confirms it's not a sizing bug):** the backlog was already drained to live mode by `cc_ready`, so there are no buffered bytes to re-emit; a SIGWINCH from resize doesn't make a quiescent shell reprint its prompt. cols/rows=78×42 proves the viewport is correctly sized — H2 ruled out. Single spawn observed — H3 ruled out.

**Stale/incorrect assumption in the current code:** the comments at `XtermPane.tsx:191-195` and `:236-239` assert the flush "lands … before the spawning→live re-run's cleanup tears it down." That assumption holds only for a *continuous* emitter; it is **false for a one-shot emitter** because `cc_ready` is fire-and-forget and nothing orders the backend's flush-emit ahead of the synchronous cleanup.

### Hypotheses — final status
- **H1 (no-bytes / lost flush): CONFIRMED** by the telemetry (listener never fires).
- **H2 (degenerate viewport): REJECTED** (cols/rows=78×42; resize doesn't recover).
- **H3 (double-spawn orphan): REJECTED** (single (b) spawn-resolved; the `cancelled` de-dup behaved correctly).

### Resolution Plan (for `/incident-mitigate` — NOT applied here)
Goal: guarantee the `cc-output` listener is **attached and stays attached** when the one-shot prompt flush arrives, without regressing the WP7 single-session de-dup (the `cancelled` closure-flag invariant at :183-190 must be preserved — do NOT convert it to a ref).

Candidate fixes (mitigate picks one; the first is preferred):
1. **Break the `bridge.phase` → cleanup feedback loop.** The cleanup unlistens because `dispatch({spawned})` re-runs the effect. Options: (a) remove `bridge.phase` from the dep array and gate the spawn on a `useRef` "has-spawned" latch + the `active` flip instead, so the spawning→live transition no longer re-runs/cleans-up the effect that owns the listener; or (b) **don't unlisten in the cleanup on the normal spawning→live transition** — only unlisten on true unmount / `active`→false / `projectPath` change. The listener should live for the session's lifetime (like the mount-effect terminal does), not be torn down by an internal phase flip.
2. **Make the flush ordering deterministic** — `await invoke("cc_ready", …)` and only then `dispatch({spawned})`, so the flush emit is requested and (ideally) delivered before the re-render's cleanup. (Weaker: still races the emit→event-dispatch hop; prefer #1, which removes the teardown entirely.)
3. Belt-and-suspenders: keep the backend in buffering mode and have `mark_ready` **idempotently re-flushable**, or re-`cc_ready` after the post-`live` re-attach — but #1 is the clean structural fix.

**Regression-coverage note for `/incident-codify`:** the natural codify anchor is a frontend test asserting that the `cc-output` listener for a `term_spawn` pane survives the `spawning→live` dispatch (i.e. is NOT torn down by the internal phase transition), and/or a bridge/effect test that the deferred-spawn path keeps exactly one live listener through the phase flip. The manual recipe below remains the live-verification gate.

---

## Reproduction Attempt
**Surface chosen:** manual recipe (a WKWebView layout-timing race against the real PTY — a unit/integration test cannot reproduce it; browser verify-self is blind to the PTY per the `verify-native-pty-via-ps-screencapture-stderr` discipline).
**Outcome:** **REPRODUCED** — and the reproduction *corrected the surface*: it is **NOT the left CC pane** and **NOT a flaky timing race**.
**Determinism:** **every-run (10 out of 10)** — deterministic, not timing-sensitive. Window resize does **not** recover it.
**Artifact:** operator screenshots 2026-06-22 (`pnpm tauri dev`, project `~/Tmp/yitang-copy`). The console showed only Vite connect lines (no errors).

### REPRODUCTION FINDING (corrects the report's framing)
The blank-but-blinking-cursor pane is the **right-half RightPanelHost "Terminal" tab** (the WP9 second-terminal panel, `TerminalPane`→`XtermPane` with `spawnCommand="term_spawn"`), **NOT** the left-half CC pane. In the screenshot the **left CC pane renders perfectly** (full `claude` banner + prompt + status line); the right pane has the **Terminal** tab selected (active) and shows only a blinking cursor.

This **reclassifies the incident**:
- It is **not** the WP9 left-CC prompt-flush / fit-on-activate *timing* race I originally hypothesized (that pane is healthy).
- 10/10 determinism + resize-does-not-recover **rules out the sizing-race hypotheses (H1, H2, H4)** — a 0-row fit would be intermittent and resize-recoverable.
- It points squarely at a **structural defect on the right-panel Terminal's deferred-spawn / first-activation path** (`active = visible && panel === "terminal"`, RightPanelHost.tsx:519 → XtermPane spawn gate :197) — hypothesis **(c)**: the shell either never spawns, or spawns but its buffered prompt is never flushed to an attached listener, on this `active`-gated path.

**Backend corroboration (read-only, not yet root-caused):** `src-tauri/src/cc_session/mod.rs:169` literally documents the failure mode this is — *"Without buffering those bytes are lost and the pane stays blank."* The `mark_ready`/`cc_ready` buffer-and-flush exists to prevent exactly this; a deterministic blank means the flush is not reaching an attached listener on the `term_spawn` deferred path. **Root-cause is investigate's job — not done here.**

### Revised hypothesis for /incident-investigate (anchor)
**H-c (primary, replaces H1/H2/H4):** On the right-panel Terminal's deferred-spawn path, the spawn fires on first activation but the prompt-flush (`cc_ready`) races/mis-orders against listener attachment *for `term_spawn` specifically*, OR the `active`-gated spawn effect tears down/re-runs (the `cancelled` self-kill) such that the surviving run never re-flushes — leaving the buffered shell prompt stranded. Deterministic because it's structural to the activation sequence, not timing. Investigate against `term_spawn` + the XtermPane `active` re-run lifecycle (:196-263) + `mark_ready` flush ordering (`mod.rs`).

**Artifacts to preserve for `/incident-codify`:** this recipe + the 10/10 determinism + the surface correction. Do not delete.



### Code orientation (read before running — narrows where the race lives)
`src/components/workspace/XtermPane.tsx` already carries the two guards this incident is a recurrence of:
- **Backend buffer-and-flush** (`cc_ready`): the shell's one-shot prompt is buffered by the backend until the frontend's `cc-output-<sid>` listener is attached, then flushed (XtermPane.tsx:236-240). Designed to fix exactly the prompt-flush race.
- **rAF-deferred fit + focus**: at mount (`:138`), post-spawn (`:247`), and on becoming-active (`:270`). Designed to fix the zero/stale-size fit (the 80-col / degenerate-viewport bug).

So a recurrence means a **gap in one of those guards**, candidates to discriminate via the recipe:
- (a) the prompt flushes (cc_ready fires) but against a **0-row fitted viewport** → bytes written, not visible — H1/H2.
- (b) a **single rAF is insufficient** under WKWebView on the cold-start / activation path — geometry not settled after one frame — H4.
- (c) the prompt **never flushes** (cc_ready lost / listener not attached) → truly empty buffer — distinct from a sizing bug; would show nothing even after a manual resize.

### Recipe (operator runs — agent cannot observe the WKWebView render)
Preconditions: `lsof -ti:1420 | xargs kill` if a stale Vite holds the port; no other `pnpm tauri dev` running (shared `target/` lock — kill before any `cargo test`).

1. `pnpm tauri dev` from repo root; wait for the window.
2. From the picker, click a project to open a workspace (cold start). **Observe the left-half terminal.**
   - **Expected:** the CC `claude` prompt/TUI paints within ~1s.
   - **Watch for:** blank pane + only a blinking cursor (the bug).
3. If blank: **resize the Claudesk window a few px** (triggers the `ResizeObserver`→`fitAndResize` path, XtermPane.tsx:156-159). Note whether the prompt **appears on resize** (→ confirms sizing-race (a)/(b), prompt was buffered & written but to a degenerate viewport) or **stays blank** (→ points to (c), flush/listener gap).
4. Repeat the open ~5–10× (close + reopen, or open several workspaces) to gauge frequency → fill **Determinism: X out of Y**.
5. Capture verbatim: a screenshot of the blank pane, and the dev stderr/console around the open (look for the `cc-output-<sid>` / `cc_ready` / `cc_resize` ordering). `ps` to confirm the `claude` PTY child is alive (rules out a dead backend).

**Hand back to me with:** out-of-N frequency, whether a manual resize recovers it, and the stderr/console snippet — that discriminates (a)/(b) vs (c) and anchors `/incident-investigate`.

## Triage Assessment (2026-06-22)
- **Severity: P1 — major feature broken.** The embedded CC terminal is Claudesk's primary left-half surface; a blank-but-for-cursor render makes the activated workspace unusable until it recovers. Affects the single daily-driver user routinely on the activation path. Investigate immediately.
- **User-facing impact:** activated workspace shows no prompt/output — only a blinking cursor — so the user can't see or trust the CC session state on open.
- **Affected systems:** the xterm.js render/fit path on workspace activation; one user (single-user desktop app). No data loss.
- **Workaround:** likely clears on a manual resize / re-click / window-resize (the rAF-fit/focus then runs against settled geometry) — to be confirmed during reproduce. Not a reliable workaround, hence P1 not P2.
- **Duplicate?** Not a duplicate incident, but a **recurrence** of a known Phase-1/WP9 race class (prompt-flush / fit-on-activate). No prior incident report on file for it (it was previously absorbed in WP9 verify-human, not filed).
- **Next path: I13 — reproduce first.** The race is exercisable locally against the real PTY via `pnpm tauri dev` (intermittent, but observable). Capture a deterministic recipe / failing observation as the red-green anchor + regression gate before investigating. Diagnosis is native-PTY only (browser verify-self is blind — memory `verify-native-pty-via-ps-screencapture-stderr`).

## Timeline
- 2026-06-21 — Symptom observed during WP11 Phase 5 verify-human; diagnosed as NOT WP11-caused; operator decided to file as a separate incident post-WP11-finalize.
- 2026-06-22 12:45 — Incident reported (this file); WP11 fully closed (commit `37cbc25`), no active WIP; opened as M2-close blocker #3.
- 2026-06-22 12:50 — Triaged **P1**; next path **I13 reproduce-first**.
- 2026-06-22 13:05 — **Reproduced 10/10** via the live recipe (operator). **Surface corrected:** it's the right-panel **Terminal** tab (`term_spawn` deferred-spawn path), not the left CC pane (which renders fine). Resize does not recover. Reclassified from a timing race to a structural defect on the `active`-gated deferred-spawn/flush path. → I14 investigate.
- 2026-06-22 13:30 — **Root cause confirmed** via `/debug-empirical-telemetry` (6 lifecycle logs, run live, removed clean — `git diff` zero). The `cc-output` listener is torn down by the spawn effect's cleanup when `dispatch({spawned})` flips `bridge.phase` spawning→live (a dep), and the fire-and-forget `cc_ready` flush of the shell's one-shot prompt arrives after the listener is gone → permanently blank. CC survives only because it emits continuously. → I6 mitigate.
- 2026-06-22 13:45 — **Fix applied** (`XtermPane.tsx`: spawn effect keys on `spawnNonce`, not `bridge.phase`); **operator live-verified FIXED** (shell prompt paints; left CC pane unaffected). → I17 codify.
- 2026-06-22 13:55 — **Codified** (Path B): pure `spawnTrigger.ts` contract + 4-test `spawnTrigger.test.ts`; XtermPane consumes the seam. Full suite 342/342, tsc/eslint/prettier clean. → I18 resolve.
