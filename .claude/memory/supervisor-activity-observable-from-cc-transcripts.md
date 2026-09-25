---
name: supervisor-activity-observable-from-cc-transcripts
description: The supervisor's fires and misses are observable out-of-band from CC transcripts (fire timing about 4s after turn end; an AUTO-edge TRANSITION tail answered by human text is a miss) while its own withheld-reason lines are console-only.
metadata:
  type: reference
---

The M15 workflow supervisor logs every decision with `console.warn` into the WKWebView, which is
unreadable in a shipped build and to an agent ([[read-logs-console-captures-nothing]]). **CC
transcripts are an independent, readable observable** for whether it fired. They are read from
`~/.claude/projects/*/*.jsonl` and, for profiles, `~/.config/claude-*/projects/`, using main-chain
entries only (skip `isSidechain`).

- **A fire** is a user entry containing `<command-name>/…</command-name>` whose gap from the
  preceding assistant entry is **under about 6s**. The supervisor lands in about 4s, and a human
  does not read a turn and type a command that fast. Exclude local commands like `/exit`, which
  show a 0.1s gap.
- **An unfired break** is an assistant turn whose text carries `TRANSITION: <id>`, where `<id>` is
  AUTO in the stored mode, and whose next non-tool event is **human text** ("next", "so?") rather
  than a `Skill` call. Discount tails that ask a question: a withhold there can be legitimate.
- **Confirm Claudesk hosting** by the *"Claudesk reports the drive mode"* `additionalContext` line
  in the transcript. **Confirm supervision** per project in
  `~/Library/Application Support/com.claudesk.app/projects.json` (`default_drive_mode`,
  `supervisor_enabled`, `profile`) plus `settings.json` → `workflow_features_enabled`.

**Why:** found at the 2026-09-25 dogfeedback close-out. The operator reported "no more feedback",
yet this method showed a confirmed fire on 2026-09-15 (v0.5.0) and **zero** fires since v0.5.1,
across at least six unfired plain-F8 breaks. Silence had looked like success.

**How to apply:** use it to check supervisor behavior without the operator watching a terminal,
and as an independent cross-check once the activity surface exists: agreement between two
instruments is not correctness ([[xterm-dom-reads-fake-a-blank-pane]]). ⚠️ It shows WHETHER the
supervisor fired, never WHY it withheld. The reason lives only in the supervisor's own record.
Evidence and hypotheses are in `SURFACE-2026-09-14-SUPERVISOR-NEVER-OBSERVED-FIRING-IN-A-LIVE-SESSION`.
