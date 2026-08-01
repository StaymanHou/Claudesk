---
name: raw-guard-jsx-prose-needs-flattened-haystack
description: A ?raw guard asserting on user-visible PROSE inside JSX must flatten whitespace first (src.replace(/\s+/g," ")) — copy is inherently multi-word so CLAUDE.md's "assert single identifiers" rule can't apply; but the emptiness meta-guard must keep reading the RAW import, since flat("")==="".
metadata:
  type: project
---

`CLAUDE.md` (Development Conventions → Tests) already says: *"If a `?raw` guard is unavoidable,
assert single identifiers — never formatted multi-line expressions."* That rule is right, but it has
**no answer for guarding user-visible copy**, because copy is inherently multi-word — read
literally it says "don't guard copy at all." This is the missing half.

**The problem.** Prose inside JSX wraps at Prettier's print width (default 80 — `.prettierrc.json`
sets only `trailingComma`). So a `toContain("local database on this Mac")` against a `?raw` import
passes **only because the phrase happens to land whole on one line**. In M11.5 WP3 the two exposed
lines sat at **74 and 77 chars** — 3 and 6 characters of headroom.

**The fix — flatten the haystack, not the needle:**

```ts
import settingsPanelRaw from "../SettingsPanel.tsx?raw";
const flat = (src: string) => src.replace(/\s+/g, " ");
const settingsPanel = flat(settingsPanelRaw);
// now width-independent:
expect(settingsPanel).toContain("local database on this Mac");
```

**⚠️ The trap inside the fix: the emptiness / meta guard MUST keep reading the RAW import.**
`flat("") === ""`, so asserting `flat(src).length > 1000` passes straight through the very
empty-loader failure that arm exists to catch (the failure mode recorded in
[[vitest-raw-import-css-returns-processed-not-text]]). Keep both bindings and use each deliberately:
claim assertions read the flattened copy, existence/length assertions read the raw.

**Why the direction of failure matters.** Pre-fix, a *pure reflow* — identical words, wrap point
moved — made the guard **FAIL** while every claim was still true. A false alarm on correct copy is
worse than it looks: it trains the next reader to loosen the guard. The same mechanism yields silent
false **negatives** whenever a phrase reassembles onto one line.

**How to prove the fix (isolate ONE variable).** My first attempt reworded the copy and saw a
failure — but the rewording also changed `"nothing is uploaded"` → `"nothing is ever uploaded"`, so
a claim genuinely disappeared. Two variables, proving nothing. The valid experiment moves **only the
line break**: same words, different wrap point → must PASS. Then delete a claim → must FAIL. Both
directions, or you have not tested it. (Related discipline: [[verify-the-mutation-landed]] and
[[prove-mechanical-transform-by-rerunning-it]].)

Shipped example: `src/components/settings/__tests__/settingsTimeTrackingCopy.test.ts` +
`settingsTimeTrackingCopyPromise.test.ts` (M11.5 WP3, commit `17cf4a9`).
