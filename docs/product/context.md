---
stage: context
state: complete
updated: 2026-06-27
---

> Revision 2026-06-27: Resynced root `CLAUDE.md` for the **Milestone 6** cycle open (friend-QoL, open collection). M4 + M5 closed; M5 (PiP) released as v0.2.0 (`/release` — GitHub release + Homebrew tap `7717bd9`). Replaced the `## Current Milestone` section with **Current Milestone: M6 — Friend-requested QoL polish**: WP1 file-based status-channel logging (probe) → WP2 fix the stuck-`Running` dot (LEAD correctness item) → parallel polish track WP3 drag-split / WP4 focus-scoped terminal zoom / WP5 editor auto-wrap toggle / WP6 FileTree reaches gitignored editables / WP7 no-yolo setting → WP8 milestone-exit verify. Design priors consulted (`operator-helpful-friend-misfiring-as-offswitchable-setting` agrees with WP5+WP7 off-switchable defaults). Reconciled `.gitignore` to the canonical artifact-tracking lines (added `.claude/settings.local.json`, `workflow/.session.md`, `tests/results/*.json`, `__pycache__/`, `*.pyc`). origin/main in sync (`50902af`).
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

**Active milestone:** Milestone 6 — Friend-requested QoL polish (open collection). M1–M5 complete and closed; M5 released as v0.2.0.

**First feature:** WP1 — Probe: file-based status-channel logging — instrument `status_broadcaster::drain_loop` / `StatusRegistry` / the hook-script edge to a per-identity log file readable from the launchd-launched prod `.app`, so the stuck-`Running` dot (WP2's fix) can be diagnosed against real telemetry rather than guessed.
