---
name: cc-tui-wraps-each-word-in-sgr
description: CC's TUI wraps EACH word in its own SGR colour sequence, so a multi-word sentinel never matches the raw PTY stream; use one word or strip SGR first.
metadata:
  type: project
---

**Claude Code's TUI emits every word of a coloured string with its own SGR sequence**, e.g. the status
line arrives as `ESC[38;2;153;153;153mmanual ESC[39m ESC[38;2;153;153;153mmode ESC[39m …`, not
`manual mode on`. A substring match for a multi-word phrase against the raw PTY output **never fires**.

**Why:** the M17 WP1 latency probe (2026-11-14) used the sentinel `manual mode on` and reported a
TIMEOUT on every run while CC had in fact reached its prompt each time; the instrument was wrong, not CC.
The single word `shortcuts` worked.

**How to apply:** when a host-side PTY probe (python `pty`, `script`) waits for CC on-screen text:
- match a **single word**, or strip SGR first (`re.sub(rb"\x1b\[[0-9;?<>=]*[A-Za-z~]", b"", buf)`);
- pick a word that exists in the **mode you run**: default mode's status line has `shortcuts`
  (`⏸ manual mode on · ? for shortcuts`), but yolo mode's reads
  `⏵⏵ bypass permissions on (shift+tab to cycle)` and has **no** `shortcuts`.
- A timeout from a text sentinel is a suspect instrument until a raw tail shows the text is absent.

Related: [[cc-tui-cr-not-lf]], [[measurement-input-must-be-representative]].
