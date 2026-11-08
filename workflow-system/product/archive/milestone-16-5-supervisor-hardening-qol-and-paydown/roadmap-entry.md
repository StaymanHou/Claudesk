# Roadmap entry — Milestone 16.5 (archived verbatim at cycle close, 2026-11-08)

From `roadmap.md` → "Next" → "Then, in order", item 2, as it stood when the cycle closed.

2. **Milestone 16.5: supervisor hardening + QoL + paydown bucket** — scoped at a `/util-grill-me`
   pass on 2026-10-20 (rulings below are SETTLED). ✅ **Its gate is MET:** the installed `v0.7.1`
   fired four times on 2026-10-12 (`bluecg-maps`, autopilot, P3→P5→P7→P9 in
   `supervisor-activity.log`). Decomposition: `wbs.md`.
   - ⚠️ **Operator ruling: ONE bucket holds everything** (the picker fix included; nothing ships
     ahead of the WBS), and the **adjudicator re-measurement is IN** (it needs an operator labelling
     pass). Both reversed the agent's recommendation.
   - **Supervisor:** a fire on a transition token quoted in prose; a leaked workspace subscription
     (the duplicate *decision* is already contained; the leak and the lost `⚙` remain);
     `is_turn_start` firing on mid-turn dequeues; an alarm for a transcript-format change; the
     adjudicator re-measurement (`SURFACE-2026-09-15-ADJUDICATOR-MARGIN-NEEDS-A-LARGER-LABELLED-SET`);
     and closing `SURFACE-2026-09-14-SUPERVISOR-NEVER-OBSERVED-FIRING-IN-A-LIVE-SESSION` with its
     three on-screen checks (`⚙`, a fire with another app focused, Esc recovery) as acceptance.
   - **Status dot (measure first):** the artifact-watch purple dot, and a verify-human pause with a
     background shell reading purple, not blue (workflow-gated, default OFF).
   - **QoL:** picker filter autocorrect; per-result / per-file replace (⚠️ needs a UX decision: the
     Find Results tab is read-only); a failed delete/trash surfaces an error (the create-collision
     half already shows inline); a go-to-line (⌘⌥G) Settings hotkey row; derived model-alias hints;
     keyboard pan/zoom in the Day view; variable-frame-rate frame-step in the review player.
   - **Last WP: a code-quality paydown** over the carried findings (`/util-backlog-paydown` shape).
   - ⛔ **The stale minimap is EXCLUDED** — feature-sized (upstream issue #1, a `drawLine` rewrite),
     pulled from M11.5 for that reason; soft-wrap off is the workaround.
