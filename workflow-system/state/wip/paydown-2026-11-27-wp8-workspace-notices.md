---
drive_mode: autopilot
---

# Feature: paydown-2026-11-27 WP8 — Workspace notices: kind + slot

**Workflow:** feature
**State:** ship (complete)
**Created:** 2026-11-27
**Source:** `workflow-system/product/backlog-paydown-wbs.md` §WP8

## Problem Statement

Each workspace has ONE toast slot (`Workspace.tsx` → `toast` state), and five writers share it
through `setInjectFailure`, which always stamps `kind: "error"`: refused injections (skill row,
Prompt panel, Recycle), the remote open notice + hook-install warning (`readRemoteOpenToast`, joined
into one string), the auto-resume withheld notices (`withheldNotice`), and the app's Detach-failure
notice. Last writer wins (the withheld notice overwrites the "started again" notice ~1.5 s later),
several of the "errors" report nothing that failed (red `role="alert"` for "it was started again"),
the hook warning comes back after every respawn, and a refused/failed OSC 52 copy is silent (the
operator pastes the PREVIOUS clipboard). Around the same seam, three wire/API shapes are fragile:
`injectCommand` reports refusals through a callback callers turn back into a value (Recycle's
object-cell trick), Detach's "already gone" rule is a substring of Rust's `UnknownSession` Display
text with no wire test, and the close-not-ended toast always says "unreachable" and never names
the project. Done = every notice carries its own kind, notices no longer overwrite each other, a
failed copy is visible, and the three shapes are values/typed with both sides pinned.

### Backlog items closed by this WP

- BL `SURFACE-2026-11-17-REMOTE-OPEN-STARTED-AGAIN-NOTICE-USES-THE-ERROR-STYLE` (+ M18 WP2 withheld addendum) — Phase 1
- QF `SURFACE-2026-11-16-QUALITY-M17WP4-HOOK-WARNING-SHARES-INJECT-TOAST` (+ WP5 update) — Phase 1
- QF `SURFACE-2026-11-18-QUALITY-OSC52-FAILED-COPY-IS-SILENT` — Phase 1
- QF `SURFACE-2026-11-18-QUALITY-WITHHELD-NOTICE-CAUSE-DEFAULT` — Phase 1
- QF `SURFACE-2026-11-16-QUALITY-M17WP3-INJECT-REFUSAL-AS-CALLBACK` — Phase 2
- QF `SURFACE-2026-11-17-QUALITY-M17WP5-UNKNOWN-SESSION-TEXT-COUPLING` — Phase 2
- QF `SURFACE-2026-11-17-QUALITY-M17WP5-CLOSE-NOT-ENDED-TOAST-CAUSE-AND-PROJECT` — Phase 2

### Plan-time defaults (flag any that are wrong)

- **PD1 — A notice STACK, not "error wins in a joined toast".** The WBS line offered "error kind wins
  in a joined toast" (BL) and "a separate slot or a once-per-connect latch" (QF). Neither fixes the
  QF's WP5 update (five writers, last wins: the withheld notice erases the open notice). Taken: the
  slot becomes a short list. Each notice renders as its own `.workspace-inject-toast` row with its
  own `data-kind`, its own role (`alert` / `status`) and its own ×. A notice whose text is already
  showing is not added twice (so a respawn's re-read of the sticky hook warning doesn't duplicate
  it), and a DISMISSED hook warning is latched by text, so a Recycle/drive-mode re-read doesn't
  bring it back. The open notice and the hook warning are no longer joined, so the BL's "joined"
  case can't occur. Its intent (a hook failure is never shown as neutral) is pinned directly:
  both rows present at once, open notice `info`, warning `error`. Surfaced as a Phase 1
  Alignment question.
- **PD2 — Docs catch-up keeps its own-entry rules** (`showDocsNotice`): it replaces only its own
  row, `null` clears only its own row, and auto-dismiss stays per row. The old "never replace a
  standing error" rule is no longer needed (rows coexist).
- **PD3 — `injectCommand` resolves to `InjectRefusal | null` = `{ message, reason } | null`, not
  `string | null`.** The supervisor (`useSupervisor.ts`) is a fourth caller and throws the
  diagnostic `message`, not `reason`; returning both keeps all four callers one-liners. The
  `onIpcError` positional parameter is REMOVED, so `label`/`buildPayload` move up one position.
  Every caller and test migrates in the same phase.
- **PD4 — Detach coupling: a Rust↔TS mirror test, not a typed wire code** (the WBS allows either).
  A Rust test reads `detachWorkspace.ts`'s `NO_SUCH_SESSION` literal and asserts
  `CcError::UnknownSession(_).to_string()` starts with it.
- **PD5 — close-not-ended payload gains `reason: "unreachable" | "failed"` and `project`** (the
  remote path's last segment, computed in Rust). The TS mirror and the existing mirror test grow
  with it. ⚠️ `App.tsx` is NOT edited: it already passes `e.payload` to `closeNotEndedText`, whose
  signature stays the same (`App.tsx` edits are a hard stop for open remote workspaces,
  `[[remote-verify-hygiene]]`).
- **PD6 — OSC 52:** the decoder distinguishes "too large" (refused → error toast) from "not a write"
  (read query, empty, malformed → silent, as today). An IPC/`pbcopy` failure → error toast. Both
  terminal panes (CC pane and the right-panel shell) report through the workspace's stack. The
  security-posture line is softened to say what the operator sees.

## Work Tree

- [x] Phase 1: Notices carry their kind and stack (every writer)
  **Observable outcomes:**
  - CLI: `./node_modules/.bin/vitest run src/components/workspace/__tests__/workspaceToasts.test.ts` exits 0. It covers the pure list: push dedupes by text, dismiss removes one row by id, docs' own-row replace/clear, and the hook-warning dismissed latch.
  - CLI: a live-mount (jsdom render) test of `Workspace` exits 0 and asserts that a remote open with BOTH an open notice and a hook warning renders TWO `[data-testid=workspace-inject-toast]` rows, `data-kind="info"` (`role=status`) for the "started again" text and `data-kind="error"` (`role=alert`) for the warning. A later withheld notice adds a THIRD row and erases neither. A second `onSessionId` (respawn) after × on the warning does not bring it back.
  - CLI: the same live-mount style asserts that a withheld auto-resume notice renders `data-kind="info"`, and a refused skill-button injection still renders `data-kind="error"`.
  - CLI: `osc52` tests exit 0. A payload over `MAX_CLIPBOARD_BYTES` calls the failure sink with the too-large text and never calls the clipboard sink. A read query / malformed payload calls neither. A rejected `clipboard_write` invoke calls the failure sink.
  - CLI: `withheldNotice` without a `cause` argument fails `tsc --noEmit` (the param is required). The one test that relied on the default passes `cause` explicitly.
  - Browser (dev app via tauri MCP bridge; state-changing, declared: types into a scratch workspace's right-panel login shell under `../claudesk-scratch/scratch-a`): print an OSC 52 whose payload decodes to > 4 MiB in the right-panel terminal → a `[data-testid=workspace-inject-toast][data-kind=error]` row naming a refused copy appears. `pbpaste` (read-only) is byte-identical before and after.
  - Browser (dev app, same scratch workspace): two notices raised back-to-back via the bridge both stay visible, each with its own ×. Clicking one × removes only that row.
  - CLI: `pnpm verify:auto` exits 0 (timeout 315000).
  **Alignment questions:**
  - (decision) PD1 in action: notices now STACK as separate rows instead of the newest replacing the last, and a dismissed hook warning stays dismissed for the workspace's life. Seeing two or three rows at once in the header, still what you want?
  - The OSC 52 refused-copy wording, seen in the toast: does it say clearly that the clipboard still holds the previous copy?
  - [x] P1.1 Pure module `src/components/workspace/workspaceToasts.ts`: the `Toast` row type (`id, text, kind, source?, autoDismissMs?`) and the list ops (push with text dedupe, dismiss, docs own-row set/clear, hook-warning dismissed latch). Unit tests
  - [x] P1.2 `Workspace.tsx`: replace the single `toast` state with the list. Render one row per toast (same testid/class/`data-kind`/role). Per-row auto-dismiss. Writers become `showError(text)` / `showInfo(text)` / `showDocsNotice`. Wire the app `notice` prop in. ⚠️ Funnel every list write through the one reducer (`[[extracted-machine-needs-a-live-caller-guard]]`)
  - [x] P1.3 `remoteHookWarning.ts`: `readRemoteOpenToast` → returns the open notice (info) and the hook warning (error, tagged `source: "hook"`) as separate notices, no join. `onSessionId` pushes both
  - [x] P1.4 Withheld notices → info (`onAutoResumeWithheld` → `showInfo`). Make `withheldNotice`'s `cause` required and update its test
  - [x] P1.5 OSC 52: decoder returns text / too-large / nothing. `registerOsc52(term, sink, onFailure)`. `writeMacClipboard` reports a rejected invoke through `onFailure`. `XtermPane` gains `onCopyFailed`, wired from the CC pane and from the right-panel `TerminalPane` (through `RightPanelHost`) to `showError`. Soften `arch/security-posture.md`'s "refused, not truncated (both sides)" line
  - [x] P1.6 Migrate the existing toast tests (`injectFailureToast`, `remoteHookWarningToast`, `remoteWorkspaceHeaderLive`, `remoteMenuLaunchers`, `detachWiring`) and add the live-mount pins above. Mutation-prove each new pin individually
  - [x] verify-auto — evidence: `pnpm verify:auto` → exit 0 in 73 s. lint 0 errors / 1 warning (`XtermPane.tsx` exhaustive-deps spread, PRE-EXISTING: the same warning at HEAD line 989). format:check, tsc, check:link pass. vitest 334 files / 4223 tests passed. cargo fmt, clippy `--all-targets -D warnings` pass. cargo test 1594 passed / 0 failed.
  - [x] verify-self — runner subagent (CLI outcomes) plus orchestrator (dev app via the tauri MCP bridge, which is orchestrator-only)
    - [x] workspaceToasts unit — evidence: the runner's vitest over 6 targeted spec files → exit 0, 48/48. The test bodies were read and match the outcome (dedupe returns the same state, dismiss by id, docs own-row with a fresh id, the hook latch, MAX_TOASTS eviction)
    - [x] live mount: open notice info/status plus hook warning error/alert as TWO rows, a later withheld notice adds a third row, a respawn after × does not bring the warning back — evidence: `remoteHookWarningToast.test.tsx` (3 named tests), in the 48/48. The positive control saw `remote_hook_warning` re-read 3×
    - [x] withheld = info; a refused skill inject stays error/alert — evidence: `remoteHookWarningToast` "withheld-restore notice" + `injectFailureToast` "a skill button whose cc_inject is refused", 48/48
    - [x] osc52 too-large / read / malformed / rejected `clipboard_write` / TerminalPane + RightPanelHost forwards — evidence: `osc52.test.ts`, `osc52Live.test.tsx`, `rightPanelCopyFailedWiring.test.tsx`, 48/48
    - [x] `withheldNotice` without `cause` fails tsc — evidence: a scratchpad tsconfig probe → exit 2 "TS2554: Expected 3 arguments, but got 2". The same call with a cause → exit 0. Repo tsc → exit 0
    - [x] Browser: refused copy → error row — evidence: dev app (`pnpm tauri:dev`, scratch-a). The real CC pane's xterm `Terminal` (found via its fiber) was written `ESC]52;c;<btoa(4 MiB + 1 byte)>BEL`, giving `[data-testid=workspace-inject-toast]` data-kind=error role=alert "That copy was larger than 4 MiB, so it was not copied. The clipboard still holds what you copied before.". `pbpaste | shasum` was identical before and after. ⚠️ Substitution: the outcome named the right-panel shell, but the dev window was HIDDEN (`visibilityState: hidden`), so the deferred `term_spawn` never ran (`no such session: ws-1-term-0`). The write went into the CC pane's real parser instead (the same `registerOsc52` path), skipping only the PTY byte transport. The right-panel forward is pinned by `rightPanelCopyFailedWiring` + `osc52Live` (TerminalPane)
    - [x] Browser: back-to-back notices both stay, each with ×, and × removes only its row — evidence: a second error row ("PROBE direct call", via the pane's real `onCopyFailed` prop) stood beside the copy row (2 rows). Its × removed only it (1 row left). An info row (via `onAutoResumeWithheld`) then stacked under the error row: 2 rows [error/alert, info/status], each with ×. Container computed `position:absolute; flex-direction:column`
    - [x] verify:auto — evidence: verify-auto run, exit 0 (73 s). Runner re-confirmed tsc + eslint exit 0
    - [x] align: (decision) PD1 stacking — evidence: screenshot `<session scratchpad>/wp8-p1-stack.png` (not kept) (red refused-copy row above a neutral info row, right-aligned under the header)
    - [x] align: OSC 52 wording — evidence: `COPY_TOO_LARGE_NOTICE` = "That copy was larger than 4 MiB, so it was not copied. The clipboard still holds what you copied before." and `copyFailedNotice(r)` = "Couldn't copy to the clipboard: <r>. The clipboard still holds what you copied before."
  - [x] verify-human — operator 2026-11-27: "all good" (F13)
    - [x] P1.verify-human.1: OSC 52 refused-copy wording (screenshot) — approved as worded
    - [x] P1.verify-human.2: (decision) PD1 — option A kept: notices stack as rows, and a dismissed hook warning stays dismissed
  - [x] verify-codify — no new tests needed: every verified behaviour already has a mutation-proved test from build (18/18 mutants killed). The consuming surface (`Workspace`'s header notice rows) is pinned by live mounts in `remoteHookWarningToast` / `injectFailureToast`, and the real `XtermPane` → `onCopyFailed` by `osc52Live`. Full gate `pnpm verify:auto` → exit 0 (69 s): vitest 334 files / 4223 tests, cargo 1594 passed / 0 failed, lint 0 errors (1 pre-existing warning)
    Test scope: full — suite not long (runtimes.md `pnpm verify:auto` Last 73s)

- [x] Phase 2: Refusals as values, wire texts pinned on both sides
  **Relevance check (before Phase 2):**
  - Requester still needs this: yes — the three QF items are still open in the backlog
  - Requirements unchanged: yes — Phase 1's operator ruling (PD1 option A) does not touch them
  - Solution still feasible: yes — no other code path reads `onIpcError` or the close-not-ended payload
  - No superior alternative discovered: yes — PD4's mirror test matches the existing close-not-ended mirror precedent
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: `injectCommand` resolves to `null` on success and to `{ message, reason }` when `cc_inject` rejects, verified by vitest on `injectCommandDefaultPath`/`sendStagedDraft`. `grep -c "onIpcError" src -r` = 0. `recycleSession.ts` has no `refusal: { reason` object cell.
  - CLI: the skill-row, Prompt-panel and Recycle refusal toasts keep their exact texts (`skillInjectFailure` / `promptInjectFailure` / `recycleInjectFailure`), pinned by the existing live-mount tests, still green. The supervisor's failed inject still throws the diagnostic `message` and disarms its origin (existing supervisor tests green).
  - CLI: `cargo test unknown_session` includes a new mirror test that fails if `CcError::UnknownSession`'s Display is reworded away from `detachWorkspace.ts`'s `NO_SUCH_SESSION` (mutation-proved by rewording the Rust `#[error]` text).
  - CLI: `cargo test the_close_not_ended_event_matches_its_ts_mirror` exits 0 with the payload `{projectPath, host, project, reason}`. The kill test asserts `reason` is `"unreachable"` for `LinkNotUp` and `"failed"` for `Run(_)`.
  - CLI: vitest on `closeNotEndedText` → the unreachable and failed variants each name the project and the host, and differ in the cause clause.
  - CLI: `pnpm verify:auto` exits 0 (incl. `check:link`). Then a dev-app boot smoke via the bridge: `document.querySelector('#root').children.length > 0`.
  **Alignment questions:**
  - (decision) The close-not-ended wording for the two causes (unreachable vs the end failed), with the project named: still what you want? (Evidence: the rendered texts.)
  - [x] P2.1 `injectCommand(sessionId, command, label?, buildPayload?) → Promise<InjectRefusal | null>`. Migrate skillButtons, PromptPanel, recycleSession (delete `injectRefusal`'s cell), useSupervisor, `FireRun.inject`'s type, and every test call site in the same phase
  - [x] P2.2 Rust mirror test: `CcError::UnknownSession` Display ↔ `detachWorkspace.ts` `NO_SUCH_SESSION` (`include_str!`, like the close-not-ended mirror)
  - [x] P2.3 `RemotePorts::close_not_ended(reason)`. `kill` maps `LinkNotUp` → `Unreachable` and `Run(_)` → `Failed`. The payload adds `project` + `reason`. Update the TS mirror + `closeNotEndedText` wording (no `App.tsx` edit) + both Rust tests
  - [x] verify-auto — evidence: first `pnpm verify:auto` → exit 1 at `format:check` (`useSupervisor.test.ts`, my unformatted Phase 2 edit). After `prettier --write` (that file only): `pnpm verify:auto` → exit 0 in 80 s. lint 0 errors / 1 warning (the pre-existing `XtermPane` exhaustive-deps spread). tsc, check:link pass. vitest 334 files / 4225 tests. cargo fmt, clippy `--all-targets -D warnings` pass. cargo test 1596 passed / 0 failed. The reflowed label guard was re-proved: mutant N7 (`injectCommand(pty, command)`) killed
  - [x] verify-self — runner subagent (CLI) + orchestrator (dev app via the bridge)
    - [x] `injectCommand` → null / `{message, reason}`; no live `onIpcError`; no Recycle object cell — evidence: vitest (7 specs + `prompt/__tests__/`) → 19 files / 292 tests passed, exit 0. `grep -rn onIpcError src` → 3 hits, all COMMENTS (history notes in `autoResumeFire.ts`, `recycleSession.test.ts`, `injectCommandDefaultPath.test.ts`). `grep "refusal:\s*{" recycleSession.ts` → no match
    - [x] refusal toast texts unchanged; the supervisor re-throws `message` and disarms the origin — evidence: `git diff HEAD -- injectFailure.ts` → empty. Live mounts in `injectFailureToast` green. `activityFunnel` asserts `["error","inject-failed"]`, and `claimOrigin` is null after the failure
    - [x] `UnknownSession` ↔ `NO_SUCH_SESSION` mirror — evidence: `cargo test --lib unknown_session` → 3 passed. Runner mutant `#[error("unknown session: {0}")]` → FAILED ("…no longer starts with the TS mirror \"no such session\""), restored (shasum 75d2a126… matched). Live, the dev backend's rejection reads "no such session: wp8-no-such-session"
    - [x] close-not-ended payload + reason mapping — evidence: `cargo test --lib cc_session::remote::tests::` → 34 passed. The mirror serializes `{projectPath, host, project, reason: "unreachable"|"failed"}`. The kill test logs `LinkNotUp` → Unreachable and `Run` → Failed, after `record EndPending`
    - [x] `closeNotEndedText` both variants via the real App listener — evidence: `detachWiring.test.tsx` asserts "Couldn't end the Claude Code session for proj: mini-host isn't reachable, …" and "… for proj: ending it on mini-host failed, …" (and the failed one contains no "isn't reachable")
    - [x] verify:auto + boot smoke — evidence: verify-auto exit 0 (80 s). The runner re-ran tsc and clippy `--all-targets -D warnings`: exit 0. Dev app (`pnpm tauri:dev`, fresh launch after the Rust changes): `#root` children = 1, picker rendered. A live `import('/src/components/workspace/autoResumeFire.ts').injectCommand('wp8-no-such-session', '/session-restore', 'skill-button')` resolved to `{message: "skill-button could not run /session-restore", reason: "no such session: wp8-no-such-session"}`
    - [x] align: (decision) close-not-ended wording — evidence: NEW unreachable "Couldn't end the Claude Code session for proj: mini-host isn't reachable, so the session is still running there. The next time you open it, Claudesk will ask whether to end it or reconnect." / NEW failed "Couldn't end the Claude Code session for proj: ending it on mini-host failed, so the session is still running there. …" / OLD (one text for both) "Couldn't end the Claude Code session on mini-host: it isn't reachable, so the session is still running there. …"
  - [x] verify-human — operator 2026-11-27: "go with your recommendation" (F13)
    - [x] P2.verify-human.1: (decision) close-not-ended wording — kept as built
    - [x] P2.verify-human.2: (decision) evidence gap accepted — the live check of `AppPorts` filling `project` is deferred to the WP9/WP10 remote session (backlog `SURFACE-2026-11-27-CLOSE-NOT-ENDED-PROJECT-NOT-LIVE-CHECKED`)
  - [x] verify-codify — no new tests needed: every Phase 2 behaviour has a mutation-proved test from build (14 mutants killed). The consuming surfaces are pinned end to end: the real App listener → `app-toast` (`detachWiring`), live Workspace mounts for the refusal toasts (`injectFailureToast`), and the supervisor's `fireOne` record (`activityFunnel`). Full gate: `pnpm verify:auto` → vitest 334 files / 4225 passed, lint/format/tsc/check:link/fmt/clippy pass. cargo 1536 passed / 1 FAILED, the pre-existing flaky `hook_socket` closed-peer test (see Test Triage): it passed both retries, and a full `cargo test` re-run gave 1596 passed / 0 failed. Known residual: no test asserts the supervisor's thrown `message` TEXT (only that the failure is recorded as `inject-failed`)
    Test scope: full — last phase

## Current Node
- **Path:** Feature > review-quality
- **Active scope:** review-quality against the ship commit. Ship: full suite reused from Phase 2's codify run (`Test scope: full — last phase`; vitest 4225 passed, cargo 1596/0 after the triaged flaky re-run). Fast checks re-run at ship: eslint 0 errors, prettier clean, tsc clean Dev app running (PID 75302, picker). The dev app was stopped before the Rust edits (the PIDs I launched, by full command line)
- **Blocked:** none
- **Unvisited:** none (all phases complete)
- **Open discoveries:** none

## Build notes (Phase 1)

- Mutation proof, each mutant alone, restored by `cp` + `shasum`: 18/18 killed. Open-notice kind,
  withheld→info, dedupe, hook latch, the latch staying hook-only (first SURVIVED; the discriminating
  case was added and then killed it), CC-pane and right-panel `onCopyFailed` wiring, the
  `TerminalPane` forward, `XtermPane`'s registration (both args), both too-large checks,
  `macClipboardSink`'s failure call, the bound, info-first eviction, docs in-place replace, and
  docs-null clearing only its own row. RightPanelHost → TerminalPane's `onCopyFailed` forward first
  SURVIVED the whole suite (4127 tests). The new `rightPanelCopyFailedWiring.test.tsx` (real host,
  stubbed `TerminalPane`) now kills it.
- `App.tsx` not touched (the app-level `.app-toast` is a separate class).

## Build notes (Phase 2)

- Mutation proof, each mutant alone, restored by `cp` + `shasum`: 13/13 killed. TS: the skill-row
  refusal toast, the Prompt-panel refusal toast (no kill inside `injectFailureToast`, whose right
  panel is a stub, but a Prompt-panel test killed it: 1/1334 failed), Recycle's refusal reason,
  the supervisor re-throw, `injectCommand` returning the refusal, `reason` from `Error.message`,
  and the close-not-ended "why" and project wording. Rust: the `LinkNotUp`/`Run` → reason mapping,
  the `UnknownSession` `#[error]` text, the TS `NO_SUCH_SESSION` literal, `project_label`, and the
  reason's serde case.
- ⚠️ Not unit-reachable: `AppPorts::close_not_ended` fills `project` from `project_label(target.path())`
  through a real `AppHandle` emit. `project_label` is pinned on its own, and the payload shape by the
  mirror test. The live check needs a remote row with its link down (WP9/WP10's remote session).
- Obsolete tests updated (argument positions moved deliberately): `recycleSession.test.ts`
  "labels its injections 'recycle'" (3rd argument now), `useSupervisor.test.ts` "forwards the label"
  (regex now `injectCommand(pty, command, label)`), and the `refusing` double, which resolves to the
  refusal.

## Test Triage — hook_socket::tests::a_client_closed_before_accept_refuses_the_timeout_benignly_and_still_delivers
Classification: Flaky test — a failure unrelated to the new code. WP8 changed no file under `src-tauri/src/hook_socket/` (`git diff HEAD -- src-tauri/src/hook_socket/` is empty). The test came in with `e96e3b4`, before WP8, and it passed in this session's three earlier full runs (Phase 1 verify-auto, Phase 1 codify, Phase 2 verify-auto).
Confidence: high that WP8 did not cause it. Whether it is flaky is decided by re-running.
Evidence: it panicked at `hook_socket/mod.rs` line 942, "macOS refuses SO_RCVTIMEO on a socket whose peer already closed: ()". The assertion expects the OS to REFUSE `set_read_timeout` on an already-closed peer; this run the call succeeded, which is a kernel-timing race in the test's premise.
Action: re-ran the single test up to 2 more times (3 runs in all). **Result: passed both retries (inconsistent across runs → flaky, confirmed).** Neither the code nor the test was changed. A full `cargo test` re-run → 1596 passed / 0 failed. Logged as backlog `SURFACE-2026-11-27-HOOK-SOCKET-CLOSED-PEER-TEST-FLAKY`.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
[SURFACED-2026-11-27] Phase 2 > P2.3 — `AppPorts::close_not_ended`'s `project` (from `project_label(target.path())`) has no live check. It rides WP9/WP10's remote session (operator accepted the gap at P2.verify-human.2). Logged as `SURFACE-2026-11-27-CLOSE-NOT-ENDED-PROJECT-NOT-LIVE-CHECKED`.
