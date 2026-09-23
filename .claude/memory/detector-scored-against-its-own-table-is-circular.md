---
name: detector-scored-against-its-own-table-is-circular
description: "A detector scored against a fixture its OWN policy table produced reports precision/recall 1.000 no matter how wrong the table is — arithmetic identity, not evidence. Treat a perfect score as a symptom; score against a signal the detector does not produce."
metadata:
  node_type: memory
  type: feedback
---

A detector scored against a fixture that **its own policy table produced** is circular: it will report **precision 1.000 / recall 1.000 regardless of whether the table is right**.

M15 WP1: `detect.py`'s predicate and `mine.py`'s `label()` both called the same `lookup()` with the same branch order on the same inputs, so 1.000/1.000 was **arithmetic identity**. It would have read perfect even if `policy.py`'s 95 hand-transcribed edges were entirely wrong.

⚠️ **Nothing in the run flags it.** The numbers look like the best possible outcome — which is exactly why it was caught only by treating a **perfect score as a SYMPTOM** rather than a success.

**The fix is a signal the detector does not itself produce.** In this corpus that is **operator behavior**: a short, content-free nudge (`"so?"`, `"next"`, `"chain"`, `"why returning control?"`) typed right after a verdict is structural evidence of a wrongful stop, independent of the policy table. Scored that way the predicate got **36/36**.

⚠️ **Binds M15 WP3**, which will tune the real detector against this same fixture — its acceptance measurement must not be re-derived from the typed graph the detector consults. Evidence: `workflow-system/product/archive/milestone-15-workflow-supervisor/wp1-probe-report.md` → Q1; `SURFACE-2026-09-11-A-DETECTOR-SCORED-AGAINST-ITS-OWN-POLICY-TABLE-IS-CIRCULAR` — deleted from `backlog.md` 2026-09-23 as captured by THIS memory (see `CHANGELOG.md` 2026-09-23; full text in git history).

Related: [[verify-the-mutation-landed]], [[invalid-probe-and-real-hole-look-identical]], [[guard-predicate-completeness-vs-mutation-landing]].
