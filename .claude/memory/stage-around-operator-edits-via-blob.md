---
name: stage-around-operator-edits-via-blob
description: When the operator's unstaged edit shares a diff hunk with yours, hunk-filtered `git apply --cached` can't split them; stage the exact index content as a blob via `git update-index --cacheinfo`.
metadata:
  type: project
---

The operator routinely leaves their own edits UNSTAGED in files a WP also touches (a `CLAUDE.md` hunk, a `wbs.md` insert, a `backlog.md` entry), and a ship/close commit must carry only the WP's changes.

- **Separate hunks:** filter the `git diff -U0 <file>` output down to your hunks and `git apply --cached --unidiff-zero` it.
- **Same or adjacent hunk** (e.g. two new backlog entries inserted next to each other at the top of `backlog.md`): no patch filter can split them. Build the exact content the index should hold, then stage that blob directly:
  - from the working copy minus the operator's block, or from `git show HEAD:<path>` plus your edits;
  - `git update-index --cacheinfo 100644,$(git hash-object -w <tmpfile>),<path>`.
- **Verify** afterwards: `git diff <path>` (working copy vs index) must show ONLY the operator's block, and `git diff --cached <path>` only yours.

**Why:** used three times at paydown WP14's close (2026-11-07): `backlog.md`, then `wbs.md` (the operator's WP9 insert), with `CLAUDE.md` done by the hunk filter. The operator's edits survived byte-for-byte.

**How to apply:** any commit made while `git status` shows operator edits in a file you also changed. Related: [[git-checkout-no-ops-on-untracked-file]] (never use `git checkout` to restore around dirty operator work).
