---
name: never-propose-brew-upgrade-to-verify-a-release
description: Never propose `brew upgrade` (or anything that rewrites the running bundle) as a way to verify a Claudesk release — it kills every live session. The in-app updater is the path, and WHEN to install is the operator's call alone.
metadata:
  type: feedback
---

**Nothing should ever kill a running Claudesk — not a test, not a script, not a verification
step.** Do not propose `brew upgrade --cask claudesk` (or `brew reinstall`, or a manual `cp` into
`/Applications`) as the way to verify a release. `brew upgrade` deletes and rewrites the running
bundle, so every live Claudesk session dies mid-work — including the session doing the verifying.

The intended UX, stated by the operator 2026-09-18 while publishing `v0.5.2`:

> "nothing should ever kill running Claudesk, never, ever. The UX for myself, should be just
> publish the release. Then I decide when to install the new version by wrapping up my work
> (my call, not yours, nor any test or script), click the check for update button, and click
> install"

So the agent's job ends at **publish + verify the downloaded artifacts**. Installing is a separate,
operator-initiated act with no agent involvement and no schedule.

**Why:** the in-app updater ([[m7-docs-viewer-intent]]-adjacent product thesis — attention is the
scarce resource) exists precisely so a version bump never interrupts work in flight. Proposing the
foreign path (`brew`) as a verification step contradicts the feature the product ships, and costs
the operator every running workspace across 20+ rotating projects. A release is *distribution*; an
install is the operator **wrapping up on their own terms** and clicking two buttons.

**How to apply:**
- Verify a release against the **downloaded** artifacts (`curl` the published `.dmg` / payload →
  `shasum`, `stapler validate`, `spctl`) and the resolving `latest.json` endpoint. That is fully
  agent-doable and proves what users receive.
- Then **stop**. Hand off the in-app path as the operator's own step: Check for updates → Install.
  Do not attach a deadline, do not schedule it, do not treat an unticked install-dependent check
  as a blocker on closing the work.
- ⚠️ Note `/release` Step 11 still prints a `brew upgrade` block. It is correctly marked
  operator-run-never-agent-run, but prefer pointing at the **in-app updater** instead; brew is for
  a first install or a genuinely broken install, not for routine upgrades.
- The same rule governs any future "restart the app to pick this up" suggestion — check whether the
  in-app path can do it without a kill before proposing one.

Related: [[brew-cask-manual-delete-desync]] (the brew/manual-delete desync this is adjacent to),
[[installed-build-verify-deferred-to-release]] (installed-`.app` checks are deferred to the
operator's own gate, not run per-feature).
