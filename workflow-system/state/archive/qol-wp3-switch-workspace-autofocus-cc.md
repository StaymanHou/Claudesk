# Feature: QoL-WP3 — Switch-workspace autofocus CC panel

**Workflow:** feature
**State:** COMPLETED 2026-06-25 — shipped 78c76d6 (local-only); review-quality clean (2 MINOR backlogged); finalized + archived
**Created:** 2026-06-25
**Drive mode:** autopilot
**Backlog:** SURFACE-2026-06-24-SWITCH-WORKSPACE-AUTOFOCUS-CC-PANEL

## Problem Statement
When the user promotes a workspace to center stage (filmstrip tile click, `⌘⇧+digit`, or the picker overlay), Claudesk does NOT move keyboard focus — so typing goes nowhere until the user manually clicks into the left CC terminal. The center-stage switch is a `display`/off-viewport toggle on the `Workspace` component's `visible` prop (workspaces stay mounted at `left:-99999px`, never unmount); the CC `XtermPane` is always `active={true}`, so its existing mount/active-transition `term.focus()` never re-fires on a switch. WP3 makes the promoted workspace's **left CC terminal** receive focus the moment it becomes visible, so keystrokes land in that project's Claude Code session with zero clicks. Operator decision: **always focus CC (left) for v1** — not last-focused-half restore.

## Decisions baked in
- **Always-CC-left, v1.** No last-focused-half memory (revisit only if it fights the WP4b focus-indicator). Matches the SURFACE open-question resolution.
- **Focus the CC pane ONLY, never the WP9 second-terminal or the right panel.** The left half is the intended target on every promote.
- **NEVER send a byte to the PTY on focus.** WP3 calls `term.focus()` only — no `cc_input`, no `\r`/`\n`, no forced `cc_resize`. (Pre-empts the WP4 spurious-newline bug class on the left pane; WP4 remains a separate reproduce-first cycle for the second-terminal panel.)
- **Seam: imperative focus handle from XtermPane.** Expose `focus()` via `forwardRef` + `useImperativeHandle` from `XtermPane`, thread a ref through `Workspace`, and fire it on the `visible` false→true edge. Focus logic stays where the `Terminal` instance lives (consistent with the existing `term.focus()` calls + `onMouseDown` focus). `focusWorkspace` in `state/workspace.ts` stays a pure reducer (no DOM) — the DOM focus is a render-effect concern, correctly placed in the component, not the reducer.

## Why NOT paired into one cycle with WP4
WP4 (terminal spurious newline on panel switch) is bug-shape + reproduce-first (needs `/feature-reproduce` to capture whether a real byte reaches the PTY vs a cosmetic reprint) and targets the WP9 second-terminal shell panel. WP3 has no unknowns and is shippable now. They share the show/focus *concept* but not a blocking dependency. Sequencing WP3 → WP4 keeps WP3 mergeable immediately; WP4's reproduce will then exercise this same left-pane focus path for free (verifying WP3 sent no stray byte). The "no byte on focus" decision above is the explicit hand-off that ties them.

## Work Tree

- [x] Phase 1: Autofocus CC terminal on workspace promote  <!-- status: [x] — all impl + verify nodes complete -->
  **Observable outcomes:**
  - Browser (live, operator-driven `.app`/`tauri:dev`): With ≥2 workspaces open, clicking a background filmstrip tile promotes it AND the left CC terminal of the newly-centered workspace shows the focused cursor — typing a character immediately appears in that project's CC prompt with no prior click. `data-focus-half="left"` is set on the now-visible `.workspace` root (the WP4b accent confirms focus landed in the left half).
  - Browser (live): Pressing `⌘⇧+digit` for another open workspace's index produces the same result — that workspace's CC terminal is focused, ready for input.
  - Browser (live): Promoting a workspace does NOT add a spurious empty prompt line to the LEFT CC terminal (no byte sent on focus) — the CC scrollback is unchanged by the switch itself.
  - CLI: `pnpm vite build` exits 0 (no broken imports / forwardRef typing across XtermPane → Workspace).
  - CLI: `pnpm exec tsc --noEmit` exits 0; `pnpm lint` clean.
  - CLI: `pnpm test` — the workspace reducer + any new focus-seam unit tests pass (focusWorkspace reducer behavior unchanged; pure-state focus pick still correct).
  - Console: no JS errors when switching workspaces (no "focus of null", no ref-not-ready throw before the terminal mounts).
  - [x] P1.1 Expose an imperative `focus()` handle from `XtermPane`: wrapped the component in `forwardRef<XtermPaneHandle, XtermPaneProps>`, exported `XtermPaneHandle` (`{ focus(): void }`), `useImperativeHandle(ref, () => ({ focus: () => termRef.current?.focus() }), [])`. Null-safe (no-op before the terminal mounts). Internal `term.focus()` calls + `onMouseDown` focus left untouched.  <!-- status: [x] -->
  - [x] P1.2 In `Workspace.tsx`: added `ccPaneRef = useRef<XtermPaneHandle>(null)`, passed it to the left-half `<XtermPane ref={ccPaneRef} … />`. Added an effect keyed on `visible` that early-returns when `!visible` and otherwise rAF-defers a `ccPaneRef.current?.focus()` (mirrors XtermPane's rAF-then-focus). Fires on the false→true edge AND on mount-when-already-visible. NO PTY input on focus.  <!-- status: [x] -->
  - [x] P1.3 Confirmed: only the left-half `<XtermPane>` received the `ref`; `TerminalPane` (WP9 second terminal) + `RightPanelHost` untouched (no ref, not focused). The picker-overlay open path + `closeWorkspace` focus re-pick flip `focusedId` → `visible`, so they route through the same `visible`-edge effect for free — no extra wiring. New `?raw` source-assertion test pins all three invariants (incl. the no-PTY-byte-on-focus guard).  <!-- status: [x] -->
  - [x] verify-auto  <!-- status: [x] — tsc 0, targeted test 6/6, eslint 0 errors (1 pre-existing warning) -->

  - [x] verify-self  <!-- status: [x] — static slice + wiring trace (agent-verifiable tier); live focus/typing CARRIED to verify-human per project corollary -->
    **verify-self result (workspace-UI corollary — no bare-Vite live surface):**
    - NO Playwright subagent spawned: the live focus/typing outcomes need the real Tauri backend (PTY + real xterm in WKWebview); the `?ws=` dev seam mounts the React frontend but no backend, so a Playwright run against Vite would report every live outcome UNVERIFIED (the dead-end re-discovered every QoL-WP1 phase). Correct posture per CLAUDE.md "verify-self … is operator-only at the live tier."
    - Integration boundary: YES (rule #2 — modified Workspace.tsx + XtermPane.tsx back existing UI; user-visible focus-on-promote changes). Consuming surfaces cited by name in the Observable Outcomes (filmstrip tile click, ⌘⇧+digit) ✓.
    - Static slice — ALL PASS: `tsc --noEmit` 0 · full frontend suite 462/462 (was 456 + the 6 new WP3 tests; the forwardRef conversion caused NO ripple regression across any XtermPane consumer) · eslint 0 errors on the 3 changed files · vite build 0.
    - Wiring trace — connected path confirmed: `focusedId` flip → `visible` prop → Workspace `visible`-edge effect (`if(!visible)return` guard + rAF `ccPaneRef.current?.focus()`) → XtermPane `useImperativeHandle` → `term.focus()`. LEFT CC pane only (`ref={ccPaneRef}` at Workspace.tsx:142); WP9 TerminalPane + RightPanelHost have NO focus ref (untouched). Byte-clean: zero `cc_input`/`\r`/`\n`/`invoke` in the Workspace focus path (WP4 spurious-prompt regression guard holds). Picker-overlay + close re-pick route through the same `visible` seam for free.
    - CARRIED to verify-human (live, operator-driven .app / tauri:dev with ≥2 real CC sessions): (1) clicking a background filmstrip tile focuses the promoted workspace's CC terminal — typing lands with no prior click; (2) ⌘⇧+digit same; (3) no spurious empty prompt line added to the LEFT CC terminal on switch.
  - [x] verify-human  <!-- status: [x] — operator confirmed all 5 live outcomes pass (2026-06-25) -->
    - [x] P1.verify-human.1 Filmstrip-click promote focuses CC  <!-- status: [x] -->
    - [x] P1.verify-human.2 ⌘⇧+digit promote focuses CC  <!-- status: [x] -->
    - [x] P1.verify-human.3 No spurious newline on the LEFT CC terminal on switch  <!-- status: [x] -->
    - [x] P1.verify-human.4 Picker-overlay open + close-workspace re-pick focus CC  <!-- status: [x] -->
    - [x] P1.verify-human.5 Right panel / WP9 terminal NOT stolen-focus; click-to-focus still works  <!-- status: [x] -->
  - [x] verify-codify  <!-- status: [x] — coverage complete; full suite 462/462 -->
    **verify-codify result:**
    - Integration boundary: YES (rule #2). The boundary's "consuming-surface end-to-end test" is the live focus/typing interaction, which has NO CI-runnable harness in this repo (the documented workspace-UI gap — no headless Tauri runner; live verify is operator-driven Playwright on the real .app). Per the established workspace-UI codify posture, the `?raw` source-assertion suite is the CI stand-in: it pins the WIRING the live interaction exercises, so a regression that would break the live behavior fails a CI test.
    - Tests codifying the verified behaviors (written at build time, `src/components/workspace/__tests__/autofocusCcOnPromote.test.ts`, 6 tests): handle-exists + wires to `term.focus()` (behaviors 1/2/4 mechanism) · `if(!visible)return` visible-edge guard (behavior 5 no-steal) · no-PTY-byte-on-focus invariant (behavior 3, WP4 regression guard). No new tests needed beyond these — they cover every CI-reachable invariant.
    - Full frontend suite: 462/462 pass, 54 files, 0 failures. forwardRef conversion caused no regression in XtermPane-adjacent tests (mirrorTail, spawnTrigger) or the probe components.

## Current Node
- **Path:** Feature > review-quality (complete) → finalize
- **Active scope:** none (shipped 78c76d6; review-quality clean — 0 CRITICAL/0 MAJOR/2 MINOR auto-backlogged; next is /feature-finalize)
- **Blocked:** none
- **Unvisited:** (none — all phases complete; next is /feature-finalize)
- **Open discoveries:** none

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->

## Code-Quality Review — qol-wp3-switch-workspace-autofocus-cc
Reviewed against ship commit 78c76d6 (autopilot / Mode 3). Result: 0 CRITICAL, 0 MAJOR, 2 MINOR → MINORs auto-backlogged (low priority), no refactor warranted.

### Strengths
- Imperative-handle seam placed correctly: `focus()` lives where the `Terminal` instance lives (XtermPane); reducer `focusWorkspace` stays pure (DOM focus is a render-effect concern, honored in code).
- Focus-only invariant enforced cleanly: `useImperativeHandle` exposes a single `focus: () => termRef.current?.focus()` with no PTY write path — pre-empts the WP4 spurious-newline bug class as the decision record specifies.
- `visible`-edge effect is minimal + correct: `if (!visible) return` guards backgrounds, rAF mirrors XtermPane's focus-deferral pattern, cleanup `cancelAnimationFrame` prevents a stale focus after a fast demote.
- Routing picker-overlay + close-re-pick through the same `visible` seam (vs wiring each call site) is good leverage — one effect covers all four promote triggers.
- `?raw` source-assertion test faithfully follows the established workspace-UI codify posture; each assertion documents the specific regression it prevents — the right CI stand-in given no headless Tauri.

### Issues
**CRITICAL** — (none)
**MAJOR** — (none)
**MINOR**
- [autofocusCcOnPromote.test.ts:63] The no-PTY-byte guard `not.toMatch(/\r\n|\r|\n/)` pins the absence of any `\r`/`\n` escape anywhere in Workspace.tsx, not specifically the focus path. Passes today (zero matches) but is over-broad — a future unrelated `\n` literal (tooltip string, multiline template) would fail with a misleading "WP4 spurious-prompt regression" message. The companion `cc_input` assertion is appropriately targeted; this one would be more robust scoped to the focus effect or to `invoke(`/PTY-write identifiers. — false-positive failure that misdirects the next maintainer.
- [Workspace.tsx:69-79] The WP3 effect carries an 11-line comment block over a 4-line body; prose is high-quality but restates the commit + WIP near-verbatim (triplicated rationale = future-drift surface). Trimming to just the non-obvious WKWebview-rAF rationale would reduce drift risk.

### Assessment
Well-built, tightly-scoped feature that advances the codebase without accruing debt. The imperative `focus()`-only handle threaded to a single `visible`-edge effect is the minimal correct seam, deliberately consolidating four promote triggers through one path. Focus-only invariant is both designed-in and test-pinned. The 680-line XtermPane churn is almost entirely Prettier reflow around the `forwardRef` wrap; the genuine functional delta is ~a dozen clean, null-safe lines. The only real critique is mild over-documentation. verify-self/codify correctly applied the workspace-UI corollary. The two MINORs are polish, not debt; neither warrants a refactor pass.

### If you disagree
Dismiss any finding by editing this section and marking the line `[DISMISSED]` before finalize archives the WIP.

## Retrospect
- **What changed in our understanding:** The promote path turned out to be a `left:-99999px` off-viewport toggle on the `visible` prop, NOT a `display:none` toggle (a load-bearing M4 WP3 invariant for the filmstrip mirror). Critically, the CC pane is always `active=true`, so XtermPane's own mount/active-transition `term.focus()` never re-fires on a switch — confirming the gap was real and that the fix belongs on the `visible` edge, not the `active` prop.
- **Assumptions that held:** The plan's seam choice (imperative handle via forwardRef + a Workspace `visible`-edge effect, reducer stays pure) was exactly right. The four promote triggers all route through `focusedId → visible` for free — no per-call-site wiring needed, as predicted.
- **Assumptions that were wrong:** None material. One mild surprise: Prettier reflowed XtermPane's long comment blocks on the `--write` pass, inflating the diff to 680 changed lines for a ~12-line functional delta (cosmetic noise, flagged to the reviewer).
- **Approach delta:** Implementation matched the plan exactly. WP3 was kept standalone (not bundled with WP4) per the plan-time decision; the "never send a byte to the PTY on focus" invariant was both designed-in and test-pinned, which is the explicit hand-off that lets WP4's reproduce exercise this same left-pane path safely later.

## Notes — verify-self tier posture (per CLAUDE.md)
This is a workspace-UI feature whose live outcomes (real focus landing in a real xterm, typing reaching CC) are NOT observable in a bare Vite browser (no Tauri backend; the `?ws=`/`__seedWorkspace` dev seam mounts the React frontend but no PTY). Per the project's verify-self corollary: the agent proves the static slice (`tsc --noEmit`, `eslint`, `pnpm vite build`, the reducer/seam unit tests, + a wiring trace of the `visible`-edge → `ccPaneRef.focus()` path); the LIVE focus + typing outcomes are CARRIED into verify-human, where the operator drives `pnpm tauri:dev` (or the installed `.app`) with ≥2 real CC sessions. Not a PATH/spawn-touching change, so the installed-build smoke test is not strictly required — but the operator should still confirm on the real app since focus behavior is WKWebview-specific.
