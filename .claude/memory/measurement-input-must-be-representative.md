---
name: measurement-input-must-be-representative
description: A measurement's INPUT must exercise the use case, or the reading describes the input rather than the system — `claude -p "say ok"` was too short to overflow the pane and produced two confident wrong generalizations about CC's scrollback.
metadata:
  type: project
---

Measuring the CC pane's buffer with **`claude -p "say ok"`** — a one-line turn, far
shorter than the 68-row viewport — produced **two confident, coherent, wrong**
generalizations, both stated as findings:

- *"CC's pane accumulates no scrollback"* — a **real** turn gives `baseY: 130`.
- *"Successive turns mark the same buffer line"* — real markers were `[19, 137]`, distinct.

The degenerate input **never overflowed the viewport**, so it never exercised the scrollback
at all. Every number read was true *of that input* and false of the system.

⚠️ **The tell was available and ignored:** `arch.md`'s own rule — *an observation is only
decisive when a broken implementation would give a DIFFERENT answer.* On a buffer where
`maxScroll` is 22 and every marker sits at the ceiling, a "viewport didn't move" reading is
**identical** whether the code works or not. A first round-trip check produced
`roundTripReturned: true` **vacuously** for exactly this reason and had to be discarded.

**Cost:** a WP escalation, a false mechanism refutation that survived three rounds, and two
operator pushbacks — the operator was right both times while the agent's reading was confident.

**The check, before believing any measurement:** *does this input actually reach the
mechanism?* For a scrollback question that means output must exceed `rows`; for a long-turn
feature it means a long turn (the operator's real case was 10+ minutes / 100+ lines, not one
line). Grow the input and re-run rather than banking the cheap reading.

Same family as [[verify-the-mutation-landed]] and
[[invalid-probe-and-real-hole-look-identical]] — in all three the instrument silently fails to
exercise the thing, and the result is indistinguishable from a genuine finding. Related:
[[observable-outcomes-execution-evidence]].
