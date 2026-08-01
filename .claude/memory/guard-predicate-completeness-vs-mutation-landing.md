---
name: guard-predicate-completeness-vs-mutation-landing
description: A guard's PREDICATE can be incomplete in a way that makes a passing result under-determined — a distinct failure from a mutation that never lands; mutation-test each guard option individually and confirm each resurfaces a specific vector class.
metadata:
  type: project
---

[[verify-the-mutation-landed]] covers one failure: *the mutation never reached executable code, so "the guard did not bite" was a false diagnosis.* **This is its sibling, and it is not the same bug:** the mutation lands fine, the guard runs fine, and the result is still meaningless — because **the predicate cannot see the vector class you care about.**

**The concrete instance (M11 WP1 Phase 2, 2026-08-01).** A sanitization check scored a config as **0 live vectors = clean**. It was wrong twice over:

1. **First predicate — source-text regexes.** It counted the fixture's own *heading prose* ("3. `javascript:` URL in a markdown link") and `&lt;`-escaped **inert** text as live vectors. Classic `?raw`-guard failure: source text ≠ runtime.
2. **Second predicate — parsed live DOM (the fix).** Better, and still incomplete: it had **no `style`-attribute probe**, so `<div style="background:url(javascript:alert(1))">` scored **0**. That made a passing config **under-determined** — it was safe only because it *happened* to pass `FORBID_ATTR:["style"]`, and the predicate could not have detected the difference. Remove that option and the score stays 0.

**The tell:** a guard that reports 0 does not distinguish *"nothing dangerous survived"* from *"I can't see what survived."* Those look identical in the output.

**What to do instead:**
- **Interrogate the parsed DOM, not the source string** — a vector counts only if it would actually execute.
- **Mutation-test each guard option *individually*, and attribute each mutant to a specific probe.** For the Option-A recipe: drop the hook → `dataSvg=1`; drop `FORBID_ATTR:["style"]` → `styleAttr=2`; drop `FORBID_TAGS:["style"]` → `style=1`; drop all → 4. Each option resurfacing *its own* named vector class is what makes the aggregate 0 trustworthy. A single composite mutation that trips *some* probe hides exactly this gap — the same reason M10.9 WP5.2 probed the OFF-invariant guard's five arms separately.
- **Watch for false positives in the fix too.** Widening the predicate, I first counted a bare `<form>` whose `action` had already been stripped — inert, but inflating the score. Narrow to *tags that still carry the dangerous attribute* (`object[data]`, `form[action]`, …), not bare tag presence.
- **The most effective move: have a fresh reviewer attack the predicate, not the numbers.** Every real defect here came from instructing a subagent to *refute* the measurement rather than reproduce it. The style-attribute hole was found that way; so was the `[[widened-selector-must-be-strict-superset]]` class in M11.5 WP4.

Known residual on that predicate (accepted, COSMETIC): `img[srcset]` and `track[src]` to an external host survive and are unmodeled — outbound network/beacon references rather than script execution, and only reachable at all because [[app-ships-with-no-csp]].
