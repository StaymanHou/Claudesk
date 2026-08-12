---
name: grep-addressed-doc-loses-value-to-prose-rewrite
description: "Reorganizing a grep-addressed reference doc must move text near-verbatim — rewriting it as prose silently deletes the identifiers that ARE its value; diff the token set, not just the warnings."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 1a01975e-fca5-499b-92d3-c7e4516ab5c9
  modified: 2026-08-12T17:28:29.904Z
---

When restructuring a **grep-addressed** reference doc (one people search by identifier rather than
read end-to-end — `arch.md` is the canonical example, and its own backlog item said so), **move the
text near-verbatim.** Do not rewrite it into flowing prose.

**Why:** prose compression is the only lever a single-file reorganization gives you, and it destroys
exactly what makes the doc useful. Measured on the reverted first attempt at the 2026-08-12 `arch.md`
split: the rewrite **grew** to 1161 lines (from 982) *and* dropped **259 distinctive tokens**, ~70 of
them live identifiers still in the codebase — `aggregate_alarm`, `availablePanels`, `chooseDoc`,
`DocEntry`, `docsReloadDecision.ts`, `fs_index`. Every one had been replaced by a readable sentence
describing it. **Identifier density IS the value.**

**How to verify a doc reorganization, before committing:**

```bash
# snapshot BEFORE
grep -oE '`[a-zA-Z_][a-zA-Z0-9_:./-]{4,}`' before.md | sort -u > tok-before.txt
grep -c "⚠️" before.md

# after — concatenate the whole output set if you split into several files
cat arch.md arch/*.md > after.md
grep -oE '`[a-zA-Z_][a-zA-Z0-9_:./-]{4,}`' after.md | sort -u > tok-after.txt
comm -23 tok-before.txt tok-after.txt          # tokens LOST
```

Then **attribute every lost token** to one of: (a) a commit SHA or heading you deliberately retitled,
(b) a path you *relativized* (`archive/…` → `../archive/…`) — verify it resolves, (c) genuinely
superseded, or (d) **a real loss, which must be restored.** A clean split lands at 0–6 lost tokens,
all in categories (a)–(c).

⚠️ **Counting warnings alone is not sufficient** — the reverted rewrite preserved every `⚠️`
(67 → 127 occurrences) while silently shedding 259 identifiers. The warning count and the token set
are two independent checks.

**Corollary — if a reorganization can't shrink a doc without deleting identifiers, the doc doesn't
need trimming; it needs splitting.** That is the evidence that justified the pivot from
single-file-restructure to index + `arch/<subsystem>.md`.

Related: [[doc-correction-scope-list-is-a-floor]] (grep the *claim* repo-wide when sweeping inbound
references — it caught 5 stale pointers an enumerated list missed, including one written hours
earlier in the same session).
