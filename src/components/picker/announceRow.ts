// M12 WP3 Phase 3 — the picker row's announcement + two-door logic, as pure functions.
//
// Extracted rather than inlined in `ProjectPicker.tsx` because this repo has **no React
// component-render harness** (`@testing-library/react` is not a dependency —
// `SURFACE-2026-07-31-NO-REACT-COMPONENT-RENDER-HARNESS`, still open). So anything asserted
// as a *value* must live in a module a test can import; anything left in JSX can only be
// checked by a source-text guard or by driving the live app. That is the standing method
// (`[[extract-for-import-when-a-raw-guard-cant-express-the-property]]`).
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ ONE CONDITIONAL GOVERNS BOTH THE LABEL AND THE BUTTON
//
// The announcement and the `⏵` no-fire door appear **exactly together**, because with no
// predicted action both doors are identical and `⏵` would be a control that provably does
// nothing. [`rowAffordances`] returns both from a single decision so the component cannot
// render one without the other — the alternative (two independent `action !== null` checks
// in JSX) is two places to forget.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ THE WORKFLOW GATE APPLIES PER ARM, NOT TO THE WHOLE ROW (2026-08-05)
//
// Until Phase 3.5, `rowAffordances` returned SILENT whenever the gate was off. That was
// correct-as-built and is now WRONG — see [`armAvailable`] for the rule and its reason.
// In short: the `--continue` arm reads Claudesk's own store and fires a stock Claude Code
// CLI flag, so it serves every CC user and is UNGATED; the `/session-restore` arm promises
// something about `workflow-system/` files and stays GATED.
//
// The pairing above is unaffected: within whichever arm survives, the label and the door
// still appear together or not at all.

import {
  actionFromAnnounced,
  announcementFor,
  type AnnounceMap,
  type AnnouncedAction,
  type AutoResumeAction,
  type OpenIntent,
} from "../../state/predictAction";
import type { useWorkflowFeaturesEnabled } from "../../state/useWorkflowFeaturesEnabled";

/**
 * The workflow-features gate's value type, referenced from the seam itself.
 *
 * ⚠️ **This alias is load-bearing and must stay in executable source.** The OFF-invariant
 * guard's chord arm scans modules for a reference to the gate seam and **strips comments
 * before matching** — a comment-only mention was *measured* not to satisfy it during M11.
 * Copying `panelHost.ts:43`'s exact pattern is what makes this module's gate-dependency
 * structural rather than documentary.
 */
type WorkflowGateValue = ReturnType<typeof useWorkflowFeaturesEnabled>;

/** What one picker row should render for the auto-resume feature. */
export interface RowAffordances {
  /** The command text to display next to the project name, or `null` for no announcement. */
  announcement: string | null;
  /** Whether to render the `⏵` open-without-firing button. */
  showNoFireDoor: boolean;
  /** The action a normal row click should fire, or `null` to open plainly. */
  action: AutoResumeAction;
}

/** Nothing announced, no second door, no action. The gate-OFF and no-signal answer. */
const SILENT: RowAffordances = {
  announcement: null,
  showNoFireDoor: false,
  action: null,
};

/**
 * Whether an action's arm is available given the workflow-features gate.
 *
 * ⚠️ **THE GATE IS PER-ARM, NOT PER-FEATURE** (operator decision 2026-08-05). Mirrors
 * `arm_available` in `src-tauri/src/announce/mod.rs`; the two must agree.
 *
 * | arm | reads | gated? |
 * |---|---|---|
 * | `{kind:"argv"}` — `--continue` | `session-state.json` (Claudesk's own store) | **NO** |
 * | `{kind:"inject"}` — `/session-restore` | `workflow-system/state/.session.md` | **YES** |
 *
 * The discriminator is **applicability**, which is what
 * `gate-substrate-dependent-feature-class-behind-default-off-opt-in` actually keys on —
 * never audience size. The unclean-exit flag is written by Claudesk's own workspace
 * lifecycle (M12 WP2) and `--continue` is a stock Claude Code CLI flag: nothing in that arm
 * touches `~/.claude/skills/` or `workflow-system/`, so it serves **every** Claude Code
 * user and gating it was a mis-application of the prior. The `.session.md` arm promises
 * something about files a non-workflow user does not have, which is what the gate is for.
 *
 * ⚠️ Branches on the action's **`kind`**, never on its label or the wire string. The kind is
 * the authority (`predictAction.ts`), and this is the third consumer that must not
 * re-derive the distinction from text.
 */
function armAvailable(
  action: NonNullable<AutoResumeAction>,
  enabled: WorkflowGateValue,
): boolean {
  // Exhaustive on `kind`: adding a third arm makes this a type error rather than silently
  // inheriting whichever default a wildcard happened to pick.
  switch (action.kind) {
    case "argv":
      return true;
    case "inject":
      return enabled;
  }
}

/**
 * Decide what one row renders, from the batched announce map.
 *
 * ⚠️ **`enabled` no longer collapses the whole row.** Before 2026-08-05 this returned
 * {@link SILENT} unconditionally when the gate was off; that was correct-as-built and is now
 * wrong. The gate applies **per arm** — see {@link armAvailable}. A gated-out arm still
 * collapses completely (no announcement, no `⏵`, no action), honoring the seam contract
 * *a gated surface must not exist when off*; an ungated arm renders regardless.
 *
 * Belt-and-braces with the backend, which applies the same split server-side: an OFF build's
 * map already omits the gated arm, so this check means the row stays correct even with a
 * stale map in hand — two independent reasons, matching how M10.9 pairs the server-side gate
 * read with the frontend seam.
 */
export function rowAffordances(
  projectPath: string,
  announce: AnnounceMap,
  enabled: WorkflowGateValue,
): RowAffordances {
  const action = actionFromAnnounced(
    announce[projectPath] as AnnouncedAction | undefined,
  );
  if (action === null) return SILENT;
  if (!armAvailable(action, enabled)) return SILENT;
  return {
    announcement: announcementFor(action),
    // ⚠️ Deliberately derived from the SAME decision as the label above, not from a second
    // independent check. See the module header.
    showNoFireDoor: true,
    action,
  };
}

/**
 * Which door was used, and therefore whether to fire.
 *
 * A two-member vocabulary rather than a bare boolean, so the call site reads as an intent
 * ("the user took the no-fire door") instead of a polarity that has to be remembered
 * (`fire: false` vs `noFire: true` are the same fact spelled two ways, and one of them is
 * always the one you get wrong).
 *
 * ⚠️ **MOVED to `state/predictAction.ts` at P4.6 and re-exported here.** It now has to travel
 * past this module — through the workspace record to `cc_spawn`, which gates the argv arm on it —
 * because the door **cannot** be recovered from an `AutoResumeAction` (`null` means both "no-fire
 * door" and "row door, no signal", which need opposite argv treatment). Keeping the declaration
 * in a picker module would have pulled a component path into the state layer.
 */
export type { OpenIntent };

/**
 * The action to actually fire, given the door taken and the CURRENT signals.
 *
 * ⚠️ **`action` must be RE-DERIVED at click time, never read from the rendered label.**
 * WP1's Verdict (b) is explicit: *the announcement is a prediction, never the input to the
 * action.* `.session.md` can vanish while the picker is open (`/session-restore` deletes it
 * at its own step 7 — observed live during WP1's own probe phase), so a label can be stale.
 *
 * Because the decision that *acts* is computed fresh, the staleness window is
 * **display-only and self-correcting**: the worst case is a label that promised an action
 * and nothing firing — **never a wrong action**. Reading the label instead would convert a
 * harmless stale label into a genuinely wrong fire.
 *
 * This function is the enforcement point for that rule: it takes the freshly-derived action
 * and the door, and the `"no-fire"` door discards the action regardless of what it was.
 */
export function actionForIntent(
  action: AutoResumeAction,
  intent: OpenIntent,
): AutoResumeAction {
  return intent === "fire" ? action : null;
}
