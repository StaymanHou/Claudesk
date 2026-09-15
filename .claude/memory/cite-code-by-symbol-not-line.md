---
name: cite-code-by-symbol-not-line
description: "A `file.ts:NNN` citation in prose drifts silently as the file grows and gets COPIED into new docs before anyone rechecks it; cite the symbol instead."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 2fc4d93a-8cf8-4d23-96fa-a0171c16df0d
  modified: 2026-09-15T13:13:30.298Z
---

A `path/file.rs:451`-style citation in a doc is a **silently decaying pointer**. Nothing
recomputes it, no test covers it, and it keeps looking authoritative after it stops pointing
anywhere. `status_broadcaster/mod.rs:451` (`event_is_turn_start`) had drifted to `:502`.

⚠️ **The propagation is the real damage, not the drift.** I read the stale number out of
`wbs.md` and wrote it into **two brand-new docs** before checking it — so one rotted citation
became three, two of them freshly authored and therefore looking newly verified. A wrong
citation in a doc that *outranks* the code (here `CLAUDE.md` declares the `arch/` set the
authority) is live spec pointing at nothing.

**Why:** the symbol name is stable under every edit that moves the line; the line number is
invalidated by any insertion above it. Same failure family as
[[raw-guard-substring-must-be-unique-to-its-site]] and
[[rustdoc-link-to-a-nonexistent-test-fails-no-gate]] — a reference that reads as evidence while
verifying nothing.

**How to apply:**
- In prose/docs, cite `module::fn_name` or `` `fnName` in path/file.ts `` — **not** `file.ts:NNN`.
  A reader greps the symbol and lands right; a line number sends them to whatever moved there.
- When a line number is genuinely wanted (a specific assertion inside a long test), keep it but
  **verify it at write time** with `sed -n '<N>p' <file>` — and expect to re-verify on any later
  edit to that doc.
- ⚠️ **Never copy a `file:line` citation from another doc without re-resolving it.** Inheriting
  it is what turns one stale pointer into several.
- When correcting one, prefer leaving the original in the *source* record with a staleness marker
  (`:451` — ⚠️ now `:502`) rather than silently rewriting history, and switch the *new* docs to
  the symbol form.
