---
drive_mode: autopilot
---

# Feature: WP12 — Editor multi-file tab strip (Sublime-style open-file tabs)

**Workflow:** feature
**State:** verify-codify (all phases complete) — ready to ship
**Created:** 2026-06-21
**Entry:** spec (complex feature)
**Milestone:** Milestone 2 (Lite Editor + Diff Viewer)
**WBS:** `docs/product/wbs.md` → `### WP12`
**Source:** SURFACE-2026-06-21-EDITOR-MULTI-FILE-TAB-STRIP (P11 SURFACE-IN from WP7 Phase-2 verify-human). WP7 is paused on this WP.

## Problem Statement

Claudesk's editor opens **one file at a time**: `RightPanelHost` holds a single `openPath: string | null`, and opening a new file (via the Cmd+P finder, the file tree, or the diff "Open") *replaces* the current one — there is no way to have several files open and switch between them. WP3c's split panes are viewports onto that **single** shared document, not independent files (independent-file-per-pane was explicitly deferred → SURFACE-2026-06-20-WP3C-INDEPENDENT-FILE-SPLIT). This is unlike every real editor (Sublime, VS Code) where open files live in a **tab strip** across the top of the editor and you click between them.

This gap surfaced as a hard dependency: at WP7 Phase-2 verify-human the operator confirmed project-wide search works but redirected its result UX to the Sublime **"Find Results" tab** model — a temp result buffer that lives *as a tab* in the editor, which you click through to open files. That presupposes a multi-file tab strip that doesn't exist. WP12 builds it: a row of open-file tabs with per-tab editor state, plus a **synthetic read-only buffer** hook (a tab whose content is supplied programmatically, not read from disk) that WP7's Find Results tab — and future synthetic views — plug into. WP7 resumes after WP12 ships.

**[Updated 2026-06-21 — F23 re-plan from Phase-2 verify-human]:** the root problem is unchanged (still "multi-file open tabs"), but the **containment model is inverted**. The first Phase-2 build made the model **tabs > panes** (one tab strip; the active tab owns a WP3c pane layout). At verify-human the operator approved checks 1–7 but redirected check 8: the tab strip must live **inside each pane** — the VS Code **split-editor-group** model where **panes are top-level and EACH pane owns its own tab strip + its own ordered open-file set + its own active file**. A file can be open in two panes independently; ⌘N / open / close act on the **focused pane's** strip. This supersedes the spec's "per-tab split-pane layout" acceptance criterion (which had panes nested under a tab) with "**per-pane open-file set + tab strip**" (tabs nested under a pane). Phase 2 is being re-planned to this model; the Phase-1 pure pieces (openFiles reducer, stat_file, confirmDialog) are reusable — the reducer now models ONE pane's tab set, instantiated per pane.

**[Updated 2026-06-21 — F23 re-plan #2 from Phase-2 verify-human P2.vh.9]:** the per-pane split model is right, but the BUFFER OWNERSHIP is wrong. The current build mounts a fully independent `EditorPanel` (own `doc`/`savedDoc`/`dirty`) per (pane, tab), so the SAME file open in two panes has TWO separate buffers — edits don't mirror. The operator requires the VS Code model: same file in two panes = **two views of ONE shared document** (edit in pane 1 reflects live in pane 2; dirty + save are document-level). Decision (Option 1, weighed 2026-06-21): lift the buffer (doc/savedDoc/dirty/language + the disk marker) OUT of `EditorPanel` into a **per-workspace shared document store keyed by file path**; a tab in any pane is a VIEW onto that path's store entry (cursor/scroll stay per-view). This is the model Phase 3 (disk-change, per-document marker) and WP7 (Find Results) want anyway. The known WP3c shared-doc cursor-reset (two `@uiw/CodeMirror` on one `value`) re-applies to the same-file-in-2-panes case — handle/accept it (its proper fix is a shared CM6 `EditorState`, a follow-up). Phases 3/4 re-key off the store (per-path), not per-(pane,tab).

**Chord reservation (operator, 2026-06-21):** `⌘⇧+digit` is RESERVED for future workspace/filmstrip switching (Phase 2 of the product roadmap / a later milestone). WP12's tab-switch chord is **bare ⌘+digit** (`tabSwitchChord.ts`) — already disjoint from `⌘⇧+digit`, so no conflict; this is recorded in the chord-ownership map so a later WP doesn't claim `⌘⇧+digit` for something else.

## User Stories

- As the operator, I want multiple files open as tabs across the top of the editor so that I can switch between the files I'm working on without losing my place (the Sublime/VS Code model).
- As the operator, I want each open tab to keep its own unsaved edits, cursor, and scroll while I'm on other tabs so that switching tabs never loses work or my position.
- As the operator, I want Claudesk to notice when a file I have open changed on disk (e.g. Claude Code edited it) and reload it — or, if I also have unsaved edits, ask me which copy to keep — so that I never silently overwrite or stare at a stale buffer.
- As the operator, I want closing a tab with unsaved changes to ask me first (save / discard / cancel) so that I don't lose work by misclicking the ×.
- As the operator (via WP7 later), I want a "Find Results" tab to appear as a read-only tab in this strip so that search results behave like Sublime's results buffer.

## Acceptance Criteria

**Open-files model + tab strip:**
- The editor shows a **tab strip** above the editor panes: one tab per open file (project-relative path / filename label), an active-tab highlight, and a close (×) per tab. Distinct from the existing `right-panel-toggle` panel-select row (Editor/Diff/Sublime) — this is the *open-file* strip inside the Editor panel.
- Opening a file (Cmd+P finder, file tree, diff "Open", or WP7 search-result open later) **adds-or-activates** its tab: if the file is already open, it activates that tab (and applies any open-at-match highlight target); if not, it opens a new tab and activates it. No more silent replace-the-only-file.
- Clicking a tab activates that file (its buffer + panes become front). Closing a tab removes it; closing the active tab activates a sensible neighbor; closing the last tab returns the editor to its "No file open" empty state.
- A keyboard switch exists (⌘1..⌘9 to activate the Nth tab and/or ⌘⇧[ / ⌘⇧] to cycle — exact binding decided at build, honoring the chord-ownership map; must coexist with CM6 focus via the WP1 capture-phase pattern and not collide with existing chords).

**Per-tab state:**
- Each open tab retains its own **buffer (doc), dirty flag, saved snapshot, cursor, and scroll** in memory while open — switching tabs does NOT re-read from disk or lose unsaved edits. A dirty tab shows an unsaved indicator (e.g. a dot) on the tab.
- **Per-tab split-pane layout:** each tab remembers its own WP3c split layout (tab A split into 2 viewports, tab B single) — switching tabs restores that tab's pane layout. (This subsumes the deferred independent-file-split: panes within a tab are viewports onto *that tab's* file.)

**Disk-change detection + conflict resolution (Sublime model):**
- On **tab activation** and **before a save**, the backend re-checks the file on disk (mtime + size, or a content hash) against what was loaded into the tab.
  - Disk unchanged → nothing happens.
  - Disk changed **and the tab's buffer is clean** (no unsaved edits) → **silently reload** the tab from disk (update buffer + saved snapshot).
  - Disk changed **and the tab's buffer is dirty** → show a **conflict popup**: keep my (in-memory) copy, or load the disk copy. The chosen copy becomes the buffer; the other is discarded. (No silent overwrite either direction.)
- A save writes the in-memory buffer; after a successful save the stored disk-state marker (mtime/hash) updates so the next activation doesn't false-positive a conflict.
- No filesystem watcher is added (the live `notify` watcher remains a later-milestone concern) — detection is the synchronous on-activate/on-save check only. A file changing on disk while its tab is *backgrounded and untouched* is caught when you next switch to it.

**Close guard:**
- Closing a tab with unsaved changes prompts a confirm (save / discard / cancel). Cancel keeps the tab; discard closes without saving; save writes then closes. A clean tab closes immediately with no prompt.

**Synthetic read-only buffer hook (the WP7 seam):**
- The tab model supports a **synthetic read-only tab**: a tab whose content is supplied in-memory (not via `read_file`), marked read-only (no editing, no save, no disk-change check), with a programmatic API to (re)set its content and a **click-line → callback** hook (so WP7 can map a clicked result line to an open-file-at-match action). Build it generic — WP7 is the first consumer, not a special case baked into the tab model.

**Engineering:**
- The open-files state is a **pure reducer** (vitest-testable, no React/DOM — mirrors `editorPanes.ts` / `treeState.ts`): add/activate/close/close-active/last-file/activate-by-index, with per-tab metadata (path, dirty, pane-layout ref, synthetic flag). Disk-state markers + the conflict decision are pure where possible.
- Backend: a `file_stat`-style command (or extend `editor_fs`) returning the disk marker (mtime + size or hash) so the frontend can compare — pure-fn core + thin Tauri command, errors surfaced as `String` (the WP6 lesson). Reuses the existing `read_file`/`write_file`.
- Existing open seams (Cmd+P finder `onOpen`, file tree `onOpen`, diff `onOpenInEditor`, and the WP7 open-at-match target) are migrated to the open-files model **without behavior regression** for the single-file flows.
- Gates green: `cargo test` + clippy + fmt; `pnpm test` (vitest) + tsc + eslint + prettier.

## Out of Scope

- **A live filesystem watcher** (`notify`/`tauri-plugin-fs-watch`) — disk-change detection is the synchronous on-activate/on-save check only. Live background tab updates are a later-milestone (Phase-2 watcher) concern.
- **Tab reordering by drag**, tab pinning, tab groups, split-the-window-by-tab (two tab strips side by side). v1 is a single ordered tab strip. Drag-reorder is a reasonable follow-up but not v1.
- **Session persistence of open tabs** across app restarts (reopen-last-files). v1 tabs are in-memory for the session.
- **WP7's Find Results rendering itself** — WP12 only provides the synthetic-read-only-buffer hook; WP7 (resumed) builds the actual results buffer + click-through on top of it.
- Any change to the search backend, diff, finder, or file-tree beyond migrating their open-seam calls to the tab model.

## Technical Constraints

- **Current single-file model to refactor:** `RightPanelHost` owns `openPath: string | null` + `highlightTarget`; `EditorPanel` owns the panel-level buffer (`doc`/`savedDoc`/`load`/`save`/language/fontSize) and the WP3c pane reducer (`editorPanes.ts`, shared-document). WP12 lifts "the open file + its buffer/panes" into a **per-tab** structure: the active tab's buffer/panes render where the single buffer renders today. Keep `EditorPanel`'s CM6 mounting + the WP7 `highlightTarget` open-at-match effect; re-key them to the active tab.
- **Panes × tabs:** per-tab pane layout (operator-chosen) — each tab carries its own `PanesState` (the existing `editorPanes.ts` reducer, reused per-tab). Switching tabs swaps which `PanesState` + buffer is live. The `viewsRef` (WP7 EditorView capture) must re-key per active tab.
- **Disk-change detection:** synchronous backend marker check (mtime+size or hash) on tab-activate + pre-save; conflict popup only when dirty AND disk changed. No watcher. Reuses `editor_fs` read/write.
- **Chord coexistence (WP1 pattern):** any tab-switch keyboard binding uses the capture-phase document listener so it fires with focus inside CM6, and must not collide with ⌘P / ⌘⇧P / ⌘⇧E·D·T / ⌘⇧F / ⌘F / ⌘S / ⌘= etc. (update the chord-ownership map in `paletteCommands.ts`).
- **Dark-only UI** — tab strip styled with existing dark tokens in `App.css`; no light variant.
- **No 3rd-party service / external API** — all in-process (Rust fs stat + React state). No probe required.
- **Reconciles the deferred SURFACE-2026-06-20-WP3C-INDEPENDENT-FILE-SPLIT** — per-tab files + per-tab pane layout is the realization of independent-file editing; close that SURFACE when WP12 ships.

## Open Questions

- [ ] None blocking — all spec-time decisions settled (per-tab in-memory buffers WITH on-disk change detection + conflict popup; per-tab pane layout; confirm-before-close-dirty; synchronous mtime/hash detection, no watcher). Plan/build-time mechanics to settle in `feature-plan`: (a) exact disk marker — mtime+size vs content hash (hash is robust to same-mtime edits but costs a read; lean mtime+size with a hash fallback, decide at build); (b) the tab-switch keybinding (⌘1..9 and/or ⌘⇧[ ]); (c) how much of the conflict/close-confirm popups are new overlay components vs reusing the command-palette overlay chrome; (d) exact per-tab state shape (how `EditorPanel`'s current panel-level buffer + `editorPanes.ts` get keyed by tab).

## Plan decisions (settled at plan-time)

Resolving the four plan/build-time mechanics from the spec's Open Questions:

- **(a) Disk marker = `mtime_ms` + `size` (no content hash).** A `stat_file` backend command returns `{ mtime_ms: f64, size: u64 }` from `fs::metadata`. Cheap (no file read), and a same-mtime+same-size silent edit is a vanishingly rare case for a single-user local tool where the writer of record is Claude Code (which always changes size or mtime). Hash is explicitly NOT added — it costs a full read on every tab activation. (If a same-mtime collision ever bites in dogfood, a hash fallback is a localized follow-up.) `mtime` as `f64` ms-since-epoch avoids serde `SystemTime` shape friction; the frontend only ever compares markers for equality, never interprets the value.
- **(b) Tab-switch keybinding = `⌘1`..`⌘9` (activate Nth tab; `⌘9` = last).** Bare-⌘+digit is unused by CM6, the browser, and every existing app chord (the chord map owns ⌘⇧-letters + bare ⌘P/F/R/S/D/=). No Shift, so it can't collide with the ⌘⇧ panel-select family. `⌘9` follows the browser/Sublime convention of "last tab" rather than literally the 9th. Cycle chords (⌘⇧[ ]) are NOT added in v1 — direct ⌘N covers the daily gesture; cycling is a cheap follow-up if dogfood wants it. Registered via the WP1 capture-phase document listener (fires with focus inside CM6), gated on `visible`, living in `RightPanelHost` alongside the existing chord listener. Added to the chord-ownership map in `paletteCommands.ts`.
- **(c) Conflict + close-confirm popups = a small new generic `<ConfirmDialog>` overlay, NOT the command-palette chrome.** The palette overlay is a filter-list widget; a modal yes/no/cancel is a different shape. Build one tiny dark-styled modal component (title + message + 2–3 labeled buttons + Esc=cancel) reused by both the dirty-close guard and the disk-conflict prompt. Its decision logic (which buttons, what each returns) is a pure helper so it's vitest-testable apart from the DOM.
- **(d) Per-tab state shape.** A tab is `{ id, kind: "file" | "synthetic", path, label }` in the pure reducer (`openFiles.ts`); the *mutable editor state* per tab (buffer `doc`/`savedDoc`, language `override`, `PanesState`, the `viewsRef` map, the disk marker, save lifecycle) lives in a `Map<tabId, TabEditorState>` held in `EditorPanel` (a ref-backed store, since CM views are imperative). The reducer holds only the ordered tab list + active id + per-tab metadata (dirty flag, kind, label) — the serializable, testable part. `EditorPanel` renders the **active** tab's buffer/panes exactly where it renders the single buffer today; switching the active tab swaps which entry in the Map is live. Font size stays panel-global (already persisted globally — not per-tab). This keeps the existing `editorPanes.ts` reducer reused **per tab** (each tab owns a `PanesState`), satisfying per-tab pane layout with zero changes to that reducer.

## Work Tree

- [x] Phase 1: Open-files reducer + backend disk-marker command  <!-- status: done — impl P1.1–P1.3 + full verify loop complete; vitest 254, cargo 111, gates clean -->
  **Relevance check (before Phase 2):**
  - Requester still needs this: yes — WP12 gates WP7's paused resume; operator launched it this session.
  - Requirements unchanged: yes — spec decisions settled; Phase 1 confirmed the reducer/marker/dialog shapes the UI builds on.
  - Solution still feasible: yes — Phase 1 verified `openFiles.ts` + `stat_file` + `confirmDialog.ts` all land cleanly; the code structure read in plan matches.
  - No superior alternative discovered: yes — the per-tab Map + reused panes reducer is the natural extension of the existing model.
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: `cargo test` passes including new `stat_file_core` tests (existing-file marker, missing-file Io error, path-escaping-root rejected); `cargo clippy -- -D warnings` + `cargo fmt --check` clean.
  - CLI: `pnpm test` passes including a new `openFiles.test.ts` suite (open-adds, open-existing-activates, close, close-active-picks-neighbor, close-last-empties, activate-by-index, synthetic-tab add); `pnpm tsc --noEmit` + eslint + prettier clean.
  - CLI: `node -e "require('./...')"`-style not applicable (TS) — the reducer's behavior is fully covered by the vitest suite above (pure module, no DOM).
  - [x] P1.1 Pure `openFiles.ts` reducer (mirrors `editorPanes.ts` posture): `OpenFile { id, kind: "file"|"synthetic", path: string|null, label }`, `OpenFilesState { tabs, activeTabId }`; events `open-or-activate` (file path → activate if already open, else add+activate), `add-synthetic`, `close`, `activate`, `activate-index` (1-based, clamped; N=9→last), `set-dirty`. Last-pane-style guards (close-active picks neighbor; close-last → empty state). Caller supplies tab ids (no Date/random), same as `editorPanes.initialPanesState`. — 24 vitest cases.  <!-- status: done -->
  - [x] P1.2 Backend `stat_file`: `stat_file_core(root, requested) -> Result<FileMarker, EditorFsError>` reusing `resolve_within`; `FileMarker { mtime_ms: f64, size: u64 }` (serde, snake_case end-to-end — the IPC-DTO lesson) from `fs::metadata`; thin `stat_file(root, path) -> Result<FileMarker, String>` command. Registered in `lib.rs` invoke_handler. — +4 cargo tests (111 total).  <!-- status: done -->
  - [x] P1.3 Pure `confirmDialog.ts` decision helper (button set → outcome) used later by the close-guard + conflict popup; `closeDirtySpec` (save/discard/cancel, Esc→cancel) + `conflictSpec` (keep-mine/load-disk, Esc inert). — 5 vitest cases.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — scoped: openFiles 22 + confirmDialog 5 vitest, cargo editor_fs 15 (incl. 4 stat), tsc/eslint clean -->
  - [x] verify-self  <!-- status: done — subagent re-confirmed all 3 CLI outcomes PASS (cargo 111, vitest 254, clippy/fmt/tsc/eslint/prettier clean). No integration boundary — isolated new artifacts only. -->
  - [x] verify-human  <!-- status: done — AUTO-SKIPPED (drive_mode=autopilot, no integration boundary, verify-self all-PASS). Isolated new artifacts only: openFiles.ts + confirmDialog.ts (imported nowhere yet) + stat_file command (called by nothing yet); all wired in Phase 2. -->
  - [x] verify-codify  <!-- status: done — behavior codified test-first in build (22 openFiles + 5 confirmDialog vitest + 4 cargo stat); no coverage gaps, no new tests needed. Full suites green: vitest 254, cargo 111, no regressions. No integration boundary. -->

- [x] Phase 2: Per-pane tab strips (VS Code split-editor-group) + open-seam migration  <!-- status: done — all impl + verify complete (tab strip, ⌘1..9, split-persist, open-seam migration); buffer sharing handled in Phase 2S -->
  **Plan refinement (P2.2 — recorded at build):** Instead of a `Map<tabId, TabEditorState>` inside `EditorPanel`, I mount **one `EditorPanel` per file tab** (display-toggled, only the active one shown) in a new `EditorTabs` host. React's per-instance state IS the per-tab store — buffer/cursor/scroll/`editorPanes` layout all persist per tab for free, reusing the established "stay mounted, toggle display" rule (workspace + panel host). This is simpler than a manual Map and required ~zero change to `EditorPanel`'s internals (added only `onDirtyChange` + `registerSave` callback props). The open-files reducer lives in `EditorTabs`, driven from `RightPanelHost` via an imperative handle (`openFile` / `activateIndex`). Same observable outcomes.
  **[REVISED 2026-06-21 — F23 re-plan to per-pane tab strips (VS Code split-editor-group model)].** Containment inverted from **tabs>panes** to **panes>tabs**: panes are top-level; EACH pane owns its own tab strip + ordered open-file set + active file (a file can be open in 2 panes independently — finally realizes SURFACE-2026-06-20-WP3C-INDEPENDENT-FILE-SPLIT). ⌘N / open / close act on the **focused pane**. The first build's `EditorTabs` (one global strip) is reworked: it becomes `PaneTabs` (ONE pane's strip + its EditorPanels), and a new top-level `EditorSplit` owns the `editorPanes` reducer (pane list + focused pane) + a `Map<paneId, OpenFilesState>` and renders N `PaneTabs`. The per-`EditorPanel` internal pane reducer (WP3c shared-doc viewports) is REMOVED — its Split/close controls move up to `EditorSplit`; each `EditorPanel` now renders exactly one file's buffer (no internal split). The Phase-1 `openFiles` reducer is reused unchanged, now modeling ONE pane's tab set. Design-approved checks 1–7 (single-pane tab behavior) carry forward verbatim — they hold within each pane; check 8 is replaced by the split-group checks below.
  **Observable outcomes:**
  - Browser (native `pnpm tauri dev` — file open needs the backend): opening two files shows TWO tabs in the focused pane's tab strip; clicking a tab fronts its file; editing tab A, switching to B and back preserves A's unsaved text + cursor; a dirty tab shows the ● dot.
  - Browser: closing a clean tab activates a neighbor; closing the last tab in the ONLY pane → "No file open" empty state; closing a DIRTY tab → save/discard/cancel confirm (cancel keeps it).
  - Browser: pressing ⌘2 activates the 2nd tab IN THE FOCUSED PANE (with focus inside CM6); no JS console errors.
  - Browser (the split-group model — the redirect): splitting the editor creates a SECOND pane with its OWN tab strip; opening a file in pane 2 does NOT touch pane 1's tabs; the SAME file can be open in both panes with independent buffers/cursors; ⌘N + close act on the focused pane only; closing a pane's last tab collapses that pane (the other pane remains).
  - CLI: `pnpm test` + tsc + eslint + prettier clean (reducers from P1 + the new `EditorSplit`/`PaneTabs` wiring; live behavior is the browser outcomes).
  - [x] P2.1 `EditorSplit` top-level — owns the reused `editorPanes` reducer (pane list + focused `activePaneId`) + a `Map<paneId, PaneTabsHandle ref>` + `Map<paneId, activePath>`. Renders N `PaneTabs` stacked vertically (half-width budget; same direction as old WP3c). Imperative handle: `openFile`/`activateIndex` route to the focused pane; `splitPane`/`closePane` manage the pane list; an emptied non-sole pane auto-collapses. Reports the focused pane's active path up.  <!-- status: done -->
  - [x] P2.2 `PaneTabs` (reworked from `EditorTabs`, scoped to ONE pane) — own `openFiles` reducer instance + tab strip + one mounted `EditorPanel` per file tab (display-toggled → per-tab buffer/cursor/scroll persist). `onFocusCapture`/`onMouseDownCapture` → `onFocusPane` marks it the focused pane. `highlightTarget` applied to active tab only. Dirty → `set-dirty`; save → `registerSave`; emptiness → `onEmptyChange`.  <!-- status: done -->
  - [x] P2.3 Removed the per-`EditorPanel` internal pane model — dropped the `editorPanes` reducer + Split button + pane-close + pane-keyed `viewsRef` Map from `EditorPanel`; it now renders exactly ONE CM6 view for one file (`viewRef`). Split/close-pane moved up to `EditorSplit`. WP7 highlight effect re-pointed at the single `viewRef`. WP3c shared-doc viewports superseded by independent-file panes.  <!-- status: done -->
  - [x] P2.4 Tab-strip UI + dirty-close guard — `.editor-tab-strip` per pane (dark tokens, basename label + full-path title, active highlight, ● dirty dot, ✕ close); dirty-close → `<ConfirmModal closeDirtySpec>`. New `.editor-split`/`.editor-split-pane` CSS: stacked panes, top divider between panes, focused-pane inset accent, floating pane-close ✕ (only when >1 pane).  <!-- status: done -->
  - [x] P2.5 ⌘1..⌘9 → focused pane — `RightPanelHost` routes `activateIndex(n)` → `EditorSplit` → focused pane's `PaneTabs`. `tabSwitchChord.ts` + chord-ownership map unchanged (bare ⌘+digit; ⌘⇧+digit RESERVED for filmstrip — now documented in the chord map). Exclusivity matrix still green (37 chord tests).  <!-- status: done -->
  - [x] P2.6 Open-seam migration — finder/tree/diff/WP7-search all flow through `RightPanelHost.openFile` → `editorSplitRef.openFile` → focused pane (unchanged call sites). FileTree highlights the focused pane's active file (`onActivePathChange` chain EditorSplit→RightPanelHost→FileTree). One pane + one open = identical to pre-WP12.  <!-- status: done -->
  - [x] P2.7 Split opens a PERSISTENT empty pane (operator decision 2026-06-21) — `EditorSplit` now tracks an `everFilled: Set<paneId>`; `onEmptyChange` collapses a pane only when it's empty AND was previously filled (DRAINED) AND another pane survives. A freshly-split pane (never filled) PERSISTS showing "No file open"; closing its last tab (drained) still auto-collapses; the sole pane always stays. Re-verified in-browser: Split → 2 persistent empty panes (each with ✕); close ✕ → back to 1, ✕ gone. The discriminator is ref-state across callbacks (not cleanly pure → no isolated vitest unit; the `editorPanes split/close` reducer it sits on is already 14-test covered; behavior is browser-verified).  <!-- status: done -->
  - SURFACED — independent same-file-in-two-panes now works → realizes SURFACE-2026-06-20-WP3C-INDEPENDENT-FILE-SPLIT (close it at finalize). The old `EditorTabs.tsx` (first-build tabs>panes) was deleted.  <!-- status: SURFACED: WP3C-INDEPENDENT-FILE-SPLIT realized -->
  - SURFACED→RESOLVED — split-creates-empty-pane-autocollapses: first-pass verify-self surfaced it; operator chose "empty pane persists"; fixed in P2.7 + browser-re-verified.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done (re-run after P2.7) — tsc clean, editorPanes 14, eslint clean -->
  - [x] verify-self  <!-- status: done (re-run after P2.7) — NO BLOCKING. Subagent: page mounts healthy (0 console errors); P2.7 SPLIT-PERSISTS confirmed (split→2 persistent panes w/ ✕; close→1, ✕ gone — no regression); CLI green (vitest 274, tsc/eslint/prettier). File-dependent tab behavior UNVERIFIED-IN-STUB → native verify-human. -->
    - [ ] P2.verify-self.stub-tabs — file-dependent tab open/close/⌘N + independent-same-file-buffer behavior UNVERIFIED-IN-STUB (need native `pnpm tauri dev`); carried to verify-human  <!-- status: UNVERIFIED: needs native app -->
  - [ ] P2.8 FIX split-flash-then-close (operator P2.vh.7 reject 2026-06-21) — with a FILE open in pane 1, clicking Split flashed a 2nd pane that immediately self-closed. Root cause (static, debug-telemetry gate-skipped): `PaneTabs`' `onEmptyChange`/`onActivePathChange` effects keyed on the UNSTABLE inline-callback identity that `EditorSplit` re-creates each render → re-fired on every render; combined with a STALE `panes.panes.length` closure in the collapse guard, the just-split pane got collapsed. Fix: (1) `PaneTabs` fires both callbacks ONLY on a real value transition (ref-tracked `lastReportedEmpty`/`lastReportedPath`) via callback refs; (2) `EditorSplit` reads the LIVE pane count via `panesRef` in the collapse guard. Empirically re-verified in-browser under the reproduced native precondition (pane-1 filled via the focused PaneTabs handle): Split → 2 panes PERSIST (700ms), 2 strips, 2 ✕; close pane → back to 1, pane-1's tab retained.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done (re-run after P2.8) — tsc clean, eslint clean on PaneTabs+EditorSplit; full vitest 274 + prettier confirmed in build -->
  - [x] verify-self  <!-- status: done (re-run after P2.8) — NO BLOCKING. Fresh subagent reproduced the FILLED-pane-1 precondition (fiber openFile) → Split → 2 panes PERSIST past 700ms (no flash-close, P2.8 regression gone); close → 1 pane, pane-1 tab retained. Page mounts healthy (0 console errors). CLI green (274/tsc/eslint/prettier). File-content-dependent within-pane behavior UNVERIFIED-IN-STUB → native verify-human (P2.vh.8–10). -->
  - [x] verify-human  <!-- status: done — P2.vh.1–8,10 PASS (operator native); P2.vh.7 fixed (P2.8) + confirmed; P2.vh.9 RESOLVED by Phase 2S (shared store, operator "all pass"). All split-group + tab behaviors confirmed. -->
    - [x] P2.vh.1 Open two files → tab strip with two tabs, second active+shown  <!-- status: PASS (operator 2026-06-21, "1-6 good") -->
    - [x] P2.vh.2 Click first tab → its file fronts; click back restores second  <!-- status: PASS -->
    - [x] P2.vh.3 Edit tab A, switch to B and back → A's unsaved text+cursor preserved; ● dirty dot  <!-- status: PASS -->
    - [x] P2.vh.4 ⌘2 → 2nd tab, ⌘1 → 1st (cursor in editor)  <!-- status: PASS -->
    - [x] P2.vh.5 Close clean tab → neighbor; close all → "No file open"; close dirty → save/discard/cancel  <!-- status: PASS -->
    - [x] P2.vh.6 Re-open already-open file → existing tab activates, no duplicate  <!-- status: PASS -->
    - [x] P2.vh.7 Click Split → 2nd pane (own tab strip), "No file open", PERSISTS  <!-- status: PASS (operator native re-check, after P2.8 fix) -->
    - [x] P2.vh.8 Open a file in pane 2 → lands in pane 2's strip; pane 1's tabs untouched  <!-- status: PASS (operator native) -->
    - [x] P2.vh.9 Same file open in both panes → SHARED buffer (edit in pane 1 reflects live in pane 2)  <!-- status: RESOLVED by Phase 2S (shared document store) — operator confirmed live-mirror at P2S.vh.1/.2 ("all pass" 2026-06-21). -->
    - [x] P2.vh.10 Close pane 2's last tab → pane 2 collapses (drained auto-close); pane 1 stays  <!-- status: PASS (operator native) -->
  - [ ] verify-codify  <!-- status: SUPERSEDED — Phase 2 continues into Phase 2S (shared-doc store) before codify; codify runs once after 2S -->

- [x] Phase 2S: Shared document store (same file in N panes = one buffer)  <!-- status: done — full verify loop complete; operator "all pass" on the shared-buffer model; P2.vh.9 satisfied -->
  **Relevance check (before Phase 3):**
  - Requester still needs this: yes — Phase 3 (disk-change) + WP7 (Find Results) both build on the store; operator engaged throughout.
  - Requirements unchanged: yes — disk-change spec settled; the store gives it a per-document home (`DocEntry.marker`).
  - Solution still feasible: yes — `stat_file` (Phase 1) + the store both exist and are verified; P3 is the on-activate/pre-save check + conflict popup over them.
  - No superior alternative discovered: yes — synchronous marker check (no watcher) remains right for a single-user local tool.
  **Verdict:** proceed
  **Why (operator P2.vh.9 reject 2026-06-21):** the per-(pane,tab) `EditorPanel` owns its own `doc`/`savedDoc` → the SAME file in two panes has two independent buffers. Operator requires the VS Code model: two views of ONE document (edit in pane 1 mirrors live in pane 2; dirty + save are document-level). Decision = Option 1: lift the buffer into a **per-workspace shared document store keyed by path**; tabs/panes are VIEWS. The whole Phase-2 split structure (EditorSplit/PaneTabs/tab strip/⌘1..9/split-persist fix/close-guard) STAYS — only `EditorPanel`'s buffer ownership + the dirty/save plumbing change. Realizes the proper shared-doc model Phase 3 + WP7 want.
  **Observable outcomes:**
  - Browser (native): the SAME file open in two panes shares one buffer — typing in pane 1 appears live in pane 2; the ● dirty dot shows on the file's tab in BOTH panes; ⌘S in either pane saves once and clears dirty in both.
  - Browser (native): two DIFFERENT files in two panes remain fully independent (no cross-talk); a single file in one pane behaves exactly as today.
  - Browser (native): cursor/scroll stay PER-VIEW — scrolling pane 1 does not move pane 2 (only the document content is shared, not the viewport).
  - CLI: `pnpm test` passes incl. a new `editorDocs.ts` store-reducer suite (open-doc/set-doc/load-ok/save-ok/save-fail/drop-doc/ref-count); tsc/eslint/prettier + cargo clean.
  - [x] P2S.1 `editorDocs.ts` store reducer — `DocEntry { doc, savedDoc, load, save, languageOverrideId, marker?, refCount }` keyed by path; `open-doc` (ref++/create), `close-doc` (ref--/drop at 0), `set-doc`, `load-start/ok/fail`, `save-start/ok/fail`, `set-override`, `set-marker`; `isDirty` derived. Reuses `editorLoad`/`editorSave` machines. No-op identity preservation. 17 vitest cases (incl. ref-count: 2 views→1 entry, close 1→survives, close both→dropped).  <!-- status: done -->
  - [x] P2S.2 Store lifted into `EditorSplit` — `useReducer(docsReducer)`; load-ONCE-per-path effect (read_file fires when an entry is idle, one read regardless of view count); `onSave` writes the shared buffer (reads live store via `docsRef`); stable `onTabOpen/onTabClose/onDocChange/onSetOverride` callbacks passed to every `PaneTabs`.  <!-- status: done -->
  - [x] P2S.3 `EditorPanel` is now a VIEW — dropped its `useState` doc/savedDoc + the `loadReducer`/`saveReducer` ownership + the read_file/write_file IPC; reads `doc`/`dirty`/save+load state/`languageOverrideId` from the `entry` prop, writes via `onDocChange`/`onSave`/`onSetOverride`. KEPT per-view: CM6 view, cursor/scroll, the WP7 highlight effect, the palette, font-zoom. Two views of one path bind to the same `entry.doc` → live mirror (known WP3c shared-doc cursor-reset applies to that case; noted; proper fix = shared CM6 EditorState, a follow-up).  <!-- status: done -->
  - [x] P2S.4 Tab dirty-dot + close-guard reconciled with the store — `PaneTabs` ref-counts via a tab-path-set diff effect (`onTabOpen`/`onTabClose`); the ● dot + close-guard read `isDirty(docs.byPath[path])` (so dirty shows in EVERY pane's tab for that path, and save-in-one clears everywhere); "Save" calls `onSave(path)`. Per-view `onDirtyChange`/`registerSave`/`set-dirty` plumbing removed.  <!-- status: done -->
  - SURFACED — same-file-in-2-panes shares one CM6 `value` (two `@uiw/CodeMirror` bound to one `entry.doc`) → the WP3c shared-doc cursor-reset (SURFACE-2026-06-20-WP3C-SHARED-DOC-CURSOR-RESET) now applies to that case. Accepted for v1 (the high-value gesture is same-doc viewing/editing; the proper fix is a shared raw CM6 `EditorState` across views — a post-M2 follow-up). Confirm tolerability at verify-human.  <!-- status: SURFACED: shared-doc-cursor-reset extends to same-file-2-panes -->
  - [ ] verify-auto  <!-- status: NOT-STARTED -->
  - [ ] verify-self  <!-- status: NOT-STARTED -->
  - [ ] verify-human  <!-- status: NOT-STARTED (native: same-file-2-panes shared buffer + live mirror + shared dirty/save; different-files independent; cursor/scroll per-view) -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->
  - [x] verify-auto  <!-- status: done — scoped: tsc whole-graph clean, editorDocs 17 vitest, eslint clean on editorDocs/EditorSplit/PaneTabs/EditorPanel; full vitest 291 + prettier confirmed in build -->
  - [x] verify-self  <!-- status: done — NO BLOCKING. Subagent: buffer-store rewrite did NOT break mount or split lifecycle (split-persist intact under filled-pane condition, 0 console errors); CLI green (291/tsc/eslint/prettier). Shared-buffer live-mirror UNVERIFIED-IN-STUB (needs backend) → native verify-human. -->
    - [ ] P2S.verify-self.stub — shared-buffer live-mirror + different-files-independent + cursor-per-view UNVERIFIED-IN-STUB (need native `pnpm tauri dev`); carried to verify-human  <!-- status: UNVERIFIED: needs native app -->
  - [x] verify-human  <!-- status: done — operator "all pass" 2026-06-21 (native pnpm tauri dev). Shared-buffer model confirmed; P2.vh.9 satisfied. -->
    - [x] P2S.vh.1 Same file in 2 panes; type in pane 1 → text appears live in pane 2 (shared buffer)  <!-- status: PASS -->
    - [x] P2S.vh.2 Same file dirty → ● dot on the tab in BOTH panes; ⌘S in either clears both + saves once  <!-- status: PASS -->
    - [x] P2S.vh.3 Two DIFFERENT files (one per pane); edit each → fully independent, no cross-talk  <!-- status: PASS -->
    - [x] P2S.vh.4 Same file both panes; scroll/move cursor WITHOUT typing in pane 1 → pane 2 viewport unaffected (per-view scroll/cursor)  <!-- status: PASS -->
    - [x] P2S.vh.5 Single-pane sanity: open/edit/⌘S + switch/close/⌘1-2/split-persist still work (no rewrite regression)  <!-- status: PASS -->
  - [x] verify-codify  <!-- status: done — shared-buffer/ref-count/dirty/save behavior codified test-first in editorDocs.test.ts (17 cases); no gap → no new tests (live-mirror UI E2E needs native, was the verify-human pass; repo has no jsdom/RTL). Full suites green: vitest 291, cargo 111, no regressions. -->

- [x] Phase 3: Disk-change detection + conflict resolution  <!-- status: done — full verify loop complete; operator "all pass" on all 6 native disk-change checks -->
  **Relevance check (before Phase 4):**
  - Requester still needs this: yes — Phase 4 (synthetic read-only buffer) is the WP7 Find-Results seam; WP7 is paused waiting on it.
  - Requirements unchanged: yes — generic synthetic-tab hook (in-memory content, read-only, click-line→callback) per the spec.
  - Solution still feasible: yes — the store (`editorDocs`) + tab model (`openFiles` `add-synthetic`) already have the synthetic-kind scaffolding; Phase 4 renders it + the click hook.
  - No superior alternative discovered: yes — a synthetic store-entry kind is the natural fit alongside file entries.
  **Verdict:** proceed
  **[Re-plan note 2026-06-21, updated for the shared store]:** the disk marker is now a field on the per-PATH store entry (`DocEntry.marker`), not per-(pane,tab). The on-activate `stat_file` check + conflict resolution act on the document; a reload/keep-mine/load-disk updates the one shared entry → all views of that path reflect it. The conflict popup + `ConfirmModal` (`conflictSpec`) are unchanged.
  **Observable outcomes:**
  - Browser/native (`pnpm tauri dev` — needs the real backend for `stat_file`): with a file open and CLEAN, changing it on disk (e.g. `echo >> file` in a terminal) then switching back to its tab silently reloads the new content; with UNSAVED edits, switching back shows the conflict popup (keep mine / load disk), and the chosen copy wins.
  - Browser/native: after a successful save, re-activating the tab does NOT false-positive a conflict (the stored marker updated on save).
  - CLI: `pnpm test` passes including pure conflict-decision tests (marker-equal→noop, marker-changed+clean→reload, marker-changed+dirty→conflict); cargo/tsc/eslint/prettier clean.
  - [x] P3.1 Disk-marker check (`diskConflict.ts`) — pure `diskDecision(stored, disk, dirty) → "noop"|"reload"|"conflict"` + `markersEqual`; 10 vitest cases. Wired in `EditorSplit.checkDisk(path)`: `stat_file` → decision → noop (adopt marker if no baseline) / reload (clean → re-read+marker) / conflict (dirty → popup). Fired on tab activation via `EditorPanel.onActivated` (front+loaded edge) → `PaneTabs` → `EditorSplit`. Load-time baseline marker recorded after each `load-ok`. A stat failure is swallowed (treat as unchanged).  <!-- status: done -->
  - [x] P3.2 Conflict popup — `ConfirmModal` + `conflictSpec` rendered in `EditorSplit` when `conflict` state set. keep-mine → `set-marker(disk)` (keeps the dirty buffer, quiets the next check); load-disk → `reloadFromDisk` (re-read disk over buffer+savedDoc + marker). No silent overwrite either direction (Esc inert — conflictSpec.escValue null).  <!-- status: done -->
  - [x] P3.3 Save updates the marker — `onSave` is async: pre-save `stat_file` + `diskDecision`; a dirty+changed file → conflict popup INSTEAD of writing (no clobber); else `write_file` → `save-ok` → re-`stat_file` → `set-marker` so the next activation doesn't false-positive.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — scoped: tsc clean, diskConflict 10 vitest, eslint clean on diskConflict/EditorSplit/EditorPanel/PaneTabs; full vitest 301 + prettier confirmed in build -->
  - [x] verify-self  <!-- status: done — NO BLOCKING. Subagent: disk-check wiring didn't break mount/split (split-persist intact under filled-pane; a stat_file IPC rejection on activation does NOT crash — 0 console errors through fill+split+close); CLI green (301/tsc/eslint/prettier). Disk-change behavior UNVERIFIED-IN-STUB (needs native stat_file) → verify-human. -->
    - [ ] P3.verify-self.stub — disk-change reload/conflict/save-guard UNVERIFIED-IN-STUB (need native `pnpm tauri dev`); carried to verify-human  <!-- status: UNVERIFIED: needs native app -->
  - [x] verify-human  <!-- status: done — operator "all pass" 2026-06-21 (native pnpm tauri dev + terminal). Disk-change detection confirmed: reload-when-clean, conflict-when-dirty, keep-mine/load-disk, save-guard, no false-positive. -->
    - [x] P3.vh.1 Clean file changed on disk → silent reload on re-activate (no prompt)  <!-- status: PASS -->
    - [x] P3.vh.2 Dirty file changed on disk → conflict popup (keep-mine / load-disk)  <!-- status: PASS -->
    - [x] P3.vh.3 Conflict → Keep My Changes → edits stay, no re-prompt on next activate  <!-- status: PASS -->
    - [x] P3.vh.4 Conflict → Load From Disk → editor replaced with disk content  <!-- status: PASS -->
    - [x] P3.vh.5 ⌘S while file changed on disk + buffer dirty → conflict popup, save blocked (no clobber)  <!-- status: PASS -->
    - [x] P3.vh.6 Normal save (no external change), repeated → no false-positive conflict  <!-- status: PASS -->
  - SURFACED — operator wants a live filesystem watcher later (real-time reload/conflict without a tab switch). Logged SURFACE-2026-06-21-EDITOR-FILE-WATCHER (low/deferred). The synchronous on-activate/pre-save check is the v1; the watcher reuses editorDocs + diskConflict, just a new event source.  <!-- status: SURFACED: editor-file-watcher (deferred) -->
  - [x] verify-codify  <!-- status: done — diskConflict decision fn codified test-first (10 cases, all branches); no gap → no new tests (live disk-change E2E was the operator native pass; repo has no jsdom/RTL). Full suites green: vitest 301, cargo 111, no regressions. -->

- [x] Phase 4: Synthetic read-only buffer hook (the WP7 seam)  <!-- status: done — full verify loop complete; synthetic read-only tab + click-line→callback + DEV hook, verify-self fully exercised live -->
  **[Re-plan note 2026-06-21]:** a synthetic tab is added to a PANE's tab set (the `add-synthetic` event, unchanged); it renders inside that pane's `PaneTabs` as a read-only view. The generic API (`setSyntheticContent` / `onSyntheticLineClick`) lives on `EditorSplit`/`PaneTabs`, targeting a (paneId, tabId). WP7's Find Results tab opens in the focused pane.
  **Observable outcomes:**
  - Browser (`?ws=` seed + a DEV-only test hook that adds a synthetic tab): a synthetic tab appears in the focused pane's strip with its given label, renders its in-memory content read-only (typing does nothing, no save, no disk-change check on activation), and clicking a line fires the registered click-line→callback (asserted via a console log / DOM data attribute in the dev hook); no `read_file` IPC is issued for the synthetic tab.
  - Browser: re-setting a synthetic tab's content updates the rendered text in place (the programmatic `setContent` API); closing it removes it like any tab.
  - CLI: `pnpm test` + tsc/eslint/prettier + cargo clean; reducer's `add-synthetic` + synthetic-state path covered.
  - [x] P4.1 Synthetic read-only view — `SyntheticView.tsx`: read-only CM6 (`EditorView.editable.of(false)` + `EditorState.readOnly.of(true)`) bound to in-memory content; NO read_file/write_file/stat_file/marker/dirty/save. `PaneTabs` renders it for `kind:"synthetic"` tabs (replaced the Phase-2 placeholder), content/callback keyed by tab id. Generic API on `EditorSplit`: `addSynthetic(id,label,onLineClick?)` + `setSyntheticContent(id,text)` (synthetic content in a small state map, callbacks in a ref). Not path-keyed (synthetic tabs have no path → kept OUT of the editorDocs path store).  <!-- status: done -->
  - [x] P4.2 Click-line→callback — `SyntheticView` `domEventHandlers.mousedown` → `posAtCoords` → `doc.lineAt(pos).number` (1-based) → `onLineClick(line)`. (WP7 will map line→open-file-at-match; here generic + dev-hook-asserted.)  <!-- status: done -->
  - [x] P4.3 DEV test hook — `window.__editorSynthetic { add, setContent, clickedLines }` registered in `EditorSplit` under `import.meta.env.DEV` (like `__seedWorkspace`); `add` opens a synthetic tab in the focused pane with a callback that records clicked lines into `clickedLines` for stub assertions. Type in `vite-env.d.ts`. Dead-code-eliminated in prod.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — scoped: tsc clean, openFiles 22 (synthetic path), eslint clean on SyntheticView/EditorSplit/PaneTabs; full vitest 301 + prettier confirmed in build -->
  - [x] verify-self  <!-- status: done — FULLY stub-verified (synthetic content is in-memory, no backend). Subagent via window.__editorSynthetic: synthetic tab renders read-only (contenteditable=false), setContent updates in place, click line 2 → clickedLines=[2], close ✕ → empty state; NO read_file for the synthetic tab. CLI green (301/tsc/eslint/prettier). No BLOCKING. -->
  - [x] verify-human  <!-- status: done — AUTO-SKIPPED (drive_mode=autopilot, verify-self all-PASS, no operator-facing boundary). Phase 4 adds an isolated dev-only synthetic-tab artifact (SyntheticView + window.__editorSynthetic hook, prod-DCE'd) with NO production consumer yet (WP7 is its first, downstream/paused); verify-self fully exercised it live via the dev hook → nothing operator-only left to test. Operator read-time veto via this affirmation. -->
  - [x] verify-codify  <!-- status: done — add-synthetic reducer path unit-covered (openFiles suite); SyntheticView render/read-only/click-callback live-verified in verify-self (repo has no jsdom/RTL → no CM6 unit mount possible/warranted). Full suites green: vitest 301, cargo 111, no regressions. -->

## Current Node
- **Path:** Feature > SHIP
- **Active scope:** ALL PHASES COMPLETE (1, 2, 2S, 3, 4 — every verify loop green). WP12 (editor multi-file tab strip, per-pane split-editor groups, shared document store, disk-change detection, synthetic read-only buffer hook) is ready to ship. Final gates: vitest 301, cargo 111, tsc/eslint/prettier clean. Run `/feature-ship`.
- **Blocked:** none
- **Unvisited:** none — ship → finalize. On finalize, close the carried SURFACEs (WP3C-INDEPENDENT-FILE-SPLIT realized, file-watcher deferred, shared-doc-cursor-reset accepted) + resume WP7 (its Find Results tab now has the WP12 synthetic-buffer seam).
- **Open discoveries:** editor-file-watcher (deferred, logged); shared-doc cursor-reset extends to same-file-2-panes (accepted v1); WP3C-INDEPENDENT-FILE-SPLIT realized — close at finalize.
- **Blocked:** none
- **Unvisited:** Phase 4 (P4.1 synthetic kind + read-only render → P4.2 click-line→callback → P4.3 DEV test hook → verify group), then SHIP. ⌘⇧+digit RESERVED (filmstrip).
- **Open discoveries:** editor-file-watcher (deferred, logged); shared-doc cursor-reset extends to same-file-2-panes (accepted v1); WP3C-INDEPENDENT-FILE-SPLIT realized — all to close at finalize.
- **Blocked:** none
- **Unvisited:** Phase 3 (P3.1 disk-marker decision fn → P3.2 conflict popup → P3.3 save updates marker → verify group), then Phase 4 (synthetic read-only buffer hook = a store-entry kind). ⌘⇧+digit RESERVED (filmstrip).
- **Open discoveries:** shared-doc cursor-reset extends to same-file-2-panes (accepted v1; SURFACE noted, close at finalize); WP3C-INDEPENDENT-FILE-SPLIT realized (close at finalize).
- **Blocked:** none
- **Unvisited:** Phase 2S verify group (auto → self → human → codify; the shared-buffer live-mirror is the native verify-human focus + the P2.vh.9 re-confirm), then Phase 3 (disk marker = DocEntry.marker), then Phase 4 (synthetic buffer = a store-entry kind). ⌘⇧+digit RESERVED (filmstrip).
- **Open discoveries:** shared-doc cursor-reset now extends to same-file-2-panes (accepted v1; SURFACE noted). F23 #2 buffer-store lift recorded in Problem Statement.
- **Blocked:** none
- **Unvisited:** Phase 2 verify group (verify-auto → verify-self → verify-human → verify-codify), then Phase 3 (disk-change detection, per-(pane,tab) keyed), then Phase 4 (synthetic buffer hook, per-pane). ⌘⇧+digit RESERVED for filmstrip/workspace switching (operator) — WP12's bare ⌘+digit unaffected.
- **Open discoveries:** SURFACE-2026-06-20-WP3C-INDEPENDENT-FILE-SPLIT realized by the per-pane model (close at finalize).

## Discoveries

<!-- Format: [SURFACED-<date>] <target node> — <summary> -->
- [SURFACED-2026-06-21] feature-spec — arch.md exceeds size guard (352 lines); read first 100 lines + `^#+ ` headings only per the GLOBAL entry-skill product-context size guard. (Same as WP7 spec; arch.md unchanged since.)
