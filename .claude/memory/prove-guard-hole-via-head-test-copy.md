---
name: prove-guard-hole-via-head-test-copy
description: To prove the OLD guard really passed a mutant ("hole confirmed"), run HEAD's version of the test file as a throwaway `zz*.test.ts` copy BESIDE the real one, in the same vitest run, against the mutated source — no `git checkout`, no stash. ⚠️ Population/allowlist guards see the copy itself as a new importer and fail for THAT reason; discount those failures and delete the copy after.
metadata:
  type: project
---

When a fix rewrites a guard, the closure claim "the old guard was blind to this mutant" needs the OLD test to run against the mutated source. Paydown 2026-09-23 WP6 did this three times (G2, RecentProject ×2) with:

```sh
git show HEAD:src/<dir>/__tests__/foo.test.ts > src/<dir>/__tests__/zzHeadFoo.test.ts
# apply the mutant to the SOURCE (cp backup → perl → confirm landed), then run BOTH files:
./node_modules/.bin/vitest run src/<dir>/__tests__/zzHeadFoo.test.ts src/<dir>/__tests__/foo.test.ts
# restore the source (cp + shasum), then:
rm src/<dir>/__tests__/zzHeadFoo.test.ts
```

The copy must sit in the SAME directory, so its relative imports and `__dirname` paths resolve exactly as the original's do. One run then gives both verdicts side by side: the HEAD copy passes (hole confirmed) and the new file fails (hole closed).

**Why:** `git checkout`/`stash` of a test file is the wrong tool mid-mutation. It silently no-ops on untracked files and destroys uncommitted work on dirty ones ([[git-checkout-no-ops-on-untracked-file]]). A worktree ([[prove-render-unchanged-via-head-worktree]]) works but is heavy for a single test file.

**How to apply:**
- ⚠️ **The copy is a real file under `src/`**, so any guard that enumerates `src/` sees it. The `workflowMachine` importer-population pin (`workflowMachineFunnel.test.ts`) fails because the copy is a new `workflowMachine/` importer. The same would happen with any allowlist, "every X has a caller", or file-count guard. That failure belongs to the probe, not the code. Confirm it disappears once the copy is deleted before discounting it.
- For a Rust module, use a whole-file swap instead (`cp` the new file aside → `git show HEAD:<file> > <file>` → apply mutant → test → `cp` back → `shasum`). There is no sibling-copy equivalent, because a module is compiled once.
- Finish by checking that `find src tooling -name 'zz*'` prints nothing. A forgotten copy is a permanent second test file that also pins the OLD behavior.
