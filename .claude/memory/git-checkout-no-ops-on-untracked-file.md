---
name: git-checkout-no-ops-on-untracked-file
description: "`git checkout -- <path>` on an UNTRACKED file does nothing and exits 0 — it left a mutation probe in place in a new module and reported success. For any mutation test, capture `shasum` before and verify after; for an untracked file `git diff`/`git checkout` are INAPPLICABLE, not merely weak evidence."
metadata:
  type: project
---

**`git checkout -- <path>` on a file git does not track is a silent no-op.** It exits 0, prints
nothing, and leaves the file exactly as it was. There is no warning and no non-zero status.

**Observed (M15 WP3 Phase 5, 2026-09-13):** restoring a mutation probe in
`src/state/supervisor/fanOut.ts` — a brand-new module, still `??` in `git status`. The command
reported success and **left the mutant in place**. Caught only because the restore was verified by
`shasum` against a baseline captured before mutating:

```bash
B=$(shasum src/state/supervisor/fanOut.ts | awk '{print $1}')   # ← the step that saved it
# …mutate, run tests…
git checkout -- src/state/supervisor/fanOut.ts                   # exits 0, does NOTHING
A=$(shasum src/state/supervisor/fanOut.ts | awk '{print $1}')
[ "$A" = "$B" ] || echo "NOT RESTORED"                           # ← this is what caught it
```

**⚠️ The failure mode is a mutated file shipping**, and it is silent in both directions: the mutant
stays, *and* the restore looks done. `git status` shows the file as `??` either way, so it is not a
tell.

**The rule: for any mutation probe, capture the SHA before and verify it after.** `cp` the file
aside works equally well. Do not reach for a git command to undo a change to a file git has never
seen.

**⚠️ For an untracked file, `git diff` / `git diff --stat` / `git checkout` are INAPPLICABLE, not
weak.** A `git diff --stat` that shows "no change" on an untracked file is **vacuously true** — it
would show the same thing whether the file were pristine or wholly rewritten. A subagent
independently flagged this half of the hazard at Phase 4 verify-self ("`git diff --stat` could not
have shown a mutation there either way — the SHA comparison is the load-bearing restore evidence"),
one phase before the `checkout` half actually bit.

**Distinct from the mutation-*landing* family.** [[verify-the-mutation-landed]] and
[[bsd-sed-lacks-word-boundary]] cover whether the mutation **applied**; this covers whether the
**restore** did. Both halves need verifying, and a whole WP's worth of new modules are untracked at
exactly the moment they are most heavily mutation-tested.

Filed as `SURFACE-2026-09-13-GIT-CHECKOUT-SILENTLY-NO-OPS-ON-AN-UNTRACKED-FILE` (high) for a fold
into `docs/lessons/source-text-guards.md` as a mutation-testing precondition.
