---
name: Raw-mode TTYs — CR (0x0d) is Enter, not LF (0x0a)
description: POSIX terminal line-discipline fact relevant to ALL PTY-driven subprocesses in Claudesk (not just CC). Raw mode disables CR→NL translation, so input lines must end in \r to register as Enter.
type: project
---

In a raw-mode TTY, the Enter key is `\r` (CR, byte `0x0d`), not `\n` (LF, byte `0x0a`). This is POSIX line-discipline behavior, not CC-specific.

**Why most code "works" with `\n`:** in cooked mode (the default for shell-attached terminals), line discipline translates CR→NL automatically, so typing Enter sends `\r` but the receiving program reads `\n`. The translation is the only reason `printf "foo\n"` produces a newline.

**Raw mode disables this translation.** TUI programs (vim, CC, htop, fzf, ranger, etc.) set their input PTY to raw mode to receive keys without buffering — and in that mode, `\r` is what the kernel forwards when the Enter key is pressed. A `\n` byte sent to a raw-mode TTY is just a literal character.

**Rule for Claudesk PTY-driven subprocesses:** when injecting input bytes into any TUI process via `portable-pty` (or node-pty, or any direct-PTY library), input lines MUST end in `\r`. If you write `\n`, the receiving TUI will treat it as a literal character and the input won't register as Enter.

**Applies to:**
- WP7 PtyCcSession production code (every slash-command injection)
- Any future Claudesk probe that drives a TUI subprocess
- Any debug harness that needs to "type Enter" into a PTY-attached child

**Test:** check whether `tcgetattr(fd).c_lflag & ICANON` is zero — if so, the TTY is in raw mode and you need `\r`.
