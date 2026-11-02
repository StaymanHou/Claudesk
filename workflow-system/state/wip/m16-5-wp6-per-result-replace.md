---
drive_mode: autopilot
---

# Feature: M16.5 WP6 — per-result and per-file replace

**Workflow:** feature
**State:** ship (complete)
**Created:** 2026-11-02
**Entry:** spec (complex feature)
**Source:** `workflow-system/product/wbs.md` → WP6; backlog `SURFACE-2026-06-21-WP7-PER-RESULT-PER-FILE-REPLACE`

## Problem Statement

Project search (⌘⇧F) offers only one replace scope: **Replace All** across the project, from the
overlay. The two finer scopes from the original M2 WP7 spec, replacing **one match** and replacing
**every match in one file**, were deferred on 2026-06-21. The reason was that results render into
the read-only "Find Results" synthetic tab, which had no place to attach per-row actions. The
result is that a selective rename means either Replace All and then reverting the unwanted files,
or opening each file and editing by hand.

Problem statement unchanged (2026-11-02, F12 re-entry for P3.verify-human.4) — the operator's report is an adjacent find/replace input defect (CodeMirror's own ⌘F bar missing NO_TEXT_ASSIST), folded into WP6 because it is the same replace surface family; per-result/per-file replace itself was approved.

## User Stories

- As the operator, I want to replace a single search hit from the Find Results tab, so I can apply
  a rename to the call sites I choose without touching the rest.
- As the operator, I want to replace every hit in one file from its header in Find Results, so I can
  do a rename one file at a time.
- As the operator, I want the results to refresh after each replace, so a row I have already
  replaced cannot be replaced a second time and the counts stay true.

## Acceptance Criteria

1. **Affordance (operator ruling 6.1, 2026-11-02): hover-revealed buttons in the existing Find
   Results tab.** Hovering a **match row** shows a small `Replace` button at the row's right end.
   Hovering a **file-path header row** shows `Replace in file` at its right end. When not hovered,
   rows look exactly as they do today. There is no new panel and no new `TabKind`.
2. Clicking a row **outside** the button still opens the file at that match (the current
   click-line behaviour, unchanged). Clicking the button replaces and does **not** also open the
   file.
3. **Per-result replace** rewrites exactly that one match on disk and leaves every other match in
   the file, and every other file, unchanged. In regex mode, `$1` / `${name}` expand against
   **that** match's captures. In substring mode the replacement is inserted literally (the same
   `NoExpand` rule as Replace All).
4. **Per-file replace** rewrites every match in that one file and no other file. It uses the same
   composed regex and expansion rules as Replace All.
5. **What gets replaced is what the shown results were searched for.** The buttons act on the
   query that produced the current results, not on whatever is in the query field now. They use
   the **current** contents of the replacement field, and the button's tooltip names that text
   (for example `Replace with "newName"`, or `Delete match` when the field is empty).
6. **Stale-row guard.** A per-result replace verifies on disk that the targeted line still has the
   text the search returned and that the match still sits at the recorded offset. If either has
   changed, it refuses with an inline error ("file changed since the search; search again") and
   writes nothing. A per-file replace whose file now has zero matches is a no-op that reports the
   same way, never a silent success.
7. **Refresh (task 6.3).** After any replace, successful or refused, the search re-runs with the
   results' query and the tab re-renders, so replaced rows drop out and the line numbers and counts
   match the disk. This is the same re-search mechanism Replace All already uses.
8. **Open buffers.** Writes go through the same atomic `editor_fs::write_file_core` as Replace All.
   A **clean** open buffer for the file reloads through the existing disk-change path, and a
   **dirty** one raises the existing disk-conflict popup. Neither is silently overwritten. No new
   buffer-sync code is added.
9. **Errors are surfaced, never swallowed.** A write failure, a bad root, a regex that no longer
   compiles, or a stale-row refusal shows in the same inline error row Replace All uses. If the
   overlay is closed when the error happens, it shows in a visible place in the tab instead, not
   only in the console.
10. **Replace All is unchanged**, including its blast-radius confirm.
11. `pnpm verify:auto` is green, with backend unit tests for the new scopes (single match, single
    file, capture expansion in both modes, the stale-row refusal) and frontend tests for the
    buffer/line-map/button mapping.

## Out of Scope

- A separate or richer results panel (rejected at 6.1: it would duplicate the Find Results tab;
  `[PRIOR: new-surface-must-earn-its-place-against-existing-ones]`).
- Undo for on-disk replaces. Replace All has none either; git is the undo.
- A before/after preview of the replacement inside the tab.
- Keyboard shortcuts for the per-row and per-file actions. Mouse only in v1.
- A live filesystem watcher for the Find Results tab. Refreshing after our own replace is enough
  for v1, the same posture Replace All takes.
- Changing Replace All's confirm, or the two-walk replace-then-research design
  (`SURFACE-2026-06-21-QUALITY-WP7-REPLACE-THEN-RESEARCH-TWO-WALKS` stays as it is).

## Technical Constraints

- **Backend (task 6.2).** Extend `project_replace` / `replace_core`
  (`src-tauri/src/project_search/`) with a **scope** argument: `all` (today's behaviour,
  the default), `file { path }`, or `match { path, line, start, end, line_text }`. Keep one
  composed regex (`build_regex`) and the shared walk or root-confined path resolution, so there is
  still only one definition of a match. Per-file rewriting already exists inside the walk, so the
  file scope is a filter. The match scope needs a targeted single-span rewrite plus the stale-row
  check. A typed `thiserror` variant covers the refusal, and there is no `unwrap()`.
- **Click seam.** `SyntheticView` reports clicks only as a 1-based line number (`onLineClick`).
  The buttons need either CM6 widget decorations (real `<button>` elements, kept out of the buffer
  text so copying from the tab and the `lineMap` stay pure) with their own handler, or an extended
  click payload. The plan picks one. Watch for this: a widget mousedown must not also fire the
  row's open-file handler (AC 2). `SyntheticView` stays generic, because Find Results is a
  consumer and not a special case.
- **`findResultsBuffer.ts`.** File-header rows map to `null` in `lineMap` today. Per-file replace
  needs those rows to resolve to their file, so the line map (or a parallel map) gains a header
  entry without making header rows open a file.
- **Retained query.** `RightPanelHost` re-runs the search with the live `searchQuery` state today.
  AC 5 needs the query that produced the current results stored alongside `findResultsLineMap`.
- **Styling.** No CSS custom-property layer exists, so copy hex values from an existing rule
  (`[[no-css-custom-property-layer]]`). Dark only.
- **Main thread.** `project_replace` is a sync `#[tauri::command]` and therefore runs on the main
  thread. A single-file or single-match scope is small, but the command keeps the same posture as
  today, so stay within the `sync_commands_do_not_block.rs` guard. Do not add blocking polls.
- **No 3rd-party dependency.** No probe is needed.

## Design priors consulted

- `[PRIOR: new-surface-must-earn-its-place-against-existing-ones]` was applied at 6.1: the
  existing tab gets the buttons and no new panel is built. The operator confirmed this.
- `[PRIOR: paired-actions-need-paired-affordances]` was checked and does not fire. Per-result and
  per-file replace are finer scopes of one action, not an inverse pair.
- `[PRIOR: primary-surface-is-zero-ceremony-not-a-mode]` agrees with the hover ruling: there is no
  "replace mode" to enter, and the search-only view stays as it is.

## Elicitation

**Asked:**
- 6.1, the affordance: hover buttons in the tab, always-visible buttons in the tab, a new results
  panel, or a mockup first? **Answer: hover-revealed buttons in the existing Find Results tab**
  (the recommended option).

**Assumed (not asked, each cheap to reverse):**
- **No confirm dialog for per-result replace.** The row shows exactly what will change, and a
  confirm on every row would defeat the point. **Per-file replace also has no confirm**: the file
  header and its visible rows are the blast radius. Replace All keeps its confirm. If per-file
  turns out to need one, the existing `ConfirmModal` spec pattern makes it a small addition.
- The buttons use the **current** replacement field and the **results'** query (AC 5). They do not
  require the overlay to be open.
- An empty replacement field is allowed and means delete. The tooltip says so.
- After a replace, the re-search keeps the tab's scroll position where practical. If not, the plan
  states that it jumps to the top.
- The refresh after a single-row replace is a full re-search. Incremental row removal would be a
  second source of truth for the results.
- Button copy is `Replace` and `Replace in file`.

## Open Questions

- (none blocking) The CM6 widget versus extended click payload choice for the button seam is a
  plan-level technical decision, not a research unknown.

## Work Tree

- [x] Phase 1: Overlays draw above the editor's find/replace bar (operator side-fix, 2026-11-02)
  **Cause (found at plan):** CM6's base theme gives `.cm-panels` `z-index: 300` (`@codemirror/view`
  `baseTheme`), and nothing around the editor creates a stacking context. So that 300 competes
  directly with `.command-palette-backdrop` (`z-index: 20`, `src/App.css`), which every app overlay
  uses: ⌘P `FileFinder`, ⌘⇧F `ProjectSearch` (both mounted by `RightPanelHost` outside
  `EditorSplit`), the ⌘⇧P `CommandPalette` (portalled to `.workspace-right`), and `PickerOverlay`.
  **Fix:** `isolation: isolate` on `.editor-split`, not on `.editor-pane`. Isolating each pane
  would let a later split pane paint over a CM6 tooltip that overflows from an earlier pane.
  `.editor-split` holds every pane, and every overlay sits outside it.
  **Observable outcomes:**
  - Browser (MCP bridge, dev build): with a file open, CM6's search panel opened
    (`openSearchPanel(view)` or ⌘F), and ⌘P's `FileFinder` open, `document.elementFromPoint` at the
    centre of the `.cm-search` element's rect returns a node whose `closest('.command-palette-backdrop')`
    is non-null. **Positive control:** with the rule removed (or before the edit), the same probe
    returns a node inside `.cm-search`, which proves the probe can see the bug.
  - Browser: the same `elementFromPoint` check passes with the ⌘⇧F `ProjectSearch` overlay and the
    ⌘⇧P `CommandPalette` in place of `FileFinder`.
  - Browser: `getComputedStyle(document.querySelector('.editor-split')).isolation === "isolate"`.
  - Browser: no regression inside the editor. With CM6's search panel open and no overlay,
    `elementFromPoint` at `.cm-search`'s centre is still inside `.cm-search` (the panel still draws
    above the editor text and gutters).
  - CLI: `pnpm verify:auto` exits 0.
  **Alignment questions:**
  - With ⌘P open over an editor whose find bar is open, does the palette now sit fully on top the
    way you wanted?
  - [x] P1.1 Add `isolation: isolate` to `.editor-split` in `src/App.css`, with a comment naming the CM6 `.cm-panels` z-index 300 cause  <!-- status: done -->
  - [x] P1.2 A Vitest guard reading `App.css` via `node:fs` (not `?raw`: `[[vitest-raw-import-css-returns-processed-not-text]]`) asserting the `.editor-split` rule carries `isolation: isolate`. Anchor it on the rule body, and mutation-prove it individually.  <!-- status: done — new editorStackingContext.test.ts; mutation-proven (deleting the declaration fails it) -->
  - [x] verify-auto  <!-- status: done 2026-11-02 — `pnpm verify:auto` EXIT=0 (43s): eslint 0 errors (1 pre-existing warning in XtermPane.tsx, untouched), prettier clean (after formatting the new test), tsc, check:link, vitest 276 files / 3647 tests, cargo fmt, clippy -D warnings, cargo test (lib 1036 passed). Targeted: `vitest run editorStackingContext.test.ts` 2/2; mutation (delete the declaration) → 1 failed. -->
  - [x] verify-self  <!-- status: done 2026-11-02 — driven directly via the MCP tauri bridge (dev build `pnpm tauri:dev`, scratch-b, README.md open, CM6 search panel open via ⌘F). Not via the runner subagent: the bridge tools do not reach subagents ([[mcp-bridge-tools-not-exposed-to-subagents]]). -->
    - [x] outcome: ⌘P FileFinder over the find bar — evidence: `elementFromPoint(centre of .cm-search)` → `LI.command-palette-item`, `closest('.command-palette-backdrop')` non-null, not in `.cm-search`. **Positive control:** inline `isolation:auto` on `.editor-split` → the same point hits `.cm-search` (bug visible); restoring → backdrop again. Screenshot: scratchpad `wp6-p1-finder-over-search.png` (palette covers the find bar's left half).
    - [x] outcome: ⌘⇧F ProjectSearch — evidence: same point → `DIV.project-search-toggles`, in backdrop, not in `.cm-search`.
    - [x] outcome: ⌘⇧P CommandPalette — evidence: same point → `LI.command-palette-item`, in backdrop, `.cm-search` still open beneath.
    - [x] outcome: computed style — evidence: `getComputedStyle(.editor-split).isolation` → `"isolate"`.
    - [x] outcome: no in-editor regression — evidence: with no overlay, the same point → `DIV.cm-search.cm-panel` (find bar still above editor text/gutters).
    - [x] outcome: `pnpm verify:auto` exits 0 — evidence: see verify-auto.
    - [x] align: "With ⌘P open over an editor whose find bar is open, does the palette now sit fully on top?" — evidence CAPTURED: the screenshot above; the dev build is left running on scratch-b for a live look.
  - [x] verify-human  <!-- status: done 2026-11-02 — operator PASS -->
    - [x] P1.verify-human.1 Live look: ⌘P (and ⌘⇧F / ⌘⇧P) over an open CM6 find bar — the overlay sits fully on top?  <!-- status: done — operator "pass" 2026-11-02 -->
  - [x] verify-codify  <!-- status: done 2026-11-02 — new `src/components/workspace/__tests__/overlaysOutsideEditorSplitLive.test.tsx` (3 tests): the REAL RightPanelHost under jsdom + mockIPC, a file open, each of ⌘P / ⌘⇧F / ⌘⇧P fired; asserts exactly one backdrop, its testid is that chord's overlay (identity), it is NOT inside `.editor-split`, and it IS inside `.workspace-right`. Covers the half the CSS guard cannot see: the fix holds only while overlays mount outside the isolated element. Mutation: CommandPalette's portal → inline render fails exactly the ⌘⇧P case (1 failed / 2 passed), file restored (shasum match). Stacking itself is not computable in jsdom; that stays with `editorStackingContext.test.ts` + the verify-self probe. Full `pnpm verify:auto` EXIT=0 (45s): vitest 277 files / 3650 tests, cargo 1075 passed. No integration boundary beyond the overlays themselves, which are the surface the live test drives. -->

- [x] Phase 2: Backend — `project_replace` gains a scope (WBS 6.2)
  **Build note (2026-11-02):** `replace_in_scope` dispatches; `All` calls the unchanged `replace_core`, so every existing Replace All test still runs it directly. File/match scopes resolve the ONE path through `editor_fs::read_file_core` / `write_file_core` (root-confined, read cap, NUL sniff). Match scope matches PER LINE as search did (anchors keep their result-row meaning) and keeps `\r\n` byte for byte. Stale refusals share one variant, `StaleResult`. 12 new tests; two mutants (drop the line-text check; take the first capture instead of the matched one) each fail their tests.
  **Observable outcomes:**
  - CLI: `cargo test --manifest-path src-tauri/Cargo.toml project_search` reports a **non-zero**
    passed count, and its list includes the new tests by name: scope `all` unchanged; `file` touches
    only that file; `match` rewrites exactly one span on a line holding two matches; regex `$1`
    expands against that match's captures; substring mode inserts `$1` literally; stale `line_text`
    refuses and leaves the file byte-identical; a stale offset refuses; a `file` scope with zero
    matches returns the typed no-match result; a path escaping the root is rejected. (A filtered run
    printing `0 passed` counts as a FAIL: `docs/lessons/source-text-guards.md`.)
  - HTTP/IPC (state-changing, `tmp/scratch/scratch-a` only): through the MCP bridge
    `ipc_execute_command`, `project_replace` with
    `scope: {kind:"match", path, line, start, end, line_text}` on a scratch file holding `foo foo`
    on one line leaves `bar foo`, and a following `project_search` returns exactly one remaining
    match on that line. `scope: {kind:"file", path}` replaces every hit in that file and leaves a
    second scratch file's hits alone. Omitting `scope` behaves exactly as today (Replace All).
  - CLI: `pnpm verify:auto` exits 0, including `src-tauri/tests/sync_commands_do_not_block.rs`.
  **Alignment questions:** none (no operator-visible surface in this phase).
  - [x] P2.1 `ReplaceScope` enum (serde-tagged `kind`: `all` / `file {path}` / `match {path, line, start, end, line_text}`), an optional `scope` argument on the `project_replace` command (absent → `all`, so the current caller is byte-identical)  <!-- status: done -->
  - [x] P2.2 `replace_core` routes on scope. `file`/`match` resolve the one path root-confined (reuse `editor_fs` resolution, no walk), with the same `build_regex`, `NoExpand` rule and `write_file_core`. `match` re-reads the file, checks line `line` equals `line_text` and that a match spans exactly `[start,end)`, then rewrites just that span (expanding captures via `Captures::expand` in regex mode)  <!-- status: done -->
  - [x] P2.3 Typed errors: `StaleMatch { file }` ("file changed since the search; search again") and a `file`-scope zero-match result. Use `thiserror` and no `unwrap()` outside tests  <!-- status: done -->
  - [x] P2.4 Unit tests for every case in the CLI outcome above  <!-- status: done -->
  - [x] verify-auto  <!-- status: done 2026-11-02 — `pnpm verify:auto` EXIT=0 (47s): lint, prettier, tsc, check:link, vitest 277 files / 3650 tests, cargo fmt, clippy --all-targets -D warnings, cargo test (lib 1048 passed, +12 new; tests/ incl. sync_commands_do_not_block green). Targeted: `cargo test --lib project_search` 39 passed (non-zero, new names listed); mutants: line-text check removed → 1 FAILED, first-capture instead of matched → 2 FAILED. -->
  - [x] verify-self  <!-- status: done 2026-11-02 — driven directly via the MCP bridge (bridge tools do not reach subagents). Dev build restarted on a clean rebuild first (pid 78521, binary 13:22:00, after the last source restore), so no mutant was live. Integration boundary: the existing `project_replace` IPC command (its signature changed) — driven below. -->
    - [x] outcome (state-changing, scratch-a probe files only, token `wp6probe` grep-confirmed absent elsewhere first): `project_replace` scope `match` on line 2 `wp6probe wp6probe`, first hit — evidence: summary `{files_changed:1, matches_replaced:1}`; re-search shows line 2 = `bar wp6probe` with exactly one match left; `wp6-probe-b.txt` still `wp6probe keep`.
    - [x] outcome: scope `file` on `wp6-probe-a.txt` — evidence: `{files_changed:1, matches_replaced:1}`; re-search returns only `wp6-probe-b.txt`; disk `bar baz`.
    - [x] outcome: stale refusal over IPC (not in the plan's list, added) — evidence: scope `match` with `line_text:"wp6probe EDITED"` → error `"wp6-probe-b.txt changed since the search; search again"`; the file stayed `wp6probe keep` until the next step.
    - [x] outcome: no `scope` argument → Replace All, as today — evidence: `{files_changed:1, matches_replaced:1}`; re-search `[]`; disk `all keep`. Probe files removed afterwards.
    - [x] outcome: `cargo test --lib project_search` non-zero + new names — evidence: verify-auto (39 passed, 12 `scope_*` names listed).
    - [x] outcome: `pnpm verify:auto` incl. `sync_commands_do_not_block` — evidence: verify-auto EXIT=0.
  - [x] verify-human  <!-- status: done 2026-11-02 — zero admissible leaves (Alignment questions: none; no spec decision first visible here — the no-confirm / hover defaults surface in Phase 3); not the last phase; advanced per drive_mode=autopilot (F11) -->
  - [x] verify-codify  <!-- status: done 2026-11-02 — integration boundary = the `project_replace` command; added 4 tests in `project_search/commands.rs` that call the COMMAND fn (absent scope → Replace All; file scope; a match scope built from a real `project_search` row; a stale row → the exact inline error String). Mutant: default `None` → File{a.txt} fails `absent_scope_is_replace_all`, restored by shasum. The 12 `scope_*` core tests from build cover the rest. Full `pnpm verify:auto` EXIT=0 (43s): vitest 3650, cargo lib 1052 passed. -->

- [x] Phase 3: Hover Replace buttons in Find Results + refresh (WBS 6.1 + 6.3)
  **Relevance check (before Phase 3):**
  - Requester still needs this: yes — WP6's core deliverable.
  - Requirements unchanged: yes — 6.1 ruled hover buttons in the tab at spec.
  - Solution still feasible: yes — Phase 2's scopes verified live over IPC.
  - No superior alternative discovered: yes.
  **Verdict:** proceed
  **Build note (2026-11-02):** pure `search/replaceActions.ts` (scope shape, tooltips, one action per target) + `formatFindResults().replaceTargets`; `SyntheticView` gains a generic `lineActions` prop (CM6 widgets, out of the buffer text); `RightPanelHost` keeps the SHOWN buffer + its query in `findResultsShown`, re-renders buttons when the replacement text changes, and `replaceFromResults` always re-searches with the shown query; a busy ref drops double clicks. Side change: the overlay's error row no longer hard-codes "Search failed:" — callers word it, so a replace error reads "Replace failed: …" (Replace All's errors included).
  **Observable outcomes:**
  - Browser (MCP bridge, dev build, workspace on `tmp/scratch/scratch-a`): after a ⌘⇧F search, the
    Find Results tab has one `[data-testid="find-replace-match"]` button per match row and one
    `[data-testid="find-replace-file"]` per file header, and none on the title, blank or footer rows.
    The counts equal the footer's match and file totals. At rest each button's computed `opacity`
    is `0` (or it is `visibility:hidden`). With the row hovered (`:hover` forced via a
    hover-equivalent class, or measured on a real hover), it is visible.
  - Browser (state-changing, scratch-a): clicking a match row's button rewrites only that match on
    disk (read back with `read_file`). The tab re-renders with that row gone and the footer
    decremented by 1. **No** editor tab opens for the file (the row's open handler did not fire),
    shown by the open-tab list before and after.
  - Browser: clicking a match row's **text** (not the button) still opens the file at the match
    (the unchanged click-line path).
  - Browser (state-changing, scratch-a): clicking `Replace in file` rewrites every hit in that file
    and none in the other file. That file's group disappears from the re-rendered tab.
  - Browser: the button's `title` reads `Replace with "<text>"`, or `Delete match` when the
    replacement field is empty, using the replacement field's **current** value.
  - Browser: after editing the **query** field without re-searching, a row's button still replaces
    the original query's match (it uses the stored results query, per AC 5).
  - Browser (state-changing, scratch-a): edit the matched line on disk after the search, then click
    its button. Nothing is written (file bytes unchanged), the ⌘⇧F overlay opens with the inline
    error containing "changed since the search", and the tab re-renders from a fresh search.
  - Browser: Replace All still opens its blast-radius confirm and behaves as before.
  - CLI: `pnpm verify:auto` exits 0.
  **Alignment questions:**
  - Hover buttons in action: now that you see them, is hover-only reveal still what you want, and
    are `Replace` / `Replace in file` the right labels and placement?
  - No confirm on per-result or per-file replace (a spec **Assumed** default): now that you have
    used it, is per-file without a confirm still acceptable?
  - (decision) When a per-row replace fails while the ⌘⇧F overlay is closed, I re-open the overlay
    so its existing inline error row shows the message (reusing a surface rather than adding a
    banner to the tab). Is that the right place for it?
  - [x] P3.1 `SyntheticView`: a generic, optional `lineActions` prop (per buffer line: label, title, testid, onClick), rendered as CM6 widget decorations (real `<button>`s outside the buffer text). A widget mousedown must not reach the row's `onLineClick` (stop it in the widget plus `ignoreEvent`, and check that the view-level `domEventHandlers.mousedown` is actually skipped). Hover reveal via CSS on `.cm-line:hover`, with hex values copied from an existing rule (`[[no-css-custom-property-layer]]`)  <!-- status: done -->
  - [x] P3.2 Thread `lineActions` through `EditorSplit.addSynthetic` / `setSyntheticContent` and `PaneTabs` to `SyntheticView` (alongside the existing `onLineClick` / `highlights` plumbing)  <!-- status: done -->
  - [x] P3.3 `findResultsBuffer.ts`: emit a per-line action descriptor. A file header maps to `{kind:"file", file}` and a match row to `{kind:"match", file, match}`, while `lineMap` stays as-is so header clicks still open nothing  <!-- status: done -->
  - [x] P3.4 `RightPanelHost`: store the query that produced the current results (`findResultsQuery` ref, set in `handleSearchResults`). The action handler invokes `project_replace` with the scope, the stored query and the current `replacement`, then **always** re-runs `project_search` with the stored query through the same result→tab path (6.3). On error it calls `setSearchError` and opens the overlay  <!-- status: done -->
  - [x] P3.5 Tests: `findResultsBuffer` action mapping (identity, not just length: each action's file/match equals its row's; title/blank/footer rows carry none). A jsdom render of `SyntheticView` with `lineActions` (per `liveWorkspace.tsx` / `renderToStaticMarkup` precedent) asserting the buttons render on exactly the action lines, and that a button click fires its action and NOT `onLineClick`  <!-- status: done -->
  - [x] verify-auto  <!-- status: done 2026-11-02 — `pnpm verify:auto` EXIT=0 (35s): eslint 0 errors (the 1 pre-existing XtermPane warning), prettier, tsc, check:link, vitest 279 files / 3662 tests (+12: findResultsBuffer targets ×2, replaceActions ×6, syntheticLineActions ×4), cargo 1052. Mutation: widget click guard — each of `ignoreEvent`/mousedown-`preventDefault` alone survives (redundant guards), BOTH removed → the no-onLineClick test fails; positive control: jsdom does fire onLineClick on a plain line (reports line 1). -->
    - [x] re-run after P3.6 — `pnpm verify:auto` EXIT=0 (37s): vitest 280 files / 3666 tests (+4 `searchPanelTextAssist`), cargo 1052, lint 0 errors (same pre-existing warning).
  - [x] verify-self  <!-- status: done 2026-11-02 — driven directly via the MCP bridge on the dev build (fresh process after the Phase 2 rebuild; frontend from that boot, no stale HMR). Workspace scratch-a; probe files `wp6-a.txt` (`top / wp6probe one / wp6probe two wp6probe`) + `wp6-b.txt` (`wp6probe b`), created and later reset by the agent. Integration boundary: the existing Find Results tab + ⌘⇧F overlay + `project_replace` — all driven below through the real UI. Clicks are DOM-dispatched (mousedown + click on the button; a row click via mousedown at the row's real coordinates); a real OS-pointer hover was NOT used (it would move the operator's cursor) — the hover look is the alignment leaf. -->
    - [x] outcome: buttons per row/header, none elsewhere — evidence: after a ⌘⇧F search, 4 `find-replace-match` (buffer lines 4,5,6,9) + 2 `find-replace-file` (lines 3,8) vs footer `4 matches across 2 files`; none on title/blank/footer; buffer text with buttons removed equals the formatter's lines verbatim.
    - [x] outcome: hidden at rest, revealed on hover — evidence: every button `visibility: hidden` at rest; live stylesheet holds `.cm-synthetic-action-line:hover .cm-synthetic-line-action, .cm-synthetic-line-action:focus-visible { visibility: visible }`; each button's `.cm-line` carries `cm-synthetic-action-line` and is `position: relative`; button sits 8px from the row's right edge, vertically inside the row. Screenshot with two rows forced visible: scratchpad `wp6-p3-buttons.png`.
    - [x] outcome (state-changing, scratch-a): match button replaces only that match, no file tab opens — evidence: line 5 `Replace` (title `Replace with "NEW"`) → disk `NEW two wp6probe` (second hit and other lines intact); tab re-rendered, footer 4 → 3; open tabs before `["Find Results"]`, after `["Find Results"]`.
    - [x] outcome: row TEXT click still opens the file — evidence: mousedown at line 4's coordinates → tabs `["Find Results","wp6-a.txt"]`, active `wp6-a.txt`.
    - [x] outcome (state-changing): `Replace in file` — evidence: title `Delete every match in wp6-a.txt`; disk wp6-a `NEW two ` (all its hits gone), wp6-b untouched; group gone, footer `1 match across 1 file`.
    - [x] outcome: title follows the CURRENT replacement — evidence: replacement `NEW` → `Replace with "NEW"`; emptied without re-searching → titles became `Delete match` / `Delete every match in <file>`.
    - [x] outcome: buttons use the RESULTS' query, not the edited field — evidence: query field changed to `zzz` (no search), clicked line 4 → disk `wp6probe one` → ` one`; re-rendered header still `Searching 2 files for "wp6probe"`.
    - [x] outcome (state-changing): stale row refused — evidence: wp6-b rewritten on disk to `wp6probe CHANGED`, its button clicked → shasum unchanged (3e23c9e…), overlay opened with `Replace failed: wp6-b.txt changed since the search; search again`, tab re-rendered showing `1:  wp6probe CHANGED`.
    - [x] outcome: Replace All unchanged — evidence: Search → Replace All → confirm `Replace 1 match in 1 file with "R"? This rewrites files on disk…` → dialog's Replace All → disk `R CHANGED`, tab `No matches`, no error.
    - [x] outcome (bonus, spec AC 8): an open CLEAN buffer reloads — evidence: activating the `wp6-a.txt` tab showed `top /  one / NEW two `, not dirty.
    - [x] outcome: `pnpm verify:auto` — evidence: verify-auto EXIT=0.
    - [x] align: hover buttons in action — evidence CAPTURED: `wp6-p3-buttons.png`; live in the dev build (scratch-a, probe files reset for a fresh try).
    - [x] align: no confirm on per-result / per-file — evidence CAPTURED: both clicks above replaced immediately with no dialog.
    - [x] align (decision): a failure with the overlay closed re-opens the overlay to show the error — evidence CAPTURED: the stale case above (overlay was closed; it opened with the error row).
    - [x] re-check after P3.6 (CM6 find bar, live) — evidence: webview reloaded (fresh code, no stale HMR), scratch-a, `wp6-a.txt` open, ⌘F → `.cm-search` `search` + `replace` both `spellcheck=false autocorrect=off autocapitalize=off autocomplete=off`. Positive control: the same read on the pre-fix build (P3.verify-human.4 diagnosis) returned null for all four.
  - [x] verify-human  <!-- status: done 2026-11-02 — all 4 leaves operator-approved -->
    - [x] P3.verify-human.1 Happy path live: ⌘⇧F in scratch-a, hover rows, Replace / Replace in file — hover-only reveal, labels, placement, empty-field-means-delete still what you want?  <!-- status: done — operator pass 2026-11-02 -->
    - [x] P3.verify-human.2 No confirm on per-result / per-file (spec Assumed) — still acceptable now you've used it?  <!-- status: done — operator pass 2026-11-02 -->
    - [x] P3.verify-human.3 (decision) failure with the overlay closed re-opens the overlay to show the error  <!-- status: done — operator chose A (re-open the overlay) 2026-11-02 -->
    - [x] P3.verify-human.4 Operator-reported: the CodeMirror in-editor find/replace bar (⌘F) autocorrects like the old picker filter  <!-- status: done — operator pass 2026-11-02 after the P3.6 fix (real typing in the ⌘F bar stays as typed). Original diagnosis: confirmed live: `.cm-search` inputs `search` + `replace` carry NONE of spellcheck/autocorrect/autocapitalize/autocomplete (the ⌘⇧F overlay's fields DO — they spread NO_TEXT_ASSIST). CM6 renders that panel itself, so WP5's JSX spread never reached it. Fix in build: apply the same four attributes to the CM6 search panel's text inputs. -->
    - [x] P3.6 (back-loop fix for P3.verify-human.4) `editor/searchPanelTextAssist.ts`: an `EditorView.updateListener` stamping `NO_TEXT_ASSIST`'s attributes (derived from it, one source) onto `.cm-search` text inputs; added to all THREE surfaces with a find panel — file editor (`buildEditorExtensions`), Prompt panel (`promptExtensions`; the prose draft itself untouched), Find Results (`SyntheticView`, via basicSetup). Test `searchPanelTextAssist.test.tsx` opens the REAL panel on each real extension set; removing the extension from each surface INDIVIDUALLY fails exactly that surface's test (3/3), files restored by shasum.  <!-- status: done -->
  - [x] verify-codify  <!-- status: done 2026-11-02 — integration boundary = the Find Results tab + ⌘⇧F overlay in `RightPanelHost`; new `src/components/workspace/__tests__/findResultsReplaceLive.test.tsx` (4) drives the REAL host (overlay → search → tab → button) with mocked IPC: a row button sends its own `match` scope + current replacement + the results' query, then re-searches with that query; a file button sends its own `file` scope; an edited query field is ignored, an emptied replacement is honoured; a refused replace still re-searches and opens the overlay with `Replace failed: …`. Mutants (individually): live query instead of shown → 1 failed; no re-search → 4 failed; restored by shasum. Already covered at build: buffer targets, `replaceActions`, `SyntheticView` buttons (with the double-guard measurement), `searchPanelTextAssist` (3 surfaces). Full `pnpm verify:auto` EXIT=0 (41s): vitest 281 files / 3670 tests, cargo 1052. -->

## Current Node
- **Path:** Feature > ship
- **Active scope:** ship
- **Blocked:** none
- **Unvisited:** none after Phase 3
- **Open discoveries:** none

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
- [SURFACED-2026-11-02] feature-spec — wbs.md exceeds size guard (469 lines); only the WP6 section + headings were read (the WP was the load-bearing part).
