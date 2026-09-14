// M15 WP3 Phase 5 — FIRE, ACROSS EVERY OPEN WORKSPACE.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ THE FAN-OUT IS A LOOP, NOT A WRAPPER — AND THAT IS A DESIGN CLAIM, NOT A SHORTCUT.
//
// The per-workspace verdict is pure and independent by construction (`decideSupervised` takes
// data in and returns a decision out), so supervising N workspaces is N independent decisions
// — not a coordination problem. The WBS's §5 note records why this was NOT split into its own
// work package: the multi-workspace case IS the feature (attention across parallel projects is
// the scarce resource), and a single-workspace supervisor would meet no exit criterion.
//
// ⚠️ **EVERY FIRE GOES THROUGH `fireOne`. THE GUARD IS ON THAT FUNCTION.**
// The standing local defect shape — *a mechanism correct in itself behind a caller that does
// not honor it* — has bitten this repo four times, twice in M11 WP4 with one shipped CRITICAL.
// Enumerating the rules as data makes the SET testable but does NOT prove each has a caller.
// So there is exactly one place that injects, and it is the place that checks the ledger.
//
// ⚠️ **ONE WORKSPACE'S FAILURE MUST NOT ABORT THE OTHERS.** A rejected `invoke`, a wedged
// adjudicator, an unreadable transcript — each is local to its workspace. A sweep that threw
// on the first problem would silently stop supervising every workspace after it, and the
// failure mode would be *nothing happens*, which is indistinguishable from "no turn ended".

// ⚠️ **THERE IS DELIBERATELY NO SETTLE DELAY HERE, AND THAT IS NOT AN OVERSIGHT.**
// `INJECT_SETTLE_MS` (1500 ms) exists for a COLD SPAWN: a freshly-started CC TUI has not begun
// reading keystrokes, so bytes sent immediately are dropped. The supervisor fires into a pty
// that has just FINISHED a turn — it is demonstrably live and reading, which is how the
// turn-end event arrived in the first place. Adding a delay here would buy nothing and would
// widen the window in which a second sweep sees the same unfired turn.
//
// ⚠️ **Do NOT raise the shared `INJECT_SETTLE_MS` on account of this path either** — the
// settle's STARTING LINE matters more than its value (the M12/v0.3.3 defect), and the 350 ms
// cliff moved between measurements. ⚠️ And `cc_ready` is NOT a CC-readiness signal; two
// independent readers have already misread it that way.

import {
  decideSupervised,
  FireLedger,
  type SupervisedVerdict,
  type TurnKey,
} from "./verdict";
import { parseTranscript, readTurn, type TranscriptTail } from "./transcript";
import { readContextTokens } from "./contextPressure";
import type { ParsedWip } from "./wipPhases";
import type { AdjudicatorDeps } from "./adjudicator";
import type { DriveMode, PolicyContext } from "../workflowMachine/policy";

/** One workspace the supervisor may act on. */
export interface SupervisedWorkspace {
  readonly workspaceId: string;
  /** The CC session id from the turn-end event, when the hook supplied one. */
  readonly sessionId: string | null;
  readonly projectPath: string;
  /** The project's STORED drive mode. `null` means not supervised (opt-in). */
  readonly storedMode: DriveMode | null;
  /** The PTY session id `injectCommand` addresses. */
  readonly ptySessionId: string;
}

/**
 * ⚠️ The `label` every supervisor injection MUST pass to `injectCommand`.
 *
 * ⚠️ **THIS EXISTS BECAUSE THE DEFAULT IS WRONG FOR US, AND SILENTLY SO.** `injectCommand`'s
 * fourth argument defaults to `"auto-resume"`, and `console.warn` is the ONLY failure channel
 * that path has (no toast, no overlay — an operator decision). So a wiring site that calls
 * `injectCommand(pty, cmd)` without a label makes every supervisor failure read as
 * *"auto-resume: injecting /feature-verify-auto into … failed"* — pointing the one available
 * diagnostic at M12's automatic-resume arm instead of at the supervisor.
 *
 * ⚠️ That is not hypothetical: the funnel's own doc comment records M13's skill-button row
 * inheriting exactly this default and misattributing its failures, which is why the `label`
 * parameter was added at all. Found by review at Phase 5 verify-self before any caller existed.
 *
 * ⚠️ `fanOut`'s own `supervisor: …` warnings do NOT cover this — a rejection swallowed inside
 * `injectCommand` never reaches them.
 */
export const SUPERVISOR_INJECT_LABEL = "supervisor";

/** Everything the sweep needs from the outside world. All injected — this module is pure. */
export interface FanOutDeps {
  /** Read a workspace's transcript tail (the Rust `transcript_tail` command). */
  readonly readTail: (w: SupervisedWorkspace) => Promise<TranscriptTail>;
  /**
   * Inject a slash command into a PTY.
   *
   * ⚠️ **`label` IS A REQUIRED PARAMETER, AND THAT IS THE WHOLE GUARD.** `fireOne` passes
   * {@link SUPERVISOR_INJECT_LABEL} itself, so a wiring site that forwards its arguments to
   * `injectCommand` cannot reach the `"auto-resume"` default — the misattribution described
   * on that constant is now a type error rather than a doc comment.
   *
   * ⚠️ Forward the label THROUGH to `injectCommand`; do not accept it and drop it. That is the
   * one way left to reintroduce the defect, and it is visible at the wiring site.
   */
  readonly inject: (
    ptySessionId: string,
    command: string,
    label: string,
  ) => Promise<void>;
  /**
   * M15 WP4 — read a workspace's active WIP file (the Rust `wip_read` command), parsed.
   *
   * ⚠️ **OPTIONAL, AND ITS ABSENCE DISABLES THE RECYCLE BRANCH ENTIRELY.** A caller that does not
   * supply it keeps WP3's chain-only behavior unchanged, which is what lets every existing test
   * and the replay harness stay untouched. The recycle is the destructive branch; it is opt-in
   * by construction rather than by a flag someone can forget to set.
   *
   * ⚠️ Must not throw — a failure here returns `null` (no recycle), never rejects the sweep.
   */
  readonly readWip?: (w: SupervisedWorkspace) => Promise<ParsedWip | null>;
  /** The adjudicator's runner. */
  readonly adjudicator: AdjudicatorDeps;
  /** Shared across the sweep so a re-entrant sweep cannot double-fire. */
  readonly ledger: FireLedger;
  /** Evidence for the one conditional policy cell. */
  readonly context?: PolicyContext;
  /** Diagnostic sink. Defaults to `console.warn`. */
  readonly warn?: (message: string) => void;
}

/** What happened for one workspace in a sweep. */
export interface FanOutOutcome {
  readonly workspaceId: string;
  readonly fired: boolean;
  /** The command injected, when one was. */
  readonly command?: string;
  /** Why not, when it did not fire. */
  readonly reason?: string;
  /**
   * M15 WP4 — set when the verdict was `recycle` rather than `fire`.
   *
   * ⚠️ **`fired` IS FALSE FOR A RECYCLE, AND THAT IS DELIBERATE.** `fired` means "a slash command
   * was injected into the PTY", which a recycle does not do — it hands off to
   * `recycleSession()`, a multi-step operation the caller owns. A recycle reported as
   * `fired: true` would make the two indistinguishable in a diagnostic, and the whole point of
   * the branch is that they are different actions.
   *
   * ⚠️ **`fanOut` does NOT perform the recycle.** `recycleSession()` needs caller-owned React
   * state (`relaunch`, `awaitFreshSessionId`) that this pure module has no access to — so the
   * sweep REPORTS the decision and the component acts on it (wired in Phase 4). Do not "finish"
   * this by importing `recycleSession` here; it cannot work.
   */
  readonly recycle?: {
    readonly edgeId: string;
    /** The skill that was deferred — what the fresh session will resume into. */
    readonly skill: string;
    readonly tokens: number;
  };
}

/**
 * Extract the last ~1200 characters of the turn's final assistant text — the adjudicator's
 * input.
 *
 * ⚠️ Bounded because the prompt travels over a subprocess stdin and a turn can be enormous;
 * the discriminating signal (a question, an instruction to reply) is at the END of the turn,
 * which is why this takes a suffix rather than a prefix.
 */
const TAIL_CHARS = 1200;

/**
 * Supervise ONE workspace. Every fire in Claudesk goes through here.
 *
 * ⚠️ **THE LEDGER IS CLAIMED BEFORE THE INJECT, NOT AFTER.** `claim()` returns false if the
 * turn was already fired, and that return value IS the claim — a check-then-act would let two
 * overlapping sweeps both pass the check and both inject. Injecting twice would run the next
 * skill twice, and `injectCommand` has no retry or undo.
 */
export async function fireOne(
  workspace: SupervisedWorkspace,
  deps: FanOutDeps,
): Promise<FanOutOutcome> {
  const warn = deps.warn ?? ((m: string) => console.warn(m));
  const no = (reason: string): FanOutOutcome => ({
    workspaceId: workspace.workspaceId,
    fired: false,
    reason,
  });

  let tail: TranscriptTail;
  try {
    tail = await deps.readTail(workspace);
  } catch (e) {
    // ⚠️ Withhold, per the binding failure direction. "No evidence" must never mean "fire".
    warn(
      `supervisor: could not read ${workspace.workspaceId}'s transcript — ${String(e)}`,
    );
    return no("transcript-unreadable");
  }
  if (tail.path === null || tail.lines.length === 0) return no("no-transcript");

  const lines = parseTranscript(tail.lines);
  const reading = readTurn(lines);
  if (reading.edgeId === null || reading.verdictIndex === null)
    return no("no-verdict");

  // ⚠️ Claimed BEFORE adjudication as well as before injection: the adjudicator costs ~3s, and
  // a second sweep arriving during that window must not start its own adjudication of the same
  // turn.
  const key: TurnKey = {
    workspaceId: workspace.workspaceId,
    transcriptPath: tail.path,
    edgeId: reading.edgeId,
    verdictIndex: reading.verdictIndex,
  };
  if (!deps.ledger.claim(key)) return no("already-fired-for-this-turn");

  // ⚠️ `reading` is passed in, NOT re-read. The ledger key above and this decision must
  // describe the SAME turn; two independent `readTurn` calls agreed only by determinism, and
  // nothing asserted it. See {@link VerdictInput.reading}.
  // ⚠️ M15 WP4 — the recycle evidence. Read AFTER the ledger claim so a non-firing turn pays
  // neither the WIP read nor the adjudication, and gathered here (not inside the verdict) because
  // the verdict module is pure: only the caller can touch the filesystem.
  //
  // ⚠️ **A FAILED WIP READ IS `null`, NOT A THROW.** It degrades to "chain as usual" — the
  // withholding direction. An unreadable WIP must never be the reason a session gets recycled.
  let wip: ParsedWip | null = null;
  if (deps.readWip) {
    try {
      wip = await deps.readWip(workspace);
    } catch (e) {
      warn(
        `supervisor: could not read ${workspace.workspaceId}'s WIP file — ${String(e)}`,
      );
    }
  }

  const verdict: SupervisedVerdict = await decideSupervised(
    {
      lines,
      reading,
      storedMode: workspace.storedMode,
      context: deps.context,
      tail: tailTextOf(lines, reading.verdictIndex),
      // ⚠️ Read off the SAME `lines` the verdict and ledger key describe — not a second read.
      contextTokens: readContextTokens(lines),
      wip,
    },
    deps.adjudicator,
  );
  // ⚠️ The recycle arm is handled BEFORE the withhold check, because `verdict.kind !== "fire"`
  // is true for BOTH — and a recycle reaching `no(verdict.reason)` would read `undefined` and
  // report the workspace as an unexplained non-fire. The compiler caught exactly this when the
  // arm was added, which is the argument for the closed union over a boolean on `fire`.
  if (verdict.kind === "recycle") {
    return {
      workspaceId: workspace.workspaceId,
      fired: false,
      reason: "context-pressure-recycle",
      recycle: {
        edgeId: verdict.edgeId,
        skill: verdict.skill,
        tokens: verdict.tokens,
      },
    };
  }
  if (verdict.kind !== "fire") return no(verdict.reason);

  const command = `/${verdict.skill}`;
  try {
    await deps.inject(workspace.ptySessionId, command, SUPERVISOR_INJECT_LABEL);
  } catch (e) {
    // ⚠️ `injectCommand` already swallows and warns; this catch exists so a DIFFERENT injector
    // (or a future change to that contract) cannot abort the sweep for other workspaces.
    warn(
      `supervisor: injecting ${command} into ${workspace.workspaceId} failed — ${String(e)}`,
    );
    return no("inject-failed");
  }
  return { workspaceId: workspace.workspaceId, fired: true, command };
}

/** The adjudicator's input: the tail of the verdict-bearing assistant message. */
function tailTextOf(
  lines: ReturnType<typeof parseTranscript>,
  verdictIndex: number,
): string {
  const line = lines[verdictIndex];
  const content = line?.message?.content;
  if (!Array.isArray(content)) return "";
  const text = content
    .filter(
      (b): b is { type: string; text: string } =>
        !!b &&
        typeof b === "object" &&
        (b as { type?: string }).type === "text",
    )
    .map((b) => b.text)
    .join("\n");
  return text.slice(-TAIL_CHARS);
}

/**
 * Supervise EVERY open workspace.
 *
 * ⚠️ **Runs the workspaces CONCURRENTLY and isolates each failure.** `Promise.allSettled`, not
 * `Promise.all`: one rejection must not cancel the others, and a ~3s adjudication per firing
 * workspace would otherwise serialize into N×3s of latency across the fan-out.
 *
 * ⚠️ A workspace with no stored drive mode is still passed through rather than filtered here —
 * `decideVerdict` owns that refusal, so there is ONE place that decides "is this supervised?"
 * and it is the same place a test can drive.
 */
export async function fanOut(
  workspaces: readonly SupervisedWorkspace[],
  deps: FanOutDeps,
): Promise<FanOutOutcome[]> {
  const warn = deps.warn ?? ((m: string) => console.warn(m));
  const settled = await Promise.allSettled(
    workspaces.map((w) => fireOne(w, deps)),
  );
  return settled.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    // ⚠️ A throw inside `fireOne` is a bug, not an expected path — but it must still not take
    // the sweep down, and it must be visible rather than swallowed into a silent non-fire.
    const id = workspaces[i].workspaceId;
    warn(`supervisor: sweep threw for ${id} — ${String(r.reason)}`);
    return { workspaceId: id, fired: false, reason: "sweep-threw" };
  });
}
