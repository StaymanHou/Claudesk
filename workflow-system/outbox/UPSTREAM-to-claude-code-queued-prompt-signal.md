---
to: anthropics/claude-code (GitHub issue, feature request)
kind: feature-request
date: 2026-10-26
status: SENT 2026-10-26 as https://github.com/anthropics/claude-code/issues/105187 (operator decision A at M16.5 WP4 P4.verify-human.1; filed by the agent via `gh issue create`, body from the section below)
summary: UserPromptSubmit cannot tell a queued prompt from a turn start, and Esc fires no hook
---

# Title

Hooks: let `UserPromptSubmit` say a prompt was queued (or add an interrupt hook)

# Body

**What I'm building.** A desktop wrapper hosts several Claude Code sessions. It uses hooks to show
each session's state and to mark turn boundaries in the scrollback. `UserPromptSubmit` is the turn
start and `Stop` is the turn end.

**The problem.** When a prompt is typed while a turn is still running, Claude Code queues it.
`UserPromptSubmit` fires **at enqueue time**, not when the queued prompt actually starts a turn.
Nothing in the payload says the prompt was queued, so a hook consumer plants a "turn started"
marker in the middle of the running turn.

The obvious workaround is to infer it from event order: a submit with no `Stop` since the previous
submit is a queued prompt. That breaks because **an Esc interrupt fires no hook at all**. After an
interrupt, the next real turn start also has no `Stop` before it, so the workaround misreads it as
queued.

**Measured** (CC 2.1.30x, one machine, 30–45 days of real use):

- Esc interrupts followed by a `Stop` (`stop_hook_summary` line in the transcript): **0 of 16**.
  Normal `end_turn`s followed by one: 2,060 of 2,068.
- "No `Stop` since the previous submit" caught **30 of 34** queued prompts but misclassified
  **8 of 8** first prompts after an Esc.
- Adding "and a tool call is still open" fixed the Esc case (7 of 8) but caught only **6 of 34**
  queued prompts.

**Ask: either of these would fix it.**

1. A field on `UserPromptSubmit`, e.g. `"queued": true` when the prompt is being enqueued behind a
   running turn. Ideally there would also be a second event, or a flag, when a queued prompt
   actually starts.
2. A hook that fires when the user interrupts a turn (Esc), e.g. `Interrupt` or a `Stop` with
   `"reason": "interrupted"`. Event-order inference would then work.

Option 1 is the more direct fix. Option 2 has independent value: today a consumer cannot tell that
an interrupted turn ended at all.

**Related.** A request for a completion event for background tasks (`BackgroundTasksIdle`) was
closed as not planned. That one is a different gap, and this request does not depend on it.
