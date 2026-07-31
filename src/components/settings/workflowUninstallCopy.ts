// M10.9 WP3.5b task P3.3 — the uninstall dialog's copy, as exported constants.
//
// Values, never inline JSX strings: the repo rule is that `?raw` guards verify structure and
// silently stop matching after a formatter reflow, so anything a copy-fidelity test must pin
// lives here and the component interpolates it. Mirrors `workflowInstallCopy.ts`.
//
// ## The disclosure obligation this file carries
// The install consent screen names every side effect `install.sh` has. Uninstall inherits the
// same obligation in reverse, plus one Claudesk-specific act the script does NOT perform:
// deleting the provenance record. Three things must be stated honestly:
//
//   1. What the SCRIPT removes — and that it only ever touches links resolving into its own
//      repo, skipping anything foreign (that guard is the reason a hand-edited `~/.claude/`
//      survives an uninstall intact).
//   2. What CLAUDESK removes on top of it — the downloaded copy and its own install record.
//   3. What NEITHER removes — the `permissions.allow` entries in `~/.claude/settings.json`.
//      The script prints them and stops, exactly as `install.sh` prints-but-never-applies them.
//      Saying nothing here would leave the user believing uninstall was complete when four
//      settings lines remain (`SURFACE-2026-07-30-...-CLEAR-THE-PROVENANCE-RECORD` names this
//      symmetry explicitly).

/**
 * The managed row's uninstall affordance — the visible PAIR of `[Install…]`.
 *
 * ## Why this button exists (operator, verify-human 2026-07-31)
 * The first build made the dialog toggle-triggered only, and the managed row merely *said*
 * "to remove it, turn off Workflow features above". That is not a pair: the absent state got a
 * button you can see and press, the managed state got a sentence pointing at a checkbox
 * somewhere else. The operator looked at the panel twice and asked where the wizard was —
 * which is the affordance failing, not the reader.
 *
 * The label names BOTH effects because the button does both: removes the substrate and turns
 * the feature layer off. Naming only the removal would leave the gate change as a surprise.
 */
export const UNINSTALL_BUTTON_LABEL = "Uninstall & disable…";

/** The dialog's title. Names the act, not the toggle that triggered it. */
export const UNINSTALL_TITLE = "Remove the workflow system?";

/**
 * The framing sentence.
 *
 * States the ONE thing that is true regardless of which button they pick: the features are
 * going off either way. That is what makes the three buttons a choice about the *substrate*
 * rather than a re-litigation of the toggle they already flipped.
 */
export const UNINSTALL_INTRO =
  "Workflow features will be turned off. You can also remove the workflow system Claudesk installed, or leave it in place.";

/** What the removal actually does — the disclosure list. */
export const UNINSTALL_EFFECTS: readonly string[] = [
  "Runs the workflow system's own uninstall.sh, which removes the skill and agent symlinks it created under ~/.claude/ and takes out its block from ~/.claude/CLAUDE.md (backing the file up first).",
  "Skips anything it did not create — links pointing outside its own repo and real files are left untouched.",
  "Leaves the ~/.claude/skills/ and ~/.claude/agents/ folders themselves in place — along with any skills of your own that are in them. Claude Code owns those folders, not the workflow system, so nothing removes them; if they end up empty, that is expected.",
  "Deletes the copy Claudesk downloaded, and Claudesk's record of having installed it.",
];

/**
 * The one thing removal does NOT do, stated separately because a user who misses it will
 * believe the uninstall was incomplete-by-bug rather than incomplete-by-design.
 */
export const UNINSTALL_NOT_REMOVED =
  "It does not edit ~/.claude/settings.json — the permissions you added for the workflow system stay until you remove them yourself. The preview below lists them.";

/** Heading above the real `--dry-run` output. */
export const UNINSTALL_PREVIEW_LABEL = "Exactly what will be removed";

/**
 * Why the preview is trustworthy — it is not a Claudesk-composed list.
 *
 * Worth stating in the UI: the guarantee ("preview and action cannot disagree") is only
 * legible if the user knows the preview came from the same script that does the work.
 */
export const UNINSTALL_PREVIEW_HINT =
  "Produced by running the uninstall script in preview mode — nothing has been changed yet.";

/** Shown while the dry run is in flight. */
export const UNINSTALL_PREVIEW_LOADING = "Checking what would be removed…";

/** The three intents, labelled for what the user means. */
export const UNINSTALL_BUTTON = "Uninstall";
export const KEEP_BUTTON = "Keep it installed";
export const CANCEL_BUTTON = "Cancel";

/**
 * Per-button clarifications.
 *
 * `keep` and `cancel` differ only in the gate, which is invisible from the labels alone —
 * this is where that difference is spelled out, because the whole reason there are three
 * buttons is that a user must never land in `keep`'s state without choosing it.
 */
export const KEEP_HINT =
  "Turns the features off and leaves everything installed.";
export const CANCEL_HINT = "Changes nothing — the features stay on.";

/** Shown while the real uninstall runs. Cancel is coarse; the copy must not oversell it. */
export const UNINSTALL_RUNNING_LABEL = "Removing…";
export const UNINSTALL_CANCELLING_LABEL = "Cancelling…";
export const UNINSTALL_CANCELLING_HINT =
  "The uninstall stops at the next step — the script is never interrupted mid-run.";

/** Terminal headings. */
export const UNINSTALL_DONE_TITLE = "Removed";
export const UNINSTALL_FAILED_TITLE = "Uninstall failed";

/**
 * Shown when a run failed but left the record intact — i.e. the substrate is still known and
 * a retry is available. Pairs with `UninstallFinished.retry_available`.
 */
export const UNINSTALL_RETRY_HINT =
  "Nothing was forgotten — the workflow system is still recorded as installed, so you can try again.";

/**
 * Shown when everything was removed EXCEPT Claudesk's own record (the one arm where a
 * surviving record is a problem rather than a safety property).
 */
export const UNINSTALL_STALE_RECORD_HINT =
  "The workflow system was removed, but Claudesk could not delete its install record — it may still show as installed until that file is gone.";
