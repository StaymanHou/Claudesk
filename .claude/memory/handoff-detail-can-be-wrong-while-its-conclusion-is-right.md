---
name: handoff-detail-can-be-wrong-while-its-conclusion-is-right
description: "A session handoff's conclusion can be right while its supporting detail is wrong — verify any claim about what already shipped against `git tag`/`git log` before writing user-facing text from it. An accurate adjacent number is what makes the wrong claim credible."
metadata:
  node_type: memory
  type: feedback
---

A `/session-handoff` pointer is the highest-trust artifact at session start — it is read first, it is
written by a past self with full context, and its whole purpose is to be believed. **That is exactly
why a wrong detail inside it survives.** The conclusion can be correct and well-argued while a
supporting fact underneath it is false.

**Measured, 2026-09-06 (the M14 release cut).** The 2026-08-26 handoff said:

> ⚠️ **`main` is 41 ahead of origin and 43 ahead of the last tag `v0.3.4`** — M13, M13.5 and the
> paydown sweep are all **shipped-but-undelivered**.

- **The conclusion was right** — a release was genuinely owed, and the order reversal that followed
  from it (M14 → M15) was the correct call.
- **The commit-count was right** — 42 ahead when checked, trivially verifiable, and it *anchored the
  credibility of the sentence it sat next to*.
- **The scope claim was wrong.** `v0.3.4` was tagged **2026-08-19**, a day *after* M13 closed on
  08-18, and `git log v0.3.4 | grep -c "m13-"` returns **12**. The undelivered work was **M13.5 plus
  the workspace-close-hang incident fix** — nothing else.

**The blast radius is what makes this worth a memory.** The consumer here was a *public release
note*. Written from the handoff, v0.4.0 would have announced a milestone that shipped three weeks
earlier, to everyone on the tap. The handoff is the highest-trust input; a release note is the
highest-blast-radius output; there is no gate between them but this check.

**Why it is not caught by ordinary care.** Nothing about the sentence reads as uncertain — no hedge,
no "I think", no stale-date marker. And the accurate number beside it does active harm: a reader who
spot-checks "42 ahead", finds it true, and generalizes that trust across the paragraph has done
*more* verification than usual and still lands wrong. **Verifying the cheap adjacent fact is not
verifying the claim.**

**How to apply:**

1. **Before writing anything user-facing from a handoff** — a release note, a changelog entry, a
   milestone close, a public README line — verify its claims about *what already shipped* against
   `git tag --sort=-v:refname`, `git log <tag>..HEAD`, and the tag's own date. One command.
2. **Compare dates, not just membership.** The tell here was ordering: the tag post-dated the close
   it supposedly omitted. `git log -1 --format=%ci <tag>` against the close commit's date settles it.
3. **Treat an accurate neighbouring number as zero evidence** for the claim beside it. They have
   independent provenance — one was recomputed at handoff time, the other was remembered.
4. **Record the correction where the next reader will hit it**, not only in the fix. This instance
   went into the task WIP's `## Discoveries`, the roadmap revision note, and the close commit body —
   so the next session reads the corrected scope, not the original.
5. **Do not treat this as a reason to distrust handoffs.** The conclusion was right and acting on it
   was correct; the discipline is a targeted check on shipped-state claims, not general suspicion.

Related: [[backlog-finding-carries-an-implicit-as-of-date]] (the sibling rule for *backlog findings* —
same shape, different artifact: there the finding ages out, here the detail was wrong when written),
[[doc-correction-scope-list-is-a-floor]] (when a claim is known wrong, grep the claim repo-wide rather
than trusting an enumerated site list — the same session hit this too: 4 sites named, 6 found).
