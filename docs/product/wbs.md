---
stage: wbs
state: in-progress
updated: 2026-06-20
milestone: 2
# WP1, WP2, WP3a, WP3b, WP3c, WP4 shipped; WP5/WP6/WP7/WP10/WP8/WP9 remain
---

# Work Breakdown Structure — Milestone 2: Lite Editor + Diff Viewer

**Cycle scope:** **Milestone 2 only** (Lite Editor + Diff Viewer — the in-app right-half editor that *replaces* Sublime Text for routine work). Milestones 3–9 are tracked in [`roadmap.md`](roadmap.md) and are **deliberately not decomposed** here — just-in-time decomposition happens when each milestone opens. The completed Milestone 1 (Phase 1) WBS is archived at [`archive/phase-1-bare-shell-poc/wbs.md`](archive/phase-1-bare-shell-poc/wbs.md).

**Grounding docs:** [`arch.md`](arch.md) → "Milestone 2 architecture" (RightPanelHost, component table, design constraints); [`research.md`](research.md) (CodeMirror 6 decided over Monaco; the two app-layer scoping corrections; the `git2` + `@codemirror/merge` diff split; risk list).

## Milestone 2 ordering rationale

Learning-sequence ordering, riskiest-unknown-first:

1. **CM6-integration probe first (WP1)** — two genuine unknowns flagged in `research.md` carry the most risk-of-rework: (a) does the **panel-switch hotkey fire while focus is inside a CM6 editor** (the WP8-class keymap-focus problem), and (b) do **N mounted CM6 editors stay within the perf envelope** (WP4 probed terminals, not editors). Resolve both cheaply before building the editor shell, so the panel-host design (WP5) isn't built on an assumption. No 3rd-party *API* probe is needed — CM6 / `@codemirror/merge` / `git2` are documented libraries with versions already verified in research; the probe is about *our* integration, not their shapes.
2. **Editor shell before features (WP2)** — mount CM6 in the right half with file open/save, before layering multi-cursor/search/minimap/theme. Validates the `@uiw/react-codemirror` + `tauri-plugin-fs` path in WKWebView first.
3. **Editor features as additive layer (WP3)** — the Sublime-parity feature set on top of the working shell.
4. **Backend app-layer subsystems (WP4 diff, WP6 file finder, WP7 search)** — each is a Rust synchronous path (`git2` / fs-walk / ripgrep-style) behind Tauri commands, with a thin frontend. The diff viewer (WP4) pairs with `@codemirror/merge` rendering; the **fuzzy finder (WP6) and project-wide search (WP7) are app-layer subsystems, NOT editor config** (the load-bearing `research.md` correction).
5. **Panel host wiring (WP5)** ties the editor + diff + second-terminal panels into the per-workspace RightPanelHost with the panel-switch hotkey — depends on the probe (WP1) settling the hotkey/focus question and on the editor (WP2) + diff (WP4) panels existing.
6. **Gated Sublime-pop removal LAST (WP8)** — only after the in-app editor proves daily-use parity (vision Core Principle 3). It is the last build WP before polish, by design.
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

### WP5: RightPanelHost + panel-switch hotkey

**Description:** The per-workspace `RightPanelHost` that owns the right half and swaps between Editor (WP2/3), Diff (WP4), and the second terminal (WP9 — wired in when present). The panel-switch hotkey cycles the active panel; per-workspace panel state (active panel, open file). This is where the WP1 hotkey-while-focused finding is applied for real.
**Milestone:** Milestone 2
**Dependencies:** WP1 (hotkey/focus pattern), WP2 (editor panel), WP4 (diff panel)
**Size:** M
**Tasks:**
- [ ] `RightPanelHost` component: holds active-panel state per workspace; renders Editor / Diff / (second terminal) and toggles visibility
- [ ] Panel-switch hotkey cycling editor ↔ diff (↔ terminal), using the WP1-validated registration so it fires while focus is inside CM6
- [ ] Per-workspace panel state preserved across center-stage switches (panels stay mounted, mirroring the workspace-stays-mounted rule)
- [ ] Wire the right half from the M1 placeholder to RightPanelHost (the placeholder card is now only the empty/no-file state)

### WP6: Cmd+P fuzzy file finder (app-layer)

**Description:** **App-layer subsystem, NOT an editor feature** (`research.md` correction). A backend file index of the workspace's project dir + a React fuzzy-picker overlay; selecting a file opens it into the EditorPanel. Honors `.gitignore`.
**Milestone:** Milestone 2
**Dependencies:** WP2 (opening a picked file needs the editor), WP5 (overlay lives over the panel host; hotkey via WP1 pattern)
**Size:** M
**Tasks:**
- [ ] Backend `fs_index` module: walk the workspace project dir, honor `.gitignore`, return the file list (pure-fn core + Tauri command)
- [ ] React fuzzy-picker overlay (Cmd+P): fuzzy-match over the index, keyboard nav, open-on-select → EditorPanel
- [ ] Cmd+P chord coexists with CM6 focus (WP1 finding)
- [ ] Unit tests on the fuzzy-match predicate (pure) + the gitignore-honoring walk

### WP7: Project-wide find/replace (app-layer)

**Description:** **App-layer subsystem** (`research.md` correction — `@codemirror/search` is single-document only). A backend ripgrep-style content search over the project dir → results list; opening a result loads the file + highlights the match via `@codemirror/search`. Replace-across-files is in scope to the extent Sublime's project find/replace is (decide replace depth at build; search-first is the must-have).
**Milestone:** Milestone 2
**Dependencies:** WP2 (open+highlight result), WP6 (shares the fs-walk/index infrastructure)
**Size:** M
**Tasks:**
- [ ] Backend `project_search` module: ripgrep-style content search over the project dir (honor `.gitignore`); return file + line + match-range results (pure-fn core + Tauri command)
- [ ] React results panel: grouped-by-file results, open-on-click → EditorPanel + in-document highlight (`@codemirror/search` `SearchQuery`)
- [ ] Project-wide *replace* (scope decided at build — at minimum a per-result/per-file apply)
- [ ] Unit tests on the search core (TempDir fixture with known matches)

### WP10: File-tree navigator (app-layer)

**Description:** **App-layer subsystem** — a persistent left-side file-tree explorer of the workspace's project dir (VS Code/Sublime-sidebar model), in addition to WP6's Cmd+P fuzzy-open. Operator-designated **must-have** (added 2026-06-19 at WP2 verify-human: the path-input stopgap and Cmd+P alone don't cover browsing an unfamiliar tree). Renders a collapsible directory tree; clicking a file opens it into the EditorPanel; honors `.gitignore`. Lives in the workspace's right-half panel chrome (it browses *into* the editor) — exact placement (left rail of the right half vs. a togglable overlay) decided at build, mindful of the 50/50 split's horizontal budget.
**Milestone:** Milestone 2
**Dependencies:** WP2 (clicking a node opens into the editor), WP6 (**reuses the `fs_index` fs-walk/.gitignore infrastructure** — do WP6 first; WP10 consumes the same backend, adding directory structure to the flat index or a `list_dir` command), WP5 (the tree is part of the RightPanelHost chrome / a panel)
**Size:** M
**Tasks:**
- [ ] Backend: extend `fs_index` (WP6) to return directory structure, or add a lazy `list_dir(path)` Tauri command (pure-fn core + command; honor `.gitignore`) — decide eager-tree vs. lazy-expand at build based on project size
- [ ] React `FileTree` component: collapsible directory tree, keyboard nav, click-to-open → EditorPanel; reflects the active file
- [ ] Placement in the right-half chrome (left rail vs. togglable), respecting the horizontal budget of the 50/50 workspace split; collapsible to reclaim width
- [ ] Unit tests on the tree-building / gitignore-honoring walk (pure core, TempDir fixture)

### WP8: Remove the Sublime Text pop (gated on editor parity) — LAST build WP

**Description:** Delete the Milestone 1 Sublime Text stopgap once the in-app editor proves daily-use parity (vision Core Principle 3): the `sublime` Rust module + `sublime_open` command, the `⌘⇧E` `keydown` handler, and the right-panel "Open in Sublime" toolbar button. Frees the `⌘⇧E` chord. **Gate:** do not start until **WP9's parity gate passes** (the daily-Sublime-usage check now lives in WP9 dogfooding, not WP3) — if a relied-on gesture is hard in CM6, that gate surfaces it and the removal waits.
**Milestone:** Milestone 2
**Dependencies:** WP3a/3b/3c (editor features built), WP9 parity gate (parity proven), WP5 (panel-switch hotkey is the surviving right-half binding)
**Size:** S
**Tasks:**
- [ ] **Gate check:** WP9's parity gate has passed — operator confirmed the in-app editor covers daily Sublime usage
- [ ] Remove the frontend `SublimeToolbar` (button + `⌘⇧E` keydown handler) and its `chord.ts` helper
- [ ] Remove the backend `sublime` module + `sublime_open` command + its registration in `lib.rs`; drop the `which`/Sublime-discovery code
- [ ] Drop the `subl`-on-PATH prerequisite from `CLAUDE.md` / README; resync arch.md component table (remove the sublime row)
- [ ] Confirm no orphaned references (cargo + tsc + lint clean after removal)

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
- [ ] **PARITY GATE (owns the daily-Sublime-usage check; was buried in old WP3, pulled here 2026-06-19):** during dogfooding, confirm the in-app editor covers the operator's daily Sublime feature set (multi-cursor, find/replace, font-zoom, palette, split panes as needed). This is the **parity evidence WP8's Sublime-pop removal is gated on** — if a relied-on gesture is missing/hard, it surfaces here and WP8 waits. Record the verdict explicitly.
- [ ] Confirm exit criteria: editing + diff review complete inside the right half with the panel-switch hotkey; the Sublime Text pop is removed (WP8); `subl` is no longer a routine-work dependency

## Milestone 2 critical path

```
WP1 ✅─► WP2 ✅─► WP3a ✅ (core editing) ──► WP3b ✅ (palette) ──► WP3c ✅ (split) ──┐
              │                                                              │
              ├──► WP4 ✅ (diff viewer) ───────────────────────────────────►├─► WP9 dogfood + PARITY GATE ─► WP8 (remove Sublime pop) ─► WP9 exit-criteria
              ├──► WP5 (panel host) ───────────────────────────────────────►│
              │       ▲                                                      │
              ├──► WP6 (file finder) ──┬──► WP10 (file-tree) ───────────────►│
              └──► WP7 (project search)┴──(app-layer, parallel)─────────────►┘
```

- **Critical path:** WP1 ✅ → WP2 ✅ → WP3a → WP3b → WP3c → WP9 (dogfood + parity gate) → WP8 (Sublime-pop removal) → WP9 (exit-criteria). The parity gate inside WP9 dogfooding now *unblocks* WP8, so WP8 sits between WP9's dogfood and its final exit-criteria confirmation.
- **WP3 was split 2026-06-19** (operator: "too much packed in") into **WP3a** (core editing — multi-cursor/find-replace/font-zoom/minimap), **WP3b** (command palette), **WP3c** (split panes). WP3a is the must-have; 3b/3c are independent and can be sequenced or parallelized after 3a. The old WP3's "daily-parity confirmation" task moved to WP9 as the explicit parity gate.
- **Parallelizable after WP2 (✅ shipped):** WP3a, WP4 (diff), WP6 (file finder), WP7 (search), WP10 (file-tree) are largely independent slices; WP5 (panel host) needs WP2 + WP4. WP6/WP7/WP10 share fs-walk infrastructure (do WP6's index first; WP7 and WP10 reuse it). WP3b/3c depend on WP3a landing first (inherit the finished editing set).
- **WP1 gates the panel-host + finder + palette hotkeys.** ✅ settled — capture-phase listener pattern. WP3b/WP5/WP6 apply it.
- **WP8 is gated and last** (before WP9's final exit-criteria) — parity must be proven at WP9's gate first. The gate's daily-use check should include the file-tree (WP10).
- **App-layer callout:** WP6 (fuzzy finder), WP7 (project-wide search), and WP10 (file-tree navigator) are Rust+React subsystems, not editor configuration — the single biggest scoping point from `research.md`. They are sized as full WPs, not editor sub-tasks. WP10 was added 2026-06-19 (operator must-have at WP2 verify-human).

## Future milestones

Tracked in [`roadmap.md`](roadmap.md) (Milestones 3–9: stateful CC controller, multi-workspace, status surfaces, polish & release). Decomposed just-in-time when each opens — not here.

## SURFACE-IN history

- [2026-06-19] **WP10 (file-tree navigator) added** — operator designated it a must-have at WP2 Phase-1 verify-human. App-layer subsystem reusing WP6's `fs_index` infrastructure; parallel to the critical path. Source: feature:build (WP2) → product:wbs.
- [2026-06-19] **WP3 split into WP3a/WP3b/WP3c** — operator flagged the original WP3 as over-packed (6 features under one "M"). Split into WP3a (core editing: multi-cursor / find-replace / font-zoom / minimap), WP3b (command palette — net-new overlay subsystem), WP3c (split panes — riskiest layout work). The old WP3's "daily-Sublime-parity confirmation" task was pulled out and relocated to **WP9** as an explicit parity gate that unblocks WP8's Sublime-pop removal. Source: operator review → product:wbs.