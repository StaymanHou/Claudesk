---
stage: wbs
state: complete
updated: 2026-06-19
milestone: 2
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

### WP1: Probe — CodeMirror 6 integration unknowns (hotkey-focus + N-editor cost)

**Type:** probe
**Milestone:** Milestone 2
**Dependencies:** none (Milestone 1 shipped; the tab-shell substrate + right-half placeholder already exist)
**Size:** S
**Learning objective:** Answer the two `research.md`-flagged unknowns before the panel-host design commits to them: **(a)** can an app-level chord (the right-half panel-switch hotkey, and Cmd+P) fire reliably **while keyboard focus is inside a mounted CodeMirror 6 editor**, and what is the registration pattern that makes it work (CM6 keybinding that bubbles, vs. scoped document listener)? **(b)** what is the CPU/RAM cost of **N mounted CM6 instances** (e.g. 8 editors + a couple of `@codemirror/merge` MergeViews, all mounted, backgrounded ones `display:none`) on this macOS hardware — is it within the same envelope WP4's terminal probe used (<10% idle CPU, <300 MB RAM)?
**Timebox:** 1 day
**Success criterion:** A short writeup in `workflow/wip/m2-wp1-cm6-probe.md` recording: (a) the working hotkey-while-focused registration pattern (with the code shape that worked), and whether Cmd+P / panel-switch can coexist with CM6's keymap; (b) raw CPU/RAM numbers at N mounted editors + pass/fail vs the envelope, and any mitigation (e.g. lazy-mount backgrounded editors) if it fails. The writeup is the deliverable; no production code lands.
**Tasks:**
- [ ] Mount a CM6 editor (via `@uiw/react-codemirror`) in a throwaway harness; bind an app-level chord and test whether it fires while the editor has focus; find the registration that works (bubbling CM6 keybinding vs. capture-phase listener)
- [ ] Confirm Cmd+P and a panel-switch chord can both coexist with CM6's default keymap (no swallow)
- [ ] Mount N (≈8) CM6 editors + 2 `@codemirror/merge` MergeViews; background most with `display:none`; measure CPU (idle + active typing) and RAM (`footprint`), mirroring WP4's method
- [ ] Record findings + pass/fail + any mitigation in the probe writeup

### WP2: Editor shell — CodeMirror 6 mounted in the right half (open/save)

**Description:** Mount CodeMirror 6 (via `@uiw/react-codemirror`) as an `EditorPanel` inside each workspace's right half, replacing the Milestone 1 placeholder card for the editor case. Open a file (read via `tauri-plugin-fs`), edit, save (write-back). Dark-only theme. No feature layering yet — this is the working shell the rest builds on.
**Milestone:** Milestone 2
**Dependencies:** WP1 (probe settles the mount + focus pattern)
**Size:** M
**Tasks:**
- [ ] Add CM6 deps (`@uiw/react-codemirror` + granular `@codemirror/*`) to `package.json`; pin to the research-verified versions
- [ ] `EditorPanel` React component: mounts a CM6 `EditorView` in the right half; dark theme extension (no light variant)
- [ ] Open file: backend `read_file(path)` (or reuse `tauri-plugin-fs`) → load contents into the editor with the right language mode by extension
- [ ] Save file: write-back on a save keybinding; surface write errors (the WP6/WP7 IPC-error-surfacing lesson)
- [ ] Language-mode loading per file extension (import only the language packages used)
- [ ] Verify in `pnpm tauri dev` on real macOS (WKWebView), not just vite dev

### WP3: Editor feature set — Sublime parity

**Description:** Layer the daily-use Sublime features onto the WP2 shell: multi-cursor / column selection, find/replace within a file, command palette for syntax selection, split panes, minimap, **font-size zoom**. Each is a CM6 extension or small custom UI per `research.md`.
**Milestone:** Milestone 2
**Dependencies:** WP2
**Size:** M
**Tasks:**
- [ ] Multi-cursor / multiple selections (`allowMultipleSelections` + `drawSelection`; add the VS-Code-style alt-drag binding which is not default)
- [ ] In-file find/replace (`@codemirror/search`; optionally the `@rigstech/codemirror-vscodeSearch` VS-Code-look panel)
- [ ] Command palette for syntax/mode selection (thin React palette over CM6 commands; honor the WP1 focus/keymap finding)
- [ ] **Font-size zoom** (Cmd+= / Cmd+- / Cmd+0 reset, Sublime parity) — drives the editor `fontSize` (currently hardcoded 13px in WP2's `theme.ts`); make it a reactive/compartment-swapped value + persist per-project or globally. Operator-requested at WP2 verify-human (2026-06-19).
- [ ] Split panes within the editor (multiple `EditorView`s)
- [ ] Minimap (`@replit/codemirror-minimap`) — **optional/deferrable** per research risk; ship without it if it fights the CM6 version
- [ ] Confirm the feature set covers the operator's daily Sublime usage (this is the parity evidence WP8's removal gate depends on)

### WP4: Git diff viewer — `git2` data + `@codemirror/merge` rendering

**Description:** The `DiffPanel`: show the workspace project's changed files (unstaged + staged) and a per-file diff. `git2` (Rust) supplies the changed-file list + base-content blobs (HEAD blob for working-tree diffs, index blob for staged); `@codemirror/merge` renders the diff (it computes its own chunks from `(base, current)`). Comparable to Sublime Merge's basics — viewing only; no interactive staging/rebase/blame (out of M2 scope).
**Milestone:** Milestone 2
**Dependencies:** WP2 (CM6 in place; `@codemirror/merge` is CM6-based)
**Size:** M
**Tasks:**
- [ ] Add `git2` to `src-tauri/Cargo.toml`
- [ ] Backend `git_diff` module: pure-fn core (injected repo `&Path`, TempDir-testable) — list changed files (unstaged vs staged) + return base-content blob per file; thin Tauri command wrapper(s) mapping errors to `String` (WP6/WP7 shape)
- [ ] Add `@codemirror/merge` to `package.json`
- [ ] `DiffPanel` React component: changed-file list + selected-file diff via `MergeView` (side-by-side) or `unifiedMergeView` (inline) — pick one (unified likely better for the half-width panel; decide at build)
- [ ] Handle the common states: clean tree (no changes), file with both staged + unstaged hunks, new/deleted files
- [ ] Unit tests on the `git_diff` pure core (a TempDir git repo fixture: stage a change, assert file list + base blob)

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

**Description:** Delete the Milestone 1 Sublime Text stopgap once the in-app editor proves daily-use parity (vision Core Principle 3): the `sublime` Rust module + `sublime_open` command, the `⌘⇧E` `keydown` handler, and the right-panel "Open in Sublime" toolbar button. Frees the `⌘⇧E` chord. **Gate:** do not start until the operator confirms (at WP3/WP9 dogfooding) that the in-app editor covers their daily Sublime usage — if a relied-on gesture is hard in CM6, this gate surfaces it and the removal waits.
**Milestone:** Milestone 2
**Dependencies:** WP2, WP3 (editor parity must be proven first), WP5 (panel-switch hotkey is the surviving right-half binding)
**Size:** S
**Tasks:**
- [ ] **Gate check:** operator confirms the in-app editor covers daily Sublime usage (parity evidence from WP3 + dogfooding)
- [ ] Remove the frontend `SublimeToolbar` (button + `⌘⇧E` keydown handler) and its `chord.ts` helper
- [ ] Remove the backend `sublime` module + `sublime_open` command + its registration in `lib.rs`; drop the `which`/Sublime-discovery code
- [ ] Drop the `subl`-on-PATH prerequisite from `CLAUDE.md` / README; resync arch.md component table (remove the sublime row)
- [ ] Confirm no orphaned references (cargo + tsc + lint clean after removal)

### WP9: Second-terminal panel + Milestone 2 polish & exit-criteria

**Description:** Add the ad-hoc second-terminal panel to the RightPanelHost (a plain shell via the `CcSession` seam, not `claude`), then the Milestone 2 polish + exit-criteria pass: a full editing+diff day inside the right half, dogfood, error handling, and confirm the exit criteria.
**Milestone:** Milestone 2
**Dependencies:** WP5 (panel host), WP3 + WP4 (editor + diff working)
**Size:** M
**Tasks:**
- [ ] Second-terminal panel: a `PtyCcSession`-equivalent spawning the user's shell (not `claude`) in the workspace dir, mounted as a RightPanelHost panel; reuse the `cc_*` command + event pattern
- [ ] N-mounted-editors sanity check in the real app (apply the WP1 probe finding + any mitigation; not a separate probe)
- [ ] Error handling: file open/save failures, non-git dir for the diff panel, empty search
- [ ] Dogfood: a full working day of editing + diff review entirely inside Claudesk's right half
- [ ] Confirm exit criteria: editing + diff review complete inside the right half with the panel-switch hotkey; the Sublime Text pop is removed (WP8); `subl` is no longer a routine-work dependency

## Milestone 2 critical path

```
WP1 (probe) ──► WP2 (editor shell) ──► WP3 (editor features) ──┐
                      │                                         ├─► WP8 (remove Sublime pop, gated) ──► WP9 (2nd term + polish)
                      ├──► WP4 (diff viewer) ───────────────────┤
                      └──► WP5 (panel host) ────────────────────┤
                              ▲                                  │
                   WP6 (file finder) ──┬──► WP10 (file-tree) ────┤
                   WP7 (project search)┴─(app-layer, parallel)───┘
```

- **Critical path:** WP1 → WP2 → WP3 → WP8 → WP9. (WP10 is parallel app-layer work, not on the critical path.)
- **Parallelizable after WP2:** WP4 (diff), WP6 (file finder), WP7 (search), WP10 (file-tree) are largely independent backend+frontend slices that can proceed in parallel once the editor shell (WP2) exists; WP5 (panel host) needs WP2 + WP4. WP6/WP7/WP10 share fs-walk infrastructure (do WP6's index first; WP7 and WP10 reuse it).
- **WP1 gates the panel-host + finder hotkeys.** Don't design WP5/WP6's hotkeys before WP1 settles the CM6-focus question.
- **WP8 is gated and last** (before polish) — editor parity must be proven first. WP9's exit-criteria/dogfood should include the file-tree (WP10) in the daily-use parity check.
- **App-layer callout:** WP6 (fuzzy finder), WP7 (project-wide search), and WP10 (file-tree navigator) are Rust+React subsystems, not editor configuration — the single biggest scoping point from `research.md`. They are sized as full WPs, not editor sub-tasks. WP10 was added 2026-06-19 (operator must-have at WP2 verify-human).

## Future milestones

Tracked in [`roadmap.md`](roadmap.md) (Milestones 3–9: stateful CC controller, multi-workspace, status surfaces, polish & release). Decomposed just-in-time when each opens — not here.

## SURFACE-IN history

- [2026-06-19] **WP10 (file-tree navigator) added** — operator designated it a must-have at WP2 Phase-1 verify-human. App-layer subsystem reusing WP6's `fs_index` infrastructure; parallel to the critical path. Source: feature:build (WP2) → product:wbs.
