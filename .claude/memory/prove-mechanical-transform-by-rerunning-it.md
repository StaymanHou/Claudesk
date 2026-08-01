---
name: prove-mechanical-transform-by-rerunning-it
description: To prove a formatter sweep / codemod changed nothing semantic, re-run the transform on the pre-change input and diff against the result — do NOT try to normalize the output (three textual normalizations each false-alarmed first).
metadata:
  type: project
---

To prove a **mechanical code transform** (formatter sweep, codemod, bulk rename) changed nothing semantic, **re-run the transform on the pre-change input and compare it to what you committed**:

```bash
for f in $(git diff --name-only); do
  git show "HEAD:$f" | ./node_modules/.bin/prettier --stdin-filepath "$f" | diff -q - "$f" \
    || echo "NOT pure-transform: $f"
done
```

Equality for every touched file proves the diff is exactly `transform(before)` — no hand edits, no content change, no reordering. Verified 35/35 on commit `64e212f` (the 2026-08-01 `format:check` sweep).

**The anti-pattern: trying to normalize the OUTPUT instead.** Three progressively-cleverer textual checks each produced a **false alarm**, in this order:

1. **`git diff -w`** — still reports changes. `-w` ignores whitespace *amount*, not *added line breaks*, which is the main thing a formatter does.
2. **Strip all whitespace, then compare** — flagged **34 of 35** files. Prettier legitimately **adds tokens**: trailing commas, under this repo's `trailingComma: "all"`. A whitespace-only normalizer cannot model that.
3. **Also strip parens** (to absorb the grouping parens Prettier adds around wrapped expressions) — broke **JSX `{…}` interpolation boundaries**, so files that were genuinely identical now differed.

Each attempt required understanding one more incidental thing the formatter does. Re-running the transform requires understanding **none** of them, because the tool is its own specification.

**The general rule:** when the question is *"is this diff purely the output of tool T?"*, the cheap correct answer is to run T again — not to hand-write a normalizer that approximates T's incidental behaviors. A normalizer is a second, unverified implementation of the tool's formatting rules; every gap in it is a false positive or (worse) a false negative.

**Where this matters here:** any repo-wide `prettier --write`, a `cargo fmt` sweep, an ESLint `--fix` pass, or a codemod. The check is also what makes a large formatting commit reviewable — "35 files, all byte-exact `prettier(HEAD:file)`" is a stronger and faster claim than spot-reading three of them, which was the plan's original (weak) step.

Related: [[pnpm-exec-shadows-local-binaries]] (use `./node_modules/.bin/prettier`, and note the `pnpm run <script>` carve-out documented there).
