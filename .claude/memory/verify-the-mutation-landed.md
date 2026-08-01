---
name: verify-the-mutation-landed
description: A mutation test must confirm the MUTATION actually changed executable code, not just that the test ran — two attempts in one session reported "the guard does not bite" having modified nothing (a whitespace-mismatched pattern, then a doc comment quoting the predicate). Read the mutated line back before believing a pass.
metadata:
  type: project
---

This project repeatedly re-learns that a guard which merely *exists* is not proof (M10.9 WP3.5a:
three guards "looked like proof and were not"). **The mutation test written to check that has the
same failure one level up: a mutation that never lands makes a broken guard look fine.**

**Observed twice in one session (M11.5 WP3), both times reported as "the guard did not bite":**

1. `perl -0pi -e 's/=== ","/=== ";"/'` — the code reads `&& e.key === ","`; the pattern's spacing
   did not match, so **nothing changed**. Test passed. Looked like a guard hole.
2. `perl -0pi -e 's/e\.key === ","/e.key === ";"/'` — this hit the **doc comment on line 35**
   (*"Matches on `e.key === ","` …"*), which quotes the predicate verbatim, leaving the actual code
   on line 39 untouched. Test passed again.

Only after anchoring on the full statement did the mutation land — and the guard then failed
correctly on **2 of 7** assertions, including its own non-vacuousness meta-test.

**The rule: read the mutated line back before trusting the verdict.**

```bash
perl -pi -e 's/return e\.metaKey && !e\.shiftKey && e\.key === ","/…";"/' path/to/file.ts
sed -n '39p' path/to/file.ts   # ← the step that makes the result meaningful
./node_modules/.bin/vitest run path/to/guard.test.ts
```

**Two specific hazards worth internalizing:**
- **Doc comments that quote the code they document** are magnets for `perl`/`sed` patterns. Files in
  this repo are heavily commented and frequently restate expressions in backticks, so a naive
  pattern hits prose first. Anchor on a full statement (`return …;`) or target by line number.
- **A silent no-op reads exactly like "the guard has a hole."** The failure is
  indistinguishable from a real finding, and the wrong conclusion — "my guard is broken" — leads to
  weakening a guard that was fine.

**Corollary — isolate one variable.** A mutation that changes two things at once (e.g. reflowing a
line *and* altering a word) proves nothing about either. See
[[raw-guard-jsx-prose-needs-flattened-haystack]] for the same mistake made and corrected in the same
session.

Directly load-bearing for **M11.5 WP4**, whose entire deliverable *is* a mutation-proof (the
OFF-invariant guard's chord arm must be shown to FAIL on an ungated chord in `panelHost.ts`) — a
non-landing mutation there would report success while the hole stayed open.
