---
name: cc-trust-dialog-defaults-to-exit
description: A never-trusted folder opens CC behind a trust dialog whose DEFAULT is "No, exit"; an injected \r exits CC. Answer ↓ then \r after reading the pane.
metadata:
  type: project
---

Claude Code opened in a folder it has never trusted (every NEW remote scratch folder, e.g.
`~/claudesk-scratch-*` on the mini) first shows **"Quick safety check: Is this a project you created or
one you trust?"** with the cursor on **"❯ No, exit"**. Injecting a prompt plus `\r` (the usual live-check
recipe) selects "No, exit": CC quits, the workspace shows **"Session ended"**, and it looks like a product
defect. Hit at M17 WP4 P3.4 (2026-11-16); it cost a debugging detour.

**How to apply:** after opening a workspace on a fresh folder, READ the pane before injecting anything
(remote: `tmux -L claudesk-dev capture-pane -p -t '=<session>:'` over ssh; grep `trust this folder`). If the
dialog is up, send `\x1b[B` (↓) and then `\r` as two separate `cc_input` writes, then wait for
`bypass permissions on` in the pane. `claude -p` does NOT show the dialog, so a `-p` repro will not
reproduce it. Related: [[remote-verify-hygiene]], [[agent-launched-app-cannot-verify-continue]].
