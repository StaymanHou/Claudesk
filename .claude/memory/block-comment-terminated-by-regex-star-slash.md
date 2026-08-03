---
name: block-comment-terminated-by-regex-star-slash
description: A block comment documenting a regex that contains `*` immediately followed by `/` (e.g. `^\s*//`) terminates EARLY — tsc then reports TS1005/TS1161 on prose lines, so the error points at the comment's wording rather than the real cause.
metadata:
  type: reference
---

A `/** … */` or `/* … */` comment whose text contains a `*` immediately followed by a `/`
**ends at that point**, because the sequence *is* the comment terminator. The rest of the
prose is then parsed as code.

This bites when documenting a regex, which is exactly what this repo's guard headers do.
The trigger that hit M12 WP1: a JSDoc explaining that an earlier pattern had been
`^\s*//` — the `*` of `\s*` followed by the `/` of `//` closes the comment.

**How it presents (and why it wastes time):** `tsc` emits several errors — 5 in the real
case — whose line/column numbers land on *prose*, e.g. `TS1005: ';' expected` and
`TS1161: Unterminated regular expression literal` pointing at an English sentence. Vitest
surfaces the same thing through esbuild as `SyntaxError: ';' expected` with a code frame
around the comment body and an `Unexpected "if"` where a word like "if" appears mid-sentence.
Nothing points at the `*/` that actually closed the block, so the natural read is "my
sentence broke the parser," which is true but unhelpfully framed.

**Confirm it in seconds rather than guessing** — a 5-line fixture is decisive:

```ts
// /tmp/t.ts
/**
 * anchored on `^\s*//`, which counted x
 */
function f(): void {}
```

`tsc --noEmit /tmp/t.ts` → `TS1161`. Remove the `*`-then-`/` sequence → clean. That
bisect is what identified the cause; static reading of the comment had not.

**Avoiding it:** describe the pattern in words instead of pasting it
("anchored the pattern at start-of-line"), or break the sequence. A `//`-style line comment
has no terminator and is immune, so multi-line `//` headers — which this repo already
prefers for file-level context — cannot hit this at all. Only `/* */` bodies are exposed.

Related: [[raw-guard-identifier-satisfied-by-own-comments]] and
[[extract-for-import-when-a-raw-guard-cant-express-the-property]] — both concern the same
family of guard-header work where regexes get documented next to the code they match.
