// M13 WP2 — the skill-button row: a TINY FIXED SET of workflow commands as clicks.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ WHY A FIXED SET AND NOT A REGISTRY OVER `~/.claude/skills/`
//
// The roadmap line read "render each skill as a clickable button." Taken literally that is
// **61 buttons, 11 of them firing dead commands** (the operator's skill dir holds 61 entries,
// 11 of which are dangling symlinks from a July-27 mutation-test run; 50 are invocable).
// Typing `/fea`+tab beats scanning that wall, so an exhaustive row would ship a surface
// strictly worse than the one it replaces.
//
// WP1 measured what is actually typed, across 2470 transcripts: of 577 manual workflow-skill
// invocations, only **11 distinct skills were EVER typed by hand** — and **zero** `feature-*`,
// `task-*`, or `product-*` invocations, ever. Those are the *agent's* vocabulary (agent-side:
// `feature-build` 910, `feature-verify-auto` 884), fired by auto-chaining. ⚠️ **A per-skill
// registry would have surfaced the agent's working set to a human who never types it.**
//
// Hence: a fixed set of what the operator fires constantly. The exit criterion says "no
// slash-command typing for **common** skills" — "common", not "all".
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ NO FILESYSTEM CHECK, AND THIS IS ARCHITECTURAL — NOT LAZINESS (WP2 task 2.1, option (i))
//
// The tempting refinement is "existence-check each skill's path so a button never fires a dead
// command." It was considered and REJECTED, on the same grounds an existing module already
// rejected it:
//
//   §4c anti-brittleness (`arch/workflow-gate.md`): the **command name** is the ONLY stable
//   cross-repo coupling. A filesystem path is not.
//
// The `workflow_substrate` module — which answers "is the companion system installed?" —
// already refused this. ⚠️ Attribution corrected at code-quality review: the sentence below is
// **`SKILLS_SUBPATH`'s** doc comment (`workflow_substrate/mod.rs:48`), not
// `skills_dir_exists`'s: *"Still deliberately NOT a check for specific skill names: the skill
// set evolves in the companion repo on its own schedule, and per the return contract's §4c
// anti-brittleness clause a hardcoded roster of skill filenames would be exactly the brittle
// coupling that clause forbids."* `skills_dir_exists` carries the same argument in its own doc
// (*"no skill name is hardcoded, so the roster can change freely"*). A per-button path check IS
// that roster.
//
// What happens if a skill is absent: CC prints "unknown command". **The terminal is the
// evidence** — the same reasoning behind `injectCommand`'s deliberate no-retry.
//
// ⚠️ COROLLARY, easy to get wrong: `skills_dir_exists` is NOT this row's gate.
// "Is the substrate installed" and "did the user opt in" are different questions. The gate is
// the persisted user setting, read via `useWorkflowFeaturesEnabled`. Wiring substrate detection
// in would make these buttons vanish for a developer install.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ DO NOT NAME AN EXPORT `*Chord*` IN THIS MODULE
//
// The OFF-invariant guard's chord arm selects modules by *exported identifier* containing
// "Chord", and its `WORKFLOW_TERMS` list already contains "skill". So a `skillPaletteChord`
// export here would trip that arm — and that exact hypothetical name is what the 2026-08-12
// paydown used as its own probe fixture. A red from that is not a new bug; it is the guard
// working. These buttons are clicks, not chords; `⌘⇧`+digit is reserved for filmstrip
// switching anyway.

import { injectCommand } from "./autoResumeFire";

/**
 * A workflow command the row offers as a click.
 *
 * `command` is the literal slash command — **the only sanctioned coupling to the companion
 * repo** (§4c). `label` is what the button shows; it is deliberately allowed to differ from
 * the command, because four of these are long enough to blow out the header row.
 */
export interface SkillButton {
  readonly command: string;
  readonly label: string;
  readonly title: string;
}

/**
 * The fixed set — **FIVE skill commands.**
 *
 * ⚠️ **Recycle Session is the row's sixth affordance and is NOT in this list**, because it is
 * WP3's *operation* (a `CleanExitRoute`), not a slash command — and this array holds slash
 * commands only. WP2 deliberately ships without it; rendering it early-and-disabled was
 * rejected, since this repo uses `disabled` for *capability* limits reflecting real current
 * state (`canOpenTerminal`, a collapsed split), never as a promise about unbuilt work.
 * ⚠️ A `DECIDED_ROW_SIZE = 6` constant lived here to stop that sixth member being forgotten;
 * it was **removed at code-quality review** as unsound in both directions — see the long note
 * in `__tests__/skillButtons.test.ts` before rebuilding anything like it. The obligation lives
 * in `wbs.md` → WP3, which is a place that cannot misfire.
 *
 * ⚠️ **No member is conditional.** Dropping one is a scope reduction that needs its own
 * decision, not an implementation detail — recorded because three of these were fired ≤3
 * times EVER and the operator accepted that knowingly, to carry the milestone's "no typing
 * for common skills" metric on a *visible surface* rather than closing it by argument.
 *
 * ⚠️ `/session-restore` is in this set as of 2026-08-14, **reversing WP1's exclusion.** The
 * exclusion held that M12's open-time auto-fire already covers it. A measurement over all 2474
 * transcripts was expected to confirm that and instead refuted it: of 523 operator-typed
 * invocations, 97.9% fired while `.session.md` was PRESENT — but those are overwhelmingly
 * `/clear` then `/session-restore` **inside an already-open session** (`/clear` = 333 typed).
 * ⚠️ **Open-time auto-fire never runs in that flow — the workspace does not re-open.** So the
 * 97.9% describes a population the automatic arm does not serve. Full record: the WP2 WIP → D3.
 *
 * ⚠️ The accepted cost: on the workspace-*open* path this button partially overlaps M12's
 * automatic arm — two mechanisms serving one skill. Accepted knowingly, because the flow it
 * serves has no affordance at all.
 */
export const SKILL_BUTTONS: readonly SkillButton[] = [
  {
    command: "/session-start",
    label: "start",
    // ⚠️ The wording is load-bearing: `/session-start` is NEVER auto-fired (it begins a fresh
    // workflow session, so a mistaken auto-fire discards context rather than restoring it).
    // See `sessionStartButton.ts`'s header — this button IS that decision's surface.
    title: "Run /session-start — never auto-fired; this is the one-click route",
  },
  {
    command: "/session-restore",
    label: "restore",
    title:
      "Run /session-restore — for restoring after a /clear, when this workspace is already open",
  },
  {
    command: "/session-capture",
    label: "capture",
    title: "Run /session-capture — persist a learning",
  },
  {
    command: "/util-prune-claude-md",
    label: "prune",
    title: "Run /util-prune-claude-md — compact this project's CLAUDE.md",
  },
  {
    command: "/util-backlog-paydown",
    label: "paydown",
    title: "Run /util-backlog-paydown — sweep the standing backlog",
  },
] as const;

/**
 * Whether the skill-button row should exist for this workspace.
 *
 * ⚠️ **Two conditions, and both are preconditions rather than runtime `if`s inside a handler.**
 *
 * `workflowEnabled` is the gate: every command here is a companion-workflow skill, so with the
 * gate off the row must be ABSENT — not hidden, not disabled, not a no-op handler (the seam
 * contract in `useWorkflowFeaturesEnabled.ts`).
 *
 * `ccSessionId !== null` is the dead-click guard: a null id means the spawn has not resolved
 * (or failed), and firing into it would be the WP6 picker MAJOR. Mirrors
 * `showSessionStartButton`, whose contract this row inherits by absorbing that button.
 */
export function showSkillButtons(inputs: {
  workflowEnabled: boolean;
  ccSessionId: string | null;
}): boolean {
  return inputs.workflowEnabled && inputs.ccSessionId !== null;
}

/**
 * **THE ONE SEND FUNNEL.** Every skill button's click goes through here.
 *
 * ⚠️ This exists because *"enumerating skills as data makes the SET testable but does NOT prove
 * each member has a CALLER."* M12 shipped a `/exit` clean-exit variant that round-tripped
 * through two test suites while being called by nothing, and the exhaustiveness test's green
 * **read as coverage**. A button registry is that shape at larger scale. The mitigation is the
 * standing rule: funnel every send through ONE function and guard *that* — so a member with no
 * caller is a member this funnel never receives, which a test can see.
 *
 * ⚠️ Delegates to `injectCommand` rather than calling `invoke("cc_input", …)` directly. That is
 * not indirection for its own sake: `injectCommand` owns the `.catch` (an unhandled Tauri
 * rejection vanishes silently — the WP6 picker MAJOR) and the `\r`-terminated payload rule
 * (`slashCommandPayload`; CC's TUI runs in raw mode where `\n` only triggers autocomplete
 * typeahead and does not submit). A second injection path would be a second copy of both.
 *
 * ⚠️ **No settle delay.** The ~1500 ms `INJECT_SETTLE_MS` measured in M12 Phase 1 is about a
 * *cold* spawn whose TUI has not started reading keystrokes. This fires into a session the
 * operator is looking at, through the same `cc_input` path every real keypress uses. Copying
 * that constant here would add 1.5 s to a button press for no measured reason.
 */
export async function fireSkillCommand(
  sessionId: string,
  command: string,
): Promise<void> {
  // ⚠️ The `"skill-button"` label is load-bearing, not cosmetic. `console.warn` is this path's
  // ONLY failure channel (no overlay — replacing a working terminal with an error over a command
  // the user can simply retype would be worse), and `injectCommand` defaults its prefix to
  // `auto-resume`. Without the label every button failure would be reported as M12's *automatic*
  // arm misfiring, i.e. the one diagnostic this feature ships would name the wrong feature.
  await injectCommand(sessionId, command, undefined, "skill-button");
}
