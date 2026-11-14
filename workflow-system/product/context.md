---
stage: context
state: complete
updated: 2026-11-14
---

# Context

The project CLAUDE.md is at `CLAUDE.md` (project root). It is hand-curated and was **merged, not
regenerated**: only its "Current Milestone" section changed (M17 plus the cockpit direction).
`.gitignore` already matched the artifact-tracking policy, and the project-memory symlink already
existed, so neither changed.

**Active milestone:** **Milestone 17: Remote workspaces (one SSH host first).** It was planned on
2026-11-14 through the full product chain: the `/product-vision` revisit (condensed; the CC-cockpit
direction) → roadmap with a `/util-grill-me` pass (lifecycle rulings R-1–R-4) → research (live probes
against the mini) → arch (`arch/remote-workspaces.md`, PLANNED) → WBS (8 WPs, about 15.5 working days
nominal). The first consumer is `tank-sim-lite-demo`, whose checkpoint is 2026-12-11.

**First work packages:** **WP1: Probe, the remaining terminal unknowns under tmux** (scrollback,
bracketed paste, TERM, `/exit`, latency) and **WP2: Remote rows** (data model, `remote_key`, the
prune exemption, "Add remote project…"). They run in parallel. WP1 is a probe, so it runs as a
`/feature-plan` probe phase. WP2 is small and well specified by arch §A/§H, so `/feature-plan` fits
it too.
