---
name: claudesk-philosophy
description: "The deliberate design philosophy behind Claudesk — opinionated, Claude-specific, parallel-across-projects, attention as the scarce resource"
metadata: 
  node_type: memory
  type: project
  originSessionId: 681f9cb7-8c95-4e89-b6a0-7c5e1aed6540
---

Claudesk is **deliberately opinionated software** — built against one workflow, no concession for users who don't share it. The full write-up lives in `README.md` → "Philosophy & design choices" and `docs/product/vision.md`. The load-bearing tenets:

- **Opinionated & narrow by intent.** Personal tool for one workflow (heavy Claude Code + the `stayman-claude-code-customization` workflow system at `~/.claude/skills/` + Sublime + macOS + 20+ rotating projects). A tool that fits one workflow exactly beats one that fits every workflow approximately.
- **Tuned for Claude Code specifically — NOT OpenAI/Gemini.** Operator tried portability and abandoned it: not all models are the same; the hooks, skill/orchestrator conventions, drive modes, resume/recycle rituals all assume Claude.
- **Parallelism across projects, NOT across agents within one project.** One agent / one CC session per project (subagents fine). Conscious rejection of multi-agent-on-one-project per *Mythical Man-Month* — coordination overhead eats the gains. Parallelize the independent thing (projects), not the coupled thing (agents).
- **Built for flexible timelines, not rushing.** Optimizes throughput across a portfolio, not latency on one item. If you must rush ONE project, multi-agent is the fit — Claudesk is not.
- **The scarce resource is OPERATOR ATTENTION, not compute.** This is the deepest tenet and the *why* behind most features. Filmstrip, status dots, PiP, menu-bar, and the M7 docs viewer ([[m7-docs-viewer-intent]]) are all attention-routing: answer "which project needs me / where was I?" in <1s. Yolo-by-default but recycle/resume on operator judgment — automate the mechanical, reserve the human for judgment.
- **Lite over featureful; wrap don't fork.** Only daily frictions get built; reuse real Sublime Text/Merge for the long tail; drive the real `claude` CLI — an orchestration layer, no fork to maintain.
- **Single-user is a feature, not a limitation** — it's what allows flat JSON, one window, one process, zero coordination.

**How to apply:** when scoping a Claudesk feature, ask "does this route operator attention or remove a daily friction?" — if not, it likely violates lite-over-featureful. Don't propose multi-agent-per-project, cross-platform, multi-user, model-portability, or general-IDE features; they're anti-goals by design.
