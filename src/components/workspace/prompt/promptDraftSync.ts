// F-a WP3 Phase 3 — the draft-persistence state machine, as pure values.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ ONE FUNNEL, AND THE GUARD GOES ON THE FUNNEL (P3.3).
//
// There are FOUR moments that write a draft to storage — a debounce timer firing, a project
// switch flushing the OUTGOING project, the operator tabbing AWAY from the panel, and an
// unmount flushing whatever is pending. The obvious implementation gives each its own
// `saveDraft` call, and that is the
// shape that has already burned this project twice in M11 WP4 (one of them a shipped
// CRITICAL): extracting a pure state machine proves the MACHINE, not its CALLERS, so three
// call sites mean two of them can drift unguarded while the tests stay green.
//
// So every write decision is made HERE, as a `plan*` function, and the React layer's only
// job is to execute the plan it is handed. A new write moment is a new function here, NOT a
// new `saveDraft` call somewhere else.
//
// ⚠️ A `plan*` function with no caller is worse than no function at all: `planPanelChange`
// shipped exported, documented and tested but UNWIRED, so this module promised a
// flush-on-tab-away that the panel never performed — the guarantee read as kept while the
// data-loss window it names stayed open. Caught at code review. If you add a plan function,
// wire it in the same change.
//
// ⚠️ THE PROJECT PATH IS PART OF THE PENDING STATE, NOT READ AT FLUSH TIME. This is the
// project-switch correctness property in one sentence: if the pending write remembered only
// the TEXT, a flush that ran after `projectPath` had already changed would write project
// A's draft into project B's key — silently, and only for operators who switch workspaces
// mid-typing, which is the entire target audience of this feature.

/** A write that has been decided on but not yet performed. */
export interface PendingWrite {
  /**
   * The project the text belongs to.
   *
   * ⚠️ Captured when the edit happened, NOT looked up when the write executes — see the
   * module header. A flush racing a project switch must land on the ORIGINAL project.
   */
  readonly projectPath: string;
  /** The exact buffer contents to persist. */
  readonly text: string;
}

/** What the caller should do, as data rather than as an effect. */
export interface WritePlan {
  /** Perform this write now, or `null` for "nothing to write". */
  readonly write: PendingWrite | null;
  /** The pending write to hold for later, or `null` to clear any pending timer. */
  readonly pending: PendingWrite | null;
}

/** How long an edit sits before it is persisted. */
export const DRAFT_DEBOUNCE_MS = 400;

/**
 * Decide what to do when the buffer changes.
 *
 * Returns a plan that ALWAYS holds the newest text as pending — the timer that eventually
 * fires is the caller's, and it fires with `flush`. Nothing is written eagerly, which is
 * the whole point of debouncing an unbounded dictation.
 */
export function planEdit(projectPath: string, text: string): WritePlan {
  return { write: null, pending: { projectPath, text } };
}

/**
 * Decide what to do when the debounce timer fires, or when the panel unmounts.
 *
 * ⚠️ Returns the pending write VERBATIM — including its captured `projectPath`. The caller
 * must not substitute its current project here; that substitution is the bug this module
 * exists to make impossible.
 */
export function planFlush(pending: PendingWrite | null): WritePlan {
  return { write: pending, pending: null };
}

/**
 * Decide what to do when the panel switches from one project to another.
 *
 * The OUTGOING project's pending write is flushed first — at its OWN path — and nothing is
 * left pending, because the incoming project will seed from storage rather than from
 * anything held in memory.
 *
 * ⚠️ A no-op when the path has not actually changed. React effects re-run for reasons that
 * are not real changes (a re-render, a new object identity), and treating each of those as
 * a switch would flush on every keystroke, defeating the debounce entirely.
 */
export function planProjectSwitch(
  pending: PendingWrite | null,
  fromPath: string,
  toPath: string,
): WritePlan {
  if (fromPath === toPath) return { write: null, pending };
  return { write: pending, pending: null };
}

/**
 * Decide what to do when the Prompt panel's front/background state changes.
 *
 * Switching away from the Prompt tab does NOT unmount it (every panel stays mounted —
 * CLAUDE.md), so the pending timer survives and would fire normally. But an operator who
 * tabs away and then quits loses the window between the last keystroke and the timer, so
 * leaving the panel is treated as a flush point.
 *
 * ⚠️ TAKES A BOOLEAN, NOT THE INCOMING PANEL NAME. An earlier signature took the
 * `RightPanel` being switched TO and compared it against `"prompt"` — but the Prompt panel
 * has no idea which sibling the host selected; it only knows whether it is still front. The
 * old shape forced its one caller to invent a plausible-looking argument to satisfy the
 * type, which is a signature lying about what the caller knows.
 */
export function planPanelChange(
  pending: PendingWrite | null,
  stillFront: boolean,
): WritePlan {
  return stillFront ? { write: null, pending } : planFlush(pending);
}
