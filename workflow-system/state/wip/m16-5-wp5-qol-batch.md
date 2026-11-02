---
drive_mode: autopilot
---

# Feature: M16.5 WP5 — QoL batch (the papercuts)

**Workflow:** feature
**State:** ship (complete)
**Created:** 2026-11-02
**Entry:** spec (complex feature — 8 independent items across picker, file tree, settings, dashboard, media player, and an mccc handoff)
**WBS:** `workflow-system/product/wbs.md` → WP5 (tasks 5.1–5.8). Each item's measured detail lives in its backlog entry; this spec does not repeat it.

## Problem Statement

Eight small, independent papercuts collected from dogfooding and deferred backlog entries. None is
large on its own; together they are the friction the operator meets daily: a picker click that gets
lost to autocorrect, a delete that fails with no message, shortcuts missing from the hotkey
reference, a model box that only suggests three names, a Day view you can't drive by keyboard, a
frame-step that may be wrong on screen recordings, a project list whose order feels strange, and a
drive-mode menu that still appears even though Claudesk already chose the mode.

**Governing rule (operator, 2026-10-27; `[PRIOR: simple-version-first-when-the-source-fix-shrank-the-problem]`):**
build the **simple** version of each item. An advanced enhancement whose likely gain is minor goes to
the backlog with its reason, not into this WP.

## User Stories

- As the operator, I want a click on a picker row to open that project, even when the filter text isn't a dictionary word.
- As the operator, I want a failed file delete or folder trash to tell me it failed, not to look like nothing happened.
- As the operator, I want ⌘⌥G / ⌘G / ⌘⇧L listed in the `⌘,` hotkey reference so I can find them.
- As the operator, I want the model box to suggest the models I actually use, not only `fable`/`opus`/`sonnet`.
- As the operator, I want to pan and zoom the Day view with the keyboard.
- As the operator, I want frame-step to land on real frames in a screen recording.
- As the operator, I want the project list in an order that makes sense on a fresh launch and when some workspaces are already open.
- As the operator, I want a Claudesk workspace to restore straight into its preset drive mode, with no "press Enter" menu.

## Acceptance Criteria

### 5.1 Picker filter autocorrect (`SURFACE-2026-10-19-PICKER-FILTER-AUTOCORRECT-HIJACKS-THE-ROW-CLICK`)
- **AC-1** `picker-filter` sets `spellCheck={false}`, `autoCorrect="off"`, `autoCapitalize="off"` (and `autoComplete="off"`).
- **AC-2** Live in the dev app: typing `eos` shows no autocorrect bubble, and clicking the `eos` row opens the workspace.
- **AC-3** Every other **filter/search/name** input gets the same attributes. Sweep list (from `grep`): `ProjectSearch` (5 inputs), `CommandPalette`, `FileFinder` (already has `spellCheck`; add the rest), `FileTree` new-file input, `ProjectModelCell` (already has two; add the rest), the `NewProfileWizard` / `WorkflowInstallWizard` / `SettingsPanel` path/name inputs, and `RangePicker` if it is free text. **The Prompt panel keeps spellcheck** (it is prose). Each site's decision is recorded in one line in the plan.

### 5.2 A failed delete / trash shows an error (`SURFACE-2026-06-30-FILE-OP-ERROR-SURFACE`, in `backlog-quality-findings.md`)
- **AC-4** When `delete_file` or `trash_path` rejects, the operator sees the error text in the right panel (not only `console.error`), and it can be dismissed or clears itself. The tree stays as-is.
- **AC-5** It reuses an existing pattern (the FileTree's inline error line or the picker's toast shape) rather than a new general toast system.
- **AC-6** The create-collision half is confirmed **already covered**: `fs_tree` shows gitignored files (`fs_index::gitignored_editable_files_are_now_shown`), so `collides()` sees `.env` and the inline "already exists" error fires. Proven by a test (or a live check) with a gitignored `.env`; then that half of the finding is closed.
- **AC-7** The finding is deleted from `backlog-quality-findings.md` and its stub from `backlog.md` at close (delete-on-resolve).

### 5.3 Settings hotkey rows for CM6 bindings (`SURFACE-2026-09-23-CM6-GO-TO-LINE-HAS-NO-SETTINGS-HOTKEY-ROW`)
- **AC-8** `Mod-Alt-g` (go to line), `Mod-g` (find next) and `Mod-Shift-l` (select all matches) each have a `host: "editor"` row in `CHORD_REGISTRY` and appear in the `⌘,` hotkey reference.
- **AC-9** They are removed from `NOT_LISTED` in `chordRegistry.test.ts`; both directions of the CM6-owned-set guard stay green.

### 5.4 Model-alias hints from use (`SURFACE-2026-07-31-MODEL-ALIAS-HINTS-COULD-BE-DYNAMIC`)
- **AC-10** The picker's shared `<datalist>` offers the union of the three static aliases and every distinct non-empty `default_model` currently set on any project, de-duplicated.
- **AC-11** Still hints only: nothing validates against the list, and the existing non-exhaustiveness pins stay green.

### 5.5 Day-view keyboard pan/zoom  *(2026-11-02: operator — Week view is the one used; Week keys DROPPED as needing operator design; Day keys kept, tested, no live operator check)* (`SURFACE-2026-07-13-M9-WP6B1-KEYBOARD-PAN-ZOOM-DEFERRED`)
- **AC-12** With the dashboard's Day view showing, `←`/`→` pan by a fixed fraction of the visible span, `+`/`=` and `-` zoom in/out around the centre, and `Home`/`End` jump to the start/end of the data window. All go through `clampViewport`.
- **AC-13** The keys are ignored when a modifier (⌘/⌃/⌥) is held or focus is in an input/textarea/contenteditable, exactly like the existing `0` reset. A `grep` of the chord registry and app-level keydown handlers shows no conflict (checked at spec: no existing bare-arrow/Home/End handler outside the editor and FileFinder).
- **AC-14** The Chrome tooltip / help text names the new keys.

### 5.6 VFR frame-step (`SURFACE-2026-10-20-REVIEW-PLAYER-VFR-FRAME-STEP`) — measure first
- **AC-15** A real macOS screen recording (agent-made with `screencapture -v`, or the operator's) is confirmed VFR with `ffprobe` (per-frame `pts` deltas), then stepped through in the player for at least 30 frames, comparing the frame shown against the `ffprobe` frame list.
- **AC-16** If no step skips or repeats: the backlog entry is closed on that measurement and nothing is built.
- **AC-17** If steps skip or repeat: frame-step moves by presented frames (rVFC `mediaTime`), constant-rate files keep today's midpoint behavior (no regression on the M16 WP3 fixtures), and the measurement is re-run green.

### 5.7 Workspace list order (`SURFACE-2026-10-27-WORKSPACE-LIST-ORDER-NEEDS-A-UX-PASS`) — design first
- **AC-18** Scope is the **project picker** list (operator, 2026-11-02); the filmstrip order is unchanged.
- **AC-19** Today's order is measured on the real `projects.json` for **A** (fresh launch) and **B** (some workspaces open), and presented with ≥2 candidate orders and a recommendation (`/util-option-mockup` if the difference is spatial).
- **AC-20** The order the operator picks is built and covered by a test on the pure ordering function.

### 5.8 Drive-mode menu (`SURFACE-2026-11-02-DRIVE-MODE-MENU-STILL-SHOWN-UNDER-A-CLAUDESK-MODE`)
- **AC-21** ✅ **SENT 2026-11-02, ahead of the plan, at the operator's request** (so mccc works in parallel): `my-claude-code-customization/workflow-system/inbox/2026-11-02-claudesk-drive-mode-picker.md`, outbox copy `workflow-system/outbox/HANDOFF-to-mccc-2026-11-02-drive-mode-picker.md`. One mccc inbox message, with an outbox copy in `workflow-system/outbox/`. It asks for (a) `AskUserQuestion` as the mode picker in `session-start` step 3 and `session-restore` step 4b, and (b) both skills skipping the picker when the line `Claudesk reports the drive mode for this workspace as <mode>.` is in context, using that mode and saying so in one line.
- **AC-22** `arch/session-resumption.md` → "The drive-mode signal" is corrected: the "makes the real `/session-restore` skip its mode menu" claim (it no longer holds), and the "ZERO companion-repo change" constraint (reversed by the operator, 2026-11-02). The hook sentence in `claudesk-hook.pl` stays fact-only and unchanged.
- **AC-23** If mccc has landed by verify-human: live check that restore in a Claudesk workspace shows no menu, and a bare terminal still asks through the select UI. If it has not landed, the live check is **carried** in the backlog entry (status → "waiting on mccc"), not counted as passed.

## Out of Scope

- ⛔ The stale minimap (excluded by the 2026-10-20 grill).
- Per-result / per-file replace (WP6).
- A general app-wide toast/notification system (5.2 reuses an existing pattern).
- A persisted model-history list (5.4 derives from current overrides; see Assumed).
- Making Settings hotkeys rebindable (5.3 adds reference rows only).
- Day-view mouse/trackpad changes, and keyboard pan/zoom on Week/Month views (5.5 is Day view only).
- Editing mccc's skills from this repo (5.8 sends a message only; never commit in mccc).
- Changing the hook's `additionalContext` sentence to an instruction (5.8).

## Technical Constraints

- **No 3rd-party dependency.** All work is in-repo, plus one mccc inbox file (5.8).
- `pnpm verify:auto` is the per-phase gate.
- 5.1 is WKWebView-native behavior: `spellCheck={false}` alone may not stop the autocorrect bubble, so AC-2 must be checked live (dev build via the MCP bridge or the operator).
- 5.3: the CM6-owned-set guard resolves the `...searchKeymap` spread; the new rows must satisfy its `labelFor(key)` label match.
- 5.5: the listener lives in `ViewportContext.tsx` beside the `0` reset (`window` keydown, same input/modifier filters). Escape stays with `GlobalDashboard`.
- 5.6: `ffprobe`/`ffmpeg` are installed (`/opt/homebrew/bin`). The player's fps comes from `videoTracks[0].configuration.framerate` at `loadeddata`; frame-step seeks the midpoint `(n+0.5)/fps` (`mediaClock.ts`). Those as-built rules must hold for constant-rate files.
- 5.7: picker order today is `config_store::sort_by_recency` (descending `last_opened_at`, re-stamped on every open). The filmstrip order is separate: user-arranged by drag, persisted in localStorage (`filmstripOrder.ts`).
- 5.8: per the cross-workspace inbox convention, write only the inbox file in mccc; never `git add` there.
- Items are independent; the plan can order them freely. 5.7's build waits on the operator's pick.

## Open Questions

- [x] **5.7 — which list does "selection box" mean?** → **the project picker list** (operator, 2026-11-02). The filmstrip is out of 5.7's scope.

None open. The remaining unknowns (5.6's VFR result, 5.7's chosen order) are resolved inside their own tasks by measurement and by the operator's pick, not by a research spike.

## Asked
- 5.7: which list is meant → **the project picker** (operator confirmed the recommendation, 2026-11-02).
- Spec approved by the operator 2026-11-02, with one change: send 5.8's mccc message first (done), so mccc runs in parallel.

## Assumed (defaults taken without asking — correct any of these)
- **5.1:** a filter, search, path or name input never wants spellcheck/autocorrect; the Prompt panel keeps it.
- **5.2:** the error shows inline in the file-tree area (reusing the tree's existing inline-error style) and clears on the next file action or on dismiss. Folder trash and file delete use the same surface.
- **5.3:** all three bindings get rows, not just ⌘⌥G (the WBS lists all three). Labels follow the existing editor-row wording.
- **5.4:** "recently used" = the distinct overrides currently set across projects, most recently opened project first, then the three static aliases. A value cleared from every project drops out of the hints. A persisted history is an advanced, minor-gain enhancement → not built (logged to backlog only if the operator wants it).
- **5.5:** pan step = 10% of the visible span, zoom factor = ×1.25 / ÷1.25 around the centre (the original `claude-time` set). Key repeat is allowed.
- **5.6:** if the measurement shows a fault, the fix covers stepping only; the `.ff` timecode readout on VFR stays approximate (a minor-gain enhancement → backlog).
- **5.8:** WP5 can close with 5.8's live check carried, if mccc has not landed by then (AC-23). The precedence of the Claudesk line over `.session.md`'s `drive_mode:` is left to mccc, with "Claudesk wins" as the stated lean.
- **Design priors:** `simple-version-first-when-the-source-fix-shrank-the-problem` agrees (rule 2) on every item's scope. `new-surface-must-earn-its-place-against-existing-ones` agrees (rule 2) on 5.2 (no new toast system). No prior governs 5.3–5.6.

## Work Tree

- [x] Phase 1: Picker + settings papercuts, and the 5.7 order options
  **Observable outcomes:**
  - Browser (dev app via the `tauri` MCP bridge): `document.querySelector('[data-testid="picker-filter"]')` (or the picker filter's real selector) has `spellcheck="false"`, `autocorrect="off"`, `autocapitalize="off"`, `autocomplete="off"`. The same four hold on every input the 5.1 sweep marks "off". The Prompt panel input does NOT carry `spellcheck="false"`.
  - Browser: the picker's shared `<datalist>` contains `fable`, `opus`, `sonnet` plus every distinct non-empty `default_model` in the dev `projects.json`, each once. A value set on two projects appears once. Read via `webview_execute_js` against `datalist option` values, compared to `jq '[.[].default_model] | map(select(. != null and . != "")) | unique' projects.json`.
  - Browser: the `⌘,` Settings hotkey reference renders rows naming ⌘⌥G (go to line), ⌘G (find next) and ⌘⇧L (select all matches).
  - CLI: `pnpm verify:auto` exits 0. `chordRegistry.test.ts`'s NOT_LISTED no longer names `Mod-g` / `Mod-Shift-l` / `Mod-Alt-g`, and both guard directions pass.
  - CLI (5.7 measurement, read-only): a script prints the picker's current order for scenario A (fresh launch: `projects.json` recency order) and B (the same list with 2–3 named projects open), from the real dev `projects.json`.
  - Native (5.1 autocorrect bubble): the agent cannot deliver real keystrokes to the dev app (memory `agent-cannot-send-real-keystrokes-to-dev-app`). verify-self tries a real-key path only with a positive control; otherwise "type `eos`, no bubble, click opens the row" is carried to verify-human as an unreachable check, not counted as passed.
  **Alignment questions:**
  - (decision) 5.7: here are the measured A/B orders and ≥2 candidate picker orders with a recommendation (a `/util-option-mockup` artifact if the difference is spatial). Which order do you want built in Phase 2?
  - 5.4 assumed "recently used = models currently set on your projects": now that you see the suggestion list, still what you want?
  - 5.1: type `eos` in the picker filter. No autocorrect bubble, and clicking the row opens it?
  - [x] P1.1 5.1: add `spellCheck={false}` / `autoCorrect="off"` / `autoCapitalize="off"` / `autoComplete="off"` to `picker-filter` (`ProjectPicker.tsx`). Sweep `ProjectSearch` (5), `CommandPalette`, `FileFinder`, `FileTree` new-file input, `ProjectModelCell`, the `NewProfileWizard` / `WorkflowInstallWizard` / `SettingsPanel` name/path inputs and `RangePicker`; record a one-line decision per site in this WIP. Leave `PromptPanel` spellcheck on. Prefer one shared props constant over 15 copies if it stays simple.
  - [x] P1.2 5.3: add three `host: "editor"` rows to `CHORD_REGISTRY` (labels matching `labelFor(key)`); remove the three keys from `NOT_LISTED`; update its comment.
  - [x] P1.3 ~~5.4~~ **REVERTED 2026-11-02 (operator declined at P1.verify-human.4)**: a pure `modelHints(projects)` in `src/cc/modelOverride.ts` → distinct non-empty `default_model`s (most-recently-opened project first), then the static aliases not already present. The datalist renders it. Unit test it; the non-exhaustiveness pins stay.
  - [x] P1.4 5.7 design: measure today's A/B order; draft ≥2 candidate orders (for B, e.g. open workspaces grouped first vs marked in place; for A, recency vs a stable order) with a recommendation. If spatial, build a `/util-option-mockup`. Presented at this phase's verify-human.
  - [x] verify-auto
    - (re-run after the 5.4 revert) `pnpm verify:auto` → EXIT=0, 44s: 269 files / 3622 tests passed (−3 = the reverted `modelHints` tests); cargo green; lint 0 errors (same pre-existing `XtermPane.tsx` warning).
    - (first run) `pnpm verify:auto` → EXIT=0, 39s: 269 Vitest files / 3625 tests passed; cargo lib 1034 passed; lint 0 errors (1 pre-existing `XtermPane.tsx:932` exhaustive-deps warning, not from this phase); format, tsc, check:link, clippy clean. A first run failed `format:check` on 3 of this phase's files; fixed with Prettier.
    - `vitest run chordRegistry.test.ts` → 22 passed; mutant ⌘⌥G→⌘⌥X fails both directions (restored).
  - [x] verify-self  (driven from the orchestrator over the `tauri` MCP bridge, dev app `pnpm tauri:dev` with the Claude-marker env strip; the runner subagent was NOT spawned because the bridge does not reach subagents — memory `mcp-bridge-tools-not-exposed-to-subagents`)
    - [x] 5.1 picker filter attrs — evidence: `webview_execute_js` on `[data-testid=picker-filter]` → spellcheck=false, autocorrect=off, autocapitalize=off, autocomplete=off
    - [x] 5.1 sweep, live — evidence: ⌘P → `file-finder-input` false|off|off|off; ⌘⇧F → `project-search-input` + `project-search-replace` false|off|off|off. The rest (palette, new-file, wizards, install-location, model cell) by source: each of the 12 `data-testid`s is followed by `{...NO_TEXT_ASSIST}` (grep count 1 each). The palette would not open with no file open; not chased.
    - [ ] 5.1 Prompt panel keeps spellcheck  <!-- status: FAILED-premise (not a regression): the Prompt panel's CodeMirror `.cm-content` reads spellcheck=false, autocorrect=off, autocapitalize=off — CM6's own defaults. It NEVER had spellcheck; this phase did not touch it. The spec's "keeps spellcheck" premise was wrong. Routed to verify-human as a (decision). -->
    - [x] 5.4 datalist — evidence: live datalist = [opus, fable, sonnet]; dev `projects.json` overrides `jq … unique` = ["opus"] (scratch-c, the most recently opened). `opus` LEADING (static order is fable, opus, sonnet) shows the derived path is live, not the old constant.
    - [x] 5.3 hotkey rows — evidence: ⌘, Settings → Editor section shows "⌘G Find the next match", "⌘⇧L Select all matches of the search", "⌘⌥G Go to line" (screenshot `scratchpad/p1-hotkeys.png`)
    - [x] 5.7 measurement — evidence: the A/B order table in `## Build notes — Phase 1` (read-only `jq` over the operator's prod `projects.json`, 26 projects)
    - [ ] 5.1 native autocorrect bubble  <!-- status: UNVERIFIED: undrivable — the agent cannot deliver real keystrokes to the dev app (synthetic keydown never triggers WebKit's native text checking; memory agent-cannot-send-real-keystrokes-to-dev-app). Carried to verify-human. -->
    - [x] align: 5.7 order pick — evidence: measured A/B + candidates A1/A2, B1–B4, recommendation A1+B2 (Build notes)
    - [x] align: 5.4 "models currently set" — evidence: live datalist above
    - [x] align: 5.1 type a non-word, no bubble, click opens — evidence: none capturable (see UNVERIFIED above); dev app left running
  - [x] verify-human  (all 4 leaves resolved; the 5.4 revert re-verified live in build: datalist = [fable, opus, sonnet])
    - [x] P1.verify-human.1: 5.1 happy path — type a non-word in the dev picker filter, no autocorrect bubble, the row click opens it — operator: "good" (2026-11-02)
    - [x] P1.verify-human.2: (decision) 5.7 picker order — **operator (2026-11-02): sort by LAST CLOSED, not last opened; open/opening workspaces must NOT be at the top** ("useless information"). Built as: closed projects by `last_closed_at` desc (fallback `last_opened_at`), then an "Open" group at the bottom, marked, click switches (B2's treatment). → Phase 2 P2.1
    - [x] P1.verify-human.3: (decision) Prompt panel spellcheck — not answered; the recommended default taken (leave off, no change; CM6's default). Flagged to the operator.
    - [x] P1.verify-human.4: 5.4 — operator declined ("drop this improvement"); reverted: `modelOverride.ts`, its test and `projectModelCell.test.ts` restored from HEAD, `ProjectModelHints` back to the static aliases (5.1's spread kept). Re-verified live: ⌘⇧N picker datalist = [fable, opus, sonnet].
  - [x] verify-codify
    - New `src/components/__tests__/noTextAssist.test.tsx` (4 tests): a LIVE jsdom render of the real `ProjectPicker` (mockIPC + shouldMockEvents) asserting the filter's four attributes — the consuming surface; a population guard that every free-text `<input>` in shipped `.tsx` spreads `NO_TEXT_ASSIST` (non-text types exempt), with a ≥12 positive control; and the constant's four values.
    - Mutation-proven individually: removing the spread from `picker-filter` fails the render test AND the population guard; dropping `autoCorrect` from the constant fails the render test AND the constant test. Both restored, `shasum -c` OK.
    - 5.3 not re-covered: `chordRegistry.test.ts` already fails both directions on a relabelled row (mutation-checked at build).
    - Full gate: `pnpm verify:auto` → EXIT=0, 35s, 270 files / 3626 tests.

- [x] Phase 2: Picker order (as picked), file-op errors, Day-view keys
  **Relevance check (before Phase 2):** requester still needs this: yes (5.7 picked minutes ago) · requirements unchanged: yes, apart from the operator's last-closed ruling, folded into P2.1 · feasible: yes · no superior alternative: yes. **Verdict:** proceed.
  **Observable outcomes:**
  - Browser (dev app, MCP bridge): with 2 workspaces open, the picker's row order matches the operator's Phase 1 pick, read from the DOM row order and compared to the pure ordering function's output on the same `projects.json`.
  - Browser (state-changing, scratch workspace `tmp/scratch/scratch-a`): make `delete_file` fail on a named temp file (e.g. delete a file that was removed from disk after the confirm opened, or `chmod 555` its parent dir), confirm the delete. The right panel then shows a visible error element containing the backend's error text; the tree is unchanged. Same for a folder `trash_path` failure. `chmod` is restored afterwards.
  - Browser (state-changing, `tmp/scratch/scratch-a`): with a gitignored `.env` on disk, the new-file input given `.env` shows the inline "`.env` already exists." error, and the file's bytes are unchanged (`shasum` before/after).
  - Browser: with the Day view open, a dispatched `keydown` `ArrowRight` moves the viewport start later by ~10% of the span; `ArrowLeft` reverses it; `+`/`=` narrows the span by ÷1.25 around the centre and `-` widens it; `Home`/`End` move it to the data window's start/end. All read from the `ViewportContext` state (or the rendered axis labels). With focus in an `<input>`, or with ⌘ held, the viewport does not change.
  - CLI: `pnpm verify:auto` exits 0.
  **Alignment questions:**
  - 5.7: the picked order, in your real picker. Does it read right on a fresh launch and with workspaces open?
  - 5.2 assumed "inline error in the file tree, no new toast system": seeing a real failure, is that visible enough?
  - 5.5 assumed 10% pan steps and ×1.25 zoom: do the keys feel right on a real day?
  - [x] P2.1 5.7 build (operator pick, 2026-11-02): record `last_closed_at` per project when a workspace closes (incl. app quit); picker order = not-open projects by `last_closed_at` desc (fallback `last_opened_at`), then an "Open" group at the bottom, marked, clicking switches. Pure ordering function + tests; the picker needs the open workspace paths as a prop.
  - [x] P2.2 5.2: on `delete_file` / `trash_path` rejection, set an error string shown inline in the file-tree area (reuse the tree's existing inline-error styling); clear it on the next file action or dismiss. Keep `console.error`.
  - [x] P2.3 5.2 create half: a test proving a gitignored `.env` is in `fs_tree` output and `collides()` blocks it (Rust test exists for the tree side; add the frontend arm if missing).
  - [x] P2.4 5.5: extend the `ViewportContext.tsx` keydown listener with arrows / `+` `=` `-` / Home / End through `clampViewport`, same modifier and input filters as `0`. Pure step math in a tested helper. Update the Chrome tooltip.
  - [x] verify-auto
    - First run FAILED (EXIT=1): `offInvariantGuard.test.ts` › "no keydown registration site does inline chord matching" flagged `ViewportContext.tsx` — P2.4 had made the `0` check an inline `e.key === "0"` beside the modifier test. (The pre-existing `e.key !== "0"` form had slipped past the guard's `===` pattern.) Back-loop fix (F9, in place): the key+modifier decision moved into the pure predicate `viewportKeyAction` in `viewport.ts`; the listener delegates. +2 tests.
    - Re-run: `pnpm verify:auto` → EXIT=0, 45s: 272 files / 3637 tests; cargo 1075 passed / 0 failed; lint 0 errors (pre-existing `XtermPane.tsx` warning only).
  - [x] verify-self  (orchestrator-driven over the `tauri` MCP bridge; dev app RELAUNCHED first because the running binary predated the Rust edits — process start 09:23:29 < binary mtime 09:23:39)
    - [x] 5.7 open group — evidence: with scratch-a + scratch-b open, ⌘⇧N picker rows = [scratch-c, yitang-copy, claudesk, my-claude-code-customization, areo-test-proty-1, OPEN, scratch-b (● open), scratch-a (● open)]; under the old sort those two led. Screenshot `scratchpad/p2-picker-open-group.png`.
    - [x] 5.7 close stamp — evidence: closing scratch-b's tile → dev `projects.json` scratch-b `last_closed_at` 1793630104366 (was null); the next ⌘⇧N picker leads with scratch-b, scratch-a under OPEN.
    - [x] 5.7 quit stamp — evidence: `invoke('quit_now')` with scratch-a open → app exited; scratch-a `last_closed_at` 1793630117221 (was null). Relaunch: launch picker order = [scratch-a, scratch-b, scratch-c, …] — last-closed order, no open group.
    - [x] 5.2 delete failure (state-changing, scratch-a: `wp5-ro/` chmod 555, restored + removed after) — evidence: tree ✕ on `wp5-ro/victim.txt` → confirm "Delete" → `file-tree-op-error` = "Could not delete wp5-ro/victim.txt: file I/O error: Permission denied (os error 13)"; the row stayed.
    - [x] 5.2 trash failure — evidence: the chmod fixture did NOT fail the trash (Finder moved `wp5-ro/sub` despite the read-only parent; see Discoveries). Driven instead by removing `wp5-gone/` on disk while its confirm was open → "Could not move wp5-gone to the Trash: file I/O error: …/wp5-gone does not exist". × dismiss → element gone.
    - [x] 5.2 create half — evidence: new-file input `.env` + Enter in scratch-a (gitignored `.env`, `git check-ignore` → `.env`) → "`.env` already exists."; `shasum .env` fd30c5c7… before and after.
    - [ ] 5.5 Day-view keys, live  <!-- status: UNVERIFIED: destructive — needs operator OK: the dev build has Time tracking OFF ("Time tracking is off" empty state), so no Day timeline renders to drive. Turning it on is an undeclared dev-settings change that also makes capture machine-global. The listener wiring is covered by a jsdom test at verify-codify instead. -->
    - [ ] 5.7 cosmetic: open rows still show the "↻ continue" announcement and the ⊘ no-fire door, though clicking an open row only switches to it  <!-- status: FAILED-cosmetic -->
    - [x] align: 5.7 picked order in the real picker — evidence: the rows above + screenshot
    - [x] align: 5.2 inline error visible enough — evidence: the two error texts above (red, above the tree, × dismiss)
    - [x] align: 5.5 10% / ×1.25 feel — evidence: none live (see UNVERIFIED); `viewportKeys.test.ts` pins the numbers
  - [x] verify-human  (4/4 resolved)
    - [x] P2.verify-human.1: 5.7 the picked order in the running picker (happy path) — operator: "all good" (2026-11-02)
    - [x] P2.verify-human.2: 5.2 assumed inline error above the tree — visible enough? — operator: "all good"
    - [x] P2.verify-human.3: (decision, cosmetic) hide "↻ continue" + ⊘ on open rows — operator: hide ("all good"). Built: open rows override `rowAffordances` to no announcement / no door (overridden in the row, NOT via the gate arg — the `argv` continue arm ignores the gate). Re-verified live: ⌘⇧N with scratch-a open → scratch-a(open) announce=- door=false; positive control scratch-c (not open) announce=↻ continue door=true.
    - [x] P2.verify-human.4: 5.5 live Day-view keys — operator (2026-11-02): the Week view is the one used; other views barely. "If you can apply simple enhancement without me, go ahead … if it has to have me in the loop, drop that enhancement." Resolution: Day-view keys KEPT (built; covered by unit + a jsdom wiring test at codify, no operator check, no dev tracking toggle). Week view has no viewport ("Day-only" in GlobalDashboard), so keys there would be new design needing the operator → DROPPED, not built, not backlogged.
  - [x] verify-codify
    - `src/components/picker/__tests__/pickerOrderLive.test.tsx` (3, live ProjectPicker — the consuming surface): last-closed order with nothing open; an open project moves to an "Open" group at the bottom, marked; an open row has no continue badge / no ⊘ while a not-open row with the same prediction still does (positive control).
    - `src/components/workspace/__tests__/fileOpErrorLive.test.tsx` (3, live RightPanelHost + FileTree, mocked IPC; jsdom `ResizeObserver`/`matchMedia` stubs): failed `delete_file` → inline error with the backend text, × dismisses; failed `trash_path` → "Could not move … to the Trash"; `.env` create → ".env already exists." with no `write_file` IPC.
    - `src/components/workspace/dashboard/__tests__/viewportKeysLive.test.tsx` (2, live ViewportProvider): → / End / Home / 0 move the viewport; ⌘-combos and keys from an `<input>` do not (positive control after).
    - Already present from build: `pickerOrder.test.ts` (5), `viewportKeys.test.ts` (6), Rust `touch_closed` (2).
    - Mutation-proven individually, each landed (grep-confirmed) and restored (`shasum -c` OK): open-row announcement override removed → live picker test fails; door override removed → fails; delete `setFileOpError` removed → delete test fails; key routing replaced by a no-op → both key-wiring tests fail. (A first M1 probe did not land because Prettier had reflowed the line — re-run on the real text.)
    - Full gate: `pnpm verify:auto` → EXIT=0, 43s, 275 files / 3645 tests; cargo 1075 / 0 failed.

- [x] Phase 3: VFR frame-step measurement, and 5.8's Claudesk half
  **Relevance check (before Phase 3):** requester still needs this: yes · requirements unchanged: yes · feasible: yes · no superior alternative: yes. **Verdict:** proceed.
  **Observable outcomes:**
  - CLI (state-changing, writes a temp file in the session scratchpad only): `screencapture -v -V 6 <scratchpad>/vfr.mov` produces a recording; `ffprobe -select_streams v -show_entries frame=pts_time -of csv` shows non-uniform frame intervals (VFR confirmed, or the outcome records it was not VFR and a different real VFR source is used).
  - Browser (dev app, MCP bridge): open that file in the editor `"file"` tab, frame-step forward 30+ times, recording `currentTime` and the rVFC `mediaTime` after each step. Compare to the ffprobe `pts_time` list: count skipped and repeated frames. Verdict: 0/0 → close the entry on the measurement (AC-16); otherwise the fix lands and the count is re-run to 0/0, and a constant-rate M16 fixture still steps 30/30 (AC-17).
  - CLI: `grep -c "ZERO companion-repo change" workflow-system/product/arch/session-resumption.md` shows the constraint is marked reversed (not deleted silently), and the "makes the real `/session-restore` skip its mode menu" claim is corrected. `claudesk-hook.pl`'s sentence is byte-identical (`git diff --quiet src-tauri/resources/claudesk-hook.pl`).
  - CLI (5.8 live check, only if mccc has shipped): `git -C ../my-claude-code-customization log` shows the drive-mode picker change; a `/session-restore` in a Claudesk dev workspace on a scratch project with a `.session.md` shows no mode menu and names the mode. Otherwise the backlog entry's status records "waiting on mccc" and the check is carried.
  - CLI: `pnpm verify:auto` exits 0.
  **Alignment questions:**
  - 5.6: if a fix was needed, step through a recording of your own. Does each press move exactly one frame?
  - 5.8 (if mccc has shipped): restore a real workspace. Straight into the mode, no menu?
  - [x] P3.1 5.6 measure: make the recording, confirm VFR with ffprobe, step it in the player, count skips and repeats. — DONE: synthetic VFR (real recording would capture the operator's screen; declined) → 5 exact / 18 skips / 17 repeats of 40; rVFC reports the presented PTS on paused seeks. Details in the backlog entry.
  - [x] P3.2 5.6 conditional: if the count is non-zero, step by presented frames (rVFC `mediaTime`) for VFR and keep the midpoint path for constant-rate; tests in `mediaClock.test.ts`. If zero, close `SURFACE-2026-10-20-REVIEW-PLAYER-VFR-FRAME-STEP` on the measurement. — **NOT BUILT (agent decision, disclosed; deviates from AC-17):** the correct fix is a seek-probing engine, not a simple change, and touches the CFR path; backlogged low with the measurement + design. Entry stays OPEN (not closed on the measurement — the fault is real).
  - [x] P3.3 5.8: correct `arch/session-resumption.md` → "The drive-mode signal" (the skip claim and the reversed constraint, citing the operator's 2026-11-02 ruling and the outbox message). — DONE: arch section corrected (skip claim + reversed constraint, both marked, not deleted); repo-wide claim sweep also fixed `CLAUDE.md:170`, the `config_store` doc comment and the `hook_pl_output.rs` header; `claudesk-hook.pl` byte-identical.
  - [x] P3.4 5.8 live check if mccc has landed; else mark it carried in the backlog entry. — CARRIED: mccc has not landed it (message still in its inbox; no skill change). Backlog entry → \"waiting on mccc\".
  - [x] verify-auto
    - `pnpm verify:auto` → EXIT=0, 44s: 275 files / 3645 tests; cargo 1075 / 0 failed. `grep -c "ZERO companion-repo change" arch/session-resumption.md` → 1 (kept, marked REVERSED); `git diff --quiet src-tauri/resources/claudesk-hook.pl` → unchanged.
  - [x] verify-self
    - [x] 5.6 VFR — evidence: ffprobe of `wp5-vfr.mp4` → 102×16.7 ms + 17×116.7 ms intervals (VFR); player readout "32.432 fps"; 40 "next frame" presses → canvas pixel sequence repeats 4× at each gap; 5 exact / 18 skips / 17 repeats, matching the midpoint-grid prediction from the true PTS. rVFC on a paused seek to 0.15 → `mediaTime` 0.1 (the presented frame).
    - [x] 5.8 arch + sweep — evidence: the two greps above; the claim sweep found and fixed 3 more asserting sites.
    - [x] 5.8 live check — CARRIED (mccc not landed: `grep "Claudesk reports\|AskUserQuestion"` in both skills → no match; message still in its inbox).
  - [x] verify-human
    - [x] P3.verify-human.1: (decision) accept NOT building the VFR step fix (deviates from AC-17); backlogged low with measurement + design — ACCEPTED 2026-11-02 (operator "continue" on the recommendation to accept; VFR entry stays OPEN at low).
  - [x] verify-codify
    - No new tests: Phase 3 changed docs, doc comments and a test-file header only (no executable code); the VFR fix was not built (accepted at P3.verify-human.1), so there is no new behaviour to codify. No integration boundary — phase adds no executable change. Full gate: `pnpm verify:auto` → EXIT=0, 36s.

## Build notes — Phase 1

**5.1 site decisions** (shared constant `NO_TEXT_ASSIST` in `src/components/noTextAssist.ts`):
- OFF (spread added): `picker-filter`, `picker-recent-model-input`, `file-tree-newfile-input`, `project-search-input`, `project-search-replace`, `file-finder-input`, `command-palette-input`, `profile-wizard-name` / `-dir` / `-retention` / `-model`, `install-location`. The partial `spellCheck={false}` / `autoComplete="off"` pairs at those sites were folded into the spread.
- Not changed: checkboxes (`ProjectSearch` regex/case/word, `PromptPanel` dictated, `NewProfileWizard` toggles, `SettingsPanel` toggles), `RangePicker` (`type="date"`, no text assist), and the Prompt panel's CodeMirror editor (prose — keeps text checking by design).

**5.3:** rows `cm6-find-next` (⌘G), `cm6-select-all-matches` (⌘⇧L), `cm6-goto-line` (⌘⌥G); NOT_LISTED keeps only the `⌘= / ⌘- / ⌘0` siblings. Mutation-checked: relabelling ⌘⌥G → ⌘⌥X fails BOTH guard directions (restored, `grep -c` confirmed).

**5.4 (REVERTED — operator declined):** was `modelHints(overrides)` in `src/cc/modelOverride.ts`, fed `recents.map(r => r.default_model)` (backend recency order). `projectModelCell.test.ts`'s one-datalist `?raw` guard was keyed on the prop-less tag `<ProjectModelHints />`; widened to `/<ProjectModelHints\b[\s\S]*?\/>/g` (an arrow `=>` inside the prop defeats `[^>]*`). Its property, one datalist per picker, is unchanged.

**5.7 measurement (2026-11-02, the operator's real `projects.json`, read-only; 26 projects):**
- Today: `config_store::sort_by_recency` sorts by descending `last_opened_at`, and `record_open` re-stamps it on **every** open from the picker (`ProjectPicker.handleOpenRecent`).
- **Scenario A (fresh launch):** the list is the reverse order of the last opens. Today the top five (`mbt-copilot`, `ops-data-hub`, `claudesk`, `neo`, `ai-enablement`) were all stamped within **44 s** of each other this morning, so their relative order reflects only the sequence they were clicked in, not how much they are used. Then `yitang-copy`, `scripture-reading`, `my-claude-code-customization`, `knowledge_base`, `eos`, … down to `cloudflare-investigation`.
- **Scenario B (workspaces open, picker via ⌘⇧N):** the same order, so the projects that are **already open sit at the top** (they were the most recently opened), unmarked. Clicking one focuses the existing workspace (`state/workspace.ts`), which is not what ⌘⇧N "new workspace" is for. The picker has no prop carrying the open workspace paths today.
- **Candidates:**
  - **A1 (keep):** recency. **A2:** alphabetical (stable, but scatters the daily five across 26 rows).
  - **B1 (today):** recency, open ones on top, unmarked. **B2:** not-open projects first by recency, then an **"Open"** group at the bottom, each marked, clicking switches to it. **B3:** recency in place, open rows marked (dot/badge). **B4:** hide open projects.
  - **Recommendation: A1 + B2.** In A, recency is what you want: the most recent are your in-flight projects. In B, ⌘⇧N means "open something not open yet", so those lead; the open ones stay reachable but marked, at the bottom. Switching between open workspaces is already the filmstrip's job. A one-sentence difference, so no mockup (the trigger's clause b fails).

## Build notes — Phase 2

**5.7 (P2.1):** Rust `Project.last_closed_at: Option<i64>` (serde-default, omitted when absent) + `config_store::touch_closed(dir, paths, now)` (one read-modify-write; unknown paths skipped, never added). Stamped by `config_store::commands::record_closed_best_effort` from (a) `workspace_deregister` — every workspace close, incl. the N≤1 replace — outside the registry lock, and (b) `perform_quit_teardown` for every `open_project_paths()`. Best-effort: a failed write is logged, never fails the close/quit. Frontend: pure `orderPickerRows(rows, openPaths)` in `picker/pickerOrder.ts` (not-open by `last_closed_at ?? last_opened_at` desc; open rows last, by `last_opened_at` desc; trailing-slash-tolerant via `canonicalizeProjectPath`). `ProjectPicker` gains `openProjectPaths`; `PickerOverlay` passes it from App's `workspaces`. Open rows render after an "Open" label (`picker-open-group`), muted (`.picker-recent-row--open`), marked "● open"; clicking still goes through `handleOpenRecent`, which focuses the existing workspace. The launch picker (no workspaces) passes nothing. Backend `sort_by_recency` is unchanged (other `list_projects` consumers keep their order).
**5.2 (P2.2):** `fileOpError` state in `RightPanelHost`, set on `delete_file` / `trash_path` rejection ("Could not delete <path>: <err>" / "Could not move <path> to the Trash: <err>"), rendered above `<FileTree>` as `file-tree-op-error` (role=alert, × dismiss), cleared on dismiss and on the next delete request; hidden in the collapsed rail. `console.error` kept. Two stale "a future toast could show it" comments rewritten.
**5.2 create half (P2.3):** confirmed covered on the tree side by the Rust test `fs_index::tests::tree_shows_gitignored_prunes_heavy_excludes_git_dir` (asserts `.env` is listed). No frontend test drives `createFile`'s "already exists" arm — added at verify-codify; driven live at verify-self.
**5.5 (P2.4):** pure `viewportForKey(vp, key, dataWindow)` + `VIEWPORT_KEYS` + `KEY_PAN_FRACTION`/`KEY_ZOOM_FACTOR` in `dashboard/viewport.ts` (zoom reuses `zoomViewport` at frac 0.5). The existing `0` listener in `ViewportContext.tsx` now also routes those keys through the clamping `setViewport` (functional updater), same modifier/input filters, `preventDefault` so Home/End/arrows do not scroll. Fit-button tooltip names the keys. Tests: `viewportKeys.test.ts` (4).

## Current Node
- **Path:** Feature > review-quality
- **Active scope:** review-quality (ship complete)
- **Blocked:** none
- **Unvisited:** none after Phase 3 (then ship)
- **Open discoveries:** none

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary> -->
[SURFACED-2026-11-02] Phase 2 verify-self — `trash_path` runs `trash::delete` (Finder/AppleScript by default) synchronously in a main-thread `#[command]`: the UI/bridge froze >7 s on one folder trash, and Finder ignored a read-only parent. Pre-existing, outside 5.2 → backlog `SURFACE-2026-11-02-TRASH-PATH-BLOCKS-THE-MAIN-THREAD`.
