---
drive_mode: autopilot
---

# Feature: Picker QoL — filter autofocus + single scroller in the "+" overlay

**Workflow:** feature
**State:** Completed 2026-11-27
**Shipped:** `8c019bf` on `main`, pushed 2026-11-27. Full suite: reused the last-phase codify run (`Test scope: full — last phase`, `pnpm verify:auto` EXIT=0); only the WIP's scratchpad path was redacted after it. Pre-push identifier grep over the added lines of `origin/main..main` and the staged diff: 0 hits (positive control matched 2/2)
**Created:** 2026-11-27
**Backlog items:** SURFACE-2026-11-18-PICKER-SEARCH-BOX-NOT-AUTOFOCUSED, SURFACE-2026-11-18-PICKER-OVERLAY-NESTED-SCROLLBARS

## Problem Statement
Two operator-reported picker papercuts (2026-11-18). (1) The "Filter projects…" input
(`picker-filter` in `ProjectPicker`) is not focused when a picker appears, so the operator must
click into it before typing. Both picker surfaces render `ProjectPicker`: the first-open picker
`App` renders when no workspace exists (`view === "picker"`), and `PickerOverlay`, summoned by the
filmstrip "+". Both are **conditionally mounted** (`showPicker && …` / the view switch), so a
mount-time focus fires on every summon. Today the filmstrip "+" click does not take focus
(`[[wkwebview-button-click-does-not-take-focus]]`), so the CC pane's xterm keeps focus while the
overlay is open and keystrokes go to CC. Moving focus into the overlay fixes that, but it also
means dismissing the overlay (Esc / backdrop / ×) would leave focus on `<body>` where today it
silently stays in the terminal; so a dismiss must hand focus back to whatever had it.
(2) The "+" overlay shows two nested vertical scrollbars: `.picker-overlay-panel` is
`max-height: 80%; overflow-y: auto`, and `.picker-recents` inside it scrolls itself under a
`max-height: 60vh` cap, so the card overflows too and its bottom controls (Open Folder… / Add
Remote Project…) sit behind a second scroll. The operator proposed lowering the list cap; the
backlog entry's sturdier option is taken here: make the overlay card the same flex column the
standalone picker already is, so the list takes exactly the leftover height and is the only
scroller at any window size (a smaller fixed cap would still overflow on short windows and waste
space on tall ones).

No 3rd-party dependency. No active WBS cycle (`wbs.md` absent — between milestones).

## Work Tree

- [x] Phase 1: Filter autofocus, focus restore on dismiss, single-scroller overlay
  **Observable outcomes:**
  - Browser (dev app via the `tauri` MCP bridge, read a frame later per `[[react-state-read-needs-a-deferred-frame]]`): with a workspace open and its xterm focused, clicking the filmstrip "+" (`el.click()` fallback allowed) mounts `[data-testid=picker-overlay]` and `document.activeElement` is `[data-testid=picker-filter]` — not the xterm helper textarea.
  - Browser: setting the filter's value (native setter + `input` event) narrows `[data-testid=picker-recents]` rows, with no click into the input first.
  - Browser: with the overlay open from a focused xterm, dispatching Escape on `document` unmounts the overlay and `document.activeElement` is again that workspace's `.xterm-helper-textarea` (same element as before the "+" click). Same for the × button (`picker-overlay-close`) and a backdrop mousedown.
  - Browser: the first-open picker (`view === "picker"`, no workspace — the agent-launched dev app's launch scene) has `document.activeElement === [data-testid=picker-filter]` once it renders.
  - Browser (state-changing, dev window size only — `manage_window` resize of the agent-launched dev app, restored afterwards): with ≥ 12 projects in the dev list, at a SHORT window (inner height ≈ 560px) and a TALL one (≈ 1200px), in the overlay: `.picker-overlay-panel` has `scrollHeight <= clientHeight` (the card never scrolls), its computed `overflow-y` is not `auto`/`scroll` or it does not overflow; `.picker-recents` is the only element under the panel with `scrollHeight > clientHeight` at the short size; and the `picker-open-folder` + `picker-add-remote` buttons' bounding rects lie fully inside the panel's rect.
  - Browser: the first-open picker at the same two sizes still has one scroller (the list) and its Open Folder… button inside the viewport (no regression of the standalone flex column).
  - Console: no new `window` `error` / `unhandledrejection` during the above (tap installed before the "+" click; the known `useTauriListen` unlisten rejection on workspace OPEN, SURFACE-2026-11-16-TAURI-UNLISTEN-…, is pre-existing and excluded by message).
  - CLI: `pnpm verify:auto` exits 0.
  **Alignment questions:**
  - Happy path, in action: click "+", start typing a project name, Enter/click to open. And from the first-open picker at launch. Is this the flow you wanted?
  - (decision) **Focus goes back where it was on dismiss.** Esc / × / backdrop returns focus to the element that had it before "+" (normally the CC pane), so you can keep typing to CC. Opening a project leaves focus to the new workspace as today. Is that what you want, or should dismiss leave focus nowhere?
  - (decision) **Flex-column card instead of a lower cap** (you had proposed lowering the list's cap). The card grows with the list up to 80% of the window. Past that, only the list scrolls, and the title, filter, and bottom buttons stay put. Now that you see it at a short and a tall window, is this still what you want?
  - [x] P1.1 `ProjectPicker`: focus `picker-filter` on mount (React `autoFocus`, precedent `AddRemoteForm`). Covers both picker surfaces, since each mounts fresh per appearance
  - [x] P1.2 `PickerOverlay`: capture `document.activeElement` at mount, and route every dismiss path (Esc, backdrop, ×) through one `dismiss()` that refocuses the captured element (if still connected and focusable) before calling `onDismiss`. The open path (`onOpen`) does NOT restore
  - [x] P1.3 `App.css`: `.picker-overlay-panel` → `display: flex; flex-direction: column; overflow: hidden` (keeps `max-height: 80%`). `.picker-overlay-panel .picker` → `flex: 1 1 auto; min-height: 0; height: auto`. `.picker-overlay-panel .picker-recents` → `max-height: none`, so the list takes the leftover height. Rewrite the stale comments on `.picker-recents` ("overlay variant … falls back to the 60vh cap") and on `.picker-overlay-panel .picker`
  - [x] verify-auto
    — evidence: `pnpm verify:auto` → EXIT=0 in 170s (lint 0 errors, 1 pre-existing warning in untouched `XtermPane.tsx`; format:check, tsc, check:link clean; vitest 328 files / 4191 tests passed; cargo fmt, clippy `-D warnings`, cargo test 1511 + integration all passed)
    — evidence: `vitest run src/components/picker/__tests__/pickerFocusLive.test.tsx` → 7/7. Mutants: no `autoFocus` → 3 failed; no `restoreFocus(prevFocus)` → 3 failed (Esc, ×, backdrop); originals restored and shasum-matched
  - [x] verify-self (driven from the ORCHESTRATOR, not the runner subagent: `mcp__tauri__*` is not exposed to subagents, `[[mcp-bridge-tools-not-exposed-to-subagents]]`. Agent-launched `pnpm tauri:dev` with the Claude-marker strip, PID 61985; integration boundary = the existing first-open picker scene + the filmstrip "+" overlay, both driven below)
    - [x] O1 "+" from a focused xterm → filter focused. Evidence: the pane's `.xterm-helper-textarea` was focused, `filmstrip-add-workspace.click()`, then `activeIsFilter: true, activeIsPane: false`
    - [x] O2 filter narrows with no click. Evidence: native setter `"scratch"` + `input` → 8 rows → `[scratch-c, scratch-b, scratch-a]`, filter still focused
    - [x] O3 dismiss restores pane focus. Evidence: Esc on `document` → overlay gone, `activeElement === <same xterm textarea>`; × (`picker-overlay-close.click()`) → same; backdrop `mousedown` → same; each re-open re-focused the filter
    - [x] O4 first-open picker focuses filter. Evidence: launch scene, `activeElement` = `INPUT.picker-filter`
    - [x] O5 overlay single scroller (state-changing: dev window resized 1000×560 and 1000×1200 (clamped by the screen to inner 1018), restored to 1920×1050). Evidence: SHORT inner 528: panel `overflow-y: hidden`, `scrollHeight 358 == clientHeight 358`, the only overflowing scroller in the document is `picker-recents 624/112`, Open Folder [372,415] and Add Remote [372,415] inside panel [80,440]. Screenshot `<scratchpad>/overlay-short.jpg` (session scratchpad, not kept). TALL inner 1018: panel 750/750, only scroller `picker-recents 624/504`, buttons [764,807] inside [80,832]. Note: the dev list has 8 projects, not ≥12; overflow was forced by window height instead, which exercises the same property
    - [x] O6 first-open picker unchanged. Evidence: SHORT: only scroller `picker-recents 584/234`, buttons [453,496] inside inner 528. TALL: no scrollers, buttons [888,931] inside 1018
    - [x] O7 console. Evidence: a `window` error/unhandledrejection tap from launch: 0 `error`. 14 rejections, ALL the known `listeners[eventId].handlerId` message (SURFACE-2026-11-16-TAURI-UNLISTEN-…): 3 on the workspace open, ~3–4 per overlay mount (`ProjectPicker`'s existing `useTauriListen` consumers). No listener code touched. Excluded by message per the outcome
    - [x] O8 `pnpm verify:auto` exits 0 (see verify-auto)
    - [x] align: happy path ("+" → type → open). Evidence: O1, O2 + `overlay-short.jpg`; the operator tries it in the running dev app
    - [x] align: (decision) restore-on-dismiss. Evidence: O3
    - [x] align: (decision) flex-column card. Evidence: O5 at both sizes + `overlay-short.jpg`
  - [x] verify-human (operator: "all good", 2026-11-27)
    - [x] P1.verify-human.1: happy path ("+" → type → open, and the first-open picker), tried in the running dev app
    - [x] P1.verify-human.2: (decision) dismiss hands focus back to the pane
    - [x] P1.verify-human.3: (decision) flex-column card instead of a lower list cap
  - [x] verify-codify
    Test scope: full — last phase
    — evidence: `pnpm verify:auto` → EXIT=0 in 69s (vitest 330 files / 4197 tests; cargo test 1511 + integration; lint 1 pre-existing warning in `XtermPane.tsx`)
    — new: `src/__tests__/pickerFocusWiring.test.tsx` (consuming surface: the REAL `App`. First-open scene focuses the filter at boot; filmstrip "+" focuses it on EVERY summon (2 rounds) and Esc refocuses the pane each time)
    — new: `src/components/picker/__tests__/pickerOverlaySingleScroller.test.ts` (CSS tripwire for the 4 declarations the live single-scroller measurement depends on; jsdom has no layout, so the live O5 numbers are the primary record)
    — kept from build: `pickerFocusLive.test.tsx` (7)
    — mutants, each alone, all killed: panel `overflow: hidden`→`overflow-y: auto`; panel no `display: flex`; inner `.picker` no `min-height: 0`; inner `.picker` no `flex: 1 1 auto`; list keeps the 60vh cap (each 1/4 failed); App keeps the overlay mounted and toggles `hidden` (wiring 1/2 failed); the open path also restores focus (focusLive 1/7 failed). All files restored, shasum-matched

## Current Node
- **Path:** Feature > done (archived)
- **Active scope:** none (finalized 2026-11-27)
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** 4 code-quality findings (backlogged)

## Code-Quality Review

*(feature-review-quality, 2026-11-27, ship commit `8c019bf`, drive_mode=autopilot: 0 CRITICAL, 1 MAJOR, 3 MINOR. All auto-backlogged to `backlog-quality-findings.md` → `# picker-qol-focus-and-scroll — 2026-11-27`, one pointer in `backlog.md`.)*

### Strengths
- All three dismiss paths go through one `dismiss()`, and the open path stays separate on purpose. The backdrop's `preventDefault` stops the mousedown from moving focus before the restore runs.
- The scroll fix changes the structure (a bounded flex column with a shrinkable child) rather than tuning a cap, and the stale `.picker-recents` comment was rewritten in the same change.
- Tests sit at the right layers: the component (`pickerFocusLive`), the real `App` with a 2-round summon (`pickerFocusWiring`, which is what catches keep-mounted-and-toggle), and a CSS tripwire that states the jsdom limit. Each test was mutation-proven.
- `restoreFocus` guards the null, detached and `<body>` cases.

### Issues
**CRITICAL**
- (none)

**MAJOR**
- [`PickerOverlay.tsx` `restoreFocus` / `dismiss`] A dismiss restores focus to the element that had it at open, without checking that it is still in the center-stage workspace. ⌘⇧digit (App's switch handler does not check `showPicker`) while the overlay is open, then Esc, refocuses the BACKGROUND workspace's xterm. That textarea is parked off-viewport and still focusable, so keystrokes go to a hidden yolo CC session. → SURFACE-2026-11-27-QUALITY-PICKER-DISMISS-RESTORES-FOCUS-TO-A-BACKGROUND-WORKSPACE

**MINOR**
- [`pickerOverlaySingleScroller.test.ts` `rulesFor`] Matches braces before stripping comments. Today it fails loudly, not falsely green. → SURFACE-2026-11-27-QUALITY-CSS-TRIPWIRE-PARSES-BRACES-BEFORE-STRIPPING-COMMENTS
- [`App.css`] `.picker-overlay-panel .picker` is split across two rules. → SURFACE-2026-11-27-QUALITY-OVERLAY-PICKER-RULE-SPLIT-IN-TWO
- [`App.css`] The panel comment says "one child", but the panel also holds the × button. → SURFACE-2026-11-27-QUALITY-PANEL-COMMENT-SAYS-ONE-CHILD

### Assessment
A small, well-built QoL change that leaves the codebase better than it found it. The one real gap is the restore target: "whatever had focus at open" rather than "the visible workspace's pane". That is worth a backlog item and a small guard, not a refactor pass.

### If you disagree
Mark a finding `[DISMISSED]` here before `feature-finalize` archives this file.

## Retrospect
- **What changed in our understanding:** Autofocusing the picker's filter has a second consequence the backlog entry did not name. Today the "+" click takes no focus, so the CC pane silently kept focus through an overlay dismiss. Moving focus into the overlay would have stranded it on `<body>` after Esc. Restoring focus on dismiss was a necessary half of the feature, not an extra. The review then found that its restore target ("whatever had focus at open") can be a background workspace after a ⌘⇧digit switch (backlogged MAJOR).
- **Assumptions that held:** both picker surfaces mount `ProjectPicker` fresh per appearance, so a mount-time `autoFocus` covers every summon (pinned through the real `App` with a 2-round test). The flex-column card makes the list the only scroller at any window height (measured live at inner heights 528 and 1018).
- **Assumptions that were wrong:** the plan's "≥ 12 projects" for the overflow check; the dev list has 8, so overflow was forced by window height instead. A `Promise`-returning `webview_execute_js` script times out on this bridge; synchronous scripts that stash results on `window` work (already in memory).
- **Approach delta:** one addition at plan time (P1.2, the focus restore on dismiss) beyond the two backlog items; otherwise built as planned. The scroll fix took the backlog entry's flex-column option over the operator's proposed lower cap, and the operator accepted it at verify-human.

## Closure
> **Feature complete:** Picker QoL has shipped (`8c019bf`). Both pickers now put the cursor in "Filter projects…" so you can type to filter at once, Esc/×/backdrop hand focus back to the pane, and the "+" overlay scrolls only its project list. See it via the filmstrip "+" or the first-open picker. Requester = operator, so this is a closure notice for the record.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
