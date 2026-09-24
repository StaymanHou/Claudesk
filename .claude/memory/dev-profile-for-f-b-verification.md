---
name: dev-profile-for-f-b-verification
description: "Verify F-b (CC profiles) against ~/.config/claude-original-dev, never by adopting the operator's real profiles into a dev build."
metadata:
  node_type: memory
  type: project
  originSessionId: 76697c1f-e1da-41b2-b70e-01bcb4026650
  modified: 2026-09-24T13:46:16.771Z
---

For dev/verification of the F-b profile feature, use the operator-requested **`~/.config/claude-original-dev`** profile (created 2026-09-24 as a CONFIG-ONLY copy of `claude-original`: `settings.json` with the statusline path repointed, `CLAUDE.md`, `statusline.sh` — no history, sessions, `.claude.json` or transcripts). It needs one `/login` on first open and has no `~/.zshrc` wrapper.

**Why:** adopting a profile writes Claudesk's hook entry into that profile's `settings.json`, and a dev build registers its OWN (`claudesk-hook-dev.pl`) marker — the operator wants dev work kept off the real profiles they use daily (`claude-original`, `neo`, `eos`, …).

**How to apply:** at any F-b verify step that needs a logged-in profile (the deferred P3.verify-human.1 idle→running→awaiting→idle cycle; Phase 4/5 verify-human), adopt `claude-original-dev`, not a real profile. Scratch-only checks can keep using the unlogged-in `tmp/scratch/f-b-prof/claude-scratch`. Related: [[verify-self-dev-vs-prod-process-name-collision]].
