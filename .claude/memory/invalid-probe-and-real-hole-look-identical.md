---
name: invalid-probe-and-real-hole-look-identical
description: "A guard probe that passes may mean the guard has a hole OR that your probe was invalid (e.g. placed in an exempt module) — the two are indistinguishable from the result alone; verify the probe's own premises before filing a hole."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 9c927375-5229-4d26-8f2d-bfe289c2b2df
  modified: 2026-08-12T15:50:00.544Z
---

When mutation-probing a guard and it **passes** (does not bite), that result has two
indistinguishable causes: the guard genuinely has a hole, **or your probe never presented the
violation the guard checks for**. Verify the probe's premises before concluding either.

**The instance (M12 WP5, 2026-08-12):** probing the OFF-invariant guard's chord arm, an ungated
`docsChord` was added to `panelHost.ts` — the module M11.5 widened the arm to reach. Guard passed
19/19, which read exactly like the previously-proven `panelHost.ts` hole having reopened. It had
not: the arm's predicate is `namesWorkflowTerm(src) && !/useWorkflowFeaturesEnabled/i.test(src)`,
and `panelHost.ts` legitimately references the seam, so the whole module is exempt. Re-run in a
non-seam module (`closeTerminalChord.ts`) it failed correctly.

**Why the false read is dangerous:** the natural next step after "the guard doesn't bite" is to
*weaken or rewrite the guard*, which is how a working guard gets broken. Same failure family as
`[[verify-the-mutation-landed]]` — there the mutation never reached executable code; here it
reached code the predicate deliberately excludes. Both produce a green that means nothing.

**How to apply:** before filing a hole, check (1) the mutation landed in executable code, and
(2) the mutated site is actually *in* the guard's candidate/predicate scope — read the predicate,
don't assume it from the arm's name. If a probe passes, run the *same* violation in a site you
know is in scope as a positive control; disagreement between the two locates the exemption.

**The genuine finding underneath:** the exemption really is coarser than intended (whole-module
rather than per-export), and `panelHost.ts` satisfies it permanently. That is worth filing — but
as the narrow fact it is, not as "the arm doesn't work."

Related: `[[guard-predicate-completeness-vs-mutation-landing]]`,
`[[raw-guard-identifier-satisfied-by-own-comments]]`, `[[verify-the-mutation-landed]]`.
