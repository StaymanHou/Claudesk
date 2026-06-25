---
name: cc-hook-event-facts
description: Concrete Claude Code v2.1.x hook-event facts for Claudesk's status channel (live-captured)
metadata:
  type: reference
---

Live-captured CC (v2.1.x) hook-event facts for Claudesk's status channel (QoL-WP2,
commit 7cfc464; as-built in CLAUDE.md + arch.md §A + status_broadcaster/mod.rs):

- **AskUserQuestion / permission-prompt answer-resume → `PostToolUse`** (tool_name=
  AskUserQuestion), NOT `UserPromptSubmit`.
- **`UserPromptSubmit` fires ONLY for top-level user prompts** — never for answering a
  mid-turn tool prompt.
- **The blue "awaiting input" dot on an AskUserQuestion ASK = a generic `Notification`
  with `notification_type:"permission_prompt"`** — there is NO dedicated AskUserQuestion
  notification type.
- **Other `Notification` `notification_type` values:** `idle_prompt` (60s+ idle),
  `auth_success`, `elicitation_dialog` / `elicitation_complete` / `elicitation_response`.
- **Full ask→answer→resume stream:** `UserPromptSubmit → PreToolUse(AskUserQuestion) →
  Notification(permission_prompt) → PostToolUse(AskUserQuestion) → Stop`.
- **Claudesk registers** `UserPromptSubmit` / `Stop` / `PostToolUse` / `Notification`
  (NOT `PreToolUse`); `Notification→AwaitingInput` is gated on `notification_type`
  (input-needed: `permission_prompt` / `elicitation_dialog`; unknown/absent → AwaitingInput
  fallback; recognized informational → no-op).

Verify these still hold (CC version-drifts) via the harness in [[cc-hook-capture-beats-docs]].
