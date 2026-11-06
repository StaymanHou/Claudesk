---
drive_mode: autopilot
---

# Feature: Paydown WP13 — `SettingsPanel` split and `PickerRow`

**Workflow:** feature
**State:** Completed 2026-11-06 — shipped `0e7c138` (local on `main`, not pushed)
**Created:** 2026-11-06
**Sweep:** `workflow-system/product/backlog-paydown-wbs.md` → WP13 (M16.5 WP8, task 8.3)
**Resolves:** `SURFACE-2026-07-28-QUALITY-WP2-SETTINGSPANEL-NEAR-DOING-TOO-MUCH`,
`SURFACE-2026-11-02-QUALITY-WP5-PICKER-ROW-SHOULD-BE-A-COMPONENT` (both in `backlog-quality-findings.md`)

## Problem Statement

Two components have grown past the point where the next change is cheap. `SettingsPanel.tsx`
(710 lines) holds five settings-group bodies, four `useSettingControl` calls, the substrate /
provenance / wizard / uninstall state machine and the hotkey reference in one file.
`ProjectPicker.tsx` (775 lines) renders each row as about 200 lines of JSX nested four levels
deep inside `pickerItems.map → PICKER_ROW_CELLS.map → switch`. This WP is a **pure move**:
the rendered DOM, the IPC calls and the behaviour must be byte-identical. What changes is which
file the code lives in, and which file each source guard reads. Proof is a before/after diff of
the rendered markup of the real components, HEAD worktree against the working tree.

## Plan-time decisions (autopilot: taken, disclosed)

- **D1. The panel keeps its group shell; only the group BODIES move.** Every
  `<SettingsGroup id title hint>` stays in `SettingsPanel.tsx`, in its current order, and each
  body becomes a module: `ClaudeCodeSettings`, `WorkflowFeaturesSettings`, `AnalyticsSettings`,
  `UpdatesSettings` and `HotkeySettings` (`ProfilesSettings` already exists). Why: the panel stays
  the one place that shows the group order, titles and hints. The guards that pin those (ids,
  order, the Analytics "Fully offline" copy, `HIGHLIGHT_MS`, the no-scrim rule) keep reading the
  panel and do not move. `SettingsGroup` moves to its own `SettingsGroup.tsx`.
- **D2. The `workflowFeatures` control stays in the panel** and is passed down to the two groups
  that read it (`WorkflowFeaturesSettings` gets the control, `HotkeySettings` gets its `.value`).
  Why: the hotkey list must follow the checkbox the instant it flips (`SettingsPanel.tsx`'s header
  note on the single source), and `offInvariantGuard`'s `ALLOWED_GETTER` names exactly
  `SettingsPanel.tsx` as the file that owns the gate's read+write pair. Moving the control would
  also move that exemption. The other three controls move into their group modules along with
  their `onError` prop.
- **D3. `PickerRow` gets the row's gate decision as a boolean, never the raw gate.** The picker
  computes `isWorkflowApplicable(gateOn, r.profile ?? null)` and passes `workflowApplicable`.
  `workflowApplicableGuard` fails on any bare `gateOn` use, so the raw value stays in one file.
  `handleOpenRecent` (and its `missingProfileRefusal` ordering guard), `handleRemove` and the
  three `handle*Committed` callbacks stay in the picker; the row gets them as props.
- **D4. The drive-mode `<select>` is NOT in either file.** The handoff said to "move it unchanged".
  It lives in `ProjectModelCell.tsx`, which this WP does not touch. `PickerRow` renders
  `<ProjectModelCell>` with the same props, so the CLAUDE.md exception is preserved by
  construction.
- **D5. WP12's review leftovers are NOT folded in.** These are the readout-split MAJOR and the
  spawn-intent MINOR (`# paydown-2026-11-04-wp12-workspace-extractions` in
  `backlog-quality-findings.md`). They live in other files, and they are behavioural fixes. In
  this WP they would sit inside a diff whose proof is "nothing rendered changed". They become one
  small task right after WP13 and before WP14, which is what the handoff allowed.
  **Flag if wrong.**
- **D6. The proof is a LIVE mount, not `renderToStaticMarkup`.** The recipe in
  `[[prove-render-unchanged-via-head-worktree]]` renders the resting DOM only, and its own limits
  note says `useSettingControl` seeds asynchronously. For the picker that is worse: SSR runs no
  effects, so `recents` is `[]` and **no row renders at all**. A diff would pass with `PickerRow`
  deleted (guard entry 15: the fixture makes the right and wrong answers identical). The dump spec
  therefore mounts with `createRoot` + `act` + `mockIPC({shouldMockEvents:true})` (the
  `pickerOrderLive.test.tsx` pattern), lets the effects settle and dumps `innerHTML`, across
  fixture variants chosen so every branch renders at least once.
- **D7. Guards whose question is DOM ORDER across the new boundary become render assertions.**
  Two guards span the split: the Analytics label-in-block check in
  `settingsTimeTrackingCopyPromise` (only if its block slice loses the label), and
  `workflowSubstratePresence`'s "mount sits inside the workflow-features group, before
  analytics". Per `docs/lessons/source-text-guards.md` §"The render-harness note, corrected",
  these become jsdom render checks, not two-file string splices. Single-file wiring guards
  (`get:` / `event:` / `persist:` / testids / call shapes) are re-pointed at the module that now
  holds the code, with the same assertions.

## Source-guard inventory (plan-time grep; build re-runs it)

`grep -rln "SettingsPanel\.tsx\|ProjectPicker\.tsx" src`, and every hit was read.

**SettingsPanel.tsx — stays on the panel (D1/D2):** `settingsPanelWiring` (ids, order, dialog,
no-scrim), `settingsHighlight` (`HIGHLIGHT_MS`), `settingsTimeTrackingCopy` (hint copy),
`offInvariantGuard` `ALLOWED_GETTER`.
**Re-point to a module:** `settingsPermissionModeWiring` → `ClaudeCodeSettings`;
`settingsTimeTrackingWiring` → `AnalyticsSettings`; `settingsUpdateNotificationsWiring` →
`UpdatesSettings` (the panel still owns `onCheckForUpdates` prop plumbing);
`uninstallIntercept` (consumption block) and `workflowInstallWizard` (`onFinished` body, ordering)
→ `WorkflowFeaturesSettings`; `workflowSubstratePresence` → module + a render check (D7);
`settingsTimeTrackingCopyPromise` → panel for copy, a render check if the label moved out (D7);
`hotkeyGroupRender.test.tsx` (it mounts the panel, so it should keep passing as it is; confirm).
**ProjectPicker.tsx — stays on the picker:** `projectModelCellProfileLine` (refusal before
`record_open`), `listProjectsConsumers`, `dashboardWiring`, `projectModelCell`'s
`<ProjectModelHints />` count, `noTextAssist`, `workflowApplicableGuard`'s `KNOWN_ROUTED` entry
(the picker still routes in `handleOpenRecent`).
**Re-point / extend to `PickerRow.tsx`:** `announceRow.test.ts` row-structure block (`case "open"`,
one `<button>` in the open cell, `role="button"` no-fire); `projectModelCell`'s
`PICKER_ROW_CELLS.map` consumption check; `pickerRowGutterStructure`'s transcription comment.
**Add `PickerRow.tsx` to the scan lists (otherwise an omission, guard entry 13):**
`driveModeIpc.test.ts`'s per-row-read loop, and `workflowApplicableGuard`'s routed set if the row
ends up routing. By D3 it should not.

## Work Tree

- [x] Phase 1: Split `SettingsPanel` into per-group modules
  **Observable outcomes:**
  - CLI: `pnpm verify:auto` exits 0. That includes `check:link`, the only step that sees a
    deleted or moved export at runtime.
  - CLI: `wc -l src/components/settings/SettingsPanel.tsx` reports fewer than 300 lines, and
    each new module (`SettingsGroup`, `ClaudeCodeSettings`, `WorkflowFeaturesSettings`,
    `AnalyticsSettings`, `UpdatesSettings`, `HotkeySettings`) exists and is imported by the panel.
  - CLI (render-unchanged, D6): a throwaway jsdom live-mount dump spec, run in a HEAD worktree
    and in the working tree, writes the panel's `innerHTML` for each fixture. `diff` exits 0 for
    every fixture. Fixtures: (a) gate OFF, substrate absent, provenance `absent`;
    (b) gate ON, provenance `managed`, substrate present, time tracking ON, permission mode
    non-default, update notifications OFF, with `onCheckForUpdates` wired; (c) gate ON,
    provenance `developer`; (d) `highlightGroup="workflow-features"`. Positive control: the
    same diff run against a deliberately mutated module (a reordered group or a dropped
    testid) exits NON-zero.
  - CLI: every re-pointed guard is mutation-proved against its NEW target. One mutant per probe:
    land it (`grep -c` before and after), run, require a `Tests N` line and a FAIL, restore with
    `cp`, `shasum`-verify.
  - Browser (dev app via the MCP bridge, port 9223): after a boot smoke check (`#root` has
    children), `⌘,` opens Settings. `[data-testid="settings-panel"]` contains the six groups in
    the order claude-code, profiles, workflow-features, analytics, updates, hotkeys. Toggling
    Time tracking persists: the `settings_get_time_tracking`-equivalent read returns the new
    value, and the checkbox is reverted afterwards (state-changing, dev store only, restored).
  **Alignment questions:**
  - none (pure move; the rendered output is proved identical)
  **Build notes (2026-11-06):**
  - `SettingsPanel.tsx` 710 → 234 lines (the remainder is the header, the group shells with
    their long hint strings, the highlight and the error surface). New: `SettingsGroup` (32),
    `ClaudeCodeSettings` (65), `WorkflowFeaturesSettings` (~300), `AnalyticsSettings` (36),
    `UpdatesSettings` (50), `HotkeySettings` (~100).
  - Render-unchanged: a live-mount dump (createRoot + mockIPC) of 8 fixtures. They cover gate
    on and off; provenance absent, managed and developer; the highlight; the wizard open; the
    uninstall dialog opened by the button and by the toggle; and the error surface. The dumps
    hold `innerHTML` plus the sorted IPC call list. HEAD is deterministic (two runs identical),
    and the working tree is **identical** to HEAD. Positive control: one renamed testid in
    `AnalyticsSettings` changed 8 of 8 dumps.
  - Guards: 3 wiring guards re-pointed to their module; `uninstallIntercept` and
    `workflowInstallWizard` re-pointed to `WorkflowFeaturesSettings`; the 3 cross-boundary
    checks (substrate block in its group, profile note in claude-code, the advertised label in
    analytics) moved to a NEW live render test, `settingsPanelGroupsRender.test.tsx`. That test
    asserts identity per placement and that the hotkey list follows the gate prop. The gate is
    flipped through its broadcast, never by naming its command (offInvariantGuard).
  - Mutation: 10 mutants, one per probe, each landed (`grep -c` before and after) and each
    killed: ClaudeCode `event:`, Analytics `errorLabel`, Updates `onCheckForUpdates &&`, the
    install `onFinished` refresh, the gate-toggle interception, the analytics↔updates body swap,
    ClaudeCode moved into profiles, a duplicated Updates body, the label rename, and the hotkey
    gate prop forced `false`.
  - Docs: `arch/workflow-gate.md` (the owner-of-the-toggle exception, and where settings live);
    `WorkflowSubstrateInfo.tsx`'s four comments that named `SettingsPanel` as the slot owner.
  - [x] P1.1 Re-run the plan-time guard grep and freeze the inventory
  - [x] P1.2 Write the live-mount dump spec + capture HEAD dumps (worktree)
  - [x] P1.3 Extract `SettingsGroup.tsx` and the five group-body modules (D1/D2)
  - [x] P1.4 Re-point the guards per the inventory; convert the D7 cross-boundary ones to render checks
  - [x] P1.5 Diff the dumps against HEAD, with a positive control
  - [x] verify-auto
    — evidence: `pnpm verify:auto` → EXIT=0 in 63s. lint: 0 errors (1 pre-existing
      `exhaustive-deps` WARNING in `XtermPane.tsx:943`, not ours); format:check clean; tsc clean;
      `check:link — every entry linked cleanly (main, pip)`; vitest `Test Files 289 passed (289)`,
      `Tests 3737 passed (3737)`; cargo fmt/clippy clean; cargo test `1069 passed; 0 failed`.
  - [x] verify-self
    - [x] CLI `pnpm verify:auto` exits 0 — evidence: the verify-auto run above (EXIT=0, 63s).
    - [x] CLI panel < 300 lines and the six modules are imported — evidence: `wc -l` → 234;
      `SettingsPanel.tsx` imports `SettingsGroup`, `ClaudeCodeSettings`, `WorkflowFeaturesSettings`,
      `AnalyticsSettings`, `UpdatesSettings` and `HotkeySettings` (and the existing `ProfilesSettings`).
    - [x] CLI render-unchanged — evidence: 8-fixture live-mount dump, `diff -r dump-head dump-wt`
      → exit 0 ("FINAL: RENDER+IPC IDENTICAL"); positive control (renamed testid) → 8/8 dumps differ.
    - [x] CLI mutation-proved guards — evidence: 10/10 mutants landed and killed (list in Build notes).
    - [x] Browser (dev app via the bridge on 9223; the integration boundary is the `⌘,` Settings
      panel itself) — evidence: boot smoke `#root` children=1, picker present. `menu`/`app.settings`
      opens `settings-panel`. Groups in DOM order: claude-code, profiles, workflow-features,
      analytics, updates, hotkeys. Each control is unique and inside its own group (perm, note,
      gate, tracking, notif, check). Seeded from the real backend: gate checked=true matches
      `workflow_features_enabled: true`, notif checked=false matches the stored false, perm =
      `bypassPermissions`, 30 hotkey rows (the gate-ON set). State change (declared, dev store):
      clicking Time tracking → `settings.json` `time_tracking_enabled = True`, no error surface;
      clicked back → `False`, and `shasum` is identical to before
      (`c3fb53c7…`). Screenshot: `<scratchpad>/wp13/p1-settings.png` (renders normally).
  - [x] verify-human — zero admissible leaves (F11)
  - [x] verify-codify
    — `settingsPanelGroupsRender.test.tsx` (the consuming surface: the real panel, live-mounted)
      gained 3 write tests: clicking Time tracking, Update notifications and the permission
      select each sends ITS OWN `*_set_*` command with the right arg, asserted as a value list.
      Mutation: time-tracking persist inverted → killed; select hard-coded to "default" → killed.
      Full gate: `pnpm verify:auto` EXIT=0 in 55s, vitest 3740 passed, cargo 1069 passed,
      `check:link` clean.

- [x] Phase 2: Extract `PickerRow` from `ProjectPicker`
  **Observable outcomes:**
  - CLI: `pnpm verify:auto` exits 0.
  - CLI: `ProjectPicker.tsx` no longer contains `PICKER_ROW_CELLS.map` or `case "open"`.
    `PickerRow.tsx` contains both, and contains no bare `gateOn` (D3). `ProjectPicker.tsx` still
    contains `missingProfileRefusal(` before `invoke("record_open"` inside `handleOpenRecent`.
  - CLI (render-unchanged, D6): the live-mount dump of `[data-testid="picker"]` diffs to exit 0
    against HEAD for each fixture. Fixtures: (a) three rows, one with a `continue` announcement
    and one open (`openProjectPaths`), gate OFF; (b) gate ON with a `session-restore` announcement,
    a row on a non-default profile, a row naming an unlisted profile, rows with
    `default_model` / `default_drive_mode` set; (c) a filter typed that hides one row. Positive
    control: a mutated `PickerRow` (the gutter made conditional again) exits NON-zero.
  - CLI: the re-pointed / extended guards (`announceRow`, `projectModelCell`, `driveModeIpc`)
    are each mutation-proved against `PickerRow.tsx`. ⚠️ In `driveModeIpc` especially, a
    `getProjectDefaultDriveMode` call planted in `PickerRow.tsx` must FAIL the loop.
  - Browser (dev app via the bridge): the picker renders rows (`button.picker-recent` count
    equals the project count). Clicking a recent opens its workspace. The `⊘` no-fire door
    appears only on announcing rows. The model cell's drive-mode `<select>` still changes the
    stored mode on a scratch project (state-changing, dev store, scratch-c; restored to
    `autopilot`).
  **Alignment questions:**
  - none (pure move; the rendered output is proved identical)
  **Relevance check (before Phase 2):**
  - Requester still needs this: yes — WP13 in the sweep, unchanged
  - Requirements unchanged: yes — Phase 1 changed nothing on the picker
  - Solution still feasible: yes — the HEAD worktree is still at `fea480e`, so the picker is unchanged there
  - No superior alternative discovered: yes
  **Verdict:** proceed
  **Build notes (2026-11-06):**
  - `ProjectPicker.tsx` 775 → 591 lines; new `PickerRow.tsx` (239). The row gets
    `workflowApplicable` (computed per row by the picker), `announceMap`, `profiles` and five
    callbacks; `handleOpenRecent` / `handleRemove` / the commit reducers stay in the picker.
    `labelFor` moved with the row (its only user).
  - Render-unchanged: 8 live-mount fixtures (gate off/on via the broadcast; continue + restore
    announcements; the Open group; a non-default and an unlisted profile; a filter; clicking the
    no-fire door, a row, and a missing-profile row; remove; empty). Each dump holds `innerHTML`,
    the sorted IPC list AND the `onOpen` arguments. HEAD is deterministic; the working tree is
    **identical**. Positive control: gutter `aria-hidden={true}` → 5/8 dumps differ.
  - Guards: `announceRow.test.ts` row-structure checks re-pointed to `PickerRow.tsx` (+ the
    picker must render `<PickerRow`); the per-arm "no kind literal" check covers BOTH files; the
    "announce once, not per row" ordering check (meaningless across files) became "the row makes
    no IPC call at all". `projectModelCell`'s `PICKER_ROW_CELLS.map` consumption → `PickerRow.tsx`.
    `driveModeIpc`'s per-row-read scan now includes `PickerRow.tsx` (an omission otherwise).
    Comments in `pickerRowGutterStructure.test.ts` re-pointed.
  - ⚠️ **Guard hole found and closed:** passing `workflowApplicable={true}` survived all 632
    picker/state tests. HEAD had the same hole (the inline equivalent survived there too), but the
    extraction made it a prop seam. New `pickerRowGateLive.test.tsx` (live mount; the gate moved
    by its broadcast): gate OFF → no `/session-restore` anywhere; gate ON → only the DEFAULT-profile
    row offers it; the ungated `continue` row is the control. Kills `{true}`, `{gateOn}` (ignores the
    profile) and a row that drops the prop.
  - Mutation: 7 re-pointed-guard mutants + 3 new-test mutants, each landed and killed.
  - [x] P2.1 Write the picker dump spec + capture HEAD dumps
  - [x] P2.2 Extract `PickerRow.tsx` (D3/D4)
  - [x] P2.3 Re-point / extend the picker guards per the inventory
  - [x] P2.4 Diff the dumps against HEAD, with a positive control
  - [x] verify-auto
    — evidence: `pnpm verify:auto` → EXIT=0 in 119s (cargo shared `target/` with the running dev
      app). lint 0 errors (the same pre-existing `XtermPane.tsx:943` WARNING); format, tsc clean;
      `check:link — every entry linked cleanly (main, pip)`; vitest `Test Files 290 passed (290)`,
      `Tests 3742 passed (3742)`; cargo fmt/clippy clean; cargo test `1069 passed; 0 failed`.
  - [x] verify-self
    - [x] CLI `pnpm verify:auto` exits 0 — evidence: Phase 2 verify-auto (EXIT=0, 3742 vitest).
    - [x] CLI structure — evidence: `ProjectPicker.tsx` has no `PICKER_ROW_CELLS.map` / `case "open"`
      (both in `PickerRow.tsx`); `PickerRow.tsx` has no `gateOn`; `missingProfileRefusal(` before
      `invoke("record_open"` in `handleOpenRecent` (guarded by `projectModelCellProfileLine`, green).
    - [x] CLI render-unchanged — evidence: 8-fixture dump `diff -r` → exit 0 ("PICKER RENDER+IPC
      IDENTICAL", incl. `onOpen` args); positive control → 5/8 differ.
    - [x] CLI re-pointed guards mutation-proved — evidence: 7/7 killed (announceRow ×5,
      driveModeIpc planted per-row read in PickerRow, projectModelCell map consumption) + the new
      gate test 3/3.
    - [x] Browser (dev app via the bridge; consuming surface = the launch picker) — evidence:
      after a webview reload (HMR-rename caveat), `#root` children=1; 7 `button.picker-recent`
      for 7 projects in `projects.json`; every row has its gutter, cells in order
      open/model/remove; the ⊘ door only on the 2 announcing rows (scratch-c, yitang-copy).
      State change (declared, dev store, scratch-c): the drive-mode line → `<select>` →
      `stepping` persisted in `projects.json`, then `autopilot` again; `shasum` back to
      `1c03a103…`. Clicking scratch-c's ⊘ opened its workspace (filmstrip tile `ws-1`, header
      `scratch-c`), and the spawned argv was `claude --permission-mode bypassPermissions --model
      opus` — **no `--continue`**, so the no-fire door still suppresses the argv arm through the
      new prop path. Closed via the filmstrip ×; the picker came back, and the clean close cleared
      scratch-c's unclean flag (its ↻ announcement is gone, as expected). Screenshot
      `<scratchpad>/wp13/p2-picker.png` renders normally. Dev app torn down by my PIDs only
      (38264/38267/38301/38541 + the orphaned Vite 38469/38501, both started 13:35:51 by my launch).
  - [x] verify-human
    - [x] P2.verify-human.1: feature floor (5a) — the main happy path end to end in the dev build: picker rows look as before, open a project, open ⌘, Settings and scan the groups — still what you want? — operator: "ok" (2026-11-06)
  - [x] verify-codify
    — Probe: making the row's ×, or any of the 3 commit callbacks, a no-op passed all 750
      picker/app tests (likely the same at HEAD, where they were inline handlers). New
      `pickerRowCallbacksLive.test.tsx` (the consuming surface: the real picker, live mount):
      ⊘ → `record_open {path}` then `onOpen(path, null, "no-fire")`; row → `onOpen(path, argv
      continue, "fire")`; × → `remove_project {path}`, and the row leaves while the other stays;
      model / drive mode / profile commits survive a filter round-trip that UNMOUNTS the row (the
      reducers' only observable). Mutation: × no-op, 3× commit no-op, ⊘ → fire — 5/5 killed.
      Test-authoring note: two of the new tests first failed on MY selectors (the profile line's
      real testid is `project-profile-line`) and on a harness artifact (a remounted cell re-seeds
      the gate from its command, which this harness answers OFF by design; fixed by
      re-broadcasting). Neither was a product failure.
      Full gate: `pnpm verify:auto` EXIT=0 in 68s, vitest 291 files / 3748 tests, cargo 1069,
      `check:link` clean.

## Retrospect
- **What changed in our understanding:** two of the extraction's prop seams were unpinned. A
  constant `workflowApplicable`, and a no-op × or commit callback, passed every picker/app test.
  HEAD had the gate hole too, as an inline expression; moving code into a prop is what made the
  seam testable and the gap visible. Also, the drive-mode `<select>` the handoff said to "move
  unchanged" was never in `ProjectPicker.tsx`; it lives in `ProjectModelCell.tsx`.
- **Assumptions that held:** keeping the group shells (ids, order, hints) in the panel left
  most panel-level guards untouched. Keeping the gate control in the panel kept
  offInvariantGuard's `ALLOWED_GETTER` valid with no edit. Both dumps were identical to HEAD on
  the first run after the move.
- **Assumptions that were wrong:** the plan-time proof recipe (`renderToStaticMarkup`) would
  have been vacuous for the picker: SSR runs no effects, so no row renders. A live mount with
  effects was needed (decided at plan time, D6). The rewrite of the announce-once guard was
  wrong: its comment claimed the per-row map had moved, but only the per-cell map did (caught
  by the review, backlogged). A remounted cell re-seeds the gate from its command, so a test
  harness that moves the gate only by broadcast must re-broadcast after an unmount.
- **Approach delta:** as planned, plus two live tests the plan did not foresee
  (`pickerRowGateLive`, `pickerRowCallbacksLive`) and three panel-level write assertions added
  at codify. One operator look at the feature-level floor ("ok").

**Closure:** Feature complete: paydown WP13 has shipped. The Settings panel is now a 234-line
shell with one module per group, and the picker's row is its own `PickerRow` component. Both
render exactly as before, proved against HEAD. Requester = operator — closure notice for
self-record.

## Code-Quality Review

*(feature-review-quality, ship `0e7c138`, window `fea480e..0e7c138`, drive_mode=autopilot: 0 CRITICAL, 0 MAJOR, 4 MINOR, all auto-backlogged under `# paydown-2026-11-04-wp13-settings-split-and-picker-row — 2026-11-06` in `backlog-quality-findings.md`.)*

### Strengths
- The split follows ownership: the panel keeps the shell plus the one gate control two groups read; each body owns its own `useSettingControl`; the `## Layout` header states the rule and its exception.
- D3 applied cleanly: `PickerRow` gets `workflowApplicable`, never the raw gate; the open path (refusal before `record_open`) and the reducers stay in the picker, so each guard still watches one file.
- Cross-boundary placement guards became live-mount identity assertions, not two-file splices; the hotkey check first proves gate-ON ≠ gate-OFF.
- The extraction's own prop-seam holes were found and pinned (`pickerRowGateLive`, `pickerRowCallbacksLive`); `driveModeIpc`'s scan now includes `PickerRow.tsx`.
- Doc follow-through complete (`arch/workflow-gate.md`, `WorkflowSubstrateInfo.tsx`'s four ownership comments).

### Issues
**CRITICAL** — none
**MAJOR** — none
**MINOR**
- [`announceRow.test.ts`, the announce-once guard] Lost its ordering half; the new comment ("the map now lives in another file") is wrong, because `pickerItems.map` is still in `ProjectPicker.tsx` (verified, line 545). Moving the invoke into that loop would pass.
- [`uninstallIntercept`, `workflowInstallWizard`, `workflowSubstratePresence`] Re-pointed guards keep panel-era names (`PANEL`, `PANEL_SRC`, `panelSrc`), unlike the three renamed to `groupSrc`.
- [picker `*Live.test.tsx`] Five files rebuild the same mount scaffolding; no shared `livePicker.tsx` like the workspace's `liveWorkspace.tsx`.
- [`PickerRow.tsx`, four JSX comment blocks] Moved verbatim with their old continuation indentation (cosmetic; WP14).

### Assessment
A well-built pure move: both files are now under the size where the next change is cheap, the boundaries follow ownership, and the refactor pinned the prop-seam holes the inline code had hidden. The added debt is small and mechanical; none affects correctness.

### If you disagree
Mark a finding `[DISMISSED]` here before `feature-finalize` archives this file.

## Current Node
- **Path:** Feature > finalize (complete)
- **Active scope:** none
- **Blocked:** none
- **Unvisited:** none in this feature; the sweep continues with WP13b (the D5 task), then WP14
- **Open discoveries:** none

## Discoveries
- [NOTE-2026-11-06] P1.verify-self — drove the bridge from the orchestrator instead of spawning
  `feature-verify-self-runner`: `mcp__tauri__*` is not exposed to subagents, which would fall back
  to bare Vite with no IPC (memory `mcp-bridge-tools-not-exposed-to-subagents`). The CLI outcomes'
  evidence came from build/verify-auto runs already in this phase.
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
