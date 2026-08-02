---
name: extract-for-import-when-a-raw-guard-cant-express-the-property
description: When a ?raw guard for a BEHAVIORAL property is found vacuous, extract the code into an importable module so a test drives the real thing — do not write a better predicate. Two successive rewrites both passed while the same bug stayed open. Third distinct guard-failure mode; the only one whose remedy is structural.
metadata:
  type: project
---

Two sibling memories cover guard failures where the *predicate* is at fault:
[[verify-the-mutation-landed]] (the mutation never reached executable code) and
[[guard-predicate-completeness-vs-mutation-landing]] (the predicate cannot see the vector
class). **This is a third, and the remedy is different: the predicate is correct and complete,
and still cannot express the property, because the property is behavioral and `?raw` reads
source text.** When you hit this one, rewriting the predicate is wasted work.

## The instance (M11 WP3, 2026-08-02)

The invariant: *no click inside rendered doc content may ever perform its default action*
(Claudesk's window has no back button, so a navigated-away webview is unrecoverable). It was
guarded twice, and **both guards passed while the same hole was open**:

1. **Source-order guard** — compared `indexOf("e.preventDefault()")` against
   `indexOf('if (kind === "external")')`. Blind to an `if (kind === "empty") return;` sitting
   *between* them. Markdown `[click]()` renders a live `<a href="">` (measured — it survives
   the sanitizer), which took that early return with the event still cancelable.
2. **`return`-counting guard** (written as the fix for #1) — asserted exactly one `return`
   above `preventDefault()`. Also a proxy: **folding the empty-href bail into the anchor
   guard** (`if (!(anchor instanceof HTMLAnchorElement) || (anchor.getAttribute("href") ?? "") === "") return;`)
   keeps the count at 1, reopens the identical hole, and **passes the full 1645-test suite**.

The shared cause: *a source-text predicate can only encode the shapes you thought of.* Each
rewrite closed the shape that had just bitten and left the next one open.

## The fix — extract so the test imports the real code

Move the logic into its own module (here: a factory over its dependencies,
`makeDocLinkClickHandler(deps)`), then have the test **import and drive it** with real DOM
events. The mutation that had passed 1645/1645 then fails. Delete the source-order guard
rather than patching it again — that shape had already failed twice for one structural reason.

⚠️ **A behavioral test that RE-IMPLEMENTS the code under test does not count.** The first
version of the behavioral test copied the handler's guard order into the test file, so
mutating the real component left it green — the two guards shared a blind spot instead of
covering complementary halves. The code reviewer's phrasing is the one to remember:
**probe the component, not the replica.**

## What a `?raw` guard may still honestly claim

Keep the structural arm for what a source read *can* see — that the component routes through
the extracted seam, and that the logic is not duplicated back inline. Pair it with the
behavioral test; neither is sufficient alone. Note the extraction is what makes the pairing
possible, so the seam is the fix and the tests are the consequence.

**No component-render harness is needed for this** (`SURFACE-2026-07-31-NO-REACT-COMPONENT-RENDER-HARNESS`
is still open) — a factory over deps plus `@vitest-environment jsdom` is enough, because the
unit under test is a function, not a rendered tree.
