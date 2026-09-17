---
name: source-guard-blind-to-spread-bindings
description: A source-text guard that extracts bindings by regex over LITERAL syntax cannot see anything composed or spread in, so it passes while giving those entries ZERO coverage — resolve the spread (import it, enumerate it) rather than widening the regex.
metadata:
  type: feedback
---

A guard that harvests bindings with a regex over **literal** syntax is blind to every binding
that arrives **composed** — spread in, generated, or merged from another module. The guard still
passes, so the gap is invisible: the missing entries are simply never candidates.

**The instance (M14 WP3, 2026-09-17).** `chordRegistry.test.ts`'s CM6 arm extracts
`/key:\s*"(Mod-[^"]+)"/g` from `editorExtensions.ts` and asserts each captured binding has a
registry row. It captured **8** bindings — and `Mod-f` was not among them, because `⌘F` arrives
via `...searchKeymap` at `editorExtensions.ts:180`, not as a literal entry. So `cm6-find` had
**ZERO guard coverage in either direction**: the call-shape arm cannot reach it (CM6 entries are
`matcher: null`, bound declaratively) and the keymap arm cannot see it (spread, not literal).
⚠️ It was the single entry the feature's own user-facing hint names as the reason the editor
section exists at all.

**The fix must RESOLVE the spread, not widen the pattern.** Import `searchKeymap` in the test and
enumerate its `key` values, or assert against the composed keymap array. ⚠️ A regex that also
matches `...searchKeymap` textually would prove **the spread is present**, not **which bindings it
contributes** — a guard that looks fixed and is not.

**The generalization:** before trusting a literal-syntax extractor, ask *how else can a member of
this set get here?* Spreads, `Object.assign`, array `concat`, decorators, and codegen all produce
members no literal-syntax regex will ever see. Count what the extractor captured and compare it to
what you believe exists — 8 captured against a set you know has 9 is the tell.

Related: [[raw-guard-substring-must-be-unique-to-its-site]],
[[extract-for-import-when-a-raw-guard-cant-express-the-property]],
[[guard-predicate-completeness-vs-mutation-landing]], [[verify-the-mutation-landed]].
