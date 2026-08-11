---
name: xterm-dom-reads-fake-a-blank-pane
description: Reading a CC pane via .xterm-rows children or [data-session-id].innerText returns empty/stylesheet under the DOM renderer — a "blank pane" verdict can be pure instrument error, and two agreeing instruments do not rule it out.
metadata:
  type: reference
---

Claudesk mandates the **xterm.js DOM renderer** (no WebGL). Under it, glyphs live in
absolutely-positioned spans, so the two obvious ways to read a terminal pane both lie:

- `document.querySelector('[data-session-id]')` → `.xterm-rows` → joining `.children` textContent
  returns **zero non-empty rows for a fully-rendered pane**.
- `innerText` on the `[data-session-id]` element itself returns **~55 KB of xterm's injected
  `<style>` block** — which looks like real content and inflates any length-based check.

⚠️ **Instrument AGREEMENT is not correctness when both instruments share a defect.** Measured
2026-08-07 (M12 WP4b Phase 3 verify-human): an agent called a pane blank on **7 consecutive stable
DOM samples over 12.6 s PLUS a screenshot**, and explicitly reasoned that two independent
instruments agreeing ruled out the known single-sample false alarm. Both were wrong together — the
DOM reads hit the wrong nodes, and the screenshot was captured before paint. The operator's
screenshot showed CC's banner *and* the agent's own typed prompt had been visible throughout.
**Two reads of the same wrong node are one observation, not two.**

This **extends** `CLAUDE.md`'s bridge caveat (h), which prescribes only a T+0 time series — that is
the defence that failed here, because sampling a broken selector repeatedly just yields a stable
wrong answer.

**Before believing a negative read, run a positive control:** point the same selector at a pane you
*know* is painted. If it also reads empty, the instrument is broken, not the pane. This is cheap and
was available from the start.

**What actually worked:** deriving terminal state out-of-band from
`~/Library/Application Support/com.claudesk.app*/status-channel.log` — `UserPromptSubmit` → `Stop`
events are timestamped, independent of the DOM, and settled the question immediately.

Related: [[verify-native-pty-via-ps-screencapture-stderr]],
[[mcp-bridge-tools-not-exposed-to-subagents]], [[guard-predicate-completeness-vs-mutation-landing]].
