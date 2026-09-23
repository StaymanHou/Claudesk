---
name: git-checkout-no-ops-on-untracked-file
description: "`git checkout -- <path>` is the wrong restore for a mutation probe in BOTH directions: on an UNTRACKED file it silently no-ops (mutant survives); on a TRACKED-but-DIRTY file it reverts to HEAD and DESTROYS uncommitted work. Back up with `cp` and verify the restore by `shasum` against a pre-captured baseline."
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

## ⚠️ The MIRROR-IMAGE hazard: tracked-but-DIRTY (2026-09-17, M14 WP0 verify-self)

**`tracked ≠ committed`, and that is the whole trap.** The rule above ("don't use git to undo a
change to a file git has never seen") reads as though *tracked* files are safe. They are not.

**Observed:** a verification subagent restored a mutation probe in
`src/components/workspace/Workspace.tsx` with `git checkout -- <path>`. The file was tracked but
**`M`** — carrying uncommitted WP0 work. Checkout reverted it to **HEAD**, silently stripping the
`UnsentInputWatermark` import, the ref, the `hasUnsentInput` dep and the `onInputForwarded` prop.
The mutation probe was undone *and so was the feature*.

⚠️ **The two failure modes are exact opposites, which is why one rule cannot be remembered as a
special case of the other:**

| File state | `git checkout -- <path>` does | Failure |
|---|---|---|
| Untracked (`??`) | **nothing** | the **mutant survives** |
| Tracked + dirty (`M`) | reverts to **HEAD** | **uncommitted work is destroyed** |
| Tracked + clean | the right thing | — |

**So the safe procedure does not branch on tracked-ness at all:** `cp` the file aside before
mutating, restore from that copy, and verify with `shasum` against the pre-captured baseline.
⚠️ **The `shasum` check is what caught this within one step** — the restore *command* reported
success in both cases.

⚠️ **Do not tell a subagent "git checkout is a valid restore, the file is tracked."** That
instruction was in the task brief and is what produced the destruction; the agent followed it
correctly. Brief the `cp` + `shasum` procedure instead, unconditionally.

**Distinct from the mutation-*landing* family.** [[verify-the-mutation-landed]] and
[[bsd-sed-lacks-word-boundary]] cover whether the mutation **applied**; this covers whether the
**restore** did — in both of its opposite failure directions (see the table above). Both halves need verifying, and a whole WP's worth of new modules are untracked at
exactly the moment they are most heavily mutation-tested.

Filed as `SURFACE-2026-09-13-GIT-CHECKOUT-SILENTLY-NO-OPS-ON-AN-UNTRACKED-FILE` (high) for a fold
into `docs/lessons/source-text-guards.md` as a mutation-testing precondition — **folded 2026-09-23**
(a pointer bullet in its mutation-proving list) and the backlog entry deleted; this memory is the detail.
