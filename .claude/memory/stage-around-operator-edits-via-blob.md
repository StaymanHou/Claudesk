---
name: stage-around-operator-edits-via-blob
description: Stage only your changes around an operator's unstaged edits by writing the exact index content as a blob (`git update-index --cacheinfo`); a hunk-filtered `git apply --cached --unidiff-zero` can misplace lines.
metadata:
  type: project
---

The operator routinely leaves their own edits UNSTAGED in files a WP also touches (a `CLAUDE.md` hunk, a `wbs.md` insert, a `backlog.md` entry), and a ship/close commit must carry only the WP's changes.

- ⚠️ **Default to the blob method below, even for separate hunks.** The hunk-filter route (`git diff -U0 <file>` filtered to your hunks, then `git apply --cached --unidiff-zero`) **misplaced a pure one-line insertion by one line** in `MEMORY.md` (2026-11-14, M17 WP1 ship) when an excluded operator hunk shared the file: the zero-context patch has no anchor, so its line number lands wrong. If you do use it, check the placement with `git show :<path>` around the hunk, not just `git diff --cached`.
- **Same or adjacent hunk** (e.g. two new backlog entries inserted next to each other at the top of `backlog.md`): no patch filter can split them. Build the exact content the index should hold, then stage that blob directly:
  - from the working copy minus the operator's block, or from `git show HEAD:<path>` plus your edits;
  - `git update-index --cacheinfo 100644,$(git hash-object -w <tmpfile>),<path>`.
- **Verify** afterwards: `git diff <path>` (working copy vs index) must show ONLY the operator's block, and `git diff --cached <path>` only yours.

**Why:** used three times at paydown WP14's close (2026-11-07): `backlog.md`, then `wbs.md` (the operator's WP9 insert), with `CLAUDE.md` done by the hunk filter. The operator's edits survived byte-for-byte.

**How to apply:** any commit made while `git status` shows operator edits in a file you also changed. Related: [[git-checkout-no-ops-on-untracked-file]] (never use `git checkout` to restore around dirty operator work).
