---
stage: context
state: complete
updated: 2026-06-22
---

> Revision 2026-06-22: Resynced root `CLAUDE.md` for the **Milestone 3** cycle open. Replaced the stale "Current Phase" (Phase 1) section with **Current Milestone: M3 — CC lifecycle & state plumbing** (status broadcaster + Unix-socket hook channel + `.session.md` watcher; WP1–WP6, live WBS at `docs/product/wbs.md`). Recorded M1 + M2 as COMPLETE/CLOSED, the 2026-06-22 dogfood-first roadmap resequence (M3 → M4 multi-workspace → M5 PiP-unconditional → M6 menu-bar → M7/M8 later), and updated the status-surface-order Key Decision (PiP before menu-bar, unconditional — the old menu-bar-first/dogfood-gate plan is dropped). All commits local-only (no remote yet).
>
> Prior revision 2026-06-15: Resynced with the major product revision (multi-window → single-window with tabbed workspaces; filmstrip + center stage + menu-bar + conditional PiP; xterm.js DOM-renderer only; Unix-socket hook channel; status broadcaster → three surfaces; tab-shell substrate ships in Phase 1; thumbnail-rendering probe gates the filmstrip strategy). Phase 1 WPs renumbered (WP1–WP9).
>
> Prior revision 2026-05-22: Resynced with two new Phase-2 features — Smart auto-resume (three-branch decision tree) and Drive-mode selector + indicator.

# Context

Project `CLAUDE.md` generated at `CLAUDE.md` (project root). It captures the project overview, tech stack, project structure, host-based dev environment justification, setup instructions, development conventions, the current milestone, and key decisions — all derived from the product docs under `docs/product/`. (The Setup & Ecosystem Gotchas section also records pnpm-v11 / ESLint-v9-pin / Prettier-ignore pitfalls from M1's scaffold.)

**Active milestone:** Milestone 3 — CC lifecycle & state plumbing (status broadcaster + Unix-socket hook channel + `.session.md` watcher). M1 + M2 complete and closed.

**First feature:** WP1 — Probe: hook → Rust Unix-socket → parse wire + `settings.json` coexistence with `claude-time`.
