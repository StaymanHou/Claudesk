---
name: backlog-finding-carries-an-implicit-as-of-date
description: "A backlog finding is true as-of its filing date; a conditionally-scoped one ('no consumer until WP3') can be resolved by the passage of the work it names — so re-read the code before sweeping it, and record no-change-needed rather than inventing an edit."
metadata:
  node_type: memory
  type: feedback
---

Every backlog finding carries an **implicit as-of date**. A finding whose text scopes itself
conditionally — *"no consumer **until WP3**"*, *"pending WP\<n\>"*, *"until the editor lands"* — can be
**resolved by the passage of the very work it names**, with nobody closing it. Re-read the code
before sweeping it.

**Measured, paydown WP1 (2026-08-18): 2 of 4 sub-items were not what the filing said.**

- `SURFACE-2026-08-01-QUALITY-WP2-MINOR-BATCH` sub-item (3) read *"`DocsPanel.tsx:29,95` —
  `selected` has no consumer until WP3; the header says so, the code doesn't."* **WP3, WP4 and WP5
  all shipped in the interim.** `selected` is now the panel's central derived value (~35 references,
  `DocsPanel.tsx:239` and downstream) and the stale header claim it cites was **already gone**.
  Nothing to do — the finding aged out.
- Sub-item on `recycleSession.ts` named `waitForFreshSessionId` as declared-after-use. It has **no
  in-file caller at all**; only its two default-value constants were late. The filing was wrong
  about its own subject.

**Why this is not the same as line-number drift.** The sweep already warns *"line numbers have
drifted — re-anchor by SYMBOL, never by the recorded line."* That gets you to the right code. This is
the next question: **is it still a finding?** In WP1's case the line moved **and** the condition had
expired — two independent traps, and re-anchoring alone would have led straight to a live, correct,
heavily-used symbol and invited a "fix."

**The failure mode is fabrication, not omission.** An agent that trusts the summary line arrives at
working code with a mandate to change it, and the cheapest way to satisfy the line item is to invent
an edit — deleting a value with 35 consumers, or "correcting" a header claim someone already
corrected. A green suite will not save you: for a subtraction, a no-op is identically green.

**How to apply:**

1. **Read the finding's own scope words first.** Any conditional (`until WP<n>`, `pending X`, `once Y
   lands`) is a live expiry clause — check whether X/Y shipped before treating it as work. `git log`
   on the cited file answers it faster than the code does.
2. **Verify the cited defect still exists**, not just that the cited symbol does. Grep the *claim*
   (e.g. the "no consumer" header text), not only the identifier — see
   [[doc-correction-scope-list-is-a-floor]] for the sibling rule on searching for a retracted claim.
3. **Record no-change-needed WITH evidence** — reference count, the absent stale text, the commits
   that resolved it. It still earns its `**Backlog resolved:**` line. Silence looks identical to
   having skipped the item.
4. **Partial resolution → rewrite, never delete.** WP1 closed 2 of 4 sub-items, so the entry was
   rewritten to the 2 survivors (per the delete-on-resolve partial carve-out) and its coupled
   pointer stub in `backlog.md` updated in the same commit.
5. **Expect this repeatedly.** The backlog runs ~35 open items, some months old, against 7 remaining
   paydown WPs — findings filed mid-milestone against work that has since shipped are the norm here,
   not the exception.

Related: [[doc-correction-scope-list-is-a-floor]] (governs the *search* when a claim is known wrong;
this one governs whether it is *still* wrong), [[verify-the-mutation-landed]] (a green suite cannot
distinguish a real subtraction from a no-op — mutation carries the verdict).
