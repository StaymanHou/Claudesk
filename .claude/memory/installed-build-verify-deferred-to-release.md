---
name: installed-build-verify-deferred-to-release
description: "Operator defers installed-`.app` / native-window manual verification to the /release packaging gate, not per-feature verify-human"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 95a4c14f-2445-445e-ae3f-9b737ef2b300
---

For native-window / installed-build verification that the agent can't reach (NSPanel out-of-focus behavior, native menu glyphs, GUI-PATH parity, dev/prod isolation, real ⌘Tab-away), the operator's preference is to **skip the per-feature `verify-human` walkthrough and verify once at the `/release` packaging gate** — running the freshly-built release `.app` right before bumping the Homebrew tap. First stated at M5 WP6 close (2026-06-27): "we will package and run the release build, and I will verify at that time right before we distribute to homebrew."

**Why:** the installed `.app` is the only faithful surface for these checks (`pnpm tauri:dev` inherits the terminal's full PATH + dev identity, so it can't reproduce install-only behavior — see [[brew-cask-manual-delete-desync]] context). Building a release `.app` per feature is wasteful when a single pre-distribution verification covers the accumulated batch. The agent should still verify everything reachable via the MCP bridge on the dev build (high-fidelity for DOM/IPC/click/screenshot on main + pip webviews), then **carry the installed-build checks to release** rather than to verify-human.

**How to apply:** when a milestone/feature has native-window or installed-build outcomes, agent-drive the dev-build slice via the bridge, mark the installed-build outcomes `DEFERRED-TO-RELEASE` in the WIP tree (NOT silently passed), and log a high-priority backlog SURFACE so the `/release` run honors them before publishing. Do not treat the operator's "skip" at verify-human as "verified" — it's "verified later, at release." The `/release` skill is the enforcement point.
