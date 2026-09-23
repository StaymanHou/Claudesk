---
name: prove-comments-only-diff-via-parser-tokens
description: To prove a TS/JS diff touches comments only, diff TypeScript-parser leaf tokens HEAD vs working copy — but FILTER JSDoc node kinds first, or every edited /** */ block false-alarms as a code change. Pair with a positive control.
metadata:
  type: project
---

When a change is claimed to be **comments only** (a doc-narrowing pass, a comment move), prove it mechanically. Parse the `HEAD` blob (`git show HEAD:<f>`) and the working copy with `ts.createSourceFile(…, setParentNodes=true, ScriptKind.TSX/TS/JS)`, walk `node.getChildren(sf)` down to the leaves, collect `getText(sf)` for each leaf (trivia, meaning `//` and `/* */`, is excluded), and diff the two token arrays.

⚠️ **The trap: `getChildren()` returns JSDoc nodes as AST CHILDREN.** An unfiltered walk therefore reports every edited `/** … */` block as a changed token. That false alarm is indistinguishable from a real code change. Skip any node with `kind >= ts.SyntaxKind.FirstJSDocNode && kind <= ts.SyntaxKind.LastJSDocNode` before recursing. Hit at paydown WP4 (2026-09-23): the first run flagged 6 files whose only edits were JSDoc.

**Always run a positive control.** Inject one real code change into a changed file (e.g. a string literal `""`→`"x"`, landed via `perl -pi -e` and confirmed with `grep -c`), confirm the diff reports it, then restore from a `cp` backup and verify with `shasum`. Never use `git checkout` for this (`[[git-checkout-no-ops-on-untracked-file]]`).

**Expected residue is not a failure.** Legitimate string edits (a message, a test name) show up as diffs; enumerate them in the plan BEFORE running, and treat anything else as a finding. A Prettier reflow can add an inert trailing comma, which is visible and acceptable.

- Rust has no equivalent here. `git diff -U0 <f> | grep -E '^[+-]' | grep -vE '^(\+\+\+|---|[+-]\s*//)'` printing nothing is the check.
- Sibling for formatter sweeps: `[[prove-mechanical-transform-by-rerunning-it]]`, which re-runs the transform instead of writing a normalizer. This memory is the case where there IS no transform to re-run.
- `typescript` lives at `node_modules/typescript`; `require(process.cwd() + "/node_modules/typescript")` from a scratchpad `.cjs` works without installing anything (`[[node-strip-types-fails-on-extensionless-runtime-imports]]` is why not `.ts`).
