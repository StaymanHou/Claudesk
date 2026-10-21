---
name: production-shaped-claude-p-for-adjudicator-scoring
description: Scoring the adjudicator with `claude -p` needs cwd `/`, every CLAUDE*/CLAUDESK* env var stripped, --no-session-persistence; the FIRST call's total_cost_usd is a cold-cache price (~$0.14 vs ~$0.005 warm).
metadata:
  type: project
---

A measurement of the supervisor's `claude -p` adjudicator is only about production if the call is shaped like production's spawn (Rust `adjudicator_command`, run by the installed app):

- **cwd `/`** — the installed app spawns from `/`. A cwd under the repo makes Claude Code load the repo's `CLAUDE.md` into the adjudicator's context, which production never sees.
- **Strip every `CLAUDE*` / `CLAUDESK*` variable.** A shell inside a Claudesk PTY carries `CLAUDE_EFFORT`, `CLAUDE_CODE_*` session markers and `CLAUDESK_DRIVE_MODE`; they leak into the child and can change its behavior. The app's own spawn has none.
- **`--no-session-persistence`** — otherwise each judgment writes a transcript and ~300 adjudicator sessions land in `~/.claude/projects`, polluting the corpus the miner reads.
- **`--output-format json`** only to read the RESOLVED model id (`modelUsage` keys). The pin `sonnet` is an alias and it moved (`claude-sonnet-5` → `claude-sonnet-5-5`, 2026-09-29).
- **`--bare` is not an option** — it requires `ANTHROPIC_API_KEY`; OAuth logins fail.

⚠️ **Never estimate a run's cost from one trial call.** The first call's `total_cost_usd` was ~$0.14 (cold cache); warm production-shaped calls report ~$0.0048. The cold figure nearly got runs 2–3 held for a decision on an ~$82 estimate that was really ~$3.

**Why:** found at M16.5 WP2 (2026-10-21); the implementation is `tooling/adjudicator-probe/score.probe.ts` (`cleanEnv`, `adjudicateOnce`).
**How to apply:** reuse `score.probe.ts` for WP3 3.5's re-score rather than hand-rolling a `claude -p` call; measure one warm call before quoting a cost. Related: [[agent-launched-app-cannot-verify-continue]] (the env-strip for launching a dev build), [[detector-scored-against-its-own-table-is-circular]].
