---
type: feature
workflow: feature
state: plan (complete)
milestone: 2
wp: WP2
drive_mode: autopilot
created: 2026-06-19
---

# Feature: WP2 — Editor shell (CodeMirror 6 mounted in the right half, open/save)

**Workflow:** feature
**State:** plan (complete)
**Created:** 2026-06-19

## Problem Statement

Milestone 2's right-half lite editor needs a working shell before any Sublime-parity features (WP3), diff viewer (WP4), or panel host (WP5) can build on it. WP2 mounts CodeMirror 6 (via `@uiw/react-codemirror`) as an `EditorPanel` inside each workspace's right half — replacing the Milestone-1 "Coming in Phase 3" placeholder card for the editor case — and wires the file lifecycle: open a file from the workspace's project dir, edit it, save it back, with errors surfaced (not swallowed — the carry-forward WP6/WP7 IPC-error lesson). Dark-only theme. No feature layering (multi-cursor/search/minimap = WP3); no panel switching yet (RightPanelHost = WP5). This is the minimal working editor the rest of M2 stands on. WP1's probe settled the two integration unknowns: app chords register via a capture-phase `document` listener (so WP5's panel-switch hotkey will work over the editor), and N mounted CM6 editors with `display:none` backgrounds stay within the perf envelope.

## Context / grounding

- **WP1 probe (complete):** `workflow/wip/m2-wp1-cm6-probe.md`. Deps already installed at research-verified versions: `@uiw/react-codemirror` 4.25.10, `@codemirror/{merge 6.12.2, state 6.6.0, view 6.43.1, search 6.7.1, commands 6.8.1, language 6.12.3}`, `@codemirror/lang-javascript`, `@codemirror/lang-rust`. Use **granular `@codemirror/*` imports** (not the `codemirror` meta-package) to tree-shake.
- **Backend pattern (mirror exactly):** `src-tauri/src/config_store/` — `mod.rs` holds the pure, TempDir-testable core + a `thiserror` error enum; `commands.rs` holds thin `#[tauri::command]` wrappers that map the typed error to `String` for IPC; registered in `lib.rs`'s `generate_handler!`. WP2 adds an `editor_fs` module in the same shape (`read_file` / `write_file`), NOT `tauri-plugin-fs` (which is not currently registered, and a dedicated module matches the repo's command→pure-fn→typed-error→String convention and gives the explicit error-surfacing the carry-forward MAJORs want).
- **Frontend pattern:** pure logic in a testable no-React/no-IPC module (cf. `src/cc/bridge.ts`), React in the pane component, IPC at the edges via `@tauri-apps/api` `invoke`. Tests: pure logic under vitest; live DOM verified by Playwright in verify-self.
- **Right half today:** `src/components/workspace/Workspace.tsx` renders `.workspace-right` = `<SublimeToolbar>` + a `.placeholder-card`. WP2 replaces the placeholder card with `<EditorPanel>`. The full Editor/Diff/terminal **swap** is WP5 — WP2 just mounts the editor in place of the card. The placeholder card survives as the no-file-open empty state.
- **Dark-only:** project never follows OS theme (CLAUDE.md). The CM6 theme extension is unconditionally dark — no light variant, no `prefers-color-scheme`.

## Work Tree

- [x] Phase 1: Backend file IO + EditorPanel mounts & opens a file  <!-- status: COMPLETE — all impl + all verify nodes done -->;
  **Observable outcomes:**
  - CLI: `cargo test -p claudesk editor_fs` exits 0 — pure-core tests (TempDir fixture) cover read-ok, read-missing-file (typed error), read-non-utf8/binary, and path outside workspace rejected.
  - CLI: `cargo clippy -- -D warnings` and `cargo fmt --check` clean; `pnpm tsc --noEmit` + `pnpm lint` clean.
  - Browser (Playwright, vite `?` real-app route or dev): with a workspace open, the right half renders a CodeMirror editor (`.cm-editor` present) showing the opened file's contents, dark theme (`.cm-editor` has dark background), correct line count in the gutter; no JS console errors.
  - HTTP/IPC: invoking `read_file` with a valid path under the workspace returns the file text; with a missing path returns an `Err` string (surfaced in the UI, not swallowed).
  - [x] P1.1 Backend `editor_fs` module: `mod.rs` pure core — `read_file_core(root, requested) -> Result<String, EditorFsError>` (rejects non-UTF-8 + paths escaping the workspace root via canonicalize-and-contain `resolve_within`); `thiserror` `EditorFsError` enum {Io, NotUtf8, OutsideWorkspace}. 11 TempDir tests.  <!-- status: done -->
  - [x] P1.2 `commands.rs`: `#[tauri::command] read_file(root, path) -> Result<String, String>` mapping the typed error to String; registered in `lib.rs` `generate_handler!`  <!-- status: done -->
  - [x] P1.3 Frontend `editor/language.ts` (pure): `languageForExtension`/`extensionOf`/`languageForPath` — `.js/.cjs/.mjs/.jsx/.ts/.cts/.mts/.tsx` → `javascript({jsx,typescript})`, `.rs` → `rust()`, else `[]` plaintext. 19 vitest cases.  <!-- status: done -->
  - [x] P1.4 `editor/theme.ts`: single dark CM6 theme (`editorDarkTheme`, no light variant), palette aligned to App.css tokens.  <!-- status: done -->
  - [x] P1.5 `EditorPanel.tsx`: mounts CM6 via `@uiw/react-codemirror`; `read_file` via `invoke`; language+theme; inline read-error (not swallowed). Load lifecycle extracted to pure `editorLoad.ts` reducer (mirrors `cc/bridge.ts`; avoids set-state-in-effect; 5 vitest cases).  <!-- status: done -->
  - [x] P1.6 Wire `Workspace.tsx`: placeholder card → `<EditorPanel>` (empty state lives in the panel); temporary open-file path bar (real Cmd+P finder is WP6); editor CSS in App.css.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — editor_fs 11/11, editor module 24/24, scoped eslint + clippy clean -->
  - [x] verify-self  <!-- status: done (vite-observable outcomes PASS) — subagent confirmed: app-shell mounts clean (0 console errors), picker renders, all editor+CM6 modules resolve (HTTP 200, no import errors). The live editor-opens-a-file / dark-theme-in-editor / read-error-surfacing outcomes are Tauri-IPC-gated (read_file needs the WKWebView backend, absent in vite) → deferred to P2.4's WKWebView pass; flagged for verify-human awareness. Not a BLOCKING fail — nothing broken; those outcomes are not observable on this surface, as the plan anticipated. -->
  - [x] verify-human  <!-- status: done — all leaves PASS (operator confirmed in the WKWebView 2026-06-19) -->
    - [x] P1.verify-human.1 WKWebView: open a file shows its contents  <!-- status: PASS -->
    - [x] P1.verify-human.2 WKWebView: editor reads as dark + language highlighting present  <!-- status: PASS (dark + highlighting confirmed; token colors then refined to VS Code Dark+ at operator request, re-confirmed in .4) -->
    - [x] P1.verify-human.3 WKWebView: a bad path surfaces an inline error (not swallowed)  <!-- status: PASS -->
    - [x] P1.verify-human.4 WKWebView: VS Code Dark+ syntax colors look right  <!-- status: PASS (operator confirmed after theme.ts HighlightStyle change) -->
    - [x] P1.verify-human.5 WKWebView: markdown (.md) highlighting renders  <!-- status: PASS (operator confirmed after adding @codemirror/lang-markdown) -->
  - [x] verify-codify  <!-- status: done — verified behaviors covered at the repo's established level (pure-logic sidecars unit-tested + Playwright/human for live DOM, per cc/bridge.ts convention + CLAUDE.md "E2E deferred, manual on host macOS"). No new test TYPE introduced (RTL/jsdom would violate the repo's no-component-test convention for one component). Coverage map: "open→contents" = editorLoad loading→loaded + editor_fs read; "bad path→inline error" = editorLoad load-fail + editor_fs read-missing/non-utf8/escape; "highlighting incl. markdown" = language.ts 11 cases; backend root-guard = editor_fs escape tests. Full suite green: 71 frontend + 47 backend, tsc/eslint/clippy-D/fmt clean. No test failures → no triage. -->

- [x] Phase 2: Save write-back + language modes + WKWebView confirm  <!-- status: COMPLETE — all impl + all verify nodes done -->
  **Observable outcomes:**
  - CLI: `cargo test -p claudesk editor_fs` exits 0 with added `write_file` round-trip tests (write then read returns the written bytes; write to an unwritable/missing-dir path returns a typed error; write rejects a path escaping the workspace root).
  - CLI: `cargo clippy -- -D warnings`, `cargo fmt --check`, `pnpm tsc --noEmit`, `pnpm lint`, `pnpm test` all clean.
  - Browser (Playwright): edit the editor contents, trigger save (Cmd+S keybinding), and confirm the on-disk file now contains the edited text (read it back via the backend or fs); a save failure surfaces a visible error, not a silent drop.
  - Browser: opening a `.rs` file vs a `.ts` file loads the correct language highlighting (distinct token classes present); a plaintext/unknown extension loads without error.
  - CLI/manual: `pnpm tauri dev` launches; the editor opens + edits + saves a real file inside the real WKWebView (not just vite/Chromium) — the WP2 "verify in WKWebView, not just vite dev" task.
  - [x] P2.1 Backend `write_file` — DONE IN P1 (write_file_core atomic write-then-rename + workspace-root guard + command + lib.rs registration + 5 write tests). P2.1 was a confirmation.  <!-- status: done (in P1) -->
  - [x] P2.2 Save keybinding in `EditorPanel` (Cmd+S → `write_file`, Prec.highest + preventDefault to suppress browser save dialog); inline `editor-save-error` banner + status bar (path + saving/saved/● unsaved); pure `editorSave.ts` reducer (6 tests). Ref-free: keymap closes over a `doSave` useCallback.  <!-- status: done -->
  - [x] P2.3 Language coverage confirmed: granular `@codemirror/lang-*` imports only (no `codemirror` meta-pkg → tree-shakes); js/cjs/mjs/jsx/ts/cts/mts/tsx/rust/markdown(md,markdown,mdx) + plaintext fallback; 22 language test cases.  <!-- status: done -->
  - [x] P2.4 WKWebView: backend write round-trip proven (editor_fs tests), save wiring HMR'd into the running `tauri dev`; the live open→edit→Cmd+S→on-disk gesture is a verify-human check (can't drive WKWebView Cmd+S programmatically).  <!-- status: impl done; live Cmd+S gesture → verify-human -->
  - [x] verify-auto  <!-- status: done — editor module 33/33 (incl. 6 editorSave), editor_fs write 11/11, scoped eslint+tsc clean -->
  - [x] verify-self  <!-- status: done (vite-observable PASS) — subagent confirmed app loads clean (0 console errors), picker mounts, and the save-wiring module graph (editorSave.ts + modified EditorPanel.tsx + deps) all resolve/transform 200. The live Cmd+S→on-disk save is Tauri-IPC-gated (write_file needs the WKWebView) → verify-human. Not BLOCKING. -->
  - [x] verify-human  <!-- status: done — all 3 leaves PASS (operator confirmed in WKWebView 2026-06-19) -->
    - [x] P2.verify-human.1 WKWebView: edit + Cmd+S saves to disk; status bar reflects unsaved→saved  <!-- status: PASS -->
    - [x] P2.verify-human.2 WKWebView: Cmd+S does NOT trigger the browser/OS save-page dialog  <!-- status: PASS -->
    - [x] P2.verify-human.3 WKWebView: a failing save surfaces the inline error banner (not swallowed)  <!-- status: PASS -->
  - [x] verify-codify  <!-- status: done — save behavior covered at the repo level (editorSave 6 reducer tests: save→saved→error→reset, backs "Cmd+S saves"+"save fails→error"; editor_fs 6 write tests: round-trip/atomic/escape-guard/missing-dir, backs the backend write; Cmd+S dialog-suppression + live DOM = verify-human, no-RTL repo convention). No new test TYPE (RTL/jsdom would break the convention). Full suite green: 77 frontend + 47 backend, tsc/eslint/clippy-D/fmt clean. No failures → no triage. -->

<!-- OPERATOR DIRECTIVE 2026-06-19: HALT after WP2 finalizes. Do NOT auto-start WP3
     (or any next WP) without explicit operator go-ahead, despite drive_mode=autopilot.
     The feature workflow may complete WP2 through ship+finalize; the WBS-level
     advance to the next work package requires a human green-light. -->

## Current Node
- **Path:** Feature > ship (both phases COMPLETE)
- **Active scope:** WP2 ready to ship (all phases + all verify nodes done)
- **Blocked:** none
- **Unvisited:** ship → finalize. **Then HALT per operator directive — do not start WP3 without explicit go-ahead.**
- **Open discoveries:** none blocking
- **State:** verify-codify (all phases complete)

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
- [SURFACED-2026-06-19] Phase 2 — `write_file` (P2.1) was implemented during Phase 1 (alongside `read_file`) to avoid a dead-code warning under `cargo clippy -D warnings`; P2.1 collapses to a confirmation, P2.2 (Cmd+S wiring) is the real Phase 2 work. Not a backlog item — phase-internal note.
- [SURFACED-2026-06-19] WP2 verify-human — operator requests (handled): (1) **syntax theme** → applied VS Code Dark+ HighlightStyle (`theme.ts` + `@lezer/highlight` dep); (2) **markdown highlighting** → added `@codemirror/lang-markdown` + `.md/.markdown/.mdx` rows in `language.ts` (3 new tests, 27 total); (3) **file-tree navigator** → added to WBS as WP10 (operator must-have, app-layer, reuses WP6 fs_index); (4) **font-size +/- zoom** → added to WBS WP3 task list (Sublime parity, drives the currently-hardcoded 13px fontSize); (5) path-box autofill → declined (throwaway stopgap WP6's Cmd+P replaces).
- [SURFACED-2026-06-19] WP9/build-note — production vite build emits the 500 KB chunk-size warning: the main bundle is ~348 KB gzipped now that CM6 + language packs are statically imported by `Workspace`. Benign for a local-disk Tauri app (no network fetch), but if a future milestone wants to trim startup, the editor could be lazy-loaded (`React.lazy`) since background workspaces don't need it until focused. Logged to backlog as low priority.
