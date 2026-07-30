// M10.9 WP3.5a — the install wizard's consent copy, as exported CONSTANTS.
//
// ## Why these are values and not JSX
// The consent step is the only place a user is told what Claudesk is about to do to files outside
// its own data directory. That makes it the most safety-relevant copy in the app, and it must be
// test-assertable. This repo's rule (root `CLAUDE.md`) is that `?raw` source guards verify
// structure and silently stop matching after a formatter reflow — WP2 paid for that twice. So the
// copy lives here as strings, the component interpolates these, and the tests compare values.
//
// ## The disclosure standard: every side effect, derived — never a fixed list
// An audit of the real `install.sh` (2026-07-29) found it does materially more than "symlink some
// skills". Each item below traces to a specific line of that script, and the wording is
// deliberately conditional where the script is conditional: enumerating created directories as a
// fixed list would go stale the moment upstream adds one.

/** What `install.sh` links. Per-skill and per-agent, one symlink each. */
export const CONSENT_SYMLINKS =
  "Creates one symlink per skill and per agent inside ~/.claude/, each pointing at the cloned repo.";

/**
 * The scope surprise. `install.sh:102-171` injects a marker-delimited block into the user's
 * **global** `~/.claude/CLAUDE.md` — replacing it if the markers exist, else appending, else
 * creating the file — and takes a `.bak` copy first when the file already exists.
 *
 * This is the item most likely to surprise someone: they consented to "install a workflow
 * system", not to an edit of a file that shapes every Claude Code session they run.
 */
export const CONSENT_GLOBAL_CLAUDE_MD =
  "Adds a marked block to your global ~/.claude/CLAUDE.md (backing the file up to CLAUDE.md.bak first). The block is delimited by markers and is replaced, not duplicated, if you re-run it.";

/**
 * `install.sh:176-181` **prints** four `permissions.allow` entries and never applies them. Saying
 * "adds permissions" would be false; saying nothing would leave the user with a half-working
 * install and no idea why.
 */
export const CONSENT_PERMISSIONS_MANUAL =
  "Prints four permission entries for ~/.claude/settings.json that it does NOT apply — you add those yourself afterwards.";

/**
 * Conditional by necessity. `~/.claude/bin/` is never created (the `claude-time` linking that used
 * to create it was retired upstream 2026-07-29). `~/.claude/hooks/` is created *only if* the
 * companion repo ships a `hooks/` directory — `install.sh:67-68` is live-but-dormant code today.
 */
export const CONSENT_DIRECTORIES =
  "Creates ~/.claude/skills/ and ~/.claude/agents/ if they don't exist, plus ~/.claude/hooks/ only if the repo ships hooks.";

/** Where the clone goes — the user picks, this is only the default. */
export const CONSENT_CLONE =
  "Clones the companion repository to the location you choose below.";

/**
 * The reversibility promise, and the reason it is honest to make.
 *
 * `uninstall.sh` is standalone, idempotent, removes a symlink only when it resolves into its own
 * repo, and excises only the marker block from `CLAUDE.md`. So "one command undoes it" is a claim
 * the script actually backs. Claudesk's own uninstall wizard is WP3.5b; until then this is the
 * back-out path, which is why it is named here rather than implied.
 */
export const CONSENT_REVERSIBLE =
  "To undo all of this later, run ./uninstall.sh from the cloned repo.";

/** Every disclosure, in the order the consent step renders them. */
export const CONSENT_ITEMS = [
  CONSENT_CLONE,
  CONSENT_SYMLINKS,
  CONSENT_DIRECTORIES,
  CONSENT_GLOBAL_CLAUDE_MD,
  CONSENT_PERMISSIONS_MANUAL,
  CONSENT_REVERSIBLE,
] as const;

/**
 * The cancel button's label while a cancellation is pending.
 *
 * **"Cancelling…", not "Cancelled".** Verify-self established that the cancel flag is polled
 * between steps and never mid-subprocess (killing `git` halfway corrupts the object store), so a
 * cancel arriving during a long clone is honored only when that clone finishes. A label claiming
 * the work stopped would be a lie at exactly the moment the user is watching hardest.
 */
export const CANCELLING_LABEL = "Cancelling…";

/** Shown beneath the pending-cancel state, so the delay reads as expected rather than broken. */
export const CANCELLING_HINT =
  "Finishing the current step first — cancelling mid-clone would leave a corrupt repository.";
