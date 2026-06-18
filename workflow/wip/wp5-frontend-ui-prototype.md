# Feature: WP5 — Frontend UI Prototype (tab-shell substrate)

**Workflow:** feature
**State:** plan (complete)
**Created:** 2026-06-18
**drive_mode:** autopilot

## Problem Statement

Build the static React UI for Claudesk with **mock data only** — no Rust IPC, no real PTY, no backend wiring. This is the Phase 1 critical-path build start. It establishes the **tab-shell substrate** that Phase 2 plugs into rather than reshapes: a `WorkspaceList` holding the array of all open workspaces (Phase 1 invariant: length ≤ 1, but the data shape and rendering structure are the Phase 2-ready N>1 shape), a **Center Stage** rendering the focused workspace full-size with a 50/50 horizontal split (left = xterm.js DOM renderer with mock output; right = "Coming in Phase 3" placeholder card), and an **empty Filmstrip slot** reserving the layout real-estate Phase 2 will populate with tiles. A **Project Picker** (mocked recents + "Open Folder" button) drives an app-shell view state machine that toggles between `picker` and `workspace-open`. All workspaces stay mounted; switching is `display:none`/`display:block`, never unmount/remount. xterm.js uses the **DOM renderer only** — `@xterm/addon-webgl` is never loaded (research established the ~16-context browser cap). The deliverable validates layout/CSS in real `pnpm tauri dev` WKWebView (not a Chromium browser tab) before WP6 wires the real config store.

Source: `docs/product/wbs.md` → WP5 (fully specified task list + `Workspace` type signature). Constraints: `arch.md` §B component table, `CLAUDE.md` → "One window, many workspaces" / "All workspaces stay mounted" / "xterm.js DOM renderer only" / "Single WebviewWindow".

## Work Tree

- [x] Phase 1: Workspace substrate — types, state, Center Stage, xterm pane, Filmstrip slot  <!-- status: complete -->

  **Observable outcomes:**
  - Browser: In `pnpm tauri dev` (WKWebView), with the app forced into `workspace-open` view holding one mock workspace, a Playwright/manual snapshot shows: a Center Stage region, a left pane containing a rendered xterm.js terminal whose visible text includes the mock banner string `Hello, mock CC`, and a right pane containing a card with the text `Coming in Phase 3`.
  - Browser: A Filmstrip slot container element is present in the DOM (e.g. `[data-testid="filmstrip"]` or `.filmstrip`), even though it renders no tiles in Phase 1.
  - Console: No JS errors and no React warnings in the WKWebView console on load and after the mock workspace mounts (xterm.js mounts cleanly; fit addon runs without throwing).
  - CLI: `pnpm vitest run` exits 0 — a unit test asserts the `Workspace` type's default factory produces `{ status: 'idle', cc_session_id: null }` and that the workspace-store reducer enforces the Phase 1 N≤1 invariant (opening a second workspace replaces, not appends, OR is rejected — decision recorded in build).
  - CLI: `pnpm tsc --noEmit` exits 0 (strict mode) and `pnpm lint` exits 0 (no `@xterm/addon-webgl` import anywhere — grep asserts absence).
  - [x] P1.1 Define `Workspace` TS type + a `WorkspaceStatus` union (`'idle'|'running'|'awaiting-input'|'unknown'`) in `src/state/` or `src/types/`; add a `makeWorkspace(path)` factory with the documented defaults  <!-- status: complete; src/state/workspace.ts -->
  - [x] P1.2 `WorkspaceList` state: a `useState<Workspace[]>` store (or small Zustand store) in `src/state/`, with actions `openWorkspace(path)` / `focusWorkspace(id)` and a `focusedId`; enforce the Phase 1 N≤1 invariant explicitly with a comment that Phase 2 lifts it  <!-- status: complete; pure reducer workspace.ts + useWorkspaceList.ts hook -->
  - [x] P1.3 `Workspace` component (`src/components/workspace/Workspace.tsx`): 50/50 CSS-grid horizontal split; left = `XtermPane` (mounts `@xterm/xterm` + `@xterm/addon-fit`, **no webgl**), right = placeholder card "Coming in Phase 3". Component takes `visible: boolean` and toggles `display:none`/`block` — stays mounted when not visible  <!-- status: complete -->
  - [x] P1.4 `XtermPane`: mount xterm in a ref'd div, load fit addon, `term.write("Hello, mock CC\r\n…")` mock data, dispose on unmount, refit on container resize (ResizeObserver). DOM renderer only.  <!-- status: complete -->
  - [x] P1.5 `CenterStage` (`src/components/workspace/CenterStage.tsx`): renders ALL workspaces from WorkspaceList, each wrapped so only the focused one is `display:block`; full-size focused workspace  <!-- status: complete -->
  - [x] P1.6 `Filmstrip` (`src/components/workspace/Filmstrip.tsx`): empty container reserving layout real-estate, with code comment "Phase 2 populates this." Sized as if it could host tiles.  <!-- status: complete -->
  - [x] verify-auto  <!-- status: complete; tsc 0, eslint 0, vitest 10/10, webgl-guard OK -->
  - [x] verify-self  <!-- status: complete; subagent PASS x3 (center-stage+xterm "Hello, mock CC"+"Coming in Phase 3" card; empty filmstrip slot; 0 console errors/warnings). No integration boundary. -->
  - [x] verify-human  <!-- status: complete; AUTO-SKIP (drive_mode=autopilot, all 4 gates clean). Known limitation noted: verify-self saw Chromium not WKWebView — operator veto offered, not exercised. -->
  - [x] verify-codify  <!-- status: complete; reducer already covered (10 tests); rendering live-observed in verify-self (jsdom not configured — appropriate level). No new tests warranted. Full suite 18/18. No integration boundary. -->

- [x] Phase 2: Project Picker + app-shell view state machine  <!-- status: complete -->

  **Observable outcomes:**
  - Browser: On fresh load in `pnpm tauri dev`, the app shows the Project Picker view: a list of ≥1 mocked recent projects (each with a display name + path) and an "Open Folder" button. (`[data-testid="picker"]` present.)
  - Browser: Clicking a recent-project row transitions the app to `workspace-open` view — the Picker is no longer shown, the Center Stage with the workspace (xterm + placeholder) is shown. The click invoked an `openWorkspace(path)` handler (Phase 1 stub; mocked, not real IPC).
  - Browser: Clicking "Open Folder" invokes a mocked dialog stub (logs/returns a canned path) and likewise opens a workspace — no crash, no real native dialog required for the mock.
  - Console: No JS errors across the picker→workspace transition.
  - CLI: `pnpm vitest run` exits 0 — a unit test drives the app-shell reducer through `picker → workspace-open` on `openWorkspace` and asserts the view state + that WorkspaceList length becomes 1.
  - CLI: `pnpm tsc --noEmit` and `pnpm lint` exit 0.
  - [x] P2.1 `ProjectPicker` component (`src/components/picker/ProjectPicker.tsx`): mocked recents list (3–4 canned entries), "Open Folder" button with a mocked dialog stub; row + button click handlers call `openWorkspace(path)`  <!-- status: complete -->
  - [x] P2.2 App shell (`src/App.tsx`): view state machine `picker | workspace-open`; renders ProjectPicker when no workspace focused, CenterStage + Filmstrip when a workspace is open; replace the scaffold landing page  <!-- status: complete; view DERIVED from WorkspaceList via src/state/appView.ts viewFor() -->
  - [x] P2.3 Wire `openWorkspace` from picker → WorkspaceList action → view transitions to `workspace-open`; ensure the substrate (CenterStage renders all, Filmstrip slot present) is what mounts  <!-- status: complete -->
  - [x] verify-auto  <!-- status: complete; tsc 0, eslint 0, vitest 13/13 (state), webgl-guard OK -->
  - [x] verify-self  <!-- status: complete (re-run after change request); see build note 2026-06-18b -->
  - [x] verify-human  <!-- status: complete; operator approved 2026-06-18 -->
    - [x] P2.verify-human.1 picker renders dark, scrollable, × delete + Open Folder  <!-- status: complete; approved -->
    - [x] P2.verify-human.2 recent → workspace-open, xterm + card, 50/50 dark  <!-- status: complete; approved -->
    - [x] P2.verify-human.3 × removes row (stays on picker); Open Folder opens; filmstrip slot OK  <!-- status: complete; approved -->
  - [x] verify-codify  <!-- status: complete; viewFor already covered (3 tests); picker delete + dark-mode live-verified (jsdom/RTL not configured — appropriate level). Boundary's consuming surface = app-shell render, Playwright-verified in verify-self. Full suite 21/21. No new tests warranted. -->

## Build note — Phase 2b (2026-06-18, verify-human change request)
- **Operator request during verify-human:** (1) picker must scale to 20+ projects, keep everything, manual-delete only; (2) UI must be dark-mode-only, mandated for all future sessions.
- **Changes:** ProjectPicker — recents now in local state (8 mock entries), scrollable (`max-height:60vh`), per-row × delete (`handleRemove` filters; mock-only — WP6 wires `remove_project`). App.css — DARK ONLY: `:root` sets `color-scheme:dark` + dark tokens, removed both `@media (prefers-color-scheme)` blocks, folded filmstrip dark bg inline, removed dead scaffold `.logo/.container/.row` rules, dark input/button colors. CLAUDE.md — new "Dark mode only" convention bullet under Development Conventions. Backlog — SURFACE-2026-06-18-PICKER-SCALES-TO-MANY-PROJECTS (real-data delete/ordering/search → WP6).
- **Gate:** tsc 0, eslint 0, prettier clean (whole src reformatted), vitest 21/21, vite build OK, dark-mode guard clean (no prefers-color-scheme rule).
- verify-self re-run DONE — subagent PASS x5: 8 recents w/ open+× buttons; × delete 8→7 (stays on picker); dark mode confirmed (:root bg rgb(30,30,30), colorScheme=dark); open→workspace-open still works; 0 console errors.

## Current Node
- **Path:** Feature > ship
- **Active scope:** All WP5 phases complete (Phase 1 + Phase 2, all verify nodes [x]). Ready to ship.
- **Blocked:** none
- **Relevance check (before Phase 2):** Requester still needs: yes. Requirements unchanged: yes. Solution still feasible: yes (Phase 1 proved the substrate renders). No superior alternative: yes. **Verdict: proceed.**
- **Unvisited:** ship → review-quality → finalize
- **Open discoveries:** SURFACE-2026-06-18-PICKER-SCALES-TO-MANY-PROJECTS (logged to backlog; targets WP6)

## Build notes — Phase 2 (2026-06-18)
- Files added: `src/components/picker/ProjectPicker.tsx` (mock recents + mocked Open-Folder dialog stub), `src/state/appView.ts` (`viewFor()` — view DERIVED from WorkspaceList, single source of truth), `src/state/__tests__/appView.test.ts` (3 tests). `App.tsx` rewritten: Phase 1 auto-open placeholder removed; renders ProjectPicker (picker view) or Filmstrip+CenterStage (workspace-open view). `useWorkspaceList` now exposes derived `view`.
- Local gate green: tsc 0, eslint 0, vitest 21/21 (+3), vite build OK.
- Design note: app view is derived from WorkspaceList rather than a separate stored field — avoids picker/list disagreement; Phase 2 multi-workspace keeps the same rule (any focused workspace → workspace-open).

## Build notes — Phase 1 (2026-06-18)
- Files added: `src/state/workspace.ts` (pure reducer + factory), `src/state/useWorkspaceList.ts` (React hook), `src/components/workspace/{XtermPane,Workspace,CenterStage,Filmstrip}.tsx`, `src/state/__tests__/workspace.test.ts`. CSS appended to `src/App.css`. `src/App.tsx` rewritten to render the substrate (auto-opens one mock workspace — P2.2 replaces this with the picker view machine).
- Local gate green: `tsc --noEmit` clean, `pnpm lint` 0, `vitest run` 18/18 (+10 new), `vite build` succeeds. No `@xterm/addon-webgl` import (DOM renderer only — guard grep clean).
- Phase 1 N≤1 invariant: `openWorkspace` REPLACES (length stays 1), with a comment that WP13 lifts it. Decision recorded per the P1 CLI outcome.
- xterm id minting uses a monotonic counter (not Date.now/Math.random) — deterministic + test-friendly; WP7 swaps for backend session id.
- Note (not surfaced): main JS chunk ~528kB (xterm.js) triggers Vite's 500kB chunk-size *warning*. Expected for a desktop app; no action (premature to manualChunks a single-window app).

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
