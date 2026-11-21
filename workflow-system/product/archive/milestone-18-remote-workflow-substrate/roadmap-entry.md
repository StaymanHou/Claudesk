<!-- M18's roadmap entry, archived verbatim from workflow-system/product/roadmap.md at /product-finalize (2026-11-20). -->

### Milestone 18: Remote workflow substrate (planned 2026-11-17; grilled, designed and decomposed 2026-11-18: `wbs.md`, 8 WPs)

**Why:** M17 brings a remote workspace's workflow buttons (skills, Session-Start, Recycle) to the remote
host, but nothing checks that the companion workflow system is installed there, and nothing can install it.
On a host account without it, every one of those buttons is dead (`SURFACE-2026-11-17-REMOTE-HOST-WITHOUT-WORKFLOW-SKILLS-…`).
M17 never scoped this: tank's 2026-11-13 request said the mini already had the skills, which held for the
admin account and stopped holding when the work moved to the personal account (2026-11-16/17). Operator
ruling (2026-11-17, during M17 WP8): a milestone of its own, after M17, not an insert; for tank's
checkpoint the mini's account is set up by hand (done 2026-11-17).

**Scope, settled at the entry grill (2026-11-18, `/util-grill-me`):**
- **Fact that removed the roadmap's source question:** mccc is a **public** repo, and the mini's account reaches
  it anonymously over HTTPS (`git ls-remote` answered, HEAD `f8e8873`). "No GitHub access" only meant no SSH key.
  So a host clones and pulls over HTTPS, and git bundles are not needed.
- **Asked: install** → **full in-app install** (operator; recommendation was detect + a copyable command). The
  install reuses `workflow_install`'s runner over the host's master: clone from the public HTTPS URL, then
  `install.sh`. A provenance record is kept on the host, and there is a paired **Uninstall**. The operator
  ruled this a one-off call, not a design prior.
- **Asked: keeping current** → **a drift readout against GitHub's HEAD** (`ls-remote` run from the host), plus an
  **Update** button (`git pull --ff-only`, then re-run `install.sh`) only for installs Claudesk made (Managed).
  Nothing updates without a click.
- **Assumed (operator confirmed "all good"):**
  - **Remote profiles are out.**
  - **Detection:** the same marker check as local, run in the open check's single exec. Drift is checked on open
    and when Settings is viewed, never polled in the background.
  - **The controls live in Settings,** one entry per host derived from the remote rows. The note on a workspace
    points there.
  - **Gate ON + absent on the host:** the skill-injecting surfaces are hidden (skill row, Session-Start, Recycle,
    auto `/session-restore`), Docs and Prompt stay, and a plain-words note explains. **Gate OFF:** no detection,
    no note.
  - **The mini's hand install counts as Developer:** drift is shown, no Update or Uninstall, and there is no adopt
    path.
  - **Two backlog items move into M18:** remote Recycle respawn (`SURFACE-2026-11-17-REMOTE-RECYCLE-NEVER-RESPAWNS-CC`)
    and the bypass-dialog inject (`SURFACE-2026-11-17-AUTO-RESUME-INJECT-ANSWERS-BYPASS-PERMISSIONS-DIALOG-NO-EXIT`).
  - **A new account's `~/.zprofile` PATH line** gets a preflight message, not an automatic fix.
  - **Install and Uninstall are verified against a sandboxed HOME on the mini,** never the live install.
  - **Next:** `/product-arch` → `/product-wbs` (no new libraries, so no `/product-research`).
