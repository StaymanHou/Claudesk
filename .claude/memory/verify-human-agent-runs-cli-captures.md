---
name: verify-human-agent-runs-cli-captures
description: "At verify-human, run the boundary-required CLI/curl capture yourself and show the output; only ask the operator for judgment calls or things the agent can't observe."
metadata:
  node_type: memory
  type: feedback
  originSessionId: 49b178fb-fa81-4c71-a413-d884799f3587
  modified: 2026-09-23T13:44:19.977Z
---

When verify-human's integration-boundary rule requires a "recorded CLI invocation against the consuming surface", run it yourself and paste the captured output into the checklist. Don't hand the operator a `! <command>` to copy-paste. The operator's items should be the judgment calls (approving a deviation, accepting a tradeoff) and anything the agent genuinely cannot observe, such as native-window behavior (see [[installed-build-verify-deferred-to-release]]).

**Why:** paydown WP3 Phase 1 (2026-09-23): I asked the operator to run `pnpm check:link` and paste the line. They replied "can you just do it yourself?" A deterministic CLI capture is not a judgment call, so asking for it spends their attention for nothing ([[claudesk-philosophy]]: attention is the scarce resource).

**How to apply:** when building the verify-human checklist, run the capture first and include its output as an already-evidenced item. Leave for the operator only the leaves that need their decision or senses.
