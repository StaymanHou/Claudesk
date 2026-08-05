// M12 WP3 — the auto-resume decision function.
//
// ═══════════════════════════════════════════════════════════════════════════════
// TWO SIGNALS → ONE ACTION, AND THE PRECEDENCE REVERSES THE ROADMAP
//
//   1. the unclean-exit flag  (M12 WP2, `session-state.json`)  → continue the conversation
//   2. `workflow-system/state/.session.md` present             → `/session-restore`
//   3. neither                                                 → nothing fires
//
// ⚠️ THE UNCLEAN FLAG WINS. This **reverses** the roadmap's *"both present → prefer
// `/session-resume`, workflow context is richer."* Operator's reason (2026-08-03): the
// flag is an **explicit user signal** (they closed the workspace with the ⏸, or the
// machine died mid-flight); `.session.md` is **semi-automated** — written by a skill. An
// explicit statement of intent outranks a file a tool wrote.
//
// A future reader WILL find the roadmap's opposite ordering and be tempted to "fix" this
// back. `predictAction.test.ts` mutation-proves the direction: inverting the two branches
// fails a test that says exactly why.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ WHY THE RETURN VALUE IS A KIND AND NOT A COMMAND STRING (Phase 1's verdict)
//
// The plan originally specified `→ "resume" | "restore" | null`. Phase 1's live probe
// killed that shape, and the reason is not cosmetic — **the two arms are different KINDS
// of action, consumed at different moments by different code:**
//
//   arm 1  spawn argv `--continue`   — chosen BEFORE the process exists, passed in argv
//   arm 2  inject `/session-restore` — typed INTO the process ~1500 ms after it starts
//
// A bare `/resume` slash command does **not** resume anything: it opens an interactive
// modal session picker ("Resume session", "1 of 17", a search box, "Esc to cancel"), which
// would strand the user in a keyboard modal on every unclean re-open — worse than firing
// nothing. There is no `/continue` slash command either (Claude Code's autocomplete lists
// one entry, `/resume (continue)`). The only non-interactive continue is the CLI flag
// `-c/--continue`, verified live to restore the prior conversation and land at a ready
// prompt with no picker.
//
// So a single string return would force every caller to re-derive "…and is this one an
// argv flag or something I type?" — the exact re-interpretation that invites one caller to
// get it wrong. The kind is part of the decision, so the decision returns it.
//
// Evidence + the full run tables: the WIP's `## Probe verdict (Phase 1)`.

/** The two signals, as read at picker-open time (or re-derived at click time). */
export type AutoResumeSignals = {
  /** The M12 WP2 unclean-exit flag for this project. */
  uncleanFlag: boolean;
  /** Whether `workflow-system/state/.session.md` exists in the project. */
  sessionMdPresent: boolean;
};

/**
 * Continue the most recent conversation by passing a flag in Claude Code's argv.
 *
 * Requires NO injection and NO settle delay — the flag is present at `execvp` time, so
 * Claude Code resumes as part of its own boot. This is why Phase 1's verdict made arm 1
 * the *safe* arm: the milestone's riskiest mechanism (composing input on the app's own
 * initiative) now covers one arm instead of two.
 */
export type ArgvAction = {
  kind: "argv";
  /** The CLI flag to add to the spawn argv. */
  flag: "--continue";
};

/**
 * Type a slash command into the running TUI.
 *
 * ⚠️ Timing-sensitive: measured NOT-EXECUTED 5/5 at spawn time and unreliable at 350 ms
 * (1/5 then 0/5 across two independent samples). See {@link INJECT_SETTLE_MS}.
 */
export type InjectAction = {
  kind: "inject";
  /** The command to type. ⚠️ `/session-resume` does not exist — renamed at WP5/M9. */
  command: "/session-restore";
};

/** What to do when a workspace opens. `null` = nothing fires. */
export type AutoResumeAction = ArgvAction | InjectAction | null;

/**
 * Which picker door was used to open a workspace.
 *
 * ⚠️ **This is NOT derivable from an `AutoResumeAction`, and assuming it was is what shipped a
 * defect** (M12 WP3 Phase 4, found live): `null` means both *"the no-fire door was used"* and
 * *"the row door was used but there was no signal"*. Those need **opposite** treatment for the
 * argv arm — suppress vs. nothing-to-suppress — so the door must travel as its own value all the
 * way to `cc_spawn`, which gates `--continue` on it.
 *
 * ⚠️ It lives in this module (not the picker) because it must cross into `state/workspace.ts` and
 * on to the spawn call; a picker-local type would pull a component path into the state layer. The
 * picker re-exports it so existing importers are unchanged.
 *
 * Wire form is kebab-case, matching Rust's `#[serde(rename_all = "kebab-case")] OpenIntent`.
 */
export type OpenIntent = "fire" | "no-fire";

/**
 * How long to wait after spawn before injecting, in milliseconds.
 *
 * ⚠️ **Do not lower this without re-running `tooling/autofire-timing/probe.sh`.** It is a
 * deliberate ~4× margin over a measured cliff, not a round number:
 *
 * | delay | result (5 cold spawns each) |
 * |-------|------------------------------|
 * | 0 ms (spawn/`cc_ready`) | NOT-EXECUTED 5/5 |
 * | 250 / 300 ms | NOT-EXECUTED 5/5 |
 * | **350 ms** | **1/5, then 0/5 — unreliable** |
 * | 400–500 ms | EXECUTED 5/5 |
 * | **1500 ms** | **EXECUTED 10/10, twice; 5/5 under 4-core load** |
 *
 * The 350 ms row is the reason for the margin: it is the "works warm, fails cold" mode,
 * sitting 50 ms below a delay that reads as perfectly reliable. And the threshold is
 * environment-dependent — this was measured on one machine with a warm binary, so a
 * slower machine moves it.
 */
export const INJECT_SETTLE_MS = 1500;

/**
 * Decide what a workspace open should fire, from the two signals.
 *
 * Pure and total: every input combination maps to exactly one outcome, and there is no IO
 * here so tests drive the real decision rather than a replica.
 *
 * ⚠️ **This is the ONLY home for the precedence rule.** The `picker_announce_actions`
 * batch command returns the *resolved* action, in which both inputs are already collapsed
 * into one value — a resolved payload cannot be mutation-tested for precedence, because
 * you can no longer vary the inputs independently. WP1's Verdict (b) calls this out
 * explicitly: the command *calls* this function; the tests drive this function.
 */
export function predictAction(signals: AutoResumeSignals): AutoResumeAction {
  // ⚠️ ORDER IS THE FEATURE. The flag is checked FIRST so that when both signals are
  // present the explicit one wins. Swapping these two branches is the "fix" the roadmap
  // invites; `precedence_the_unclean_flag_wins_when_both_signals_are_present` fails if
  // you do.
  if (signals.uncleanFlag) {
    return { kind: "argv", flag: "--continue" };
  }
  if (signals.sessionMdPresent) {
    return { kind: "inject", command: "/session-restore" };
  }
  // Neither signal: fire NOTHING. `/session-start` is never auto-fired — it is rare
  // (2.7% of cold opens in the log analysis) and expensive when wrong, so it gets an
  // explicit button (Phase 5) instead of a prediction.
  return null;
}

/**
 * The literal command text a picker row announces for `action`, or `null` for no
 * announcement.
 *
 * Deliberately a **separate** function from {@link predictAction}: the label is what the
 * user reads, the action is what runs, and they are allowed to differ in form. Arm 1's
 * action is the argv flag `--continue`, but a row announcing `--continue` would be
 * meaningless to a reader — what they care about is *"this will pick up my last
 * conversation."* Announcing `/resume` would be worse than meaningless: it names a command
 * that opens a picker, which is precisely what this design avoids.
 */
export function announcementFor(action: AutoResumeAction): string | null {
  if (action === null) return null;
  switch (action.kind) {
    case "argv":
      return "continue";
    case "inject":
      return action.command;
  }
}

/**
 * Whether `action` needs a command typed into the PTY after spawn.
 *
 * Exists so a call site cannot answer this by string-matching the command text — the
 * question is about the action's *kind*, and the kind is authoritative.
 */
export function requiresInjection(action: AutoResumeAction): boolean {
  return action?.kind === "inject";
}

/**
 * The wire vocabulary `picker_announce_actions` returns, mirrored from Rust
 * (`src-tauri/src/announce/mod.rs` → `ACTION_CONTINUE` / `ACTION_RESTORE`).
 *
 * ⚠️ Deliberately NOT the command text and NOT the raw flag. `"continue"` rather than
 * `"resume"` because arm 1 is a spawn argv flag, and a payload naming `/resume` would
 * invite a caller to type it — which opens an interactive picker instead of resuming.
 */
export type AnnouncedAction = "continue" | "restore";

/** project path → announced action. An **absent key means no prediction**. */
export type AnnounceMap = Readonly<Record<string, AnnouncedAction>>;

/**
 * Turn one announced wire value into the action it denotes.
 *
 * This is the seam between the batch command and {@link predictAction}'s kinds: the command
 * resolves *which* arm (it has the two signals), and this maps that answer back onto the
 * same typed action the click path produces. Both sides therefore agree by construction
 * rather than by two call sites independently remembering what `"continue"` means.
 *
 * An unrecognized value yields `null` — a stale frontend paired with a newer backend
 * announces nothing rather than guessing, which fails toward "no auto-fire".
 */
export function actionFromAnnounced(
  announced: AnnouncedAction | undefined,
): AutoResumeAction {
  switch (announced) {
    case "continue":
      return { kind: "argv", flag: "--continue" };
    case "restore":
      return { kind: "inject", command: "/session-restore" };
    default:
      return null;
  }
}

// ⚠️ `spawnArgvFor(action)` USED TO LIVE HERE and was DELETED at M12 WP3 Phase 4 verify-codify.
//
// It returned `["--continue"]` for the argv arm and claimed to be "the ONLY place the flag string
// is produced". That claim became false once Phase 4 resolved the argv arm in the BACKEND: the
// real and only producer is `CC_ARG_CONTINUE` (`cc_session/mod.rs:66`), pushed by `build_cc_argv`.
// The frontend never composes argv at all — it sends an `intent` and Rust decides — so the TS
// producer had zero production callers while carrying 4 green test references.
//
// Deleted rather than kept-with-a-caller, and rather than left standing with more tests added to
// it: `SURFACE-2026-08-05-FIRE-PATH-PRIMITIVES-HAVE-NO-CALLER-UNTIL-PHASE-4` names "more green on
// an uncalled function" as the exact failure mode it tracks, and WP2 set the precedent by deleting
// `is_unclean_on_disk` when its predicted consumer never materialized.
//
// ⚠️ `ArgvAction.flag` is NOT dead and must stay: it is the type-level discriminant the
// announcement reads. It is never used to build a command line.
