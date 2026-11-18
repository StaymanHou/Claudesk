---
name: feedback-operator-all-good-is-the-verdict
description: When the operator answers a live check with "all good", record it as the verdict; never re-interrogate on ambiguous logs — re-check later with own captures.
metadata:
  type: feedback
---

When the operator answers a batch of live checks with "all good" (or "works well"), that IS the verdict for those
checks. Record it as operator-observed and move on. Do not come back with a click-by-click interrogation because the
agent's own logs are ambiguous: in M17 WP8 Batch B the status log could not show which button produced an `/exit`, the
agent asked "what did you click at each point?", and the operator replied "I said it's all good".

**Why:** the operator's attention is the scarce resource (memory `claudesk-philosophy`). Gaps in agent-side evidence
are the agent's problem to close, not the operator's to reconstruct from memory.

**How to apply:** record the answer verbatim as the evidence (`operator: "all good"`). If a property still lacks
agent-side evidence, schedule a later step where the agent captures it itself. In WP8 the Detach question was settled
at P3.2 with `tmux ls` and PID captures taken around the operator's next click. Ask only when the answer would change
what happens next. Related: [[verify-human-agent-runs-cli-captures]].
