---
stage: context
state: complete
updated: 2026-10-20
---

# Context

The project CLAUDE.md is at `CLAUDE.md` (project root). It is hand-curated and was **merged, not
regenerated**.

**Active milestone:** **Milestone 16.5: supervisor hardening, QoL and paydown bucket.** It was
decomposed on 2026-10-20 into 8 WPs in `workflow-system/product/wbs.md`, after a `/util-grill-me`
pass. Its rulings are recorded there:
- One bucket holds everything.
- The adjudicator re-measurement is in.
- The minimap is excluded.
- The code-quality paydown is last.

**First work package:** **WP1: Probe, what the hook channel carries for background work and
dequeued prompts.** It is on the critical path (WP1 → WP4 → `/release` → WP7 → WP8) and gates every
status-dot and turn-start design.
- Start WP2.1 (mining the labelling set) early. WP2 is calendar-bound by the operator labelling
  pass.
- WP3, WP5 and WP6 are parallel tracks.

**Entry point:** `/feature-plan` for WP1. It is a timeboxed probe with its questions already
settled. WP4 and WP6 enter through `/feature-spec` when their turn comes:
- WP4 has a seventh-guard-arm decision and a consumer sweep.
- WP6 has a UX decision first.

## What this pass changed

- **`CLAUDE.md` → `## Current Milestone`:** gained an M16.5 lead block carrying the grill rulings.
  The M16 line now points at it, and the "Execution order" paragraph names M16.5 as current.
- **`roadmap.md` → Next → item 2:** scoped as M16.5 (commit `84eb1a9`). The supervisor gate is
  recorded as met by the 2026-10-12 installed-build fires.
- **`.gitignore`** already matched the canonical block (no diff), and the memory symlink was
  already in place.
