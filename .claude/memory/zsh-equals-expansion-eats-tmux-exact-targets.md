---
name: zsh-equals-expansion-eats-tmux-exact-targets
description: In zsh an unquoted word starting with `=` expands to a command path, so `tmux … -t =cd-x` in a zsh-built ssh string fails ("cd-x not found") and never runs; quote it or send the script on stdin.
metadata:
  type: project
---

**zsh's `EQUALS` option expands an unquoted word that begins with `=` into the full path of the
command named after it** (`=ls` → `/bin/ls`). When no such command exists it errors
`zsh:1: <word> not found` and the WHOLE command line does not run.

**Hit 2026-11-16 (M17 WP3 Phase 5 verify-self):** a live check built a remote command in the local
zsh as `ssh host "zsh -lc '… tmux -L claudesk-dev kill-session -t =cd-f3eee4f9 …'"`. tmux's
`=name` exact-match target is exactly this shape. The local zsh expanded `=cd-f3eee4f9` first, so
the line failed with `cd-f3eee4f9 not found`, and the step (killing the remote client's sshd, then the
session) silently did nothing. The output looked like a timing result until read closely.

**How to apply:**
- Quote any `=word` argument (`-t '=cd-x'`), or drop the `=` where an exact match is not needed.
- Better for multi-step remote scripts: write the script to a file and send it on stdin,
  `ssh host 'zsh -l -s' < script.sh`. No local shell ever parses it, so neither `=word` nor `$var`
  nor quoting layers can bite.
- Claudesk's own code is not affected: every remote command is built through `remote_cmd::quote`
  (`tmux_cancel_copy_mode_command` passes `'=<session>:'` quoted; `tmux_attach_command` passes
  `'=<session>'` quoted, with a hostile-name test). This trap is in hand-typed shell.

Distinct from [[zsh-unquoted-var-does-not-word-split]] (zsh does not word-split `$files`), which is the
other zsh-vs-bash surprise in hand-written verification commands.
