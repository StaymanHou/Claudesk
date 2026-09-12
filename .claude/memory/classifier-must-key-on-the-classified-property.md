---
name: classifier-must-key-on-the-classified-property
description: A classifier keyed on a grouping attribute that merely CORRELATES with the classified property is correct today and wrong in shape — it silently mislabels the first member that breaks the correlation. And keying on the right field alone can still be wrong if the taxonomy is too coarse.
metadata:
  type: project
---

Found at code-quality review, M15 WP2 (`lookup.ts`). Two halves — the second is the one
that is easy to miss.

## 1. Keying on the group, not the property

`unmappedReason()` answers *"why does this edge have no policy row?"*. It was written as:

```ts
if (edge.workflow === "session-ops") return "meta-op";
```

**Correct output on every edge in the graph** — and wrong in shape. Of the 21 `session-ops`
edges only **12** are meta-ops: 6 are `cross-workflow` (S1–S5, S18), 1 `terminal` (S20), and
2 are **dispatchable skills** (S22, S23). The workflow was standing in for the property.

⚠️ **The failure it would have caused is a SILENT UNDER-REPORT, not a crash.** Add one
session-ops edge with a real skill target and no policy row, and it is labelled *"no policy
row is owed"* — hiding a genuine upstream gap from `unmappedReport()`, **the one report whose
entire job is to surface gaps**. Every existing test still passes, because they assert the
counts that were correct when written.

## 2. ⚠️ The right field with too coarse a taxonomy is ALSO wrong

The obvious fix — key on `edge.dispatchTarget.kind`, return `meta-op` only for meta-ops —
**made the report worse**: 7 correctly-rowless edges (S1–S5, S18, S20) fell through into the
`no-row-upstream` bucket, taking the gap list from 2 entries to **9** and burying the one real
gap among them.

The working fix needed the full taxonomy — `terminal` and `cross-workflow` as their own
reasons — so that `no-row-upstream` **means what its name says**. Net effect: the gap list
went 2 → **1**, which also retracted an over-broad finding this WP had already reported in
four places (`P13` is terminal; no row was ever owed).

## The check

When writing a classifier, ask: *is this field the property, or something that correlates
with it in today's data?* Then: *does every output name a real, distinct case, or is one
bucket absorbing things that merely failed the earlier tests?*

Related: [[derived-state-is-not-a-proxy-for-its-event]] — the same substitution one level
down (a derived state standing in for the event that produced it). Both ship green.
