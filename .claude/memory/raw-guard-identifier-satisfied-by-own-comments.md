---
name: raw-guard-identifier-satisfied-by-own-comments
description: A ?raw guard asserting a bare identifier is satisfied by the module's OWN COMMENTS, so it passes exactly when the code it names has been deleted — strip comments first and assert the CALL shape, not the identifier. Corrects CLAUDE.md's "assert single identifiers" rule, which points straight at this hole.
metadata:
  type: feedback
---

`CLAUDE.md` (Development Conventions → Tests) says: *"If a `?raw` guard is unavoidable, assert
single identifiers — never formatted multi-line expressions."* That rule is right about its own
failure mode (Prettier reflow breaking a multi-line match) but **it points directly at a second
hole it does not name**: a single identifier is exactly the thing a module's own prose satisfies.

**The failure.** `expect(hostSource).toContain("reconcilePanel")` in
`src/components/workspace/__tests__/terminalSlotGuard.test.ts` was written to pin that
`RightPanelHost` actually *calls* `reconcilePanel`. Deleting the real call site
(`const panel = reconcilePanel(storedPanel, gate)` → `const panel = storedPanel;`, defeating the
gate reconciliation entirely) left the test **green** — because two comment mentions of
`reconcilePanel` survived in the same file. The guard passed *precisely* in the state it existed
to catch. Only `eslint`'s unused-import rule caught it, and only incidentally: dropping the import
too made every gate green.

**The fix, both halves:**

1. **Strip comments before matching.** `offInvariantGuard.test.ts` already had a `stripComments`
   helper for exactly this reason. Copy it (it is file-local, not exported):
   ```js
   const strip = (s) => s
     .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
     .replace(/\/\*[\s\S]*?\*\//g, "")
     .replace(/^\s*\/\/.*$/gm, "");
   ```
2. **Assert the CALL, not the name.** `toContain("reconcilePanel(")` cannot be satisfied by prose,
   and `toMatch(/const\s+panel\s*=\s*reconcilePanel\(/)` additionally pins the shape. An import
   line (`reconcilePanel,`) does not match either — which is the point.

**⚠️ The transferable part is not the fix, it is that the lesson did not transfer.** In one session
(M11 WP2, 2026-08-01) this same vacuity class was fixed **three times in three different files**,
and twice the *next* guard I wrote had the identical hole — including one written minutes after
fixing it elsewhere. Assume any new `?raw` guard has it until a mutation says otherwise:
delete the thing it names and confirm it goes red. See [[verify-the-mutation-landed]] for the
sibling failure (mutation that never reaches executable code) and
[[guard-predicate-completeness-vs-mutation-landing]] for the one where the mutation lands but the
predicate cannot see the vector class. [[raw-guard-jsx-prose-needs-flattened-haystack]] covers the
inverse case — guarding user-visible copy, where multi-word matching is unavoidable.

**Corollary for structure-vs-runtime.** Both of this session's BLOCKING findings were `?raw` guards
that asserted *presence* where the property was *placement*: the other one checked that a
`panel-tab-docs` tab existed, which passed just as well when the tab rendered **ungated** — a dead
affordance while the feature gate is off. If the property is "X is inside Y," locate X and scan
backward for Y; do not assert that X and Y both appear in the file.
