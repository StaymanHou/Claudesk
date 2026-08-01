---
name: widened-selector-must-be-strict-superset
description: When widening a guard/lint/codemod's file-selection predicate, compute the OLD and NEW candidate sets and diff them — "does it catch the new target?" passes while the change silently drops a module that was previously in scope.
metadata:
  type: project
---

**The check that feels sufficient is not.** When a guard misses a file and you widen its selector, the
obvious verification is *"does it catch the missed file now?"* — which passes just as happily when the
new predicate has **also dropped** something the old one caught. Reach is a **set**, so verify it as
one: compute both sets, diff, assert **strict superset**.

**The real instance (M11.5 WP4, `offInvariantGuard.test.ts`).** The chord arm selected candidates by
basename (`/hord[A-Za-z]*\.tsx?$/i`) and provably missed `components/workspace/panelHost.ts`. The
intuitive content-based replacement — *"select modules that read a chord-shaped keyboard event"*, i.e.
match on `metaKey` — would have:

- **added** `panelHost.ts` ✅ (the whole point of the fix), and
- **silently dropped** `closeTerminalChord.ts` ❌ — whose export takes three **pre-computed booleans**
  (`{isCloseChord, terminalFocused, canClose}`) and never touches a keyboard event. It is the *only*
  chord module with no `metaKey`.

Net: reach widened on one module, narrowed on another — **a loss wearing the shape of a fix**, and
every "is panelHost.ts covered now?" check would have gone green. Caught by a plan-time audit that
enumerated both sets, before any code was written.

**What shipped instead:** match on the **exported identifier** (`export (function|const|interface|type)
… *Chord*`) — verified a strict superset, 12 → 15, nothing dropped.

```bash
# The check worth running on ANY selector widening — old set vs new set, not spot-checks
comm -23 <(list_with_OLD_predicate | sort) <(list_with_NEW_predicate | sort)   # must be EMPTY
```

**Generalizes to** any file-selecting predicate in this repo: lint scopes, codemod targets, test-glob
filters, `sourceFiles().filter(...)` arms. Whenever the selector's *shape* changes (not just its
threshold), the dropped-set is the invisible half.

**Two traps found alongside it, worth expecting:**
- **Widening pulls in modules with new false-positive surface.** `paletteCommands.ts` entered the set
  carrying a stale `workflow/archive/…` path in a **comment**, so comment-stripping had to ship in the
  *same* change — the selector edit alone turns the guard red on prose.
- **"Selecting by content" can still be name-matching.** The shipped predicate matches *exported
  identifier names*, so it trades one naming-convention dependency for another rather than removing
  it. Real content/behavior selection is a different thing; don't let the label oversell the mechanism.

Related: [[verify-the-mutation-landed]] (prove the guard bites after widening — a reach fix is not a
bite proof), [[raw-guard-jsx-prose-needs-flattened-haystack]] (the same file's other failure mode).
