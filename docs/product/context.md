---
stage: context
state: complete
updated: 2026-06-29
---

> Revision 2026-06-29: Resynced root `CLAUDE.md` for the **Milestone 7** cycle open (menu-bar status item — the third status surface). M6 (friend-QoL) closed + released as v0.2.2 (`/release` — GitHub release + Homebrew tap `c532ba7`, installed-`.app` verified). Replaced the `## Current Milestone` section with **Current Milestone: M7 — Menu-bar status item**: linear WP1 probe (tray + popover-window + `tauri-plugin-positioner` mechanics, `tauri#13633` blur-to-hide reliability) → WP2 tray icon + `aggregate_state` fold + atomic icon swap + native right-click menu → WP3 left-click popover `WebviewWindow` (3rd Vite entry, per-workspace status list, row-click navigates) → WP4 exit verify (native glyph + out-of-focus DEFERRED-TO-RELEASE). Arch §B.2 promoted to designed-for-build (Revision 2026-06-29). Design priors consulted: `operator-helpful-friend-misfiring-as-offswitchable-setting` does NOT fire; `explicit-selectable-mode-over-inferred-mode` (risk-surface-vs-value) fires on the doc-hierarchy-watcher re-triage → watcher re-anchored M7 → **M8** (NOT an M7 WP). `.gitignore` already conformant — no change. origin/main in sync (`1d01eb9`).
>
> Prior revision 2026-06-27: Resynced root `CLAUDE.md` for the **Milestone 6** cycle open (friend-QoL, open collection). M4 + M5 closed; M5 (PiP) released as v0.2.0 (`/release` — GitHub release + Homebrew tap `7717bd9`). Replaced the `## Current Milestone` section with **Current Milestone: M6 — Friend-requested QoL polish**: WP1 file-based status-channel logging (probe) → WP2 fix the stuck-`Running` dot (LEAD correctness item) → parallel polish track WP3 drag-split / WP4 focus-scoped terminal zoom / WP5 editor auto-wrap toggle / WP6 FileTree reaches gitignored editables / WP7 no-yolo setting → WP8 milestone-exit verify. Design priors consulted (`operator-helpful-friend-misfiring-as-offswitchable-setting` agrees with WP5+WP7 off-switchable defaults). Reconciled `.gitignore` to the canonical artifact-tracking lines (added `.claude/settings.local.json`, `workflow/.session.md`, `tests/results/*.json`, `__pycache__/`, `*.pyc`). origin/main in sync (`50902af`).
>
> Prior revision 2026-06-22 (b): Resynced root `CLAUDE.md` for the **Milestone 4** cycle open. M3 closed (`/product-finalize`, commit `99b9398` — WP5 `.session.md` watcher dropped as the wrong file). Replaced the `## Current Milestone` section with **Current Milestone: M4 — Multi-workspace UX (filmstrip + center stage)**, the dogfood-replace point: WP1 N-cost probe → WP2 N>1 lift (+ picker error-surfacing) → WP3 filmstrip (tiles + status dots + `serializeAsHTML()` mirror + `⌘⇧+digit` switch + drag-reorder + static center-stage tile) → WP4 collapse → WP5 verify; WP4b (left/right focus indicator) parallel. Operator scope decisions captured (cost-probe-first, `⌘⇧+digit` reserved-chord switch, focus indicator added, doc-hierarchy watcher deferred to M6). All commits local-only.
>
> Prior revision 2026-06-22 (a): Resynced root `CLAUDE.md` for the **Milestone 3** cycle open. Replaced the stale "Current Phase" (Phase 1) section with **Current Milestone: M3 — CC lifecycle & state plumbing** (status broadcaster + Unix-socket hook channel + `.session.md` watcher; WP1–WP6). Recorded M1 + M2 as COMPLETE/CLOSED, the 2026-06-22 dogfood-first roadmap resequence (M3 → M4 multi-workspace → M5 PiP-unconditional → M6 menu-bar → M7/M8 later), and updated the status-surface-order Key Decision (PiP before menu-bar, unconditional — the old menu-bar-first/dogfood-gate plan is dropped). All commits local-only (no remote yet).
>
> Prior revision 2026-06-15: Resynced with the major product revision (multi-window → single-window with tabbed workspaces; filmstrip + center stage + menu-bar + conditional PiP; xterm.js DOM-renderer only; Unix-socket hook channel; status broadcaster → three surfaces; tab-shell substrate ships in Phase 1; thumbnail-rendering probe gates the filmstrip strategy). Phase 1 WPs renumbered (WP1–WP9).
>
> Prior revision 2026-05-22: Resynced with two new Phase-2 features — Smart auto-resume (three-branch decision tree) and Drive-mode selector + indicator.

# Context

Project `CLAUDE.md` generated at `CLAUDE.md` (project root). It captures the project overview, tech stack, project structure, host-based dev environment justification, setup instructions, development conventions, the current milestone, and key decisions — all derived from the product docs under `docs/product/`. (The Setup & Ecosystem Gotchas section also records pnpm-v11 / ESLint-v9-pin / Prettier-ignore pitfalls from M1's scaffold.)

**Active milestone:** Milestone 7 — Menu-bar status item (the third status surface, subscribing to the existing M3 `status_broadcaster`). M1–M6 complete and closed; M6 released as v0.2.2.

**First feature:** M7 was specced as one feature, then SHRUNK at the spec debate (2026-06-29) from a 3-surface dashboard to an **ambient alarm + actuator** (popover/list/navigate/`tauri-plugin-positioner` CUT as a PiP subset — design-prior `new-surface-must-earn-its-place-against-existing-ones`). WP1 (now: tray icon + `aggregate_alarm` 2-state fold + atomic icon swap) is the first build phase; spec+plan at `workflow/wip/m7-menu-bar-status-item.md` (3 phases: WP1 tray alarm → WP2 actuator menu → WP3 exit verify).

**Entry point:** `/feature-spec` was used (M7 introduces a new module `src-tauri/src/tray/` + a `tauri.conf.json` change — architectural surface). Spec complete → plan complete; next is `/feature-build` for WP1.

**`.gitignore`:** reconciled — already conformant with the artifact-tracking MAP (`.claude/learnings/` correctly ignored; this is not the source repo). No change needed at this pass.
