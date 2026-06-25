---
shape: temporary-wbs
created: 2026-06-24
status: in-progress — WP0 shipped 2026-06-24; WP1–WP8 pending
context: between-milestone QoL/lifecycle sweep, filed after M4 close, before M5 (PiP) planning
---

# QoL / Lifecycle Temporary WBS — 2026-06-24

A between-milestone work breakdown to clear the **7 new `SURFACE-2026-06-24-*` backlog
items** filed during the app-menu feature, plus operator-selected diff-viewer QoL polish.
NOT a roadmap milestone — a scratch WBS to drive a focused sweep before M5 (PiP) planning.
At completion, fold the durable outcomes back into the backlog (mark each SURFACE resolved)
and delete this file.

**Ordering: priority-first** (operator decision). Natural technical pairings are kept as
**adjacent** WPs so a paired pair can share a build session, but priority drives the sequence.

**Sequence of execution:** ~~WP0~~ ✅ → WP1 → WP2 → WP3 → WP4 → WP5 → WP6 → WP7 → WP8  *(WP0 SHIPPED 2026-06-24, commit d893254)*

**Scope decisions baked in (2026-06-24 triage):**
- All 7 new SURFACE items are IN.
- **WP0 (filesystem watcher) PULLED FORWARD 2026-06-24** — operator hit the stale-FileTree gap live while dogfooding; promoted from a later-milestone deferral to a HIGH-priority foundational patch, sequenced first (a `notify` seam other consumers reuse). From SURFACE-2026-06-21-EDITOR-FILE-WATCHER (scope broadened to include the tree).
- Diff-viewer polish **items 1–3** (collapse/expand-all, sticky headers, open-in-editor badge) are IN (folded into WP8).
- Diff-viewer polish **item 4** (faint line highlighting) — **DROPPED** (not a problem in practice).
- **WP10-ARROW-KEY-TREE-NAV** — **DROPPED** (not wanted).
- Two NEW operator diff requests added to WP8: **(A)** per-file filename row genuinely sticky while scrolling that file's diff; **(B)** the commits (top half) list **collapsed by default**.
- Code-quality findings tail is OUT of this WBS — handled separately via `/feature-refactor`.

---

## WP0 — Filesystem watcher (FileTree refresh + editor-doc reload)  `[priority: HIGH]`  `← foundational seam`  ✅ SHIPPED 2026-06-24 (commit d893254)
**Backlog:** SURFACE-2026-06-21-EDITOR-FILE-WATCHER (pulled forward + scope broadened 2026-06-24)
**Size:** medium · **Type:** new capability (foundational `notify` seam)
**Why WP0 / first:** the operator hit it LIVE this session — a file created on disk by an external process (e.g. a CLI-written `qol-wbs.md`) does NOT appear in the FileTree until the folder is manually collapsed/re-expanded (⌘P finds it because the finder re-walks on open; the tree is a stale snapshot). It's a foundational `notify` seam that two consumers reuse — build it once, first.

**What:** A backend filesystem watcher (`notify` / `tauri-plugin-fs-watch`) over each workspace root that emits change events to the frontend, feeding TWO consumers:
1. **FileTree refresh (the gap just hit)** — on a create/remove/rename under the workspace root, re-walk (or patch) the tree so newly-added/removed files appear without a manual collapse/expand. Respect the existing gitignore-honoring tree walk.
2. **Open editor-doc reload (the original SURFACE scope)** — on a change to a file with an open tab, run the existing `diskDecision` (reload-when-clean / conflict-when-dirty) WITHOUT requiring a tab activation. Reuse `editorDocs` (`set-marker`/`load-ok`) + the WP12 Phase-3 conflict popup — no new decision logic, just the event source.

**Tasks:**
- Backend: a `notify`-based watcher per workspace root (or one recursive watcher), debounced (editors/formatters write-then-rename → coalesce rapid events). Emit a Tauri event (e.g. `fs-change` with the changed path + kind). Gate the capability/plugin add to what's needed; keep the lean-bundle posture.
- Watcher lifecycle: start on workspace open (`workspace_register` path), STOP on workspace close (pairs with WP1's `closeWorkspace` teardown — register the stop there).
- Frontend FileTree: subscribe to `fs-change`; re-walk the affected subtree (or full tree) and reconcile, preserving expand/collapse state + scroll. Hook the same `gitStatusRefreshKey`/load seam where natural.
- Frontend editor: subscribe to `fs-change`; for any changed path with an open `DocEntry`, run `diskDecision` against the store entry and reload/conflict accordingly.
- **Debounce + ignore-self:** don't fire a reload/conflict for the app's OWN `write_file` saves (distinguish self-writes from external changes — e.g. a recently-saved-marker or a short ignore window post-save).
- **Edge cases:** rapid bulk changes (git checkout / branch switch rewrites many files) — coalesce; a watched root that's deleted/moved; symlinks under the root.

**Pairs-with WP1:** WP1's `closeWorkspace` teardown must STOP this workspace's watcher (add the stop to the close path).

---

## WP1 — Close a workspace  `[priority: HIGH]`
**Backlog:** SURFACE-2026-06-24-NO-WAY-TO-CLOSE-A-WORKSPACE
**Size:** small/medium · **Type:** new capability (genuine lifecycle gap)
**Why first:** workspaces accumulate with no removal path — directly impedes the multi-workspace daily-driver use case the M3+M4 dogfood depends on.

**What:** A close affordance per workspace that deregisters it, kills its CC session, and removes its tile.

**Tasks:**
- Add a `closeWorkspace(state, id)` reducer to `state/workspace.ts` / `useWorkspaceList`: remove from `workspaces`; pick a new `focusedId` (previous tile, or `null` → back to full-screen picker when the last one closes, `view → "picker"`).
- Kill the workspace's CC PTY session (`cc_kill` on its `cc_session_id`) AND the WP9 second-terminal shell.
- `workspace_deregister` it from the status-broadcaster registry (mirror the open path's `workspace_register`).
- Drop its persisted filmstrip-order entry.
- UI: an × button on each `Filmstrip` tile (appears on hover) — the primary affordance. This is a REAL unmount + teardown (distinct from the display:none background-keep — mind the "all workspaces stay mounted" rule; closing is the exception).
- **Edge cases:** closing the focused workspace (promote another to center stage); closing the LAST workspace (→ full-screen picker); dirty editor tab in the closing workspace (confirm-before-close — reuse the editor's existing dirty guard, or defer to it).

**Pairs-with WP0:** since WP0 (the fs watcher) ships first, this WP's `closeWorkspace` teardown must STOP the closing workspace's watcher (alongside `cc_kill` + `workspace_deregister`). Add the watcher-stop to the close path.
**Pairs-with (follow-up, NOT this WP):** a "Close Workspace ⌘⇧W" item in the native Workspace menu, once this ships.

---

## WP2 — Status indicator: busy vs awaiting-input  `[priority: MED-HIGH]`  `← reproduce-first`
**Backlog:** SURFACE-2026-06-24-STATUS-INDICATOR-BUSY-VS-AWAITING-INPUT
**Size:** small · **Type:** bug-shape (indicator STUCK in wrong state)
**Why second:** it actively misleads the **core dogfood signal** — the awaiting-input dot is THE "this project needs me" cue; a STUCK false-positive is worse than a transient one.

**Operator's revised hypothesis (most likely root cause):** `AskUserQuestion` fires a `Notification` hook → indicator → AwaitingInput (CORRECT at that moment). But after the user ANSWERS, the state stays **STUCK at AwaitingInput** — answering a tool-call prompt does NOT emit `UserPromptSubmit` (that's top-level prompts only), so the broadcaster never sees a running signal and the dot stays blue until the next real `Stop`/`UserPromptSubmit`.

**Method: `/feature-reproduce` FIRST.** Drive a real CC session that calls `AskUserQuestion`; capture the FULL hook event sequence across **ask → answer → resume**. Specifically: (1) trigger an `AskUserQuestion`, observe the dot go AwaitingInput; (2) ANSWER it; (3) watch whether ANY hook event fires afterward (a `UserPromptSubmit`? a new `Stop`? a `PreToolUse`/`PostToolUse`? nothing?). The transition OUT of AwaitingInput is the crux.

**Fix candidates (choose after the real stream is captured):**
- Map the post-answer resumption event (whatever CC actually emits) back to running/busy; OR
- Treat AwaitingInput as auto-clearing on the next ANY-activity event.
- Files: `src-tauri/src/status_broadcaster/mod.rs` (HookEvent→state transform), the status DTO, frontend `useWorkspaceStatus` + the dot rendering.

**Relates to:** SURFACE-2026-06-22-WP1-NOTIFICATION-PAYLOAD-NOT-LIVE-CAPTURED (this is the live signal that exposes the gap).

---

## WP3 — Switch-workspace autofocus CC panel  `[priority: MEDIUM]`  `↔ pairs with WP4`
**Backlog:** SURFACE-2026-06-24-SWITCH-WORKSPACE-AUTOFOCUS-CC-PANEL
**Size:** small · **Type:** UX refinement

**What:** On promoting a workspace to center stage (filmstrip click, ⌘⇧+digit, or the Workspace menu), auto-focus the **left CC terminal** so typing goes straight to that project's CC session.

**Tasks:**
- In the promote path — `focusWorkspace(id)` in `useWorkspaceList` (called from `App.tsx` filmstrip click + the ⌘⇧+digit handler at `App.tsx:73`, and `Filmstrip.tsx`) — after the display:block flip, call `.focus()` on the promoted workspace's xterm instance (or its textarea).
- Mind "all workspaces stay mounted" — focus moves to the now-visible terminal.
- **Decision (operator):** ALWAYS focus the CC (left) panel for v1 (not last-focused-half restore). Revisit only if it fights the WP4b focus-indicator memory.

**Pairs-with WP4:** same show/focus code path — build adjacent; WP4's reproduce will exercise this path too.

---

## WP4 — Terminal spurious newline on panel switch  `[priority: MEDIUM]`  `← reproduce-first` `↔ pairs with WP3`
**Backlog:** SURFACE-2026-06-24-TERMINAL-SPURIOUS-NEWLINE-ON-PANEL-SWITCH
**Size:** small · **Type:** bug-shape (spurious input)

**What:** Switching workspaces, or right-panel tabs (Terminal↔Editor / Terminal↔Diff), makes the terminal emit an empty prompt line each time — a stack of empty `stayman@… claudesk %` prompts accumulates. No input should reach the PTY on a show/focus.

**Method: `/feature-reproduce` FIRST.** Instrument `cc_input` and switch panels with a terminal open. **Distinguish** "real new prompt (a byte WAS sent)" from "cosmetic reprint (no input, just a redraw)" — the fix differs:
- Real stray byte → find + remove the `\r`/`\n` written on focus.
- Cosmetic reprint → likely the `FitAddon.fit()` + SIGWINCH prompt-redraw on show; fix the show/focus path to not re-fit-emit.

**Candidates:** (1) a `cc_resize` the shell echoes as a prompt redraw; (2) an actual stray `\r`/`\n` to `cc_input` on focus; (3) xterm repainting buffered scrollback.
**Files:** `src/components/workspace/TerminalPane.tsx` (show/visible effect — fit/focus/resize), `XtermPane.tsx` (xterm instance + cc_input/cc_resize wiring), `src-tauri/src/cc_session` (resize handling). Also check whether the LEFT CC terminal has the same issue (WP3 exercises the same focus path). The rAF fit+focus dup is a noted MINOR (wp7-pty-cc-session finding #4).

---

## WP5 — Editor: file management (add new file + delete file)  `[priority: MEDIUM]`  `↔ pairs with WP6`
**Backlog:** SURFACE-2026-06-24-EDITOR-ADD-NEW-FILE (+ delete-file, added 2026-06-24 — operator request during WP0)
**Size:** small/medium · **Type:** new editor feature

**What:** Basic file-management affordances the editor lacks today — **create** a new file (name it, open it in a tab) and **delete** an existing file. Today the editor can only OPEN existing files; there's no create and no delete path.

**Tasks (create):**
- Backend: a new file = `write_file` of an empty (or templated) buffer at a chosen path under the workspace root (`editor_fs` — root-confined `read_file`/`write_file`/`stat_file`), then `openFile(path)` into the focused pane (the `RightPanelHost.openFile` seam).
- UI surface candidates: a "+"/context-menu action in the `FileTree` rail (`src/components/workspace/filetree/`), and/or a command-palette entry, and/or a File-menu item (once the native menu has one).
- Needs: a name/path input (inline rename-style or a small prompt); **collision handling** (don't clobber an existing file); respect the gitignore-honoring tree walk for refresh.
- **Reserve ⌘N for this** (pairs with WP6's ⌘⇧N — land them coherently).

**Tasks (delete — added 2026-06-24, operator request):**
- Backend: a new root-confined `delete_file(root, path)` command in `editor_fs` (mirrors `write_file`'s `resolve_within` confinement — never delete outside the workspace root). Decide: hard `fs::remove_file` vs macOS Trash (a hard delete is simplest for v1; Trash is a nicety).
- UI: a delete action in the `FileTree` rail context-menu (the same surface as "+ new file") and/or a File/Edit-menu item. **Confirm-before-delete** (a small ConfirmModal — reuse the editor's existing `ConfirmModal`).
- **Close any open tab** for the deleted file (the file is gone; its `DocEntry`/tab must be torn down — reuse the PaneTabs close path). Mind the dirty-tab case (deleting a file with unsaved edits — confirm covers it).
- Tree refresh after delete rides the **WP0 fs-watcher** for free (the external `remove` event re-walks the tree) — but also trigger an explicit refresh so it's immediate even if the watcher debounce lags.
- Folder delete (recursive) is OUT of scope for v1 unless trivial — single-file delete first.

---

## WP6 — New-workspace hotkey ⌘⇧N  `[priority: LOW]`  `↔ pairs with WP5`
**Backlog:** SURFACE-2026-06-24-NEW-WORKSPACE-HOTKEY
**Size:** tiny · **Type:** new keyboard binding
**Why adjacent to WP5 despite low priority:** ⌘N (editor new-file, WP5) and ⌘⇧N (new workspace) should land together so the chord pair is coherent.

**What:** The native menu's "New Workspace" shows ⌘⇧N as DISPLAY-ONLY (the menu carries no real accelerators by design); pressing ⌘⇧N does nothing. Wire it as a real hotkey that opens the picker.

**Tasks:**
- A pure `newWorkspaceChord` predicate (`e.metaKey && e.shiftKey && e.key.toLowerCase()==="n"`) + an `App.tsx` capture-phase document keydown listener calling `setShowPicker(true)` — same shape as `workspaceSwitchChord` in `App.tsx`.
- ⌘⇧N is disjoint from all existing chords. (⌘N is WP5's editor new-file.)

---

## WP7 — FileTree git-indicator bubble-up to parents  `[priority: MEDIUM]`
**Backlog:** SURFACE-2026-06-24-FILETREE-GIT-INDICATOR-BUBBLE-UP-TO-PARENTS
**Size:** small · **Type:** UX refinement (frontend-only derivation over existing data)

**What:** File-tree git-status markers should bubble up to parent folders — a collapsed folder containing a changed file shows a roll-up marker. Today only leaf file rows carry indicators (M2 WP11).

**Tasks:**
- Frontend derivation: build a directory→rolled-up-status map from the existing `git_file_statuses` (no new backend — the backend map already has every changed path). Walk descendants or fold bottom-up over the tree.
- Render a folder-row indicator with the same marker styling as file rows (`src/components/workspace/filetree/`).
- **Decide:** the precedence/merge rule when a folder contains a mix (modified/added/untracked/deleted) — Sublime/VS Code show a single dominant color; pick a precedence. Decide show-on-collapsed-only vs always.
- Recompute on the same `gitStatusRefreshKey` save/load triggers.

---

## WP8 — Diff-viewer polish  `[priority: MEDIUM]`
**Backlog:** SURFACE-2026-06-20-WP4-DIFF-VIEWER-POLISH-FOLLOWUPS (items 1–3) + two NEW operator requests (A, B)
**Size:** small/medium · **Type:** UX polish on the M2 diff viewer

**What:** A focused polish pass on the diff viewer. (Former polish item 4 — faint highlighting — DROPPED.)

**Tasks:**
- **(item 1) Collapse/expand-all button** — a control to collapse or expand ALL file-diff sections at once. The collapse model (`toggleCollapsed`/`isCollapsed` keyed by fileKey in `diffModel.ts`) already supports it; add a "collapse all" (add every current file key to the set) + "expand all" (clear it).
- **(item 2 + NEW item A — MERGED) Stacked sticky headers + genuinely-sticky per-file filename row.**
  - **Root cause confirmed (2026-06-24):** `.diff-statusbar`, `.diff-commits-header`, `.diff-commit-banner`, and `.diff-file-header` are ALL `position:sticky; top:0` in the SAME scroll container (`.diff-scroll`). Multiple sticky elements at the same `top:0` overlap rather than stack — so as you scroll into a long file, the current file's header gets shoved off by the next, and the panel-level + commits headers scroll away entirely. The operator's report ("once you scroll past a filename it's hard to tell which file") and polish-item-2 ("statusbar + commits header should stay pinned") are the SAME underlying bug.
  - **Fix:** give each sticky layer a stacked `top:` offset equal to the cumulative height of the sticky layers above it (statusbar → commits header → commit banner → file header), so they pin in a stack instead of colliding at 0. Keep the existing z-index ordering (file header z1 under commits/banner z2). The per-file `.diff-file-header` must remain visible for the WHOLE of that file's diff. Files: `src/App.css` (the `.diff-*` sticky blocks ~1443–1670), possibly `DiffPanel.tsx`/`FileDiffSection.tsx`/`CommitList.tsx` if a measured offset is needed.
- **(NEW item B) Commits (top half) collapsed by default** — the recent-commits list (`CommitList.tsx` / `.diff-commits-*`) should start COLLAPSED; the user expands it when they want commit history. Find the commits-collapsed state seam (likely a `useState` in `DiffPanel.tsx` or `CommitList.tsx`) and default it to collapsed.
- **(item 3) "Open in editor" badge per file row** — a per-file affordance opening the file into the EditorPanel. **Scope: current working-tree file ONLY** (the cheap version — `read_file`). NOTE: SURFACE-2026-06-20-WP4-OPEN-IN-EDITOR-BLOB-AT-REV is already DISMISSED (blob-at-rev fidelity is Sublime Merge's job, which is a permanent surface), so "open" always opens the live working-tree file regardless of which view it was clicked from — confirm that's still the intent at plan time. Seam: `DiffPanel.tsx` `DiffPanelProps.onOpenInEditor`.

---

## Completion / fold-back
On finishing each WP, mark its SURFACE item RESOLVED in `workflow/backlog.md` with a one-line note + commit ref (the feature-finalize / task-close skills do this automatically if each WP runs through the workflow). When all 8 WPs are done:
- Confirm every `SURFACE-2026-06-24-*` item is RESOLVED.
- Confirm SURFACE-2026-06-20-WP4-DIFF-VIEWER-POLISH-FOLLOWUPS items 1–3 are resolved (item 4 already dropped).
- Delete this `qol-wbs.md` (it's a scratch doc, not a durable product doc).
- Decide (with the operator) whether any of these reorder against M5 (PiP) — several are workspace-status / lifecycle adjacent.
