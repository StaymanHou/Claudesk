---
name: cc-hook-capture-beats-docs
description: For CC hook-channel work, a live hook-stream capture beats the official docs — docs can be confidently wrong about event existence
metadata:
  type: feedback
---

For Claudesk hook-channel features: when the official Claude Code hooks docs and a
live hook-stream capture disagree, **the capture wins** — the docs can be confidently
WRONG about which events fire. (QoL-WP2, 2026-06-25: the official docs said "no hook
fires after the user answers an AskUserQuestion"; a live capture proved CC DOES fire
`PostToolUse` on answer-resume. Docs-alone would have shipped an inferior `Stop`-based
workaround.)

**Why:** CC's hook surface is under-documented and version-drifting; the running tool
is ground truth.

**How to apply:** Research-first to frame the question precisely (which events/types
*should* exist), then capture to answer it. The authoritative harness:
- a Perl capture-hook that appends one JSON line per event (name + tool_name +
  notification_type + key set) to a log;
- an ISOLATED `--settings` file registering it for all events of interest — does NOT
  touch `~/.claude/settings.json`;
- a `pty.fork()` driver that submits a prompt and answers interactively. `claude -p`
  auto-dismisses tool prompts, so the *answer* step needs a real TTY.

See [[cc-hook-event-facts]] for the concrete events this harness captured.
