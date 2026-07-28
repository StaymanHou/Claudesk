---
name: session-only-vs-permanent-dismiss-precedent
description: Claudesk already has a two-way "ask later vs never ask again" precedent in src/updater/useUpdater.ts — copy dismissBanner (persists nothing) vs skipVersion (writes to disk) rather than inventing a field.
metadata:
  type: project
---

Any "ask once / ask me later / never ask again" surface in Claudesk should copy the
**existing two-way split in `src/updater/useUpdater.ts`** rather than invent its own
persistence shape:

- **`dismissBanner`** (`useUpdater.ts:180-183`) — clears React state only
  (`setBanner(null)`, `setPhase("idle")`) and **persists nothing**. The prompt therefore
  **returns on the next launch**. This is the "later / not now" arm.
- **`skipVersion`** (`useUpdater.ts:173`) — writes `skipped_version` to `settings.json`.
  Suppressed **permanently**. This is the "never again" arm.

**The rule:** a session-scoped hide is a **React concern** (the absence of a write); only
permanent suppression earns an `AppSettings` field. A "later" button needs **no new field** —
`None` already means unresolved.

**Why this is worth remembering:** the same design was re-derived from scratch at M10.9 WP1
for the workflow-features invite, and got it *wrong* on the first pass — the invite was
specced with two buttons (`[Enable]` / `[Not now]`) where `[Not now]` meant **permanent**
suppression, i.e. a **mislabeled control** ("Not now" that actually means "never"). The
operator supplied the missing third intent, and only then did the search turn up that
`useUpdater.ts` — a file already read during that same WP — had modeled the exact two-way
split all along. So: check this precedent *before* designing a dismiss affordance.

**Corollary for the persisted-state shape:** keep the lifecycle marker **separate from the
feature's own on/off state**. M10.9's `workflow_invite: Option<WorkflowInviteOutcome>`
(`Dismissed | Enabled`, `None` = never shown) is deliberately distinct from
`workflow_features_enabled`, because a user who enables → tries → disables lands on
`enabled == false`, which is **byte-identical** to a user who never saw the invite. Deriving
suppression from the feature flag re-pitches that user; a separate marker doesn't.

Related: [[claudesk-philosophy]] (attention is the scarce resource — a re-nag spends it).
