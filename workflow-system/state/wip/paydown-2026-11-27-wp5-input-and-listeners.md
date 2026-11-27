---
drive_mode: autopilot
---

# Feature: paydown-2026-11-27 WP5 — frontend input + listener correctness

**Workflow:** feature
**State:** ship (complete)
**Created:** 2026-11-27

## Problem Statement
Seven frontend findings from the 2026-11-27 sweep (`workflow-system/product/backlog-paydown-wbs.md`
§WP5). The two that matter: (1) the picker overlay's dismiss restores focus to whatever had it at
open, without checking that element is still in the center-stage workspace. The review read this
as keystrokes reaching a hidden yolo session after "+", ⌘⇧2, Esc. ⚠️ But background workspaces are
`inert={!visible}`, and `focus()` inside an inert subtree is a no-op in WKWebView (jsdom does not
implement inert, which is how a code reading reaches the misroute). So the live outcome may be
"focus stranded on `<body>`" (B's pane takes no keys until clicked) rather than misrouting. Phase 1
reproduces it live FIRST and fixes whichever is true. (2) `useTauriListen`'s StrictMode first-mount
cleanup unlistens after `listen` resolves; the unlisten throws (`listeners[eventId].handlerId`),
the listener stays attached, and every event is delivered twice in dev (seen as doubled install-log
lines at M18 WP6). The rest are small: a never-retrying store latch, a third inline gate-hook call,
a cross-layer `shortHost` import, a hard-coded listener count, and drift copy that names GitHub for
any origin.

## Work Tree

- [x] Phase 1: Picker dismiss focus + single-delivery listeners
  **Observable outcomes:**
  - Browser (dev app via the MCP bridge, two scratch workspaces A and B, A centered with its CC pane's helper textarea focused): "+" opens the overlay; dispatch the real ⌘⇧2 to switch to B; Esc. Reproduction FIRST on the unfixed build: record `document.activeElement` (tag, class, `closest('.workspace')?.dataset.testid`) after the Esc. After the fix: `activeElement` is NOT inside a `.workspace[data-visible="false"]` (and, per D7, is never A's textarea).
  - Browser (same dev app): opening a workspace raises no `unhandledrejection` with `handlerId` on a `window` tap installed before the open (positive control: the same tap on the unfixed build records ≥1).
  - CLI: `./node_modules/.bin/vitest run` on a new `<StrictMode>` jsdom test of `useTauriListen` → one handler call per emitted event (fails on HEAD's hook: two calls); and a `pickerFocusWiring` case through the real `App` (+ → switch → Esc) asserting the restore target is not in the background workspace.
  - Console: no `handlerId` TypeError during the Phase-1 session.
  **Alignment questions:**
  - none (D7 already chose "skip the stale restore target" over gating the switch)
  - [x] P1.1 Live repro of the dismiss-after-switch focus on the unfixed dev build (record activeElement)
  - [x] P1.2 Fix `restoreFocus`: skip a target inside an inert subtree / a non-visible workspace
  - [x] P1.3 `pickerFocusWiring` App-level case for + → ⌘⇧digit → Esc
  - [x] P1.4 `useTauriListen`: guard the handler with the effect's `cancelled` flag; catch a failed unlisten (sync throw or rejected promise)
  - [x] P1.5 `<StrictMode>` jsdom test counting handler calls per event
  - [x] verify-auto — evidence: `pnpm verify:auto` → EXIT=0 in 63 s (331 files / 4201 vitest; cargo 1519 passed; lint 0 errors, 1 pre-existing `XtermPane` exhaustive-deps warning)
  - [x] verify-self — run by the orchestrator over the MCP tauri bridge (not a runner subagent: `[[mcp-bridge-tools-not-exposed-to-subagents]]`); dev app freshly launched from the clean tree, fixes hot-reloaded
    - [x] Browser focus: ws-5 pane focused → "+" (filter focused) → real ⌘⇧1 capture listener → ws-1 visible, ws-5 `inert` → Esc → evidence: `activeElement` = `TEXTAREA.xterm-helper-textarea`, `closest('.workspace')` = ws-1 (`data-visible="true"`), `closest('.xterm-pane')` = `xterm-pane`; positive control on the unfixed build (same sequence): `activeElement` = `BODY`
    - [x] Browser regression: "+" → Esc with no switch → evidence: focus back in ws-1's `xterm-pane` textarea
    - [x] Browser unlisten: `window` `unhandledrejection` tap reset, then a workspace open (scratch-a) → evidence: `__rej = []`; positive control on the unfixed build (scratch-c open): 1 × `listeners[eventId].handlerId`
    - [x] CLI: `pickerFocusWiring` new case + `useTauriListenStrictMode` → evidence: pass on the fix; fail on HEAD's code (`not to be <textarea>` / `[1, 1, 2, 2]` + an unhandled rejection)
    - [x] Console: no `handlerId` rejection in the fixed session (tap count 0 across the open and both focus sequences)
  - [x] verify-human
    - [x] P1.verify-human.1 (decision): when the "+" overlay's saved focus target went stale (its workspace moved to the background), Esc focuses the CENTER-STAGE workspace's CC pane (A) rather than leaving focus on `<body>` (B). Operator: **A** (2026-11-27).
  - [x] verify-codify — tests: `pickerFocusWiring` (App-level, + → ⌘⇧digit → Esc → center-stage pane), `useTauriListenStrictMode` (one call per event, no unhandled rejection), and a `restoreFocus` unit case for the detached and inert branches (never the right-panel terminal); the unit case fails when the fallback is removed. `pnpm verify:auto` EXIT=0 in 59 s (4202 vitest; cargo 1519).
    Test scope: full — suite not long (`runtimes.md` `pnpm verify:auto` Last 63 s)

- [x] Phase 2: Small store, layering and copy fixes
  **Relevance check (before Phase 2):**
  - Requester still needs this: yes — open findings in the sweep
  - Requirements unchanged: yes
  - Solution still feasible: yes
  - No superior alternative discovered: yes
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: a `useHostSubstrate` test with a rejecting `listen` → a later subscriber retries (a second `listen` call happens); fails on HEAD (`started` latched).
  - CLI: `Workspace.tsx` calls `useWorkflowFeaturesEnabled()` exactly once (source guard over the dense body), and the absent-host note + skill row read the same binding.
  - CLI: `components/workspace/absentHostNote.ts` and `autoResumeFire.ts` import `shortHost` from `state/workspaceSurfaces` (no `components/picker` import); `check:link` + `tsc` green.
  - CLI: `RemoteRunPanel`'s listener count is a named constant tied to the listen calls (a test that counts `useTauriListen(` calls in the component equals it).
  - Browser (dev app, Settings → Remote hosts, a host with its link down is fine): the drift line's strings contain "origin" and not "GitHub" (rendered-text read via the bridge, or the component test if no Developer host is reachable).
  **Alignment questions:**
  - (decision) Drift copy now reads "Checking the clone's origin…", "Up to date with its origin.", "Behind its origin: this host is at <sha>, origin at <sha>." on every host (the payload carries no origin URL to name). Still what you want, or keep "GitHub" since today's hosts all clone from GitHub?
  - [x] P2.1 `useHostSubstrate`: reset `started` on a failed `listen` (retry on the next subscriber)
  - [x] P2.2 `Workspace.tsx`: one gate-hook read feeding all three uses
  - [x] P2.3 Move `shortHost` to `state/workspaceSurfaces.ts`; update the three importers
  - [x] P2.4 `RemoteRunPanel`: named listener count + its test
  - [x] P2.5 Drift copy says "origin"
  - [x] verify-auto — evidence: `pnpm verify:auto` → EXIT=0 in 57 s (332 files / 4205 vitest; cargo 1519; lint 0 errors, the pre-existing `XtermPane` warning)
  - [x] verify-self — CLI outcomes by the `feature-verify-self-runner` subagent; the Settings read by the orchestrator over the MCP bridge (dev app freshly launched; no Rust changed this phase)
    - [x] CLI host-store latch — evidence: `useHostSubstrate.test.tsx` 7/7; HEAD's module swapped in (copy aside + `shasum`/`cmp` restore) → exactly the new test fails, `expected 1 to be 2`
    - [x] CLI one gate read — evidence: `workflowApplicableGuard` 8/8 incl. "Workspace reads the gate ONCE"; `grep -c "useWorkflowFeaturesEnabled()" Workspace.tsx` → 1; `workflowGate` feeds `isWorkflowApplicable(` ×2 and `isWorkflowHostBlocked(` ×1
    - [x] CLI `shortHost` layering — evidence: no `components/picker` import in `absentHostNote.ts` / `autoResumeFire.ts`; `tsc --noEmit` exit 0; `pnpm check:link` → "every entry linked cleanly (main, pip)"
    - [x] CLI listener count — evidence: `remoteRunPanelListenerCount` passes; 3 `useTauriListen<` calls = `RUN_LISTENERS = 3`
    - [x] CLI drift copy — evidence: no "GitHub" in `RemoteHostsSettings.tsx` / `SettingsPanel.tsx`; `remoteHostsSettings.test.tsx` passes, asserting all three "origin" strings
    - [x] Browser (consuming surface: Settings → Remote hosts, dev app) — evidence: the section hint reads "…Checked against each clone's origin while this panel is open, for hosts with a workspace connected."; no "GitHub" anywhere in the rendered page text. The drift line itself showed "Connect a workspace on this host to check." (link down); the "origin" drift strings are pinned by the component test (bringing a link up through the dev row is out of bounds: it is the account never used for ssh)
    - [x] align (decision): drift copy — evidence: `driftLine` returns "Checking the clone's origin…", "Up to date with its origin.", "Behind its origin: this host is at <sha>, origin at <sha>."; hint as above
  - [x] verify-human
    - [x] P2.verify-human.1 (decision): drift copy names the clone's origin on every host (A) rather than GitHub (B). Operator: **A** (2026-11-27).
  - [x] verify-codify — the build's tests cover every Phase 2 behaviour (store latch, gate-once pin + widened routing check, listener count, drift strings); added: the real-panel Remote hosts test asserts the group hint names the origin and never GitHub (fails when the hint is reverted to "GitHub"). `pnpm verify:auto` EXIT=0 in 66 s (4205 vitest; cargo 1519).
    Test scope: full — last phase

## Current Node
- **Path:** Feature > review-quality
- **Active scope:** review-quality
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** none

## Build notes (Phase 1)

- **P1.1 live repro (dev app, fresh launch from the clean tree, ws-1 scratch-b + ws-3 scratch-c):**
  focus ws-3's CC textarea → "+" (filter focused) → real ⌘⇧1 capture listener switched to ws-1
  with the overlay open (ws-3 now `inert`) → Esc → `document.activeElement` = **`<body>`**, not
  inside any workspace. ⚠️ So the review's "keys reach a hidden yolo session" does NOT happen
  live: `inert` blocks the focus. The real defect: focus stranded on `<body>`, and the new
  center-stage pane takes no keys until clicked. Problem statement's hedge confirmed; the fix
  targets the stranded focus (and stays inert-safe where `inert` is not enforced).
- **Unlisten positive control (unfixed):** a `window` `unhandledrejection` tap installed before
  opening scratch-c recorded `undefined is not an object (evaluating 'listeners[eventId].handlerId')`.
- **P1.2 fix, live (HMR):** ws-1 pane focused → "+" → ⌘⇧2 → Esc → `activeElement` =
  `TEXTAREA.xterm-helper-textarea` inside ws-3 (`data-visible="true"`), `[data-testid="xterm-pane"]`.
- **P1.3:** `pickerFocusWiring` case through the real `App`; fails on HEAD's `restoreFocus`
  (jsdom focuses the background pane), passes on the fix.
- **P1.5:** `useTauriListenStrictMode.test.tsx`; HEAD's hook → `[1, 1, 2, 2]` + an unhandled
  rejection; the fix → `[1, 2]`, no rejection.
- ⚠️ The dev app left running by the previous session had rebuilt during WP4 while
  production-code Rust mutants were briefly on disk, so it was killed (agent-launched, the
  handoff said to quit it) and relaunched from the clean tree before the repro. The WP3 record's
  "no dev app was running" was wrong (`pgrep "tauri dev"` misses `tauri.js dev`); corrected there.

## Build notes (Phase 2)

- P2.1: a failed `listen` now un-latches the store (seed failures still just log). New test fails on HEAD (`expected 1 to be 2` listens).
- P2.2: `workflowGate` bound once; `workflowApplicableGuard` now accepts a binding read through `isWorkflowHostBlocked(` too (the funnel's second wrapper, already accepted inline), plus a new "Workspace reads the gate ONCE" pin. Mutants: a bare read of the binding → the routing test fails; a second inline call → the once-pin fails.
- P2.3: `shortHost` moved to `state/workspaceSurfaces.ts`; `PickerRow`, `autoResumeFire`, `absentHostNote` and `remoteRow.test` import it from there; `tsc` clean.
- P2.4: `RUN_LISTENERS = 3` beside the three listens; `remoteRunPanelListenerCount.test.ts` (source read, comments stripped) fails on `RUN_LISTENERS = 2` and on a literal `subscribed >= 3`.
- P2.5: the drift strings, the Settings hint and the comments/type doc say "origin"; the Update description ("Fetches the latest version from GitHub") is kept: a Managed clone is always the published repo. The 4 test expectations updated with the copy.

## Ship

- Full suite: reused the last-phase codify run (`Test scope: full — last phase`, `pnpm verify:auto` EXIT=0 in 66 s); only `runtimes.md` and this WIP changed after it.
- Dev stack stopped by PID (74751 / 74927 / 74879 / 74885, all launched 10:47 by this session); prod untouched and its listener confirmed live afterwards.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
