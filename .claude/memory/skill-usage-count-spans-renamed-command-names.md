---
name: skill-usage-count-spans-renamed-command-names
description: Counting a skill's usage from transcripts must sum EVERY name it has had (a rename splits the history) and must match `<command-name>` only in text content, never tool_result bodies. A single-name grep under-counted /session-restore by 73%.
metadata:
  type: reference
---

A usage-frequency figure for a **renamed** skill must count **every command name it has had**. The M9 WP5 rename split `/session-restore`'s history: **`/session-resume` = 390** invocations (2026-05-29 → 2026-07-21), then **`/session-restore` = 142** (2026-07-21 → 2026-08-14), raw family **532**. A re-measurement grepping only the current name finds 142. That is a **73% under-count**, and it makes an earlier correct figure (531) look inflated. The same split applies to `session-handoff`/`session-pause` and `session-capture`/`session-store-learning`.

Two more traps in the same measurement (M13 WP2, 2026-08-14):
- **Self-fired invocations are not operator input.** 9 of the 532 were `ScheduleWakeup` self-fires, separable as the only family invocations whose `<command-args>` match a `ScheduleWakeup` prompt in the same file, leaving **523 operator-typed**.
- **The predicate must match `<command-name>` in string/text content only, never `tool_result` bodies.** Bucketing every user line that mentions the command gives **1,869**, of which only ~155 are real invocations. The rest are skill-listing output, skill-body text and prose.

**How to apply:** before quoting any skill-usage number, list the skill's historical names (the rename notes live in `~/.claude/CLAUDE.md` → "Session vocabulary"), count each, and state the predicate. Related: [[measurement-input-must-be-representative]] (the reading can be about the instrument, not the system).
