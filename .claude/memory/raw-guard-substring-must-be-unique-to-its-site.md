---
name: raw-guard-substring-must-be-unique-to-its-site
description: A `?raw` guard must anchor on a substring UNIQUE to the site it is about — `rows: term.rows` also occurs in an unrelated resize path, so hardcoding the nav call's value left the assertion green.
metadata:
  type: project
---

`turnNavWiring.test.ts` asserted that turn-nav geometry is read at call time with two loose
substrings:

```ts
expect(code).toMatch(/length: term\.buffer\.active\.length/);
expect(code).toMatch(/rows: term\.rows/);          // ⚠️ NOT unique
```

**`rows: term.rows` appears TWICE in `XtermPane.tsx`** — at the `scrollTargetFor` nav call site
*and* in the unrelated `cc_resize`/fit path. So mutating the **nav** call to a literal
(`rows: 24`) left that assertion **GREEN**. The mutant was caught only by luck: the sibling
`length:` substring happens to be unique to the nav site.

**Fix — anchor to the SITE, not to a substring that occurs there:**

```ts
expect(code).toMatch(
  /scrollTargetFor\([\s\S]{0,200}?\{\s*length: term\.buffer\.active\.length,\s*rows: term\.rows,?\s*\}/,
);
```

Then mutate **each half independently** and confirm both now fail.

⚠️ **This is a distinct failure form from the ones already catalogued** — it is not the guard
being satisfied by its own comments ([[raw-guard-identifier-satisfied-by-own-comments]]) nor an
incomplete predicate ([[guard-predicate-completeness-vs-mutation-landing]]). The predicate was
complete and the comments were stripped; the *string it leaned on was not unique to the site*.
Filed as a new form in `docs/lessons/source-text-guards.md`.

**The mechanical check, before leaning on any substring in a `?raw` guard:**
`grep -c '<substring>' <file>` — if it is not **1**, anchor to the enclosing call/site instead.

⚠️ **Found only because arms were probed INDIVIDUALLY.** A composite mutant would have tripped
one of the other six assertions and reported "the guard bites" while this half checked nothing.
A sibling instance in the same session: an assertion matching a **call shape**
(`onTurnStartRecorded?.(navState(`) passed while the argument was swapped for a literal — the
rule there is the same one level in: *a source-text predicate must name the value that can be
WRONG, not the function that can be MISSING.*
