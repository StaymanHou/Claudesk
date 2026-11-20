---
name: python-heredoc-eats-backslash-newline-in-written-code
description: Writing code through a non-raw Python string, a `\` at line end is Python's line continuation; a Rust string's `\` continuation never reaches Rust, leaving space runs.
metadata:
  type: project
---

When an edit is scripted through Python (`python3 - <<'EOF' … EOF` with `s.replace(old, new)` on `'''…'''` strings), a `\` at the end of a line inside a NON-raw Python string literal is a Python line continuation: Python drops the backslash AND the newline. So a Rust string written as

```
"Install is offered only … Claudesk last read \
             this one as {}."
```

reaches the Rust file as ONE line with the next line's indentation inside it: `last read              this one`. `cargo build`, clippy and the tests all pass. In a React `<p>` HTML collapses the spaces, so the UI looks right too; a `<pre>`, a log or an exact-match test shows the gap.

**Why:** M18 WP6 (2026-11-20) shipped four user-facing messages in `workflow_install/commands.rs` with 6–14-space runs this way; the code-quality review caught it (`SURFACE-2026-11-20-QUALITY-REMOTE-INSTALL-STRINGS-CARRY-SPACE-RUNS`). The same trap applies to any code with `\`-newline: shell continuations, Rust/C macros, Markdown hard breaks.

**How to apply:** for code that contains `\` at line end, use the Edit tool, or a raw Python string (`r'''…'''`), or double it (`\\` + newline) deliberately. After a scripted edit to Rust strings, `grep -nE '"[^"]* {4,}[^"]*"'` the file for space runs. Related: [[bsd-sed-lacks-word-boundary]] (another scripted-edit trap).
