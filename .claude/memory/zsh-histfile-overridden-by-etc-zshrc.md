---
name: zsh-histfile-overridden-by-etc-zshrc
description: "A HISTFILE env var passed to a spawned interactive login zsh is OVERRIDDEN by /etc/zshrc; isolate shell-history tests via HOME (read $HOME/.zsh_history), not HISTFILE."
metadata: 
  node_type: memory
  type: reference
  originSessionId: 8b2d796e-0350-4ad7-8784-4dbd99be3f7b
  modified: 2026-07-19T13:28:39.635Z
---

When spawning an **interactive login** `zsh -l -i` (the WP9 right-panel terminal shape, or any PTY test that drives a real zsh) and you need an isolated history file, **setting `HISTFILE` in the spawn env does NOT work**. macOS's system `/etc/zshrc` (line ~16) unconditionally runs:

```
HISTFILE=${ZDOTDIR:-$HOME}/.zsh_history
```

when the shell sources it — which **overrides** any `HISTFILE` you passed. The shell then saves history to the **real `~/.zsh_history`** (polluting it), and a test reading the passed HISTFILE sees an empty file → a **false "history LOST"**.

**The fix: isolate via `HOME`, not `HISTFILE`.** Set `HOME=<tempdir>` in the spawn env and read `<tempdir>/.zsh_history` — because `/etc/zshrc` resolves `$HOME/.zsh_history` against whatever `HOME` you set. (`ZDOTDIR` also works and takes precedence, but `HOME` is simpler and also isolates the rc chain.)

**Corollary — how zsh saves history at all (relevant to [[raw-mode-cr-is-enter]] / the WP3 kill path):** the operator's zsh has `SHARE_HISTORY`/`INC_APPEND_HISTORY` **off** (system default), so history is written **only on a clean/hangup exit**, never incrementally. Verified against a real `zsh -l -i` at the prompt: **SIGHUP saves history** (default hangup handler runs the save, ~20ms) and **SIGTERM/SIGINT/SIGKILL do NOT**. This is why M10.5 WP3's `PtyCcSession::kill()` uses **SIGHUP-first** (`killpg(pgid, SIGHUP)`) — see `src-tauri/tests/shell_history_on_kill.rs` (the committed regression test) and `cc_session/mod.rs` `KillTiming`.

Only an **executed** command (typed + Enter) enters the history list that the on-exit save flushes — `print -s` pushes to the in-memory list by a different path the exit-save doesn't persist, so a test must run a real `echo <marker>\r`, not `print -s`.

Root-caused in WP3 verify-codify by a self-driven portable-pty harness that captured the shell's PTY output (the prompt showed the real rc chain had loaded + the command executed, yet the isolated HISTFILE stayed empty → the override was visible).
