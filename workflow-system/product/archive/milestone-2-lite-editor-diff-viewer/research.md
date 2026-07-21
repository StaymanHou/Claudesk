---
stage: research
state: complete
updated: 2026-06-19
---

# Research

**Milestone Focus:** Milestone 2 — Lite Editor + Diff Viewer (the in-app right-half editor that *replaces* Sublime Text, per the 2026-06-19 vision revision). Deliverables under research: (a) lite editor engine choice, (b) git diff viewer, (c) right-half panel-switch hotkeys, and the feature checklist (multi-cursor / column select, Cmd+P fuzzy file finder, command palette for syntax, project-wide find/replace, split panes, minimap).

## Headline decision: **CodeMirror 6, not Monaco**

For an editor **embedded** in a Tauri 2 single-`WebviewWindow` React app, CodeMirror 6 is the clear fit. The roadmap listed "Monaco or CodeMirror 6 — decided in a research pass"; this pass decides **CodeMirror 6**.

Why (the deciding factors, in order):

1. **Bundle size & startup.** Monaco is ~5 MB parsed+gzipped (Replit measured monaco + deps at 51 MB raw / 5 MB gzipped) and cannot lazy-load incrementally; CodeMirror 6 is tree-shakeable from ~50 kB, and Replit's full CM6 editor + all language packs came to 1.26 MB gzipped. Claudesk's whole value proposition is "lite over featureful" + a ~3 MB Tauri bundle (CLAUDE.md Key Decision); shipping a 5 MB editor engine into a 3 MB app inverts that. Smaller bundle → leaner binary → faster startup, which is the time-to-productive metric we just shipped Phase 1 to protect.
2. **No web-worker config.** Monaco requires a worker setup (`MonacoWebpackPlugin` / equivalent) that is notoriously fiddly inside a custom webview; CM6 has no worker requirement. One less thing to fight in WKWebView.
3. **Composes as a component, not an app.** Monaco is a pre-built IDE; CM6 is a toolkit you embed. The right half is *one panel among several* (editor / diff / second terminal), per-workspace, N of them mounted at once — CM6's modular, multi-instance-friendly design fits that; Monaco's heavier per-instance footprint does not.
4. **The Monaco advantage doesn't apply to us.** Monaco's edge is VS-Code-grade IntelliSense / go-to-definition / language servers. Claudesk's editor is explicitly a *Sublime-feature-parity lite editor* (multi-cursor, Cmd+P, find/replace, minimap) — Claude Code is the intelligence layer, not the editor. We are not buying what Monaco is expensive for.
5. **Native-webview pedigree.** Replit explicitly notes CM6 is "suitable even for native applications as a webview component… most things in CodeMirror are serializable so you can interop with the webview from native code" — directly relevant to Tauri's Rust↔JS IPC.

**React binding:** use `@uiw/react-codemirror` (v4.25.10), the modern CM6 React wrapper. **Avoid `react-codemirror2`** — it wraps legacy CM5 and is the documented wrong choice for new projects.

## Feature coverage — what CM6 gives vs what Claudesk builds

This is the load-bearing finding for the WBS: **the editor engine covers in-document editing; "project/workspace" features are app-layer regardless of editor.** This is true for Monaco too — neither editor manages a project tree or multiple files.

| M2 feature | Source | Notes |
|---|---|---|
| Multi-cursor / column select | **CM6 core** | Built-in; enable `EditorState.allowMultipleSelections` + `drawSelection`. VS-Code-style `alt`-drag may need a small custom keybinding (core has multi-selection; the alt-drag binding is not default). |
| Find / replace **within a file** | **`@codemirror/search`** (v6.7.1) | `searchKeymap` + `highlightSelectionMatches`; panel is customizable. For a VS-Code-look panel, the community `@rigstech/codemirror-vscodeSearch` builds on it. |
| Syntax highlighting / language modes | **CM6 language packages** | One small package per language; import only what's used (tree-shaking). |
| Split panes (within editor) | **CM6** | Multiple `EditorView`s; CM6 composes them cleanly. |
| Minimap | **`@replit/codemirror-minimap`** (community) | The established CM6 minimap; `showMinimap` facet. Peer-deps on `@codemirror/state`/`view` (already ours). Lowest-confidence dependency — community-maintained, not core (see Risks). |
| **Cmd+P fuzzy file finder** | **APP-LAYER (build)** | NOT an editor feature. CM6/Monaco edit a *document*, not a project. We build: a Rust-backed file index for the workspace's project dir + a React fuzzy-picker overlay that opens the chosen file into a CM6 view. |
| **Project-wide find/replace** | **APP-LAYER (build)** | `@codemirror/search` is single-document only. Multi-file search is a Rust/ripgrep-style backend producing results, with CM6 doing the in-document highlight/navigation on open. |
| Command palette (syntax select etc.) | **CM6 commands + small custom UI** | CM6 commands are `(view) => boolean` functions designed to back palettes/menus; no turnkey palette extension, so a thin React palette over the command set. Caveat: a Cmd+Shift+P palette hotkey won't fire while focus is inside CM6 unless key handling is configured to let it through (see Risks). |

## Git diff viewer — `git2` for data, `@codemirror/merge` for rendering

The roadmap said "git diff viewer … using `git2` crate." Research refines the split:

- **`@codemirror/merge`** (v6.12.2) renders the diff **visually** — either side-by-side (`MergeView`, two aligned editors, one read-only) or inline (`unifiedMergeView` on a single `EditorView` with an `original` document). It ships its **own** JS diff algorithm (configurable `scanLimit`/`timeout`); it does **not** need or use `git2` to *render*.
- **`git2`** (libgit2 Rust binding) is still the right backend, for the data CM6 can't get itself: (1) the **list** of changed files (unstaged vs staged), and (2) the **base content** of each file (HEAD blob for unstaged-against-working-tree, or index blob for staged). Feed `(base_text, current_text)` per file into `MergeView`/`unifiedMergeView` and let CM6 compute + render the chunks.
- This matches "comparable to Sublime Merge's **basics**" — file list + per-file diff view. Interactive staging / rebase / blame / conflict resolution are explicitly out of M2 scope (and the reason the standalone Sublime Merge hotkey milestone was dropped 2026-06-19).

## Recommended Stack (M2)

- **Editor engine:** CodeMirror 6 — `codemirror` v6.0.2 meta-package or the granular `@codemirror/{state,view,commands,language,search}` (state v6.6.0, view v6.43.1, search v6.7.1).
- **React binding:** `@uiw/react-codemirror` v4.25.10.
- **Diff rendering:** `@codemirror/merge` v6.12.2 (decide side-by-side vs unified at arch/build time; side-by-side matches Sublime Merge's mental model, unified is cheaper on a narrow right-half).
- **Minimap:** `@replit/codemirror-minimap` (community; treat as optional/deferrable — see Risks).
- **Find/replace UI:** `@codemirror/search` core, optionally `@rigstech/codemirror-vscodeSearch` for the VS-Code panel look.
- **Git data:** `git2` Rust crate behind Tauri commands (changed-file list + base-content blobs); reuses the established `command → pure-fn → typed-error → String` shape from WP6/WP7.
- **File read/write:** existing `tauri-plugin-fs` (already a dependency) for opening/saving files in the workspace dir; no new IO plumbing.
- **Dark theme:** CM6 theming is extension-based; a single dark theme extension, no light variant (project is dark-mode-only).

## Trade-offs

- **CodeMirror 6 vs Monaco:** CM6 = small bundle, no worker config, composes as a panel, but you assemble features from modules (more wiring) and get no built-in IntelliSense. Monaco = batteries-included IDE but 5 MB + worker setup + heavier per-instance. For a *lite* editor that is one panel among several in a 3 MB Tauri app, CM6's "more wiring" cost is paid once and the bundle/worker wins are permanent. **CM6 wins decisively for this milestone.**
- **`@codemirror/merge` own-diff vs `git2`-computed diff:** letting CM6 compute the diff is simpler (no chunk-format marshaling over IPC) and good enough for "basics"; `git2` only supplies base text + file list. Trade-off: CM6's diff is line-based with a scan limit, not git's exact diff — fine for review, not for byte-exact hunk staging (which is out of scope anyway).
- **Side-by-side vs unified diff:** side-by-side is the Sublime Merge mental model but eats horizontal space in a half-width right panel; unified fits the narrow panel better. Defer to arch/build; `@codemirror/merge` supports both, so it's a config flip, not a dependency change.

## Risks

- **Minimap is community-maintained, not CM6 core** (`@replit/codemirror-minimap`). Lowest-confidence dependency in the stack; peer-dep version-coupling to `@codemirror/state`/`view` can drift. **Mitigation:** treat minimap as a deferrable/optional M2 deliverable — if it bitrots or fights the CM6 version, ship without it (it's the least load-bearing of the Sublime-parity features) and revisit.
- **Cmd+P / Cmd+Shift+P palette hotkeys vs CM6 focus.** When the cursor is inside a CM6 editor, app-level hotkeys (the fuzzy-finder, the command palette, and our own **right-half panel-switch hotkey**) may be swallowed by CM6's keymap. **Mitigation:** register these as CM6 keybindings that bubble to the app, or scope app-level key handling to let the chord through — must be designed deliberately (this is the same class of issue WP8 hit with the in-app `⌘⇧E`). The panel-switch hotkey in particular must work *while focus is in the editor*, so it can't be a naive document-level listener.
- **Fuzzy finder + project-wide search are net-new app-layer subsystems**, not editor config — the WBS must budget Rust-backend work (file indexing / ripgrep-style search over the workspace dir) for them, not just "drop in an editor." This is the single biggest scoping correction from this research: ~2 of the 6 "editor" features are actually backend features.
- **Multiple mounted CM6 instances.** Per the tab model, N workspaces each may hold a CM6 editor (+ a diff `MergeView` = 2 more editors) mounted simultaneously (background tabs stay mounted, `display:none`). CM6 is far lighter than Monaco here, but the WP4-style "cost at N workspaces" concern still applies — worth a cheap sanity check during build that N mounted editors stay within the RAM/CPU envelope (the WP4 probe covered terminals, not editors).
- **Editor ≠ replacement until feature parity is proven.** The vision now says the in-app editor *replaces* Sublime Text and M2 *removes* the `⌘⇧E` pop. The removal deliverable is gated on "the lite editor is proven to cover the daily-use feature set" — if a Sublime feature the operator relies on daily (e.g. a specific multi-cursor gesture) turns out hard in CM6, that gate is where it surfaces. Keep the removal as the *last* M2 step, after dogfooding the editor.

## Roadmap impact

**No roadmap back-loop needed (P5 → arch).** Milestone 2's deliverables stand as written; research *refines* rather than invalidates them. Two refinements to carry into arch + WBS:

1. The fuzzy file finder and project-wide find/replace are **app-layer (Rust + React)** subsystems, not editor configuration — budget them as their own WBS work packages, not sub-bullets of "drop in CodeMirror."
2. The diff viewer splits as **`git2` (file list + base blobs) + `@codemirror/merge` (rendering)** — `git2` does not compute the rendered diff; CM6 does.

These are arch/WBS-level detail, not roadmap-level scope changes, so the roadmap stays `complete`.

## References

Web search + npm registry, 2026-06-19:
- [Replit — Betting on CodeMirror (Monaco→CM6 migration, bundle measurements)](https://blog.replit.com/codemirror)
- [Replit — Comparing Code Editors: Ace, CodeMirror and Monaco](https://blog.replit.com/code-editors)
- [Sourcegraph — Migrating from Monaco Editor to CodeMirror](https://sourcegraph.com/blog/migrating-monaco-codemirror)
- [npm-compare — codemirror vs monaco-editor](https://npm-compare.com/codemirror,monaco-editor)
- [PkgPulse — Monaco Editor vs CodeMirror 6 vs Sandpack 2026](https://www.pkgpulse.com/guides/monaco-editor-vs-codemirror-6-vs-sandpack-in-browser-2026)
- [CodeMirror — List of Core Extensions](https://codemirror.net/docs/extensions/)
- [CodeMirror — Selection Example (multi-cursor)](https://codemirror.net/examples/selection/)
- [@replit/codemirror-minimap (GitHub)](https://github.com/replit/codemirror-minimap)
- [@rigstech/codemirror-vscodeSearch (GitHub)](https://github.com/GavinRigsby/codemirror-vscodeSearch)
- [@codemirror/merge (npm)](https://www.npmjs.com/package/@codemirror/merge)
- [codemirror/merge (GitHub — side-by-side + unified, diff options)](https://github.com/codemirror/merge)
- [@uiw/react-codemirror (modern CM6 React wrapper)](https://uiwjs.github.io/react-codemirror/)
- npm registry `latest` (versions verified 2026-06-19): `@codemirror/merge` 6.12.2, `@codemirror/state` 6.6.0, `@codemirror/view` 6.43.1, `@codemirror/search` 6.7.1, `codemirror` 6.0.2, `@uiw/react-codemirror` 4.25.10
