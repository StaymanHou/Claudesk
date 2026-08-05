---
name: agent-launched-app-cannot-verify-continue
description: An agent-launched Claudesk cannot verify WHICH conversation `--continue` resumes — its spawned CC sessions inherit CLAUDE_CODE_CHILD_SESSION and write no transcript; `env -u` at the seeding call does NOT fix it.
metadata:
  type: project
---

A `--continue` verification **cannot be completed from a Claudesk that the agent launched.** Any CC
session spawned by such an app inherits **`CLAUDE_CODE_CHILD_SESSION`** down the launch chain
(this CC session → Bash tool → `pnpm tauri:dev` → node → Claudesk → `claude`), and that marker
**disables transcript saving** — the terminal shows `⚠ Transcript saving is off — inherited
CLAUDE_CODE_CHILD_SESSION marker`. Since `--continue` resumes from CC's **transcript store**, a session
spawned through the agent's app leaves nothing for a later `--continue` to land on.

**⚠️ The non-obvious part: `env -u CLAUDE_CODE_CHILD_SESSION` at the SEEDING call does not fix this.**
Seeding a fresh conversation with `env -u … claude -p "…"` **outside** the app works — that transcript
IS written, and is verifiably the newest `.jsonl` in `~/.claude/projects/<slug>/`. But the marker still
reaches the *app* through its own launch chain, so the in-app `--continue` resolved to an **older**
transcript (an `/exit` residue) rather than the fresh seed. Stripping the variable from one child does
not clean the parent that will spawn the session under test.

**What an agent CAN still prove** (all verified live 2026-08-05, M12 WP3):
- the flag reaches argv — `claude --permission-mode dontAsk --continue` observed on the spawned process;
- the arm is *selected* correctly — a no-fire (`⊘`) open spawns the same argv **without** `--continue`,
  side by side in one app, which is what proves an intent crossed the IPC boundary;
- that CC resumes *a* prior conversation (replayed history appears in the buffer).

**What only the operator can prove:** that it resumes the **intended** (newest/real) conversation.
That needs an operator-launched build (`pnpm tauri:dev` typed by them, or the installed `.app`), which
carries no marker.

⚠️ **Before spending a live run on any agent-driven `--continue` check, first assert transcript saving
is ON in the app-spawned session** — otherwise the check is vacuous in the
`[[verify-the-mutation-landed]]` / decisive-observation sense: a correct implementation and a broken one
both resume "some older conversation," so the run cannot distinguish them. Related:
[[verify-self-dev-vs-prod-process-name-collision]] (agent-launched vs operator-launched divergence),
[[mcp-bridge-tools-not-exposed-to-subagents]].

Tracked as `SURFACE-2026-08-05-CONTINUE-LANDS-ON-INTENDED-CONVERSATION-UNVERIFIED` (low — arm 1's
wiring is proven; the failure mode would be benign), carried to the next `/release` gate per
[[installed-build-verify-deferred-to-release]].
