//! M10.9 WP2 — the **workflow-features opt-in gate**.
//!
//! One persisted boolean (`workflow_features_enabled`, default **`false`**) that gates
//! the entire workflow-coupled feature class **as a set**: M11's docs tab, M12's
//! auto-resume + drive-mode selector, M13's skill buttons, and anything later. This
//! module owns the backend half — the commands and the broadcast; the field itself lives
//! with its siblings in [`crate::config_store::settings`].
//!
//! ## Why a gate at all
//! Claudesk has two audiences. The **workflow-independent lite-IDE core** (picker,
//! workspaces, PTY terminal, editor/diff, hook-driven status dots, time analytics) works
//! for any Claude Code user. The workflow-orchestration layer, by contrast, depends on a
//! substrate Claudesk does not ship: the companion workflow system installed at
//! `~/.claude/`. Without it those surfaces are dead affordances. So the class is gated
//! behind one opt-in rather than degraded gracefully — the default is set by
//! **applicability, not audience size** (design-prior
//! `gate-substrate-dependent-feature-class-behind-default-off-opt-in`), which is why it
//! ships OFF for the operator too.
//!
//! ## Two invariants this module exists to protect
//!
//! 1. **OFF is byte-identical** to a build that never had the features. Not
//!    rendered-then-hidden, not present-but-disabled, not registered-with-a-no-op
//!    handler — *absent*. The backend can't enforce that on its own; the frontend
//!    consumption seam (`src/state/workflowGate.ts`) plus its OFF-invariant guard test
//!    are what make it mechanical. This module's job is to be the single source of truth
//!    that seam reads.
//! 2. **Enabling writes NOTHING into `~/.claude/`.** [`workflow_set_features_enabled`]
//!    touches Claudesk's own `settings.json` and nothing else. The operator's skills are
//!    live symlinks into the companion repo, so an install-on-enable step could clobber
//!    the source. "Enable the UI" and "install the substrate" are strictly separate acts
//!    — the invite (WP3) may *point at* the install, but the app never performs it.
//!
//! Shape mirrors [`crate::time_store::commands`]'s tracking toggle exactly (const event
//! name + get + set-then-emit), which is this milestone's acknowledged template: the same
//! universal-vs-gated feature-flag pattern, one milestone later.

pub mod commands;
