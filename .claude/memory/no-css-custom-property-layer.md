---
name: no-css-custom-property-layer
description: Claudesk has NO CSS design-token layer — App.css declares one `--` property in ~3000 lines, so `var(--token)` written by analogy resolves to nothing and ships an unstyled element no test can see.
metadata:
  type: project
---

⚠️ **This project styles with LITERAL HEX. There is no design-token layer.** `src/App.css`
declares exactly **one** custom property in ~3000 lines (`--diff-commits-h`, a measured sticky
offset — not a color). Writing `var(--bg-elevated)` / `var(--accent)` / `var(--border)` by analogy
with other codebases produces rules that **silently resolve to nothing**.

⚠️ **The seven existing `var()` uses are NOT a counterexample** — every one carries a hex fallback
(`var(--bg, #1e1e1e)`, `var(--mono, ui-monospace, …)`), which is the only reason they work. Do not
read them as evidence of a token layer.

**The failure mode is invisible to every gate here:** an undefined custom property is not a lint
error, not a `tsc` error, and not a test failure — the element simply renders unstyled. Hit at F-a
WP4 (2026-09-22) writing the Prompt panel's send-button row; caught only by grepping for `--` in
`App.css` before committing.

**What to do instead:** copy the hex from the nearest sibling control. `.panel-tab` is the
canonical reference for panel chrome — `#1a1a1a` background, `#3c3c3c` border, `#9b9b9b` idle
text, `#d4d4d4` hover/active text, `#6ea8ff` accent. ⚠️ Claudesk is **dark-only** (CLAUDE.md), so
never add a `prefers-color-scheme: light` block alongside.

Related: [[claudesk-philosophy]].
