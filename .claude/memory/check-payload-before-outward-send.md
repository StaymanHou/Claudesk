---
name: check-payload-before-outward-send
description: Before any outward-facing send from a file (gh issue/pr create --body-file, gh issue edit), assert the payload is non-empty and print its head in the same step; a failed extraction stage leaves an empty file and the send publishes it.
metadata:
  type: feedback
---

Before an outward-facing send that reads its content from a file (`gh issue create --body-file`,
`gh pr create --body-file`, `gh issue edit --body-file`, an API POST from a file), check **in the
same command** that the payload is non-empty and print its head. For example:
`test -s "$B" && head -5 "$B" && gh issue create … --body-file "$B"`.

**Why:** on 2026-10-26 (M16.5 WP4) the body was extracted with
`awk … | sed '1{/^$/d}' > body.md`. BSD `sed` rejected that script ("extra characters at the end of
d command"). The error went by unnoticed, so the redirect had already created an EMPTY file, and a
later `gh issue create --body-file body.md` filed anthropics/claude-code#105187 with no body. It was
fixed within about a minute via `gh issue edit`, but the empty issue was briefly public, and bots or
watchers can act on that window. Nothing else in the pipeline checks the payload: `gh` happily
sends an empty body.

**How to apply:**
- Build the payload, then gate the send on `test -s` and show `head` and `wc -c` in the output you
  read before the send runs.
- Never chain the extraction and the send in one invocation without that gate.
- After the send, read the result back (`gh issue view --json body`) to confirm what landed.
- BSD `sed` differs from GNU here in the same way as [[bsd-sed-lacks-word-boundary]]. Prefer `awk`
  or `perl` for multi-command scripts.
