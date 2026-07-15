---
name: cc-hook-event-facts
description: "Concrete Claude Code v2.1.x hook-event facts for Claudesk's status channel (live-captured)"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 5bf200e8-8da9-4d78-b2bf-6eb78d945880
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

**SessionStart / SessionEnd lifecycle (M9 WP6.5, live-captured 2026-07-08, CC v2.1.204):**
- **`SessionEnd` fires on clean/graceful close only:** `/exit` (`reason:prompt_input_exit`),
  `/exit`-then-SIGKILL (= Claudesk's `cc_kill` `kill()` sequence — the `/exit` exits cleanly
  within the grace window before the backstop SIGKILL, so the hook DOES fire), and SIGTERM
  (`reason:other`). It does **NOT** fire on bare SIGKILL / crash / power-loss / force-quit.
- **`SessionEnd` payload:** `{session_id, transcript_path, cwd, prompt_id?, hook_event_name, reason}`.
  **`SessionStart` payload:** `{session_id, transcript_path, cwd, hook_event_name, source, model}`.
- **Consequence (M9 WP6.5 session-end model):** `SessionEnd` is the PRIMARY authoritative
  session-end for a clean/graceful close (nearly free — just consume the persisted row); the
  hard-kill case (no `SessionEnd`) needs the explicit `WorkspaceClose` marker + startup
  reconciliation to cover it.

**PreToolUse/PostToolUse timing — dispatch boundary, NOT tool wall-time (M9, observed 2026-07-13):**
- **`PreToolUse` and `PostToolUse` fire ~30ms–1s apart** — they bracket the tool DISPATCH /
  permission boundary, NOT the tool's actual execution. Live-observed Pre→Post spans in a
  tool-heavy session were 27ms–48ms each (Bash/Edit/Read/Skill/Write). The gap is Perl-hook +
  dispatch latency, not "how long the tool ran."
- **Consequence for time-analytics:** `ai-doing` measured strictly as the `PreToolUse`→`PostToolUse`
  span is intrinsically tiny (tens of ms/call) → it systematically UNDER-represents real
  AI-execution time. This is separate from (and survives) the minute-quantization `dur_ms` fix
  (`SURFACE-2026-07-13-M9-WP4-MINUTE-QUANTIZATION-…`): even with exact-ms summing, a session with
  60+ tool calls totals only ~1–2 min of `ai-doing` because each Pre→Post span is ~30ms. The
  between-tool gaps (the real "AI working" time) land in `ai-reasoning`, not `ai-doing`.
- **Bears on:** WP6c metrics + any "how much was the AI actually working" measurement. If a truer
  AI-execution number is wanted, Pre→Post spans are the wrong signal — consider the AI-busy-window
  (UPS→Stop minus human gaps) or tool-call COUNT instead of Pre→Post duration.

Verify these still hold (CC version-drifts) via the harness in [[cc-hook-capture-beats-docs]].
