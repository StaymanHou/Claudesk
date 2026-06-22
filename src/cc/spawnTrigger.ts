// incident-terminal-blank-cursor (2026-06-22) — the spawn-effect dependency contract,
// extracted to a pure, testable seam.
//
// WHY THIS EXISTS: XtermPane's spawn effect must re-run (and re-attach its `cc-output`
// listener) ONLY on a genuine re-spawn signal — never on the internal `spawning→live`
// phase flip. When `bridge.phase` was a dependency, `dispatch({ spawned })` re-ran the
// effect, and its cleanup tore down the `cc-output` listener before the fire-and-forget
// `cc_ready` flush of the shell's one-shot prompt arrived → permanently blank terminal
// pane. (CC survived only because it emits continuously; the shell emits its prompt once.)
//
// This module is the single source of truth for that contract: XtermPane builds its
// effect dependency array from `spawnTriggerDeps(...)`, and the unit test asserts the
// invariant directly — most importantly that `bridge.phase` (or any phase value) is NOT
// a trigger. Re-introducing the bug (adding the phase to the deps) fails the test.

/** The inputs that, when changed, legitimately warrant a fresh spawn + listener attach. */
export interface SpawnTriggerInputs {
  /** Bumped by Re-launch/Retry — the ONLY in-component re-spawn signal. */
  spawnNonce: number;
  /** The deferred-spawn gate (WP9 terminal panel spawns on first activation). */
  active: boolean;
  /** A different project dir = a different session. */
  projectPath: string;
  /** `cc_spawn` vs `term_spawn` = a different session kind. */
  spawnCommand: string;
}

/**
 * The ordered dependency list for XtermPane's spawn effect. Deliberately excludes the
 * bridge phase: the spawn effect must NOT re-run when the phase transitions
 * `spawning→live` (that teardown is the incident-terminal-blank-cursor bug). Keep this
 * the sole place the trigger set is defined so the effect and its regression test agree.
 */
export function spawnTriggerDeps(
  inputs: SpawnTriggerInputs,
): [number, boolean, string, string] {
  return [
    inputs.spawnNonce,
    inputs.active,
    inputs.projectPath,
    inputs.spawnCommand,
  ];
}

/**
 * Predicate form of the same contract, for assertion clarity: is `signal` a value the
 * spawn effect is allowed to depend on? `"bridge.phase"` (and any session-lifecycle
 * phase) must return false — that is the invariant the incident violated.
 */
export function isSpawnTrigger(signal: string): boolean {
  const TRIGGERS = new Set([
    "spawnNonce",
    "active",
    "projectPath",
    "spawnCommand",
  ]);
  return TRIGGERS.has(signal);
}
