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

import { invoke } from "@tauri-apps/api/core";
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
  return requiresInjection(inputs.action);
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

/** How long to wait before injecting. Re-exported so a call site needs one import. */
export const FIRE_DELAY_MS = INJECT_SETTLE_MS;

/**
 * Base64-encode `text` as UTF-8 bytes for `cc_input`.
 *
 * ⚠️ **`btoa` alone is WRONG here** and shipped a real bug once: M10.5 WP4 found input
 * mojibake because the old path truncated each char to `& 0xff`. `TextEncoder` produces real
 * UTF-8 bytes, which is what the PTY needs. Kept in this module (rather than imported) only
 * because the encode is two lines; if a third caller appears, hoist it.
 */
function encodeUtf8Base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

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
  return encodeUtf8Base64(`${trimmed}\r`);
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
 * *interrupt a running command*, not *cancel before send*; there is no pre-send window and
 * the docs must not imply one.
 */
export async function injectCommand(
  sessionId: string,
  command: string,
  onIpcError?: (message: string) => void,
): Promise<void> {
  try {
    await invoke("cc_input", {
      sessionId,
      data: slashCommandPayload(command),
    });
  } catch (e) {
    console.warn(
      `auto-resume: injecting ${command} into ${sessionId} failed`,
      e,
    );
    onIpcError?.(`Auto-resume could not run ${command}`);
  }
}
