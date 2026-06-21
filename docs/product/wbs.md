---
stage: wbs
state: in-progress
updated: 2026-06-21
milestone: 2
# WP1,2,3a,3b,3c,4,5,6,7,8,10,12 shipped (12/13); WP7 SHIPPED 2026-06-21 (commit 8a788bf — search→Find Results tab + project-wide Replace All; per-result/per-file replace deferred to backlog). WP9, WP11 remain.
---

# Work Breakdown Structure — Milestone 2: Lite Editor + Diff Viewer

**Cycle scope:** **Milestone 2 only** (Lite Editor + Diff Viewer — the in-app right-half editor that becomes the primary surface for routine editing; note that as of WP8's 2026-06-20 redefinition, Sublime Text is **not removed** — it stays as a permanent icon-button launcher alongside Sublime Merge, see WP8). Milestones 3–9 are tracked in [`roadmap.md`](roadmap.md) and are **deliberately not decomposed** here — just-in-time decomposition happens when each milestone opens. The completed Milestone 1 (Phase 1) WBS is archived at [`archive/phase-1-bare-shell-poc/wbs.md`](archive/phase-1-bare-shell-poc/wbs.md).

**Grounding docs:** [`arch.md`](arch.md) → "Milestone 2 architecture" (RightPanelHost, component table, design constraints); [`research.md`](research.md) (CodeMirror 6 decided over Monaco; the two app-layer scoping corrections; the `git2` + `@codemirror/merge` diff split; risk list).

## Milestone 2 ordering rationale

Learning-sequence ordering, riskiest-unknown-first:

1. **CM6-integration probe first (WP1)** — two genuine unknowns flagged in `research.md` carry the most risk-of-rework: (a) does the **panel-switch hotkey fire while focus is inside a CM6 editor** (the WP8-class keymap-focus problem), and (b) do **N mounted CM6 editors stay within the perf envelope** (WP4 probed terminals, not editors). Resolve both cheaply before building the editor shell, so the panel-host design (WP5) isn't built on an assumption. No 3rd-party *API* probe is needed — CM6 / `@codemirror/merge` / `git2` are documented libraries with versions already verified in research; the probe is about *our* integration, not their shapes.
2. **Editor shell before features (WP2)** — mount CM6 in the right half with file open/save, before layering multi-cursor/search/minimap/theme. Validates the `@uiw/react-codemirror` + `tauri-plugin-fs` path in WKWebView first.
3. **Editor features as additive layer (WP3)** — the Sublime-parity feature set on top of the working shell.
4. **Backend app-layer subsystems (WP4 diff, WP6 file finder, WP7 search)** — each is a Rust synchronous path (`git2` / fs-walk / ripgrep-style) behind Tauri commands, with a thin frontend. The diff viewer (WP4) pairs with `@codemirror/merge` rendering; the **fuzzy finder (WP6) and project-wide search (WP7) are app-layer subsystems, NOT editor config** (the load-bearing `research.md` correction).
5. **Panel host wiring (WP5)** ties the editor + diff + second-terminal panels into the per-workspace RightPanelHost with the panel-switch hotkey — depends on the probe (WP1) settling the hotkey/focus question and on the editor (WP2) + diff (WP4) panels existing.
6. **Sublime-launcher consolidation (WP8)** — *(REDEFINED 2026-06-20: this was originally "gated Sublime-pop removal, last")* — relocate both Sublime launchers (Text + Merge) into the panel tab row as icon buttons + drop the redundant ⌘⇧O hotkey. Both launchers are KEPT (no removal), so there is no parity gate and it is NOT ordered last — it's a small frontend slice off WP5's tab row, parallel to the other app-layer WPs. See the WP8 section below.
7. **No async/orchestration in M2** — every backend piece is a synchronous request/response Tauri command; no queues/workers/event-bus. (The Phase-2 status broadcaster is a *different* milestone.)

## Milestone 2

### WP1: Probe — CodeMirror 6 integration unknowns (hotkey-focus + N-editor cost) ✅ SHIPPED 2026-06-19 (commit a84f3e9)

**Type:** probe
**Milestone:** Milestone 2
**Dependencies:** none (Milestone 1 shipped; the tab-shell substrate + right-half placeholder already exist)
**Size:** S
**Learning objective:** Answer the two `research.md`-flagged unknowns before the panel-host design commits to them: **(a)** can an app-level chord (the right-half panel-switch hotkey, and Cmd+P) fire reliably **while keyboard focus is inside a mounted CodeMirror 6 editor**, and what is the registration pattern that makes it work (CM6 keybinding that bubbles, vs. scoped document listener)? **(b)** what is the CPU/RAM cost of **N mounted CM6 instances** (e.g. 8 editors + a couple of `@codemirror/merge` MergeViews, all mounted, backgrounded ones `display:none`) on this macOS hardware — is it within the same envelope WP4's terminal probe used (<10% idle CPU, <300 MB RAM)?
**Timebox:** 1 day
**Success criterion:** A short writeup in `workflow/wip/m2-wp1-cm6-probe.md` recording: (a) the working hotkey-while-focused registration pattern (with the code shape that worked), and whether Cmd+P / panel-switch can coexist with CM6's keymap; (b) raw CPU/RAM numbers at N mounted editors + pass/fail vs the envelope, and any mitigation (e.g. lazy-mount backgrounded editors) if it fails. The writeup is the deliverable; no production code lands.
**Tasks:**
- [x] Mount a CM6 editor (via `@uiw/react-codemirror`) in a throwaway harness; bind an app-level chord and test whether it fires while the editor has focus; find the registration that works (bubbling CM6 keybinding vs. capture-phase listener)
- [x] Confirm Cmd+P and a panel-switch chord can both coexist with CM6's default keymap (no swallow)
- [x] Mount N (≈8) CM6 editors + 2 `@codemirror/merge` MergeViews; background most with `display:none`; measure CPU (idle + active typing) and RAM (`footprint`), mirroring WP4's method
- [x] Record findings + pass/fail + any mitigation in the probe writeup

### WP2: Editor shell — CodeMirror 6 mounted in the right half (open/save) ✅ SHIPPED 2026-06-19 (commit a84f3e9)

**Description:** Mount CodeMirror 6 (via `@uiw/react-codemirror`) as an `EditorPanel` inside each workspace's right half, replacing the Milestone 1 placeholder card for the editor case. Open a file (read via `tauri-plugin-fs`), edit, save (write-back). Dark-only theme. No feature layering yet — this is the working shell the rest builds on.
**Milestone:** Milestone 2
**Dependencies:** WP1 (probe settles the mount + focus pattern)
**Size:** M
**Tasks:**
- [x] Add CM6 deps (`@uiw/react-codemirror` + granular `@codemirror/*`) to `package.json`; pin to the research-verified versions (+ `@codemirror/lang-markdown`, `@lezer/highlight` added at verify-human)
- [x] `EditorPanel` React component: mounts a CM6 `EditorView` in the right half; dark theme extension (no light variant) — VS Code Dark+ syntax style
- [x] Open file: backend `read_file(root, path)` (dedicated `editor_fs` Rust module, NOT tauri-plugin-fs) → load contents with the right language mode by extension
- [x] Save file: Cmd+S write-back; surface write errors inline (the WP6/WP7 IPC-error-surfacing lesson)
- [x] Language-mode loading per file extension (granular imports — js/ts/jsx/tsx/rust/markdown + plaintext fallback)
- [x] Verify in `pnpm tauri dev` on real macOS (WKWebView), not just vite dev — verify-human confirmed open/edit/save/theme/markdown

### WP3a: Editor core-editing parity (multi-cursor, find/replace, font-zoom) ✅ SHIPPED 2026-06-20 (commit 59cc324)

**Description:** The daily-must-have editing features on top of the WP2 shell — the ones the operator uses constantly in Sublime. Each is a CM6 extension or small keybinding/config per `research.md`. Minimap rides along as a deferrable extra (lowest-confidence dep). Split from the original packed WP3 on 2026-06-19 (operator: "too much packed into it").
**Milestone:** Milestone 2
**Dependencies:** WP2
**Size:** M
**Tasks:**
- [x] Multi-cursor / multiple selections (`allowMultipleSelections` + `rectangularSelection` + `crosshairCursor`; operator chose **Cmd-drag** over CM6's Alt default; + Cmd-D select-next)
- [x] In-file find/replace (`@codemirror/search`, top panel, dark-styled; find = Cmd+F, replace = **Cmd+R** per operator). Built-in panel used — the `@rigstech` VS-Code panel was not needed.
- [x] **Font-size zoom** (Cmd+= / Cmd+- / Cmd+0 reset, Sublime parity) — `Compartment`-swapped `fontSizeTheme` (replaced the hardcoded 13px); pure `fontZoom.ts` (clamp 8–32px); persisted **globally** in localStorage.
- [x] Minimap (`@replit/codemirror-minimap`) — **SHIPPED** (not deferred): peer-deps all cleared against pinned CM6, browser-confirmed render. + scroll-past-end (`scrollPastEnd()`) added on operator request.

### WP3b: Editor command palette ✅ SHIPPED 2026-06-20 (commit 3699a22)

**Description:** A net-new React command-palette overlay over CM6's command set (syntax/mode selection to start; an extension point for more commands later). CM6 has no turnkey palette, so this is a small custom subsystem, not a config flip — which is why it's its own WP. Must honor the WP1 capture-phase focus pattern so the palette hotkey fires while the cursor is in the editor.
**Milestone:** Milestone 2
**Dependencies:** WP2, WP1 (focus/keymap pattern)
**Size:** M
**Tasks:**
- [x] Command-palette React overlay (Cmd+Shift+P) over CM6 commands; keyboard nav (↓/↑/Enter/Esc, dark overlay); honors the WP1 capture-phase document-keydown registration so it fires with focus inside CM6 (active-gated to the focused workspace)
- [x] Syntax/mode selection as the first command set (Set Syntax: JS/JSX/TS/TSX/Rust/Markdown/Plain Text via a language-override `Compartment`, default derived from extension, resets on file change); structured as an extensible `{id,title,run}` registry composed in EditorPanel + passed into the overlay
- [x] Coexists with the WP5 panel-switch hotkey + WP6 Cmd+P (no chord collisions) — Shift-required predicate distinct from bare ⌘P; codified by a chord-exclusivity matrix; chord-ownership map documented in `paletteCommands.ts` for WP5/WP6/WP8

### WP3c: Editor split panes ✅ SHIPPED 2026-06-20 (commit b72ed30)

**Description:** Split the editor into multiple `EditorView`s within the right-half panel — the riskiest of the old WP3's features (focus management, per-pane state, layout in a half-width panel). Isolated into its own WP so a hard layout/focus problem here can't block shipping the core-editing must-haves (WP3a).
**Milestone:** Milestone 2
**Dependencies:** WP2 (WP3a not strictly required, but land WP3a first so split panes inherit the finished editing feature set)
**Size:** M
**Tasks:**
- [x] Split panes within the editor (multiple `EditorView`s sharing or mirroring the document); decide split direction(s) at build, mindful of the half-width right panel — **SHARED-DOCUMENT model** (panes = viewports onto one file), vertical stack; N `<CodeMirror>` over one panel-level buffer
- [x] Per-pane focus + active-pane tracking; the panel-switch / save / palette hotkeys act on the focused pane — `onFocusCapture`→`focusPane`; save/palette are pane-agnostic (shared doc); `activePaneId` exposed for the WP5 panel-switch hotkey
- [x] Decide at build whether panes share one document state or are independent views; handle close-pane / last-pane edge cases — SHARED (P1.1 decision; independent-file split deferred → SURFACE-2026-06-20-WP3C-INDEPENDENT-FILE-SPLIT); close-pane + last-pane guard + focus-reassign + file-change-collapse in `editorPanes.ts` (pure reducer, 14 tests)

### WP4: Git diff viewer — `git2` data + styled-line hunk rendering ✅ SHIPPED 2026-06-20 (commit 4e2d742)

**Description:** The `DiffPanel`: a **Sublime-Merge-style** view-only git diff viewer — a collapsible Commits section on top + a scrolling column of collapsible per-file sections showing inline +/- hunks. `git2` (Rust) computes the real diff hunks + paginated commit history + per-commit diffs; the frontend renders styled +/- lines directly (NO `@codemirror/merge` — superseded at build). Comparable to Sublime Merge's basics — viewing only; no interactive staging/rebase/blame (out of M2 scope).
**Milestone:** Milestone 2
**Dependencies:** WP2 (CM6 in place)
**Size:** L (grew M→L: the first attempt's file-list+single-diff UX was rejected at verify-human; redesigned via full spec→plan→build×2 to the Sublime-Merge model, adding the commit-history view — SURFACE-2026-06-20-WP4-COMMIT-LOG-SCOPE-EXPANSION)
**Tasks:**
- [x] Add `git2` to `src-tauri/Cargo.toml` (v0.21, default-features=false)
- [x] Backend `git_diff` module: pure-fn cores (injected repo `&Path`, TempDir-testable) — `changed_files` (unstaged vs staged) + `file_hunks` (structured hunks) + `recent_commits` (paginated revwalk) + `commit_diff` (vs first-parent); thin Tauri command wrappers mapping errors to `String` (WP6/WP7 shape)
- [x] ~~Add `@codemirror/merge`~~ — SUPERSEDED: backend computes hunks, frontend renders styled +/- lines (no CM6 merge); lighter + exact Sublime-Merge look
- [x] `DiffPanel` React component: collapsible Commits section (Load-more) + stacked collapsible `FileDiffSection`s with inline `HunkView`s; unified styled-line render (operator-confirmed for the half-width panel)
- [x] Handle the common states: clean tree (No changes), staged + unstaged, new/deleted/binary, non-git dir (inline error), commit-vs-parent + root commit
- [x] Unit tests on the `git_diff` pure cores (TempDir git fixture: hunks/commit-log/commit-diff + edges) + frontend `diffModel` reducers/helpers

### WP5: RightPanelHost + panel-switch hotkey ✅ SHIPPED 2026-06-20 (commit 4546ffb)

**Description:** The per-workspace `RightPanelHost` that owns the right half and swaps between Editor (WP2/3), Diff (WP4), and the second terminal (WP9 — wired in when present). **Per-panel DIRECT-SELECT hotkeys** (⌘⇧E Editor / ⌘⇧D Diff / ⌘⇧T Terminal — NOT cycling) + clickable tabs select the active panel; per-workspace panel state (active panel, open file). This is where the WP1 hotkey-while-focused finding is applied for real. Also folds in the permanent "Open in Sublime Merge" button (`smerge_open`) and reassigns the Sublime *Text* pop chord ⌘⇧E→⌘⇧O. ✅ SHIPPED 2026-06-20.
**Milestone:** Milestone 2
**Dependencies:** WP1 (hotkey/focus pattern), WP2 (editor panel), WP4 (diff panel)
**Size:** M
**Tasks:**
- [x] `RightPanelHost` component: holds active-panel state per workspace; renders Editor / Diff / (second terminal) and toggles visibility (extracted from the inline WP4 stopgap in Workspace.tsx)
- [x] Per-panel **direct-select** hotkeys ⌘⇧E/⌘⇧D/⌘⇧T (NOT cycling) + clickable tabs, using the WP1-validated capture-phase registration so they fire while focus is inside CM6; ⌘⇧T reserved/no-op until WP9 mounts the terminal panel
- [x] Per-workspace panel state preserved across center-stage switches (panels stay mounted, mirroring the workspace-stays-mounted rule)
- [x] Wire the right half from the M1 placeholder to RightPanelHost (the placeholder card is now only the empty/no-file state)
- [x] (folded in) Permanent "Open in Sublime Merge" button + `smerge_open` backend command; Sublime Text pop chord ⌘⇧E→⌘⇧O (transitional)

### WP6: Cmd+P fuzzy file finder (app-layer) ✅ SHIPPED 2026-06-20 (commit fc77ad4)

**Description:** **App-layer subsystem, NOT an editor feature** (`research.md` correction). A backend file index of the workspace's project dir + a React fuzzy-picker overlay; selecting a file opens it into the EditorPanel. Honors `.gitignore`.
**Milestone:** Milestone 2
**Dependencies:** WP2 (opening a picked file needs the editor), WP5 (overlay lives over the panel host; hotkey via WP1 pattern)
**Size:** M (grew slightly: folded in a dev-only `?ws=`/`window.__seedWorkspace` workspace-seed seam that unwedges verify-self for the workspace UI — closes SURFACE-2026-06-20-WP4-VERIFY-SELF-DIALOG-STUB-WEDGE, makes WP7/WP10/WP9 verify-self-able)
**Tasks:**
- [x] Backend `fs_index` module: walk the workspace project dir, honor `.gitignore` (via the `ignore` crate; `.git/` excluded, dotfiles shown), return the file list (pure `walk_index_core` + `fs_index` Tauri command, errors surfaced not swallowed) — 9 tests
- [x] React fuzzy-picker overlay (Cmd+P): fuzzy-match over the index (pure `fuzzyMatch`/`rankFiles`), keyboard nav, open-on-select → EditorPanel (active-pane via the existing `openPath` seam); removed the WP2 path-input stopgap
- [x] Cmd+P chord coexists with CM6 focus (WP1 capture-phase pattern; bare-⌘P `isFinderChord` exclusive vs ⌘⇧P / ⌘⇧E·D·T)
- [x] Unit tests on the fuzzy-match predicate (pure) + the gitignore-honoring walk (21 frontend finder tests + 9 backend fs_index tests)
- [x] (folded in) Dev-only `?ws=`/`window.__seedWorkspace` seed seam (DEV-gated, reuses `openWorkspace`) — unwedges verify-self; 7 `parseSeedParam` tests

### WP7: Project-wide find/replace (app-layer) ✅ SHIPPED 2026-06-21 (commit 8a788bf)

> **SHIPPED 2026-06-21 (commit 8a788bf).** Phase 1 (backend `project_search`, earlier cycle) + Phase 2 (search → Sublime-style "Find Results" synthetic tab, redefined after the F26 UX redirect) + Phase 3 (project-wide Replace All). The ⌘⇧F overlay is a query+replace input box; results render into a read-only WP12 synthetic tab (file-path headers + `   <line>:  <text>` rows + highlighted matched text, font matching the editor zoom); clicking a match row opens the file at the match. Replace All is gated on a search with matches, behind a blast-radius confirm; the backend `project_replace` reuses the same composed regex + walk as search (regex `$1` / substring-literal), writes atomically via `editor_fs`. **Deferred:** per-result + per-file replace (the read-only tab has no per-row affordance) → backlog SURFACE-2026-06-21-WP7-PER-RESULT-PER-FILE-REPLACE. Review-quality: 0 CRITICAL / 2 MAJOR / 2 MINOR (auto-backlogged). Archived WIP: `workflow/archive/m2-wp7-project-search.md`.

**Description:** **App-layer subsystem** (`research.md` correction — `@codemirror/search` is single-document only). A backend ripgrep-style content search over the project dir → results; opening a result loads the file + highlights the match. **Result UX (revised 2026-06-21):** results render into a **Sublime-style "Find Results" tab** in the editor (a synthetic read-only buffer/tab), NOT a floating overlay; clicking a result line opens the file at the match. The small ⌘⇧F query input stays as an overlay; only the *results* move to a tab. Replace shipped as project-wide Replace All (per-result/per-file deferred).
**Milestone:** Milestone 2
**Dependencies:** WP2 (open+highlight result), WP6 (shares the fs-walk/index infrastructure), **WP12 (editor multi-file tab strip — the Find Results tab is a tab in it; added 2026-06-21)**
**Size:** M
**Tasks:**
- [x] Backend `project_search` module: ripgrep-style content search over the project dir (honor `.gitignore`); return file + line + match-range results (pure-fn core + Tauri command) — SHIPPED (Phase 1, 17 tests; reuses WP6's `ignore` walker; in-process `regex`, no `rg` binary)
- [x] Render results into a **Find Results tab** (WP12 synthetic buffer) — grouped-by-file, highlighted matched text, open-on-click → EditorPanel + in-document highlight (the open-at-match seam). The floating-overlay result list was superseded by the tab (Phase 2 redefinition). — SHIPPED
- [x] Project-wide *replace* — project-wide Replace All shipped (overlay Replace field + blast-radius confirm; backend `project_replace` reuses search's regex+walk; regex `$1` / substring-literal). Per-result + per-file deferred to backlog. — SHIPPED (Phase 3)
- [x] Unit tests on the search core (TempDir fixture with known matches) — SHIPPED (Phase 1); + 9 replace_core cargo tests + findResultsBuffer/replaceConfirm vitest (Phase 2/3)

### WP10: File-tree navigator (app-layer) ✅ SHIPPED 2026-06-20 (commit 348376b)

**Description:** **App-layer subsystem** — a persistent left-side file-tree explorer of the workspace's project dir (VS Code/Sublime-sidebar model), in addition to WP6's Cmd+P fuzzy-open. Operator-designated **must-have** (added 2026-06-19 at WP2 verify-human: the path-input stopgap and Cmd+P alone don't cover browsing an unfamiliar tree). Renders a collapsible directory tree; clicking a file opens it into the EditorPanel; honors `.gitignore`. Lives in the workspace's right-half panel chrome (it browses *into* the editor) — exact placement (left rail of the right half vs. a togglable overlay) decided at build, mindful of the 50/50 split's horizontal budget.
**Milestone:** Milestone 2
**Dependencies:** WP2 (clicking a node opens into the editor), WP6 (**reuses the `fs_index` fs-walk/.gitignore infrastructure** — do WP6 first; WP10 consumes the same backend, adding directory structure to the flat index or a `list_dir` command), WP5 (the tree is part of the RightPanelHost chrome / a panel)
**Size:** M
**Tasks:**
- [x] Backend: extended `fs_index` with a dirs-included `walk_tree_core` (returns tagged `TreeEntry{path,is_dir}`, empty dirs included) + `fs_tree` Tauri command; factored shared `check_root`/`project_walker`/`rel_posix` helpers so finder + tree provably share one exclusion contract (gitignore on, `.git/` excluded, dotfiles shown); errors surfaced as `String` — 8 new tests
- [x] React `FileTree` component: collapsible directory tree (pure `buildTree` nester + pure `treeState` reducer), click-to-open → EditorPanel via the existing `openFile` seam; reflects + highlights the active file; inline IPC-error row (not swallowed). Arrow-key nav deferred as a low-pri stretch (SURFACE-2026-06-20-WP10-ARROW-KEY-TREE-NAV)
- [x] Placement: a collapsible LEFT RAIL inside the right half (`.right-panel-body` horizontal row = `[ rail | panel-column ]`); collapse toggle reclaims width, state persists across center-stage switches, FileTree stays mounted (CSS `display:none` on collapse — not unmount)
- [x] Unit tests on the tree-building / gitignore-honoring walk (pure cores, TempDir fixture) — 8 backend `walk_tree_core` + 12 frontend (`buildTree` + `treeState`)

### WP8: Relocate both Sublime launchers into the panel tab row as icon buttons; drop the ⌘⇧O hotkey ✅ SHIPPED 2026-06-20

> **REDEFINED by operator 2026-06-20** — supersedes the old "remove the Sublime *Text* pop, gated on WP9 editor-parity" scope. WP8 is **no longer a removal WP** and the **parity gate is dropped** (WP8 no longer removes the editor's escape hatch, so it needs no parity proof and is **NOT gated on WP9**). Both Sublime launchers are now kept permanently.

**Description:** A frontend UI consolidation. Both Sublime launchers (Text + Merge) move out of the standalone `SublimeToolbar` strip and into the existing `right-panel-toggle` tab row in `RightPanelHost` (alongside the Editor / Diff tabs), rendered as compact **icon buttons** (inlined-SVG marks, no text labels) right-aligned past a divider so they read as *actions* distinct from the selectable tabs. The now-redundant Sublime-**Text** `⌘⇧O` hotkey is **deleted** (the always-visible button is the only affordance) — `chord.ts` (the Text-only matcher) + its test are removed; `SublimeToolbar.tsx` is deleted (the two `invoke` handlers move to a small pure `sublimeLaunch.ts`). **Backend is UNTOUCHED:** `sublime_open`, `smerge_open`, `find_subl`/`find_smerge`, the shared `resolve`/`tool_command`/`spawn`, and all consts STAY. `⌘⇧O` is freed (left unbound); the panel-select chords (`panelHost.ts`) + finder chord survive.
**Milestone:** Milestone 2
**Dependencies:** WP5 (the `right-panel-toggle` tab row + `RightPanelHost` chrome the buttons move into; the `smerge_open` button shipped here). **NOT gated on WP9.**
**Size:** S
**Tasks:**
- [x] Frontend: inlined-SVG icon components (`SublimeTextIcon` / `SublimeMergeIcon`); both launchers as icon buttons in the `right-panel-toggle` row (right-aligned past a `.panel-launch-group` divider), each calling its backend command via `sublimeLaunch.ts` with the workspace path
- [x] Delete the `⌘⇧O` Sublime-Text hotkey: remove the `keydown` handler + delete `chord.ts` + `chord.test.ts`; delete `SublimeToolbar.tsx`. KEEP both launch affordances (Text + Merge buttons)
- [x] Backend unchanged (both commands + resolver + consts stay); reconcile stale comments (`paletteCommands.ts` chord map, `App.tsx`, `EditorPanel.tsx`) + the `paletteCommands.test.ts` chord-exclusivity matrix (⌘⇧O now FREED)
- [x] Unit test `sublimeLaunch.ts` (command name + `{projectPath}` + caught-rejection); gates clean (tsc/eslint/prettier; vitest 206; cargo 90 untouched)

### WP9: Second-terminal panel + Milestone 2 polish & exit-criteria

**Description:** Add the ad-hoc second-terminal panel to the RightPanelHost (a plain shell via the `CcSession` seam, not `claude`), then the Milestone 2 polish + exit-criteria pass: a full editing+diff day inside the right half, dogfood, error handling, and confirm the exit criteria.
**Milestone:** Milestone 2
**Dependencies:** WP5 (panel host), WP3a/3b/3c + WP4 (editor features + diff working)
**Size:** M
**Tasks:**
- [ ] Second-terminal panel: a `PtyCcSession`-equivalent spawning the user's shell (not `claude`) in the workspace dir, mounted as a RightPanelHost panel; reuse the `cc_*` command + event pattern
- [ ] N-mounted-editors sanity check in the real app (apply the WP1 probe finding + any mitigation; not a separate probe)
- [ ] Error handling: file open/save failures, non-git dir for the diff panel, empty search
- [ ] Dogfood: a full working day of editing + diff review entirely inside Claudesk's right half
- [ ] **EDITOR-PARITY DOGFOOD CHECKPOINT (informational; was buried in old WP3, pulled here 2026-06-19):** during dogfooding, record whether the in-app editor covers the operator's daily Sublime feature set (multi-cursor, find/replace, font-zoom, palette, split panes as needed). **No longer a gate on anything** — WP8 was redefined 2026-06-20 to KEEP both Sublime launchers (the Sublime Text pop is no longer removed), so this checkpoint gates no removal. Kept purely as a dogfood quality signal: a missing/hard gesture becomes a backlog item, not a blocker. Record the verdict explicitly.
- [ ] Confirm exit criteria: editing + diff review complete inside the right half with the panel-switch hotkey. (NOTE: "the Sublime Text pop is removed" is NO LONGER an exit criterion — WP8's 2026-06-20 redefinition keeps both Sublime launchers as permanent icon-button affordances; `subl`/`smerge` remain permanent companion surfaces, not routine-work dependencies to eliminate.)

### WP11: Tree/editor density polish + Sublime-style git-change indicators

**Description:** Post-WP10 polish requested by the operator at WP10 verify-human (2026-06-20), promoted from a backlog SURFACE to a WP at operator direction. Two parts: (A) quick density/sizing tweaks to the file tree + minimap, and (B) the substantive piece — **Sublime-Text-style git-change indicators** on file-tree rows (the colored status dots in Sublime's sidebar: modified / added / untracked / etc.). Part B is a real subsystem: a backend `git_status` source (reuse `git2` from WP4's `git_diff` module — a per-path status walk) feeding a per-row indicator in `FileTree`/`TreeRow`.
**Milestone:** Milestone 2
**Dependencies:** WP10 (the FileTree rail + `fs_tree`), WP4 (`git2` / `git_diff` module — reuse for the status walk), WP3a (the `@replit/codemirror-minimap` whose width part A adjusts)
**Size:** M (Part A is S/CSS-config; Part B is the M-sized git-status subsystem)
**Tasks:**
- [ ] **(A)** File-tree rail 66% wider — `.file-tree-rail` width 200px → ~332px (200 × 1.66)
- [ ] **(A)** Tree rows ~2/3 current height + correspondingly smaller font — `.file-tree-row` padding/line-height to ~2/3, font-size proportionally smaller (denser; more files visible)
- [ ] **(A)** Minimap 75% of current width — adjust the `@replit/codemirror-minimap` width option / container CSS
- [ ] **(B)** Backend `git_status` core + command: reuse `git2` (already a dep, WP4) to return per-path working-tree status (modified / added / deleted / untracked / clean) for the workspace dir; pure-fn core (TempDir git-fixture testable) + thin Tauri command (errors surfaced as `String`, the WP6 lesson)
- [ ] **(B)** Per-row git-status indicator in `FileTree`/`TreeRow`: a colored dot/mark per file (and rolled-up for dirs, optional) reflecting `git_status`; dark-only palette matching Sublime's convention. Refresh policy decided at build (on tree load + on save; a live `notify` watcher is out of scope — that's the Phase-2 watcher milestone)
- [ ] Unit tests: the `git_status` pure core (TempDir git fixture with known modified/untracked/clean files) + any pure status→indicator mapping helper

**Source:** operator request at WP10 verify-human, 2026-06-20 (reference image: Sublime sidebar status dots). Originally captured as SURFACE-2026-06-20-WP10-FOLLOWUP-TREE-EDITOR-POLISH; promoted to this WP at operator direction.

### WP12: Editor multi-file tab strip (Sublime-style open-file tabs) ✅ SHIPPED 2026-06-21 (commit f2c86d7)

> **As-built (redefined during build via 3 operator back-loops):** the model is **per-pane VS-Code split-editor groups** — panes are top-level (reused `editorPanes` reducer), each pane owns its own tab strip + ordered open-file set (`openFiles` reducer per pane). Buffers are SHARED via a per-workspace document store (`editorDocs`, ref-counted by path) so the SAME file open in two panes is ONE buffer (edit mirrors live; dirty + save document-level); `EditorPanel` became a VIEW. Disk-change detection (Phase 3): synchronous `stat_file` (mtime+size) check on tab-activate + pre-save → silent reload when clean, conflict popup when dirty, save-guard (no live watcher — deferred, SURFACE-2026-06-21-EDITOR-FILE-WATCHER). Synthetic read-only buffer hook (`SyntheticView` + dev-only `window.__editorSynthetic`) = the WP7 Find-Results seam. ⌘1..⌘9 tab switch (bare ⌘+digit; ⌘⇧+digit reserved for the filmstrip). Realizes the deferred independent-file split. Operator-approved across all phases via native verify.

**Description:** A new editor subsystem: a **row of open-file tabs** across the top of the editor panel (Sublime/VS-Code model — e.g. `wbs.md | roadmap.md | Find Results`), each a switchable, closable tab with its own editor state. Today's editor opens **one file at a time** (`openPath: string` — opening a new file replaces the current); WP3c split panes are viewports onto the *same* file (shared-document; independent-file-per-pane was deferred). This WP introduces the concept of **multiple files open at once**, each addressable as a tab. It also adds a **synthetic read-only buffer** hook — a tab whose content is supplied programmatically rather than read from disk — which is exactly what WP7's "Find Results" tab needs (and a foundation for future synthetic views). The dependency surfaced when WP7's operator-chosen Sublime "Find Results" UX turned out to require this tab strip first (SURFACE-2026-06-21-EDITOR-MULTI-FILE-TAB-STRIP).
**Milestone:** Milestone 2
**Dependencies:** WP2 (the EditorPanel this wraps), WP5 (RightPanelHost — the editor panel lives inside it; the file-tab strip is distinct from the panel-select tab row), WP3c (the shared-document pane model the open-file model extends/coexists with). Folds in the deferred **SURFACE-2026-06-20-WP3C-INDEPENDENT-FILE-SPLIT** (independent-file panes).
**Size:** L (a real new state model + UI + per-file editor state; not a small slice)
**Tasks:**
- [x] Open-files state model — `openFiles.ts` pure reducer PER PANE (open-or-activate / close / activate-index ⌘1..9 / add-synthetic; last-file edge cases), 22 tests. (Per-pane, not a single global set — the split-group redefinition.)
- [x] Per-file editor state — lifted into the per-workspace SHARED `editorDocs` store (ref-counted by path): same file in N panes = ONE buffer; `EditorPanel` is a VIEW (cursor/scroll per-view). Supersedes "each file its own buffer" → shared, per operator P2.vh.9.
- [x] Tab-strip UI — `.editor-tab-strip` per pane (dark tokens, label + ●dirty + ✕, active highlight, horizontal-scroll overflow); ⌘1..⌘9 keyboard switch (bare ⌘+digit; chord-ownership map updated, ⌘⇧+digit reserved for filmstrip).
- [x] Synthetic read-only buffer hook — `SyntheticView` (read-only CM6) + `EditorSplit.addSynthetic`/`setSyntheticContent` + click-line→callback + dev-only `window.__editorSynthetic`; generic (WP7 first consumer).
- [x] Wire the open seams (Cmd+P finder, file tree, diff "Open", WP7 search open-at-match) through the open-files model via `RightPanelHost.openFile` → focused pane; open-at-match highlight applies to the activated view. No single-file regression.
- [x] Unit tests — openFiles 22 + editorDocs 17 + diskConflict 10 + confirmDialog 5 + tabSwitchChord + labelForPath + paletteCommands matrix + 4 cargo stat_file. Full suite: vitest 301, cargo 111.
- [x] (added during build) Disk-change detection — `diskConflict.ts` + `stat_file` (Phase 3): on-activate/pre-save check, silent reload / conflict popup / save-guard. Live watcher deferred → SURFACE-2026-06-21-EDITOR-FILE-WATCHER.

**Source:** SURFACE-2026-06-21-EDITOR-MULTI-FILE-TAB-STRIP (high) — surfaced from WP7 Phase-2 verify-human when the operator chose the Sublime "Find Results" tab UX, which depends on an editor open-file tab strip not previously planned. Operator decision 2026-06-21: build WP12 first, then resume WP7 to render Find Results into a WP12 tab.

## Milestone 2 critical path

```
WP1 ✅─► WP2 ✅─► WP3a ✅ (core editing) ──► WP3b ✅ (palette) ──► WP3c ✅ (split) ──┐
              │                                                              │
              ├──► WP4 ✅ (diff viewer) ───────────────────────────────────►├─► WP9 dogfood + exit-criteria
              ├──► WP5 ✅ (panel host) ─┬──► WP8 ✅ (Sublime icon buttons) ──►│
              │       ▲                 └──(frontend-only, parallel)─────────►│
              ├──► WP6 ✅ (file finder)┬──► WP10 ✅ (file-tree) ─────────────►│
              │                        └──► WP12 (editor tab strip) ──► WP7 (project search: Find Results tab) ──►│
              └──► WP7 backend ✅ (search core shipped; UX paused on WP12)────────────────────────────────────►┘
```

- **Critical path:** WP1 ✅ → WP2 ✅ → WP3a → WP3b → WP3c → WP9 (dogfood + exit-criteria). WP8 is **no longer on the critical path** — its 2026-06-20 redefinition made it a small frontend-only UI consolidation that depends only on WP5's tab row. WP4/5/6/8/10 are parallel slices feeding WP9's final dogfood + exit-criteria.
- **WP12 → WP7 (added 2026-06-21):** WP7's backend search core shipped, but its result UX (operator-chosen Sublime "Find Results" tab) depends on **WP12 (editor multi-file tab strip)**, which is new. So WP7 is **paused** and now has a hard dependency on WP12: build WP12, then resume WP7 to render results into a Find Results tab. WP12 itself depends on WP2/WP5/WP3c (it extends the editor's single-file model into multi-file open tabs) and folds in the deferred independent-file-split SURFACE.
- **WP3 was split 2026-06-19** (operator: "too much packed in") into **WP3a** (core editing — multi-cursor/find-replace/font-zoom/minimap), **WP3b** (command palette), **WP3c** (split panes). WP3a is the must-have; 3b/3c are independent and can be sequenced or parallelized after 3a. The old WP3's "daily-parity confirmation" task moved to WP9 as a dogfood checkpoint (it no longer gates anything since WP8's redefinition).
- **Parallelizable after WP2 (✅ shipped):** WP3a, WP4 (diff), WP6 (file finder), WP7 (search), WP8 (Sublime icon buttons), WP10 (file-tree) are largely independent slices; WP5 (panel host) needs WP2 + WP4; WP8 needs WP5's tab row. WP6/WP7/WP10 share fs-walk infrastructure (do WP6's index first; WP7 and WP10 reuse it). WP3b/3c depend on WP3a landing first (inherit the finished editing set).
- **WP1 gates the panel-host + finder + palette hotkeys.** ✅ settled — capture-phase listener pattern. WP3b/WP5/WP6 apply it.
- **WP8 is NOT gated and NOT last** (redefined 2026-06-20) — it keeps both Sublime launchers (no removal, no parity proof needed) and shipped 2026-06-20 as a frontend-only consolidation. The old "gated on WP9's parity gate, last build WP" framing is superseded.
- **App-layer callout:** WP6 (fuzzy finder), WP7 (project-wide search), and WP10 (file-tree navigator) are Rust+React subsystems, not editor configuration — the single biggest scoping point from `research.md`. They are sized as full WPs, not editor sub-tasks. WP10 was added 2026-06-19 (operator must-have at WP2 verify-human).

## Future milestones

Tracked in [`roadmap.md`](roadmap.md) (Milestones 3–9: stateful CC controller, multi-workspace, status surfaces, polish & release). Decomposed just-in-time when each opens — not here.

## SURFACE-IN history

- [2026-06-21] **WP12 (editor multi-file tab strip) added + WP7 paused** — at WP7 Phase-2 verify-human the operator confirmed search works but redirected the result UX from a floating overlay to the Sublime "Find Results" **tab** model, which depends on an editor open-file tab strip (`wbs.md | roadmap.md | Find Results`) that didn't exist and wasn't planned (today's editor opens one file; WP3c panes are same-file viewports). Added **WP12** (editor multi-file tab strip + synthetic read-only buffer hook; folds in the deferred SURFACE-2026-06-20-WP3C-INDEPENDENT-FILE-SPLIT), made **WP7 depend on WP12**, and **paused WP7** mid-Phase-2 (its backend + searchModel + highlight seam are reusable forward). Operator decision: build WP12 first, then resume WP7 to render Find Results into a WP12 tab. Source: SURFACE-2026-06-21-EDITOR-MULTI-FILE-TAB-STRIP → feature:build (WP7) → product:wbs (P11 SURFACE-IN).
- [2026-06-20] **WP8 REDEFINED + shipped** — operator reversed WP8's scope: it is **no longer a removal WP** (both Sublime launchers are KEPT) and the **parity gate is dropped** (WP8 is no longer gated on WP9). New scope: relocate both Sublime launchers into the `right-panel-toggle` tab row as inlined-SVG icon buttons + delete the redundant `⌘⇧O` Sublime-Text hotkey; backend untouched. Shipped same day. The WP8 section, the M2 critical-path diagram + notes, and WP9's parity-gate task were all resynced to the new scope. Source: operator directive → feature workflow (WP8).
- [2026-06-19] **WP10 (file-tree navigator) added** — operator designated it a must-have at WP2 Phase-1 verify-human. App-layer subsystem reusing WP6's `fs_index` infrastructure; parallel to the critical path. Source: feature:build (WP2) → product:wbs.
- [2026-06-19] **WP3 split into WP3a/WP3b/WP3c** — operator flagged the original WP3 as over-packed (6 features under one "M"). Split into WP3a (core editing: multi-cursor / find-replace / font-zoom / minimap), WP3b (command palette — net-new overlay subsystem), WP3c (split panes — riskiest layout work). The old WP3's "daily-Sublime-parity confirmation" task was pulled out and relocated to **WP9** as an explicit parity gate that unblocks WP8's Sublime-pop removal. Source: operator review → product:wbs.
