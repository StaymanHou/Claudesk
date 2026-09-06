---
name: bsd-sed-lacks-word-boundary
description: BSD sed on macOS does not support `\b`, so `sed "s/\bword\b/X/"` silently matches NOTHING and exits 0 — in a mutation probe that reads as "every mutant survived," i.e. a guard hole that isn't there. Use `perl -pi -e`.
metadata:
  type: reference
---

macOS ships **BSD `sed`**, which has no `\b` word-boundary escape (that is a GNU extension).
`sed -i '' "s/\bword\b/X/g" file` does not error — it **matches nothing and exits 0**, leaving the
file untouched.

⚠️ **Why this is worse than an ordinary portability nit: it inverts the result of a mutation probe.**
The probe's logic is *"break the thing the guard names, then confirm the guard fails."* A `sed` that
silently no-ops means the file is unchanged, so the guard **passes** — and a passing guard under
mutation reads as **"the guard is a hole"**. Hit here running three probes at once: all three reported
"survived," suggesting a broken guard that was in fact sound. The natural next move — weakening or
rewriting a correct guard — is the damage.

**The tell is in the probe's own output, and only if you print it.** The landed-check said
`hits now: 1` where `0` was required. That single line separates "the guard is a hole" from "my
mutation never happened" — the two are otherwise indistinguishable
([[invalid-probe-and-real-hole-look-identical]], [[verify-the-mutation-landed]]).

**Fix — use `perl`, which has real word boundaries:**

```bash
perl -pi -e 's/\bword\b/X/g' file          # substitution
perl -ni -e 'print unless /^\| `mode` \|/' file   # line deletion
```

**Always assert the mutation landed before believing a pass**, whichever tool you use:

```bash
perl -pi -e 's/\bword\b/QQQ/g' "$F"
echo "landed? hits now: $(grep -c 'word' "$F")"   # must be 0
```

⚠️ A **rename**-style mutation (`Foo` → `FooX`) is also a weak probe for a different reason: it tests
word-boundary matching but is structurally blind to **anchoring**, so it cannot detect a guard whose
substring is not unique to its site ([[raw-guard-substring-must-be-unique-to-its-site]]). To test
anchoring, **delete** the substring rather than renaming it.
