// M12 WP3 Phase 4 — the auto-resume FIRE: injecting `/session-restore` into a
// freshly-spawned CC session.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ THIS IS THE APP'S FIRST FEATURE-INITIATED PTY WRITE. Read before changing it.
//
// Every prior byte written to a CC pty came from a real keystroke (`XtermPane`'s xterm
// `onData`) or from the shutdown path. This module composes input on the app's own
// initiative, which `arch.md` permits only because *Claudesk IS the terminal* — but that
// licence is about relaying the user, so a feature that types for them carries the burden of
// being unsurprising. The announcement in the picker is what makes it so: the command is
// stated before the click, and a second door opens without firing.
//
// ⚠️ ONLY THE INJECT ARM COMES THROUGH HERE. The `--continue` arm is spawn ARGV, resolved in
// Rust (`Registry::spawn` → `build_cc_argv`) and never typed — it needs no delay and no
// injection, which is why Phase 1's verdict called it the *safe* arm. If you are adding a
// second injected command, this is the module; if you are adding a second FLAG, it is not.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ WHY THE DELAY, AND WHY IT IS NOT TUNABLE DOWNWARD WITHOUT RE-MEASURING
//
// Phase 1 measured, across ≥5 cold spawns per row (`tooling/autofire-timing/probe.sh`):
//
//   |    delay | result                                      |
//   |---------:|---------------------------------------------|
//   |     0 ms | NOT-EXECUTED 5/5  (this is `cc_ready` time)  |
//   | 250/300  | NOT-EXECUTED 5/5                            |
//   |   350 ms | 1/5, then 0/5 — UNRELIABLE                  |
//   |  400–500 | EXECUTED 5/5                                |
//   |  1500 ms | EXECUTED 10/10 twice; 5/5 under 4-core load |
//
// At 0 ms the bytes land in CC's input box with the slash-command autocomplete open and the
// `\r` does NOT act as Enter — CC's TUI has not started listening for keystrokes. The 350 ms
// row is the reason for the margin: it is the "works warm, fails cold" mode sitting 50 ms
// below a delay that reads as perfectly reliable.
//
// ⚠️ `cc_ready` is NOT a CC-readiness signal — it is Claudesk's own frontend-listener
// handshake, fired right after the spawn `invoke` resolves. Two independent readers of this
// codebase took it the wrong way (`SURFACE-2026-08-04-CC-READY-NAME-INVITES-MISREADING-AS-CC-
// READINESS`). Firing on it was measured NOT-EXECUTED 5/5.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ THE DELAY DOES NOT MAKE CC READY ON A NEVER-TRUSTED FOLDER (paydown-2026-11-08 WP5)
//
// There, CC opens on "Quick safety check … trust this folder?", whose default is "No, exit",
// and the injected `\r` answers it: CC quits and the session is lost. So the fire
// (`fireAutoResume`) reads CC's own trust record first and withholds unless the folder is
// trusted (ruling R1; any doubt withholds, D4). The record's location and the ANCESTOR-WALK
// rule CC applies were probed live and are documented in `src-tauri/src/folder_trust/mod.rs`.
// The `--continue` arm is spawn argv and is not gated here.

import { invoke } from "@tauri-apps/api/core";
import { encodeBase64 } from "../../cc/bridge";
import {
  INJECT_SETTLE_MS,
  requiresInjection,
  type AutoResumeAction,
} from "../../state/predictAction";

/** Everything the fire needs, so the decision is testable without a live PTY. */
export interface FireInputs {
  /** The action this workspace open resolved to (`null` = fire nothing). */
  action: AutoResumeAction;
  /** Whether this pane's spawn was torn down before the delay elapsed. */
  cancelled: boolean;
  /**
   * Whether CC's folder-trust dialog has already been accepted for this project, read at fire
   * time ({@link readFolderTrust}). `false` whenever that is in doubt (paydown-2026-11-08 WP5,
   * default D4).
   */
  trusted: boolean;
}

/**
 * Whether the delayed injection should actually write bytes when its timer fires.
 *
 * Pure and re-checked **at fire time, not at schedule time** — that distinction is the whole
 * reason this is a function rather than an `if` around `setTimeout`. 1500 ms is long enough
 * for the user to close the workspace, switch away, or trigger a relaunch, and a write into a
 * torn-down or replaced session is either an error or — worse — a slash command typed into
 * *someone else's* live conversation.
 *
 * ⚠️ The `cancelled` term must be read from the SAME per-run closure flag `XtermPane` uses to
 * self-kill orphaned spawns. A ref would be wrong here for the reason that file documents at
 * length: under StrictMode a later run resets a shared ref before an earlier spawn resolves.
 */
export function shouldInject(inputs: FireInputs): boolean {
  if (inputs.cancelled) return false;
  // ⚠️ paydown-2026-11-08 WP5 — THE TRUST TERM. On a folder CC has never trusted, CC opens on
  // "Quick safety check … trust this folder?", whose DEFAULT is "No, exit": the `\r` that ends
  // an injected command picks it and CC quits, losing the session
  // (`SURFACE-2026-11-03-AUTO-RESUME-FIRES-INTO-THE-FOLDER-TRUST-PROMPT`). Ruling R1: do not
  // fire; the picker still names the command and the operator types it after trusting.
  if (!inputs.trusted) return false;
  return requiresInjection(inputs.action);
}

/**
 * Whether CC's folder-trust dialog has been accepted for `projectPath`, under the live profile
 * of `ptySessionId` (the Rust `folder_trusted` command; the file location and the ancestor-walk
 * rule are documented in `src-tauri/src/folder_trust/mod.rs`).
 *
 * ⚠️ **Every failure resolves `false`, never rejects** (default D4: a withheld fire costs one
 * typed command, a wrong fire costs the session). A rejection with no handler would vanish
 * silently, so it is caught here and warned.
 */
export async function readFolderTrust(
  projectPath: string,
  ptySessionId: string,
): Promise<boolean> {
  try {
    return (
      (await invoke<boolean>("folder_trusted", {
        projectPath,
        ptySessionId,
      })) === true
    );
  } catch (e) {
    console.warn(
      `auto-resume: reading folder trust for ${projectPath} failed`,
      e,
    );
    return false;
  }
}

/** What one fire needs. The two IO seams default to the real ones and are injected by tests. */
export interface FireRun {
  action: AutoResumeAction;
  /** The Claudesk PTY session to type into. */
  sessionId: string;
  projectPath: string;
  /**
   * ⚠️ A FUNCTION, not a boolean: the trust read is awaited, and the pane can be torn down
   * while it is in flight. `cancelled` must be read AFTER the await, from the caller's live
   * per-run closure flag.
   */
  isCancelled: () => boolean;
  readTrust?: (projectPath: string, ptySessionId: string) => Promise<boolean>;
  inject?: (sessionId: string, command: string) => Promise<void>;
}

/**
 * The fire itself, run when the {@link FIRE_DELAY_MS} timer wakes: read trust, decide through
 * {@link shouldInject}, inject. Returns whether it typed anything.
 *
 * ⚠️ **This is the ONLY fire path, and the order is the fix.** The trust read happens at FIRE
 * time, so a trust the operator accepts inside the delay still fires. `shouldInject` is asked
 * AFTER the read with a fresh `isCancelled()`, so a pane closed during the read types nothing.
 * Extracted from `XtermPane`'s timer so a test drives the real sequence rather than a replica.
 */
export async function fireAutoResume(run: FireRun): Promise<boolean> {
  const trusted = await (run.readTrust ?? readFolderTrust)(
    run.projectPath,
    run.sessionId,
  );
  const cancelled = run.isCancelled();
  if (!shouldInject({ action: run.action, cancelled, trusted })) {
    if (!cancelled && !trusted && requiresInjection(run.action)) {
      // The one diagnostic this path has (no overlay, by operator decision): name the
      // withheld command so a "nothing happened" report is answerable.
      console.warn(
        `auto-resume: ${injectionCommand(run.action) ?? "command"} withheld for ${run.projectPath} — Claude Code has not trusted this folder yet`,
      );
    }
    return false;
  }
  const command = injectionCommand(run.action);
  if (command === null) return false;
  await (run.inject ?? injectCommand)(run.sessionId, command);
  return true;
}

/**
 * The command text to inject, or `null` if this action is not an injection.
 *
 * Reads the command off the action's `kind` rather than mapping a label — the kind is
 * authoritative (`predictAction.ts`), and a caller that string-matched the announcement would
 * be reading a *prediction* as an instruction, which WP1's Verdict (b) forbids.
 */
export function injectionCommand(action: AutoResumeAction): string | null {
  return action?.kind === "inject" ? action.command : null;
}

/** Whether the spawn effect should SCHEDULE a fire timer at all. */
export interface ScheduleInputs {
  /** The action this workspace open resolved to (`null` = nothing to fire). */
  action: AutoResumeAction;
  /** Whether this pane has ALREADY scheduled a fire (the consume-once latch). */
  hasFired: boolean;
}

/**
 * Whether to schedule the delayed injection — the **consume-once** gate.
 *
 * ⚠️ This is a DIFFERENT question from `shouldInject`, and the split is the whole point:
 *   • `shouldScheduleFire` — asked ONCE per spawn-effect run, *before* the timer is created:
 *     "is there an injection to do, and has this pane already done it?"
 *   • `shouldInject` — asked when the timer FIRES, 1500 ms later: "is this run still alive?"
 *
 * Collapsing them re-opens the defect. `shouldInject`'s `cancelled` term is a per-run closure
 * flag that is `false` on a relaunch run, so it cannot express "this pane already fired" — a
 * relaunch legitimately re-spawns (`handleRelaunch` clears the spawn latch) and the re-run then
 * read a still-set `pendingAction` and typed `/session-restore` a second time, against a
 * `.session.md` the first fire had already deleted.
 *
 * Pure so the property is testable without a live PTY or a React render harness. The caller
 * (`XtermPane`'s spawn effect) must pass `hasFiredRef.current` and set that ref when it
 * schedules — a caller-side obligation, because the sixth instance of M12's
 * "proven-module-unhonoring-caller" class is exactly what this function's own correctness
 * cannot prevent.
 */
export function shouldScheduleFire(inputs: ScheduleInputs): boolean {
  if (inputs.hasFired) return false;
  return injectionCommand(inputs.action) !== null;
}

/** How long to wait before injecting. Re-exported so a call site needs one import. */
export const FIRE_DELAY_MS = INJECT_SETTLE_MS;

/**
 * The exact byte payload for a slash command — **mirrors Rust's `slash_command_bytes`.**
 *
 * ⚠️ Trailing CR/LF is stripped and exactly one `\r` appended. `\r` (0x0d), never `\n`: CC's
 * TUI runs in raw mode where `\n` only triggers autocomplete typeahead and does not submit
 * (`[[raw-mode-cr-is-enter]]`, `[[cc-tui-cr-not-lf]]`). Pinned byte-for-byte against the Rust
 * helper by `autoResumeFire.test.ts` so the two cannot drift.
 */
export function slashCommandPayload(command: string): string {
  const trimmed = command.replace(/[\r\n]+$/, "");
  // UTF-8 bytes → base64 via `cc/bridge`, the single frontend chokepoint for `cc_input`'s
  // encoding (a bare `btoa` truncates multi-byte input — the M10.5 WP4 mojibake).
  return encodeBase64(`${trimmed}\r`);
}

/**
 * Inject `command` into `sessionId`'s PTY.
 *
 * ⚠️ **The `invoke` MUST have a `.catch`** — a Tauri rejection with no handler vanishes
 * silently (the WP6 picker MAJOR). Failure surfacing is settled (operator decision):
 * `console.warn` **always**, so a miss is diagnosable; a toast **only** if the IPC itself
 * rejects, which the caller owns because only it has the toast setter.
 *
 * ⚠️ **NO RETRY, deliberately.** Detecting "the command did not land" would require reading
 * CC's output, which `arch.md` forbids outright, and a double-fire risks running the command
 * twice. The terminal IS the evidence: the user is sitting at a live prompt and can type
 * anything. Mitigation for a wrong fire is **Esc** (CC's own interrupt) — note that is
 * *interrupt a running command*, not *cancel before send*; there is no pre-send cancel window
 * and the docs must not imply one.
 *
 * ⚠️ `label` names the CALLER for the diagnostic, and it exists because it had to. M13 WP2
 * reused this funnel for the skill-button row, which inherited a hardcoded `auto-resume:`
 * prefix — so every *button* failure was attributed to M12's *automatic* arm. Since
 * `console.warn` is the only failure channel this path has (no overlay, by operator decision),
 * a misattributed prefix points the one available diagnostic at the wrong feature. Defaults to
 * the original strings, so M12's callers are byte-identical to before.
 *
 * ⚠️ `buildPayload` EXISTS SO F-a's STAGED PROSE CAN USE THIS FUNNEL RATHER THAN A SECOND PATH
 * TO `cc_input` (F-a WP4, decision 2). Staged text needs a bracketed-paste envelope and an
 * OPTIONAL trailing `\r` — bytes `slashCommandPayload` cannot produce, since it unconditionally
 * strips trailing newlines and appends exactly one `\r`. The three alternatives were each worse:
 * calling `invoke("cc_input", …)` from the panel is the second path the decision forbids;
 * pre-encoding into `command` would double-encode here AND print a base64 blob in the one
 * diagnostic this path has; widening `slashCommandPayload` itself would change M12/M13/M15 bytes.
 *
 * ⚠️ **THE DEFAULT IS WHAT KEEPS EVERY EXISTING CALLER BYTE-IDENTICAL.** Omitting this argument
 * reproduces the pre-WP4 behaviour exactly, which is why no M12/M13/M15 call site was touched.
 * A caller that DOES pass a builder owns its own byte contract — this funnel no longer asserts
 * one — so that builder must be pinned byte-for-byte by its own test, the way `stagedPayload`
 * is. ⚠️ `command` stays the human-readable text either way: it is what `console.warn` prints,
 * and it must remain readable for the diagnostic to be worth anything.
 */
export async function injectCommand(
  sessionId: string,
  command: string,
  onIpcError?: (message: string) => void,
  label = "auto-resume",
  buildPayload: (command: string) => string = slashCommandPayload,
): Promise<void> {
  try {
    await invoke("cc_input", {
      sessionId,
      data: buildPayload(command),
    });
  } catch (e) {
    console.warn(`${label}: injecting ${command} into ${sessionId} failed`, e);
    onIpcError?.(
      `${label === "auto-resume" ? "Auto-resume" : label} could not run ${command}`,
    );
  }
}
