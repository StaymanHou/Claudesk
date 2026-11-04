---
name: never-emit-provocation-token-in-supervised-reply
description: In a Claudesk-supervised workspace, never put a literal TRANSITION token you don't mean as your own verdict into your reply (even in a code block); the supervisor may fire it into your own session.
metadata:
  type: feedback
---

When the agent runs inside a Claudesk workspace with the supervisor ON (autopilot/fsd), its OWN
replies are read by the installed supervisor at every turn end. A token alone inside a fenced code
block counts as EMITTED, not quoted (`arch/workflow-supervisor.md` → "Which token is the verdict"),
and the last emitted token in the final text wins. So a prompt the agent writes FOR the operator,
such as a supervisor probe that should "end with TRANSITION: T2", can make the supervisor inject
`/task-act` into the agent's own session.

**Why:** Found 2026-11-04 while planning M16.5 WP7: the probe prompts were about to go into the chat
as a code block. They went into a file instead.

**How to apply:** In a reply, spell a provocation token out in words ("the word TRANSITION, a colon,
a space, then T2") or write the prompt to a file the operator copies from. The agent's real verdict
token at the end of a workflow skill is unaffected. Related: [[supervisor-activity-observable-from-cc-transcripts]].
