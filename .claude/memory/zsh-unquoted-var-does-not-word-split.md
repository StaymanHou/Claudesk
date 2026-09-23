---
name: zsh-unquoted-var-does-not-word-split
description: The Bash tool's shell here is zsh, which does NOT word-split an unquoted `$var` — `for f in $files` iterates ONCE over the whole newline-joined list, so a bulk rename or mutation loop silently does nothing. Pipe to `xargs` (or `${(f)var}`) and grep-confirm the edit landed.
metadata:
  type: feedback
---

The Bash tool runs commands under the user's **zsh**, not bash. zsh does not word-split an
unquoted parameter expansion, so a list captured into a variable stays ONE word:

```sh
files=$(grep -rl "picker-time-tracking" src)
for f in $files; do perl -pi -e 's/.../.../' $f; done   # ✗ runs once; perl gets the whole list
```

`perl` then reports `Can't open src/a.ts\nsrc/b.ts…: No such file or directory` for the
joined string, **mixed into ordinary output**, and not one file changes. Nothing fails loudly,
and the next command reads the untouched tree as though the edit happened.

**The instance (paydown WP5, 2026-09-23).** The `picker-*` → `settings-*` testid rename loop
changed zero files. It was caught only because the plan's post-rename check grepped
for leftover old ids and found all of them.

**Why it matters here specifically:** this repo's verification discipline is mutation-first. A
mutant applied through such a loop is a **silent no-op**, and a no-op mutant reads exactly like
"the guard held" — the same false conclusion as [[bsd-sed-lacks-word-boundary]] and
[[verify-the-mutation-landed]].

**How to apply:**
- Feed file lists through a pipe: `grep -rl PAT src | xargs perl -pi -e '…'`. If you need a
  variable, use zsh's `${(f)files}` (split on newlines). Don't count on `$(...)` splitting
  inside a `for` either, because the same rule applies to a variable holding its result.
- **Always grep-confirm that the edit landed** (`grep -c` the new form, and grep that the old
  form is gone) before trusting any result that follows a bulk edit.

Related: [[bash-cargo-env]] (a different consequence of the Bash-tool shell not being your
interactive shell), [[verify-the-mutation-landed]], [[bsd-sed-lacks-word-boundary]].
