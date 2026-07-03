---
name: m7-docs-viewer-intent
description: "Why Claudesk's M7 workflow-docs markdown viewer exists — it's an attention/re-orientation feature, not a documentation reader"
metadata: 
  node_type: memory
  type: project
  originSessionId: 681f9cb7-8c95-4e89-b6a0-7c5e1aed6540
---

Claudesk **Milestone 7 (workflow-docs markdown viewer)** — a read-only `Docs` right-panel tab rendering `docs/product/*.md` (incl. glob `*wbs*.md`), `workflow/wip/*.md`, `workflow/backlog.md`, `workflow/.session.md` — is an **attention-routing / re-orientation feature wearing a "viewer" costume**, like the filmstrip and status dots. The scarce resource in Claudesk's model is operator attention across 20+ rotating projects (see [[claudesk-philosophy]]).

**Why:** When the operator context-switches *into* a cold project, the first question isn't "what's the code" — it's **"where was I in the workflow, and what's next?"** That answer lives in `roadmap → wbs → wip → backlog → .session.md`. M7 makes re-orientation a single glance in the right half, per-workspace, instead of popping Sublime or reading raw markdown in the editor.

**Three scope choices confirm the intent (not arbitrary):**
1. `.session.md` is in scope — it's literally the pause bookmark / "what to do next."
2. `*wbs*.md` glob (not hardcoded `wbs.md`) — catches temporary/scratch WBS files, tracking the *current* live workflow state, not a canonical filename.
3. CHANGELOG.md deliberately dropped — it's the *past* (what shipped); the panel is about *current position + next step*.

**Deeper connection:** M7 is the in-window, per-workspace, read-side counterpart to the M6 workflow-doc-hierarchy watcher (watcher answers *where each project sits* across projects; M7 renders *the docs themselves* for the focused one) and the first concrete step toward Claudesk being **workflow-state-aware**, not just CC-process-aware (vision Core Principle 2; the "migrate state-machine enforcement into Claudesk" Future Possibility).

**Open design question for M7 WBS:** should the panel **auto-select the most relevant doc on open** (active WIP file, or `.session.md` if present) rather than just listing files? The re-orientation intent implies the operator wants the right doc already open, not to hunt for it.

**How to apply:** treat M7's scope decisions through the re-orientation lens, not a generic "markdown preview" lens. Read-only is correct (editing stays in Editor/CC). When the M7 WBS runs, resolve the auto-select question and decide whether the M6 watcher feeds this panel.
