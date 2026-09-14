# Hand-off to mccc — M15 WP4: pin the Work Tree schema in `check-structure.sh`

**From:** Claudesk, M15 WP4 (context-pressure recycle at phase boundaries)
**Date:** 2026-09-14
**Status:** ⚠️ **Not applied.** This note is written *in the Claudesk repo*; the edit belongs to a session running *in the mccc repo*. Same posture as `HANDOFF-to-mccc-m15-wp2.md` — see that note's "Why this is a note, not a commit".

---

## The ask, in one line

**Add a `check-structure.sh` phase that pins the Work Tree schema**, so Claudesk's new WIP-file parser is a **contract-reader** rather than a guesser.

---

## Why this is asked now

M15 WP4 gives Claudesk a `parseWip()` that reads a project's active WIP file to answer two questions on every turn end:

1. **Is this the feature workflow?** (the recycle is feature-workflow-only — operator-confirmed)
2. **Is it at a phase boundary that is not the last phase?** (work completed AND work remaining)

Above a context threshold, all three conditions true → Claudesk **recycles the CC session** (`/session-handoff` → fresh CC → `/session-restore`) instead of auto-chaining.

⚠️ **That parser reads a format mccc owns and Claudesk does not.** Today every property it depends on is an **observed regularity**, not an enforced one. If the Work Tree's shape shifts, Claudesk does not fail loudly — it silently reads the wrong number of phases and recycles (or declines to recycle) for the wrong reason. A pin turns a silent misread into a caught contract break.

This is the cross-repo dependency the WBS flagged as *"hand off **before** this WP is built"* (task 4.7).

---

## The three properties the parser depends on

Sourced from `src/state/supervisor/wipPhases.ts` as built (not from memory):

### 1. A phase line is `- [ ] Phase <N>: <title>` at **column 0**

```
const PHASE_LINE = /^- \[([ xX])\]\s+Phase\s+\d+\s*:\s*(.*)$/gm;
```

⚠️ **The column-0 anchor is the load-bearing part, and this is not theoretical.** Measured against a real archived file in the Claudesk repo, `workflow-system/state/archive/wp4-thumbnail-rendering-probe.md`, which carries this line at line 14:

```
  <!-- ORIGINAL: - [ ] Phase 1: Harness scaffold + deps + stream fixtures -->
```

An indented, commented-out phase line — an ordinary artifact of revising a Work Tree, not a contrivance. Re-measured 2026-09-14:

| parse | phases found | complete | `atNonFinalPhaseBoundary` |
|---|---|---|---|
| **anchored** (`^`) | **3** | 3 | `false` ✅ |
| unanchored | **4** | 3 | `true` ❌ |

⚠️ **Unanchored, Claudesk would recycle a COMPLETED feature** — it sees a phantom open phase. Child impl tasks (`  - [ ] P1.1 …`) are excluded for the same reason.

### 2. `[x]` means complete; `[ ]` means not — **the checkbox is the authority**

⚠️ **Claudesk deliberately does NOT read the `<!-- status: … -->` comment.** Both appear on every phase line and they can disagree; the comment carries free-form text with no fixed vocabulary (`NOT-STARTED; depends on Phase 1`, `in-progress`, `DONE`, `SURFACED: …`). The checkbox is a two-valued contract. **If a pin is added, please pin the checkbox** — that is what Claudesk reads.

### 3. The workflow is named by `**Workflow:** <name>` in the frontmatter

```
const WORKFLOW_LINE = /^\*\*Workflow:\*\*\s*([A-Za-z-]+)\s*$/m;
```

⚠️ **Recognized values are `feature`, `task`, `incident` — THREE, not four.** Anything else reads as
`null` and **never** passes the feature gate. Not anchored to a fixed line number — the frontmatter
is a markdown block, not YAML, and field order is not fixed.

⚠️ **`product` is deliberately NOT in that list, and please do not add it to a pin.** Measured
2026-09-14 across both repos: `**Workflow:** product` occurs **zero** times in **343
`**Workflow:**` lines** (Claudesk 130 feature / 15 task / 4 incident across 149 files; mccc 137 /
42 / 15 across 193 files — `workflow-system/product/arch.md` carries two, and ~7 of those lines are
schema templates inside skill/arch docs rather than WIP files). It is structural,
not merely unobserved — the product workflow writes to `workflow-system/product/`, never to
`state/wip/`; the only `product-*` skill that mentions `state/wip/` (`product-finalize`) **reads**
it to check for references. `product` exists as a *session-start routing label*, which is a
different thing from a WIP frontmatter value. ⚠️ Claudesk's own `KNOWN_WORKFLOWS` set does carry a
harmless unused `product` member; pinning it upstream would be different — it would add an arm that
**can never fail**, inside a pin whose whole purpose is failing loudly on drift.

---

## What a pin would look like (suggestion, not a prescription)

Something in the spirit of the existing phases — for every `workflow-system/state/wip/*.md` and `workflow-system/state/archive/*.md` whose frontmatter says `**Workflow:** feature`:

- every top-level phase line matches `^- \[[ xX]\] Phase [0-9]+: `
- no **indented** line matches `- \[[ xX]\] Phase [0-9]+: ` **outside an HTML comment**
  - ⚠️ or, if that is too strict given the `<!-- ORIGINAL: … -->` convention above, pin instead that indented occurrences are **only ever** inside comments — which is what makes the column-0 anchor sufficient
- exactly one `^\*\*Workflow:\*\* ` line, and its value is one of the **three** observed workflows (`feature` / `task` / `incident`) — ⚠️ **not** `product`; see the note under property 3

⚠️ **Claudesk is not asking mccc to change the format.** The format is fine; the ask is only that it be **enforced**, so a future drift is caught in mccc's own CI rather than silently changing Claudesk's recycle decisions.

---

## ⚠️ Also still open: the WP2 handoff

`HANDOFF-to-mccc-m15-wp2.md` (2026-09-12) is **still unapplied**, and carries one **unanswered question** that a mccc-rooted session should resolve at the same time:

> Should `I2` (incident: report → triage) **PAUSE** like every other incident row, or **AUTO**?

Context: `I2` is one of 31 edges with **no governing policy row**. Claudesk's verdict treats `unmapped` as a **result**, never coercing it to `auto` — so today `I2` never fires. That is the safe direction, but it is a gap in the upstream table rather than a decision, and `I2` **is** dispatchable, so the answer matters.

⚠️ **Claudesk's WBS task 2.9 stays `[~]` until the WP2 note is applied.** One mccc-rooted session can clear both notes.

---

## What Claudesk did in the meantime

Rather than block on this, WP4 shipped the parser with the properties above **documented in-code as observed-not-enforced**, and pinned by tests that read **real WIP files** from the Claudesk repo (the archived WP3 file, and the thumbnail-probe file for the anchor case) — so a schema drift breaks a Claudesk test even before any mccc pin exists.

⚠️ That is a **backstop, not a substitute**: those tests only see files in *this* repo. A pin in mccc protects every project that uses the workflow system.
