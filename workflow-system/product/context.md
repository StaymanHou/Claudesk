---
stage: context
state: complete
updated: 2026-11-18
---

# Context

The project CLAUDE.md is at `CLAUDE.md` (project root). It is hand-curated and was **merged, not
regenerated**: only its "Current Milestone" section changed (M18 active). `.gitignore` already matched the
artifact-tracking policy, and the project-memory symlink already existed, so neither changed.

**Active milestone:** **Milestone 18: Remote workflow substrate.** It was planned on 2026-11-18 through:
- an entry `/util-grill-me`. It found that mccc is public, so hosts clone over HTTPS. It chose in-app install with provenance and Uninstall, and drift plus Update for Managed installs.
- `/product-arch`: `arch/claude-substrate.md` → "Remote hosts (M18)", PLANNED. There was no research step.
- `/product-wbs`: 8 WPs.

**First work packages:** **WP1: remote Recycle respawns CC** (a bug, reproduce-first) and **WP2: fresh-account hardening**
(the bypass-dialog withhold and the `claude` PATH fallback). Both are independent of the substrate track; WP3 (probe) can run beside
them.
